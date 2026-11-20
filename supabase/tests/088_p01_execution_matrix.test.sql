\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
-- P01 v1.2 section 13.1 updated for P5 shared: no-show now has an ops path;
-- expiry still has no system actor; non-doctor engines not in this branch.
do $$ declare b uuid; cat text; begin
 b:=pg_temp.p5_create('doctor',clock_timestamp()+interval '30 minutes');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform public.decline_booking(b,(select version from public.bookings where id=b),'other');
 perform pg_temp.assert_true((select state='voided' from public.payments where booking_id=b),'public decline coupling');
 foreach cat in array array['lab','ambulance'] loop
  b:=pg_temp.p5_create(cat,clock_timestamp()+interval '40 minutes');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform pg_temp.expect_state(format('select public.accept_booking(%L,%s,array[''c6000000-0000-4000-8000-000000000001'']::uuid[])',b,(select version from public.bookings where id=b)),'55000','category generic path deferred '||cat);
 end loop;
 b:=pg_temp.p5_create('doctor',clock_timestamp()+interval '50 minutes');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
 perform pg_temp.expect_state(format('select booking_private.transition(%L,''expired'',''other'')',b),'55000','no forged system expiry');
 -- Shared ops now supplies a real no-show command. Open the shared absence
 -- exception as a labeled owner fixture, preserving booking guards/events.
 b:=pg_temp.p5_book('doctor',clock_timestamp()+interval '1 minute',array['c6000000-0000-4000-8000-000000000001']::uuid[]);
 perform booking_private.open_exception(b,'absence_reported','provider_unavailable');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
 perform public.ops_close_booking(b,(select version from public.bookings where id=b),'no_show','no_show_confirmed',gen_random_uuid());
 perform pg_temp.assert_true((select state='voided' from public.payments where booking_id=b),'shared ops no-show voids pre-service obligation');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 088_p01_execution_matrix.test
rollback;
