\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
select pg_temp.assert_true(to_regclass('public.bookings') is not null,'B01 schema exists');
-- B01 FIXTURES START: synthetic only; concurrency runner commits this section in scratch DB.
insert into auth.users(id,email) values
 ('b1000000-0000-4000-8000-000000000001','b01-patient@example.invalid'),
 ('b1000000-0000-4000-8000-000000000002','b01-doctor@example.invalid'),
 ('b1000000-0000-4000-8000-000000000003','b01-outsider@example.invalid'),
 ('b1000000-0000-4000-8000-000000000004','b01-reviewer@example.invalid'),
 ('b1000000-0000-4000-8000-000000000005','b01-staff@example.invalid');
insert into public.patients(id,self_profile_id) values ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001');
insert into public.consent_events(id,actor_profile_id,patient_id,purpose,policy_version,decision) values
 ('b2100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','self_patient_access','synthetic-v1','granted');
insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
 select 'b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',s,
 'b2100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001'
 from unnest(array['booking:read','booking:create','profile:read','profile:write']) s;
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state) values
 ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','doctor','active','approved');
insert into public.provider_profiles(provider_id,display_name) values ('b3000000-0000-4000-8000-000000000001','Synthetic B01 doctor');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at) values
 ('b3100000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','registration',
 'b3000000-0000-4000-8000-000000000001/b3100000-0000-4000-8000-000000000001.pdf','application/pdf','verified',now()+interval '1 year');
insert into storage.objects(bucket_id,name) values ('provider-verification','b3000000-0000-4000-8000-000000000001/b3100000-0000-4000-8000-000000000001.pdf');
insert into public.service_catalog_types(id,code,category,name,unit) values
 ('b4000000-0000-4000-8000-000000000001','b01_synthetic_doctor','doctor','Synthetic visit','visit');
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values
 ('b4100000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','doctor','b4000000-0000-4000-8000-000000000001','Synthetic visit',30,'published');
insert into public.service_price_versions(id,service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from) values
 ('b4200000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',1,9999999999,'visit','synthetic-v1',now()-interval '1 day');
insert into public.pin_directory(pin_code,state,district,city,source_reference) values ('599991','Synthetic','Synthetic','Synthetic','B01 rollback-only');
insert into public.provider_service_areas(id,provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to) values
 ('b4300000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','599991','b1000000-0000-4000-8000-000000000002','approved',
 'b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
insert into public.patient_addresses(id,patient_id,line1,locality,pin_code,contact_name,phone) values
 ('b5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Synthetic exact address','Synthetic','599991','Synthetic patient','+919999999999');
insert into public.resources(id,kind,person_profile_id) values ('b6000000-0000-4000-8000-000000000001','person','b1000000-0000-4000-8000-000000000002');
insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
 select 'b3000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001',d,'00:00','23:59',current_date,current_date+365 from generate_series(0,6) d;
-- B01 FIXTURES END

do $$ declare t text; f record; begin
 foreach t in array array['booking_policy_versions','patient_addresses','bookings','booking_events','booking_transitions','resources','availability_rules','availability_exceptions','booking_assignments','resource_reservations','doctor_visits','notification_outbox'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),t||' RLS');
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),t||' no direct writes');
  perform pg_temp.assert_true(not has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE'),t||' no anon access');
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='booking_private'
 or (n.nspname='identity_private' and p.proname='is_assigned')
 or (n.nspname='public' and p.proname in ('create_booking_request','accept_booking','decline_booking','cancel_booking','advance_visit','request_reschedule','list_slots','get_booking','list_bookings','get_provider_queue','save_patient_address','upsert_booking_resource','set_booking_availability','add_booking_blackout')) loop
  perform pg_temp.assert_true(exists(select 1 from unnest(f.proconfig) x where x in ('search_path=""','search_path=')),f.proname||' empty search path');
  perform pg_temp.assert_true(not has_function_privilege('anon',f.oid,'EXECUTE'),f.proname||' no guest execution');
 end loop;
 perform pg_temp.assert_true((select count(*)=0 from public.booking_transitions where from_state in ('completed','cancelled','declined','expired','no_show','interrupted')),'terminal states never reopen');
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours','b7000000-0000-4000-8000-000000000001') as booking \gset
select pg_temp.assert_true((public.get_booking(:'booking')->>'amount_paise')='9999999999','authoritative bigint price');
select pg_temp.assert_true(public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours','b7000000-0000-4000-8000-000000000001')=:'booking'::uuid,'identical create replay');
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',date_trunc(''day'',now())+interval ''3 days 4 hours'',''b7000000-0000-4000-8000-000000000001'')','40001','key payload mismatch');
select pg_temp.expect_state(format('update public.bookings set amount_paise=1 where id=%L',:'booking'),'42501','direct price tampering denied');
select pg_temp.expect_state(format('select public.cancel_booking(%L,1,''other'')',:'booking'),'40001','stale cancellation');
select pg_temp.expect_state(format('select public.request_reschedule(%L,2,now()+interval ''4 days'',''b7000000-0000-4000-8000-000000000099'')',:'booking'),'55000','reschedule policy absent');
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',''-infinity'',''b7000000-0000-4000-8000-000000000098'')','22023','finite future time');
select public.save_patient_address('b2000000-0000-4000-8000-000000000001','Synthetic far address','Synthetic','599992','Synthetic patient','+919999999999',0) as far_address \gset
select pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,now()+interval ''4 days'',%L)','b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001',:'far_address','b7000000-0000-4000-8000-000000000096'),'42501','uncovered PIN denied');
select pg_temp.assert_true((select count(*)=1 from public.bookings),'denied create left no row');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003"}',true);
select pg_temp.assert_true((select count(*)=0 from public.bookings),'foreign patient RLS');
select pg_temp.expect_state(format('select public.get_booking(%L)',:'booking'),'P0002','foreign detail hidden');
select pg_temp.expect_state('select public.create_booking_request(''b2000000-0000-4000-8000-000000000001'',''b4100000-0000-4000-8000-000000000001'',''b5000000-0000-4000-8000-000000000001'',now()+interval ''4 days'',''b7000000-0000-4000-8000-000000000097'')','42501','foreign recipient denied');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'booking'),'42501','foreign accept denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true(not (public.get_booking(:'booking') ? 'address_snapshot'),'queue hides exact address');
select pg_temp.assert_true(not (public.get_booking(:'booking') ? 'patient_id'),'queue hides patient identity');
select pg_temp.assert_true((select count(*)=0 from public.bookings),'provider cannot bypass queue projection');
select pg_temp.expect_state(format('select public.advance_visit(%L,''arrived'',2)',:'booking'),'42501','unaccepted assignment denied');
select public.accept_booking(:'booking',2,array['b6000000-0000-4000-8000-000000000001'::uuid]);
select pg_temp.assert_true(public.get_booking(:'booking')->>'state'='confirmed','atomic confirmation');
select pg_temp.assert_true(not booking_private.assigned(:'booking','doctor_visit'),'future assignment denied');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'booking'),'42501','early visit denied');
select pg_temp.assert_true(not (public.get_booking(:'booking') ? 'address_snapshot'),'future scheduler contacts hidden');
reset role;
-- Fixture clock shift only; production commands below run with every guard enabled.
alter table public.bookings disable trigger b01_booking_guard;
update public.bookings set start_at=now()+interval '30 minutes',end_at=now()+interval '60 minutes' where id=:'booking';
alter table public.bookings enable trigger b01_booking_guard;
set local role authenticated;
select pg_temp.assert_true(booking_private.assigned(:'booking','doctor_visit'),'in-window assigned predicate');
select pg_temp.assert_true(public.get_booking(:'booking') ? 'address_snapshot','in-window contacts visible');
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_completed'',4)',:'booking'),'55000','substate skip denied');
select public.advance_visit(:'booking','en_route',4);
select public.advance_visit(:'booking','arrived',5);
-- P5 DC02: the visit starts only after the doctor verifies the code the patient issues.
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.issue_arrival_code(:'booking')->>'code' as arrival_code \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.assert_true((public.verify_arrival_code(:'booking',:'arrival_code',6)->>'version')::int=7,'arrival verified');
select public.advance_visit(:'booking','service_started',7);
select public.advance_visit(:'booking','service_completed',8);
select pg_temp.assert_true(not booking_private.assigned(:'booking','doctor_visit'),'completed assignment loses operational scope');
select pg_temp.assert_true(not (public.get_booking(:'booking') ? 'address_snapshot'),'completed provider detail hides address');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',9)',:'booking'),'42501','completed cannot reopen');
reset role;
select pg_temp.expect_state(format('update public.bookings set amount_paise=1 where id=%L',:'booking'),'55000','snapshot trigger blocks trusted mutation');
select pg_temp.expect_state(format('delete from public.booking_events where booking_id=%L',:'booking'),'55000','events immutable even for owner');
select pg_temp.assert_true((select count(*)=0 from public.resource_reservations where status='active'),'completion releases reservations');
select pg_temp.assert_true((select count(*)=8 from public.booking_events where booking_id=:'booking'),'complete state/substate trail');
select pg_temp.assert_true((select count(*)=8 from public.audit_events where target_id=:'booking' and action<>'booking.arrival_code_issued'),'one audit per transition');
select pg_temp.assert_true((select count(*)=0 from public.notification_outbox where payload::text like '%Synthetic%'),'outbox contains no contact data');
select 'B01 booking assertions passed; fixtures rolled back' as result;
\echo 1..1
\echo ok 1 - 005_b01_booking assertions
rollback;
