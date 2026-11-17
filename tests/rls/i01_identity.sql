-- I01 database authorization suite: NOT RUN (Docker Desktop unavailable).
-- After migrations on a DISPOSABLE LOCAL Supabase DB only:
-- psql "$LOCAL_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/rls/i01_identity.sql
-- Runs actual authenticated/anon DB roles with synthetic JWT subjects, then rolls back.
-- This is SQL integration coverage, not a replacement for Auth/Storage HTTP E2E.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.expect_state(statement text, expected text, label text) returns void
language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual = expected then return; end if;
    raise exception 'FAIL: %, expected %, got %', label, expected, actual;
  end;
  raise exception 'FAIL: %, command unexpectedly succeeded', label;
end $$;

-- .invalid is reserved, no real contact details or patient/health data.
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','patient-a@example.invalid','{"role":"admin","status":"active"}'),
 ('10000000-0000-4000-8000-000000000002','patient-b@example.invalid','{"role":"doctor"}'),
 ('10000000-0000-4000-8000-000000000003','disabled-member@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000004','invited-member@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000005','disabled-account@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000006','scoped-admin@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000007','invitee@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000008','outsider@example.invalid','{}');
update public.profiles set status = 'disabled' where id = '10000000-0000-4000-8000-000000000005';
insert into public.organizations(id,name) values
 ('20000000-0000-4000-8000-000000000001','Synthetic Org A'),
 ('20000000-0000-4000-8000-000000000002','Synthetic Org B');
insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','active',array['org:read','org:edit','members:read','provider:read']),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner','active',array['org:read','org:edit','members:read','provider:read']),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','manager','disabled',array['org:read','org:edit','members:read','provider:read']),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','manager','invited',array['org:read','org:edit','members:read','provider:read']);
-- Synthetic legacy active/disabled members have already accepted; invited has not.
update public.organization_members set accepted_at=now() where status in ('active','disabled');
insert into public.providers(individual_owner_profile_id,category) values
 ('10000000-0000-4000-8000-000000000002','doctor');
insert into public.providers(organization_id,category) values
 ('20000000-0000-4000-8000-000000000001','lab'),
 ('20000000-0000-4000-8000-000000000001','ambulance'),
 ('20000000-0000-4000-8000-000000000001','caretaker');
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('10000000-0000-4000-8000-000000000006','provider:verify','global','10000000-0000-4000-8000-000000000001');
insert into storage.buckets(id,name,public) values('i01-synthetic-private','i01-synthetic-private',false);
insert into storage.objects(bucket_id,name) values('i01-synthetic-private','synthetic-object');

select pg_temp.assert_true(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname in ('profiles','patients','patient_access','organizations','organization_members','admin_capabilities','providers','consent_events','audit_events','idempotency_requests') and not c.relrowsecurity
),'RLS enabled on all I01 tables');
select pg_temp.assert_true((select count(*) = 10 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('profiles','patients','patient_access','organizations','organization_members','admin_capabilities','providers','consent_events','audit_events','idempotency_requests')),'all ten I01 tables exist');
select pg_temp.assert_true(not has_function_privilege('anon','public.update_self_profile(text,text,integer)','EXECUTE'),'guest cannot execute profile RPC');
select pg_temp.assert_true(not has_function_privilege('authenticated','identity_private.require_actor()','EXECUTE'),'internal mutating helper not callable');

-- F13 #19/#20: every I01 definer has a pinned empty path and narrow ACL.
do $$
declare f record;
begin
  for f in select p.oid,p.proconfig,p.proacl,p.proowner,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='identity_private' or (n.nspname='public' and p.proname in ('update_self_profile','create_self_patient','create_organization','update_organization','set_organization_member','accept_organization_invite','list_organization_invites','identity_roles'))
  loop
    perform pg_temp.assert_true(exists(select 1 from unnest(f.proconfig) setting where setting in ('search_path=""','search_path=')),f.proname || ' empty search_path');
    perform pg_temp.assert_true(not exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),f.proname || ' no PUBLIC execute');
    perform pg_temp.assert_true(not has_function_privilege('anon',f.oid,'EXECUTE'),f.proname || ' no anon execute');
    if f.nspname='identity_private' and f.proname not in ('active_account','org_scope','patient_scope') then
      perform pg_temp.assert_true(not has_function_privilege('authenticated',f.oid,'EXECUTE'),f.proname || ' no authenticated execute');
    end if;
  end loop;
end $$;
-- F13 #21: checked as privileged fixture owner, not through filtered bucket RLS.
select pg_temp.assert_true(not exists(select 1 from storage.buckets where public),'no public bucket exists');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select public.create_self_patient('synthetic-policy-v1');
select pg_temp.assert_true((select count(*) = 1 from public.patients),'B sees self patient');
select pg_temp.assert_true((select count(*) = 4 from public.patient_access),'B sees own four scoped grants without recursion');
select pg_temp.assert_true((select count(*) = 1 from public.consent_events),'identity consent created atomically');
select pg_temp.assert_true((select array_agg(r order by r) = array['patient'] from public.identity_roles() r),'draft individual provider has no category workspace before approval');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}',true);
select pg_temp.assert_true((select count(*) = 0 from public.patients),'cross-patient SELECT denied');
select pg_temp.assert_true((select count(*) = 0 from public.patient_access),'cross-patient grants hidden');
select pg_temp.assert_true((select count(*) = 0 from public.consent_events),'cross-patient consent hidden');
select public.create_self_patient('synthetic-policy-v1');
select public.create_self_patient('synthetic-policy-v1');
select pg_temp.assert_true((select count(*) = 1 from public.patients),'self patient creation idempotent');
select pg_temp.assert_true((select count(*) = 4 from public.patient_access),'no duplicate grants');
select pg_temp.assert_true((select array_agg(r order by r) = array['patient'] from public.identity_roles() r),'draft org providers have no category workspace; forged admin metadata ignored');
select pg_temp.assert_true((select count(*) = 1 from public.profiles),'cross-profile SELECT denied');
select pg_temp.assert_true((select count(*) = 1 from public.organizations),'cross-org SELECT denied');
select pg_temp.assert_true((select count(*) = 0 from public.organization_members where organization_id='20000000-0000-4000-8000-000000000002'),'cross-org member SELECT denied');
select pg_temp.expect_state($q$update public.profiles set status='active'$q$,'42501','direct profile UPDATE denied');
select pg_temp.expect_state($q$insert into public.profiles(id) values(gen_random_uuid())$q$,'42501','direct profile INSERT denied');
select pg_temp.expect_state($q$delete from public.profiles$q$,'42501','direct profile DELETE denied');
select pg_temp.expect_state($q$insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values(auth.uid(),'provider:verify','global',auth.uid())$q$,'42501','self admin escalation denied');
select pg_temp.expect_state($q$update public.admin_capabilities set capability='membership:admin'$q$,'42501','admin capability mutation denied');
select pg_temp.expect_state($q$insert into public.providers(individual_owner_profile_id,category) values(auth.uid(),'doctor')$q$,'42501','self provider escalation denied');
select pg_temp.expect_state($q$update public.providers set verification_state='verified'$q$,'42501','self verification denied');
select pg_temp.expect_state($q$insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by) values(gen_random_uuid(),auth.uid(),'profile:read',gen_random_uuid(),auth.uid())$q$,'42501','self access grant denied');
select pg_temp.expect_state($q$update public.patients set self_profile_id=auth.uid()$q$,'42501','patient owner reassignment denied');
select pg_temp.expect_state($q$delete from public.patient_access$q$,'42501','access deletion denied');
select pg_temp.expect_state($q$update public.organization_members set membership_role='owner'$q$,'42501','raw membership promotion denied');
select pg_temp.expect_state($q$delete from public.organization_members$q$,'42501','raw member deletion denied');
select pg_temp.expect_state($q$update public.organizations set status='active'$q$,'42501','org activation denied');
select pg_temp.expect_state($q$select public.update_organization('20000000-0000-4000-8000-000000000002','Intrusion',1)$q$,'42501','cross-org RPC denied');
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','staff','active',array['org:read'],1)$q$,'42501','cross-org membership RPC denied');
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001',auth.uid(),'manager','active',array['org:read'],1)$q$,'42501','self membership mutation denied');
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','owner','active',array['org:read'],1)$q$,'22023','owner promotion denied');
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','staff','active',array['evidence:manage'],1)$q$,'42501','cannot delegate beyond own scopes');
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','staff','active',array['org:read'],1);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.organizations),'reactivated member must accept again');
select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',2);
select pg_temp.assert_true((select count(*) = 1 from public.organizations),'active scoped member reads own org');
select pg_temp.assert_true((select count(*) = 1 from public.organization_members),'member without members:read sees only self');
select pg_temp.assert_true((select count(*) = 0 from public.providers),'org:read does not imply provider:read');
select pg_temp.expect_state($q$select public.update_organization('20000000-0000-4000-8000-000000000001','Intrusion',1)$q$,'42501','active member without edit scope denied');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','staff','disabled',array['org:read'],3);
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','staff','active',array['org:read'],2)$q$,'40001','stale membership version denied');
select public.update_self_profile('Synthetic A','te',1);
select pg_temp.expect_state($q$select public.update_self_profile('Stale','en',1)$q$,'40001','stale profile version denied');
select public.update_organization('20000000-0000-4000-8000-000000000001','Synthetic Org A v2',1);
select pg_temp.expect_state($q$select public.update_organization('20000000-0000-4000-8000-000000000001','Stale',1)$q$,'40001','stale org version denied');
select public.create_organization('Synthetic Created Org','30000000-0000-4000-8000-000000000001');
select public.create_organization('Synthetic Created Org','30000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*) = 2 from public.organizations),'same org request not duplicated');
select pg_temp.expect_state($q$select public.create_organization('Changed Payload','30000000-0000-4000-8000-000000000001')$q$,'40001','idempotency payload conflict');
select pg_temp.assert_true((select count(*) = 0 from storage.objects),'private objects hidden even by guessed key');
select pg_temp.assert_true((select count(*) = 0 from storage.buckets),'buckets hidden');
select pg_temp.expect_state($q$insert into storage.objects(bucket_id,name) values('i01-synthetic-private','unauthorized')$q$,'42501','storage upload denied');
select pg_temp.expect_state($q$insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(auth.uid(),'forged','profile',auth.uid())$q$,'42501','audit injection denied');
do $$
declare t text;
begin
  foreach t in array array['profiles','patients','patient_access','consent_events','organizations','organization_members','admin_capabilities','providers','audit_events','idempotency_requests'] loop
    perform pg_temp.expect_state(format('insert into public.%I default values',t),'42501',t || ' raw INSERT denied');
    perform pg_temp.expect_state(format('update public.%I set id=id',t),'42501',t || ' raw UPDATE denied');
    perform pg_temp.expect_state(format('delete from public.%I',t),'42501',t || ' raw DELETE denied');
  end loop;
end $$;

-- Storage update/delete must either be filtered to zero or denied by privileges.
do $$
declare t text; op text; affected bigint;
begin
  foreach t in array array['objects','buckets'] loop
    foreach op in array array['update','delete'] loop
      begin
        if op='update' then execute format('update storage.%I set name=name',t);
        else execute format('delete from storage.%I',t); end if;
        get diagnostics affected = row_count;
        perform pg_temp.assert_true(affected=0,t || ' storage ' || op || ' denied');
      exception when insufficient_privilege then null;
      end;
    end loop;
  end loop;
end $$;
select pg_temp.expect_state($q$insert into storage.buckets(id,name,public) values('i01-forbidden-public','i01-forbidden-public',true)$q$,'42501','public bucket creation denied');

-- Disabling an unaccepted invitation must not let an owner bypass acceptance.
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','staff','active',array['org:read'],1)$q$,'42501','existing invitation cannot be activated by owner');
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','staff','disabled',array['org:read'],1);
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','staff','active',array['org:read'],2)$q$,'42501','disabled unaccepted invitation cannot be activated by owner');
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','staff','invited',array['org:read'],2);

-- F2: creation cannot activate a stranger; only the intended invitee accepts.
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','active',array['org:read'],0)$q$,'22023','new active member rejected');
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','invited',array['org:read'],0);
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','active',array['org:read'],1)$q$,'42501','owner cannot accept for invitee');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select pg_temp.expect_state($q$select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',1)$q$,'42501','stranger cannot accept another invitation');
select pg_temp.assert_true(not exists(select 1 from public.list_organization_invites()),'outsider cannot list another invitee invitations');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.organizations),'pending invite confers no read');
select pg_temp.assert_true((select count(*)=1 from public.list_organization_invites()),'invitee sees only own invitation, not other members invites');
select pg_temp.assert_true((select organization_id='20000000-0000-4000-8000-000000000001'::uuid and scopes=array['org:read'] and version=1 from public.list_organization_invites()),'invitation returns only own org/scopes/version');
select pg_temp.assert_true((select count(*)=0 from public.organization_members),'discovery does not expose base membership rows');

select pg_temp.expect_state($q$select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',2)$q$,'40001','stale invite version rejected');
select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',1);
select pg_temp.assert_true((select count(*)=1 from public.organizations),'invitee gains scoped access after acceptance');
select pg_temp.assert_true((select status='active' and accepted_at is not null and version=2 from public.organization_members),'acceptance recorded');
select pg_temp.expect_state($q$select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',2)$q$,'42501','repeated acceptance rejected');

-- N2: larger scopes, disabled reactivation and explicit re-invites all need consent.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','active',array['org:read','members:read'],2);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.organizations),'scope growth suspends old org access');
select pg_temp.assert_true((select scopes=array['org:read','members:read'] and version=3 from public.list_organization_invites()),'expanded scopes presented for fresh acceptance');
select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',3);
select pg_temp.assert_true((select count(*)>1 from public.organization_members),'expanded scope works only after acceptance');
select pg_temp.assert_true(not exists(select 1 from public.list_organization_invites()),'accepted invitation no longer listed');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','disabled',array['org:read','members:read'],4);
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','active',array['org:read','members:read'],5);
select pg_temp.assert_true((select status='invited' and accepted_at is null and version=6 from public.organization_members where profile_id='10000000-0000-4000-8000-000000000007'),'reactivation clears prior acceptance');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.organizations),'reactivation does not silently restore access');
select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',6);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','invited',array['org:read','members:read'],7);
select pg_temp.assert_true((select accepted_at is null from public.organization_members where profile_id='10000000-0000-4000-8000-000000000007'),'explicit re-invitation clears prior acceptance');
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','staff','active',array['org:read','members:read'],8)$q$,'42501','owner cannot reuse stale acceptance');

-- Disabled and invited memberships lose both reads and RPC authorization.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.organizations),'inactive membership read denied');
select pg_temp.assert_true((select count(*) = 0 from public.providers),'inactive provider workspace hidden');
select pg_temp.assert_true((select array_agg(r) = array['patient'] from public.identity_roles() r),'inactive member has no provider role');
select pg_temp.expect_state($q$select public.update_organization('20000000-0000-4000-8000-000000000001','Intrusion',2)$q$,'42501','inactive member RPC denied');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.organizations),'invited member read denied');
select pg_temp.expect_state($q$select public.update_organization('20000000-0000-4000-8000-000000000001','Intrusion',2)$q$,'42501','invited member RPC denied');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.profiles),'disabled account read denied');
select pg_temp.expect_state($q$select public.update_self_profile('Intrusion','en',1)$q$,'42501','disabled account RPC denied');
select pg_temp.expect_state($q$select public.create_self_patient('synthetic-policy-v1')$q$,'42501','disabled account onboarding denied');

-- F13 #15: disabled profiles lose every granted private read and mutating RPC.
do $$
declare t text;
begin
  foreach t in array array['profiles','patients','patient_access','consent_events','organizations','organization_members','admin_capabilities','providers'] loop
    execute format('select pg_temp.assert_true((select count(*)=0 from public.%I),%L)',t,t || ' disabled profile read denied');
  end loop;
end $$;
select pg_temp.assert_true(not exists(select 1 from public.identity_roles()),'disabled profile has no workspace');
select pg_temp.assert_true(not exists(select 1 from public.list_organization_invites()),'disabled profile cannot discover invitations');
select pg_temp.expect_state($q$select public.create_organization('Forbidden','30000000-0000-4000-8000-000000000099')$q$,'42501','disabled profile cannot create org');
select pg_temp.expect_state($q$select public.update_organization('20000000-0000-4000-8000-000000000001','Forbidden',2)$q$,'42501','disabled profile cannot update org');
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000008','staff','invited',array['org:read'],0)$q$,'42501','disabled profile cannot invite');
select pg_temp.expect_state($q$select public.accept_organization_invite('20000000-0000-4000-8000-000000000001',1)$q$,'42501','disabled profile cannot accept');
select pg_temp.expect_state($q$select identity_private.require_actor()$q$,'42501','mutating private helper denied');
select pg_temp.expect_state($q$select identity_private.provision_profile()$q$,'42501','private trigger function denied');

-- Admin is a scoped workspace, not a clinical/patient or org bypass.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal1"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.admin_capabilities),'admin capability requires MFA');
select pg_temp.assert_true((select array_agg(r) = array['patient'] from public.identity_roles() r),'admin workspace requires MFA');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}',true);
select pg_temp.assert_true((select array_agg(r order by r) = array['admin','patient'] from public.identity_roles() r),'trusted MFA admin workspace');
select pg_temp.assert_true((select count(*) = 0 from public.patients),'verifier has no patient access');
select pg_temp.assert_true((select count(*) = 0 from public.organizations),'verifier has no org bypass');

-- F1: org scope and audit-only capability never imply global admin workspace.
reset role;
update public.admin_capabilities set scope_key='org:20000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not exists(select 1 from public.identity_roles() r where r='admin'),'org-scoped verifier is not global admin');
reset role;
update public.admin_capabilities set scope_key='global',capability='security:audit';
set local role authenticated;
select pg_temp.assert_true(not exists(select 1 from public.identity_roles() r where r='admin'),'global audit-only capability is not admin');
reset role;
update public.admin_capabilities set capability='provider:verify';
set local role authenticated;

-- Time validity and organization suspension, independently of revocation.
reset role;
update public.patient_access set expires_at=now()-interval '1 hour', valid_from=now()-interval '2 hours' where grantee_profile_id='10000000-0000-4000-8000-000000000002';
update public.admin_capabilities set valid_from=now()+interval '1 hour';
update public.organizations set status='disabled' where id='20000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.patients),'expired patient access denied');
select pg_temp.assert_true((select count(*) = 0 from public.organizations),'disabled org hidden from active owner');
select pg_temp.assert_true((select count(*)=0 from public.organization_members),'disabled org hides memberships');
select pg_temp.expect_state($q$select public.accept_organization_invite('20000000-0000-4000-8000-000000000002',1)$q$,'42501','disabled org cannot accept invitations');
select pg_temp.expect_state($q$select public.set_organization_member('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000008','staff','invited',array['org:read'],0)$q$,'42501','disabled org cannot add members');

select pg_temp.expect_state($q$select public.update_organization('20000000-0000-4000-8000-000000000002','Intrusion',1)$q$,'42501','disabled org mutation denied');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}',true);
select pg_temp.assert_true((select array_agg(r) = array['patient'] from public.identity_roles() r),'future admin grant denied');
select pg_temp.assert_true((select count(*)=0 from public.admin_capabilities),'future capability hidden');
reset role;
update public.admin_capabilities set valid_from=now()-interval '2 hours', expires_at=now()-interval '1 hour';
set local role authenticated;
select pg_temp.assert_true((select array_agg(r) = array['patient'] from public.identity_roles() r),'expired admin grant denied');
select pg_temp.assert_true((select count(*)=0 from public.admin_capabilities),'expired capability hidden');

-- F5: five created orgs per actor, with replay allowed at the cap.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_organization('Synthetic Cap 2','30000000-0000-4000-8000-000000000002');
select public.create_organization('Synthetic Cap 3','30000000-0000-4000-8000-000000000003');
select public.create_organization('Synthetic Cap 4','30000000-0000-4000-8000-000000000004');
select public.create_organization('Synthetic Cap 5','30000000-0000-4000-8000-000000000005');
select public.create_organization('Synthetic Cap 5','30000000-0000-4000-8000-000000000005');
select pg_temp.expect_state($q$select public.create_organization('Synthetic Cap 6','30000000-0000-4000-8000-000000000006')$q$,'23514','sixth organization rejected');

-- Independently exercise revocation of an otherwise valid global capability.
reset role;
update public.admin_capabilities set valid_from=now()-interval '1 hour',expires_at=null;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}',true);
select pg_temp.assert_true(exists(select 1 from public.identity_roles() r where r='admin'),'global capability valid before revocation');

-- Revoke grants and membership with trusted fixture setup, then test fresh reads.
reset role;
update public.organization_members set status='disabled' where profile_id='10000000-0000-4000-8000-000000000001';
update public.patient_access set revoked_at=now() where grantee_profile_id='10000000-0000-4000-8000-000000000001';
update public.admin_capabilities set revoked_at=now();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.organizations),'revoked membership immediately hides org');
select pg_temp.assert_true((select count(*) = 0 from public.patients),'revoked access immediately hides patient');
select pg_temp.expect_state($q$select public.create_self_patient('synthetic-policy-v1')$q$,'42501','patient replay reauthorizes revoked access');
select pg_temp.assert_true((select count(*) = 0 from public.patients),'onboarding retry never resurrects revoked grant');
select pg_temp.expect_state($q$select public.create_organization('Synthetic Created Org','30000000-0000-4000-8000-000000000001')$q$,'42501','replay reauthorizes revoked owner');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}',true);
select pg_temp.assert_true((select array_agg(r) = array['patient'] from public.identity_roles() r),'revoked admin role disappears');
select pg_temp.assert_true((select count(*)=0 from public.admin_capabilities),'revoked capability hidden');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.expect_state('select * from public.profiles','42501','unauthenticated profile read denied');
select pg_temp.expect_state('select * from public.patients','42501','unauthenticated patient read denied');
select pg_temp.expect_state('select * from public.organizations','42501','unauthenticated org read denied');
select pg_temp.expect_state($q$select public.create_organization('Intrusion',gen_random_uuid())$q$,'42501','unauthenticated RPC denied');
select pg_temp.expect_state($q$select identity_private.active_account()$q$,'42501','unauthenticated helper denied');
-- F13 #18: all I01 tables and exported RPCs deny anonymous access.
do $$
declare t text; f record;
begin
  foreach t in array array['profiles','patients','patient_access','consent_events','organizations','organization_members','admin_capabilities','providers','audit_events','idempotency_requests'] loop
    perform pg_temp.expect_state(format('select * from public.%I',t),'42501',t || ' anon read denied');
  end loop;
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('update_self_profile','create_self_patient','create_organization','update_organization','set_organization_member','accept_organization_invite','list_organization_invites','identity_roles') loop
    perform pg_temp.assert_true(not has_function_privilege('anon',f.oid,'EXECUTE'),f.proname || ' anon execution denied');
  end loop;
end $$;
reset role;
rollback;
\echo 'I01 SQL assertions passed; all synthetic fixtures rolled back.'

-- Reciprocal invitation concurrency regression (two connections): NOT RUN.
-- On an isolated migrated DB, create two active owners A and B of separate orgs.
-- Connection A: BEGIN; set authenticated JWT A; call set_organization_member to invite B;
-- hold transaction open. Connection B: BEGIN; set authenticated JWT B; invite A into B's org.
-- Commit B, then A. Both must complete (no 40P01), with two invited/unaccepted rows.
-- Repeat with synchronized starts. require_actor uses FOR NO KEY UPDATE, compatible
-- with the FK KEY SHARE lock on the recipient profile. Never run on shared/live data.
