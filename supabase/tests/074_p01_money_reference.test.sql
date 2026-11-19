\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); r text; begin
 perform pg_temp.expect_state(format('select public.report_collection(%L,0,''cash'',null,gen_random_uuid())',b),'22023','zero claim');
 perform pg_temp.expect_state(format('select public.report_collection(%L,-1,''cash'',null,gen_random_uuid())',b),'22023','negative claim');
 perform pg_temp.expect_state(format('select public.report_collection(%L,1000000000000000,''cash'',null,gen_random_uuid())',b),'22023','15 digit cap');
 foreach r in array array['4111111111111111','4111-1111-1111-1111','4111 1111 1111 1111','9999999999','12345678901','1234567890123','１２３４５６７８９０１２','12345678901x'] loop
  perform pg_temp.expect_state(format('select public.report_collection(%L,1,''upi_direct'',%L,gen_random_uuid())',b,r),'22023','reference rejected');
 end loop;
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',''123456789012'',gen_random_uuid())',b),'22023','cash no reference');
 perform public.report_collection(b,30000,'upi_direct','123456789012',gen_random_uuid());
 perform pg_temp.expect_state(format('select public.report_collection(%L,20002,''cash'',null,gen_random_uuid())',b),'22023','open claim reserves balance');
 perform public.report_collection(b,20001,'cash',null,gen_random_uuid());
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'22023','exact amount exhausted');
end $$;
-- A real zero-price snapshot: no fabricated paid marker, even with paid gate ON.
do $$ declare stamp timestamptz:=clock_timestamp(); begin
 update public.service_price_versions set effective_to=stamp where service_id=pg_temp.p5_service('doctor') and effective_to is null;
 insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
 select service_id,catalog_type_id,2,0,unit,terms_version,stamp from public.service_price_versions
 where service_id=pg_temp.p5_service('doctor') and version=1;
end $$;
do $$ declare b uuid:=pg_temp.p01_book(true,'c1000000-0000-4000-8000-000000000003'); j jsonb; begin
 update payments_private.settings set paid_enabled=true;
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001'); j:=public.get_payment_summary(b);
 perform pg_temp.assert_true((j->>'noCharge')::boolean and j->>'state'='due','zero no charge never paid');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'22023','zero amount cannot collect');
 perform payments_worker.reconcile_pay_after(200);
 perform pg_temp.assert_true(not exists(select 1 from public.payment_exceptions where payment_id=pg_temp.p01_payment(b) and kind='stale_due'),'no stale due for free booking');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 074_p01_money_reference.test
rollback;
