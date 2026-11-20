\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); c uuid:=pg_temp.p01_report(b); replacement uuid; own_claim uuid; begin
 own_claim:=pg_temp.p01_report(b,1);
 perform public.void_collection(own_claim,pg_temp.p01_version(b),'correction',gen_random_uuid());
 perform pg_temp.assert_true((select status='voided' from public.payment_collections where id=own_claim),'collector self void');
 perform pg_temp.p01_finance(); perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
 perform public.reconcile_collection(c,'confirm','other',pg_temp.p01_version(b),gen_random_uuid());
 replacement:=public.supersede_collection(c,9000,'cash',null,'correction',pg_temp.p01_version(b),gen_random_uuid());
 perform pg_temp.assert_true((select state='disputed' and confirmed_paise=0 from public.payments where booking_id=b),'supersede holds and recomputes');
 perform pg_temp.expect_state(format('select public.reconcile_collection(%L,''confirm'',''other'',%s,gen_random_uuid())',replacement,pg_temp.p01_version(b)),'42501','recorder cannot confirm replacement');
 perform pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
 perform public.reconcile_collection(replacement,'confirm','other',pg_temp.p01_version(b),gen_random_uuid());
 perform pg_temp.assert_true((select state='disputed' and confirmed_paise=9000 from public.payments where booking_id=b),'confirm preserves hold');
 perform public.resolve_dispute(pg_temp.p01_payment(b),'correction',pg_temp.p01_version(b),gen_random_uuid());
 set constraints all immediate;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 079_p01_corrections.test
rollback;
