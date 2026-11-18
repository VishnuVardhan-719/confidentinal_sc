-- Run after 001 and 003 on an isolated synthetic database. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc

-- Deterministic synthetic identities, enough rows to test the maximum page size.
insert into auth.users(id,email,raw_user_meta_data)
select ('71000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'followup-'||i||'@example.invalid','{}'::jsonb from generate_series(1,90) i;
insert into public.organizations(id,name)
select ('72000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic Followup '||i from generate_series(1,61) i;
insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,accepted_at)
select id,'71000000-0000-4000-8000-000000000001','owner','active',array['org:read','org:edit','members:read'],now() from public.organizations where id::text like '72000000-%';
-- Another caller has 55 own invites, plus active same-org membership for member-page testing.
insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invite_expires_at)
select id,'71000000-0000-4000-8000-000000000002','staff','invited',array['org:read'],clock_timestamp()+interval '14 days' from public.organizations where id between '72000000-0000-4000-8000-000000000002'::uuid and '72000000-0000-4000-8000-000000000056'::uuid;
insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,accepted_at)
select '72000000-0000-4000-8000-000000000001',('71000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'staff','active',array['org:read'],now() from generate_series(2,60) i;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- Function missing before 003: deliberately exercises the new behavior first.
select pg_temp.assert_true(jsonb_array_length(public.list_organizations(50,null)->'organizations')=50,'organization page max 50');
do $$
declare first jsonb; second jsonb; combined integer;
begin
  first:=public.list_organizations(50,null);
  second:=public.list_organizations(50,(first->>'nextCursor')::uuid);
  perform pg_temp.assert_true(jsonb_array_length(second->'organizations')=11,'second organization page has remaining eleven');
  perform pg_temp.assert_true(second->>'nextCursor' is null,'last organization page has no cursor');
  select count(distinct value->>'id') into combined from jsonb_array_elements((first->'organizations')||(second->'organizations'));
  perform pg_temp.assert_true(combined=61,'organization pages do not overlap or skip');
  first:=public.list_organization_members('72000000-0000-4000-8000-000000000001',50,null);
  second:=public.list_organization_members('72000000-0000-4000-8000-000000000001',50,(first->>'nextCursor')::uuid);
  perform pg_temp.assert_true(jsonb_array_length(first->'members')=50 and jsonb_array_length(second->'members')=10,'membership pages max fifty and complete');
  select count(distinct value->>'id') into combined from jsonb_array_elements((first->'members')||(second->'members'));
  perform pg_temp.assert_true(combined=60 and second->>'nextCursor' is null,'membership cursor unique and exhausted');
end $$;
select pg_temp.expect_state($q$select public.list_organizations(51,null)$q$,'22023','RPC cannot bypass max page limit');
select pg_temp.expect_state($q$select public.list_organization_members('72000000-0000-4000-8000-000000000001',0,null)$q$,'22023','RPC rejects zero page size');
select pg_temp.expect_state($q$select public.list_organization_invites_page(null,null)$q$,'22023','RPC rejects null page size');

select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare first jsonb; second jsonb; combined integer;
begin
  first:=public.list_organization_invites_page(50,null);
  second:=public.list_organization_invites_page(50,(first->>'nextCursor')::uuid);
  perform pg_temp.assert_true(jsonb_array_length(first->'invitations')=50 and jsonb_array_length(second->'invitations')=5,'invite pages bounded and complete');
  select count(distinct value->>'organization_id') into combined from jsonb_array_elements((first->'invitations')||(second->'invitations'));
  perform pg_temp.assert_true(combined=55 and second->>'nextCursor' is null,'invite pages do not overlap or skip');
end $$;
select pg_temp.assert_true((select count(*)=50 from public.list_organization_invites()),'legacy own-invite RPC is also bounded');
select pg_temp.assert_true(jsonb_array_length(public.list_organizations()->'organizations')=1,'pending invitations do not grant organization read');
select pg_temp.assert_true(jsonb_array_length(public.list_organization_members('72000000-0000-4000-8000-000000000002')->'members')=0,'invited org members hidden');
select pg_temp.assert_true(jsonb_array_length(public.list_organization_members('72000000-0000-4000-8000-000000000001')->'members')=1,'staff sees only own active membership');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000090","role":"authenticated"}',true);
select pg_temp.assert_true(jsonb_array_length(public.list_organization_invites_page()->'invitations')=0,'outsider cannot page other invites');
select pg_temp.assert_true(jsonb_array_length(public.list_organizations()->'organizations')=0,'outsider cannot page other orgs');

-- A role promotion is a privilege expansion even when scopes stay identical.
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_organization_member('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','manager','active',array['org:read'],1);
select pg_temp.assert_true((select status='invited' and accepted_at is null and version=2 and invite_expires_at>clock_timestamp() from public.organization_members where organization_id='72000000-0000-4000-8000-000000000001' and profile_id='71000000-0000-4000-8000-000000000002'),'staff to manager requires fresh acceptance');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(jsonb_array_length(public.list_organizations()->'organizations')=0,'promoted invite grants no organization access before acceptance');
select public.accept_organization_invite('72000000-0000-4000-8000-000000000001',2);
select pg_temp.assert_true((select membership_role='manager' and status='active' and accepted_at is not null and version=3 from public.organization_members where organization_id='72000000-0000-4000-8000-000000000001'),'manager explicitly accepts promotion');
reset role;
select pg_temp.assert_true((select column_default is null from information_schema.columns where table_schema='public' and table_name='organization_members' and column_name='invite_expires_at'),'expiry default removed after backfill');
select pg_temp.assert_true(not exists(select 1 from public.organization_members where status='active' and invite_expires_at is not null),'active fixture owners have no invitation expiry');
set local role authenticated;

-- Create 25 new invitations, reject the 26th, reclaim an expired slot.
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare i integer;
begin
  for i in 3..27 loop
    perform public.set_organization_member('72000000-0000-4000-8000-000000000061',('71000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'staff','invited',array['org:read'],0);
  end loop;
end $$;
select pg_temp.assert_true((select count(*)=25 from public.organization_members where organization_id='72000000-0000-4000-8000-000000000061' and status='invited'),'twenty five invitations allowed');
select pg_temp.assert_true((select bool_and(invite_expires_at>clock_timestamp()+interval '13 days' and invite_expires_at<=clock_timestamp()+interval '14 days') from public.organization_members where organization_id='72000000-0000-4000-8000-000000000061' and status='invited'),'default expiry is fourteen days');
select pg_temp.expect_state($q$select public.set_organization_member('72000000-0000-4000-8000-000000000061','71000000-0000-4000-8000-000000000028','staff','invited',array['org:read'],0)$q$,'23514','twenty sixth pending invite denied');
reset role;
update public.organization_members set invite_expires_at=clock_timestamp()-interval '1 second' where organization_id='72000000-0000-4000-8000-000000000061' and profile_id='71000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.expect_state($q$select public.accept_organization_invite('72000000-0000-4000-8000-000000000061',1)$q$,'42501','expired invitation cannot be accepted');
select pg_temp.assert_true(jsonb_array_length(public.list_organization_invites_page()->'invitations')=0,'expired invitation omitted from discovery');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_organization_member('72000000-0000-4000-8000-000000000061','71000000-0000-4000-8000-000000000028','staff','invited',array['org:read'],0);
select pg_temp.expect_state($q$select public.set_organization_member('72000000-0000-4000-8000-000000000061','71000000-0000-4000-8000-000000000003','staff','invited',array['org:read'],1)$q$,'23514','expired invitation renewal cannot bypass full cap');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000028","role":"authenticated"}',true);
select public.accept_organization_invite('72000000-0000-4000-8000-000000000061',1);
select pg_temp.assert_true((select status='active' and accepted_at is not null and invite_expires_at is null from public.organization_members where organization_id='72000000-0000-4000-8000-000000000061'),'acceptance clears pending expiry');
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_organization_member('72000000-0000-4000-8000-000000000061','71000000-0000-4000-8000-000000000003','staff','invited',array['org:read'],1);
select pg_temp.assert_true((select invite_expires_at>clock_timestamp()+interval '13 days' and accepted_at is null and version=2 from public.organization_members where organization_id='72000000-0000-4000-8000-000000000061' and profile_id='71000000-0000-4000-8000-000000000003'),'reissue gets fresh expiry and version');

-- Expiry uses wall clock after locking, even in an old transaction (BEGIN is above).
reset role;
update public.organization_members set invite_expires_at=clock_timestamp()-interval '1 millisecond' where organization_id='72000000-0000-4000-8000-000000000061' and profile_id='71000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.expect_state($q$select public.accept_organization_invite('72000000-0000-4000-8000-000000000061',2)$q$,'42501','transaction-start timestamp cannot revive expired invitation');

-- New RPC ACLs and fixed search paths; existing deny-by-default policies retained.
reset role;
do $$
declare f record;
begin
  for f in select p.oid,p.proname,p.proconfig,p.proacl,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('list_organizations','list_organization_members','list_organization_invites_page') loop
    perform pg_temp.assert_true(not has_function_privilege('anon',f.oid,'EXECUTE'),f.proname||' anonymous execution denied');
    perform pg_temp.assert_true(not exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),f.proname||' PUBLIC execution denied');
    perform pg_temp.assert_true(exists(select 1 from unnest(f.proconfig) setting where setting in ('search_path=""','search_path=')),f.proname||' pinned search_path');
  end loop;
end $$;
set local role anon;
select pg_temp.expect_state($q$select public.list_organizations()$q$,'42501','anonymous organization pagination denied');
select pg_temp.expect_state($q$select public.list_organization_members('72000000-0000-4000-8000-000000000001')$q$,'42501','anonymous membership pagination denied');
select pg_temp.expect_state($q$select public.list_organization_invites_page()$q$,'42501','anonymous invitation pagination denied');
reset role;
\echo 1..1
\echo ok 1 - 002_i01_followups assertions
rollback;
\echo 'I01 follow-up SQL assertions passed; all synthetic fixtures rolled back.'
