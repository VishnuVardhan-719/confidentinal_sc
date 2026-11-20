\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); i uuid; k uuid:=gen_random_uuid(); summary jsonb; begin
 perform pg_temp.assert_true(payments_private.collector_assignment_at(b,false,(select report_deadline-interval '1 microsecond' from public.payments where booking_id=b)) is not null,'terminal report just before deadline');
 perform pg_temp.assert_true(payments_private.collector_assignment_at(b,false,(select report_deadline from public.payments where booking_id=b)) is null,'terminal deadline exclusive');
 perform pg_temp.p01_suspend();
 perform pg_temp.assert_true(payments_private.collector_assignment_at(b,true,(select report_deadline from public.payments where booking_id=b)) is null,'historical deadline exclusive');
 perform pg_temp.expect_state(format('select public.report_collection(%L,10000,''cash'',null,gen_random_uuid())',b),'42501','suspension denies normal collection');
 i:=public.report_collection_exception(b,10000,'cash',null,k);
 perform pg_temp.assert_true(public.report_collection_exception(b,10000,'cash',null,k)=i,'intake keyed replay');
 perform pg_temp.assert_true((select state='disputed' and confirmed_paise=0 from public.payments where booking_id=b),'untrusted intake holds without confirming');
 perform pg_temp.assert_true((select count(*)=0 from public.admin_capabilities where capability='finance:reconcile'),'no finance needed to preserve report');
 perform pg_temp.assert_true(pg_temp.keys(public.get_collection_intake_status(i))=pg_temp.sorted(array['id','status','reportedAt']),'reporter status minimal');
 perform pg_temp.expect_state(format('select public.report_collection_exception(%L,1,''cash'',null,gen_random_uuid())',b),'53300','one pending cap');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001'); summary:=public.get_payment_summary(b);
 perform pg_temp.assert_true((summary->>'reviewPending')::boolean and not(summary ? 'claims'),'patient sees hold only');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
 perform pg_temp.expect_state(format('select public.get_collection_intake_status(%L)',i),'P0002','other reporter gets not found');
 perform pg_temp.expect_state('select public.get_collection_intake_status(gen_random_uuid())','P0002','random intake same not found');
 -- A prior ended assignment with a matching resource/person is not the final visit.
 insert into public.booking_assignments(booking_id,resource_id,purpose,assigned_profile_id,period,status,ended_at)
 select b,'c6000000-0000-4000-8000-000000000002','doctor_visit','c1000000-0000-4000-8000-000000000003',tstzrange(start_at,end_at,'[)'),'ended',clock_timestamp()
 from public.bookings where id=b;
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
 perform pg_temp.expect_state(format('select public.report_collection_exception(%L,1,''cash'',null,gen_random_uuid())',b),'42501','prior ended assignee is not final doctor');
 set constraints all immediate;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 080_p01_historical_intake.test
rollback;
