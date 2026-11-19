\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc

-- Fixture provider (doctor, approved, full-day availability) is reachable by its public reference.
reset role;
select public_reference as ref from public.providers where id='b3000000-0000-4000-8000-000000000001' \gset
-- A second, unapproved provider: its reference must not unlock the fixture service.
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state)
 values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000001','doctor','inactive','draft') returning public_reference as other_ref \gset
select ((clock_timestamp() at time zone 'Asia/Kolkata')::date+1)::text as day \gset

select pg_temp.assert_true(:'ref' ~ '^SCV-DOC-[0-9]{6,19}$','fixture has a public reference');
select pg_temp.assert_true(pg_get_function_result('public.list_slots(text,uuid,date)'::regprocedure)
 ='TABLE(start_at timestamp with time zone, end_at timestamp with time zone, advisory boolean)','reference overload returns no identifiers');
select pg_temp.assert_true((select prosecdef and exists(select 1 from unnest(proconfig) x where x in ('search_path=""','search_path='))
 from pg_proc where oid='public.list_slots(text,uuid,date)'::regprocedure),'definer with empty search path');
select pg_temp.assert_true(not has_function_privilege('anon','public.list_slots(text,uuid,date)','EXECUTE'),'no guest execution');
select pg_temp.assert_true(not has_function_privilege('public','public.list_slots(text,uuid,date)','EXECUTE'),'no PUBLIC execution');
select pg_temp.assert_true(has_function_privilege('authenticated','public.list_slots(text,uuid,date)','EXECUTE'),'authenticated may execute');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true((select count(*)>0 from public.list_slots(:'ref','b4100000-0000-4000-8000-000000000001',:'day'::date)),'reference returns slots');
select pg_temp.assert_true((select array_agg((start_at,end_at,advisory) order by start_at) from public.list_slots(:'ref','b4100000-0000-4000-8000-000000000001',:'day'::date))
 is not distinct from (select array_agg((start_at,end_at,advisory) order by start_at) from public.list_slots('b3000000-0000-4000-8000-000000000001'::uuid,'b4100000-0000-4000-8000-000000000001',:'day'::date)),
 'reference and internal UUID paths agree');
select pg_temp.assert_true((select bool_and(advisory) from public.list_slots(:'ref','b4100000-0000-4000-8000-000000000001',:'day'::date)),'slots stay advisory');
select pg_temp.assert_true((select count(*)=0 from public.list_slots('SCV-DOC-999999999','b4100000-0000-4000-8000-000000000001',:'day'::date)),'unknown reference is empty, not an error');
select pg_temp.assert_true((select count(*)=0 from public.list_slots(:'other_ref','b4100000-0000-4000-8000-000000000001',:'day'::date)),'another provider reference cannot read this service');
select pg_temp.assert_true((select count(*)=0 from public.list_slots(replace(:'ref','DOC','LAB'),'b4100000-0000-4000-8000-000000000001',:'day'::date)),'wrong-category reference is empty');
select pg_temp.expect_state(format('select * from public.list_slots(%L,%L::uuid,%L::date)','b3000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001',:'day'),'22023','UUID text rejected as reference');
select pg_temp.expect_state(format('select * from public.list_slots(%L,%L::uuid,%L::date)','SCV-DOC-1','b4100000-0000-4000-8000-000000000001',:'day'),'22023','malformed reference rejected');
select pg_temp.expect_state(format('select * from public.list_slots(null::text,%L::uuid,%L::date)','b4100000-0000-4000-8000-000000000001',:'day'),'22023','null reference rejected');
select pg_temp.expect_state(format('select * from public.list_slots(%L,%L::uuid,%L::date)',:'ref','b4100000-0000-4000-8000-000000000001',(current_date+60)::text),'22023','date window enforced');
select pg_temp.expect_state(format('select * from public.list_slots(%L,%L::uuid,%L::date)','SCV-DOC-999999999','b4100000-0000-4000-8000-000000000001',(current_date+60)::text),'22023','date window enforced for unknown reference');
select set_config('request.jwt.claims','{}',true);
select pg_temp.expect_state(format('select * from public.list_slots(%L,%L::uuid,%L::date)',:'ref','b4100000-0000-4000-8000-000000000001',:'day'),'42501','signed-out caller denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","is_anonymous":true}',true);
select pg_temp.expect_state(format('select * from public.list_slots(%L,%L::uuid,%L::date)',:'ref','b4100000-0000-4000-8000-000000000001',:'day'),'42501','anonymous session denied');

\echo 1..1
\echo ok 1 - availability_reference
rollback;
