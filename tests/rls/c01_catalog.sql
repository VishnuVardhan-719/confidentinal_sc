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
-- All identities, coverage and reference data are synthetic and rolled back.
insert into auth.users(id,email) values
 ('13000000-0000-4000-8000-000000000001','c01-owner@example.invalid'),
 ('13000000-0000-4000-8000-000000000002','c01-outsider@example.invalid'),
 ('13000000-0000-4000-8000-000000000003','c01-reviewer@example.invalid'),
 ('13000000-0000-4000-8000-000000000004','c01-member@example.invalid');
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('13000000-0000-4000-8000-000000000003','coverage:verify','global','13000000-0000-4000-8000-000000000001'),
 ('13000000-0000-4000-8000-000000000001','coverage:verify','global','13000000-0000-4000-8000-000000000003');
insert into public.service_catalog_types(id,code,category,name,unit) values
 ('43000000-0000-4000-8000-000000000001','c01_synthetic_doctor','doctor','Synthetic visit','visit'),
 ('43000000-0000-4000-8000-000000000002','c01_synthetic_lab','lab','Synthetic test','test');
insert into public.pin_directory(pin_code,state,district,city,source_reference) values
 ('500001','Synthetic','Synthetic','Synthetic','C01 rollback-only fixture'),
 ('500002','Synthetic','Synthetic','Synthetic','C01 rollback-only fixture');
insert into public.providers(id,individual_owner_profile_id,category,verification_state,status) values
 ('33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','doctor','approved','active');
insert into public.provider_profiles(provider_id,display_name,description) values
 ('33000000-0000-4000-8000-000000000001','Synthetic C01 provider','');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at) values
 ('53000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001',
 'registration','33000000-0000-4000-8000-000000000001/53000000-0000-4000-8000-000000000001.pdf','application/pdf','verified',now()+interval '1 year');
insert into storage.objects(bucket_id,name) values('provider-verification','33000000-0000-4000-8000-000000000001/53000000-0000-4000-8000-000000000001.pdf');
insert into public.organizations(id,name) values('23000000-0000-4000-8000-000000000001','Synthetic C01 organization');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000004','manager','active',now(),array['provider:read','provider:manage']);
insert into public.providers(id,organization_id,category) values
 ('33000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001','lab');
insert into public.provider_profiles(provider_id,display_name) values('33000000-0000-4000-8000-000000000002','Synthetic C01 org lab');
select pg_temp.assert_true((select count(*)=6 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('service_catalog_types','pin_directory','services','service_price_versions','provider_service_areas','coverage_review_events') and c.relrowsecurity),'all C01 tables have RLS');
do $$ declare t text; f record; begin
 foreach t in array array['service_catalog_types','pin_directory','services','service_price_versions','provider_service_areas','coverage_review_events'] loop
  perform pg_temp.assert_true(not has_table_privilege('anon','public.'||t,'SELECT'),t||' no guest base reads');
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),t||' no direct writes');
 end loop;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='catalog_private'
  or (n.nspname='public' and p.proname in ('search_providers','get_public_provider','upsert_service','publish_price_version','propose_service_area','withdraw_service_area','review_service_area','list_service_area_reviews'))
  or (n.nspname='identity_private' and p.proname='provider_publicly_bookable') loop
  perform pg_temp.assert_true(exists(select 1 from unnest(f.proconfig) x where x in ('search_path=""','search_path=')),f.proname||' pins search_path');
  perform pg_temp.assert_true(not exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),f.proname||' no PUBLIC execute');
  perform pg_temp.assert_true(has_function_privilege('anon',f.oid,'EXECUTE')=(f.proname in ('search_providers','get_public_provider')),f.proname||' guest allowlist');
 end loop;
end $$;
select pg_temp.assert_true((select proargnames[9:21]=array['provider_id','category','display_name','service_id','service_title','duration_minutes','amount_paise','currency','unit','terms_version','pin_code','city','advisory_availability'] from pg_proc where oid='public.search_providers(text,text,text,integer,text,uuid,uuid,uuid)'::regprocedure),'exact public column allowlist');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select (public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic service','',30,'draft',0,null,'63000000-0000-4000-8000-000000000001')).id as service \gset
select pg_temp.assert_true((public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic service','',30,'draft',0,null,'63000000-0000-4000-8000-000000000001')).id=:'service','creation replay does not duplicate');
select pg_temp.expect_state('select public.upsert_service(''33000000-0000-4000-8000-000000000001'',''43000000-0000-4000-8000-000000000002'',''Synthetic wrong type'','''',30,''draft'',0,null,''63000000-0000-4000-8000-000000000002'')','23503','category mismatch denied');
select pg_temp.expect_state(format('select public.upsert_service(''33000000-0000-4000-8000-000000000001'',''43000000-0000-4000-8000-000000000001'',''Synthetic service'','''',30,''published'',1,%L)',:'service'),'23514','cannot publish without price');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''1.5'',''synthetic-v1'',1,''63000000-0000-4000-8000-000000000003'')',:'service'),'22023','decimal paise denied');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''-1'',''synthetic-v1'',1,''63000000-0000-4000-8000-000000000003'')',:'service'),'22023','negative paise denied');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''9223372036854775808'',''synthetic-v1'',1,''63000000-0000-4000-8000-000000000003'')',:'service'),'22023','overflow paise denied');
select public.publish_price_version(:'service','9007199254740993','synthetic-v1',1,'63000000-0000-4000-8000-000000000003');
select pg_temp.assert_true((select amount_paise::text='9007199254740993' from public.service_price_versions where service_id=:'service'),'bigint price stays exact');
select public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic service','',30,'published',2,:'service');
select (public.propose_service_area('33000000-0000-4000-8000-000000000001','500001',1,'63000000-0000-4000-8000-000000000004')).id as area \gset
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'proposed coverage stays hidden');
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic self approval'',1,now()+interval ''1 month'')',:'area'),'42501','owner self approval denied');
select pg_temp.expect_state('select approved_by from public.provider_service_areas','42501','owner cannot read reviewer identity');
select pg_temp.assert_true((select count(*)=0 from public.coverage_review_events),'owner cannot read internal reviews');
select pg_temp.expect_state('select public.propose_service_area(''33000000-0000-4000-8000-000000000001'',''599999'',2,''63000000-0000-4000-8000-000000000005'')','23503','unknown directory PIN denied');

select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from public.services),'outsider cannot read services');
select pg_temp.assert_true((select count(*)=0 from public.provider_service_areas),'outsider cannot read coverage');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-v2'',3,''63000000-0000-4000-8000-000000000006'')',:'service'),'42501','outsider cannot price');
select pg_temp.expect_state(format('select public.withdraw_service_area(%L,1)',:'area'),'42501','outsider cannot withdraw');
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic unauthorized'',1,now()+interval ''1 month'')',:'area'),'42501','no coverage capability denied');
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic no MFA'',1,now()+interval ''1 month'')',:'area'),'42501','aal1 review denied');
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003"}',true);
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic absent MFA claim'',1,now()+interval ''1 month'')',:'area'),'42501','missing aal claim fails closed');
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select public.review_service_area(:'area','approved','Synthetic coverage checked',1,now()+interval '1 month');
select pg_temp.assert_true((select count(*)=1 from public.coverage_review_events),'coverage admin can read review queue ledger');
select pg_temp.assert_true((select count(*)=1 from public.provider_service_areas),'coverage-only admin can read area safe columns');
select pg_temp.assert_true((select count(*)=1 from public.list_service_area_reviews()),'coverage-only admin sees narrow queue');
set local role anon;
select pg_temp.assert_true((select count(*)=1 from public.search_providers('doctor','500001')),'approved price and coverage visible');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500002')),'adjacent PIN never matched');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('lab','500001')),'other category not matched');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001','100')),'price filter exact');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001',null,20,'9007199254740993','33000000-0000-4000-8000-000000000001',:'service')),'cursor does not repeat final row');
select pg_temp.expect_state('select * from public.search_providers(''doctor'',''50001%'')','22023','SQL wildcard PIN denied');
select pg_temp.expect_state('select * from public.search_providers(''doctor'',''050001'')','22023','SQL leading zero PIN denied');
select pg_temp.expect_state('select * from public.search_providers(''doctor'',''500001'',null,1000)','22023','SQL oversized page denied');
select pg_temp.expect_state('select * from public.services','42501','guest direct table denied');
select pg_temp.expect_state('select * from public.list_service_area_reviews()','42501','guest cannot enumerate coverage queue');
select pg_temp.assert_true((select count(*)=0 from public.get_public_provider('33000000-0000-4000-8000-000000000099','doctor','500001')),'unknown detail is empty');
reset role;
-- Trusted fixture changes simulate revocation/expiry without a background sweep.
do $$ declare state text; begin
 foreach state in array array['draft','submitted','under_review','rejected','suspended'] loop
  update public.providers set status='inactive',verification_state=state where id='33000000-0000-4000-8000-000000000001';
  perform pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'hidden state '||state);
 end loop;
end $$;
update public.providers set status='active',verification_state='approved' where id='33000000-0000-4000-8000-000000000001';
update public.provider_documents set expires_at=now() where id='53000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'credential expires exactly at UTC boundary');
select pg_temp.assert_true((select count(*)=0 from public.get_public_provider('33000000-0000-4000-8000-000000000001','doctor','500001')),'expired detail identical to unknown');
update public.provider_documents set expires_at=now()+interval '1 year' where id='53000000-0000-4000-8000-000000000001';
update public.profiles set status='disabled' where id='13000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'disabled owner disappears');
update public.profiles set status='active' where id='13000000-0000-4000-8000-000000000001';
update public.provider_service_areas set valid_from=now()-interval '1 day',valid_to=now() where id=:'area';
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'coverage expires at boundary');
update public.provider_service_areas set valid_to=now()+interval '1 month' where id=:'area';
do $$ declare state text; begin
 foreach state in array array['proposed','rejected','revoked'] loop
  update public.provider_service_areas set status=state where id=(select id from public.provider_service_areas where provider_id='33000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'hidden coverage '||state);
 end loop;
end $$;
update public.provider_service_areas set status='approved' where id=:'area';
select pg_temp.expect_state(format('update public.service_price_versions set amount_paise=1 where service_id=%L',:'service'),'55000','price amount immutable even for trusted role');
select pg_temp.expect_state(format('delete from public.service_price_versions where service_id=%L',:'service'),'55000','price cannot be deleted');
select pg_temp.expect_state(format('insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from) values(%L,''43000000-0000-4000-8000-000000000001'',2,100,''visit'',''synthetic-v2'',now()+interval ''1 hour'')',:'service'),'23P01','overlapping price windows denied');
-- Reviewer capability lifetime and scope are checked again on every command.
update public.admin_capabilities set valid_from=now()-interval '1 day',expires_at=now() where profile_id='13000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_service_area(%L,''revoked'',''Synthetic expired admin'',2)',:'area'),'42501','expired coverage capability denied');
reset role;
update public.admin_capabilities set expires_at=null,revoked_at=now() where profile_id='13000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_service_area(%L,''revoked'',''Synthetic revoked admin'',2)',:'area'),'42501','revoked coverage capability denied');
reset role;
update public.admin_capabilities set revoked_at=null,valid_from=now()+interval '1 hour' where profile_id='13000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_service_area(%L,''revoked'',''Synthetic future admin'',2)',:'area'),'42501','future coverage capability denied');
reset role;
update public.admin_capabilities set valid_from=now(),scope_key='org:23000000-0000-4000-8000-000000000099' where profile_id='13000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect_state(format('select public.review_service_area(%L,''revoked'',''Synthetic wrong scope'',2)',:'area'),'42501','wrong organization coverage capability denied');
reset role;
update public.admin_capabilities set scope_key='global' where profile_id='13000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select public.publish_price_version(:'service','100','synthetic-v2',3,'63000000-0000-4000-8000-000000000007');
select pg_temp.assert_true((select count(*)=1 from public.service_price_versions where service_id=:'service' and effective_to is null),'one current price');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''200'',''synthetic-v3'',3,''63000000-0000-4000-8000-000000000008'')',:'service'),'40001','stale concurrent price version denied');
select public.withdraw_service_area(:'area',2);
set local role anon;
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'withdrawal immediately hides provider');
reset role;
-- Active organization manager is scoped; membership loss blocks new commands.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000004","aal":"aal2"}',true);
select (public.upsert_service('33000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000002','Synthetic org test','',30,'draft',0,null,'63000000-0000-4000-8000-000000000009')).id as org_service \gset
select (public.propose_service_area('33000000-0000-4000-8000-000000000002','500001',1,'63000000-0000-4000-8000-000000000010')).id as org_area \gset
reset role;
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('13000000-0000-4000-8000-000000000004','coverage:verify','global','13000000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic org self review'',1,now()+interval ''1 month'')',:'org_area'),'42501','organization member cannot approve own organization');
select pg_temp.expect_state(format('select public.withdraw_service_area(%L,1)',:'org_area'),'42501','coverage withdrawal reserved to owning principal');
reset role;
update public.organization_members set scopes=array['provider:read'] where profile_id='13000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-org'',1,''63000000-0000-4000-8000-000000000011'')',:'org_service'),'42501','missing manage scope denied');
reset role;
update public.organization_members set scopes=array['provider:read','provider:manage'],status='invited',accepted_at=null where profile_id='13000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-org'',1,''63000000-0000-4000-8000-000000000011'')',:'org_service'),'42501','invited manager denied');
reset role;
update public.organization_members set status='disabled' where profile_id='13000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-org'',1,''63000000-0000-4000-8000-000000000011'')',:'org_service'),'42501','disabled manager denied');
reset role;
update public.organization_members set status='active',accepted_at=now() where profile_id='13000000-0000-4000-8000-000000000004';
update public.organizations set status='disabled' where id='23000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-org'',1,''63000000-0000-4000-8000-000000000011'')',:'org_service'),'42501','disabled organization denied');
reset role;
rollback;
\echo C01 SQL assertions passed; all synthetic fixtures rolled back.
