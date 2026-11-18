\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',now()+interval ''91 days'',gen_random_uuid())','22023','90 day horizon');
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours','b7000000-0000-4000-8000-000000000001') as booking \gset
select public.cancel_booking(:'booking',2,'patient_request');
select pg_temp.assert_true(public.get_booking(:'booking')->>'state'='cancelled','policy free patient cancellation');
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours','b7000000-0000-4000-8000-000000000002') as booking \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select public.accept_booking(:'booking',2,array['b6000000-0000-4000-8000-000000000001'::uuid]);
select pg_temp.assert_true(not booking_private.assigned(:'booking','doctor_visit'),'early assigned scope denied');
select pg_temp.assert_true(not (public.get_booking(:'booking') ? 'contact_snapshot'),'early scheduler contacts hidden');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'booking'),'42501','early advance denied');
reset role;
alter table public.bookings disable trigger b01_booking_guard;
update public.bookings set start_at=now()+interval '30 minutes',end_at=now()+interval '60 minutes' where id=:'booking';
alter table public.bookings enable trigger b01_booking_guard;
set local role authenticated;
select pg_temp.assert_true(booking_private.assigned(:'booking','doctor_visit'),'in window assigned scope');
select pg_temp.assert_true(public.get_booking(:'booking') ? 'contact_snapshot','in window contact visible');
reset role;
alter table public.bookings disable trigger b01_booking_guard;
update public.bookings set start_at=now()-interval '14 hours',end_at=now()-interval '13 hours' where id=:'booking';
alter table public.bookings enable trigger b01_booking_guard;
set local role authenticated;
select pg_temp.assert_true(not booking_private.assigned(:'booking','doctor_visit'),'late assigned scope denied');
select pg_temp.assert_true(not (public.get_booking(:'booking') ? 'contact_snapshot'),'late contacts hidden');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'booking'),'42501','late advance denied');
select public.cancel_booking(:'booking',4,'provider_unavailable');
reset role;
select pg_temp.assert_true((select count(*)=0 from public.resource_reservations where status='active'),'provider cancellation releases resources');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours',gen_random_uuid()) as confirmed_cancel \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select public.accept_booking(:'confirmed_cancel',2,array['b6000000-0000-4000-8000-000000000001'::uuid]);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.cancel_booking(:'confirmed_cancel',4,'patient_request');
select pg_temp.assert_true(public.get_booking(:'confirmed_cancel')->>'state'='cancelled','confirmed booking cancels without policy');
do $$ begin
 for i in 1..10 loop
  perform public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '3 days 4 hours'+i*interval '1 hour',('b7000000-0000-4000-8000-'||lpad((i+10)::text,12,'0'))::uuid);
 end loop;
end $$;
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',now()+interval ''5 days'',gen_random_uuid())','53300','eleventh pending request denied');
select pg_temp.assert_true(public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '3 days 5 hours','b7000000-0000-4000-8000-000000000011') is not null,'idempotent retry at cap');
do $$ begin
 for i in 2..20 loop
  perform public.save_patient_address('b2000000-0000-4000-8000-000000000001','Synthetic address','Synthetic','599991','Synthetic patient','+919999999999',0);
 end loop;
end $$;
select pg_temp.expect_state('select public.save_patient_address(''b2000000-0000-4000-8000-000000000001'',''Synthetic address'',''Synthetic'',''599991'',''Synthetic patient'',''+919999999999'',0)','53300','twenty first address denied');
select public.save_patient_address('b2000000-0000-4000-8000-000000000001','Synthetic updated address','Synthetic','599991','Synthetic patient','+919999999999',1,'b5000000-0000-4000-8000-000000000001');

\echo 1..1
\echo ok 1 - b01_fixes
rollback;
