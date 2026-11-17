-- I01: synthetic identities only. Everything is rolled back, including Auth rows.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Removing RLS, using JWT roles, or widening any grant must fail these tests.
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('profiles','patients','patient_access',
  'organizations','organization_members','admin_capabilities','audit_events') and c.relrowsecurity),
  7, 'RLS enabled on every I01 application table');

insert into auth.users(id, email, raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','synthetic-patient-a@example.invalid','{"role":"admin","status":"disabled"}'),
 ('10000000-0000-0000-0000-000000000002','synthetic-patient-b@example.invalid','{}'),
 ('10000000-0000-0000-0000-000000000003','synthetic-owner@example.invalid','{}'),
 ('10000000-0000-0000-0000-000000000004','synthetic-manager@example.invalid','{}'),
 ('10000000-0000-0000-0000-000000000005','synthetic-admin@example.invalid','{}'),
 ('10000000-0000-0000-0000-000000000006','synthetic-disabled@example.invalid','{}');
update public.profiles set status='disabled' where id='10000000-0000-0000-0000-000000000006';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1","user_metadata":{"role":"admin"}}',true);
select lives_ok($$select public.onboard_self_patient()$$, 'self patient onboarding succeeds');
select lives_ok($$select public.onboard_self_patient()$$, 'self onboarding is idempotent');
select is((select count(*)::integer from public.patients),1,'self patient visible');
select is((select count(*)::integer from public.patient_access),1,'self access visible without recursion');
select set_config('test.patient_a_id',(select id::text from public.patients),true);
select lives_ok($$update public.patients set display_name='SYNTHETIC Patient A'$$,'allowlisted patient edit succeeds');
select is((select version from public.patients),2,'patient version increments on edit');
with changed as (update public.profiles set display_name='SYNTHETIC Patient A',locale='te' where id=auth.uid() returning id)
select is((select count(*)::integer from changed),1,'allowlisted profile edit changes exactly one row');
select is((select display_name from public.profiles where id=auth.uid()),'SYNTHETIC Patient A','profile display name edit persisted');
select is((select locale from public.profiles where id=auth.uid()),'te','profile locale edit persisted');
select throws_ok($$update public.profiles set status='active' where id=auth.uid()$$,'42501',null,'account status cannot be self assigned');
select throws_ok($$update public.profiles set id='10000000-0000-0000-0000-000000000002' where id=auth.uid()$$,'42501',null,'profile identity protected');
select throws_ok($$insert into public.patients(self_profile_id) values(auth.uid())$$,'42501',null,'direct patient creation denied');
select throws_ok($$insert into public.patient_access(patient_id,grantee_profile_id) select id,auth.uid() from public.patients$$,'42501',null,'self access grant creation denied');
select throws_ok($$update public.patient_access set scopes=array['booking:write']$$,'42501',null,'grant scopes cannot be changed by subject');
select throws_ok($$update public.patients set questionnaire_version=1$$,'42501',null,'questionnaire completion cannot be spoofed');
select throws_ok($$insert into public.admin_capabilities(profile_id,capability,reason_code) values(auth.uid(),'capability:manage','SYNTHETIC_TEST')$$,'42501',null,'admin cannot be self granted');
select is((select count(*)::integer from public.admin_capabilities),0,'metadata admin claim grants nothing');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.onboard_self_patient()$$,'second self patient onboarding succeeds');
select is((select count(*)::integer from public.patients),1,'patient cannot read other patient');
select is((select count(*)::integer from public.patients where id=current_setting('test.patient_a_id')::uuid),0,'known other patient ID denied');
select ok(not private.has_patient_scope(current_setting('test.patient_a_id')::uuid,'patient:read'),'patient helper cannot export another subject rights');
select is((select count(*)::integer from public.profiles),1,'patient cannot read other profile');
select is((select count(*)::integer from public.patient_access),1,'patient cannot read other access grants');
with changed as (update public.profiles set display_name='ATTACK' where id='10000000-0000-0000-0000-000000000001' returning id)
select is((select count(*)::integer from changed),0,'cross patient profile update denied');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.create_organization('SYNTHETIC Org A')$$,'organization creator receives scoped ownership');
select set_config('test.org_a_id',(select id::text from public.organizations),true);
with changed as (update public.organizations set display_name='SYNTHETIC Org A' returning id)
select is((select count(*)::integer from changed),1,'owner update changes exactly one organization even with unchanged name');
select lives_ok($$select public.set_organization_member((select id from public.organizations), '10000000-0000-0000-0000-000000000004', 'manager', 'invited', array['organization:read','members:read'], 0)$$,'owner may invite bounded manager');
select throws_ok($$select public.set_organization_member((select id from public.organizations),'10000000-0000-0000-0000-000000000004','manager','invited',array['organization:read'],99)$$,'40001',null,'stale membership version denied');
select throws_ok($$select public.set_organization_member((select id from public.organizations),'10000000-0000-0000-0000-000000000004','manager','active',array['organization:read'],1)$$,'42501',null,'owner cannot bypass invite acceptance');
select throws_ok($$select public.set_organization_member((select id from public.organizations),'10000000-0000-0000-0000-000000000004','manager','invited',array['audit:read'],1)$$,'42501',null,'org owner cannot grant scopes beyond own authority');
select throws_ok($$select public.set_organization_member((select id from public.organizations),auth.uid(),'owner','active',array['members:manage'],1)$$,'42501',null,'owner cannot change own membership');
select throws_ok($$insert into public.organization_members(organization_id,profile_id,membership_role,status) select id,auth.uid(),'owner','active' from public.organizations$$,'42501',null,'direct membership insert denied');
select throws_ok($$update public.organization_members set membership_role='owner'$$,'42501',null,'direct membership promotion denied');
select throws_ok($$delete from public.organization_members$$,'42501',null,'direct membership deletion denied');
select is((select count(*)::integer from public.patients),0,'org owner receives no patient access');

reset role;
-- A second tenant is created by a different subject through the same command.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.create_organization('SYNTHETIC Org B')$$,'second tenant creation succeeds');
select is((select count(*)::integer from public.organizations),1,'cross organization read denied');
select ok(not private.has_org_scope(current_setting('test.org_a_id')::uuid,'organization:read'),'helper checks caller membership in exact organization');
select throws_ok($$select public.set_organization_member(current_setting('test.org_a_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','invited',array['organization:read'],0)$$,'42501',null,'cross tenant command denied with known organization ID');
select is((select count(*)::integer from public.organization_members),1,'cross organization membership read denied');
with changed as (update public.organizations set display_name='ATTACK' where display_name='SYNTHETIC Org A' returning id)
select is((select count(*)::integer from changed),0,'cross organization update denied');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
select is((select count(*)::integer from public.organizations),0,'invited member cannot read organization');
select is((select count(*)::integer from public.organization_members),1,'invitee can inspect own invite');
select lives_ok($$select public.accept_organization_invite((select organization_id from public.organization_members),1)$$,'invitee can accept only existing invitation');
select is((select count(*)::integer from public.organizations),1,'active scoped member reads own organization');
select is((select count(*)::integer from public.organization_members),2,'bounded member roster read avoids recursion');
with changed as (update public.organizations set display_name='ATTACK' returning id)
select is((select count(*)::integer from changed),0,'manager role without update scope cannot edit org');
select throws_ok($$select public.set_organization_member((select id from public.organizations),auth.uid(),'owner','active',array['members:manage'],2)$$,'42501',null,'manager cannot promote self through command');
select throws_ok($$select public.set_organization_member((select id from public.organizations),'10000000-0000-0000-0000-000000000001','doctor','invited',array['organization:read'],0)$$,'42501',null,'role name without manage scope grants no mutation');

reset role;
insert into public.admin_capabilities(profile_id,capability,organization_id,reason_code)
select '10000000-0000-0000-0000-000000000005','organization:read',id,'SYNTHETIC_TEST' from public.organizations where display_name='SYNTHETIC Org A';
insert into public.admin_capabilities(profile_id,capability,organization_id,reason_code)
select '10000000-0000-0000-0000-000000000005','audit:read',id,'SYNTHETIC_TEST' from public.organizations where display_name='SYNTHETIC Org A';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}',true);
select is((select count(*)::integer from public.organizations),0,'capability requires MFA');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.organizations),1,'MFA plus explicit capability reads only scoped org');
select is((select count(*)::integer from public.organization_members),0,'org read admin cannot read membership roster');
select is((select count(*)::integer from public.patients),0,'admin capability grants no patient bypass');
select is((select count(*)::integer from public.profiles),1,'admin capability grants no profile bypass');
select ok((select count(*)>0 from public.audit_events),'explicit scoped audit capability reads events');
select ok(not exists(select 1 from public.audit_events where organization_id is distinct from current_setting('test.org_a_id')::uuid),'audit capability cannot read other tenant or global patient audits');
select throws_ok($$update public.admin_capabilities set capability='capability:manage'$$,'42501',null,'admin cannot widen own capability');
select throws_ok($$insert into public.audit_events(action,target_table,target_id) values('FORGED','profiles',auth.uid())$$,'42501',null,'client cannot forge audit');
select throws_ok($$delete from public.audit_events$$,'42501',null,'client cannot erase audit');
select throws_ok($$select private.audit_access_change()$$,'42501',null,'trigger helper cannot be called by client');

reset role;
select ok(exists(select 1 from public.audit_events where target_table='organization_members' and action='UPDATE' and after_state->>'status'='active'),'membership change audited');
select ok(exists(select 1 from public.audit_events where target_table='admin_capabilities' and action='INSERT'),'capability issuance audited');
select ok(not exists(select 1 from public.audit_events where before_state::text like '%example.invalid%' or after_state::text like '%example.invalid%'),'audit excludes contact payload');
update public.admin_capabilities set revoked_at=now() where capability='organization:read';
set local role authenticated;
select is((select count(*)::integer from public.organizations),0,'revocation takes effect despite same JWT');

reset role;
update public.admin_capabilities set valid_from=now()-interval '2 days',expires_at=now()-interval '1 day'
 where capability='audit:read';
set local role authenticated;
select is((select count(*)::integer from public.audit_events),0,'expired admin capability denies audit access');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.profiles),0,'disabled account denied profile read');
select throws_ok($$select public.onboard_self_patient()$$,'42501',null,'disabled account cannot onboard');
select throws_ok($$select public.create_organization('SYNTHETIC Disabled')$$,'42501',null,'disabled account cannot create org');

reset role;
-- A revoked or expired grant is checked live; idempotent onboarding must not repair it.
update public.patient_access set revoked_at=now()
 where grantee_profile_id='10000000-0000-0000-0000-000000000001';
update public.patient_access set valid_from=now()-interval '2 days',expires_at=now()-interval '1 day'
 where grantee_profile_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.patients),0,'revoked patient grant denies read');
select lives_ok($$select public.onboard_self_patient()$$,'onboarding replay returns existing identity');
select is((select count(*)::integer from public.patients),0,'onboarding replay does not restore revoked grant');
with changed as (update public.patients set display_name='ATTACK' returning id)
select is((select count(*)::integer from changed),0,'revoked patient grant denies update');
select throws_ok($$select public.set_organization_member('ffffffff-ffff-ffff-ffff-ffffffffffff','10000000-0000-0000-0000-000000000002','doctor','invited',array['organization:read'],0)$$,'42501',null,'outsider cannot invoke guessed organization mutation');
select throws_ok($$select public.accept_organization_invite('ffffffff-ffff-ffff-ffff-ffffffffffff',1)$$,'42501',null,'outsider cannot join guessed organization');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
select is((select count(*)::integer from public.patients),0,'expired patient grant denies read');

reset role;
-- Organization revocation invalidates even the same session and known organization ID.
update public.organization_members set status='disabled',disabled_at=now()
 where profile_id='10000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.organizations),0,'disabled membership denies organization read');
select is((select count(*)::integer from public.organization_members),1,'disabled member sees only own membership');
select throws_ok($$select public.accept_organization_invite((select organization_id from public.organization_members),3)$$,'42501',null,'disabled membership cannot reactivate itself');

reset role;
update public.organizations set status='disabled' where display_name='SYNTHETIC Org B';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
select is((select count(*)::integer from public.organizations),0,'disabled organization denies active owner');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.profiles$$,'42501',null,'anon profile read denied');
select throws_ok($$select * from public.patients$$,'42501',null,'anon patient read denied');
select throws_ok($$select * from public.organizations$$,'42501',null,'anon organization read denied');
select throws_ok($$select * from public.organization_members$$,'42501',null,'anon membership read denied');
select throws_ok($$select * from public.admin_capabilities$$,'42501',null,'anon capability read denied');
select throws_ok($$select * from public.patient_access$$,'42501',null,'anon patient access denied');
select throws_ok($$select * from public.audit_events$$,'42501',null,'anon audit read denied');
select throws_ok($$select public.onboard_self_patient()$$,'42501',null,'anon onboarding RPC denied');
select throws_ok($$select private.is_active_account()$$,'42501',null,'anon helper execute denied');
select throws_ok($$select public.create_organization('SYNTHETIC Denied')$$,'42501',null,'anon organization creation RPC denied');
select throws_ok($$select public.set_organization_member('ffffffff-ffff-ffff-ffff-ffffffffffff','10000000-0000-0000-0000-000000000001','doctor','invited',array['organization:read'],0)$$,'42501',null,'anon membership command execute denied');
select throws_ok($$select public.accept_organization_invite('ffffffff-ffff-ffff-ffff-ffffffffffff',1)$$,'42501',null,'anon invite acceptance execute denied');
select throws_ok($$select private.has_org_scope('ffffffff-ffff-ffff-ffff-ffffffffffff','organization:read')$$,'42501',null,'anon org helper execute denied');
select throws_ok($$select private.has_patient_scope('ffffffff-ffff-ffff-ffff-ffffffffffff','patient:read')$$,'42501',null,'anon patient helper execute denied');
select throws_ok($$select private.has_admin_capability('audit:read',null)$$,'42501',null,'anon admin helper execute denied');

reset role;
select hasnt_column('public','profiles','role','profile has no universal mutable role');
select throws_ok($$insert into public.patient_access(patient_id,grantee_profile_id,granted_by_profile_id)
 values(current_setting('test.patient_a_id')::uuid,'10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002')$$,
 '23503',null,'database FK prevents a trusted caller accidentally granting another patient');
select throws_ok($$insert into public.admin_capabilities(profile_id,capability,granted_by_profile_id,reason_code)
 values('10000000-0000-0000-0000-000000000005','capability:manage','10000000-0000-0000-0000-000000000005','SYNTHETIC_TEST')$$,
 '23514',null,'database rejects self-issued admin capability');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef
 and (p.proconfig is null or not ('search_path=""'=any(p.proconfig)))), 'all security definers pin empty search_path');
select ok(not has_table_privilege('authenticated','public.organization_members','INSERT'), 'client uses user JWT grants, never service role for membership insert');
select ok(not (select rolbypassrls or rolsuper from pg_roles where rolname='authenticated'),'authenticated API role cannot bypass RLS');
select ok(not pg_has_role('authenticated','service_role','MEMBER'),'authenticated client cannot inherit service_role');
select throws_ok($$update public.audit_events set action='DELETE'$$,'42501',null,'audit stays immutable even through trusted database updates');
select throws_ok($$truncate public.audit_events$$,'42501',null,'audit cannot be truncated through trusted SQL');

-- Review regressions: use a separate org so original tenant/count checks stay independent.
insert into auth.users(id,email,is_anonymous,raw_app_meta_data) values
 ('10000000-0000-0000-0000-000000000007','synthetic-anonymous@example.invalid',true,'{}'),
 ('10000000-0000-0000-0000-000000000008','synthetic-app-metadata@example.invalid',false,'{"role":"admin","roles":["admin"]}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated","is_anonymous":true}',true);
select ok(not private.is_active_account(),'anonymous Auth JWT is not an active account');
select throws_ok($$select public.onboard_self_patient()$$,'42501','active account required','anonymous Auth JWT cannot onboard a patient');
select throws_ok($$select public.create_organization('SYNTHETIC Anonymous Denied')$$,'42501','active account required','anonymous Auth JWT cannot create an organization');
select is((select count(*)::integer from public.profiles),0,'anonymous Auth JWT cannot read its profile');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}',true);
select is((select count(*)::integer from public.admin_capabilities),0,'raw app metadata admin role creates no capability');
select is((select count(*)::integer from public.organizations),0,'app metadata admin role grants no organization access');
select throws_ok($$select private.handle_new_user()$$,'42501',null,'client cannot execute signup trigger helper');
select throws_ok($$select private.touch_version()$$,'42501',null,'client cannot execute version trigger helper');
select throws_ok($$select private.reject_audit_mutation()$$,'42501',null,'client cannot execute audit protection trigger helper');
select throws_ok(format('delete from public.%I',t.name),'42501',null,format('client cannot delete %s',t.name))
 from (values ('profiles'),('patients'),('organizations'),('patient_access'),('admin_capabilities')) as t(name);

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.create_organization('SYNTHETIC Review Org')$$,'review organization creation succeeds');
select set_config('test.review_org_id',(select id::text from public.organizations where display_name='SYNTHETIC Review Org'),true);
with changed as (update public.organizations set display_name='SYNTHETIC Review Renamed' where id=current_setting('test.review_org_id')::uuid returning id)
select is((select count(*)::integer from changed),1,'organization rename changes exactly one row');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff','doctor','invited',array['organization:read'],0)$$,'42501','membership change denied','missing profile invitation uses generic denial');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000006','doctor','invited',array['organization:read'],0)$$,'42501','membership change denied','disabled profile invitation uses same generic denial');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000008','owner','invited',array['organization:read'],0)$$,'42501',null,'owner cannot invite another owner');
select lives_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000004','manager','invited',array['organization:read','members:read','members:manage'],0)$$,'owner invites manager with membership management scope');
select lives_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000002','manager','invited',array['organization:read','members:read','members:manage'],0)$$,'owner invites a peer manager');
select lives_ok(format('select public.set_organization_member(%L::uuid,%L::uuid,%L,%L,array[%L,%L],0)',current_setting('test.review_org_id'),t.id,'doctor','invited','organization:read','organization:update'),format('owner invites broader scoped member %s',t.id))
 from (values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000005'),('10000000-0000-0000-0000-000000000008')) as t(id);

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.accept_organization_invite(current_setting('test.review_org_id')::uuid,1)$$,'manager accepts management invitation');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000007','manager','invited',array['organization:read'],0)$$,'42501',null,'manager cannot invite another manager');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000003','doctor','disabled',array['organization:read'],1)$$,'42501',null,'manager cannot change owner membership');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000002','doctor','disabled',array['organization:read'],1)$$,'42501',null,'manager cannot change peer manager membership');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','disabled',array['organization:read'],1)$$,'42501',null,'manager cannot disable a member holding broader scopes');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000005','doctor','invited',array['organization:read'],1)$$,'42501',null,'manager cannot strip a member holding broader scopes');
select throws_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000008','technician','invited',array['organization:read'],1)$$,'42501',null,'manager cannot edit role of a member holding broader scopes');
select lives_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000007','doctor','invited',array['organization:read'],0)$$,'manager can invite a bounded ordinary member');
select lives_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000007','technician','invited',array['organization:read'],1)$$,'manager can edit a member within its current scopes');

reset role;
select is((select count(*)::integer from public.audit_events where target_id=current_setting('test.review_org_id')::uuid and action='UPDATE'
 and before_state->>'display_name'='SYNTHETIC Review Org' and after_state->>'display_name'='SYNTHETIC Review Renamed'),1,'rename audit preserves old and new organization names');
select ok(not exists(select 1 from public.audit_events where target_table in ('profiles','patients')
 and (before_state ? 'display_name' or after_state ? 'display_name')),'organization rename audit does not expose patient or profile names');
insert into public.admin_capabilities(profile_id,capability,reason_code) values
 ('10000000-0000-0000-0000-000000000005','organization:read','SYNTHETIC_GLOBAL'),
 ('10000000-0000-0000-0000-000000000005','audit:read','SYNTHETIC_GLOBAL');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}',true);
select is((select count(*)::integer from public.audit_events),0,'global audit capability still requires MFA');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal2"}',true);
select is((select count(*)::integer from public.organizations where id in (current_setting('test.org_a_id')::uuid,current_setting('test.review_org_id')::uuid)),2,'explicit global organization capability spans tenants');
select ok(exists(select 1 from public.audit_events where organization_id is null and target_table='patients'),'explicit global audit capability includes patient audit metadata');
select is((select count(*)::integer from public.patients),0,'global admin capabilities still grant no patient record access');
reset role;
update public.admin_capabilities set revoked_at=now() where reason_code='SYNTHETIC_GLOBAL';
update public.admin_capabilities set expires_at=null where capability='audit:read' and organization_id=current_setting('test.org_a_id')::uuid;
set local role authenticated;
select is((select count(*)::integer from public.audit_events where organization_id is null),0,'org scoped audit capability excludes global patient audits');
select is((select count(*)::integer from public.audit_events where organization_id=current_setting('test.review_org_id')::uuid),0,'org scoped audit capability excludes another tenant');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.set_organization_member(current_setting('test.review_org_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','invited',array['organization:read'],(select version from public.organization_members where organization_id=current_setting('test.review_org_id')::uuid and profile_id='10000000-0000-0000-0000-000000000001'))$$,'owner can change broader scoped non-owner member');
reset role;
update public.organizations set status='disabled' where id=current_setting('test.review_org_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.accept_organization_invite(current_setting('test.review_org_id')::uuid,(select version from public.organization_members where organization_id=current_setting('test.review_org_id')::uuid and profile_id=auth.uid()))$$,'42501','invitation unavailable','invitation cannot be accepted into a disabled organization');

reset role;
set local role service_role;
select throws_ok($$insert into public.audit_events(actor_profile_id,action,target_table,target_id) values('10000000-0000-0000-0000-000000000008','INSERT','profiles','10000000-0000-0000-0000-000000000008')$$,'42501',null,'service role cannot forge an audit event');
select ok(not has_table_privilege('service_role','public.audit_events','TRIGGER'),'service role cannot attach audit triggers');
select ok(not has_table_privilege('service_role','public.audit_events','REFERENCES'),'service role cannot create audit references');
reset role;
select lives_ok($$update public.profiles set status='disabled' where id='10000000-0000-0000-0000-000000000008'$$,'trusted profile update still executes audit trigger');
select ok(exists(select 1 from public.audit_events where target_table='profiles' and target_id='10000000-0000-0000-0000-000000000008' and after_state->>'status'='disabled'),'trusted definer still appends audit events after service role insert revoke');
-- Round 2: account suspension must not prevent permanent membership revocation.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.create_organization('SYNTHETIC Revocation Org')$$,'revocation test organization created');
select set_config('test.revocation_org_id',(select id::text from public.organizations where display_name='SYNTHETIC Revocation Org'),true);
select throws_ok(format('select public.set_organization_member(%L::uuid,%L::uuid,%L,%L,array[%L],0)',current_setting('test.revocation_org_id'),t.id,'owner','invited','organization:read'),
 '42501','membership change denied',format('invalid role denial does not reveal profile existence/status: %s',t.id))
 from (values ('ffffffff-ffff-ffff-ffff-ffffffffffff'),('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000006')) as t(id);
-- All targets have no membership here. Every invalid invite must give the same
-- literal code/message, including inputs that formerly leaked constraint details.
select throws_ok(format('select public.set_organization_member(%L::uuid,%L::uuid,%L,%L,%L::text[],%L::integer)',
 current_setting('test.revocation_org_id'),t.id,c.role,c.status,c.scopes,c.version),
 '42501','membership change denied',format('invalid new membership: %s / %s',c.name,t.kind))
 from (values
  ('empty scopes','doctor','invited','{}',0),
  ('null scopes','doctor','invited',null,0),
  ('null scope entry','doctor','invited','{organization:read,NULL}',0),
  ('multidimensional scopes','doctor','invited','{{organization:read},{organization:read}}',0),
  ('scope elevation','doctor','invited','{audit:read}',0),
  ('active status','doctor','active','{organization:read}',0),
  ('disabled status','doctor','disabled','{organization:read}',0),
  ('unknown status','doctor','unknown','{organization:read}',0),
  ('null status','doctor',null,'{organization:read}',0),
  ('positive version','doctor','invited','{organization:read}',1),
  ('negative version','doctor','invited','{organization:read}',-1),
  ('null version','doctor','invited','{organization:read}',null),
  ('unknown role','unknown','invited','{organization:read}',0),
  ('null role',null,'invited','{organization:read}',0)
 ) as c(name,role,status,scopes,version)
 cross join (values
  ('missing profile','ffffffff-ffff-ffff-ffff-ffffffffffff'),
  ('active profile','10000000-0000-0000-0000-000000000001'),
  ('disabled profile','10000000-0000-0000-0000-000000000006')
 ) as t(kind,id);
select is((select count(*)::integer from public.organization_members where organization_id=current_setting('test.revocation_org_id')::uuid),1,'invalid invitations create no memberships');
-- A database check added later must not expose constraint names or rejected rows.
reset role;
alter table public.organization_members add constraint i01_synthetic_invite_check check (membership_role<>'billing');
set local role authenticated;
select throws_ok($$select public.set_organization_member(current_setting('test.revocation_org_id')::uuid,'10000000-0000-0000-0000-000000000001','billing','invited',array['organization:read'],0)$$,'42501','membership change denied','database check violations at membership command boundary are generic');
reset role;
alter table public.organization_members drop constraint i01_synthetic_invite_check;
set local role authenticated;
select lives_ok($$select public.set_organization_member(current_setting('test.revocation_org_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','invited',array['organization:read'],0)$$,'owner invites revocation test member');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.accept_organization_invite(current_setting('test.revocation_org_id')::uuid,1)$$,'revocation test member accepts invitation');
select ok(private.has_org_scope(current_setting('test.revocation_org_id')::uuid,'organization:read'),'revocation test member initially has organization access');
reset role;
update public.profiles set status='disabled' where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.set_organization_member(current_setting('test.revocation_org_id')::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff','doctor','disabled',array['organization:read'],0)$$,'42501','membership change denied','revocation still requires an existing target profile');
select throws_ok($$select public.set_organization_member(current_setting('test.revocation_org_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','invited',array['organization:read'],2)$$,'42501','membership change denied','suspended member cannot be reinvited');
select throws_ok($$select public.set_organization_member(current_setting('test.revocation_org_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','active',array['organization:read'],2)$$,'42501','membership change denied','suspended member cannot be kept active');
select throws_ok($$select public.set_organization_member(current_setting('test.revocation_org_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','disabled',array['organization:read'],1)$$,'40001','membership version conflict','suspended member revocation still checks expected version');
select lives_ok($$select public.set_organization_member(current_setting('test.revocation_org_id')::uuid,'10000000-0000-0000-0000-000000000001','doctor','disabled',array['organization:read'],2)$$,'owner can revoke membership while target account is disabled');
select is((select status from public.organization_members where organization_id=current_setting('test.revocation_org_id')::uuid and profile_id='10000000-0000-0000-0000-000000000001'),'disabled','revocation persists disabled membership');
reset role;
update public.profiles set status='active' where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
select ok(private.is_active_account(),'revoked member account can be re-enabled');
select is((select status from public.organization_members where organization_id=current_setting('test.revocation_org_id')::uuid and profile_id=auth.uid()),'disabled','membership remains disabled after account is re-enabled');
select ok(not private.has_org_scope(current_setting('test.revocation_org_id')::uuid,'organization:read'),'account re-enablement does not restore revoked organization access');
select throws_ok($$select public.accept_organization_invite(current_setting('test.revocation_org_id')::uuid,3)$$,'42501','invitation unavailable','re-enabled account cannot reactivate revoked membership');

-- The Auth row also denies anonymous users when token hooks omit or alter the claim.
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated","aal":"aal1"}',true);
select ok(not private.is_active_account(),'anonymous Auth row denied when JWT claim is omitted');
select throws_ok($$select public.onboard_self_patient()$$,'42501','active account required','anonymous Auth row cannot onboard without JWT anonymous claim');
select throws_ok($$select public.create_organization('SYNTHETIC Missing Claim Denied')$$,'42501','active account required','anonymous Auth row cannot create organization without JWT anonymous claim');
select is((select count(*)::integer from public.profiles),0,'anonymous Auth row cannot read profile without JWT anonymous claim');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated","is_anonymous":false}',true);
select ok(not private.is_active_account(),'false JWT claim cannot override anonymous Auth row');
reset role;
select * from finish();
rollback;
