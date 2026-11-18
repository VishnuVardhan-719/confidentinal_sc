\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
insert into public.organizations(id,name) values ('b8000000-0000-4000-8000-000000000001','Synthetic Q06 scope');
update public.providers set individual_owner_profile_id=null,organization_id='b8000000-0000-4000-8000-000000000001' where id='b3000000-0000-4000-8000-000000000001';
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('b1000000-0000-4000-8000-000000000004','provider:verify','org:b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002');
insert into public.provider_verification_cases(id,provider_id,subject_profile_id,state,verified_until,decided_by_profile_id)
 values('b9000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005','approved',now()+interval '1 year','b1000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004","aal":"aal2"}',true);
select pg_temp.expect_state('select public.review_staff_credential_case(''b9000000-0000-4000-8000-000000000001'',''suspended'',''Synthetic scope review'',1)','42501','verify capability cannot suspend staff');
\echo 1..1
\echo ok 1 - q06_scope
rollback;
