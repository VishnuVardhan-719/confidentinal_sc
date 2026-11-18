\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
create function pg_temp.assert_owner_role(category text,expected boolean) returns void language plpgsql as $$
declare previous text := current_setting('request.jwt.claims'); begin
  perform set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
  perform pg_temp.assert_true(exists(select 1 from public.identity_roles() r where r=category)=expected,'provider role '||category||' expected '||expected);
  perform set_config('request.jwt.claims',previous,true);
end $$;
insert into auth.users(id,email) values
 ('12000000-0000-4000-8000-000000000001','i02-owner@example.invalid'),
 ('12000000-0000-4000-8000-000000000002','i02-outsider@example.invalid'),
 ('12000000-0000-4000-8000-000000000003','i02-admin@example.invalid'),
 ('12000000-0000-4000-8000-000000000004','i02-manager@example.invalid'),
 ('12000000-0000-4000-8000-000000000005','i02-suspender@example.invalid'),
 ('12000000-0000-4000-8000-000000000006','i02-details-owner@example.invalid');
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('12000000-0000-4000-8000-000000000003','provider:verify','global','12000000-0000-4000-8000-000000000001'),
 ('12000000-0000-4000-8000-000000000001','provider:verify','global','12000000-0000-4000-8000-000000000003'),
 ('12000000-0000-4000-8000-000000000005','provider:suspend','global','12000000-0000-4000-8000-000000000001');
insert into public.organizations(id,name) values
 ('22000000-0000-4000-8000-000000000001','Synthetic I02 A'),
 ('22000000-0000-4000-8000-000000000002','Synthetic I02 B');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','owner','active',now(),array['provider:read','provider:manage','evidence:manage']),
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000004','manager','active',now(),array['provider:read','provider:manage','evidence:manage']),
 ('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','owner','active',now(),array['provider:read','provider:manage','evidence:manage']);

select pg_temp.assert_true((select count(*)=3 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('provider_profiles','provider_documents','provider_verification_events') and c.relrowsecurity),'all new tables have RLS');
select pg_temp.assert_true((select not public and file_size_limit=5242880 from storage.buckets where id='provider-verification'),'private bounded bucket');
select pg_temp.assert_true(not has_function_privilege('anon','public.review_provider(uuid,text,text,integer)','EXECUTE'),'guest cannot review');
select pg_temp.assert_true(not has_function_privilege('authenticated','providers_private.lock_provider(uuid)','EXECUTE'),'private mutator not callable');
do $$ declare f record; begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  n.nspname='providers_private' or (n.nspname='public' and p.proname in ('create_provider','update_provider','add_provider_document','submit_provider','review_provider','provider_is_publishable')) loop
  perform pg_temp.assert_true(exists(select 1 from unnest(f.proconfig) x where x in ('search_path=""','search_path=')),f.proname||' pinned search path');
  perform pg_temp.assert_true(not exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),f.proname||' no PUBLIC execute');
 end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select public.create_provider('doctor','Synthetic doctor','',null) as doctor \gset
select public.create_provider('lab','Synthetic lab','','22000000-0000-4000-8000-000000000001') as lab \gset
select public.create_provider('ambulance','Synthetic transport','',null) as ambulance \gset
select public.create_provider('caretaker','Synthetic care','',null) as caretaker \gset
-- I02 hardening 20261117000640: category details and the private-details split.
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000006","aal":"aal1"}',true);
select public.create_provider('doctor','Synthetic details doctor','',null) as details \gset
select pg_temp.expect_state(format('select public.set_provider_details(%L,''{"clinical_notes":"x"}'',''{}'',1)',:'details'),'22023','unknown public detail key denied');
select pg_temp.expect_state(format('select public.set_provider_details(%L,''{}'',''{"permit_number":"SYN-1"}'',1)',:'details'),'22023','private key outside the doctor allowlist denied');
select pg_temp.expect_state(format('select public.set_provider_details(%L,''{"years_experience":"5"}'',''{}'',1)',:'details'),'22023','mistyped detail value denied');
select public.set_provider_details(:'details','{"specialty":"Synthetic general practice","languages":["English"],"years_experience":5}','{"registration_number":"SYN-REG-0001","private_phone":"+919000000001"}',1);
select pg_temp.expect_state(format('select public.set_provider_details(%L,''{}'',''{}'',1)',:'details'),'40001','stale details version denied');
select pg_temp.assert_true((select specialty='Synthetic general practice' and languages=array['English'] and years_experience=5 from public.doctor_profiles where provider_id=:'details'),'owner reads own category details');
select pg_temp.assert_true((select registration_number='SYN-REG-0001' and private_phone='+919000000001' from public.provider_private_details where provider_id=:'details'),'owner reads own private details');
-- CodeRabbit finding 2: a keyed replay returns the original only when every argument matches.
select (public.add_provider_document(:'details','registration','application/pdf',now()+interval '1 year',2,'72000000-0000-4000-8000-0000000000d1')->'document'->>'id') as keyed_doc \gset
select pg_temp.assert_true((public.add_provider_document(:'details','registration','application/pdf',now()+interval '1 year',2,'72000000-0000-4000-8000-0000000000d1')->'document'->>'id')=:'keyed_doc','exact keyed replay returns the same reservation');
select pg_temp.expect_state(format('select public.add_provider_document(%L,''licence'',''application/pdf'',now()+interval ''1 year'',2,''72000000-0000-4000-8000-0000000000d1'')',:'details'),'23505','keyed replay with a different kind conflicts');
select pg_temp.expect_state(format('select public.add_provider_document(%L,''registration'',''image/png'',now()+interval ''1 year'',2,''72000000-0000-4000-8000-0000000000d1'')',:'details'),'23505','keyed replay with a different content type conflicts');
select pg_temp.expect_state(format('select public.add_provider_document(%L,''registration'',''application/pdf'',now()+interval ''2 years'',2,''72000000-0000-4000-8000-0000000000d1'')',:'details'),'23505','keyed replay with a different expiry conflicts');
select pg_temp.expect_state(format('select public.add_provider_document(%L,''registration'',''application/pdf'',now()+interval ''1 year'',3,''72000000-0000-4000-8000-0000000000d1'')',:'details'),'23505','keyed replay with a different version conflicts');
select pg_temp.assert_true((select version=3 from public.providers where id=:'details'),'replays and conflicts do not advance the version');
select pg_temp.assert_true((select count(*)=1 from public.provider_documents where provider_id=:'details'),'replays and conflicts create no extra reservation');
-- 20261117000670 finding 4: a replay reports the current version and never revives a replaced reservation.
select public.set_provider_details(:'details','{"specialty":"Synthetic general practice","languages":["English"],"years_experience":5}','{"registration_number":"SYN-REG-0001","private_phone":"+919000000001"}',3);
select pg_temp.assert_true((public.add_provider_document(:'details','registration','application/pdf',now()+interval '1 year',2,'72000000-0000-4000-8000-0000000000d1')->>'provider_version')::int=4,'keyed replay reports the current provider version');
select (public.add_provider_document(:'details','registration','application/pdf',now()+interval '1 year',4)->'document'->>'id') as details_registration \gset
select pg_temp.assert_true((select status='superseded' from public.provider_documents where id=:'keyed_doc'),'new reservation supersedes the keyed one');
select pg_temp.expect_state(format('select public.add_provider_document(%L,''registration'',''application/pdf'',now()+interval ''1 year'',2,''72000000-0000-4000-8000-0000000000d1'')',:'details'),'40001','replay of a superseded reservation conflicts');
reset role;
-- 20261117000620: server-allocated, category-prefixed, unique, immutable public reference.
select pg_temp.assert_true((select bool_and(public_reference ~ ('^SCV-'||case category when 'doctor' then 'DOC' when 'lab' then 'LAB' when 'ambulance' then 'AMB' else 'CARE' end||'-[0-9]{6,19}$'))
 from public.providers where id in (:'doctor',:'lab',:'ambulance',:'caretaker',:'details')),'reference prefix follows category');
select pg_temp.assert_true((select count(distinct public_reference)=5 from public.providers where id in (:'doctor',:'lab',:'ambulance',:'caretaker',:'details')),'references are unique');
select pg_temp.expect_state(format('update public.providers set public_reference=''SCV-DOC-999999'' where id=%L',:'doctor'),'55000','reference immutable even for privileged SQL');
insert into public.providers(id,individual_owner_profile_id,category,public_reference)
 values('42000000-0000-4000-8000-0000000000f1','12000000-0000-4000-8000-000000000006','caretaker','SCV-CARE-424242424');
select pg_temp.assert_true((select public_reference<>'SCV-CARE-424242424' and public_reference ~ '^SCV-CARE-' from public.providers where id='42000000-0000-4000-8000-0000000000f1'),'caller-supplied reference ignored');
select pg_temp.assert_true(providers_private.format_reference('DOC',7)='SCV-DOC-000007' and providers_private.format_reference('DOC',999999)='SCV-DOC-999999'
 and providers_private.format_reference('DOC',1000000)='SCV-DOC-1000000','finding 3: six digits is a minimum width, never truncated');
select pg_temp.assert_true(not has_table_privilege('authenticated','providers_private.reference_counters','SELECT,UPDATE'),'reference counters not client accessible');
-- The public snapshot is an allowlist: no private-details value ever reaches it.
select pg_temp.assert_true((select s->>'display_name'='Synthetic details doctor' and s->>'specialty'='Synthetic general practice'
 and not (s ? 'registration_number') and not (s ? 'private_phone') and s::text not like '%SYN-REG%' and s::text not like '%+91%'
 from providers_private.build_public_snapshot(:'details','doctor') s),'public snapshot excludes private details');
select pg_temp.assert_true((select published_profile is null and published_at is null from public.providers where id=:'details'),'unapproved provider has no published snapshot');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select pg_temp.assert_true(not public.provider_is_publishable(:'doctor'),'draft not publishable');
-- I01 organization creators have active owner membership without invite acceptance.
select public.create_organization('Synthetic fresh org','32000000-0000-4000-8000-000000000001') as fresh_org \gset
select public.create_provider('lab','Synthetic fresh org lab','',:'fresh_org');
select pg_temp.assert_owner_role('doctor',false);
select pg_temp.expect_state(format('select public.add_provider_document(%L,''registration'',''application/pdf'',now()+interval ''6 years'',1)',:'doctor'),'22023','expiry above five years denied');
select pg_temp.expect_state(format('update public.providers set verification_state=''approved'' where id=%L',:'doctor'),'42501','direct self approval denied');
select pg_temp.expect_state(format('select public.submit_provider(%L,1)',:'doctor'),'23514','missing credential blocks submission');
select pg_temp.expect_state(format('select public.add_provider_document(%L,''registration'',''application/pdf'',now()-interval ''1 day'',1)',:'doctor'),'22023','expired metadata rejected');
select (public.add_provider_document(:'doctor','registration','application/pdf',now()+interval '1 year',1)->'document'->>'id') as doc \gset
select pg_temp.expect_state(format('select public.submit_provider(%L,2)',:'doctor'),'23514','metadata without uploaded bytes blocks submission');
-- The same direct INSERT represents the Storage service write under the user JWT.
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'doc';
select set_config('storage.operation','storage.object.sign',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'single signing blocked for owner');
select set_config('storage.operation','storage.object.sign_many',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'batch signing blocked for owner');
select set_config('storage.operation','storage.object.sign_upload_url',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'upload signing blocked for owner');
select set_config('storage.operation','storage.object.get_authenticated',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'download without a read ticket denied');
select count(*) from public.authorize_provider_document_read(:'doc','owner_view');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'authenticated owner download allowed with live ticket');
select set_config('storage.operation','',true);
select pg_temp.expect_state('insert into storage.objects(bucket_id,name) values(''provider-verification'',''person-name.pdf'')','42501','unreserved filename denied');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'owner reads own object');
update storage.objects set metadata='{}' where bucket_id='provider-verification';
select pg_temp.assert_true((select metadata is null from storage.objects limit 1),'object overwrite denied');
select pg_temp.expect_state(format('select public.update_provider(%L,''Synthetic'','''',1)',:'doctor'),'40001','stale version denied');
select public.submit_provider(:'doctor',2);
select pg_temp.assert_owner_role('doctor',false);
select pg_temp.expect_state('select actor_profile_id from public.provider_verification_events','42501','owner cannot select reviewer identity');
select pg_temp.expect_state('select reason from public.provider_verification_events','42501','owner cannot select internal reason');
select pg_temp.assert_true((select public_reason='Application submitted.' from public.provider_verification_events where provider_id=:'doctor'),'owner receives safe public reason');
select pg_temp.expect_state(format('select public.update_provider(%L,''Synthetic'','''',3)',:'doctor'),'42501','submitted edits denied');
select pg_temp.expect_state(format('select public.set_provider_details(%L,''{}'',''{}'',3)',:'doctor'),'42501','submitted detail edits denied');
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Self review'',3)',:'doctor'),'42501','self review denied despite admin capability');
select (public.add_provider_document(:'lab','licence','application/pdf',now()+interval '1 year',1)->'document'->>'id') as labdoc \gset
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'labdoc';

select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from public.provider_documents),'cross org document read denied');
select pg_temp.assert_true((select count(*)=0 from storage.objects),'cross org object read denied');
select pg_temp.assert_true((select count(*)=0 from public.provider_profiles),'wrong user profile hidden');
select pg_temp.assert_true((select count(*)=0 from public.doctor_profiles) and (select count(*)=0 from public.provider_private_details),'wrong user category and private details hidden');
select pg_temp.expect_state(format('select public.authorize_provider_document_read(%L,''owner_view'')',:'doc'),'42501','wrong user cannot obtain a read ticket');
select pg_temp.expect_state(format('select public.submit_provider(%L,3)',:'doctor'),'42501','wrong user mutation denied');
select pg_temp.expect_state(format('select public.create_provider(''lab'',''Synthetic'','''',%L)','22000000-0000-4000-8000-000000000001'),'42501','cross org creation denied');

select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
select pg_temp.assert_true((select count(*)=1 from public.provider_documents),'active scoped org manager reads evidence');
select count(*) from public.authorize_provider_document_read(:'labdoc','owner_view');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'active scoped org manager reads object');
reset role;
update public.organization_members set status='disabled' where profile_id='12000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.provider_documents),'disabled member evidence denied');
select pg_temp.assert_true((select count(*)=0 from storage.objects),'disabled member object denied');

select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Synthetic review'',3)',:'doctor'),'42501','aal1 admin denied');
select pg_temp.assert_true((select count(*)=0 from public.provider_documents),'aal1 admin evidence denied');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=1 from public.provider_documents),'verifier cannot read draft evidence');
select public.review_provider(:'doctor','under_review','Synthetic review started',3);
select pg_temp.assert_owner_role('doctor',false);
-- 20261117000660: provider:verify decides but opens no files; provider:suspend
-- neither decides nor opens files; provider:document_read opens files only while the
-- case is under review and only through a live, audited 60 s ticket.
select pg_temp.expect_state(format('select public.authorize_provider_document_read(%L,''admin_review'')',:'doc'),'42501','verify capability alone cannot open evidence');
select pg_temp.expect_state(format('select public.authorize_provider_document_read(%L,''owner_view'')',:'doc'),'42501','reviewer cannot use the owner purpose');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000005","aal":"aal2"}',true);
select pg_temp.expect_state(format('select public.review_provider(%L,''approved'',''Suspender only'',4)',:'doctor'),'42501','suspend capability alone cannot approve');
select pg_temp.expect_state(format('select public.authorize_provider_document_read(%L,''admin_review'')',:'doc'),'42501','suspend capability alone cannot open evidence');
reset role;
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('12000000-0000-4000-8000-000000000003','provider:document_read','global','12000000-0000-4000-8000-000000000001');
insert into providers_private.document_read_tickets(document_id,object_name,grantee_profile_id,purpose,created_at,expires_at)
 select id,object_name,'12000000-0000-4000-8000-000000000003','admin_review',now()-interval '2 minutes',now()-interval '1 minute'
 from public.provider_documents where id=:'doc';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
select pg_temp.expect_state(format('select public.authorize_provider_document_read(%L,''admin_review'')',:'doc'),'42501','aal1 document reader denied');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from storage.objects),'expired read ticket opens nothing');
select pg_temp.assert_true((select bucket='provider-verification' and object_path=(select object_name from public.provider_documents where id=:'doc')
 and ticket_expires_at=now()+interval '60 seconds' from public.authorize_provider_document_read(:'doc','admin_review')),'ticket names the exact object and a 60 s expiry');
select pg_temp.assert_true((select count(*)=1 from storage.objects),'document reader opens evidence under review with a live ticket');
select pg_temp.expect_state(format('select public.review_provider(%L,''approved'',''Stale'',3)',:'doctor'),'40001','stale review denied');
select public.review_provider(:'doctor','approved','Synthetic evidence checked',4);
select pg_temp.assert_true(public.provider_is_publishable(:'doctor'),'approved with valid evidence publishable');
select pg_temp.assert_owner_role('doctor',true);
select pg_temp.assert_true((select reviewed_document_ids=array[:'doc'::uuid] from public.provider_verification_events where provider_id=:'doctor' and to_state='approved'),'approval records exact document IDs');
select pg_temp.assert_true((select count(*)=0 from storage.objects),'live reviewer ticket stops working once the case leaves review');
select pg_temp.expect_state('select actor_profile_id from public.provider_verification_events','42501','reviewer identity not exposed');
select pg_temp.expect_state('select reason from public.provider_verification_events','42501','internal review reason not exposed');
select pg_temp.assert_true((select public_reason='Application approved.' from public.provider_verification_events where provider_id=:'doctor' and to_state='approved'),'safe public reason available');
reset role;
update public.provider_documents set expires_at=now()-interval '1 second' where id=:'doc';
set local role authenticated;
select pg_temp.assert_true(not public.provider_is_publishable(:'doctor'),'expired credential auto blocks publication');
select pg_temp.assert_owner_role('doctor',false);
select pg_temp.assert_owner_role('doctor',false);
reset role;
update public.provider_documents set expires_at=now()+interval '1 year' where id=:'doc';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_provider(%L,''suspended'',''Verifier only'',5)',:'doctor'),'42501','verify capability alone cannot suspend');
reset role;
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('12000000-0000-4000-8000-000000000003','provider:suspend','global','12000000-0000-4000-8000-000000000001');
set local role authenticated;
select public.review_provider(:'doctor','suspended','Synthetic suspension',5);
select pg_temp.assert_true(not public.provider_is_publishable(:'doctor'),'suspended provider not publishable');
select pg_temp.assert_owner_role('doctor',false);
select pg_temp.assert_true((select count(*)=4 from public.provider_verification_events where provider_id=:'doctor'),'every transition has an event');
select pg_temp.expect_state(format('delete from public.provider_verification_events where provider_id=%L',:'doctor'),'42501','events immutable');
reset role;
select pg_temp.expect_state(format('update public.providers set status=''active'' where id=%L',:'doctor'),'23514','active requires approval');
select pg_temp.expect_state(format('update public.audit_events set action=''tampered'' where target_id=%L',:'doctor'),'55000','audit update immutable even for privileged SQL');
select pg_temp.expect_state(format('delete from public.audit_events where target_id=%L',:'doctor'),'55000','audit delete immutable even for privileged SQL');
select pg_temp.expect_state(format('update public.provider_verification_events set reason=''tampered'' where provider_id=%L',:'doctor'),'55000','verification update immutable');
select pg_temp.expect_state(format('delete from public.provider_verification_events where provider_id=%L',:'doctor'),'55000','verification delete immutable');
select pg_temp.assert_true((select count(*)=4 from public.audit_events where target_id=:'doctor' and action in ('provider.submitted','provider.under_review','provider.approved','provider.suspended')),'every transition audited');
-- Every authorized file read leaves an audit row and an immutable 60 s ticket.
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='provider.document_read_owner_view' and target_id=:'doc' and actor_profile_id='12000000-0000-4000-8000-000000000001'),'owner file read audited');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='provider.document_read_admin_review' and target_id=:'doc' and actor_profile_id='12000000-0000-4000-8000-000000000003'),'reviewer file read audited');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='provider.document_read_owner_view' and target_id=:'labdoc' and actor_profile_id='12000000-0000-4000-8000-000000000004'),'manager file read audited');
select pg_temp.assert_true((select count(*)=0 from public.audit_events where action like 'provider.document_read_%' and target_id=:'doc' and actor_profile_id in ('12000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000005')),'denied ticket requests leave no read audit');
select pg_temp.assert_true((select count(*)=4 and bool_and(expires_at=created_at+interval '60 seconds') from providers_private.document_read_tickets where document_id in (:'doc',:'labdoc')),'tickets issued only on authorized requests and live 60 s');
select pg_temp.expect_state(format('update providers_private.document_read_tickets set expires_at=expires_at+interval ''1 hour'' where document_id=%L',:'doc'),'55000','read tickets cannot be extended');
select pg_temp.expect_state(format('delete from providers_private.document_read_tickets where document_id=%L',:'doc'),'55000','read tickets cannot be deleted');
update public.admin_capabilities set revoked_at=now() where profile_id='12000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Revoked'',6)',:'doctor'),'42501','revoked admin denied');
reset role;
update public.admin_capabilities set revoked_at=null,expires_at=now()-interval '1 second',valid_from=now()-interval '1 day'
 where profile_id='12000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Expired admin'',6)',:'doctor'),'42501','expired admin denied');
reset role;
update public.admin_capabilities set expires_at=null,valid_from=now()+interval '1 day'
 where profile_id='12000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Future admin'',6)',:'doctor'),'42501','future admin denied');
reset role;
update public.admin_capabilities set valid_from=now(),scope_key='org:22000000-0000-4000-8000-000000000002'
 where profile_id='12000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Wrong scope'',6)',:'doctor'),'42501','wrong admin org scope denied');
reset role;
update public.admin_capabilities set scope_key='global' where profile_id='12000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select public.submit_provider(:'lab',2);
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Own org'',3)',:'lab'),'42501','org owner self review denied');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select public.review_provider(:'lab','under_review','Review synthetic lab',3);
select public.review_provider(:'lab','rejected','Synthetic document correction required',4);
select pg_temp.assert_true(not public.provider_is_publishable(:'lab'),'rejected provider not publishable');
select pg_temp.assert_owner_role('lab',false);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select public.update_provider(:'lab','Synthetic corrected lab','',5);
select (public.add_provider_document(:'lab','licence','application/pdf',now()+interval '1 year',6)->'document'->>'id') as replacement \gset
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'replacement';
select public.submit_provider(:'lab',7);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select public.review_provider(:'lab','under_review','Synthetic resubmission',8);
select public.review_provider(:'lab','approved','Synthetic corrected evidence checked',9);
select pg_temp.assert_true(public.provider_is_publishable(:'lab'),'corrected resubmission can publish');
reset role;
update public.organizations set status='disabled' where id='22000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.provider_is_publishable(:'lab'),'disabled org blocks publication');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select (public.add_provider_document(:'caretaker','background_check','application/pdf',now()+interval '1 year',1)->'document'->>'id') as stale \gset
reset role;
update public.provider_documents set expires_at=now()-interval '1 second' where id=:'stale';
set local role authenticated;
select (public.add_provider_document(:'caretaker','background_check','application/pdf',now()+interval '1 year',2)->'document'->>'id') as fresh \gset
select pg_temp.assert_true((select status='superseded' from public.provider_documents where id=:'stale'),'expired evidence superseded');
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'fresh';
select public.submit_provider(:'caretaker',3);
select pg_temp.assert_true((select verification_state='submitted' from public.providers where id=:'caretaker'),'replacement fixes expired draft');
-- Historical rejected/superseded rows do not consume the live-document cap.
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
select public.create_provider('caretaker','Synthetic cap regression','') as cap_provider \gset
reset role;
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
select id,:'cap_provider','12000000-0000-4000-8000-000000000002','identity',
  :'cap_provider'||'/'||id::text||'.pdf','application/pdf',
  case when n <= 25 then 'rejected' else 'superseded' end,now()+interval '1 year'
from (select gen_random_uuid() as id,n from generate_series(1,50) n) fixtures;
set local role authenticated;
select pg_temp.assert_true((public.add_provider_document(:'cap_provider','registration','application/pdf',now()+interval '1 year',1)->>'provider_version')::int=2,'historical rows do not consume document cap');
reset role;
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
select id,:'cap_provider','12000000-0000-4000-8000-000000000002','identity',
  :'cap_provider'||'/'||id::text||'.pdf','application/pdf',
  case when n <= 24 then 'pending' else 'verified' end,now()+interval '1 year'
from (select gen_random_uuid() as id,n from generate_series(1,49) n) fixtures;
set local role authenticated;
select pg_temp.expect_state(format('select public.add_provider_document(%L,''licence'',''application/pdf'',now()+interval ''1 year'',2)',:'cap_provider'),'23514','50 pending and verified documents enforce cap');
select pg_temp.assert_true((select version=2 from public.providers where id=:'cap_provider'),'cap rejection preserves provider version');
-- Unuploaded optional reservations must not block submit, approval or re-approval.
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select public.add_provider_document(:'ambulance','identity','application/pdf',now()+interval '1 year',1) as reserve \gset
select pg_temp.assert_true((:'reserve'::jsonb->>'provider_version')::int=2,'reservation returns authoritative version');
select (:'reserve'::jsonb->'document'->>'id') as optional_doc \gset
select (public.add_provider_document(:'ambulance','vehicle_permit','application/pdf',now()+interval '1 year',2)->'document'->>'id') as permit \gset
select pg_temp.expect_state(format('select public.submit_provider(%L,3)',:'ambulance'),'23514','required reservation without bytes still blocks submission');
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'permit';
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'optional_doc';
reset role;
update public.provider_documents set expires_at=now()-interval '1 second' where id=:'optional_doc';
set local role authenticated;
select pg_temp.expect_state(format('select public.submit_provider(%L,3)',:'ambulance'),'23514','expired uploaded optional evidence still blocks submission');
reset role;
update storage.objects set name=name||'.missing' where bucket_id='provider-verification' and name=(select object_name from public.provider_documents where id=:'optional_doc');
set local role authenticated;
select public.submit_provider(:'ambulance',3);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select public.review_provider(:'ambulance','under_review','Synthetic transport review',4);
select public.review_provider(:'ambulance','approved','Synthetic transport evidence reviewed',5);
select pg_temp.assert_true((select reviewed_document_ids=array[:'permit'::uuid] from public.provider_verification_events where provider_id=:'ambulance' and to_state='approved'),'approval snapshots only uploaded pending evidence');
reset role;
select pg_temp.assert_true((select status='pending' from public.provider_documents where id=:'optional_doc'),'unuploaded optional evidence is not verified');
update storage.objects set name=name||'.missing' where bucket_id='provider-verification' and name=(select object_name from public.provider_documents where id=:'permit');
select pg_temp.assert_true(not public.provider_is_publishable(:'ambulance'),'verified required evidence must retain its object');
update storage.objects set name=(select object_name from public.provider_documents where id=:'permit') where bucket_id='provider-verification' and name=(select object_name||'.missing' from public.provider_documents where id=:'permit');
set local role authenticated;
select public.review_provider(:'ambulance','suspended','Synthetic suspension',6);
select public.review_provider(:'ambulance','under_review','Synthetic re-review',7);
select public.review_provider(:'ambulance','approved','Synthetic re-approval',8);
select pg_temp.assert_true(public.provider_is_publishable(:'ambulance'),'optional reservation does not block re-approval');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.provider_documents d where provider_id=:'ambulance' and status='verified' and not exists(select 1 from storage.objects o where o.bucket_id=d.bucket_id and o.name=d.object_name)),'no verified metadata without bytes');
set local role authenticated;
-- I01 can contain provider skeletons without an I02 provider_profiles row.
reset role;
insert into public.providers(id,individual_owner_profile_id,category)
  values('42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','doctor');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select pg_temp.expect_state('select public.update_provider(''42000000-0000-4000-8000-000000000001'',''Unauthorized'','''',1)','42501','other user cannot create legacy profile');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
select pg_temp.assert_true((select count(*)=0 from public.provider_profiles where provider_id='42000000-0000-4000-8000-000000000001'),'legacy skeleton starts without profile');
select pg_temp.assert_true((public.update_provider('42000000-0000-4000-8000-000000000001','Synthetic legacy doctor','Synthetic description',1)).version=2,'legacy update advances version');
select pg_temp.assert_true((select display_name='Synthetic legacy doctor' and description='Synthetic description' from public.provider_profiles where provider_id='42000000-0000-4000-8000-000000000001'),'legacy update creates missing profile');
select public.update_provider('42000000-0000-4000-8000-000000000001','Synthetic revised doctor','Updated description',2);
select pg_temp.expect_state('select public.update_provider(''42000000-0000-4000-8000-000000000001'',''Stale overwrite'','''',1)','40001','legacy upsert rejects stale version');
select pg_temp.assert_true((select display_name='Synthetic revised doctor' and description='Updated description' from public.provider_profiles where provider_id='42000000-0000-4000-8000-000000000001'),'stale request leaves legacy profile unchanged');
select pg_temp.assert_true((select count(*)=1 from public.provider_profiles where provider_id='42000000-0000-4000-8000-000000000001'),'repeated edit updates one profile');
select pg_temp.expect_state('select public.update_provider(''42000000-0000-4000-8000-000000000001'',''Stale'','''',1)','40001','legacy profile preserves version checks');
-- Complete uploaded credentials do not substitute for an onboarding profile.
reset role;
insert into public.providers(id,individual_owner_profile_id,category)
  values('42000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','lab');
set local role authenticated;
select (public.add_provider_document('42000000-0000-4000-8000-000000000002','licence','application/pdf',now()+interval '1 year',1)->'document'->>'id') as legacy_licence \gset
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'legacy_licence';
select pg_temp.expect_state('select public.submit_provider(''42000000-0000-4000-8000-000000000002'',2)','23514','legacy submission requires profile despite uploaded credential');
select pg_temp.assert_true((select verification_state='draft' and version=2 from public.providers where id='42000000-0000-4000-8000-000000000002'),'missing profile denial preserves state and version');
select pg_temp.assert_true((select count(*)=0 from public.provider_verification_events where provider_id='42000000-0000-4000-8000-000000000002'),'missing profile denial emits no transition');
reset role;
select pg_temp.assert_true((select count(*)=0 from public.audit_events where target_id='42000000-0000-4000-8000-000000000002' and action='provider.submitted'),'missing profile denial emits no submission audit');
set local role authenticated;
select public.update_provider('42000000-0000-4000-8000-000000000002','Synthetic legacy lab','',2);
select pg_temp.assert_true((public.submit_provider('42000000-0000-4000-8000-000000000002',3)).verification_state='submitted','legacy submission succeeds after profile creation');
reset role;
-- 20261117000650: canonical 'expired' state, moved only by the service-role job.
select pg_temp.assert_true(has_function_privilege('service_role','public.expire_due_providers()','EXECUTE')
 and not has_function_privilege('authenticated','public.expire_due_providers()','EXECUTE')
 and not has_function_privilege('anon','public.expire_due_providers()','EXECUTE'),'expiry job is service_role only');
select pg_temp.assert_true((select verification_state='approved' and published_profile is not null from public.providers where id=:'ambulance'),'approved provider carries a published snapshot');
update public.provider_documents set expires_at=now()-interval '1 second' where id=:'permit';
select pg_temp.assert_true(public.expire_due_providers()>=1,'expiry job moves due providers');
select pg_temp.assert_true((select verification_state='expired' and status='inactive' and published_profile is null and published_at is null from public.providers where id=:'ambulance'),'expired provider is inactive and unpublished');
select pg_temp.assert_true((select status='expired' from public.provider_documents where id=:'permit'),'expired verified document marked expired');
select pg_temp.assert_true((select status='pending' from public.provider_documents where id=:'optional_doc'),'job leaves non-verified evidence alone');
select pg_temp.assert_true((select count(*)=1 from public.provider_verification_events where provider_id=:'ambulance' and from_state='approved' and to_state='expired' and actor_profile_id is null),'system expiry event recorded');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'ambulance' and action='provider.expired' and actor_profile_id is null),'system expiry audited');
select pg_temp.assert_true(public.expire_due_providers()=0,'expiry job is idempotent');
select pg_temp.expect_state(format('insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(null,''provider.approved'',''provider'',%L)',:'ambulance'),'23514','null audit actor reserved for the expiry action');
select pg_temp.expect_state(format('insert into public.provider_verification_events(provider_id,actor_profile_id,from_state,to_state,reason,public_reason,provider_version) values(%L,null,''under_review'',''approved'',''x'',''x'',1)',:'ambulance'),'23514','null event actor reserved for approved to expired');
select version as ambulance_version from public.providers where id=:'ambulance' \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select pg_temp.assert_true(not public.provider_is_publishable(:'ambulance'),'expired provider not publishable');
select pg_temp.assert_owner_role('ambulance',false);
select pg_temp.assert_true((public.update_provider(:'ambulance','Synthetic transport renewed','',:ambulance_version)).version=:ambulance_version+1,'owner may edit an expired application');
reset role;
-- 20261117000600: anonymous Auth users are rejected by the DB itself, whether the
-- JWT carries is_anonymous or only the auth.users row says so.
insert into auth.users(id,email,is_anonymous) values ('12000000-0000-4000-8000-0000000000a1','i02h-anonymous@example.invalid',true);
select pg_temp.assert_true(exists(select 1 from public.profiles where id='12000000-0000-4000-8000-0000000000a1' and status='active'),'anonymous fixture still gets an active profile row');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-0000000000a1","aal":"aal1","is_anonymous":true}',true);
select pg_temp.assert_true((select count(*)=0 from public.identity_roles()),'anonymous JWT has no workspace roles');
select pg_temp.expect_state('select public.create_provider(''doctor'',''Synthetic anonymous'','''',null)','42501','anonymous JWT command denied');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-0000000000a1","aal":"aal1"}',true);
select pg_temp.assert_true((select count(*)=0 from public.identity_roles()),'anonymous auth.users row has no roles without the JWT flag');
select pg_temp.expect_state('select public.create_provider(''doctor'',''Synthetic anonymous'','''',null)','42501','anonymous auth.users row denied without the JWT flag');
reset role;
-- 20261117000610: service_role cannot forge or erase audit history, and only an
-- aal2 global security:audit holder reads audit rows.
do $$ declare t text; p text; begin
  foreach t in array array['public.audit_events','public.provider_verification_events'] loop
    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'] loop
      perform pg_temp.assert_true(not has_table_privilege('service_role',t,p),t||' service_role '||p||' revoked');
    end loop;
  end loop;
end $$;
insert into auth.users(id,email) values ('12000000-0000-4000-8000-0000000000a2','i02h-auditor@example.invalid');
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('12000000-0000-4000-8000-0000000000a2','security:audit','global','12000000-0000-4000-8000-000000000001');
select count(*) as audit_rows from public.audit_events \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-0000000000a2","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=:audit_rows and count(*)>0 from public.audit_events),'aal2 global auditor reads every audit row');
select pg_temp.expect_state('insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(''12000000-0000-4000-8000-0000000000a2'',''forged'',''provider'',gen_random_uuid())','42501','auditor cannot write audit rows');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-0000000000a2","aal":"aal1"}',true);
select pg_temp.assert_true((select count(*)=0 from public.audit_events),'aal1 auditor reads no audit rows');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from public.audit_events),'non-auditor reads no audit rows');
reset role;
update public.admin_capabilities set scope_key='org:22000000-0000-4000-8000-000000000001' where profile_id='12000000-0000-4000-8000-0000000000a2';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-0000000000a2","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from public.audit_events),'org-scoped audit grant reads no unscoped audit rows');
-- 20261117000670 finding 2: expired pending evidence never becomes verified.
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000006","aal":"aal1"}',true);
select (public.add_provider_document(:'details','identity','application/pdf',now()+interval '1 year',5)->'document'->>'id') as details_identity \gset
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id in (:'details_registration',:'details_identity');
select public.submit_provider(:'details',6);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select public.review_provider(:'details','under_review','Synthetic review of details doctor',7);
reset role;
update public.provider_documents set expires_at=now()-interval '1 second' where id=:'details_identity';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_provider(%L,''approved'',''Synthetic approval with expired evidence'',8)',:'details'),'23514','approval refused while uploaded evidence is expired');
reset role;
select pg_temp.assert_true((select verification_state='under_review' and version=8 from public.providers where id=:'details'),'refused approval leaves state and version');
select pg_temp.assert_true((select count(*)=0 from public.provider_documents where provider_id=:'details' and status='verified'),'no evidence verified by a refused approval');
select pg_temp.assert_true(pg_get_functiondef('public.review_provider(uuid,text,text,integer)'::regprocedure) like '%d.expires_at > now()%','approval snapshot filters expired evidence');
-- 20261117000670 findings 1 and 5: the sweep is scheduled hourly and serializes itself.
select pg_temp.assert_true((select count(*)=1 from cron.job where jobname='i02h-expire-due-providers' and schedule='17 * * * *' and command='select public.expire_due_providers()' and active),'expiry sweep scheduled hourly');
select pg_temp.assert_true(pg_get_functiondef('public.expire_due_providers()'::regprocedure) like '%pg_advisory_xact_lock%','concurrent sweeps serialize on an advisory lock');
set local role anon;
select pg_temp.assert_true(not public.provider_is_publishable(:'doctor'),'guest eligibility boolean only');
select pg_temp.expect_state('select * from public.provider_documents','42501','guest private metadata denied');
select pg_temp.assert_true((select count(*)=0 from storage.objects),'guest object denied');
reset role;
\echo 1..1
\echo ok 1 - 003_i02_providers assertions
rollback;
\echo I02 SQL assertions passed
