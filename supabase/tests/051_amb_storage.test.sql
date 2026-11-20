\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5a_fixture.inc
-- P5 ambulance vehicle evidence in Storage (design §5.4, test plan 031; migration 20261117001810).
-- The shared restrictive guard is not extended by a category block (contract §1 rule 1),
-- so this suite checks the predicate directly and asserts that, until the shared fix
-- lands, the authenticated Storage path fails closed. Authored, DB NOT EXECUTED.

select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.register_ambulance_vehicle(pg_temp.amb_provider(),'a6000000-0000-4000-8000-000000000002','basic',array['seated'],0);
select public.add_vehicle_document('a6000000-0000-4000-8000-000000000002','insurance','application/pdf',now()+interval '1 year',1) as doc \gset
select (:'doc'::jsonb)->>'object_name' as obj, (:'doc'::jsonb)->>'id' as doc_id \gset

-- 031-1 upload: the uploading evidence editor of a pending document in a draft case.
select pg_temp.assert_true(ambulance_private.vehicle_object_access('provider-verification',:'obj',true),'editor may write the reserved object');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('other-bucket',:'obj',true),'other bucket refused');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification','vehicle/a6000000-0000-4000-8000-000000000002/unknown.pdf',true),'unreserved name refused');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',true),'staff without evidence:manage refused');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',true),'other operator refused');

-- 031-1 read-back only while Storage runs the upload operation; never a download.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'owner download without a ticket refused');
select set_config('storage.operation','storage.object.upload',true);
select pg_temp.assert_true(ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'upload read-back allowed');
select set_config('storage.operation','storage.object.download',true);
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'download operation is not a read-back');
select set_config('storage.operation','',true);

-- Bytes land (owner context, see the fixture header), then the rest of the case.
insert into storage.objects(bucket_id,name) values ('provider-verification',:'obj');
do $$ declare d jsonb; ver integer:=2; k text; begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 foreach k in array array['registration_certificate','fitness_certificate','permit'] loop
  d:=public.add_vehicle_document('a6000000-0000-4000-8000-000000000002',k,'application/pdf',now()+interval '1 year',ver);
  ver:=(d->>'version')::integer;
  insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 end loop;
 perform public.submit_vehicle_case('a6000000-0000-4000-8000-000000000002',ver);
end $$;
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',true),'no writes once the case is submitted');

-- 031-2 download needs a live ticket whose rule still holds at read time.
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'reader without a ticket refused');
select bucket,object_path from public.authorize_vehicle_document_read(:'doc_id','admin_review') \gset
select pg_temp.assert_true(:'bucket'='provider-verification' and :'object_path'=:'obj','ticket names the object');
select pg_temp.assert_true(ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'live ticket reads');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'ticket is personal');
-- Capability revoked after issue: the ticket no longer reads.
update public.admin_capabilities set revoked_at=now() where profile_id='a1000000-0000-4000-8000-000000000001' and capability='provider:document_read';
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'revoked reader refused despite a ticket');
update public.admin_capabilities set revoked_at=null where profile_id='a1000000-0000-4000-8000-000000000001' and capability='provider:document_read';
-- Expired ticket: only an owner-context row can be old; the predicate ignores it.
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('a1000000-0000-4000-8000-000000000004','provider:document_read','global','b1000000-0000-4000-8000-000000000004');
insert into ambulance_private.vehicle_document_read_tickets(document_id,object_name,grantee_profile_id,purpose,created_at,expires_at)
 values (:'doc_id',:'obj','a1000000-0000-4000-8000-000000000004','admin_review',now()-interval '2 minutes',now()-interval '1 minute');
select pg_temp.as_user('a1000000-0000-4000-8000-000000000004');
select pg_temp.assert_true(not ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'expired ticket refused');
-- Owner view tickets for the evidence editor.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)=1 from public.authorize_vehicle_document_read(:'doc_id','owner_view')),'owner view ticket issued');
select pg_temp.assert_true(ambulance_private.vehicle_object_access('provider-verification',:'obj',false),'owner reads with a ticket');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select * from public.authorize_vehicle_document_read(%L,''owner_view'')',:'doc_id'),'42501','staff cannot take an owner view ticket');

-- 031-3 built provider and staff paths are untouched; this file adds two permissive policies only.
select pg_temp.assert_true((select count(*)=2 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'amb\_%'
 and permissive='PERMISSIVE'),'two permissive ambulance policies');
select pg_temp.assert_true((select qual not like '%vehicle_object_access%' and with_check not like '%vehicle_object_access%' from pg_policies
 where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard'),'shared guard unchanged by the ambulance block');
select pg_temp.assert_true((select qual like '%staff_document_upload%' from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard'),'Q06 read-back clause still present');
-- Until the shared guard admits vehicle objects, the authenticated path fails closed.
select pg_temp.as_user('a1000000-0000-4000-8000-000000000002');
select public.register_ambulance_vehicle('a3000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003','basic',array['seated'],0);
select (public.add_vehicle_document('a6000000-0000-4000-8000-000000000003','insurance','application/pdf',now()+interval '1 year',1))->>'object_name' as io_obj \gset
select pg_temp.assert_true(ambulance_private.vehicle_object_access('provider-verification',:'io_obj',true),'predicate admits the reserved upload');
select set_config('p5a.io_obj',:'io_obj',true);
set local role authenticated;
do $$ begin
 insert into storage.objects(bucket_id,name) values ('provider-verification',current_setting('p5a.io_obj'));
 raise exception 'FAIL: restrictive guard admitted a vehicle object before the shared fix';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo 1..1
\echo ok 1 - 051_amb_storage
rollback;
