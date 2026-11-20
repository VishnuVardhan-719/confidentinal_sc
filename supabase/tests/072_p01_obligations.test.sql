\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid; p public.payments; begin
 b:=pg_temp.p5_create('doctor',clock_timestamp()+interval '30 minutes');
 select * into p from public.payments where booking_id=b;
 perform pg_temp.assert_true(p.state='not_initiated' and p.amount_paise=50001 and p.confirmed_paise=0,'request creates immutable obligation');
 perform pg_temp.p5_accept(b,array['c6000000-0000-4000-8000-000000000001']::uuid[]);
 perform pg_temp.assert_true((select state='due' from public.payments where id=p.id),'confirmation makes due');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform public.cancel_booking(b,(select version from public.bookings where id=b),'other');
 perform pg_temp.assert_true((select state='voided' from public.payments where id=p.id),'pre-service cancellation voids');
 perform pg_temp.expect_state(format('update public.payments set amount_paise=1,version=version+1 where id=%L',p.id),'55000','immutable amount');
 perform pg_temp.expect_state(format('update public.payments set booking_id=gen_random_uuid(),version=version+1 where id=%L',p.id),'55000','immutable booking');
 perform pg_temp.expect_state(format('update public.payments set collection_path=''other'',version=version+1 where id=%L',p.id),'55000','immutable path');
 perform pg_temp.expect_state(format('update public.payments set state=''due'',version=version+1 where id=%L',p.id),'55000','voided terminal');
 perform pg_temp.assert_true((select count(*)=1 from public.payments where booking_id=b),'one obligation');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 072_p01_obligations.test
rollback;
