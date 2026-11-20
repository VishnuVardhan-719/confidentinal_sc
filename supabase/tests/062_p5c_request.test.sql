\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- Care request through the generic create and the AFTER INSERT plan snapshot.
-- Design §4.2, T01, T02, T05 (request side), T06; contract §7.1, §10.1 admission.

select pg_temp.p5_service('caretaker') as care_a \gset
select count(*) as bookings_before from public.bookings \gset

-- T01: gate off or suspended refuses every insert path; nothing is written.
do $$ declare g text; m text; begin
 foreach g in array array['off','suspended'] loop
  update booking_private.feature_gates set state=g where key='caretaker';
  m:=null;
  begin perform pg_temp.c_request(pg_temp.p5_service('caretaker'),pg_temp.p5_at(3));
  exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m='feature_unavailable','generic create under '||g||': '||coalesce(m,'allowed'));
  -- The shared core skips the wrapper's gate; the request trigger still refuses.
  m:=null;
  begin perform pg_temp.p5_create('caretaker',pg_temp.p5_at(3));
  exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m='feature_unavailable','core create under '||g||': '||coalesce(m,'allowed'));
 end loop;
 update booking_private.feature_gates set state='on' where key='caretaker';
end $$;
select pg_temp.assert_true((select count(*) from public.bookings)=:bookings_before and (select count(*)=0 from public.care_plans),'gate refusals wrote nothing');

-- T05 (request side): the trigger refuses offers the setter would refuse.
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
do $$ declare s uuid; m text; want text; begin
 foreach s in array array['e4100000-0000-4000-8000-000000000003','e4100000-0000-4000-8000-000000000004']::uuid[] loop
  want:=case when s='e4100000-0000-4000-8000-000000000003' then 'care_unit_unsupported' else 'care_duration_unsupported' end;
  m:=null;
  begin perform public.create_booking_request('b2000000-0000-4000-8000-000000000001',s,'b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(3),gen_random_uuid());
  exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m=want,want||', got '||coalesce(m,'allowed'));
 end loop;
end $$;
select pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,%L,gen_random_uuid())','b2000000-0000-4000-8000-000000000001',
 'e4100000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(3)),'55000','hourly request is 55000');

-- T06: a scoped request snapshots the plan in the same transaction.
select public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'care_a','b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(3),gen_random_uuid()) as req \gset
reset role;
select pg_temp.assert_true((select task_codes=array['companionship','mobility_support'] and service_tasks_version=1 and substate='pending'
 and assignment_id is null and started_at is null and attestation is null and version=1 from public.care_plans where booking_id=:'req'),'plan snapshotted from the service list');
select pg_temp.assert_true((select state='requested' and version=2 from public.bookings where id=:'req'),'booking requested');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='care.plan_snapshotted' and target_type='booking' and target_id=:'req'
 and actor_profile_id='b1000000-0000-4000-8000-000000000001'),'snapshot audited with the requester, ids only');
-- A later list change does not rewrite the snapshot.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.set_care_service_tasks(:'care_a',array['escort_walk'],1,gen_random_uuid());
select pg_temp.assert_true((select task_codes=array['companionship','mobility_support'] and service_tasks_version=1 from public.care_plans where booking_id=:'req'),'snapshot immutable');

-- T02 (contract deviation, see handoff): a supported offer without a task list is admitted
-- with no plan, cannot be accepted and is invisible to get_care_plan.
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','e4100000-0000-4000-8000-000000000005','b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(4),gen_random_uuid()) as unscoped \gset
select set_config('p5c.unscoped',:'unscoped',true);
select pg_temp.expect_state(format('select public.get_care_plan(%L)',:'unscoped'),'P0002','no plan, no care projection');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
do $$ declare m text; begin
 begin perform public.accept_booking(current_setting('p5c.unscoped')::uuid,2,array['c6000000-0000-4000-8000-000000000001'::uuid]);
 exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='care_plan_missing','unscoped accept refused: '||coalesce(m,'allowed'));
end $$;
reset role;
select pg_temp.assert_true((select state='requested' from public.bookings where id=:'unscoped') and not exists(select 1 from public.care_plans where booking_id=:'unscoped')
 and not exists(select 1 from public.booking_assignments where booking_id=:'unscoped'),'unscoped booking stays requested with no assignment');
-- The scheduler can still decline it.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select public.decline_booking(:'unscoped',2,'other');
select pg_temp.assert_true((select state from public.bookings where id=:'unscoped')='declined','unscoped request declined');

-- Owner-context inserts of other categories never create plans.
select pg_temp.p5_create('doctor',pg_temp.p5_at(5)) as doc \gset
select pg_temp.assert_true(not exists(select 1 from public.care_plans where booking_id=:'doc'),'no plan for a doctor booking');
\echo 1..1
\echo ok 1 - 062_p5c_request
rollback;
