\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); c uuid:=pg_temp.p01_report(b); st text; begin
 perform pg_temp.p01_finance(); perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
 foreach st in array array['active','invited','disabled'] loop
  insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,invite_expires_at,scopes)
  values('c8000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','staff',st,
  case when st='active' then now() end,case when st='invited' then now()+interval '1 day' end,array['provider:read']);
  perform pg_temp.expect_state(format('select public.reconcile_collection(%L,''confirm'',''other'',%s,gen_random_uuid())',c,pg_temp.p01_version(b)),'42501','any membership conflict '||st);
  delete from public.organization_members where profile_id='d1000000-0000-4000-8000-000000000001';
 end loop;
 insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by,revoked_at)
 values('b2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','booking:read',
 'b2100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',now());
 perform pg_temp.expect_state(format('select public.reconcile_collection(%L,''confirm'',''other'',%s,gen_random_uuid())',c,pg_temp.p01_version(b)),'42501','patient access conflict even revoked');
 delete from public.patient_access where grantee_profile_id='d1000000-0000-4000-8000-000000000001';
 update public.admin_capabilities set revoked_at=now() where profile_id='d1000000-0000-4000-8000-000000000001';
 perform pg_temp.expect_state(format('select public.reconcile_collection(%L,''confirm'',''other'',%s,gen_random_uuid())',c,pg_temp.p01_version(b)),'42501','revoked capability');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 076_p01_finance_conflicts.test
rollback;
