\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); c uuid:=pg_temp.p01_report(b); t text; begin
 foreach t in array array['public.payment_events','public.payment_collections','payments_private.collection_intakes','payments_private.settings_events','public.audit_events'] loop
  perform pg_temp.expect_state('truncate '||t||' cascade','55000','owner truncate denied '||t);
 end loop;
 perform pg_temp.expect_state(format('update public.payment_events set reason_code=''other'' where payment_id=%L',pg_temp.p01_payment(b)),'55000','owner event update denied');
 perform pg_temp.expect_state(format('delete from public.payment_collections where id=%L',c),'55000','collection cannot disappear');
 perform pg_temp.expect_state(format('update public.payment_collections set amount_paise=2 where id=%L',c),'55000','claim amount immutable');
 perform pg_temp.expect_state(format('update public.payments set report_deadline=report_deadline+interval ''1 hour'',version=version+1 where booking_id=%L',b),'55000','deadline cannot extend');
 -- A subtransaction intentionally edits only the child; forcing deferred checks must fail.
 begin
  update public.payment_collections set status='confirmed',reason_code='other',reconciled_by='d1000000-0000-4000-8000-000000000001',reconciled_at=clock_timestamp() where id=c;
  set constraints all immediate;
  raise exception 'FAIL: child-only confirmation unexpectedly succeeded';
 exception when check_violation then
  perform pg_temp.assert_true(SQLERRM='confirmed_mismatch','deferred sum mismatch');
 end;
 set constraints all immediate;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 084_p01_ledger_guards.test
rollback;
