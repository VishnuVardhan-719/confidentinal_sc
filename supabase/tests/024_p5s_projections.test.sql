\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §8 (P5-05, P5-06, P5-12): verified assignees in every category,
-- exact get_booking key sets, one audited contact RPC, no base-table SELECT.

-- P5-05: staff evidence went through the public path; drivers hold a licence while the
-- ambulance provider itself still holds a vehicle permit.
select pg_temp.assert_true(providers_private.required_staff_kind('doctor')='registration' and providers_private.required_staff_kind('lab')='licence'
 and providers_private.required_staff_kind('ambulance')='licence' and providers_private.required_staff_kind('caretaker')='background_check','staff evidence kinds');
select pg_temp.assert_true((select array_agg(distinct d.kind) from public.staff_credential_documents d join public.provider_verification_cases c on c.id=d.case_id
 where c.provider_id=pg_temp.p5_provider('ambulance'))=array['licence'],'ambulance staff evidence is a licence');
select pg_temp.assert_true((select bool_and(d.uploaded_by_profile_id=c.subject_profile_id and d.status='verified' and c.state='approved' and c.decided_by_profile_id='c1000000-0000-4000-8000-000000000004')
 from public.staff_credential_documents d join public.provider_verification_cases c on c.id=d.case_id where c.provider_id in (select id from public.providers where organization_id='c8000000-0000-4000-8000-000000000001')),'every staff case approved through upload, submit and independent review');
select pg_temp.assert_true((select kind from public.provider_documents where provider_id=pg_temp.p5_provider('ambulance'))='vehicle_permit','provider evidence keeps vehicle_permit');
select pg_temp.assert_true(providers_private.person_is_verified(pg_temp.p5_provider('ambulance'),'c1000000-0000-4000-8000-000000000002'),'driver verified');
-- An unverified member is no eligible resource in any category (lab/care/ambulance no longer skip Q06).
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes)
 values('c8000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000009','staff','active',now(),array['provider:read']);
insert into public.resources(id,kind,person_profile_id) values ('c6000000-0000-4000-8000-000000000009','person','c1000000-0000-4000-8000-000000000009');
select pg_temp.assert_true(not booking_private.resource_eligible(pg_temp.p5_provider(c),'c6000000-0000-4000-8000-000000000009'),'unverified member not eligible for '||c)
 from unnest(array['doctor','lab','ambulance','caretaker']) c;
delete from public.resources where id='c6000000-0000-4000-8000-000000000009';
update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000009';

-- §8.5 base tables.
do $$ declare t text; begin
 foreach t in array array['bookings','booking_events','booking_assignments','resource_reservations','doctor_visits'] loop
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.'||t,'SELECT'),t||' no authenticated SELECT');
 end loop;
 perform pg_temp.assert_true(not has_function_privilege('authenticated','booking_private.patient_booking(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','booking_private.assigned(uuid,text)','EXECUTE'),'policy helpers revoked');
 perform pg_temp.assert_true(not has_function_privilege('authenticated','booking_private.contact_allowed(uuid)','EXECUTE'),'contact predicate not granted');
 perform pg_temp.assert_true(has_function_privilege('authenticated','public.get_assignment_contact(uuid)','EXECUTE') and not has_function_privilege('anon','public.get_assignment_contact(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.get_assignment_contact(uuid)','EXECUTE'),'contact RPC authenticated only');
 perform pg_temp.assert_true((select provolatile='v' and prosecdef from pg_proc where oid='public.get_assignment_contact(uuid)'::regprocedure),'contact RPC volatile definer');
end $$;

create function pg_temp.view(p_booking uuid,p_actor uuid) returns jsonb language plpgsql as $$
begin perform pg_temp.as_user(p_actor); return public.get_booking(p_booking); end $$;
create function pg_temp.contact(p_booking uuid,p_actor uuid) returns jsonb language plpgsql as $$
begin perform pg_temp.as_user(p_actor); return public.get_assignment_contact(p_booking); end $$;
create function pg_temp.hidden(p_booking uuid,p_actor uuid,p_label text) returns void language plpgsql as $$
begin
 perform pg_temp.as_user(p_actor);
 perform pg_temp.expect_state(format('select public.get_booking(%L)',p_booking),'P0002',p_label||' get_booking hidden');
 perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',p_booking),'P0002',p_label||' contact hidden');
end $$;

do $$ declare c text; b uuid; res uuid[]; extra text[]; base_keys text[]:=array['id','public_ref','provider_reference','category','pin_code','start_at','end_at','state','version'];
 money text[]:=array['service_id','amount_paise','currency','terms_version','policy_version_id']; j jsonb; audits integer; i integer:=0;
 w1 uuid:='c1000000-0000-4000-8000-000000000002'; prov uuid; begin
 foreach c in array array['doctor','lab','ambulance','caretaker'] loop
  i:=i+1; prov:=pg_temp.p5_provider(c);
  res:=case when c='ambulance' then array['c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003']::uuid[] else array['c6000000-0000-4000-8000-000000000001']::uuid[] end;
  extra:=case when c='doctor' then array['substate'] else '{}'::text[] end;
  b:=pg_temp.p5_book(c,pg_temp.p5_at(2,i),res);
  perform pg_temp.p5_shift(b,now()+interval '10 minutes');
  -- Exact key sets.
  perform pg_temp.assert_true(pg_temp.keys(pg_temp.view(b,'b1000000-0000-4000-8000-000000000001'))=pg_temp.sorted(base_keys||money||array['patient_id','address_snapshot','contact_snapshot']||extra),c||' patient keys');
  perform pg_temp.assert_true(pg_temp.keys(pg_temp.view(b,'c1000000-0000-4000-8000-000000000001'))=pg_temp.sorted(base_keys||money||extra),c||' scheduler keys');
  j:=pg_temp.view(b,w1);
  perform pg_temp.assert_true(pg_temp.keys(j)=pg_temp.sorted(base_keys||extra),c||' assignee keys');
  perform pg_temp.assert_true(not (j ?| money) and not (j ? 'patient_id'),c||' assignee sees no amount, terms, service or patient');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true((select bool_and(pg_temp.keys(x)=pg_temp.sorted(base_keys||money||extra)) from public.list_bookings(prov) x),c||' provider list inherits the scheduler set');
  -- Contact: assignee yes (audited), others not_found (not audited).
  select count(*) into audits from public.audit_events where target_id=b and action like 'booking.contact_viewed%';
  j:=pg_temp.contact(b,w1);
  perform pg_temp.assert_true(pg_temp.keys(j)=array['address','booking_id','contact','public_ref'] and pg_temp.keys(j->'address')=array['line1','locality','pin_code']
   and pg_temp.keys(j->'contact')=array['name','phone'] and j->'contact'->>'phone'='+919999999999',c||' contact shape');
  perform pg_temp.contact(b,w1);
  perform pg_temp.hidden(b,'c1000000-0000-4000-8000-000000000003',c||' unassigned member');
  perform pg_temp.hidden(b,'c1000000-0000-4000-8000-000000000008',c||' other-provider member');
  perform pg_temp.hidden(b,'c1000000-0000-4000-8000-000000000009',c||' outsider');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002',c||' scheduler has no contact (OD-4)');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
  perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002',c||' ops without exception has no contact');
  perform pg_temp.expect_state(format('select public.get_booking(%L)',b),'P0002',c||' ops is no get_booking viewer');
  perform pg_temp.assert_true((select count(*) from public.audit_events where target_id=b and action='booking.contact_viewed' and actor_profile_id=w1)=audits+2,c||' one audit row per allowed call');
  perform pg_temp.assert_true((select count(*) from public.audit_events where target_id=b and action like 'booking.contact_viewed%')=audits+2,c||' no audit row for denials');
  -- Membership revoked, Q06 expired.
  update public.organization_members set status='disabled' where profile_id=w1;
  perform pg_temp.hidden(b,w1,c||' revoked member');
  update public.organization_members set status='active' where profile_id=w1;
  update public.staff_credential_documents set expires_at=now()-interval '1 second' where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
  perform pg_temp.hidden(b,w1,c||' expired Q06');
  update public.staff_credential_documents set expires_at=now()+interval '1 year' where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
  -- Window bounds.
  perform pg_temp.p5_shift(b,now()+interval '2 hours');
  perform pg_temp.hidden(b,w1,c||' before start - 60 min');
  perform pg_temp.p5_shift(b,now()-interval '13 hours');
  perform pg_temp.hidden(b,w1,c||' after end + 12 h');
  -- Ops with an open exception reads contact, audited separately (OD-3).
  perform pg_temp.p5_shift(b,now()+interval '10 minutes');
  perform pg_temp.as_user(w1);
  perform booking_private.open_exception(b,'eligibility_lapsed','other');
  j:=pg_temp.contact(b,'c1000000-0000-4000-8000-000000000005');
  perform pg_temp.assert_true(j ? 'contact',c||' ops reads contact with an open exception');
  perform pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=b and action='booking.contact_viewed_ops' and actor_profile_id='c1000000-0000-4000-8000-000000000005'),c||' ops contact audited');
  -- In progress past the window: closeout viewer gets the assignee set, never contact.
  perform pg_temp.p5_step(b,w1,'in_progress','other');
  perform pg_temp.p5_shift(b,now()-interval '13 hours');
  perform pg_temp.assert_true(pg_temp.keys(pg_temp.view(b,w1))=pg_temp.sorted(base_keys||extra),c||' closeout assignee keys');
  perform pg_temp.as_user(w1);
  perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002',c||' closeout gives no contact');
  -- After close.
  perform booking_private.assignee_finish(b,'completed','other',gen_random_uuid());
  perform pg_temp.hidden(b,w1,c||' after close');
  perform pg_temp.assert_true(pg_temp.keys(pg_temp.view(b,'b1000000-0000-4000-8000-000000000001'))=pg_temp.sorted(base_keys||money||array['patient_id','address_snapshot','contact_snapshot']||extra),c||' patient keys after close');
  perform pg_temp.p5_shift(b,now()-interval '30 hours'-i*interval '1 hour');
 end loop;
end $$;

-- H3 / OD-3: ops reads contact while an exception is open, also after the booking is
-- terminal; once the last exception is resolved (and it is not escalatable) access ends.
select pg_temp.p5_raw('lab','in_progress',now()-interval '20 hours','c1000000-0000-4000-8000-000000000002') as cwi \gset
select pg_temp.p5_raw('ambulance','in_progress',now()-interval '10 minutes','c1000000-0000-4000-8000-000000000002') as pickup \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.assignee_finish(:'cwi','completed','other',gen_random_uuid());
select booking_private.assignee_finish(:'pickup','interrupted','unsafe_conditions',gen_random_uuid());
select booking_private.open_exception(:'pickup','interrupted_after_pickup','unsafe_conditions');
select set_config('p5.cwi',:'cwi',true),set_config('p5.pickup',:'pickup',true);
do $$ declare b uuid; e public.booking_exceptions; j jsonb; ops uuid:='c1000000-0000-4000-8000-000000000005'; begin
 foreach b in array array[current_setting('p5.cwi')::uuid,current_setting('p5.pickup')::uuid] loop
  select * into e from public.booking_exceptions where booking_id=b and status='open';
  perform pg_temp.assert_true((select state from public.bookings where id=b) in ('completed','interrupted') and not booking_private.escalatable(b),e.kind||' booking terminal, not escalatable');
  j:=pg_temp.contact(b,ops);
  perform pg_temp.assert_true(pg_temp.keys(j)=array['address','booking_id','contact','public_ref'] and pg_temp.keys(j->'address')=array['line1','locality','pin_code']
   and pg_temp.keys(j->'contact')=array['name','phone'],e.kind||' ops contact shape on a terminal booking');
  perform pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=b and action='booking.contact_viewed_ops' and actor_profile_id=ops),e.kind||' one ops contact audit');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
  perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002',e.kind||' assignee contact ended with the work');
  perform pg_temp.as_user(ops);
  perform public.ops_resolve_exception(e.id,1,'resolved',gen_random_uuid());
  perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002',e.kind||' ops contact ends once resolved');
  perform pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=b and action like 'booking.contact_viewed%'),e.kind||' denial wrote no audit');
 end loop;
end $$;

-- Patients and providers read nothing from the base tables.
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state('select count(*) from public.booking_events','42501','patient cannot read booking events');
select pg_temp.expect_state('select count(*) from public.bookings','42501','patient cannot read bookings');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state('select count(*) from public.booking_assignments','42501','assignee cannot read assignments');
select pg_temp.expect_state('select count(*) from public.resource_reservations','42501','nobody reads reservations');
select pg_temp.expect_state('select count(*) from public.doctor_visits','42501','nobody reads doctor visits');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)>0 from public.resources),'resource policy kept for schedulers');
reset role;
\echo 1..1
\echo ok 1 - 024_p5s_projections
rollback;
