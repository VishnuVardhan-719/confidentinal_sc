\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc

reset role;
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state)
 values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000002','lab','active','approved') returning id as provider \gset
insert into public.provider_profiles(provider_id,display_name) values(:'provider','Synthetic lab');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
 select doc_id,:'provider','b1000000-0000-4000-8000-000000000002',providers_private.required_kind('lab'),:'provider'||'/'||doc_id::text||'.pdf','application/pdf','verified',now()+interval '1 year' from (select gen_random_uuid() as doc_id) d;
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where provider_id=:'provider';
insert into public.service_catalog_types(id,code,category,name,unit) values(gen_random_uuid(),'b01_lab','lab','Synthetic lab','visit') returning id as catalog_type \gset
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values(gen_random_uuid(),:'provider','lab',:'catalog_type','Synthetic lab',30,'published') returning id as service \gset
insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
 values(:'service',:'catalog_type',1,10000,'visit','synthetic-v1',now()-interval '1 day');
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to)
 values(:'provider','599991','b1000000-0000-4000-8000-000000000002','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'service','b5000000-0000-4000-8000-000000000001',now()+interval '2 days',gen_random_uuid()) as booking \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'booking'),'55000','lab acceptance deferred');
select pg_temp.assert_true(public.get_booking(:'booking')->>'state'='requested','lab remains requested');

reset role;
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state)
 values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000002','caretaker','active','approved') returning id as provider \gset
insert into public.provider_profiles(provider_id,display_name) values(:'provider','Synthetic caretaker');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
 select doc_id,:'provider','b1000000-0000-4000-8000-000000000002',providers_private.required_kind('caretaker'),:'provider'||'/'||doc_id::text||'.pdf','application/pdf','verified',now()+interval '1 year' from (select gen_random_uuid() as doc_id) d;
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where provider_id=:'provider';
insert into public.service_catalog_types(id,code,category,name,unit) values(gen_random_uuid(),'b01_caretaker','caretaker','Synthetic caretaker','visit') returning id as catalog_type \gset
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values(gen_random_uuid(),:'provider','caretaker',:'catalog_type','Synthetic caretaker',30,'published') returning id as service \gset
insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
 values(:'service',:'catalog_type',1,10000,'visit','synthetic-v1',now()-interval '1 day');
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to)
 values(:'provider','599991','b1000000-0000-4000-8000-000000000002','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'service','b5000000-0000-4000-8000-000000000001',now()+interval '2 days',gen_random_uuid()) as booking \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'booking'),'55000','caretaker acceptance deferred');
select pg_temp.assert_true(public.get_booking(:'booking')->>'state'='requested','caretaker remains requested');

reset role;
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state)
 values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000002','ambulance','active','approved') returning id as provider \gset
insert into public.provider_profiles(provider_id,display_name) values(:'provider','Synthetic ambulance');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
 select doc_id,:'provider','b1000000-0000-4000-8000-000000000002',providers_private.required_kind('ambulance'),:'provider'||'/'||doc_id::text||'.pdf','application/pdf','verified',now()+interval '1 year' from (select gen_random_uuid() as doc_id) d;
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where provider_id=:'provider';
insert into public.service_catalog_types(id,code,category,name,unit) values(gen_random_uuid(),'b01_ambulance','ambulance','Synthetic ambulance','visit') returning id as catalog_type \gset
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values(gen_random_uuid(),:'provider','ambulance',:'catalog_type','Synthetic ambulance',30,'published') returning id as service \gset
insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
 values(:'service',:'catalog_type',1,10000,'visit','synthetic-v1',now()-interval '1 day');
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to)
 values(:'provider','599991','b1000000-0000-4000-8000-000000000002','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'service','b5000000-0000-4000-8000-000000000001',now()+interval '2 days',gen_random_uuid()) as booking \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'booking'),'55000','ambulance acceptance deferred');
select pg_temp.assert_true(public.get_booking(:'booking')->>'state'='requested','ambulance remains requested');
reset role;
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments),'no deferred assignments');
\echo 1..1
\echo ok 1 - b01_categories
rollback;
