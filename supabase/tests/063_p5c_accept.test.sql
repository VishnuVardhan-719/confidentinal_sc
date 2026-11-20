\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- Care acceptance through the generic accept_booking and p5c_care_booking_guard.
-- Design §6.3 accept_check/after_accept, T07-T10; contract §7.2, §8.2, §10.1 admission, §11.

create function pg_temp.accept_msg(p_booking uuid,p_resource uuid,p_actor uuid default 'c1000000-0000-4000-8000-000000000001') returns text language plpgsql as $$
declare m text; c text; begin
 perform pg_temp.as_user(p_actor);
 begin perform public.accept_booking(p_booking,pg_temp.c_v(p_booking),array[p_resource]);
 exception when others then get stacked diagnostics m=message_text,c=returned_sqlstate; return c||':'||m; end;
 return 'ok';
end $$;
select pg_temp.p5_service('caretaker') as care_a \gset

-- Success by a scheduler-only member: confirmed, plan assigned to the active caretaker assignment.
select pg_temp.c_request(:'care_a',pg_temp.p5_at(2)) as ok1 \gset
select pg_temp.assert_true(pg_temp.accept_msg(:'ok1','c6000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002')='ok','scheduler-only member accepts');
select pg_temp.assert_true((select b.state='confirmed' and b.version=4 from public.bookings b where b.id=:'ok1'),'booking confirmed');
select pg_temp.assert_true((select p.substate='assigned' and p.version=2 and p.assignment_id=a.id from public.care_plans p join public.booking_assignments a
 on a.booking_id=p.booking_id and a.status='active' and a.purpose='caretaker' where p.booking_id=:'ok1'),'plan assigned to the caretaker assignment');
select pg_temp.assert_true((select count(*)=1 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=:'ok1' and rr.status='active'),'one active reservation');
select pg_temp.assert_true((select array_agg(reason order by aggregate_version) from public.booking_events where booking_id=:'ok1')=array['requested','accepted','confirmed'],'shared events only');

-- T07: the list changed after the request.
select pg_temp.c_request(:'care_a',pg_temp.p5_at(3)) as changed \gset
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select public.set_care_service_tasks(:'care_a',array['escort_walk'],1,gen_random_uuid());
select pg_temp.assert_true(pg_temp.accept_msg(:'changed','c6000000-0000-4000-8000-000000000001')='40001:offer_changed','changed list: offer_changed');
select pg_temp.assert_true((select state='requested' and version=2 from public.bookings where id=:'changed') and (select substate='pending' from public.care_plans where booking_id=:'changed'),'booking stays requested, plan pending');
-- A request made after the change carries the new version and is accepted.
select pg_temp.c_request(:'care_a',pg_temp.p5_at(4)) as fresh \gset
select pg_temp.assert_true((select service_tasks_version=2 and task_codes=array['escort_walk'] from public.care_plans where booking_id=:'fresh'),'new snapshot');
select pg_temp.assert_true(pg_temp.accept_msg(:'fresh','c6000000-0000-4000-8000-000000000001')='ok','fresh request accepted');

-- T08: caregiver verification at accept.
select pg_temp.c_request(:'care_a',pg_temp.p5_at(5)) as v1 \gset
select pg_temp.assert_true(pg_temp.accept_msg(:'v1','e6000000-0000-4000-8000-000000000003')='42501:forbidden','unverified staff refused');
-- W2's caretaker case suspended through the public review path.
select c.id as w2_case,c.version as w2_case_v from public.provider_verification_cases c where c.provider_id=pg_temp.p5_provider('caretaker') and c.subject_profile_id='c1000000-0000-4000-8000-000000000003' \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
select public.review_staff_credential_case(:'w2_case','suspended','Synthetic suspension',:w2_case_v);
select pg_temp.assert_true(pg_temp.accept_msg(:'v1','c6000000-0000-4000-8000-000000000002')='42501:forbidden','suspended case refused');
-- P2's evidence expired.
update public.staff_credential_documents set expires_at=now()-interval '1 second'
 where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.p5_provider('caretaker') and subject_profile_id='e1000000-0000-4000-8000-000000000004');
select pg_temp.assert_true(pg_temp.accept_msg(:'v1','e6000000-0000-4000-8000-000000000004')='42501:forbidden','expired evidence refused');
update public.staff_credential_documents set expires_at=now()+interval '1 year'
 where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.p5_provider('caretaker') and subject_profile_id='e1000000-0000-4000-8000-000000000004');
-- A case approved without a stored evidence object (owner context) never verifies.
insert into auth.users(id,email) values ('e1000000-0000-4000-8000-000000000009','p5c-noobject@example.invalid');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes)
 values('c8000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000009','staff','active',now(),array['provider:read']);
insert into public.resources(id,kind,person_profile_id) values ('e6000000-0000-4000-8000-000000000009','person','e1000000-0000-4000-8000-000000000009');
insert into public.provider_verification_cases(id,provider_id,subject_profile_id,state,verified_until,decided_by_profile_id)
 values('e7000000-0000-4000-8000-000000000009',pg_temp.p5_provider('caretaker'),'e1000000-0000-4000-8000-000000000009','approved',now()+interval '1 year','c1000000-0000-4000-8000-000000000004');
insert into public.staff_credential_documents(id,case_id,uploaded_by_profile_id,kind,object_name,content_type,status,expires_at)
 values('e7100000-0000-4000-8000-000000000009','e7000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009','background_check',
  'staff/e7000000-0000-4000-8000-000000000009/e7100000-0000-4000-8000-000000000009.pdf','application/pdf','verified',now()+interval '1 year');
select pg_temp.assert_true(not providers_private.person_is_verified(pg_temp.p5_provider('caretaker'),'e1000000-0000-4000-8000-000000000009'),'no object, not verified');
select pg_temp.assert_true(pg_temp.accept_msg(:'v1','e6000000-0000-4000-8000-000000000009')='42501:forbidden','missing evidence object refused');
select pg_temp.assert_true((select state='requested' from public.bookings where id=:'v1') and not exists(select 1 from public.booking_assignments where booking_id=:'v1'),'refusals wrote no assignment');
select pg_temp.assert_true(pg_temp.accept_msg(:'v1','e6000000-0000-4000-8000-000000000004')='ok','verified caregiver accepted');

-- T09: the patient's own profile as caregiver.
select pg_temp.c_request(:'care_a',pg_temp.p5_at(6),'e2000000-0000-4000-8000-000000000001') as self_care \gset
select pg_temp.assert_true(pg_temp.accept_msg(:'self_care','e6000000-0000-4000-8000-000000000004')='42501:self_assignment','self assignment refused');
select pg_temp.assert_true(pg_temp.accept_msg(:'self_care','c6000000-0000-4000-8000-000000000001')='ok','another caregiver accepted for the same request');

-- T10: one caregiver, two providers, overlapping periods.
select pg_temp.c_request(:'care_a',pg_temp.p5_at(7)) as first_a \gset
select pg_temp.c_request('e4100000-0000-4000-8000-000000000001',pg_temp.p5_at(7)) as second_b \gset
select pg_temp.assert_true(pg_temp.accept_msg(:'first_a','c6000000-0000-4000-8000-000000000001')='ok','first provider accepts W1');
select pg_temp.assert_true(pg_temp.accept_msg(:'second_b','c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000007') like '23P01:%','second provider overlapping: 23P01');
select pg_temp.assert_true((select state='requested' from public.bookings where id=:'second_b') and (select substate='pending' from public.care_plans where booking_id=:'second_b'),'second booking stays requested');
-- A non-overlapping day at provider B works for the same caregiver.
select pg_temp.c_request('e4100000-0000-4000-8000-000000000001',pg_temp.p5_at(8)) as later_b \gset
select pg_temp.assert_true(pg_temp.accept_msg(:'later_b','c6000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000007')='ok','provider B accepts W1 on another day');

-- Admission gate on accept: off and suspended refuse; nothing written.
select pg_temp.c_request(:'care_a',pg_temp.p5_at(9)) as gated \gset
update booking_private.feature_gates set state='off' where key='caretaker';
select pg_temp.assert_true(pg_temp.accept_msg(:'gated','c6000000-0000-4000-8000-000000000001')='55000:feature_unavailable','accept with the gate off');
update booking_private.feature_gates set state='suspended' where key='caretaker';
select pg_temp.assert_true(pg_temp.accept_msg(:'gated','c6000000-0000-4000-8000-000000000001')='55000:feature_unavailable','accept with the gate suspended');
update booking_private.feature_gates set state='on' where key='caretaker';
select pg_temp.assert_true((select state='requested' from public.bookings where id=:'gated') and (select substate='pending' from public.care_plans where booking_id=:'gated'),'gated accept wrote nothing');
-- Generic decline still serves care.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.decline_booking(:'gated',2,'provider_unavailable');
select pg_temp.assert_true((select state='declined' from public.bookings where id=:'gated') and (select substate='pending' from public.care_plans where booking_id=:'gated'),'declined; plan untouched');
-- The category guard covers every path into accepted, not only accept_booking: a direct
-- engine transition by the scheduler on the changed offer is refused the same way.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select booking_private.transition(%L,''accepted'',''accepted'')',:'changed'),'40001','direct transition meets offer_changed');
select pg_temp.p5_raw('caretaker','requested',pg_temp.p5_at(10)) as raw_req \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select substate='pending' from public.care_plans where booking_id=:'raw_req'),'owner insert also snapshots a plan');
select pg_temp.p5_step(:'raw_req','c1000000-0000-4000-8000-000000000001','accepted','accepted');
select pg_temp.assert_true((select substate='pending' from public.care_plans where booking_id=:'raw_req'),'p5_step bypasses category guards (shared-suite helper)');
\echo 1..1
\echo ok 1 - 063_p5c_accept
rollback;
