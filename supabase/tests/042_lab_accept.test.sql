\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab accept (design S12.1 022, S7.1; contract S7.1, S8.2, S11.2, S13.1). Authored; DB NOT EXECUTED.
-- Reservation = [start_at - 30 min, end_at + 90 min) from the lab policy snapshot.

create function pg_temp.accept_sql(p_booking uuid,p_resource uuid,p_version integer default null,p_key uuid default gen_random_uuid()) returns text language sql as $$
 select format('select public.accept_lab_booking(%L,%s,%L,%L)',p_booking,coalesce(p_version,pg_temp.lab_v(p_booking)),p_resource,p_key); $$;

do $$ declare b uuid; b0 uuid; v integer; a public.booking_assignments; rr public.resource_reservations; bk public.bookings; x uuid; k uuid;
 w1 uuid:='c6000000-0000-4000-8000-000000000001'; w2 uuid:='c6000000-0000-4000-8000-000000000002'; begin
 -- 1. The generic accept refuses lab permanently (use_category_command).
 b0:=pg_temp.lab_create(pg_temp.p5_at(2));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.accept_booking(%L,%s,array[%L::uuid])',b0,pg_temp.lab_v(b0),w1),'55000','generic accept refuses lab');
 -- 2. Happy path.
 b:=pg_temp.lab_create(pg_temp.p5_at(1));
 v:=pg_temp.lab_accept(b,w1);
 select * into bk from public.bookings where id=b;
 select * into a from public.booking_assignments where booking_id=b;
 select * into rr from public.resource_reservations where assignment_id=a.id;
 perform pg_temp.assert_true(v=4 and bk.state='confirmed' and bk.version=4,'accept returns the confirmed version');
 perform pg_temp.assert_true(a.purpose='lab_collection' and a.assigned_profile_id='c1000000-0000-4000-8000-000000000002' and a.resource_id=w1
  and a.status='active' and a.period=tstzrange(bk.start_at,bk.end_at,'[)'),'one lab_collection assignment for W1');
 perform pg_temp.assert_true(rr.status='active' and rr.occupied_period=tstzrange(bk.start_at-interval '30 minutes',bk.end_at+interval '90 minutes','[)'),'reservation covers both lab buffers');
 perform pg_temp.assert_true((select count(*)=1 from public.booking_assignments where booking_id=b)
  and (select count(*)=1 from public.resource_reservations rx join public.booking_assignments ax on ax.id=rx.assignment_id where ax.booking_id=b),'exactly one assignment and reservation');
 perform pg_temp.assert_true((select array_agg(reason order by aggregate_version)=array['requested','accepted','confirmed'] from public.booking_events where booking_id=b),'accepted and confirmed events');
 perform pg_temp.assert_true((select substate='scheduled' and assignment_id=a.id and version=2 from public.lab_orders where booking_id=b),'order scheduled with the assignment');
 perform pg_temp.assert_true((select result_version=4 and result_id=(select id from public.booking_events where booking_id=b and aggregate_version=4)
  from public.idempotency_requests where action='p5.lab.accept' and actor_profile_id='c1000000-0000-4000-8000-000000000001'),'replay row: confirmed event and version');
 -- 3. Callers without the scheduler predicate (staff, technician, patient, other org, outsider, ops).
 foreach x in array array['c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000007','c1000000-0000-4000-8000-000000000009','c1000000-0000-4000-8000-000000000005']::uuid[] loop
  perform pg_temp.as_user(x);
  perform pg_temp.expect_state(pg_temp.accept_sql(b0,w2),'42501','not a scheduler '||x);
 end loop;
 -- 4. Resources that may not be assigned: vehicle, unverified member, other organisation's
 -- member, the patient's own profile (not eligible), unknown id, an expired Q06 case.
 insert into public.resources(id,kind,person_profile_id) values ('c9600000-0000-4000-8000-0000000000b1','person','b1000000-0000-4000-8000-000000000001');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 foreach x in array array['c6000000-0000-4000-8000-000000000003','c9600000-0000-4000-8000-000000000001','c9600000-0000-4000-8000-000000000008',
  'c9600000-0000-4000-8000-0000000000b1',gen_random_uuid()::text]::uuid[] loop
  perform pg_temp.expect_state(pg_temp.accept_sql(b0,x),'42501','resource refused '||x);
 end loop;
 update public.staff_credential_documents set expires_at=now()-interval '1 second'
  where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.p5_provider('lab') and subject_profile_id='c1000000-0000-4000-8000-000000000003');
 perform pg_temp.expect_state(pg_temp.accept_sql(b0,w2),'42501','expired Q06 case refused');
 update public.staff_credential_documents set expires_at=now()+interval '1 year'
  where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.p5_provider('lab') and subject_profile_id='c1000000-0000-4000-8000-000000000003');
 perform pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=b0) and pg_temp.lab_state(b0)='requested','nothing reserved on refusal');
 perform pg_temp.expect_state(format('select public.accept_lab_booking(%L,null,%L,gen_random_uuid())',b0,w2),'22023','null version');
 perform pg_temp.expect_state(format('select public.accept_lab_booking(%L,%s,%L,null)',b0,pg_temp.lab_v(b0),w2),'22023','null key');
 perform pg_temp.expect_state(pg_temp.accept_sql(gen_random_uuid(),w2,1),'42501','unknown booking');
 -- A doctor booking, and a lab booking that bypassed the lab create (no order row).
 x:=pg_temp.p5_create('doctor',pg_temp.p5_at(7));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2),'55000','lab accept refuses a doctor booking');
 x:=pg_temp.p5_raw('lab','requested',pg_temp.p5_at(7));
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2),'55000','lab booking without an order');
 -- 5. Overlap with an active reservation of the same person: another lab booking, and a
 -- doctor visit of another provider in another category. 23P01; the other technician fits.
 x:=pg_temp.lab_create(pg_temp.p5_at(1,1));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w1),'23P01','overlapping lab reservation');
 perform pg_temp.lab_accept(x,w2);
 perform pg_temp.p5_book('doctor',pg_temp.p5_at(3),array[w1]);
 x:=pg_temp.lab_create(pg_temp.p5_at(3));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w1),'23P01','overlapping doctor visit of another provider');
 perform pg_temp.assert_true(pg_temp.lab_state(x)='requested' and (select count(*)=0 from public.booking_assignments where booking_id=x),'overlap leaves the request untouched');
 -- 7. Stale version, booking not requested, declined, start passed.
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2,pg_temp.lab_v(x)+1),'40001','stale version');
 perform pg_temp.expect_state(pg_temp.accept_sql(b,w2),'55000','booking already confirmed');
 perform public.decline_booking(b0,pg_temp.lab_v(b0),'provider_unavailable');
 perform pg_temp.expect_state(pg_temp.accept_sql(b0,w2),'55000','declined booking');
 perform pg_temp.p5_shift(x,now()-interval '1 hour');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2),'55000','start_at passed');
 -- 9. Replay: the same key returns the same version; the key with another resource conflicts.
 x:=pg_temp.lab_create(pg_temp.p5_at(6));
 k:=gen_random_uuid();
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 v:=public.accept_lab_booking(x,2,w2,k);
 perform pg_temp.assert_true(public.accept_lab_booking(x,2,w2,k)=v,'accept replay returns the same version');
 perform pg_temp.assert_true((select count(*)=3 from public.booking_events where booking_id=x),'replay wrote no event');
 perform pg_temp.expect_state(format('select public.accept_lab_booking(%L,2,%L,%L)',x,w1,k),'40001','same key, other resource');
 -- Parity with the generic accept (suites 005/011): gate closed, provider suspended,
 -- patient account disabled after the request. Each refuses before anything is written.
 x:=pg_temp.lab_create(pg_temp.p5_at(8));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 update booking_private.feature_gates set state='off' where key='lab';
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2),'55000','gate off');
 update booking_private.feature_gates set state='suspended' where key='lab';
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2),'55000','gate suspended');
 update booking_private.feature_gates set state='on' where key='lab';
 update public.providers set status='suspended' where id=pg_temp.p5_provider('lab');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2),'42501','provider suspended');
 update public.providers set status='active' where id=pg_temp.p5_provider('lab');
 update public.profiles set status='disabled' where id='b1000000-0000-4000-8000-000000000001';
 perform pg_temp.expect_state(pg_temp.accept_sql(x,w2),'42501','patient account disabled');
 update public.profiles set status='active' where id='b1000000-0000-4000-8000-000000000001';
 perform pg_temp.assert_true(pg_temp.lab_state(x)='requested' and (select count(*)=0 from public.booking_assignments where booking_id=x),'parity refusals wrote nothing');
end $$;

-- 8. Custody overdue (E14): W1 holds a collected sample past end_at + after buffer. The
-- shared reservation guard refuses W1 for any new booking with 55000 resource_busy.
do $$ declare held uuid; x uuid; m text; begin
 held:=pg_temp.lab_collected('c6000000-0000-4000-8000-000000000001',now()-interval '10 minutes',9);
 perform pg_temp.p5_shift(held,now()-interval '3 hours');
 perform pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'W1 busy with overdue custody');
 x:=pg_temp.lab_create(pg_temp.p5_at(10));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 begin perform pg_temp.lab_accept(x,'c6000000-0000-4000-8000-000000000001'); exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='resource_busy','custody overdue refuses W1: '||coalesce(m,'accepted'));
 perform pg_temp.lab_step(held,'c1000000-0000-4000-8000-000000000002','handed_over');
 perform pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'handoff clears busy');
 perform pg_temp.lab_accept(x,'c6000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(pg_temp.lab_state(x)='confirmed','W1 accepted after handoff');
end $$;

-- 6. Offer and schedule changes after create: 40001. Last, because closing a price is permanent.
do $$ declare x uuid; begin
 x:=pg_temp.lab_create(pg_temp.p5_at(11));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 insert into public.availability_exceptions(provider_id,resource_id,period,reason)
  select pg_temp.p5_provider('lab'),'c6000000-0000-4000-8000-000000000002',tstzrange(start_at+interval '45 minutes',start_at+interval '60 minutes','[)'),'unavailable'
  from public.bookings where id=x;
 perform pg_temp.expect_state(pg_temp.accept_sql(x,'c6000000-0000-4000-8000-000000000002'),'40001','blackout inside the after buffer: schedule_changed');
 update public.provider_service_areas set status='revoked' where provider_id=pg_temp.p5_provider('lab');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,'c6000000-0000-4000-8000-000000000001'),'40001','coverage revoked: offer_changed');
 update public.provider_service_areas set status='approved' where provider_id=pg_temp.p5_provider('lab');
 update public.services set status='archived' where id=pg_temp.p5_service('lab');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,'c6000000-0000-4000-8000-000000000001'),'40001','service archived: offer_changed');
 update public.services set status='published' where id=pg_temp.p5_service('lab');
 update public.service_price_versions set effective_to=clock_timestamp() where service_id=pg_temp.p5_service('lab');
 perform pg_temp.expect_state(pg_temp.accept_sql(x,'c6000000-0000-4000-8000-000000000001'),'40001','price closed: offer_changed');
 perform pg_temp.assert_true(pg_temp.lab_state(x)='requested','offer changes wrote nothing');
end $$;
\echo 1..1
\echo ok 1 - 042_lab_accept
rollback;
