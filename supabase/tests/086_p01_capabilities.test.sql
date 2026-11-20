\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- Do not include _p01_fixture: test the launch scope defaults before test grants.
select pg_temp.assert_true(not exists(select 1 from public.organization_members where 'finance:collect'=any(scopes)),'no existing owner collector bootstrap');
do $$ declare cap text; begin
 foreach cap in array array['provider:verify','provider:document_read','provider:suspend','coverage:verify','security:audit','membership:admin','booking:incident','finance:reconcile','finance:override'] loop
  insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by)
  values('c1000000-0000-4000-8000-000000000009',cap,'global','b1000000-0000-4000-8000-000000000004');
 end loop;
 update public.organization_members set scopes=scopes||array['finance:collect'] where profile_id='c1000000-0000-4000-8000-000000000002';
 perform pg_temp.assert_true((select 'finance:collect'=any(scopes) from public.organization_members where profile_id='c1000000-0000-4000-8000-000000000002'),'explicit collector scope accepted');
 perform pg_temp.expect_state('update public.organization_members set scopes=array[null]::text[]','23514','NULL scope check preserved');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 086_p01_capabilities.test
rollback;
