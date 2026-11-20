\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); c uuid:=pg_temp.p01_report(b,10000); d uuid; n bigint; begin
 perform pg_temp.p01_finance(); update payments_private.settings set paid_enabled=true;
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
 perform public.reconcile_collection(c,'confirm','other',pg_temp.p01_version(b),gen_random_uuid());
 perform pg_temp.assert_true((select state='partially_paid' and confirmed_paise=10000 from public.payments where booking_id=b),'paid gate allows genuine partial');
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
 -- partially_paid -> paid is not an admin_override transition (design §5), so bump refuses it
 -- (55000) before the guard trigger's full-amount check (23514) is reached.
 perform pg_temp.expect_state(format('select public.override_payment(%L,''paid'',''other'',%s,gen_random_uuid())',pg_temp.p01_payment(b),pg_temp.p01_version(b)),'55000','override cannot invent full payment');
 d:=pg_temp.p01_report(b,40001);
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
 perform public.reconcile_collection(d,'confirm','other',pg_temp.p01_version(b),gen_random_uuid());
 perform pg_temp.assert_true((select state='paid' and confirmed_paise=amount_paise from public.payments where booking_id=b),'paid backed by full confirmed sum');
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
 select count(*) into n from public.audit_events where action='payment.override';
 perform public.override_payment(pg_temp.p01_payment(b),'disputed','correction',pg_temp.p01_version(b),gen_random_uuid());
 perform pg_temp.assert_true((select count(*)=n+1 from public.audit_events where action='payment.override'),'override exactly one audit');
 perform pg_temp.assert_true((select count(*)=1 from public.payment_events where payment_id=pg_temp.p01_payment(b) and event_type='payment.override'),'override exactly one ledger event');
 set constraints all immediate;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 087_p01_paid_override.test
rollback;
