\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _p5d_fixture.inc
-- P5 doctor block: support-assisted arrival fallback (001630). Two parties, never the doctor:
-- an independent ops holder opens it, the patient confirms it in their own session.
-- Organisation A doctor provider; W1 c1..02 (c6..01), W2 c1..03 (c6..02), scheduler M c1..01,
-- ops O c1..05 (org:A) and OG c1..06 (global), outsider X c1..09, org B owner MB c1..07.

create function pg_temp.age_fallback(booking uuid) returns void language plpgsql as $$ begin
 alter table doctor_private.arrival_fallbacks disable trigger p5d_fallback_guard;
 update doctor_private.arrival_fallbacks set opened_at=opened_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes'
  where booking_id=booking and status='pending';
 alter table doctor_private.arrival_fallbacks enable trigger p5d_fallback_guard;
end $$;

select pg_temp.p5_book('doctor',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001']::uuid[]) as f1 \gset
select pg_temp.p5_book('doctor',pg_temp.p5_at(2,1),array['c6000000-0000-4000-8000-000000000001']::uuid[]) as f2 \gset
select pg_temp.p5_book('doctor',pg_temp.p5_at(3),array['c6000000-0000-4000-8000-000000000002']::uuid[]) as f3 \gset
select pg_temp.p5_book('doctor',pg_temp.p5_at(3,1),array['c6000000-0000-4000-8000-000000000002']::uuid[]) as f4 \gset
select pg_temp.p5_shift(:'f1',now()+interval '10 minutes');
select pg_temp.p5_shift(:'f2',now()+interval '50 minutes');
select pg_temp.p5_shift(:'f3',now()+interval '10 minutes');
select pg_temp.p5_shift(:'f4',now()+interval '50 minutes');
select pg_temp.assert_true(booking_private.gate_state('doctor_arrival_fallback')='on','shared fixture switched the fallback gate on for this suite');
select pg_temp.assert_true((select count(*)=1 from booking_private.feature_gate_events where key='doctor_arrival_fallback' and from_state is null and to_state='off'),'fallback gate was seeded off');

set local role authenticated;
select pg_temp.to_arrived(:'f1','c1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001') as code1 \gset
select pg_temp.to_arrived(:'f2','c1000000-0000-4000-8000-000000000002');
select pg_temp.to_arrived(:'f4','c1000000-0000-4000-8000-000000000003');

-- 1. Gate: off by default for real use; doctor gate suspension also stops it.
reset role;
select pg_temp.set_gate('off','doctor_arrival_fallback');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_unavailable'',gen_random_uuid())',:'f1'),'55000','fallback gate off');
reset role;
select pg_temp.set_gate('on','doctor_arrival_fallback');
select pg_temp.set_gate('suspended');
set local role authenticated;
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_unavailable'',gen_random_uuid())',:'f1'),'55000','doctor gate suspended');
reset role;
select pg_temp.set_gate('on');
set local role authenticated;

-- 2. Only an independent ops holder at AAL2 may open it.
select set_config('p5d.f1',:'f1',true);
do $$ declare u uuid; begin
 foreach u in array array['c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000009','c1000000-0000-4000-8000-000000000007']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_unavailable'',gen_random_uuid())',current_setting('p5d.f1')),'42501',u||' cannot open a fallback');
 end loop;
end $$;
select set_config('request.jwt.claims',json_build_object('sub','c1000000-0000-4000-8000-000000000006')::text,true);
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_unavailable'',gen_random_uuid())',:'f1'),'42501','ops without AAL2 denied');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''other'',gen_random_uuid())',:'f1'),'22023','reason list is closed');
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_lockout'',gen_random_uuid())',:'f1'),'55000','lockout reason needs an actual lockout');
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,5,''code_unavailable'',gen_random_uuid())',:'f1'),'40001','stale version');
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,4,''code_unavailable'',gen_random_uuid())',:'f3'),'55000','not before the doctor reports arrival');

-- 3. Open (org-scoped ops), replay, and the codes it revokes.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select gen_random_uuid() as k_op \gset
select public.open_arrival_fallback(:'f1',6,'code_unavailable',:'k_op') as op1 \gset
select pg_temp.assert_true(public.open_arrival_fallback(:'f1',6,'code_unavailable',:'k_op')=:'op1'::jsonb,'open replay returns the same fallback');
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_lockout'',%L)',:'f1',:'k_op'),'40001','open key reused with another reason conflicts');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_unavailable'',gen_random_uuid())',:'f1'),'55000','one pending fallback per visit');
reset role;
select pg_temp.assert_true((select count(*)=1 and bool_and(status='pending' and opened_by_profile_id='c1000000-0000-4000-8000-000000000005'
 and doctor_profile_id='c1000000-0000-4000-8000-000000000002' and expires_at<=opened_at+interval '10 minutes') from doctor_private.arrival_fallbacks where booking_id=:'f1'),'one pending fallback bound to the doctor');
select pg_temp.assert_true((select count(*)=0 from doctor_private.arrival_challenges where booking_id=:'f1' and status='active'),'opening revokes the live code');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'f1' and action='booking.arrival_fallback_opened'),'opening audited once');
select pg_temp.assert_true(pg_temp.version(:'f1')=6 and pg_temp.sub(:'f1')='arrived','opening alone changes nothing on the visit');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6,gen_random_uuid())',:'f1',:'code1'),'55000','the revoked code no longer verifies');
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_started'',6,gen_random_uuid())',:'f1'),'55000','an open fallback does not let the doctor start');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.get_doctor_visit(:'f1')->>'arrival_fallback_expires_at' is not null,'patient sees the pending confirmation');

-- 4. Confirm: the patient only, never the opener or the doctor.
select set_config('p5d.f1',:'f1',true);
do $$ declare u uuid; begin
 foreach u in array array['c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000009']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.confirm_arrival_fallback(%L,6,gen_random_uuid())',current_setting('p5d.f1')),'42501',u||' cannot confirm');
 end loop;
end $$;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.confirm_arrival_fallback(%L,5,gen_random_uuid())',:'f1'),'40001','stale confirm');
select gen_random_uuid() as k_cf \gset
select pg_temp.assert_true(public.confirm_arrival_fallback(:'f1',6,:'k_cf')=7,'patient confirms');
select pg_temp.assert_true(public.confirm_arrival_fallback(:'f1',6,:'k_cf')=7,'confirm replay');
reset role;
select pg_temp.assert_true(pg_temp.sub(:'f1')='arrival_verified' and pg_temp.state(:'f1')='confirmed','visit verified by the fallback');
select pg_temp.assert_true((select reason from public.booking_events where booking_id=:'f1' and aggregate_version=7)='arrival_assisted' and pg_temp.events(:'f1')=6,
 'one arrival_assisted event, distinct from a code verification; got '||coalesce((select string_agg(aggregate_version||':'||reason,',' order by aggregate_version) from public.booking_events where booking_id=:'f1'),'-'));
select pg_temp.assert_true((select status='confirmed' and confirmed_by_profile_id='b1000000-0000-4000-8000-000000000001' from doctor_private.arrival_fallbacks where booking_id=:'f1'),'fallback confirmed by the patient');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'f1','service_started',7,gen_random_uuid())=8,'doctor may start after the assisted verification');

-- 5. Expiry and the per-visit cap (f2).
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.assert_true(public.open_arrival_fallback(:'f2',6,'code_unavailable',gen_random_uuid()) ? 'id','first fallback');
reset role;
select pg_temp.age_fallback(:'f2');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.confirm_arrival_fallback(%L,6,gen_random_uuid())',:'f2'),'55000','expired fallback cannot be confirmed');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.assert_true(public.open_arrival_fallback(:'f2',6,'code_unavailable',gen_random_uuid()) ? 'id','second fallback after expiry');
reset role;
select pg_temp.age_fallback(:'f2');
set local role authenticated;
select pg_temp.expect_state(format('select public.open_arrival_fallback(%L,6,''code_unavailable'',gen_random_uuid())',:'f2'),'53300','two fallbacks per visit at most');
reset role;
select pg_temp.assert_true((select array_agg(status order by opened_at) from doctor_private.arrival_fallbacks where booking_id=:'f2')=array['revoked','pending'],
 'the expired pending fallback was revoked when the next one opened');

-- 6. Lockout path, and the doctor holding patient access still cannot issue or confirm (f3).
insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
 select 'b2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003',s,'b2100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001'
 from unnest(array['booking:read','booking:create']) s;
set local role authenticated;
select pg_temp.to_arrived(:'f3','c1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001') as code3 \gset
select lpad((((:'code3')::int+1)%1000000)::text,6,'0') as wrong3 \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'f3'),'42501','the doctor cannot issue their own code even with patient access');
select public.verify_arrival_code(:'f3',:'wrong3',6,gen_random_uuid()) from generate_series(1,5);
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.assert_true(public.open_arrival_fallback(:'f3',6,'code_lockout',gen_random_uuid()) ? 'id','lockout opens a fallback');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.confirm_arrival_fallback(%L,6,gen_random_uuid())',:'f3'),'42501','the doctor cannot confirm their own fallback');

-- 7. A terminal doctor step closes a pending fallback (f4).
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.assert_true(public.open_arrival_fallback(:'f4',6,'code_unavailable',gen_random_uuid()) ? 'id','fallback on f4');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'f4',6,'ended_for_emergency',gen_random_uuid())=7,'emergency never waits for the fallback');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.confirm_arrival_fallback(%L,7,gen_random_uuid())',:'f4'),'55000','no confirmation after the visit ended');
reset role;
select pg_temp.assert_true((select status from doctor_private.arrival_fallbacks where booking_id=:'f4')='revoked','interruption revoked the pending fallback');

-- 8. Table guards (owner context, triggers enabled) and API-role privileges.
select pg_temp.expect_state(format('update doctor_private.arrival_fallbacks set opened_by_profile_id=''c1000000-0000-4000-8000-000000000006'' where booking_id=%L',:'f3'),'55000','opener immutable');
select pg_temp.expect_state(format('update doctor_private.arrival_fallbacks set status=''pending'',confirmed_by_profile_id=null,ended_at=null where booking_id=%L',:'f1'),'55000','confirmed fallback immutable');
select pg_temp.expect_state(format('delete from doctor_private.arrival_fallbacks where booking_id=%L',:'f3'),'55000','fallback delete rejected');
select pg_temp.expect_state('truncate doctor_private.arrival_fallbacks','55000','fallback truncate rejected');
select pg_temp.expect_state(format('update doctor_private.arrival_fallbacks set status=''confirmed'',confirmed_by_profile_id=opened_by_profile_id,ended_at=now() where booking_id=%L',:'f3'),'23514','opener cannot be the confirmer');
select pg_temp.expect_state(format('update doctor_private.arrival_fallbacks set status=''confirmed'',confirmed_by_profile_id=doctor_profile_id,ended_at=now() where booking_id=%L',:'f3'),'23514','doctor cannot be the confirmer');
select pg_temp.expect_state(format('insert into doctor_private.arrival_fallbacks(booking_id,assignment_id,doctor_profile_id,reason,opened_by_profile_id,expires_at)
 select %L,id,assigned_profile_id,''code_unavailable'',assigned_profile_id,now()+interval ''5 minutes'' from public.booking_assignments where booking_id=%L',:'f2',:'f2'),'23514','doctor cannot open for themself');
select pg_temp.expect_state(format('update doctor_private.verify_failures set attempts_remaining=4 where booking_id=%L',:'f3'),'55000','failure records immutable');
set local role authenticated;
select pg_temp.expect_state('select count(*) from doctor_private.arrival_fallbacks','42501','authenticated cannot read fallbacks');
reset role;
set local role service_role;
select pg_temp.expect_state('select count(*) from doctor_private.arrival_fallbacks','42501','service_role cannot read fallbacks');
reset role;

\echo 1..1
\echo ok 1 - p5d_arrival_fallback
rollback;
