\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); c uuid; begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 set local role authenticated;
 c:=public.report_collection(b,10000,'cash',null,gen_random_uuid());
 perform pg_temp.assert_true((select count(*)=1 from public.payment_collections where id=c),'collector RLS own collection');
 perform pg_temp.expect_state('update public.payments set state=''paid''','42501','authenticated no writes');
 perform pg_temp.expect_state('select payments_worker.reconcile_pay_after(10)','42501','authenticated no worker schema');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true((select count(*)=0 from public.payment_collections),'provider RLS no collections');
 perform pg_temp.assert_true((select count(*)=0 from public.payment_events),'provider RLS no events');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true((select count(*)=1 from public.payments where booking_id=b),'patient RLS own obligation');
 perform pg_temp.assert_true((select count(*)=0 from public.payment_collections),'patient RLS no collections');
 reset role;
 update payments_private.settings set pay_after_enabled=false;
 set local role authenticated;
 perform pg_temp.assert_true((select count(*)=0 from public.payments),'OFF gate also hides direct patient SELECT');
 reset role;
 update payments_private.settings set pay_after_enabled=true;
 set local role service_role;
 perform pg_temp.expect_state('update public.payments set state=''paid''','42501','service role no writes');
 perform pg_temp.expect_state(format('select public.get_payment_summary(%L)',b),'42501','service role cannot use user RPC');
 perform payments_worker.reconcile_pay_after(10);
 reset role;
 set local role anon;
 perform pg_temp.expect_state(format('select public.get_payment_summary(%L)',b),'42501','anon no RPC');
 reset role;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 083_p01_api_roles.test
rollback;
