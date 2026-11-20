\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- care_plans integrity for privileged SQL (owner context, triggers on). Design §4.2 guard, T11.

select pg_temp.c_live(2,-interval '10 minutes') as b \gset
select pg_temp.c_start(:'b');
select pg_temp.c_end(:'b');
select pg_temp.c_attest(:'b','confirmed');
select pg_temp.c_book(pg_temp.p5_at(3)) as assigned_plan \gset
reset role;
select pg_temp.assert_true((select substate='ended' and attestation='confirmed' and version=5 from public.care_plans where booking_id=:'b'),'fixture plan ended and attested');

select pg_temp.expect_state(format('update public.care_plans set task_codes=array[''escort_walk''],version=version+1 where booking_id=%L',:'b'),'55000','task codes immutable');
select pg_temp.expect_state(format('update public.care_plans set service_tasks_version=9,version=version+1 where booking_id=%L',:'b'),'55000','snapshot version immutable');
select pg_temp.expect_state(format('update public.care_plans set booking_id=%L,version=version+1 where booking_id=%L',:'assigned_plan',:'b'),'55000','booking id immutable');
select pg_temp.expect_state(format('update public.care_plans set assignment_id=null,substate=''pending'',version=version+1 where booking_id=%L',:'b'),'55000','assignment set once');
select pg_temp.expect_state(format('update public.care_plans set substate=''assigned'',version=version+1 where booking_id=%L',:'b'),'55000','substate cannot move back');
select pg_temp.expect_state(format('update public.care_plans set started_at=now()-interval ''1 day'',version=version+1 where booking_id=%L',:'b'),'55000','started_at immutable');
select pg_temp.expect_state(format('update public.care_plans set ended_at=now(),version=version+1 where booking_id=%L',:'b'),'55000','ended_at immutable');
select pg_temp.expect_state(format('update public.care_plans set end_outcome=''interrupted'',interruption_reason=''other'',version=version+1 where booking_id=%L',:'b'),'55000','outcome immutable');
select pg_temp.expect_state(format('update public.care_plans set attestation=''disputed'',version=version+1 where booking_id=%L',:'b'),'55000','second attestation');
select pg_temp.expect_state(format('update public.care_plans set updated_at=now() where booking_id=%L',:'b'),'40001','version must move');
select pg_temp.expect_state(format('delete from public.care_plans where booking_id=%L',:'b'),'55000','plan delete refused');
select pg_temp.expect_state('truncate public.care_plans','55000','plan truncate refused');
-- Skipping a step is refused; row-shape CHECKs back the guard.
select pg_temp.expect_state(format('update public.care_plans set substate=''ended'',started_at=now(),ended_at=now(),end_outcome=''completed'',version=version+1 where booking_id=%L',:'assigned_plan'),'55000','assigned plan cannot skip to ended');
select pg_temp.expect_state(format('update public.care_plans set substate=''started'',version=version+1 where booking_id=%L',:'assigned_plan'),'23514','started needs started_at');
select pg_temp.expect_state(format('update public.care_plans set substate=''started'',started_at=now(),end_outcome=''completed'',version=version+1 where booking_id=%L',:'assigned_plan'),'23514','outcome needs an end');
select pg_temp.expect_state(format('insert into public.care_plans(booking_id,task_codes,service_tasks_version) values (%L,array[''companionship''],1)',:'b'),'23505','one plan per booking');
select pg_temp.expect_state(format('insert into public.care_plans(booking_id,task_codes,service_tasks_version) select id,array[''medication''],1 from public.bookings where id=%L',
 pg_temp.p5_create('doctor',pg_temp.p5_at(4))),'23514','closed list enforced by CHECK');
select pg_temp.assert_true((select substate='ended' and attestation='confirmed' and version=5 from public.care_plans where booking_id=:'b'),'plan unchanged');
\echo 1..1
\echo ok 1 - 065_p5c_plan_guard
rollback;
