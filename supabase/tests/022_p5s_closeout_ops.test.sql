\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §5 (assignee closeout) and §6 (audited ops escalation), P5-03.
-- No category command exists yet, so assignee steps call booking_private.assignee_finish
-- as a category command would; the guard is the authority checked here.

-- Capability CHECK: the six built values plus booking:incident.
insert into auth.users(id,email) select ('d1000000-0000-4000-8000-00000000000'||n)::uuid,'p5s-ops-'||n||'@example.invalid' from generate_series(1,8) n;
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by)
 select 'd1000000-0000-4000-8000-000000000008',c,'global','b1000000-0000-4000-8000-000000000004'
 from unnest(array['provider:verify','provider:document_read','provider:suspend','coverage:verify','security:audit','membership:admin','booking:incident']) c;
select pg_temp.assert_true((select count(*)=7 from public.admin_capabilities where profile_id='d1000000-0000-4000-8000-000000000008'),'all seven capabilities insert');
select pg_temp.expect_state('insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values (''d1000000-0000-4000-8000-000000000008'',''booking:anything'',''global'',''b1000000-0000-4000-8000-000000000004'')','23514','unknown capability refused');
do $$ declare f text; begin
 foreach f in array array['public.ops_close_booking(uuid,integer,text,text,uuid)','public.ops_resolve_exception(uuid,integer,text,uuid)','public.list_booking_exceptions(integer,uuid)'] loop
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' authenticated only');
 end loop;
 perform pg_temp.assert_true(not has_table_privilege('authenticated','public.booking_exceptions','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','public.booking_exceptions','SELECT,INSERT,UPDATE,DELETE')
  and (select relrowsecurity from pg_class where oid='public.booking_exceptions'::regclass),'exceptions closed to API roles, RLS on');
end $$;

-- §5.3 closeout per category, booking in_progress assigned to W1.
-- (a) provider suspended, (b) Q06 evidence expired, (c) past end_at + 12 h: closes and opens
-- one closed_while_ineligible exception. (d) membership disabled, (e) account disabled:
-- closeout refused; ops close succeeds because nobody can close out.
do $$ declare c text; b uuid; v integer; k text; prov uuid; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 foreach c in array array['doctor','lab','ambulance','caretaker'] loop
  prov:=pg_temp.p5_provider(c);
  foreach k in array array['a','b','c'] loop
   b:=pg_temp.p5_raw(c,'in_progress',case when k='c' then now()-interval '20 hours' else now()-interval '10 minutes' end,w1);
   if k='a' then update public.providers set status='suspended' where id=prov; end if;
   if k='b' then update public.staff_credential_documents set expires_at=now()-interval '1 second'
    where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1); end if;
   perform pg_temp.as_user(w1);
   perform pg_temp.assert_true(not identity_private.is_assigned(b,booking_private.person_purpose(c)) and booking_private.closeout_assignee(b),c||' '||k||' closeout only');
   perform pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
   perform pg_temp.assert_true(not booking_private.closeout_assignee(b),c||' '||k||' other member never closes');
   perform pg_temp.expect_state(format('select booking_private.transition(%L,''completed'',''other'')',b),'55000',c||' '||k||' other member cannot complete');
   perform pg_temp.as_user(w1);
   perform booking_private.assignee_finish(b,'completed','other',gen_random_uuid());
   perform pg_temp.assert_true((select state from public.bookings where id=b)='completed',c||' '||k||' closed by assignee');
   perform pg_temp.assert_true((select count(*)=1 from public.booking_exceptions where booking_id=b and kind='closed_while_ineligible' and status='open' and opened_by_profile_id=w1),c||' '||k||' one closed_while_ineligible');
   perform pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=b and status='active'),c||' '||k||' assignments finished');
   update public.providers set status='active' where id=prov;
   update public.staff_credential_documents set expires_at=now()+interval '1 year'
    where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
  end loop;
  -- An eligible close opens no exception.
  b:=pg_temp.p5_raw(c,'in_progress',now()-interval '10 minutes',w1);
  perform pg_temp.as_user(w1);
  perform booking_private.assignee_finish(b,'interrupted','unsafe_conditions',gen_random_uuid());
  perform pg_temp.assert_true((select count(*)=0 from public.booking_exceptions where booking_id=b),c||' eligible close opens no exception');
  foreach k in array array['d','e'] loop
   b:=pg_temp.p5_raw(c,'in_progress',now()-interval '10 minutes',w1);
   if k='d' then update public.organization_members set status='disabled' where profile_id=w1; end if;
   if k='e' then update public.profiles set status='disabled' where id=w1; end if;
   perform pg_temp.as_user(w1);
   perform pg_temp.assert_true(not coalesce(booking_private.closeout_assignee(b),false),c||' '||k||' closeout refused');
   perform pg_temp.expect_state(format('select booking_private.assignee_finish(%L,''completed'',''other'',gen_random_uuid())',b),'55000',c||' '||k||' assignee cannot close');
   perform pg_temp.assert_true(not booking_private.closeout_possible(b) and booking_private.escalatable(b),c||' '||k||' escalatable');
   perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
   select version into v from public.bookings where id=b;
   perform public.ops_close_booking(b,v,'interrupted','ops_closeout',gen_random_uuid());
   perform pg_temp.assert_true((select state from public.bookings where id=b)='interrupted',c||' '||k||' ops closes');
   update public.organization_members set status='active' where profile_id=w1;
   update public.profiles set status='active' where id=w1;
  end loop;
 end loop;
end $$;

-- §6.5 ops denial matrix on an escalatable doctor booking of organisation A.
select pg_temp.p5_raw('doctor','confirmed',now()-interval '20 hours') as esc \gset
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('c1000000-0000-4000-8000-000000000007','booking:incident','org:c8000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000004'),
 ('d1000000-0000-4000-8000-000000000001','booking:incident','org:c8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000004'),
 ('d1000000-0000-4000-8000-000000000002','booking:incident','org:c8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000004'),
 ('d1000000-0000-4000-8000-000000000003','booking:incident','global','b1000000-0000-4000-8000-000000000004'),
 ('d1000000-0000-4000-8000-000000000004','booking:incident','global','b1000000-0000-4000-8000-000000000004'),
 ('b1000000-0000-4000-8000-000000000002','booking:incident','global','b1000000-0000-4000-8000-000000000004'),
 ('b1000000-0000-4000-8000-000000000001','booking:incident','global','b1000000-0000-4000-8000-000000000004');
insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invite_expires_at) values
 ('c8000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','staff','invited','{}',now()+interval '14 days'),
 ('c8000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','staff','disabled','{}',null);
-- d1..03 is a past assignee of the booking; d1..04 requested another booking.
insert into public.resources(id,kind,person_profile_id) values ('d6000000-0000-4000-8000-000000000003','person','d1000000-0000-4000-8000-000000000003');
insert into public.booking_assignments(booking_id,resource_id,purpose,assigned_profile_id,period,status,ended_at)
 values(:'esc','d6000000-0000-4000-8000-000000000003','doctor_visit','d1000000-0000-4000-8000-000000000003',tstzrange(now()-interval '20 hours',now()-interval '19 hours','[)'),'ended',now()-interval '19 hours');
-- Individually owned provider (b3..01, owner b1..02) for the owner and patient checks.
select pg_temp.p5_raw('doctor','confirmed',now()-interval '20 hours',null,null,'b4100000-0000-4000-8000-000000000001') as own_esc \gset
select pg_temp.p5_raw('doctor','confirmed',now()-interval '20 hours') as req_esc \gset
alter table public.bookings disable trigger b01_booking_guard;
update public.bookings set requester_profile_id='d1000000-0000-4000-8000-000000000004' where id=:'req_esc';
alter table public.bookings enable trigger b01_booking_guard;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000005"}',true);
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','ops without AAL2');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','no capability');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','grant for another organisation');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','invited member');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','disabled member');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','past assignee');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000004');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'req_esc'),'42501','requester');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'own_esc'),'42501','individual owner');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','patient');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'42501','scheduler');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.assert_true(public.ops_close_booking(:'own_esc',2,'interrupted','ops_closeout',gen_random_uuid())=3,'global ops closes an individual provider booking');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''completed'',''ops_closeout'',gen_random_uuid())',:'esc'),'22023','ops never completes');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,1,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'40001','stale ops version');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''other'',gen_random_uuid())',:'esc'),'22023','ops reason allowlist');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''no_show'',''no_show_confirmed'',gen_random_uuid())',:'esc'),'22023','no_show without absence exception');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''absence_disputed'',gen_random_uuid())',:'esc'),'22023','absence_disputed without absence exception');
select pg_temp.assert_true(public.ops_close_booking(:'esc',2,'interrupted','ops_closeout',gen_random_uuid())=3,'(b) end_at + 12 h is escalatable');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,3,''interrupted'',''ops_closeout'',gen_random_uuid())',:'esc'),'55000','closed booking cannot be closed again');
reset role;

-- not_escalatable, then each condition separately.
select pg_temp.p5_raw('lab','confirmed',now()+interval '1 day','c1000000-0000-4000-8000-000000000002') as early \gset
select pg_temp.p5_raw('lab','in_progress',now()-interval '10 minutes','c1000000-0000-4000-8000-000000000002') as live \gset
select pg_temp.p5_raw('caretaker','confirmed',now()+interval '1 day','c1000000-0000-4000-8000-000000000002') as care_abs \gset
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'early'),'55000','future booking without exception not escalatable');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',gen_random_uuid())',:'live'),'55000','live closeable visit not escalatable');
reset role;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.open_exception(:'early','absence_reported','absence_reported');
select pg_temp.expect_state(format('select booking_private.open_exception(%L,''absence_reported'',''absence_reported'')',:'early'),'55000','second open exception of a kind refused');
select booking_private.open_exception(:'care_abs','absence_reported','absence_reported');
update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.assert_true(public.ops_close_booking(:'early',2,'interrupted','absence_disputed',gen_random_uuid())=3,'(a) open exception is escalatable');
select pg_temp.assert_true(public.ops_close_booking(:'live',2,'interrupted','provider_did_not_attend',gen_random_uuid())=3,'(c) nobody can close out');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''no_show'',''no_show_confirmed'',gen_random_uuid())',:'care_abs'),'55000','caretaker has no no_show');
reset role;
update public.organization_members set status='active' where profile_id='c1000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select resolution from public.booking_exceptions where booking_id=:'early')='absence_disputed','absence resolved as disputed');

-- After ops close: assignments ended, reservations untouched, every open exception resolved
-- with its code by the ops actor, category substate unchanged.
select pg_temp.p5_book('doctor',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001'::uuid]) as visit \gset
select pg_temp.p5_shift(:'visit',now()+interval '10 minutes');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.open_exception(:'visit','absence_reported','absence_reported');
select booking_private.open_exception(:'visit','eligibility_lapsed','other');
select substate as substate_before from public.doctor_visits where booking_id=:'visit' \gset
select version as visit_v from public.bookings where id=:'visit' \gset
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_close_booking(:'visit',:visit_v,'no_show','no_show_confirmed',gen_random_uuid());
select pg_temp.assert_true((select count(*)>=1 from public.list_booking_exceptions(50)),'ops queue has rows');
select pg_temp.assert_true((select bool_and(pg_temp.keys(j)=pg_temp.sorted(array['booking_id','public_ref','provider_reference','category','start_at','end_at','state','version','last_reason','overdue','escalatable','exceptions']))
 from public.list_booking_exceptions(50) j),'ops queue key set exact');
select pg_temp.assert_true((select bool_and(pg_temp.keys(e)=pg_temp.sorted(array['id','kind','reason','opened_at','version']))
 from public.list_booking_exceptions(50) j,jsonb_array_elements(j->'exceptions') e),'ops queue exception key set exact');
select pg_temp.assert_true(not exists(select 1 from public.list_booking_exceptions(50) j where j::text ~ '(Synthetic exact address|9999999999|b2000000-0000-4000-8000-000000000001|amount)'),'ops queue carries no contact, patient or amount');
select pg_temp.expect_state('select * from public.list_booking_exceptions(0)','22023','queue limit lower bound');
select pg_temp.expect_state('select * from public.list_booking_exceptions(51)','22023','queue limit upper bound');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
select pg_temp.assert_true((select count(*)=0 from public.list_booking_exceptions(50)),'non-ops queue is empty');
reset role;
select pg_temp.assert_true((select state from public.bookings where id=:'visit')='no_show','doctor no_show by ops');
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=:'visit' and status='active'),'ops close ends assignments');
select pg_temp.assert_true((select count(*)=1 and bool_and(rr.status='active') from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=:'visit'),'ops close keeps reservations');
select pg_temp.assert_true((select substate from public.doctor_visits where booking_id=:'visit')=:'substate_before','substate unchanged');
select pg_temp.assert_true((select array_agg(kind||':'||resolution order by kind) from public.booking_exceptions where booking_id=:'visit')=array['absence_reported:no_show_confirmed','eligibility_lapsed:resolved'],'exceptions resolved with their codes');
select pg_temp.assert_true((select bool_and(status='resolved' and resolved_by_profile_id='c1000000-0000-4000-8000-000000000005' and version=2) from public.booking_exceptions where booking_id=:'visit'),'resolver is the ops actor');
select pg_temp.assert_true((select count(*)=2 from public.audit_events where action='booking.exception_resolved' and target_id in (select id from public.booking_exceptions where booking_id=:'visit')),'each resolution audited');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='booking.ops_closed' and target_id=:'visit' and actor_profile_id='c1000000-0000-4000-8000-000000000005'),'ops close audited');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='booking.no_show_confirmed' and target_id=:'visit'),'transition audit');

-- Exception row integrity (R P5-21): exhaustive status CHECK, guarded updates, no delete.
select id as exc from public.booking_exceptions where booking_id=:'care_abs' \gset
select pg_temp.expect_state(format('update public.booking_exceptions set status=''resolved'',resolution=''absence_disputed'',version=2 where id=%L',:'exc'),'23514','partial resolution refused');
select pg_temp.expect_state(format('update public.booking_exceptions set status=''resolved'',resolution=''resolved'',resolved_by_profile_id=''c1000000-0000-4000-8000-000000000005'',resolved_at=now(),version=2 where id=%L',:'exc'),'55000','resolution outside the kind list refused');
select pg_temp.expect_state(format('update public.booking_exceptions set status=''resolved'',resolution=''absence_disputed'',resolved_by_profile_id=''c1000000-0000-4000-8000-000000000002'',resolved_at=now(),version=2 where id=%L',:'exc'),'23514','opener cannot resolve');
select pg_temp.expect_state(format('update public.booking_exceptions set reason=''other'' where id=%L',:'exc'),'55000','open exception immutable');
select pg_temp.expect_state(format('delete from public.booking_exceptions where id=%L',:'exc'),'55000','exception delete refused');
select pg_temp.expect_state(format('update public.booking_exceptions set status=''open'',resolution=null,resolved_by_profile_id=null,resolved_at=null,version=3 where booking_id=%L and kind=''eligibility_lapsed''',:'visit'),'55000','resolved exception cannot reopen');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.expect_state(format('select public.ops_resolve_exception(%L,1,''absence_disputed'',gen_random_uuid())',:'exc'),'55000','absence resolves only through ops close');
select pg_temp.expect_state('select * from public.booking_exceptions','42501','no direct exception read');
\echo 1..1
\echo ok 1 - 022_p5s_closeout_ops
rollback;
