\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5a_fixture.inc
-- P5 ambulance fleet (design §5.3-§5.5, §7.1, test plan 030; migration 20261117001800).
-- Authored, DB NOT EXECUTED.

-- Fixture result: both vehicles approved through the public path, both drivers rostered.
select pg_temp.assert_true((select count(*)=2 from public.ambulance_vehicles where provider_id=pg_temp.amb_provider() and case_state='approved'),'fixture vehicles approved');
select pg_temp.assert_true((select verified_until=(select min(expires_at) from public.vehicle_credential_documents d where d.vehicle_resource_id=v.resource_id)
 from public.ambulance_vehicles v where resource_id='c6000000-0000-4000-8000-000000000003'),'verified_until is the earliest document expiry');
select pg_temp.assert_true(ambulance_private.vehicle_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000003','stretcher',now()+interval '1 day')
 and not ambulance_private.vehicle_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000004','stretcher',now()+interval '1 day')
 and ambulance_private.vehicle_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000004','seated',now()+interval '1 day'),'requirement follows supports');
select pg_temp.assert_true(not ambulance_private.vehicle_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000003','seated',now()+interval '2 years'),'papers expiring before until block');

-- 030-1 registration rejections.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''c6000000-0000-4000-8000-000000000001'',''basic'',array[''seated''],0)',pg_temp.amb_provider()),'42501','person resource refused');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000001'',''basic'',array[''seated''],0)',pg_temp.amb_provider()),'42501','other organisation vehicle refused');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000002'',''basic'',array[''seated''],0)',pg_temp.p5_provider('lab')),'42501','non-ambulance provider refused');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000002'',''basic'',array[]::text[],0)',pg_temp.amb_provider()),'22023','empty supports refused');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000002'',''basic'',array[''hover''],0)',pg_temp.amb_provider()),'22023','unknown requirement refused');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000002'',''basic'',array[''seated'',''seated''],0)',pg_temp.amb_provider()),'22023','duplicate requirement refused');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000002'',''als'',array[''seated''],0)',pg_temp.amb_provider()),'22023','unknown type refused');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state('select public.register_ambulance_vehicle(''a3000000-0000-4000-8000-000000000001'',''a6000000-0000-4000-8000-000000000003'',''patient_transfer'',array[''seated''],0)','22023','type outside the operator fleet_types refused');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000002'',''basic'',array[''seated''],0)',pg_temp.amb_provider()),'42501','staff without provider:manage refused');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.register_ambulance_vehicle(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000002','basic',array['seated','wheelchair'],0) as nv \gset
select pg_temp.assert_true(:nv=1 and (select case_state='draft' from public.ambulance_vehicles where resource_id='a6000000-0000-4000-8000-000000000002'),'vehicle registered in draft');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''a6000000-0000-4000-8000-000000000002'',''basic'',array[''seated''],0)',pg_temp.amb_provider()),'40001','second insert is stale');
select pg_temp.assert_true(public.register_ambulance_vehicle(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000002','patient_transfer',array['stretcher'],1)=2,'draft edit bumps version');
select pg_temp.expect_state(format('select public.register_ambulance_vehicle(%L,''c6000000-0000-4000-8000-000000000003'',''basic'',array[''seated''],%s)',pg_temp.amb_provider(),
 (select version from public.ambulance_vehicles where resource_id='c6000000-0000-4000-8000-000000000003')),'55000','approved vehicle cannot be edited');

-- 030-2 submission needs every kind, unexpired, with bytes.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state('select public.add_vehicle_document(''a6000000-0000-4000-8000-000000000002'',''insurance'',''application/pdf'',now()+interval ''1 year'',2)','42501','non-editor cannot add a document');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state('select public.add_vehicle_document(''a6000000-0000-4000-8000-000000000002'',''insurance'',''application/pdf'',now()+interval ''6 years'',2)','22023','expiry beyond five years refused');
select pg_temp.expect_state('select public.add_vehicle_document(''a6000000-0000-4000-8000-000000000002'',''puc'',''application/pdf'',now()+interval ''1 year'',2)','22023','unknown kind refused');
select pg_temp.expect_state('select public.add_vehicle_document(''a6000000-0000-4000-8000-000000000002'',''insurance'',''text/plain'',now()+interval ''1 year'',2)','22023','content type refused');
do $$ declare d jsonb; ver integer:=2; k text; begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 foreach k in array array['registration_certificate','fitness_certificate','permit'] loop
  d:=public.add_vehicle_document('a6000000-0000-4000-8000-000000000002',k,'application/pdf',now()+interval '1 year',ver);
  ver:=(d->>'version')::integer;
  perform pg_temp.assert_true(d->>'object_name'='vehicle/a6000000-0000-4000-8000-000000000002/'||(d->>'id')||'.pdf' and d->>'bucket_id'='provider-verification','object name scoped to the vehicle');
  insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 end loop;
 perform pg_temp.expect_state(format('select public.submit_vehicle_case(''a6000000-0000-4000-8000-000000000002'',%s)',ver),'55000','missing kind blocks submission');
 d:=public.add_vehicle_document('a6000000-0000-4000-8000-000000000002','insurance','application/pdf',now()+interval '1 year',ver);
 ver:=(d->>'version')::integer;
 perform pg_temp.expect_state(format('select public.submit_vehicle_case(''a6000000-0000-4000-8000-000000000002'',%s)',ver),'55000','document without bytes blocks submission');
 insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 alter table public.vehicle_credential_documents disable trigger amb_document_guard;
 update public.vehicle_credential_documents set expires_at=now()-interval '1 second' where id=(d->>'id')::uuid;
 alter table public.vehicle_credential_documents enable trigger amb_document_guard;
 perform pg_temp.expect_state(format('select public.submit_vehicle_case(''a6000000-0000-4000-8000-000000000002'',%s)',ver),'55000','expired document blocks submission');
 -- A replacement supersedes the pending document of the same kind.
 d:=public.add_vehicle_document('a6000000-0000-4000-8000-000000000002','insurance','image/png',now()+interval '1 year',ver);
 ver:=(d->>'version')::integer;
 insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 perform pg_temp.assert_true((select count(*)=1 from public.vehicle_credential_documents where vehicle_resource_id='a6000000-0000-4000-8000-000000000002' and kind='insurance' and status='pending'),'one pending document per kind');
 perform pg_temp.assert_true(public.submit_vehicle_case('a6000000-0000-4000-8000-000000000002',ver)=ver+1,'complete case submits');
end $$;
select pg_temp.assert_true((select case_state='submitted' and submitted_at is not null from public.ambulance_vehicles where resource_id='a6000000-0000-4000-8000-000000000002'),'case submitted');
select pg_temp.expect_state(format('select public.add_vehicle_document(''a6000000-0000-4000-8000-000000000002'',''insurance'',''application/pdf'',now()+interval ''1 year'',%s)',
 (select version from public.ambulance_vehicles where resource_id='a6000000-0000-4000-8000-000000000002')),'55000','submitted case takes no documents');

-- 030-3 review denials. 030-4 approval needs a post-submission admin_review ticket per document.
select version as av from public.ambulance_vehicles where resource_id='a6000000-0000-4000-8000-000000000002' \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'',''Synthetic'',%s)',:av),'55000','approval without read tickets refused');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state('select * from public.authorize_vehicle_document_read((select id from public.vehicle_credential_documents where vehicle_resource_id=''a6000000-0000-4000-8000-000000000002'' and status=''pending'' limit 1),''admin_review'')','42501','owner cannot take an admin_review ticket');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
select pg_temp.expect_state('select * from public.authorize_vehicle_document_read((select id from public.vehicle_credential_documents where vehicle_resource_id=''a6000000-0000-4000-8000-000000000002'' and status=''pending'' limit 1),''admin_review'')','42501','verifier without document_read cannot take a ticket');
do $$ declare x uuid; begin
 perform pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
 for x in select id from public.vehicle_credential_documents where vehicle_resource_id='a6000000-0000-4000-8000-000000000002' and status='pending' order by id loop
  perform 1 from public.authorize_vehicle_document_read(x,'admin_review');
 end loop;
end $$;
select pg_temp.assert_true((select count(*)=4 from public.audit_events where actor_profile_id='a1000000-0000-4000-8000-000000000001'
 and action='ambulance.vehicle_document_read_admin_review' and target_id in(select id from public.vehicle_credential_documents where vehicle_resource_id='a6000000-0000-4000-8000-000000000002')),'four audited tickets');
select pg_temp.assert_true((select bool_and(expires_at=created_at+interval '60 seconds') from ambulance_private.vehicle_document_read_tickets
 where document_id in(select id from public.vehicle_credential_documents where vehicle_resource_id='a6000000-0000-4000-8000-000000000002')),'tickets live 60 seconds');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('c1000000-0000-4000-8000-000000000001','provider:verify','global','b1000000-0000-4000-8000-000000000004');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'',''Synthetic'',%s)',:av),'42501','owner, member and uploader cannot review');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000005');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'',''Synthetic'',%s)',:av),'42501','disabled member cannot review');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'',''Synthetic'',%s)',:av),'42501','document reader without provider:verify cannot decide');
select set_config('request.jwt.claims',json_build_object('sub','c1000000-0000-4000-8000-000000000004','aal','aal1')::text,true);
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'',''Synthetic'',%s)',:av),'42501','verifier without AAL2 refused');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'','''',%s)',:av),'22023','empty reason refused');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'',''Synthetic'',%s)',:av+5),'40001','stale review refused');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''suspended'',''Synthetic'',%s)',:av),'42501','suspension needs provider:suspend');
select pg_temp.assert_true(public.review_vehicle_case('a6000000-0000-4000-8000-000000000002','rejected','Synthetic papers unreadable',:av)=:av+1,'verifier rejects');
select pg_temp.assert_true((select count(*)=0 from public.vehicle_credential_documents where vehicle_resource_id='a6000000-0000-4000-8000-000000000002' and status='pending'),'rejection rejects pending documents');
select pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000002'',''approved'',''Synthetic'',%s)',:av+1),'55000','rejected case cannot be approved');

-- Individual owner exclusion: IO holds provider:verify but owns the vehicle.
do $$ declare d jsonb; ver integer; k text; begin
 perform pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
 ver:=public.register_ambulance_vehicle('a3000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003','basic',array['seated'],0);
 foreach k in array ambulance_private.required_vehicle_kinds() loop
  d:=public.add_vehicle_document('a6000000-0000-4000-8000-000000000003',k,'application/pdf',now()+interval '1 year',ver);
  ver:=(d->>'version')::integer;
  insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 end loop;
 ver:=public.submit_vehicle_case('a6000000-0000-4000-8000-000000000003',ver);
 perform pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
 perform public.authorize_vehicle_document_read(x.id,'admin_review') from public.vehicle_credential_documents x where x.vehicle_resource_id='a6000000-0000-4000-8000-000000000003' and x.status='pending';
 perform pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
 perform pg_temp.expect_state(format('select public.review_vehicle_case(''a6000000-0000-4000-8000-000000000003'',''approved'',''Synthetic'',%s)',ver),'42501','individual owner cannot review');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 perform pg_temp.assert_true(public.review_vehicle_case('a6000000-0000-4000-8000-000000000003','approved','Synthetic reviewed',ver)=ver+1,'unlinked verifier approves');
end $$;

-- 030-5 eligibility is recomputed from documents, not from case_state or verified_until.
select pg_temp.amb_lapse('c6000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(not ambulance_private.vehicle_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000003','seated',now()+interval '1 day')
 and (select case_state='approved' and verified_until>now() from public.ambulance_vehicles where resource_id='c6000000-0000-4000-8000-000000000003'),'lapsed paper makes an approved vehicle ineligible');
select pg_temp.amb_lapse('c6000000-0000-4000-8000-000000000003',false);
select pg_temp.assert_true(ambulance_private.vehicle_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000003','seated',now()+interval '1 day'),'restored paper restores eligibility');
select pg_temp.expect_state('update public.ambulance_vehicles set vehicle_type=''basic'',version=version+1 where resource_id=''c6000000-0000-4000-8000-000000000003''','55000','guard: approved type immutable');
select pg_temp.expect_state('update public.vehicle_credential_documents set expires_at=now()+interval ''9 years'' where vehicle_resource_id=''c6000000-0000-4000-8000-000000000003''','55000','guard: document expiry immutable');
select pg_temp.expect_state('delete from public.ambulance_vehicles where resource_id=''c6000000-0000-4000-8000-000000000003''','55000','guard: vehicle not deletable');

-- 030-6 driver eligibility.
select pg_temp.assert_true(ambulance_private.driver_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000001',now()+interval '1 day'),'staff with an approved licence case is eligible');
select pg_temp.assert_true(not ambulance_private.driver_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000001',now()+interval '2 years'),'licence expiring before until blocks');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.set_ambulance_driver(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000005','active',0);
select pg_temp.assert_true(not ambulance_private.driver_eligible(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000005',now()+interval '1 day'),'rostered staff without a Q06 case is not eligible');
-- A case holding only vehicle_permit (seeded directly to show it fails; never used to pass).
insert into public.provider_verification_cases(id,provider_id,subject_profile_id,state,verified_until,decided_by_profile_id) values
 ('a7000000-0000-4000-8000-000000000001',pg_temp.amb_provider(),'a1000000-0000-4000-8000-000000000003','approved',now()+interval '1 year','c1000000-0000-4000-8000-000000000004');
insert into public.staff_credential_documents(id,case_id,uploaded_by_profile_id,kind,object_name,content_type,status,expires_at) values
 ('a7100000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','vehicle_permit',
  'staff/a7000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000001.pdf','application/pdf','verified',now()+interval '1 year');
insert into storage.objects(bucket_id,name) values ('provider-verification','staff/a7000000-0000-4000-8000-000000000001/a7100000-0000-4000-8000-000000000001.pdf');
select pg_temp.assert_true(not ambulance_private.driver_eligible(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000005',now()+interval '1 day'),'vehicle_permit staff case is not a driving licence');
update public.provider_verification_cases set state='suspended' where provider_id=pg_temp.amb_provider() and subject_profile_id='c1000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not ambulance_private.driver_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000001',now()+interval '1 day'),'suspended case blocks');
update public.provider_verification_cases set state='approved' where provider_id=pg_temp.amb_provider() and subject_profile_id='c1000000-0000-4000-8000-000000000002';
update public.provider_verification_cases set verified_until=now()-interval '1 second' where provider_id=pg_temp.amb_provider() and subject_profile_id='c1000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not ambulance_private.driver_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000001',now()+interval '1 day'),'expired case blocks');
update public.provider_verification_cases set verified_until=now()+interval '1 year' where provider_id=pg_temp.amb_provider() and subject_profile_id='c1000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not ambulance_private.driver_eligible(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000006',now()+interval '1 day'),'other operator staff, not on the roster, is not eligible');
select pg_temp.expect_state(format('select public.set_ambulance_driver(%L,''a6000000-0000-4000-8000-000000000006'',''active'',0)',pg_temp.amb_provider()),'42501','other operator staff cannot be rostered');
select pg_temp.assert_true(public.set_ambulance_driver(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000002','disabled',1)=2,'roster disable without reservations');
select pg_temp.assert_true(not ambulance_private.driver_eligible(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000002',now()+interval '1 day'),'disabled roster row blocks');
select pg_temp.assert_true(public.set_ambulance_driver(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000002','active',2)=3,'roster re-enable');
-- Individual owner: needs the licence provider document, not a Q06 case.
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select public.set_ambulance_driver('a3000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000004','active',0);
select pg_temp.assert_true(ambulance_private.driver_eligible('a3000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000004',now()+interval '1 day'),'individual owner with a verified licence is eligible');
update public.provider_documents set status='superseded' where id='a3100000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not ambulance_private.driver_eligible('a3000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000004',now()+interval '1 day'),'individual owner without a licence is not eligible');
update public.provider_documents set status='verified' where id='a3100000-0000-4000-8000-000000000002';

-- 030-7 roster disable: refused with a future driver reservation, allowed once only past ones remain.
select pg_temp.amb_trip(pg_temp.p5_at(3),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as t7 \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.set_ambulance_driver(%L,''c6000000-0000-4000-8000-000000000002'',''disabled'',3)',pg_temp.amb_provider()),'40001','future reservation blocks disabling');
select pg_temp.amb_live(:'t7');
select pg_temp.amb_step(:'t7','en_route','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'t7','arrived','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'t7','picked_up','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'t7','destination_reached','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_retire(:'t7',30);
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.set_ambulance_driver(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000002','disabled',3)=4,'past kept reservation does not block disabling');
select public.set_ambulance_driver(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000002','active',4);

-- Suspension needs provider:suspend and makes the vehicle ineligible.
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('c1000000-0000-4000-8000-000000000009','provider:suspend','global','b1000000-0000-4000-8000-000000000004');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
select pg_temp.assert_true(public.review_vehicle_case('a6000000-0000-4000-8000-000000000003','suspended','Synthetic suspension',
 (select version from public.ambulance_vehicles where resource_id='a6000000-0000-4000-8000-000000000003'))>0,'suspender suspends an approved vehicle');
select pg_temp.assert_true(not ambulance_private.vehicle_eligible('a3000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003','seated',now()+interval '1 day'),'suspended vehicle ineligible');

-- get_fleet: operator metadata only.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.get_fleet(pg_temp.amb_provider()) as fleet \gset
select pg_temp.assert_true(jsonb_array_length((:'fleet'::jsonb)->'vehicles')=3 and jsonb_array_length((:'fleet'::jsonb)->'drivers')=3,'fleet lists vehicles and drivers');
select pg_temp.assert_true((select bool_and(pg_temp.keys(v)=pg_temp.sorted(array['case_state','documents','eligible_now','resource_id','supports','vehicle_key','vehicle_type','verified_until','version']))
 from jsonb_array_elements((:'fleet'::jsonb)->'vehicles') v),'vehicle keys exact');
select pg_temp.assert_true((select bool_and(pg_temp.keys(v)=pg_temp.sorted(array['display_name','eligible_now','licence_valid_until','resource_id','status','version']))
 from jsonb_array_elements((:'fleet'::jsonb)->'drivers') v),'driver keys exact');
select pg_temp.assert_true(:'fleet' not like '%object_name%' and :'fleet' not like '%vehicle/%','no object names in the fleet view');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.get_fleet(%L)',pg_temp.amb_provider()),'42501','staff driver cannot read the fleet');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.expect_state(format('select public.get_fleet(%L)',pg_temp.amb_provider()),'42501','other operator cannot read the fleet');

-- 030-8 capability CHECK keeps booking:incident (rebuilt by 001560).
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('a1000000-0000-4000-8000-000000000003','booking:incident','global','b1000000-0000-4000-8000-000000000004');

-- 030-9 privileges and RLS. 030-10 the event ledger is immutable.
do $$ declare t text; r text; begin
 foreach t in array array['public.ambulance_vehicles','public.vehicle_credential_documents','public.vehicle_credential_events',
  'public.ambulance_drivers','ambulance_private.vehicle_document_read_tickets'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.assert_true(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),t||' closed to '||r);
  end loop;
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=t::regclass),t||' has RLS');
 end loop;
 foreach t in array array['public.register_ambulance_vehicle(uuid,uuid,text,text[],integer)','public.add_vehicle_document(uuid,text,text,timestamptz,integer)',
  'public.submit_vehicle_case(uuid,integer)','public.authorize_vehicle_document_read(uuid,text)','public.review_vehicle_case(uuid,text,text,integer)',
  'public.set_ambulance_driver(uuid,uuid,text,integer)','public.get_fleet(uuid)'] loop
  perform pg_temp.assert_true(has_function_privilege('authenticated',t,'EXECUTE') and not has_function_privilege('anon',t,'EXECUTE')
   and not has_function_privilege('service_role',t,'EXECUTE'),t||' authenticated only');
 end loop;
 foreach t in array array['ambulance_private.vehicle_eligible(uuid,uuid,text,timestamptz)','ambulance_private.driver_eligible(uuid,uuid,timestamptz)',
  'ambulance_private.vehicle_evidence_ready(uuid,boolean,timestamptz)','ambulance_private.vehicle_document_read_allowed(uuid,text)',
  'ambulance_private.fleet_manager(uuid)','ambulance_private.evidence_editor(uuid)','ambulance_private.vehicle_event(uuid,text,text)'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.assert_true(not has_function_privilege(r,t,'EXECUTE'),t||' not executable by '||r);
  end loop;
 end loop;
 perform pg_temp.assert_true(not has_schema_privilege('anon','ambulance_private','USAGE') and not has_schema_privilege('service_role','ambulance_private','USAGE'),'private schema closed to anon and service_role');
end $$;
select pg_temp.expect_state('update public.vehicle_credential_events set reason=''x''','55000','events: no update');
select pg_temp.expect_state('delete from public.vehicle_credential_events','55000','events: no delete');
select pg_temp.expect_state('truncate public.vehicle_credential_events','55000','events: no truncate');
select pg_temp.expect_state('delete from ambulance_private.vehicle_document_read_tickets','55000','tickets: no delete');
select pg_temp.assert_true((select count(*)>=6 from public.vehicle_credential_events where vehicle_resource_id='c6000000-0000-4000-8000-000000000003')
 and not exists(select 1 from public.vehicle_credential_events e join public.ambulance_vehicles v on v.resource_id=e.vehicle_resource_id
  where e.aggregate_version>v.version),'one event per vehicle version');
\echo 1..1
\echo ok 1 - 050_amb_fleet
rollback;
