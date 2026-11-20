\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); c uuid; j jsonb; begin
 c:=public.report_collection(b,10000,'upi_direct','123456789012',gen_random_uuid());
 j:=public.get_payment_summary(b);
 perform pg_temp.assert_true(j->'claims'->0->>'reference'='123456789012' and not(j->'claims'->0 ? 'collector_profile_id'),'collector own reference only');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001'); j:=public.get_payment_summary(b);
 perform pg_temp.assert_true(not(j ? 'claims') and jsonb_typeof(j->'amountPaise')='string','patient no claims and decimal money');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001'); j:=public.get_payment_summary(b);
 perform pg_temp.assert_true(not(j->'claims'->0 ?| array['reference','collector_profile_id','reviewed_by','patient_id']),'provider projection hides sensitive fields');
 for j in select * from public.list_provider_payments(pg_temp.p5_provider('doctor'),100,null) loop
  perform pg_temp.assert_true(j ? 'public_ref' and not(j::text like '%123456789012%'),'provider list public reference, no UTR');
 end loop;
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
 perform pg_temp.expect_state(format('select public.get_payment_summary(%L)',b),'P0002','cross patient read');
 perform pg_temp.expect_state('select public.get_payment_summary(gen_random_uuid())','P0002','random read same not found');
 perform pg_temp.expect_state(format('select public.list_provider_payments(%L,25,null)',pg_temp.p5_provider('doctor')),'P0002','cross provider list');
 perform pg_temp.p01_finance(); perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
 for j in select * from public.list_payment_queue(100,null,null) loop
  perform pg_temp.assert_true(not(j ?| array['provider_id','patient_id','phone','address','name','reference']),'queue privacy');
 end loop;
 perform pg_temp.expect_state('select public.list_payment_queue(101,null,null)','22023','limit enforced');
 perform pg_temp.expect_state('select public.list_payment_queue(25,now(),null)','22023','paired cursor enforced');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 082_p01_privacy_reads.test
rollback;
