\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); c uuid:=pg_temp.p01_report(b); begin
 perform pg_temp.expect_state(format('select public.reconcile_collection(%L,''confirm'',''other'',%s,gen_random_uuid())',c,pg_temp.p01_version(b)),'42501','collector cannot reconcile');
 perform pg_temp.p01_finance();
 perform set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
 perform pg_temp.expect_state(format('select public.reconcile_collection(%L,''confirm'',''other'',%s,gen_random_uuid())',c,pg_temp.p01_version(b)),'42501','AAL2 required');
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
 perform public.reconcile_collection(c,'confirm','other',pg_temp.p01_version(b),gen_random_uuid());
 perform pg_temp.assert_true((select state='due' and confirmed_paise=10000 from public.payments where booking_id=b),'paid gate off keeps due after confirmation');
 perform pg_temp.expect_state(format('update public.payments set confirmed_paise=amount_paise,state=''paid'',version=version+1 where booking_id=%L',b),'23514','owner spoof confirmed mismatch');
 perform pg_temp.expect_state(format('update public.payments set state=''partially_paid'',version=version+1 where booking_id=%L',b),'55000','owner bound by paid gate');
 perform pg_temp.p01_report(b,1000);
 -- Privileged typed-time worker path; public worker always supplies DB time.
 perform payments_private.reconcile_pay_after_at(200,clock_timestamp()+interval '8 days');
 perform payments_private.reconcile_pay_after_at(200,clock_timestamp()+interval '8 days');
 perform pg_temp.assert_true((select count(*)=1 from public.payment_exceptions where payment_id=pg_temp.p01_payment(b) and kind='stale_due'),'stale completed due flagged');
 perform pg_temp.assert_true((select count(*)=1 from public.payment_exceptions where payment_id=pg_temp.p01_payment(b) and kind='stale_reported'),'stale report flagged');
 perform payments_private.reconcile_pay_after_at(200,clock_timestamp()+interval '8 days');
 perform payments_private.reconcile_pay_after_at(200,clock_timestamp()+interval '8 days');
 perform pg_temp.assert_true((select count(*)=2 from public.payment_exceptions where payment_id=pg_temp.p01_payment(b)),'repeat passes do not duplicate stale exceptions');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 075_p01_reconciliation.test
rollback;
