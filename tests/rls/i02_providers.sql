\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.expect_state(statement text,expected text,label text) returns void language plpgsql as $$
declare actual text; begin
  begin execute statement; exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=expected then return; end if;
    raise exception 'FAIL: %, expected %, got %',label,expected,actual;
  end;
  raise exception 'FAIL: %, unexpectedly succeeded',label;
end $$;
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
 ('12000000-0000-4000-8000-000000000004','i02-manager@example.invalid');
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('12000000-0000-4000-8000-000000000003','provider:verify','global','12000000-0000-4000-8000-000000000001'),
 ('12000000-0000-4000-8000-000000000001','provider:verify','global','12000000-0000-4000-8000-000000000003');
insert into public.organizations(id,name) values
 ('22000000-0000-4000-8000-000000000001','Synthetic I02 A'),
 ('22000000-0000-4000-8000-000000000002','Synthetic I02 B');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','owner','active',now(),array['provider:read','provider:manage','evidence:manage']),
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000004','manager','active',now(),array['provider:read','provider:manage','evidence:manage']),
 ('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','owner','active',now(),array['provider:read','provider:manage','evidence:manage']);

select pg_temp.assert_true((select count(*)=3 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('provider_profiles','provider_documents','provider_verification_events') and c.relrowsecurity),'all new tables have RLS');
select pg_temp.assert_true((select not public and file_size_limit=10485760 from storage.buckets where id='provider-verification'),'private bounded bucket');
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
select pg_temp.assert_true((select count(*)=1 from storage.objects),'authenticated owner download remains allowed');
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
select pg_temp.expect_state(format('select public.review_provider(%L,''under_review'',''Self review'',3)',:'doctor'),'42501','self review denied despite admin capability');
select (public.add_provider_document(:'lab','licence','application/pdf',now()+interval '1 year',1)->'document'->>'id') as labdoc \gset
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'labdoc';

select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from public.provider_documents),'cross org document read denied');
select pg_temp.assert_true((select count(*)=0 from storage.objects),'cross org object read denied');
select pg_temp.assert_true((select count(*)=0 from public.provider_profiles),'wrong user profile hidden');
select pg_temp.expect_state(format('select public.submit_provider(%L,3)',:'doctor'),'42501','wrong user mutation denied');
select pg_temp.expect_state(format('select public.create_provider(''lab'',''Synthetic'','''',%L)','22000000-0000-4000-8000-000000000001'),'42501','cross org creation denied');

select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
select pg_temp.assert_true((select count(*)=1 from public.provider_documents),'active scoped org manager reads evidence');
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
select pg_temp.expect_state(format('select public.review_provider(%L,''approved'',''Stale'',3)',:'doctor'),'40001','stale review denied');
select public.review_provider(:'doctor','approved','Synthetic evidence checked',4);
select pg_temp.assert_true(public.provider_is_publishable(:'doctor'),'approved with valid evidence publishable');
select pg_temp.assert_owner_role('doctor',true);
select pg_temp.assert_true((select reviewed_document_ids=array[:'doc'::uuid] from public.provider_verification_events where provider_id=:'doctor' and to_state='approved'),'approval records exact document IDs');
select pg_temp.assert_true((select count(*)=0 from storage.objects),'verifier cannot read approved evidence');
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
-- Every pending document must have bytes, even if the required credential exists.
select public.add_provider_document(:'ambulance','identity','application/pdf',now()+interval '1 year',1) as reserve \gset
select pg_temp.assert_true((:'reserve'::jsonb->>'provider_version')::int=2,'reservation returns authoritative version');
select (:'reserve'::jsonb->'document'->>'id') as optional_doc \gset
select (public.add_provider_document(:'ambulance','vehicle_permit','application/pdf',now()+interval '1 year',2)->'document'->>'id') as permit \gset
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'permit';
select pg_temp.expect_state(format('select public.submit_provider(%L,3)',:'ambulance'),'23514','pending optional metadata without bytes blocks submission');
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where id=:'optional_doc';
select public.submit_provider(:'ambulance',3);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select public.review_provider(:'ambulance','under_review','Synthetic transport review',4);
select public.review_provider(:'ambulance','approved','Synthetic transport evidence reviewed',5);
select pg_temp.assert_true((select cardinality(reviewed_document_ids)=2 from public.provider_verification_events where provider_id=:'ambulance' and to_state='approved'),'approval snapshots all uploaded pending evidence');
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
set local role anon;
select pg_temp.assert_true(not public.provider_is_publishable(:'doctor'),'guest eligibility boolean only');
select pg_temp.expect_state('select * from public.provider_documents','42501','guest private metadata denied');
select pg_temp.assert_true((select count(*)=0 from storage.objects),'guest object denied');
reset role;
rollback;
\echo I02 SQL assertions passed
