\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5a_fixture.inc
-- P5 ambulance admission: request_transport, accept_transport, list_transport_slots
-- (design §7.2, test plan 032; contract §7.1, §10, §11, §13). Authored, DB NOT EXECUTED.
select public_reference as amb_ref from public.providers where id='c3000000-0000-4000-8000-000000000003' \gset

-- 032-1 generic create, accept and slots refuse ambulance, gate on or off (suite 013 stays valid).
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',%L,''b5000000-0000-4000-8000-000000000001'',%L,gen_random_uuid())',
 pg_temp.amb_service(),pg_temp.p5_at(2)),'55000','generic create refuses ambulance (gate on)');
select pg_temp.amb_request(pg_temp.p5_at(2,1)) as b_gen \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000003'']::uuid[])',:'b_gen'),'55000','generic accept refuses ambulance');
select pg_temp.assert_true((select count(*)=0 from public.list_slots(pg_temp.amb_provider(),pg_temp.amb_service(),(pg_temp.p5_at(2) at time zone 'Asia/Kolkata')::date)),'generic slots empty for ambulance');
update booking_private.feature_gates set state='off' where key='ambulance';
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',%L,''b5000000-0000-4000-8000-000000000001'',%L,gen_random_uuid())',
 pg_temp.amb_service(),pg_temp.p5_at(2)),'55000','generic create refuses ambulance (gate off)');

-- 032-2 admission gate: off and suspended refuse; nothing is written.
select count(*) as nb from public.bookings \gset
select pg_temp.expect_state(format('select pg_temp.amb_request(%L)',pg_temp.p5_at(2,2)),'55000','request refused with the gate off');
select pg_temp.assert_true((select count(*) from public.list_transport_slots(:'amb_ref',pg_temp.amb_service(),(pg_temp.p5_at(2) at time zone 'Asia/Kolkata')::date,'seated'))=0,'slots empty with the gate off');
update booking_private.feature_gates set state='suspended' where key='ambulance';
select pg_temp.expect_state(format('select pg_temp.amb_request(%L)',pg_temp.p5_at(2,2)),'55000','request refused with the gate suspended');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L)',:'b_gen'),'55000','accept refused with the gate suspended');
select pg_temp.assert_true((select count(*) from public.bookings)=:nb and (select count(*) from public.transport_trips)=1,'nothing written while closed');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.assert_true((select count(*)>0 from public.list_transport_slots(:'amb_ref',pg_temp.amb_service(),(pg_temp.p5_at(2) at time zone 'Asia/Kolkata')::date,'seated')),'slots offered with the gate on');
select pg_temp.assert_true((select bool_and(s.start_at>now()+interval '120 minutes' and s.end_at-s.start_at=interval '30 minutes' and s.advisory)
 from public.list_transport_slots(:'amb_ref',pg_temp.amb_service(),(pg_temp.p5_at(2) at time zone 'Asia/Kolkata')::date,'stretcher') s),'slots respect the lead time');
select pg_temp.expect_state(format('select * from public.list_transport_slots(%L,%L,current_date,''hover'')',:'amb_ref',pg_temp.amb_service()),'22023','unknown requirement refused');

-- A request: pickup is the booking snapshot, destination snapshot has exactly three keys.
select pg_temp.assert_true((select substate='requested' and requirement_code='seated' and destination_pin='599991'
 and pg_temp.keys(destination_snapshot)=pg_temp.sorted(array['line1','locality','pin_code']) from public.transport_trips where booking_id=:'b_gen'),'trip row written');
select pg_temp.assert_true((select state='requested' and address_snapshot->>'pin_code'='599991' and category='ambulance' from public.bookings where id=:'b_gen')
 and pg_temp.amb_events(:'b_gen')=1,'booking requested with one event');

-- 032-3 lead time, horizon and duration cap.
select pg_temp.expect_state(format('select pg_temp.amb_request(%L)',now()+interval '119 minutes'),'22023','start inside 120 minutes refused');
select pg_temp.expect_state(format('select pg_temp.amb_request(%L)',now()+interval '31 days'),'22023','start beyond 30 days refused');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.request_transport(''b2000000-0000-4000-8000-000000000001'',''a4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',''a5000000-0000-4000-8000-000000000001'',''seated'',%L,gen_random_uuid())',
 pg_temp.p5_at(2,3)),'42501','service above the duration cap refused');
select pg_temp.expect_state(format('select public.request_transport(''b2000000-0000-4000-8000-000000000001'',%L,''b5000000-0000-4000-8000-000000000001'',''a5000000-0000-4000-8000-000000000001'',''seated'',%L,gen_random_uuid())',
 pg_temp.p5_service('lab'),pg_temp.p5_at(2,3)),'42501','non-ambulance service refused');

-- 032-4 coverage of both ends. 032-5 address ownership.
select pg_temp.expect_state(format('select pg_temp.amb_request(%L,''seated'',''a5000000-0000-4000-8000-000000000002'')',pg_temp.p5_at(2,3)),'42501','uncovered destination refused');
select pg_temp.expect_state(format('select pg_temp.amb_request(%L,''seated'',''a5000000-0000-4000-8000-000000000003'')',pg_temp.p5_at(2,3)),'42501','expired destination coverage refused');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.request_transport(''b2000000-0000-4000-8000-000000000001'',%L,''a5000000-0000-4000-8000-000000000002'',''a5000000-0000-4000-8000-000000000001'',''seated'',%L,gen_random_uuid())',
 pg_temp.amb_service(),pg_temp.p5_at(2,3)),'42501','uncovered pickup refused');
select pg_temp.expect_state(format('select public.request_transport(''b2000000-0000-4000-8000-000000000001'',%L,''b5000000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',''seated'',%L,gen_random_uuid())',
 pg_temp.amb_service(),pg_temp.p5_at(2,3)),'22023','same address twice refused');
select pg_temp.expect_state(format('select pg_temp.amb_request(%L,''seated'',''a5000000-0000-4000-8000-000000000005'')',pg_temp.p5_at(2,3)),'42501','another patient''s destination refused');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.request_transport(''b2000000-0000-4000-8000-000000000001'',%L,''a5000000-0000-4000-8000-000000000005'',''a5000000-0000-4000-8000-000000000001'',''seated'',%L,gen_random_uuid())',
 pg_temp.amb_service(),pg_temp.p5_at(2,3)),'42501','another patient''s pickup refused');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000004');
select pg_temp.expect_state(format('select public.request_transport(''b2000000-0000-4000-8000-000000000001'',%L,''b5000000-0000-4000-8000-000000000001'',''a5000000-0000-4000-8000-000000000001'',''seated'',%L,gen_random_uuid())',
 pg_temp.amb_service(),pg_temp.p5_at(2,3)),'42501','someone else cannot request for the patient');

-- 032-6 no eligible vehicle for the requirement.
select pg_temp.amb_lapse('c6000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_state(format('select pg_temp.amb_request(%L,''stretcher'')',pg_temp.p5_at(2,3)),'55000','requirement_unavailable');
select pg_temp.amb_lapse('c6000000-0000-4000-8000-000000000003',false);

-- 032-7 overlap, replay and the 10-request cap.
select gen_random_uuid() as k1 \gset
select pg_temp.amb_request(pg_temp.p5_at(3),'seated','a5000000-0000-4000-8000-000000000001',:'k1') as r1 \gset
select pg_temp.expect_state(format('select pg_temp.amb_request(%L)',pg_temp.p5_at(3)+interval '15 minutes'),'55000','overlapping request refused');
select pg_temp.amb_request(pg_temp.p5_at(3,1)) as r2 \gset
select pg_temp.assert_true(pg_temp.amb_request(pg_temp.p5_at(3),'seated','a5000000-0000-4000-8000-000000000001',:'k1')=:'r1','same key replays the id');
select pg_temp.expect_state(format('select pg_temp.amb_request(%L,''wheelchair'',''a5000000-0000-4000-8000-000000000001'',%L)',pg_temp.p5_at(3),:'k1'),'40001','same key, other arguments');
do $$ declare d integer; begin
 for d in 4..10 loop perform pg_temp.amb_request(pg_temp.p5_at(d)); end loop;
end $$;
select pg_temp.assert_true((select count(*)=10 from public.bookings where patient_id='b2000000-0000-4000-8000-000000000001' and state='requested'),'ten requests pending');
select count(*) as nb from public.bookings \gset
select pg_temp.expect_state(format('select pg_temp.amb_request(%L)',pg_temp.p5_at(11)),'53300','cap refuses an eleventh request');
update booking_private.feature_gates set state='off' where key='ambulance';
select pg_temp.assert_true(pg_temp.amb_request(pg_temp.p5_at(3),'seated','a5000000-0000-4000-8000-000000000001',:'k1')=:'r1','replay after the cap fills and the gate closes');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.assert_true((select count(*) from public.bookings)=:nb,'replay wrote nothing');
do $$ declare b uuid; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 for b in select id from public.bookings where patient_id='b2000000-0000-4000-8000-000000000001' and state='requested' order by id loop
  perform public.cancel_booking(b,(select version from public.bookings where id=b),'patient_request');
 end loop;
end $$;

-- 032-8 self-dealing: at create, and a driver who is the patient at accept.
select pg_temp.amb_request(pg_temp.p5_at(12)) as pd \gset
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('c8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','staff','active',now(),array['provider:read']);
select pg_temp.expect_state(format('select pg_temp.amb_request(%L)',pg_temp.p5_at(12,2)),'42501','operator member cannot request from the operator');
insert into public.resources(id,kind,person_profile_id) values ('a6000000-0000-4000-8000-000000000007','person','b1000000-0000-4000-8000-000000000001');
insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
 select pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000007',d,'00:00','23:59',current_date-2,current_date+365 from generate_series(0,6) d;
do $$ declare c uuid; d jsonb; begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 c:=public.add_staff_credential_case(pg_temp.amb_provider(),'b1000000-0000-4000-8000-000000000001');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 d:=public.add_staff_credential_document(c,'application/pdf',now()+interval '1 year',1);
 insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 perform public.submit_staff_credential_case(c,2);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 perform public.review_staff_credential_case(c,'approved','Synthetic review',3);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform public.set_ambulance_driver(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000007','active',0);
end $$;
select pg_temp.assert_true(ambulance_private.driver_eligible(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000007',pg_temp.p5_at(13)),'patient-driver is otherwise eligible');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''a6000000-0000-4000-8000-000000000007'')',:'pd'),'42501','the patient is never the driver');
update public.organization_members set status='disabled' where organization_id='c8000000-0000-4000-8000-000000000001' and profile_id='b1000000-0000-4000-8000-000000000001';
select pg_temp.amb_request(pg_temp.p5_at(12,4)) as sd1 \gset

-- 032-9 accept rejections; nothing reserved.
select pg_temp.amb_request(pg_temp.p5_at(13)) as rq \gset
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''a6000000-0000-4000-8000-000000000006'')',:'rq'),'55000','driver of another operator');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000001'',''a6000000-0000-4000-8000-000000000001'')',:'rq'),'55000','vehicle of another operator');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000002'')',:'rq'),'22023','two persons');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000004'',''c6000000-0000-4000-8000-000000000003'')',:'rq'),'22023','two vehicles');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000003'',''c6000000-0000-4000-8000-000000000003'')',:'rq'),'22023','same resource twice');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''a6000000-0000-4000-8000-000000000005'')',:'rq'),'55000','driver off the roster or unverified');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000001'',''a6000000-0000-4000-8000-000000000002'')',:'rq'),'55000','unapproved vehicle');
select pg_temp.amb_request(pg_temp.p5_at(14),'wheelchair') as rqw \gset
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000004'')',:'rqw'),'55000','vehicle without the requirement');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.expect_state(format('select public.accept_transport(%L,2,''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000003'',gen_random_uuid())',:'rq'),'42501','other operator scheduler');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.accept_transport(%L,2,''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000003'',gen_random_uuid())',:'rq'),'42501','patient cannot accept');
select pg_temp.p5_create('doctor',pg_temp.p5_at(13)) as docb \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.accept_transport(%L,2,''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000003'',gen_random_uuid())',
 :'docb'),'P0002','accept_transport refuses a non-ambulance booking');
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id in (:'rq',:'rqw')),'nothing reserved by refused accepts');

-- 032-10 accept lead time and destination coverage at accept.
select pg_temp.amb_request(pg_temp.p5_at(15)) as rqlate \gset
select pg_temp.p5_shift(:'rqlate',now()+interval '59 minutes');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L)',:'rqlate'),'55000','accept inside 60 minutes refused');
select pg_temp.amb_request(pg_temp.p5_at(16),'seated','a5000000-0000-4000-8000-000000000004') as rqdest \gset
update public.provider_service_areas set valid_to=now()-interval '1 second' where provider_id=pg_temp.amb_provider() and pin_code='599994';
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L)',:'rqdest'),'40001','destination coverage revoked since request: offer_changed');

-- 032-11 accept writes two assignments and two buffered reservations; keyed replay.
select gen_random_uuid() as ka \gset
select pg_temp.amb_accept(:'rq','c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003',:'ka') as rq_v \gset
select pg_temp.assert_true(:rq_v=4 and pg_temp.amb_substate(:'rq')='confirmed/assigned','confirmed and assigned');
select pg_temp.assert_true((select array_agg(a.purpose||':'||coalesce(a.assigned_profile_id::text,'-') order by a.purpose)
 =array['driver:c1000000-0000-4000-8000-000000000002','vehicle:-'] from public.booking_assignments a where a.booking_id=:'rq' and a.status='active'),'driver and vehicle assignments');
select pg_temp.assert_true((select count(*)=2 and bool_and(rr.status='active' and rr.occupied_period=tstzrange(b.start_at-interval '30 minutes',b.end_at+interval '30 minutes','[)'))
 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id join public.bookings b on b.id=a.booking_id where b.id=:'rq'),'reservations carry the 30/30 buffers');
select pg_temp.assert_true((select array_agg(reason order by aggregate_version)=array['requested','accepted','confirmed'] from public.booking_events where booking_id=:'rq'),'events requested, accepted, confirmed');
select pg_temp.assert_true((select bool_and(pg_temp.keys(payload)=pg_temp.sorted(array['booking_id','event','version'])) from public.notification_outbox where booking_id=:'rq'),'outbox payload has ids and codes only');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.accept_transport(:'rq',2,'c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003',:'ka')=4 and pg_temp.amb_events(:'rq')=3,'replay with the original arguments returns the version and writes nothing');
select pg_temp.expect_state(format('select public.accept_transport(%L,2,''c6000000-0000-4000-8000-000000000002'',''c6000000-0000-4000-8000-000000000003'',%L)',:'rq',:'ka'),'40001','same key, other driver');
select pg_temp.expect_state(format('select public.accept_transport(%L,2,''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000003'',gen_random_uuid())',:'rq'),'40001','new key after success is stale');

-- 032-12 busy resources: an open interrupted_after_pickup blocks driver and vehicle; an
-- overrunning trip blocks its driver; slots exclude both; ops resolution unblocks.
select pg_temp.amb_live(:'rq');
select pg_temp.amb_step(:'rq','en_route');
select pg_temp.amb_step(:'rq','arrived');
select pg_temp.amb_step(:'rq','picked_up');
select pg_temp.amb_step(:'rq','interrupt','c1000000-0000-4000-8000-000000000002','vehicle_breakdown');
select id as ex1 from public.booking_exceptions where booking_id=:'rq' and kind='interrupted_after_pickup' and status='open' \gset
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000001') and booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'on-board interruption blocks driver and vehicle');
select pg_temp.amb_request(pg_temp.p5_at(17)) as t2 \gset
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000002'',''c6000000-0000-4000-8000-000000000003'')',:'t2'),'55000','blocked vehicle refused: resource_busy');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000001'',''c6000000-0000-4000-8000-000000000004'')',:'t2'),'55000','blocked driver refused: resource_busy');
select pg_temp.assert_true((select count(*) from public.list_transport_slots(:'amb_ref',pg_temp.amb_service(),(pg_temp.p5_at(17) at time zone 'Asia/Kolkata')::date,'stretcher'))=0,'no stretcher slots while V01 is blocked');
select pg_temp.amb_trip(pg_temp.p5_at(18),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as t3 \gset
select pg_temp.p5_shift(:'t3',now()-interval '2 hours');
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000002'),'overrunning trip makes its driver busy');
select pg_temp.assert_true((select count(*) from public.list_transport_slots(:'amb_ref',pg_temp.amb_service(),(pg_temp.p5_at(17) at time zone 'Asia/Kolkata')::date,'seated'))=0,'no slots while every driver is busy');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_resolve_exception(:'ex1',1,'resolved',gen_random_uuid());
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'resolution unblocks the vehicle');
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L,''c6000000-0000-4000-8000-000000000002'',''c6000000-0000-4000-8000-000000000003'')',:'t2'),'55000','overrunning driver refused: resource_busy');
select pg_temp.assert_true(pg_temp.amb_accept(:'t2')=4,'free driver and vehicle accepted');
\echo 1..1
\echo ok 1 - 052_amb_request_accept
rollback;
