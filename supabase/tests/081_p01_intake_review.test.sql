\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); i uuid; c uuid; begin
 perform pg_temp.p01_suspend(); i:=public.report_collection_exception(b,50001,'upi_direct','123456789012',gen_random_uuid());
 perform pg_temp.p01_finance(); perform pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
 perform pg_temp.expect_state(format('select public.override_payment(%L,''due'',''other'',%s,gen_random_uuid())',pg_temp.p01_payment(b),pg_temp.p01_version(b)),'55000','override cannot release pending hold');
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.resolve_dispute(%L,''other'',%s,gen_random_uuid())',pg_temp.p01_payment(b),pg_temp.p01_version(b)),'55000','pending intake blocks resolution');
 perform public.review_collection_intake(i,'convert','other',pg_temp.p01_version(b),gen_random_uuid());
 select id into c from public.payment_collections where source_intake_id=i;
 perform pg_temp.assert_true(c is not null and payments_private.remaining(pg_temp.p01_payment(b))=0,'conversion counts amount exactly once');
 perform pg_temp.expect_state(format('select public.reconcile_collection(%L,''confirm'',''other'',%s,gen_random_uuid())',c,pg_temp.p01_version(b)),'42501','converter cannot confirm');
 perform pg_temp.expect_state(format('select public.review_collection_intake(%L,''convert'',''other'',%s,gen_random_uuid())',i,pg_temp.p01_version(b)),'55000','one conversion');
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
 perform public.reconcile_collection(c,'confirm','other',pg_temp.p01_version(b),gen_random_uuid());
 perform public.resolve_dispute(pg_temp.p01_payment(b),'other',pg_temp.p01_version(b),gen_random_uuid());
 perform pg_temp.assert_true((select state='due' and confirmed_paise=50001 from public.payments where booking_id=b),'paid remains off');
 set constraints all immediate;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 081_p01_intake_review.test
rollback;
