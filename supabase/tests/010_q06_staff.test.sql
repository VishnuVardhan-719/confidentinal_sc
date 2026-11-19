\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
insert into public.organizations(id,name) values ('b8000000-0000-4000-8000-000000000001','Synthetic Q06 organization');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','owner','active',now(),array['provider:read','provider:manage','evidence:manage','schedule:manage']),
 ('b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005','staff','active',now(),array['provider:read']);
update public.providers set individual_owner_profile_id=null,organization_id='b8000000-0000-4000-8000-000000000001' where id='b3000000-0000-4000-8000-000000000001';
insert into public.resources(id,kind,person_profile_id) values ('b6000000-0000-4000-8000-000000000005','person','b1000000-0000-4000-8000-000000000005');
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('b1000000-0000-4000-8000-000000000004','provider:verify','org:b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'),
 ('b1000000-0000-4000-8000-000000000005','provider:verify','global','b1000000-0000-4000-8000-000000000002'),
 ('b1000000-0000-4000-8000-000000000003','provider:verify','org:b8000000-0000-4000-8000-000000000099','b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.provider_is_publishable('b3000000-0000-4000-8000-000000000001'),'organization approved');
select pg_temp.assert_true(not booking_private.resource_eligible('b3000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000005'),'provider read scope cannot verify clinician');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select public.add_staff_credential_case('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005') as staff_case \gset
select pg_temp.expect_state(format('update public.provider_verification_cases set state=''approved'' where id=%L',:'staff_case'),'42501','direct approval denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000005","aal":"aal2"}',true);
select public.add_staff_credential_document(:'staff_case','application/pdf',now()+interval '1 year',1) as document \gset
select pg_temp.expect_state(format('select public.submit_staff_credential_case(%L,2)',:'staff_case'),'55000','bytes required');
-- 20261117001400 (M1): the uploader's own pending object is read back only while Storage
-- runs the upload; no other read path to staff evidence exists.
select pg_temp.expect_state(format('insert into storage.objects(bucket_id,name) values (%L,%L) returning id',:'document'::jsonb->>'bucket_id',:'document'::jsonb->>'object_name'),'42501','staff read-back outside the upload operation denied');
select set_config('storage.operation','storage.object.upload',true);
insert into storage.objects(bucket_id,name) values (:'document'::jsonb->>'bucket_id',:'document'::jsonb->>'object_name') returning id as staff_object \gset
select pg_temp.assert_true((select count(*)=1 from storage.objects where id=:'staff_object'),'staff upload with RETURNING read-back allowed');
select set_config('storage.operation','storage.object.get_authenticated',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'staff evidence private without read authorization');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select set_config('storage.operation','storage.object.upload',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'org owner gets no read-back of staff evidence');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000005","aal":"aal2"}',true);
select set_config('storage.operation','',true);
select pg_temp.expect_state('select object_name from public.staff_credential_documents','42501','raw object paths hidden');
select public.submit_staff_credential_case(:'staff_case',2);
select set_config('storage.operation','storage.object.upload',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'staff read-back ends once the case is submitted');
select set_config('storage.operation','',true);
select pg_temp.expect_state(format('select public.review_staff_credential_case(%L,''approved'',''Synthetic review'',3)',:'staff_case'),'42501','self review denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from public.provider_verification_cases),'foreign case invisible');
select pg_temp.expect_state(format('select public.review_staff_credential_case(%L,''approved'',''Synthetic review'',3)',:'staff_case'),'42501','foreign scoped review denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004"}',true);
select pg_temp.expect_state(format('select public.review_staff_credential_case(%L,''approved'',''Synthetic review'',3)',:'staff_case'),'42501','MFA required');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004","aal":"aal2"}',true);
select pg_temp.expect_state(format('select public.review_staff_credential_case(%L,''approved'',''Synthetic review'',2)',:'staff_case'),'40001','stale review denied');
select public.review_staff_credential_case(:'staff_case','approved','Synthetic review',3);
reset role;
select pg_temp.assert_true(booking_private.resource_eligible('b3000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000005'),'approved person eligible');
insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
 select 'b3000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000005',d,'00:00','23:59',current_date,current_date+365 from generate_series(0,6) d;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours',gen_random_uuid()) as staff_booking \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select public.accept_booking(:'staff_booking',2,array['b6000000-0000-4000-8000-000000000005'::uuid]);
reset role;
alter table public.bookings disable trigger b01_booking_guard;
update public.bookings set start_at=now()+interval '30 minutes',end_at=now()+interval '60 minutes' where id=:'staff_booking';
alter table public.bookings enable trigger b01_booking_guard;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000005"}',true);
select pg_temp.assert_true(booking_private.assigned(:'staff_booking','doctor_visit'),'verified staff assigned scope');
select pg_temp.assert_true(public.get_booking(:'staff_booking') ? 'contact_snapshot','verified staff sees contact in window');
reset role;
update public.staff_credential_documents set expires_at=now()-interval '1 second' where case_id=:'staff_case';
select pg_temp.assert_true(not providers_private.person_is_verified('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005'),'expired evidence denies person');
set local role authenticated;
select pg_temp.assert_true(not booking_private.assigned(:'staff_booking','doctor_visit'),'expiry revokes existing assignment scope');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'staff_booking'),'42501','expired clinician cannot advance');
select pg_temp.expect_state(format('select public.get_booking(%L)',:'staff_booking'),'P0002','expired clinician loses patient contact');
reset role;
update public.staff_credential_documents set expires_at=now()+interval '1 year' where case_id=:'staff_case';
update public.organization_members set status='disabled' where profile_id='b1000000-0000-4000-8000-000000000005';
select pg_temp.assert_true(not providers_private.person_is_verified('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005'),'revoked membership denies person');
set local role authenticated;
select pg_temp.assert_true(not booking_private.assigned(:'staff_booking','doctor_visit'),'membership revocation ends assigned scope');
reset role;
update public.organization_members set status='active' where profile_id='b1000000-0000-4000-8000-000000000005';
set local role authenticated;
select public.cancel_booking(:'staff_booking',4,'unable_to_service');
reset role;
select pg_temp.assert_true((select count(*)=0 from public.resource_reservations where status='active'),'assigned non scheduler cancellation releases resources');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004","aal":"aal2"}',true);
select pg_temp.expect_state(format('select public.review_staff_credential_case(%L,''suspended'',''Synthetic suspension'',4)',:'staff_case'),'42501','verify capability cannot suspend');
reset role;
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('b1000000-0000-4000-8000-000000000003','provider:suspend','org:b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select public.review_staff_credential_case(:'staff_case','suspended','Synthetic suspension',4);
reset role;
select pg_temp.assert_true(not providers_private.person_is_verified('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005'),'suspended person denied');
select pg_temp.expect_state('delete from public.staff_credential_events','55000','credential events append only');
do $$ declare t text; begin
 foreach t in array array['provider_verification_cases','staff_credential_documents','staff_credential_events'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),t||' RLS');
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),t||' direct writes denied');
 end loop;
end $$;
\echo 1..1
\echo ok 1 - q06_staff
rollback;

