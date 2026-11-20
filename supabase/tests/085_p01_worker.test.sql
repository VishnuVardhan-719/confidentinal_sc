\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(false); p public.payments; processed integer; begin
 -- Guard-preserving interruption via the shared assignee closeout helper, not a nonexistent category RPC.
 perform booking_private.assignee_finish(b,'interrupted','other',gen_random_uuid());
 select * into p from public.payments where booking_id=b;
 perform pg_temp.assert_true(p.state='due' and p.report_deadline is not null,'interrupted holds due');
 perform pg_temp.p01_report(b,50001);
 perform pg_temp.assert_true(payments_worker.reconcile_pay_after(200)<=200,'worker bounded');
 perform pg_temp.assert_true((select state='due' from public.payments where id=p.id),'worker never confirms claims');
 perform pg_temp.expect_state('select payments_worker.reconcile_pay_after(201)','22023','worker limit');
 -- Duplicate UTR scan is idempotent; source keys carry IDs, never the reference.
 perform payments_private.raise_exception(p.id,'stale_reported',(select id from public.payment_collections where payment_id=p.id),'stale_reported:synthetic');
 perform payments_private.raise_exception(p.id,'stale_reported',null,'stale_reported:synthetic');
 perform pg_temp.assert_true((select count(*)=1 from public.payment_exceptions where dedupe_key='stale_reported:synthetic'),'exceptions dedupe');
 perform pg_temp.assert_true(not exists(select 1 from public.payment_events where reason_code like '%123456789012%'),'ledger reference-free');
end $$;
-- Many terminal claims cannot make a collection scan exceed its budget. No clock
-- rewriting or trigger disabling: grow real history via report/collector-void RPCs.
do $$ declare b uuid; c uuid; n integer; before_id uuid; after_id uuid; begin
 select booking_id into b from public.payments where report_deadline is not null limit 1;
 -- Free the outstanding claim, then create immutable history without consuming balance.
 select id into c from public.payment_collections where payment_id=pg_temp.p01_payment(b) and status='reported';
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 perform public.void_collection(c,pg_temp.p01_version(b),'correction',gen_random_uuid());
 for n in 1..5 loop
  c:=pg_temp.p01_report(b,1); perform public.void_collection(c,pg_temp.p01_version(b),'correction',gen_random_uuid());
 end loop;
 update payments_private.worker_cursor set phase='collections',after_collection_id=null;
 perform pg_temp.assert_true(payments_worker.reconcile_pay_after(2)=2,'history scan stops at two items');
 select after_collection_id into before_id from payments_private.worker_cursor;
 perform payments_worker.reconcile_pay_after(2); -- booking phase
 perform pg_temp.assert_true(payments_worker.reconcile_pay_after(2)=2,'next history page bounded');
 select after_collection_id into after_id from payments_private.worker_cursor;
 perform pg_temp.assert_true(after_id>before_id,'collection keyset makes progress');
end $$;
do $$ declare b uuid:=pg_temp.p01_book(false,'c1000000-0000-4000-8000-000000000003'); deadline timestamptz; begin
 perform booking_private.assignee_finish(b,'interrupted','other',gen_random_uuid());
 select report_deadline into deadline from public.payments where booking_id=b;
 update payments_private.worker_cursor set phase='bookings',after_booking_id=null;
 perform payments_private.reconcile_pay_after_at(200,deadline+interval '1 microsecond');
 perform pg_temp.assert_true((select state='voided' from public.payments where booking_id=b),'expired interrupted hold with no claims auto voids');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 085_p01_worker.test
rollback;
