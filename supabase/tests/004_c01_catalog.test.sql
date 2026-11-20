\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
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
select pg_temp.assert_true((select count(*)=7 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('service_catalog_types','pin_directory','services','service_price_versions','provider_service_areas','coverage_review_events','provider_catalog_counters') and c.relrowsecurity),'all C01 tables have RLS');
do $$ declare t text; f record; begin
 foreach t in array array['service_catalog_types','pin_directory','services','service_price_versions','provider_service_areas','coverage_review_events','provider_catalog_counters'] loop
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
select pg_temp.assert_true((select proargnames[9:22]=array['provider_reference','category','display_name','public_profile','service_id','service_title','duration_minutes','amount_paise','currency','unit','terms_version','pin_code','city','advisory_availability'] from pg_proc where oid='public.search_providers(text,text,text,integer,text,text,uuid,text)'::regprocedure),'exact public column allowlist');
select public_reference as ref1 from public.providers where id='33000000-0000-4000-8000-000000000001' \gset
select pg_temp.assert_true(:'ref1' ~ '^SCV-DOC-[0-9]{6,19}$' and (select public_reference ~ '^SCV-LAB-[0-9]{6,19}$' from public.providers where id='33000000-0000-4000-8000-000000000002'),'fixture providers get category-prefixed public references');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select (public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic service','',30,'draft',0,null,'63000000-0000-4000-8000-000000000001')).id as service \gset
select pg_temp.assert_true((public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic service','',30,'draft',0,null,'63000000-0000-4000-8000-000000000001')).id=:'service','creation replay does not duplicate');
select pg_temp.expect_state('select public.upsert_service(''33000000-0000-4000-8000-000000000001'',''43000000-0000-4000-8000-000000000002'',''Synthetic wrong type'','''',30,''draft'',0,null,''63000000-0000-4000-8000-000000000002'')','23503','category mismatch denied');
select pg_temp.expect_state(format('select public.upsert_service(''33000000-0000-4000-8000-000000000001'',''43000000-0000-4000-8000-000000000001'',''Synthetic service'','''',30,''published'',1,%L)',:'service'),'23514','cannot publish without price');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''1.5'',''synthetic-v1'',1,''63000000-0000-4000-8000-000000000003'')',:'service'),'22023','decimal paise denied');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''-1'',''synthetic-v1'',1,''63000000-0000-4000-8000-000000000003'')',:'service'),'22023','negative paise denied');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''9223372036854775808'',''synthetic-v1'',1,''63000000-0000-4000-8000-000000000003'')',:'service'),'22023','overflow paise denied');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''10000000001'',''synthetic-v1'',1,''63000000-0000-4000-8000-000000000003'')',:'service'),'22023','price ceiling plus one denied');
select public.publish_price_version(:'service','10000000000','synthetic-v1',1,'63000000-0000-4000-8000-000000000003');
select pg_temp.assert_true((select amount_paise::text='10000000000' from public.service_price_versions where service_id=:'service'),'ceiling price stays exact');
select public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic service','',30,'published',2,:'service');
select (public.propose_service_area('33000000-0000-4000-8000-000000000001','500001',1,'63000000-0000-4000-8000-000000000004')).id as area \gset
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'proposed coverage stays hidden');
select pg_temp.assert_true((select version=1 from public.providers where id='33000000-0000-4000-8000-000000000001'),'coverage proposal leaves onboarding version unchanged');
select pg_temp.assert_true((select coverage_version=2 from public.provider_catalog_counters where provider_id='33000000-0000-4000-8000-000000000001'),'coverage proposal advances its separate counter');
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic self approval'',1,now()+interval ''1 month'')',:'area'),'42501','owner self approval denied');
select pg_temp.expect_state('select approved_by from public.provider_service_areas','42501','owner cannot read reviewer identity');
select pg_temp.assert_true((select count(*)=0 from public.coverage_review_events),'owner cannot read internal reviews');
select pg_temp.expect_state('select public.propose_service_area(''33000000-0000-4000-8000-000000000001'',''599999'',2,''63000000-0000-4000-8000-000000000005'')','23503','unknown directory PIN denied');

select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
select pg_temp.assert_true((select count(*)=0 from public.services),'outsider cannot read services');
select pg_temp.assert_true((select count(*)=0 from public.provider_catalog_counters),'outsider cannot read coverage counters');
select pg_temp.assert_true((select count(*)=0 from public.provider_service_areas),'outsider cannot read coverage');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-v2'',3,''63000000-0000-4000-8000-000000000006'')',:'service'),'42501','outsider cannot price');
select pg_temp.expect_state(format('select public.withdraw_service_area(%L,1)',:'area'),'42501','outsider cannot withdraw');
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic unauthorized'',1,now()+interval ''1 month'')',:'area'),'42501','no coverage capability denied');
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic no MFA'',1,now()+interval ''1 month'')',:'area'),'42501','aal1 review denied');
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003"}',true);
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic absent MFA claim'',1,now()+interval ''1 month'')',:'area'),'42501','missing aal claim fails closed');
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select pg_temp.expect_state(format('select public.review_service_area(%L,''approved'',''Synthetic excessive horizon'',1,now()+interval ''12 months 1 second'')',:'area'),'22023','approval horizon beyond twelve months denied');
select public.review_service_area(:'area','approved','Synthetic coverage checked',1,now()+interval '12 months');
-- N01 (002130) records the proposal too, so the reviewer sees the proposed and approved rows.
select pg_temp.assert_true((select count(*)=2 from public.coverage_review_events),'coverage admin can read review queue ledger');
select pg_temp.assert_true((select count(*)=1 from public.provider_service_areas),'coverage-only admin can read area safe columns');
select pg_temp.assert_true((select count(*)=1 from public.list_service_area_reviews()),'coverage-only admin sees narrow queue');
set local role anon;
select pg_temp.assert_true((select count(*)=1 from public.search_providers('doctor','500001')),'approved price and coverage visible');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500002')),'adjacent PIN never matched');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('lab','500001')),'other category not matched');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001','100')),'price filter exact');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001',null,20,'10000000000',:'ref1',:'service')),'cursor does not repeat final row');
select pg_temp.assert_true((select count(*)=1 from public.search_providers('doctor','500001',null,20,'10000000000','SCV-DOC-000000',:'service')),'cursor before the final row continues to it');
select pg_temp.assert_true((select count(*)=1 and bool_and(provider_reference=:'ref1') from public.get_public_provider(:'ref1','doctor','500001')),'detail resolves by public reference');
select pg_temp.assert_true((select bool_and(to_jsonb(r)::text not like '%33000000-0000-4000-8000-000000000001%') from public.search_providers('doctor','500001') r),'public rows never carry the internal provider UUID');
select pg_temp.expect_state('select * from public.get_public_provider(''33000000-0000-4000-8000-000000000001'',''doctor'',''500001'')','22023','internal provider UUID is not a public detail key');
select pg_temp.expect_state(format('select * from public.search_providers(''doctor'',''500001'',null,20,''10000000000'',''33000000-0000-4000-8000-000000000001'',%L)',:'service'),'22023','UUID cursor rejected');
select pg_temp.expect_state(format('select * from public.search_providers(''doctor'',''500001'',null,20,''10000000000'',''SCV-LAB'',%L)',:'service'),'22023','malformed reference cursor rejected');
select pg_temp.expect_state('select * from public.search_providers(''doctor'',''50001%'')','22023','SQL wildcard PIN denied');
select pg_temp.expect_state('select * from public.search_providers(''doctor'',''050001'')','22023','SQL leading zero PIN denied');
select pg_temp.expect_state('select * from public.search_providers(''doctor'',''500001'',null,1000)','22023','SQL oversized page denied');
select pg_temp.expect_state('select * from public.services','42501','guest direct table denied');
select pg_temp.expect_state('select * from public.list_service_area_reviews()','42501','guest cannot enumerate coverage queue');
select pg_temp.assert_true((select count(*)=0 from public.get_public_provider('SCV-DOC-999999','doctor','500001')),'unknown detail is empty');
reset role;
-- Trusted fixture changes simulate revocation/expiry without a background sweep.
do $$ declare state text; begin
 foreach state in array array['draft','submitted','under_review','rejected','suspended'] loop
  update public.providers set status='inactive',verification_state=state where id='33000000-0000-4000-8000-000000000001';
  perform pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'hidden state '||state);
 end loop;
end $$;
update public.providers set status='active',verification_state='approved' where id='33000000-0000-4000-8000-000000000001';
-- 20261117000640: public rows show the allowlisted snapshot frozen at approval.
select pg_temp.assert_true((select count(*)=1 and bool_and(provider_reference=:'ref1' and display_name='Synthetic C01 provider'
 and public_profile='{"category":"doctor","display_name":"Synthetic C01 provider"}'::jsonb) from public.search_providers('doctor','500001')),'search returns reference and exact allowlisted snapshot');
update public.provider_profiles set display_name='Synthetic edited after approval' where provider_id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select bool_and(display_name='Synthetic C01 provider' and public_profile->>'display_name'='Synthetic C01 provider') from public.search_providers('doctor','500001')),'profile edits after approval never reach the public projection');
update public.providers set published_profile='{"display_name":"Forged"}' where id='33000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select bool_and(display_name='Synthetic C01 provider') from public.search_providers('doctor','500001')),'direct snapshot writes are overridden');
update public.provider_profiles set display_name='Synthetic C01 provider' where provider_id='33000000-0000-4000-8000-000000000001';
update public.provider_documents set expires_at=now() where id='53000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'credential expires exactly at UTC boundary');
select pg_temp.assert_true((select count(*)=0 from public.get_public_provider(:'ref1','doctor','500001')),'expired detail identical to unknown');
update public.provider_documents set expires_at=now()+interval '1 year' where id='53000000-0000-4000-8000-000000000001';
update public.profiles set status='disabled' where id='13000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'disabled owner disappears');
update public.profiles set status='active' where id='13000000-0000-4000-8000-000000000001';
update public.provider_service_areas set valid_from=now()-interval '1 day',valid_to=now() where id=:'area';
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'coverage expires at boundary');
-- 20261117000670 finding 3: coverage uses statement time like prices. now() is fixed at
-- transaction start, so a window closing at this statement's time is still open by now().
update public.provider_service_areas set valid_to=statement_timestamp() where id=:'area';
select pg_temp.assert_true((select valid_to>now() from public.provider_service_areas where id=:'area'),'window closes after transaction start');
select pg_temp.assert_true((select count(*)=0 from public.search_providers('doctor','500001')),'coverage window uses statement time');
update public.provider_service_areas set valid_to=now()+interval '1 month' where id=:'area';
select pg_temp.expect_state(format('update public.provider_service_areas set valid_to=valid_from+interval ''12 months 1 second'' where id=%L',:'area'),'23514','coverage horizon enforced by DB CHECK');
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
update public.organization_members set scopes=array['provider:read','provider:manage'],status='invited',accepted_at=null,invite_expires_at=now()+interval '14 days' where profile_id='13000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-org'',1,''63000000-0000-4000-8000-000000000011'')',:'org_service'),'42501','invited manager denied');
reset role;
update public.organization_members set status='disabled',invite_expires_at=null where profile_id='13000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-org'',1,''63000000-0000-4000-8000-000000000011'')',:'org_service'),'42501','disabled manager denied');
reset role;
update public.organization_members set status='active',accepted_at=now() where profile_id='13000000-0000-4000-8000-000000000004';
update public.organizations set status='disabled' where id='23000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-org'',1,''63000000-0000-4000-8000-000000000011'')',:'org_service'),'42501','disabled organization denied');
reset role;
-- Review regressions M1/M3/L2/L3/L4/L6. Bulk rows are trusted synthetic setup;
-- the actual Nth and N+1th mutations use authenticated RPCs under provider locks.
update public.organizations set status='active' where id='23000000-0000-4000-8000-000000000001';
update public.provider_service_areas set status='approved',approved_by='13000000-0000-4000-8000-000000000003',approved_at=now()-interval '2 days',
 valid_from=now()-interval '2 days',valid_to=now() where id=:'org_area';
set local role authenticated;
select (public.propose_service_area('33000000-0000-4000-8000-000000000002','500001',2,'63000000-0000-4000-8000-000000000020')).id as renewed_area \gset
select pg_temp.assert_true((select status='revoked' and version=2 from public.provider_service_areas where id=:'org_area'),'expired approved area retired on manager re-proposal');
select pg_temp.assert_true((select status='proposed' from public.provider_service_areas where id=:'renewed_area'),'manager re-proposal awaits independent review');
select pg_temp.assert_true((select version=1 from public.providers where id='33000000-0000-4000-8000-000000000002'),'renewal never changes onboarding version');
select pg_temp.assert_true((select coverage_version=3 from public.provider_catalog_counters where provider_id='33000000-0000-4000-8000-000000000002'),'renewal advances only coverage counter');
select pg_temp.assert_true((public.propose_service_area('33000000-0000-4000-8000-000000000002','500001',2,'63000000-0000-4000-8000-000000000020')).id=:'renewed_area','renewal retry preserves idempotency');
select pg_temp.expect_state('select public.propose_service_area(''33000000-0000-4000-8000-000000000002'',''500002'',2,''63000000-0000-4000-8000-000000000021'')','40001','stale coverage counter rejected');
select public.update_provider('33000000-0000-4000-8000-000000000002','Synthetic updated org profile','',1);
reset role;
select pg_temp.assert_true((select count(*)=1 from public.coverage_review_events where area_id=:'org_area' and from_status='approved' and to_status='revoked'),'expiry renewal retains immutable event');

insert into public.services(provider_id,category,catalog_type_id,title,duration_minutes)
 select '33000000-0000-4000-8000-000000000001','doctor','43000000-0000-4000-8000-000000000001','Synthetic cap service '||n,30 from generate_series(1,98) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select (public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic last service','',10080,'draft',0,null,'63000000-0000-4000-8000-000000000022')).id as last_service \gset
select pg_temp.assert_true((select count(*)=100 from public.services where provider_id='33000000-0000-4000-8000-000000000001'),'100th service accepted');
select pg_temp.assert_true((public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic last service','',10080,'draft',0,null,'63000000-0000-4000-8000-000000000022')).id=:'last_service','service retry allowed at cap');
select pg_temp.expect_state('select public.upsert_service(''33000000-0000-4000-8000-000000000001'',''43000000-0000-4000-8000-000000000001'',''Synthetic excess'','''',30,''draft'',0,null,''63000000-0000-4000-8000-000000000023'')','23514','101st service denied');
select pg_temp.expect_state('select public.upsert_service(''33000000-0000-4000-8000-000000000001'',''43000000-0000-4000-8000-000000000001'',''Synthetic excessive duration'','''',10081,''draft'',0,null,''63000000-0000-4000-8000-000000000023'')','22023','duration above one week denied by RPC');
select public.upsert_service('33000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Synthetic last service','',10080,'draft',1,:'last_service');
reset role;
select pg_temp.expect_state(format('update public.services set duration_minutes=10081 where id=%L',:'last_service'),'23514','duration cap also enforced by DB CHECK');
insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from,effective_to)
 select :'last_service','43000000-0000-4000-8000-000000000001',n,100,'visit','synthetic-cap',now()-interval '300 days'+n*interval '1 day',now()-interval '300 days'+n*interval '1 day'+interval '1 hour' from generate_series(1,199) n;
select pg_temp.expect_state(format('insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from,effective_to) values(%L,''43000000-0000-4000-8000-000000000001'',200,10000000001,''visit'',''synthetic-cap'',now()-interval ''1000 days'',now()-interval ''999 days'')',:'last_service'),'23514','price ceiling enforced by DB CHECK');
set local role authenticated;
select public.publish_price_version(:'last_service','0','synthetic-zero-policy-pending',2,'63000000-0000-4000-8000-000000000024');
select pg_temp.assert_true((select count(*)=200 from public.service_price_versions where service_id=:'last_service'),'200th price accepted; zero remains owner decision');
select public.publish_price_version(:'last_service','0','synthetic-zero-policy-pending',2,'63000000-0000-4000-8000-000000000024');
select pg_temp.expect_state(format('select public.publish_price_version(%L,''100'',''synthetic-cap'',3,''63000000-0000-4000-8000-000000000025'')',:'last_service'),'23514','201st price denied');
select pg_temp.assert_true((select version=3 from public.services where id=:'last_service'),'failed price cap does not change version');
reset role;

insert into public.pin_directory(pin_code,state,district,city,source_reference)
 select (600000+n)::text,'Synthetic','Synthetic','Synthetic','C01 rollback-only caps fixture' from generate_series(1,50) n;
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status)
 select '33000000-0000-4000-8000-000000000002',(600000+n)::text,'13000000-0000-4000-8000-000000000004','rejected' from generate_series(1,48) n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000004","aal":"aal2"}',true);
select (public.propose_service_area('33000000-0000-4000-8000-000000000002','600049',3,'63000000-0000-4000-8000-000000000026')).id as last_area \gset
select pg_temp.assert_true((select count(*)=50 from public.provider_service_areas where provider_id='33000000-0000-4000-8000-000000000002' and status<>'revoked'),'50th non-revoked area accepted');
select public.propose_service_area('33000000-0000-4000-8000-000000000002','600049',3,'63000000-0000-4000-8000-000000000026');
select pg_temp.expect_state('select public.propose_service_area(''33000000-0000-4000-8000-000000000002'',''600050'',4,''63000000-0000-4000-8000-000000000027'')','23514','51st non-revoked area denied including rejected history');
select pg_temp.assert_true((select coverage_version=4 from public.provider_catalog_counters where provider_id='33000000-0000-4000-8000-000000000002'),'failed area cap does not advance counter');
reset role;
-- Deliberately reverse UUID versus creation order and put an old reviewed row
-- before both pending rows. Cursor continuation must use the full queue order.
update public.provider_service_areas set created_at=now()-interval '3 days' where id=:'area';
update public.provider_service_areas set created_at=now()-interval '2 days' where id=:'last_area';
update public.provider_service_areas set created_at=now()-interval '1 day' where id=:'renewed_area';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
select pg_temp.assert_true((select area_id=:'last_area' from public.list_service_area_reviews(1)),'queue prioritizes oldest pending over older reviewed rows');
select created_at as last_area_created from public.provider_service_areas where id=:'last_area' \gset
select public.review_service_area(:'last_area','approved','Synthetic review between queue pages',1,now()+interval '1 month');
select pg_temp.assert_true((select area_id=:'renewed_area' from public.list_service_area_reviews(1,:'last_area',0,:'last_area_created')),'queue cursor retains pending position after cursor row reviewed');
select pg_temp.assert_true((select area_id=:'area' from public.list_service_area_reviews(1,:'renewed_area',0,(select created_at from public.provider_service_areas where id=:'renewed_area'))),'queue returns reviewed rows only after all pending');
select pg_temp.expect_state('select * from public.list_service_area_reviews(1,''93000000-0000-4000-8000-000000000099'',0,now())','22023','unknown queue cursor rejected');
reset role;
\echo 1..1
\echo ok 1 - 004_c01_catalog assertions
rollback;
\echo C01 SQL assertions passed; all synthetic fixtures rolled back.
