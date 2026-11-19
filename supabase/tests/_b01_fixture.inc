-- Synthetic rollback-only B01 fixtures.
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
-- P5 shared engine (20261117001550) seeds every gate off (OD-5); built suites run with them on.
update booking_private.feature_gates set state='on';
