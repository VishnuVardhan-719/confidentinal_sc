\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
-- Q01 gap tests for already-built B01/I02/C01 code (docs/specs/Q01_coverage_matrix.md section 5).
-- Covers Q01-T01, T02 (sequential replay; the concurrent half is in tests/rls/run_b01_concurrency.py),
-- T03, T04, T05, T06, T07 (snapshot half) and T09. T08 is N/A: no dependent-patient grant RPC exists.
-- SQLSTATE notes where the matrix guessed:
--  T05: every hidden-provider case returns 42501 (matrix allowed 42501 or 55000).
--  T06: no interrupted/needs-reassignment transition exists. The booking stays 'confirmed' and the
--       doctor loses scope. MR-22 (auto-cancel on suspension, review queue on expiry) is an unapproved
--       owner decision, so this is recorded as unbuilt, not as a bug.
--  T07: accept after a price change returns 40001 offer_changed; the snapshot keeps v1.
-- Synthetic data only; everything rolls back.

-- D2: second verified individual doctor with its own resource.
insert into auth.users(id,email) values ('b1000000-0000-4000-8000-000000000006','q01-doctor-two@example.invalid');
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state) values
 ('b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000006','doctor','active','approved');
insert into public.provider_profiles(provider_id,display_name) values ('b3000000-0000-4000-8000-000000000002','Synthetic Q01 doctor two');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at) values
 ('b3100000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000006','registration',
 'b3000000-0000-4000-8000-000000000002/b3100000-0000-4000-8000-000000000002.pdf','application/pdf','verified',now()+interval '1 year');
insert into storage.objects(bucket_id,name) values ('provider-verification','b3000000-0000-4000-8000-000000000002/b3100000-0000-4000-8000-000000000002.pdf');
insert into public.resources(id,kind,person_profile_id) values ('b6000000-0000-4000-8000-000000000002','person','b1000000-0000-4000-8000-000000000006');
select pg_temp.assert_true(public.provider_is_publishable('b3000000-0000-4000-8000-000000000002'),'D2 is a verified publishable doctor');

-- Q01-T01: provider decline.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours',gen_random_uuid()) as t01 \gset
select pg_temp.expect_state(format('select public.decline_booking(%L,2,''other'')',:'t01'),'42501','T01 patient cannot decline');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003"}',true);
select pg_temp.expect_state(format('select public.decline_booking(%L,2,''other'')',:'t01'),'42501','T01 outsider cannot decline');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000006"}',true);
select pg_temp.expect_state(format('select public.decline_booking(%L,2,''other'')',:'t01'),'42501','T01 another verified doctor cannot decline');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.expect_state(format('select public.decline_booking(%L,1,''other'')',:'t01'),'40001','T01 stale decline');
select pg_temp.expect_state(format('select public.decline_booking(%L,2,''patient_request'')',:'t01'),'22023','T01 patient reason rejected on provider decline');
select pg_temp.assert_true(public.decline_booking(:'t01',2,'provider_unavailable')=3,'T01 decline returns next version');
select pg_temp.assert_true(public.get_booking(:'t01')->>'state'='declined','T01 booking declined');
select pg_temp.expect_state(format('select public.accept_booking(%L,3,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'t01'),'55000','T01 declined booking never reopens by accept');
select pg_temp.expect_state(format('select public.decline_booking(%L,3,''other'')',:'t01'),'55000','T01 second decline rejected');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_state(format('select public.cancel_booking(%L,3,''patient_request'')',:'t01'),'55000','T01 declined booking cannot be cancelled');
reset role;
select pg_temp.assert_true((select state='declined' and version=3 from public.bookings where id=:'t01'),'T01 terminal state and version');
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=:'t01'),'T01 decline creates no assignment');
select pg_temp.assert_true((select count(*)=0 from public.resource_reservations r join public.booking_assignments a on a.id=r.assignment_id where a.booking_id=:'t01'),'T01 decline creates no reservation');
select pg_temp.assert_true((select count(*)=1 from public.booking_events where booking_id=:'t01' and to_state='declined'
 and actor_profile_id='b1000000-0000-4000-8000-000000000002' and reason='provider_unavailable' and aggregate_version=3),'T01 one decline event');
select pg_temp.assert_true((select count(*)=2 from public.booking_events where booking_id=:'t01'),'T01 denied calls wrote no events');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'t01' and action='booking.provider_unavailable'),'T01 one decline audit');
select pg_temp.assert_true((select count(*)=2 from public.audit_events where target_id=:'t01'),'T01 denied calls wrote no audit');

-- Q01-T02 (sequential half): the same booking cannot be accepted twice.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '5 days 4 hours',gen_random_uuid()) as t02 \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(public.accept_booking(:'t02',2,array['b6000000-0000-4000-8000-000000000001'::uuid])=4,'T02 first accept confirms');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'t02'),'40001','T02 replayed accept with the old version is stale');
select pg_temp.expect_state(format('select public.accept_booking(%L,4,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'t02'),'55000','T02 accept of a confirmed booking rejected');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.booking_events where booking_id=:'t02' and to_state='accepted'),'T02 one acceptance event');
select pg_temp.assert_true((select count(*)=3 from public.booking_events where booking_id=:'t02'),'T02 replay wrote no event');
select pg_temp.assert_true((select count(*)=1 from public.booking_assignments where booking_id=:'t02'),'T02 one assignment');
select pg_temp.assert_true((select count(*)=1 from public.resource_reservations r join public.booking_assignments a on a.id=r.assignment_id
 where a.booking_id=:'t02' and r.status='active'),'T02 one active reservation');
select pg_temp.assert_true((select count(*)=1 from public.doctor_visits where booking_id=:'t02'),'T02 one doctor visit');

-- B1: confirmed for P1 with D1, moved into the service window for T03, T04 and T06.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '3 days 4 hours',gen_random_uuid()) as b1 \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(public.accept_booking(:'b1',2,array['b6000000-0000-4000-8000-000000000001'::uuid])=4,'B1 confirmed');
reset role;
-- Fixture clock shift only; production commands below run with every guard enabled.
alter table public.bookings disable trigger b01_booking_guard;
update public.bookings set start_at=now()+interval '30 minutes',end_at=now()+interval '60 minutes' where id=:'b1';
alter table public.bookings enable trigger b01_booking_guard;
set local role authenticated;
select pg_temp.assert_true(booking_private.assigned(:'b1','doctor_visit'),'B1 D1 in-window scope');

-- Q01-T03: a different verified doctor cannot act on B1.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000006"}',true);
select pg_temp.assert_true(not booking_private.assigned(:'b1','doctor_visit'),'T03 D2 has no assigned scope');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'b1'),'42501','T03 D2 cannot advance');
select pg_temp.expect_state(format('select public.get_booking(%L)',:'b1'),'P0002','T03 D2 cannot read');
select pg_temp.expect_state(format('select public.cancel_booking(%L,4,''other'')',:'b1'),'42501','T03 D2 cannot cancel');
select pg_temp.assert_true((select count(*)=0 from public.bookings),'T03 D2 sees no booking rows');

-- Q01-T04: the patient cannot mark visit progress.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_state(format('select public.advance_visit(%L,''arrived'',4)',:'b1'),'42501','T04 patient cannot self-mark arrival');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'b1'),'42501','T04 patient cannot mark en route');
reset role;
select pg_temp.assert_true((select b.state='confirmed' and b.version=4 and v.substate='scheduled' from public.bookings b
 join public.doctor_visits v on v.booking_id=b.id where b.id=:'b1'),'T03/T04 B1 unchanged');

-- Q01-T06: provider suspended after confirmation.
update public.providers set status='suspended',verification_state='suspended' where id='b3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(not booking_private.assigned(:'b1','doctor_visit'),'T06 suspension removes assigned scope');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'b1'),'42501','T06 suspended provider doctor cannot advance');
select public.get_booking(:'b1') as t06_suspended \gset
select pg_temp.assert_true(not (:'t06_suspended'::jsonb ?| array['address_snapshot','contact_snapshot','patient_id']),'T06 suspended provider sees no address or contact');
reset role;
-- No MR-22 state exists yet: the booking stays confirmed (see header).
select pg_temp.assert_true((select state='confirmed' and version=4 from public.bookings where id=:'b1'),'T06 suspension leaves booking confirmed (no reassignment state built)');
update public.providers set status='active',verification_state='approved' where id='b3000000-0000-4000-8000-000000000001';

-- Q01-T06: doctor evidence expired after confirmation.
update public.provider_documents set expires_at=now() where id='b3100000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not booking_private.assigned(:'b1','doctor_visit'),'T06 expired evidence removes assigned scope');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'b1'),'42501','T06 expired evidence doctor cannot advance');
select public.get_booking(:'b1') as t06_expired \gset
select pg_temp.assert_true(not (:'t06_expired'::jsonb ?| array['address_snapshot','contact_snapshot','patient_id']),'T06 expired evidence hides address and contact');
reset role;
select pg_temp.assert_true((select state='confirmed' and version=4 from public.bookings where id=:'b1'),'T06 expiry leaves booking confirmed (no review state built)');
update public.provider_documents set expires_at=now()+interval '1 year' where id='b3100000-0000-4000-8000-000000000001';

-- Control: after restoring the provider, D1 can advance, which proves the denials above came from
-- suspension/expiry. The patient still cannot mark arrival once the doctor is en route (T04).
set local role authenticated;
select pg_temp.assert_true(public.advance_visit(:'b1','en_route',4)=5,'T06 control restored doctor advances');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_state(format('select public.advance_visit(%L,''arrived'',5)',:'b1'),'42501','T04 patient cannot mark arrival after en route');
reset role;
select pg_temp.assert_true((select v.substate='en_route' from public.doctor_visits v where v.booking_id=:'b1'),'T04 substate still en route');

-- Q01-T05: direct create_booking_request against a hidden listing.
select count(*) as t05_before from public.bookings \gset
update public.providers set status='suspended',verification_state='suspended' where id='b3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',date_trunc(''day'',now())+interval ''10 days 4 hours'',gen_random_uuid())','42501','T05 suspended provider not requestable');
reset role;
update public.providers set status='active',verification_state='approved' where id='b3000000-0000-4000-8000-000000000001';
update public.provider_documents set expires_at=now() where id='b3100000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',date_trunc(''day'',now())+interval ''10 days 4 hours'',gen_random_uuid())','42501','T05 expired evidence not requestable');
reset role;
update public.provider_documents set expires_at=now()+interval '1 year' where id='b3100000-0000-4000-8000-000000000001';
update public.services set status='archived' where id='b4100000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',date_trunc(''day'',now())+interval ''10 days 4 hours'',gen_random_uuid())','42501','T05 unpublished service not requestable');
reset role;
update public.services set status='published' where id='b4100000-0000-4000-8000-000000000001';
update public.provider_service_areas set status='revoked' where id='b4300000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',date_trunc(''day'',now())+interval ''10 days 4 hours'',gen_random_uuid())','42501','T05 withdrawn coverage not requestable');
reset role;
update public.provider_service_areas set status='approved' where id='b4300000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) from public.bookings)=:t05_before,'T05 denied creates left no booking row');
set local role authenticated;
select pg_temp.assert_true(public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '10 days 4 hours',gen_random_uuid()) is not null,'T05 control restored listing is requestable');
reset role;

-- Q01-T07 (snapshot half): the provider publishes a new price before accepting.
set local role authenticated;
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '4 days 4 hours',gen_random_uuid()) as t07 \gset
reset role;
select version as t07_service_version from public.services where id='b4100000-0000-4000-8000-000000000001' \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select public.publish_price_version('b4100000-0000-4000-8000-000000000001','12345','synthetic-v2',:t07_service_version,gen_random_uuid());
reset role;
select pg_temp.assert_true((select count(*)=1 from public.service_price_versions where service_id='b4100000-0000-4000-8000-000000000001'
 and amount_paise=12345 and effective_to is null),'T07 price v2 is current');
select pg_temp.assert_true((select amount_paise=9999999999 and price_version_id='b4200000-0000-4000-8000-000000000001' from public.bookings where id=:'t07'),'T07 request keeps the v1 snapshot');
set local role authenticated;
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'t07'),'40001','T07 accept after price change refused');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert_true(public.get_booking(:'t07')->>'amount_paise'='9999999999','T07 patient still sees the v1 amount');
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '6 days 4 hours',gen_random_uuid()) as t07_new \gset
select pg_temp.assert_true(public.get_booking(:'t07_new')->>'amount_paise'='12345','T07 a new request snapshots v2');
reset role;
select pg_temp.assert_true((select state='requested' and version=2 and amount_paise=9999999999 from public.bookings where id=:'t07'),'T07 refused accept left the booking unchanged');
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=:'t07'),'T07 refused accept reserved nothing');

-- Q01-T09: org B manager cannot schedule or accept for org A.
insert into public.organizations(id,name) values
 ('b8000000-0000-4000-8000-00000000000a','Synthetic Q01 organization A'),
 ('b8000000-0000-4000-8000-00000000000b','Synthetic Q01 organization B');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('b8000000-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000002','owner','active',now(),array['provider:read','provider:manage','evidence:manage','schedule:manage']),
 ('b8000000-0000-4000-8000-00000000000a','b1000000-0000-4000-8000-000000000005','staff','active',now(),array['provider:read']),
 ('b8000000-0000-4000-8000-00000000000b','b1000000-0000-4000-8000-000000000003','manager','active',now(),array['provider:read','provider:manage','schedule:manage']);
update public.providers set individual_owner_profile_id=null,organization_id='b8000000-0000-4000-8000-00000000000a' where id='b3000000-0000-4000-8000-000000000001';
insert into public.providers(id,organization_id,category) values ('b3000000-0000-4000-8000-000000000003','b8000000-0000-4000-8000-00000000000b','doctor');
insert into public.resources(id,kind,person_profile_id) values ('b6000000-0000-4000-8000-000000000003','person','b1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(public.provider_is_publishable('b3000000-0000-4000-8000-000000000001'),'T09 org A provider publishable');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '9 days 4 hours',gen_random_uuid()) as t09 \gset
reset role;
select count(*) as t09_resources from public.resources \gset
select count(*) as t09_rules from public.availability_rules \gset
select count(*) as t09_exceptions from public.availability_exceptions \gset
select count(*) as t09_res_version from public.resources where id='b6000000-0000-4000-8000-000000000001' and version=1 \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003"}',true);
select pg_temp.assert_true(not booking_private.scheduler('b3000000-0000-4000-8000-000000000001'),'T09 org B manager is not an org A scheduler');
select pg_temp.expect_state('select public.upsert_booking_resource(''b3000000-0000-4000-8000-000000000001'',''vehicle'',null,''Q01ORGBVAN'',0)','42501','T09 org B manager cannot add org A vehicle');
select pg_temp.expect_state('select public.upsert_booking_resource(''b3000000-0000-4000-8000-000000000001'',''person'',''b1000000-0000-4000-8000-000000000003'',null,0)','42501','T09 org B manager cannot add self to org A');
select pg_temp.expect_state('select public.set_booking_availability(''b3000000-0000-4000-8000-000000000001'',''b6000000-0000-4000-8000-000000000001'',1,''09:00'',''10:00'',current_date,current_date+7,0)','42501','T09 org B manager cannot set org A availability');
select pg_temp.expect_state('select public.add_booking_blackout(''b3000000-0000-4000-8000-000000000001'',''b6000000-0000-4000-8000-000000000001'',now()+interval ''20 days'',now()+interval ''20 days 1 hour'',''other'',1)','42501','T09 org B manager cannot black out org A resource');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000003''::uuid])',:'t09'),'42501','T09 org B manager cannot accept org A booking with org B resource');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'t09'),'42501','T09 org B manager cannot accept org A booking with org A resource');
select pg_temp.expect_state(format('select public.get_booking(%L)',:'t09'),'P0002','T09 org B manager cannot read org A booking');
select pg_temp.assert_true((select count(*)=0 from public.availability_rules where provider_id='b3000000-0000-4000-8000-000000000001'),'T09 org B manager cannot read org A schedule');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(booking_private.scheduler('b3000000-0000-4000-8000-000000000001'),'T09 org A owner schedules org A');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000003''::uuid])',:'t09'),'42501','T09 org B resource cannot be reserved for org A booking');
select pg_temp.expect_state('select public.add_booking_blackout(''b3000000-0000-4000-8000-000000000001'',''b6000000-0000-4000-8000-000000000003'',now()+interval ''20 days'',now()+interval ''20 days 1 hour'',''other'',1)','42501','T09 org A scheduler cannot black out org B resource');
reset role;
select pg_temp.assert_true((select count(*) from public.resources)=:t09_resources,'T09 no resource written');
select pg_temp.assert_true((select count(*) from public.availability_rules)=:t09_rules,'T09 no availability written');
select pg_temp.assert_true((select count(*) from public.availability_exceptions)=:t09_exceptions,'T09 no blackout written');
select pg_temp.assert_true((select count(*) from public.resources where id='b6000000-0000-4000-8000-000000000001' and version=1)=:t09_res_version,'T09 org A resource version unchanged');
select pg_temp.assert_true((select state='requested' and version=2 from public.bookings where id=:'t09'),'T09 org A booking still requested');
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=:'t09'),'T09 no assignment written');
select pg_temp.assert_true((select count(*)=0 from public.audit_events where actor_profile_id='b1000000-0000-4000-8000-000000000003' and action like 'booking.%'),'T09 no org B manager audit');

select 'Q01 gap assertions passed; fixtures rolled back' as result;
\echo 1..1
\echo ok 1 - 018_q01_gaps assertions
rollback;
