\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- Caregiver session: start, end, interrupt, cancellation. Design §5.2, §5.3, §6.3, T12-T17, T27;
-- contract §5.2 (assignee_finish), §9.4 (ended_for_emergency), §12 (care releases).

create function pg_temp.msg(p_statement text) returns text language plpgsql as $$
declare m text; begin
 begin execute p_statement; exception when others then get stacked diagnostics m=message_text; return m; end;
 return 'ok';
end $$;
create function pg_temp.res_status(p_booking uuid) returns text language sql as $$
 select string_agg(distinct rr.status,',') from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=p_booking; $$;

-- T12: start window. start_at - 30 min is the earliest start; end_at closes it.
select pg_temp.c_live(2,interval '31 minutes') as s1 \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'s1','started'))='care_too_early','start at start_at - 31 min: care_too_early');
select pg_temp.p5_shift(:'s1',now()-interval '31 minutes');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'s1','started'))='care_window_closed','start after end_at: care_window_closed');
select pg_temp.expect_state(pg_temp.c_cmd('advance_care',:'s1','started'),'55000','window refusals are 55000');
select pg_temp.p5_shift(:'s1',now()+interval '29 minutes');

-- T13: only the assigned caregiver starts.
select set_config('p5c.s1',:'s1',true);
do $$ declare who uuid; b uuid:=current_setting('p5c.s1')::uuid; begin
 foreach who in array array['b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000009']::uuid[] loop
  perform pg_temp.as_user(who);
  perform pg_temp.expect_state(pg_temp.c_cmd('advance_care',b,'started'),'42501','start by '||who);
  perform pg_temp.expect_state(pg_temp.c_cmd('advance_care',b,'ended'),'42501','end by '||who);
  perform pg_temp.expect_state(pg_temp.c_cmd('interrupt_care',b,'other'),'42501','interrupt by '||who);
 end loop;
end $$;
select pg_temp.assert_true((select state='confirmed' from public.bookings where id=:'s1'),'refusals changed nothing');

-- T16 (before start): end and interrupt need a started session.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'s1','ended'))='invalid_transition','end before start');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('interrupt_care',:'s1','other'))='invalid_transition','interrupt before start');
select pg_temp.expect_state(format('select public.advance_care(%L,''started'',%s,gen_random_uuid())',:'s1',pg_temp.c_v(:'s1')-1),'40001','stale version before the state check');
select pg_temp.expect_state(format('select public.advance_care(%L,''paused'',%s,gen_random_uuid())',:'s1',pg_temp.c_v(:'s1')),'22023','unknown step');
select pg_temp.expect_state(format('select public.interrupt_care(%L,''clinical'',%s,gen_random_uuid())',:'s1',pg_temp.c_v(:'s1')),'22023','unknown interruption reason');

-- T14: start effects.
select pg_temp.c_v(:'s1') as v_before \gset
select count(*) as audits_before from public.audit_events where target_id=:'s1' \gset
select pg_temp.assert_true(pg_temp.c_start(:'s1')=:v_before+1,'start returns the next version');
select pg_temp.assert_true((select state='in_progress' from public.bookings where id=:'s1'),'booking in_progress');
select pg_temp.assert_true((select count(*)=1 from public.booking_events where booking_id=:'s1' and reason='service_started' and aggregate_version=:v_before+1
 and actor_profile_id='c1000000-0000-4000-8000-000000000002' and from_state='confirmed' and to_state='in_progress'),'one service_started event');
select pg_temp.assert_true((select count(*) from public.audit_events where target_id=:'s1')=:audits_before+1
 and exists(select 1 from public.audit_events where target_id=:'s1' and action='booking.service_started'),'one audit row');
select pg_temp.assert_true((select pg_temp.keys(o.payload)=array['booking_id','event','version'] and o.payload->>'event'='service_started'
 from public.notification_outbox o join public.booking_events e on e.id=o.event_id where e.booking_id=:'s1' and e.reason='service_started'),'outbox payload is ids only');
select pg_temp.assert_true((select substate='started' and started_at is not null and ended_at is null and version=3 from public.care_plans where booking_id=:'s1'),'plan started');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'s1','started'))='invalid_transition','start twice');

-- T27 (after start): the patient can no longer cancel.
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,%s,''patient_request'')',:'s1',pg_temp.c_v(:'s1')),'55000','no cancel once started');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,%s,''provider_unavailable'')',:'s1',pg_temp.c_v(:'s1')),'55000','no scheduler cancel once started');

-- T15: early end releases (contract §12, OD-7).
select pg_temp.assert_true(pg_temp.c_end(:'s1')=:v_before+2,'end returns the next version');
select pg_temp.assert_true((select state='completed' from public.bookings where id=:'s1'),'booking completed');
select pg_temp.assert_true((select count(*)=1 from public.booking_events where booking_id=:'s1' and reason='service_completed'),'one service_completed event');
select pg_temp.assert_true((select bool_and(status='ended' and ended_at is not null) from public.booking_assignments where booking_id=:'s1'),'assignment ended');
select pg_temp.assert_true(pg_temp.res_status(:'s1')='released','reservation released');
select pg_temp.assert_true((select substate='ended' and end_outcome='completed' and interruption_reason is null and ended_at>=started_at and version=4 from public.care_plans where booking_id=:'s1'),'plan ended completed');
select pg_temp.assert_true(not exists(select 1 from public.booking_exceptions where booking_id=:'s1'),'eligible close opens no exception');
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'caregiver free after the end');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'s1','ended'))='forbidden','after the end the caregiver has no authority');

-- T17: each interruption reason in its own booking; event reason per §9.4 mapping.
do $$ declare r text; want text; b uuid; d integer:=10; begin
 foreach r in array array['patient_request_end','caregiver_unwell','unsafe_environment','ended_for_emergency','other'] loop
  d:=d+1;
  want:=case r when 'patient_request_end' then 'patient_request' when 'caregiver_unwell' then 'provider_unavailable'
   when 'unsafe_environment' then 'unable_to_service' when 'ended_for_emergency' then 'ended_for_emergency' else 'other' end;
  b:=pg_temp.c_live(d,-interval '10 minutes');
  perform pg_temp.c_start(b);
  perform pg_temp.c_interrupt(b,r);
  perform pg_temp.assert_true((select state='interrupted' from public.bookings where id=b),r||' interrupted');
  perform pg_temp.assert_true((select reason from public.booking_events where booking_id=b order by aggregate_version desc limit 1)=want,r||' event reason '||want);
  perform pg_temp.assert_true((select substate='ended' and end_outcome='interrupted' and interruption_reason=r from public.care_plans where booking_id=b),r||' plan reason kept');
  perform pg_temp.assert_true(pg_temp.res_status(b)='released',r||' reservation released');
  perform pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=b and action='care.interrupted'),r||' care.interrupted audited');
 end loop;
end $$;

-- T16 (after end): a second terminal step is refused.
select pg_temp.c_live(20,-interval '10 minutes') as s2 \gset
select pg_temp.c_start(:'s2');
select pg_temp.c_interrupt(:'s2','other');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'s2','ended')) in ('forbidden','invalid_transition'),'end after interrupt refused');

-- T27: patient cancels a confirmed care booking before start_at.
select pg_temp.c_book(pg_temp.p5_at(21)) as s3 \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.cancel_booking(:'s3',pg_temp.c_v(:'s3'),'patient_request');
select pg_temp.assert_true((select state='cancelled' from public.bookings where id=:'s3') and pg_temp.res_status(:'s3')='released','cancelled, reservation released');
select pg_temp.assert_true((select substate='assigned' and version=2 from public.care_plans where booking_id=:'s3'),'plan still assigned (booking state is the authority)');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'s3','started')) in ('forbidden','invalid_transition'),'no start after cancellation');
\echo 1..1
\echo ok 1 - 064_p5c_session
rollback;
