-- I02: provider onboarding, private documents, admin verification. Synthetic identities only.
-- Everything is rolled back, including Auth rows, Storage object rows and bucket policies' effects.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Test helpers live in this session's temp schema and are dropped at rollback.
create function pg_temp.u(n integer) returns uuid language sql immutable as
$$ select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.k(n integer) returns uuid language sql immutable as
$$ select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.id(p_name text) returns uuid language sql stable as
$$ select current_setting('test.'||p_name)::uuid $$;
create function pg_temp.path(p_provider text,p_doc text) returns text language sql stable as
$$ select current_setting('test.'||p_provider)||'/'||current_setting('test.'||p_doc) $$;
create function pg_temp.login(n integer,p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',pg_temp.u(n),'role','authenticated','aal',p_aal)::text,true);
  perform set_config('role','authenticated',true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('role','anon',true);
end $$;
-- Simulates the Storage API row write; RLS on storage.objects applies to the current role.
create function pg_temp.put(p_name text,p_size integer,p_mime text) returns void language sql as $$
  insert into storage.objects(bucket_id,name,owner_id,metadata)
  values('provider-verification',p_name,auth.uid()::text,jsonb_build_object('size',p_size,'mimetype',p_mime));
$$;
create function pg_temp.pver(p_name text) returns integer language sql stable as
$$ select version from public.providers where id=pg_temp.id(p_name) $$;
create function pg_temp.cver(p_name text) returns integer language sql stable as
$$ select version from public.provider_verification_cases where id=pg_temp.id(p_name) $$;
create function pg_temp.dver(p_name text) returns integer language sql stable as
$$ select version from public.provider_documents where id=pg_temp.id(p_name) $$;

-- Actors: 1 doctor D1, 2 doctor D2, 3 org1 owner, 4 org1 manager, 5 org1 billing, 6 org1 staff doctor,
-- 7 org2 owner, 8 patient, 9 reviewer, 10 document reader, 11 suspender, 12 org2-scoped reviewer,
-- 13 expired reviewer, 14 disabled org1 manager, 15 unverified org1 doctor.
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.u(n),'synthetic-i02-'||n||'@example.invalid','{"role":"admin"}'::jsonb from generate_series(1,15) n;
insert into public.admin_capabilities(profile_id,capability,organization_id,reason_code) values
 (pg_temp.u(9),'provider:review',null,'SYNTHETIC_TEST'),
 (pg_temp.u(10),'provider:document_read',null,'SYNTHETIC_TEST'),
 (pg_temp.u(11),'provider:suspend',null,'SYNTHETIC_TEST');
insert into public.admin_capabilities(profile_id,capability,organization_id,reason_code,valid_from,expires_at) values
 (pg_temp.u(13),'provider:review',null,'SYNTHETIC_TEST',now()-interval '2 days',now()-interval '1 day');

-- ===== Structure =====
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relrowsecurity and c.relname in ('providers','doctor_profiles','lab_profiles',
  'ambulance_profiles','caretaker_profiles','provider_verification_cases','provider_document_types',
  'provider_documents','provider_verification_events','provider_document_access_grants')),10,'RLS enabled on every I02 table');
select is((select count(*)::integer from unnest(array['providers','doctor_profiles','lab_profiles','ambulance_profiles',
  'caretaker_profiles','provider_verification_cases','provider_document_types','provider_documents',
  'provider_verification_events','provider_document_access_grants']) t
  where has_table_privilege('anon','public.'||t,'select,insert,update,delete')),0,'anon has no privilege on any I02 base table');
select is((select count(*)::integer from unnest(array['providers','doctor_profiles','lab_profiles','ambulance_profiles',
  'caretaker_profiles','provider_verification_cases','provider_document_types','provider_documents',
  'provider_verification_events','provider_document_access_grants']) t
  where has_table_privilege('authenticated','public.'||t,'insert,delete,truncate')),0,'authenticated cannot insert or delete I02 rows directly');
select ok(not has_table_privilege('authenticated','public.provider_document_access_grants','select'),'access tickets are not readable');
select ok(not has_table_privilege('authenticated','private.provider_reference_counters','select,update'),'reference counters are private');
select ok(has_table_privilege('anon','public.provider_directory','select'),'anon can read the public directory');
select is(array(select column_name::text from information_schema.columns
  where table_schema='public' and table_name='provider_directory' order by ordinal_position),
  array['public_reference','category','display_name','specialty','qualification','languages','years_experience',
    'skills','fleet_types','home_collection','accreditation_label','bio','published_at'],
  'directory exposes exactly the public allowlist');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('create_provider','add_staff_credential_case','register_provider_document',
    'confirm_provider_document','withdraw_provider_document','submit_provider_verification','review_provider_document',
    'decide_provider_verification','suspend_provider','reinstate_provider','authorize_provider_document_access',
    'expire_due_verifications') and has_function_privilege('anon',p.oid,'execute')),0,'anon cannot execute any I02 command');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where ((n.nspname='private' and p.proname in ('provider_is_verified','person_is_verified','transition_case',
    'next_provider_reference','build_public_snapshot','missing_required_documents','reviewer_conflict','audit_provider_change'))
  or (n.nspname='public' and p.proname='expire_due_verifications'))
  and has_function_privilege('authenticated',p.oid,'execute')),0,'no internal helper or worker command is executable by authenticated');
select ok(has_function_privilege('service_role','public.expire_due_verifications()','execute'),'expiry job is executable by service_role');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
  and not coalesce(p.proconfig @> array['search_path=""'],false)),0,'every definer function pins an empty search_path');
select ok((select not public and file_size_limit=5242880
  and allowed_mime_types=array['application/pdf','image/jpeg','image/png'] from storage.buckets where id='provider-verification'),
  'verification bucket is private, 5 MiB, PDF/JPEG/PNG only');
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects'
  and cmd in ('UPDATE','DELETE','ALL')),0,'no Storage update/delete/all policy exists');
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects'
  and 'anon'=any(roles)),0,'no Storage policy applies to anon');

-- ===== Organizations (I01 forward corrections) =====
select pg_temp.login(3);
select set_config('test.o1',public.create_organization('SYNTHETIC Org One')::text,true);
select ok((select scopes @> array['provider:read','provider:manage'] from public.organization_members
  where organization_id=pg_temp.id('o1') and profile_id=auth.uid()),'new owners receive provider scopes');
select pg_temp.login(7);
select set_config('test.o2',public.create_organization('SYNTHETIC Org Two')::text,true);
reset role;
insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invited_by_profile_id,disabled_at) values
 (pg_temp.id('o1'),pg_temp.u(4),'manager','active','{organization:read,members:read,provider:read,provider:manage}',pg_temp.u(3),null),
 (pg_temp.id('o1'),pg_temp.u(5),'billing','active','{organization:read}',pg_temp.u(3),null),
 (pg_temp.id('o1'),pg_temp.u(6),'doctor','active','{organization:read}',pg_temp.u(3),null),
 (pg_temp.id('o1'),pg_temp.u(14),'manager','disabled','{organization:read,provider:read,provider:manage}',pg_temp.u(3),now()),
 (pg_temp.id('o1'),pg_temp.u(15),'doctor','active','{organization:read}',pg_temp.u(3),null);
insert into public.admin_capabilities(profile_id,capability,organization_id,reason_code)
 values(pg_temp.u(12),'provider:review',pg_temp.id('o2'),'SYNTHETIC_TEST');
select throws_ok($$insert into public.admin_capabilities(profile_id,capability,reason_code)
  values(pg_temp.u(8),'provider:approve_all','SYNTHETIC_TEST')$$,'23514',null,'unknown admin capability rejected');
select throws_ok($$update public.organization_members set scopes='{organization:read,provider:approve}'
  where profile_id=pg_temp.u(5)$$,'23514',null,'unknown membership scope rejected');
select pg_temp.login(3);
select lives_ok($$select public.set_organization_member(pg_temp.id('o1'),pg_temp.u(5),'billing','active',
  array['organization:read','provider:read'],1)$$,'owner can delegate provider:read through I01 command');
select pg_temp.login(4);
select throws_ok($$select public.set_organization_member(pg_temp.id('o1'),pg_temp.u(15),'doctor','active',
  array['organization:read','capability:manage'],1)$$,'42501',null,'manager cannot grant unknown or broader scopes');

-- ===== Anonymous =====
select pg_temp.as_anon();
select throws_ok($$select * from public.providers$$,'42501',null,'anon cannot read providers');
select throws_ok($$select * from public.provider_documents$$,'42501',null,'anon cannot read documents');
select throws_ok($$select * from public.provider_verification_cases$$,'42501',null,'anon cannot read cases');
select throws_ok($$select public.create_provider('doctor',null,'x')$$,'42501',null,'anon cannot create providers');
select throws_ok($$select public.authorize_provider_document_access(gen_random_uuid(),'owner_view')$$,'42501',null,'anon cannot request document tickets');
select throws_ok($$select pg_temp.put('x/y',10,'application/pdf')$$,'42501',null,'anon cannot upload to Storage');
select is((select count(*)::integer from public.provider_directory),0,'directory empty before any approval');
reset role;

-- ===== Individual doctor: creation and draft protections =====
select pg_temp.login(1);
select set_config('test.p1',public.create_provider('doctor',null,'SYNTHETIC Dr One')::text,true);
select is(public.create_provider('doctor',null,'SYNTHETIC Dr One again'),pg_temp.id('p1'),'create_provider is idempotent per owner+category');
select is((select count(*)::integer from public.providers),1,'owner sees exactly their provider');
select ok((select public_reference ~ '^SCV-DOC-[0-9]{6}$' from public.providers where id=pg_temp.id('p1')),'doctor reference allocated');
select is((select verification_state from public.providers where id=pg_temp.id('p1')),'draft','new provider is draft');
select is((select count(*)::integer from public.doctor_profiles where provider_id=pg_temp.id('p1')),1,'doctor extension created');
select set_config('test.c1',(select id::text from public.provider_verification_cases
  where provider_id=pg_temp.id('p1') and subject_profile_id is null),true);
select is((select state from public.provider_verification_cases where id=pg_temp.id('c1')),'draft','provider case starts in draft');
select is((select count(*)::integer from public.provider_verification_events where case_id=pg_temp.id('c1') and event_type='created'),1,'created event appended');
select throws_ok($$select public.create_provider('lab',null,'SYNTHETIC lab')$$,'42501',null,'labs cannot be individually owned');
select throws_ok($$select public.create_provider('pharmacy',null,'SYNTHETIC x')$$,'42501',null,'unknown category denied');
select throws_ok($$select public.create_provider('doctor',null,'   ')$$,'42501',null,'blank provider name denied');
select throws_ok($$insert into public.providers(category,individual_owner_profile_id,public_reference,display_name)
  values('caretaker',auth.uid(),'SCV-CARE-999999','x')$$,'42501',null,'direct provider insert denied');
select throws_ok($$update public.providers set verification_state='approved'$$,'42501',null,'verification state cannot be self assigned');
select throws_ok($$update public.providers set published_profile='{}'$$,'42501',null,'published profile cannot be self assigned');
select throws_ok($$update public.providers set verified_until=now()+interval '1 year'$$,'42501',null,'verified_until cannot be self assigned');
select throws_ok($$update public.provider_verification_cases set state='approved'$$,'42501',null,'case state cannot be self assigned');
select throws_ok($$delete from public.providers$$,'42501',null,'provider delete denied');
select throws_ok($$insert into public.provider_documents(provider_id,document_type,object_path,mime_type,size_bytes)
  values(pg_temp.id('p1'),'doc_government_id','x','application/pdf',1)$$,'42501',null,'direct document metadata insert denied');
update public.providers set display_name='SYNTHETIC Dr One' where id=pg_temp.id('p1');
select is(pg_temp.pver('p1'),2,'allowlisted display name edit increments version');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(1))$$,
  '42501','provider profile incomplete','incomplete profile cannot be submitted');
update public.doctor_profiles set specialty='General medicine',qualification='SYNTHETIC MBBS',languages=array['en','te'],
  bio='SYNTHETIC bio',registration_council='SYNTHETIC COUNCIL',registration_number='SYNTHETIC-REG-0001',
  private_phone='SYNTHETIC-PHONE' where provider_id=pg_temp.id('p1');
select is(pg_temp.pver('p1'),3,'extension edit bumps the provider version used by submit');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(1))$$,
  '42501','required documents missing','submit without documents denied');

-- ===== Document registration =====
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'lab_business_registration',
  'application/pdf',100,null,null,null,pg_temp.k(90))$$,'42501',null,'document type from another category denied');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_staff_government_id',
  'application/pdf',100,null,null,null,pg_temp.k(90))$$,'42501',null,'staff document type at provider level denied');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_org_registration',
  'application/pdf',100,null,null,null,pg_temp.k(90))$$,'42501',null,'organization document type for individual denied');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_medical_registration',
  'application/pdf',100,null,null,null,pg_temp.k(90))$$,'42501',null,'expiring document type needs an expiry date');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_medical_registration',
  'application/pdf',100,null,null,current_date-1,pg_temp.k(90))$$,'42501',null,'already expired document denied');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_government_id',
  'text/html',100,null,null,null,pg_temp.k(90))$$,'42501',null,'disallowed MIME type denied');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_government_id',
  'application/pdf',5242881,null,null,null,pg_temp.k(90))$$,'42501',null,'document over 5 MiB denied');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),pg_temp.u(1),'doc_staff_government_id',
  'application/pdf',100,null,null,null,pg_temp.k(90))$$,'42501',null,'staff documents need an organization provider');
select set_config('test.d1_gid',(select document_id::text from public.register_provider_document(pg_temp.id('p1'),null,
  'doc_government_id','application/pdf',1024,'ID',null,null,pg_temp.k(1))),true);
select is((select document_id from public.register_provider_document(pg_temp.id('p1'),null,'doc_government_id',
  'application/pdf',1024,'ID',null,null,pg_temp.k(1))),pg_temp.id('d1_gid'),'registration replay returns the same document');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_qualification',
  'application/pdf',1024,'ID',null,null,pg_temp.k(1))$$,'23505',null,'idempotency key reuse with other arguments rejected');
select set_config('test.d1_badreg',(select document_id::text from public.register_provider_document(pg_temp.id('p1'),null,
  'doc_medical_registration','application/pdf',2048,'Reg',current_date-10,current_date+200,pg_temp.k(2))),true);
select set_config('test.d1_qual',(select document_id::text from public.register_provider_document(pg_temp.id('p1'),null,
  'doc_qualification','image/png',4096,'Degree',null,null,pg_temp.k(3))),true);
select is((select count(*)::integer from public.provider_documents where provider_id=pg_temp.id('p1')),3,'owner sees own document metadata');
select throws_ok($$select object_path from public.provider_documents$$,'42501',null,'object_path is not selectable');
select throws_ok($$select sha256 from public.provider_documents$$,'42501',null,'sha256 is not selectable');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(1))$$,
  '42501','required documents missing','reserved (not uploaded) documents do not satisfy submit');

-- ===== Storage upload rules =====
select lives_ok($$select pg_temp.put(pg_temp.path('p1','d1_gid'),1024,'application/pdf')$$,'uploader can write a reserved path');
select throws_ok($$select pg_temp.put(pg_temp.path('p1','d1_gid'),1024,'application/pdf')$$,'23505',null,'second write to same path rejected');
select throws_ok($$select pg_temp.put(current_setting('test.p1')||'/'||gen_random_uuid(),10,'application/pdf')$$,'42501',null,'guessed path without reserved metadata denied');
select throws_ok($$select pg_temp.put(current_setting('test.d1_gid'),10,'application/pdf')$$,'42501',null,'path not bound to metadata denied');
select throws_ok($$select public.confirm_provider_document(pg_temp.id('d1_qual'),repeat('a',64))$$,'42501',null,'confirm before upload denied');
select lives_ok($$select pg_temp.put(pg_temp.path('p1','d1_badreg'),9999,'application/pdf')$$,'upload with wrong size is stored');
select throws_ok($$select public.confirm_provider_document(pg_temp.id('d1_badreg'),repeat('b',64))$$,'42501',null,'confirm rejects size mismatch');
select throws_ok($$select public.confirm_provider_document(pg_temp.id('d1_gid'),'not-a-hash')$$,'42501',null,'confirm rejects malformed hash');
select lives_ok($$update storage.objects set metadata='{"size":2048,"mimetype":"application/pdf"}'
  where name=pg_temp.path('p1','d1_badreg')$$,'storage update statement runs');
select throws_ok($$delete from storage.objects where name=pg_temp.path('p1','d1_gid')$$,'42501',null,'direct Storage delete is denied');
select is((select count(*)::integer from storage.objects where bucket_id='provider-verification'),0,'owner cannot list objects without a ticket');

select pg_temp.login(2);
select is((select count(*)::integer from public.providers where id=pg_temp.id('p1')),0,'other doctor cannot read provider');
select is((select count(*)::integer from public.provider_documents where provider_id=pg_temp.id('p1')),0,'other doctor cannot read documents');
select throws_ok($$select pg_temp.put(pg_temp.path('p1','d1_qual'),4096,'image/png')$$,'42501',null,'other user cannot upload to a reserved path');
select throws_ok($$select public.confirm_provider_document(pg_temp.id('d1_gid'),repeat('a',64))$$,'42501',null,'other user cannot confirm');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_government_id',
  'application/pdf',10,null,null,null,pg_temp.k(50))$$,'42501',null,'other user cannot register documents');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),3,pg_temp.k(50))$$,'42501',null,'other user cannot submit');
select throws_ok($$select public.withdraw_provider_document(pg_temp.id('d1_gid'),1)$$,'42501',null,'other user cannot withdraw');
select throws_ok($$select * from public.authorize_provider_document_access(pg_temp.id('d1_gid'),'owner_view')$$,'42501',null,'other user cannot get an owner ticket');
update public.doctor_profiles set specialty='HIJACK' where provider_id=pg_temp.id('p1');
update public.providers set display_name='HIJACK' where id=pg_temp.id('p1');
reset role;
select is((select metadata->>'size' from storage.objects where name=pg_temp.path('p1','d1_badreg')),'9999','storage objects cannot be updated by API roles');
select is((select count(*)::integer from storage.objects where name=pg_temp.path('p1','d1_gid')),1,'storage objects cannot be deleted by API roles');
select is((select specialty from public.doctor_profiles where provider_id=pg_temp.id('p1')),'General medicine','cross-provider extension edit had no effect');
select is((select display_name from public.providers where id=pg_temp.id('p1')),'SYNTHETIC Dr One','cross-provider name edit had no effect');

select pg_temp.login(1);
select set_config('test.d1_reg',(select document_id::text from public.register_provider_document(pg_temp.id('p1'),null,
  'doc_medical_registration','application/pdf',2048,'Reg',current_date-10,current_date+200,pg_temp.k(4))),true);
select lives_ok($$select pg_temp.put(pg_temp.path('p1','d1_reg'),2048,'application/pdf')$$,'replacement registration uploaded');
select lives_ok($$select pg_temp.put(pg_temp.path('p1','d1_qual'),4096,'image/png')$$,'qualification uploaded');
select lives_ok($$select public.confirm_provider_document(pg_temp.id('d1_gid'),repeat('a',64))$$,'government ID confirmed');
select lives_ok($$select public.confirm_provider_document(pg_temp.id('d1_gid'),repeat('a',64))$$,'confirm is idempotent');
select lives_ok($$select public.confirm_provider_document(pg_temp.id('d1_reg'),repeat('b',64))$$,'registration confirmed');
select lives_ok($$select public.confirm_provider_document(pg_temp.id('d1_qual'),repeat('c',64))$$,'qualification confirmed');
select is((select status from public.provider_documents where id=pg_temp.id('d1_gid')),'uploaded','confirmed document is uploaded');

-- ===== Submission and state skipping =====
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1')-1,pg_temp.k(10))$$,
  '40001',null,'stale provider version rejected');
select set_config('test.p1_v',pg_temp.pver('p1')::text,true);
select set_config('test.c1_sub',public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(10))::text,true);
select is((select state from public.provider_verification_cases where id=pg_temp.id('c1')),'submitted','case submitted');
select is((select verification_state from public.providers where id=pg_temp.id('p1')),'submitted','provider mirror submitted');
select is(public.submit_provider_verification(pg_temp.id('c1'),current_setting('test.p1_v')::integer,pg_temp.k(10)),
  current_setting('test.c1_sub')::integer,'submit replay returns the original result');
select is((select count(*)::integer from public.provider_verification_events where case_id=pg_temp.id('c1') and event_type='submitted'),1,'replay appends no event');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),current_setting('test.p1_v')::integer+1,pg_temp.k(10))$$,
  '23505',null,'submit key reuse with other arguments rejected');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(11))$$,
  '42501','transition denied','submitted to submitted denied');
update public.doctor_profiles set specialty='Edited while submitted' where provider_id=pg_temp.id('p1');
update public.providers set display_name='Edited while submitted' where id=pg_temp.id('p1');
select is((select specialty from public.doctor_profiles where provider_id=pg_temp.id('p1')),'General medicine','no extension edits while submitted');
select is((select display_name from public.providers where id=pg_temp.id('p1')),'SYNTHETIC Dr One','no provider edits while submitted');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p1'),null,'doc_qualification',
  'application/pdf',10,null,null,null,pg_temp.k(51))$$,'42501',null,'no document registration while submitted');
select throws_ok($$select public.withdraw_provider_document(pg_temp.id('d1_gid'),pg_temp.dver('d1_gid'))$$,'42501',null,'no withdrawal while submitted');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c1'),pg_temp.k(12))$$,'42501',null,'owner cannot approve (aal1)');
reset role;
select ok(not (select submitted_profile ? 'registration_number' or submitted_profile ? 'private_phone'
  or submitted_profile ? 'registration_council' from public.provider_verification_cases where id=pg_temp.id('c1')),
  'submitted snapshot contains no private fields');

-- ===== Admin capability checks =====
select pg_temp.login(8);
select is((select count(*)::integer from public.providers),0,'patient sees no providers');
select is((select count(*)::integer from public.provider_documents),0,'patient sees no documents');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',2,pg_temp.k(12))$$,
  '42501',null,'patient cannot decide');
select throws_ok($$select public.review_provider_document(pg_temp.id('d1_gid'),'accepted',null,null,2)$$,'42501',null,'patient cannot review documents');
select throws_ok($$select public.create_provider('doctor',pg_temp.id('o1'),'SYNTHETIC x')$$,'42501',null,'patient cannot create a provider in a foreign org');
select pg_temp.login(9,'aal1');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',2,pg_temp.k(12))$$,
  '42501',null,'reviewer without MFA denied');
select is((select count(*)::integer from public.providers),0,'reviewer without MFA reads nothing');
select pg_temp.login(13,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',2,pg_temp.k(12))$$,
  '42501',null,'expired capability denied');
select pg_temp.login(12,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',2,pg_temp.k(12))$$,
  '42501',null,'org-scoped reviewer cannot review an individual provider');
select pg_temp.login(11,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',2,pg_temp.k(12))$$,
  '42501',null,'suspend capability cannot approve');
select throws_ok($$select * from public.authorize_provider_document_access(pg_temp.id('d1_gid'),'admin_review')$$,'42501',null,'suspend capability cannot open files');
select pg_temp.login(10,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',2,pg_temp.k(12))$$,
  '42501',null,'document reader cannot approve');
select throws_ok($$select public.review_provider_document(pg_temp.id('d1_gid'),'accepted',null,null,2)$$,'42501',null,'document reader cannot review');
-- Self-approval: an owner who also holds a review capability still cannot approve their own provider.
reset role;
insert into public.admin_capabilities(profile_id,capability,organization_id,reason_code)
  values(pg_temp.u(1),'provider:review',null,'SYNTHETIC_TEST');
select pg_temp.login(1,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c1'),pg_temp.k(12))$$,'42501',null,'owner with review capability cannot self-approve');
select throws_ok($$select public.review_provider_document(pg_temp.id('d1_gid'),'accepted',null,null,pg_temp.dver('d1_gid'))$$,
  '42501',null,'owner with review capability cannot review own documents');
reset role;
update public.admin_capabilities set revoked_at=now() where profile_id=pg_temp.u(1);
select pg_temp.login(9,'aal2');
select is((select count(*)::integer from public.provider_documents where provider_id=pg_temp.id('p1')),4,'reviewer sees submitted document metadata');
select throws_ok($$select * from public.authorize_provider_document_access(pg_temp.id('d1_gid'),'admin_review')$$,'42501',null,'review capability alone cannot open files');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c1'),pg_temp.k(12))$$,'42501','accepted documents required','approval needs accepted documents');
select throws_ok($$select public.review_provider_document(pg_temp.id('d1_gid'),'accepted',null,null,pg_temp.dver('d1_gid')-1)$$,
  '40001',null,'stale document version rejected');
select throws_ok($$select public.review_provider_document(pg_temp.id('d1_gid'),'rejected',null,null,pg_temp.dver('d1_gid'))$$,
  '42501',null,'document rejection needs a reason');
select throws_ok($$select public.review_provider_document(pg_temp.id('d1_badreg'),'accepted',null,null,pg_temp.dver('d1_badreg'))$$,
  '42501',null,'reserved (unconfirmed) document cannot be accepted');
select lives_ok($$select public.review_provider_document(pg_temp.id('d1_gid'),'accepted',null,null,pg_temp.dver('d1_gid'))$$,'ID accepted');
select lives_ok($$select public.review_provider_document(pg_temp.id('d1_reg'),'accepted',null,null,pg_temp.dver('d1_reg'))$$,'registration accepted');
select lives_ok($$select public.review_provider_document(pg_temp.id('d1_qual'),'accepted',null,null,pg_temp.dver('d1_qual'))$$,'qualification accepted');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '366 days',
  pg_temp.cver('c1'),pg_temp.k(12))$$,'42501',null,'validity beyond 365 days denied');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '300 days',
  pg_temp.cver('c1'),pg_temp.k(12))$$,'42501','accepted documents required','validity beyond a document expiry denied');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'rejected',null,'x',null,
  pg_temp.cver('c1'),pg_temp.k(12))$$,'42501',null,'rejection needs a reason code');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'suspended','X_REASON',null,null,
  pg_temp.cver('c1'),pg_temp.k(12))$$,'42501',null,'submitted cannot jump to suspended');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c1')-1,pg_temp.k(12))$$,'40001',null,'stale case version rejected');

select pg_temp.login(9,'aal2');
select set_config('test.c1_appr',public.decide_provider_verification(pg_temp.id('c1'),'approved',null,'SYNTHETIC ok',
  now()+interval '180 days',pg_temp.cver('c1'),pg_temp.k(13))::text,true);
select is((select verification_state from public.providers where id=pg_temp.id('p1')),'approved','provider approved');
select is(public.decide_provider_verification(pg_temp.id('c1'),'approved',null,'SYNTHETIC ok',now()+interval '180 days',
  current_setting('test.c1_sub')::integer,pg_temp.k(13)),current_setting('test.c1_appr')::integer,'approval replay returns original result');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'rejected','X_REASON',null,null,
  current_setting('test.c1_sub')::integer,pg_temp.k(13))$$,'23505',null,'approval key reuse with other arguments rejected');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c1'),pg_temp.k(14))$$,'42501','transition denied','approved cannot be approved again');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'rejected','X_REASON',null,null,
  pg_temp.cver('c1'),pg_temp.k(14))$$,'42501','transition denied','approved cannot be rejected');
reset role;
select ok(not (select published_profile ? 'registration_number' or published_profile ? 'private_phone'
  from public.providers where id=pg_temp.id('p1')),'published profile has no private fields');
select set_config('test.p1_ref',(select public_reference from public.providers where id=pg_temp.id('p1')),true);

-- ===== Public directory =====
select pg_temp.as_anon();
select is((select count(*)::integer from public.provider_directory),1,'approved provider is listed');
select is((select specialty from public.provider_directory where public_reference=current_setting('test.p1_ref')),
  'General medicine','directory shows the approved snapshot');
select is((select languages from public.provider_directory where public_reference=current_setting('test.p1_ref')),
  array['en','te'],'directory exposes typed languages');
reset role;
select pg_temp.login(1);
update public.doctor_profiles set specialty='SYNTHETIC Changed' where provider_id=pg_temp.id('p1');
select is((select specialty from public.doctor_profiles where provider_id=pg_temp.id('p1')),'SYNTHETIC Changed','owner may edit while approved');
select is((select specialty from public.provider_directory where public_reference=current_setting('test.p1_ref')),
  'General medicine','edits do not reach the directory without re-approval');

-- ===== Private document access =====
select set_config('test.t1',(select object_path from public.authorize_provider_document_access(pg_temp.id('d1_gid'),'owner_view')),true);
select is(current_setting('test.t1'),pg_temp.path('p1','d1_gid'),'owner ticket returns the object path');
select is((select count(*)::integer from storage.objects where name=pg_temp.path('p1','d1_gid')),1,'owner with ticket can read the object');
select is((select count(*)::integer from storage.objects where name=pg_temp.path('p1','d1_reg')),0,'ticket covers only one object');
select throws_ok($$select * from public.authorize_provider_document_access(pg_temp.id('d1_gid'),'admin_review')$$,'42501',null,'owner cannot use admin purpose');
select throws_ok($$select * from public.authorize_provider_document_access(pg_temp.id('d1_badreg'),'owner_view')$$,'42501',null,'reserved document has no readable file');
select throws_ok($$insert into public.provider_document_access_grants(document_id,object_path,grantee_profile_id,purpose_code,expires_at)
  values(pg_temp.id('d1_reg'),pg_temp.path('p1','d1_reg'),auth.uid(),'owner_view',now()+interval '60 seconds')$$,'42501',null,'tickets cannot be self-issued');
select pg_temp.login(10,'aal1');
select throws_ok($$select * from public.authorize_provider_document_access(pg_temp.id('d1_gid'),'admin_review')$$,'42501',null,'document reader without MFA denied');
select pg_temp.login(10,'aal2');
select lives_ok($$select * from public.authorize_provider_document_access(pg_temp.id('d1_reg'),'admin_review')$$,'document reader gets a ticket');
select is((select count(*)::integer from storage.objects where name=pg_temp.path('p1','d1_reg')),1,'document reader can read the object');
select is((select count(*)::integer from storage.objects where name=pg_temp.path('p1','d1_gid')),0,'document reader cannot read other objects');
reset role;
insert into public.provider_document_access_grants(document_id,object_path,grantee_profile_id,purpose_code,created_at,expires_at)
  values(pg_temp.id('d1_gid'),pg_temp.path('p1','d1_gid'),pg_temp.u(2),'owner_view',now()-interval '2 minutes',now()-interval '1 minute');
select is((select count(*)::integer from public.provider_verification_events where provider_id=pg_temp.id('p1')
  and event_type='document_accessed'),2,'every ticket appends a document_accessed event');
select ok((select count(*)::integer from public.audit_events where target_table='provider_verification_events'
  and after_state->>'event_type'='document_accessed')>=2,'document access is in the audit log');
select pg_temp.login(2);
select is((select count(*)::integer from storage.objects where name=pg_temp.path('p1','d1_gid')),0,'expired ticket grants nothing');

-- ===== Suspension =====
select pg_temp.login(9,'aal2');
select throws_ok($$select public.suspend_provider(pg_temp.id('c1'),'SYNTHETIC_SUSPEND',null,pg_temp.cver('c1'),pg_temp.k(20))$$,
  '42501',null,'review capability cannot suspend');
select pg_temp.login(11,'aal1');
select throws_ok($$select public.suspend_provider(pg_temp.id('c1'),'SYNTHETIC_SUSPEND',null,1,pg_temp.k(20))$$,'42501',null,'suspender without MFA denied');
select pg_temp.login(11,'aal2');
select throws_ok($$select public.suspend_provider(pg_temp.id('c1'),null,null,pg_temp.cver('c1'),pg_temp.k(20))$$,'42501',null,'suspension needs a reason');
select throws_ok($$select public.reinstate_provider(pg_temp.id('c1'),null,pg_temp.cver('c1'),pg_temp.k(20))$$,'42501','transition denied','approved cannot be reinstated');
select lives_ok($$select public.suspend_provider(pg_temp.id('c1'),'SYNTHETIC_SUSPEND','SYNTHETIC',pg_temp.cver('c1'),pg_temp.k(21))$$,'provider suspended');
select is((select verification_state from public.providers where id=pg_temp.id('p1')),'suspended','provider mirror suspended');
select pg_temp.as_anon();
select is((select count(*)::integer from public.provider_directory),0,'suspended provider leaves the directory immediately');
reset role;
select ok(not private.provider_is_verified(pg_temp.id('p1')),'suspended provider is not verified');
select ok(not private.person_is_verified(pg_temp.id('p1'),pg_temp.u(1)),'suspended doctor is not assignable');
select pg_temp.login(1);
update public.doctor_profiles set specialty='Edited while suspended' where provider_id=pg_temp.id('p1');
select is((select specialty from public.doctor_profiles where provider_id=pg_temp.id('p1')),'SYNTHETIC Changed','no edits while suspended');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(22))$$,'42501','transition denied','suspended cannot self-resubmit');
select pg_temp.login(11,'aal2');
select lives_ok($$select public.reinstate_provider(pg_temp.id('c1'),'SYNTHETIC',pg_temp.cver('c1'),pg_temp.k(23))$$,'provider reinstated');
select pg_temp.as_anon();
select is((select specialty from public.provider_directory where public_reference=current_setting('test.p1_ref')),
  'General medicine','reinstatement restores the approved snapshot');
reset role;

-- ===== Re-review after edits =====
select pg_temp.login(1);
select lives_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(24))$$,'approved provider resubmits after edit');
select pg_temp.as_anon();
select is((select count(*)::integer from public.provider_directory),0,'provider is unlisted while under re-review (OQ-4)');
select pg_temp.login(9,'aal2');
select lives_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '180 days',
  pg_temp.cver('c1'),pg_temp.k(25))$$,'re-review approved');
select pg_temp.as_anon();
select is((select specialty from public.provider_directory where public_reference=current_setting('test.p1_ref')),
  'SYNTHETIC Changed','directory shows the newly approved snapshot');

-- ===== Expiry =====
select pg_temp.login(1);
select throws_ok($$select public.expire_due_verifications()$$,'42501',null,'authenticated cannot run the expiry job');
reset role;
update public.provider_verification_cases set verified_until=now()-interval '1 minute' where id=pg_temp.id('c1');
update public.providers set verified_until=now()-interval '1 minute' where id=pg_temp.id('p1');
select pg_temp.as_anon();
select is((select count(*)::integer from public.provider_directory),0,'lapsed validity hides the provider before the job runs');
reset role;
select ok(not private.provider_is_verified(pg_temp.id('p1')),'lapsed provider is not verified');
set local role service_role;
select is(public.expire_due_verifications(),1,'expiry job expires the lapsed case');
select is(public.expire_due_verifications(),0,'expiry job is idempotent');
reset role;
select is((select verification_state from public.providers where id=pg_temp.id('p1')),'expired','provider mirror expired');
select ok((select published_profile is null from public.providers where id=pg_temp.id('p1')),'expiry clears the published profile');
select pg_temp.login(11,'aal2');
select throws_ok($$select public.reinstate_provider(pg_temp.id('c1'),null,pg_temp.cver('c1'),pg_temp.k(26))$$,'42501','transition denied','expired cannot be reinstated');
select pg_temp.login(9,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c1'),pg_temp.k(26))$$,'42501','transition denied','expired cannot be approved directly');
select pg_temp.login(1);
select lives_ok($$select public.submit_provider_verification(pg_temp.id('c1'),pg_temp.pver('p1'),pg_temp.k(27))$$,'expired provider renews');
select pg_temp.login(9,'aal2');
select lives_ok($$select public.decide_provider_verification(pg_temp.id('c1'),'approved',null,null,now()+interval '90 days',
  pg_temp.cver('c1'),pg_temp.k(28))$$,'renewal approved');
select pg_temp.as_anon();
select is((select count(*)::integer from public.provider_directory),1,'renewed provider listed again');
reset role;
update public.profiles set status='disabled' where id=pg_temp.u(1);
select pg_temp.as_anon();
select is((select count(*)::integer from public.provider_directory),0,'disabled owner account hides the provider');
reset role;
update public.profiles set status='active' where id=pg_temp.u(1);

-- ===== Organization provider, staff credentials and assignment eligibility =====
select pg_temp.login(4);
select set_config('test.p2',public.create_provider('doctor',pg_temp.id('o1'),'SYNTHETIC Clinic')::text,true);
select ok((select public_reference<>current_setting('test.p1_ref') from public.providers where id=pg_temp.id('p2')),'references are unique');
select lives_ok($$select public.create_provider('lab',pg_temp.id('o1'),'SYNTHETIC Lab')$$,'organization may own a lab');
select set_config('test.c2',(select id::text from public.provider_verification_cases
  where provider_id=pg_temp.id('p2') and subject_profile_id is null),true);
select pg_temp.login(5);
select is((select count(*)::integer from public.providers where id=pg_temp.id('p2')),1,'member with provider:read can read');
select throws_ok($$select public.create_provider('caretaker',pg_temp.id('o1'),'SYNTHETIC Care')$$,'42501',null,'member without provider:manage cannot create');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p2'),null,'doc_org_registration',
  'application/pdf',10,null,null,null,pg_temp.k(60))$$,'42501',null,'member without provider:manage cannot upload');
select is((select count(*)::integer from public.provider_documents where provider_id=pg_temp.id('p2')),0,'member without provider:manage cannot see documents');
update public.providers set display_name='HIJACK' where id=pg_temp.id('p2');
select throws_ok($$select public.add_staff_credential_case(pg_temp.id('p2'),pg_temp.u(6))$$,'42501',null,'member without provider:manage cannot add staff cases');
select pg_temp.login(14);
select throws_ok($$select public.create_provider('caretaker',pg_temp.id('o1'),'SYNTHETIC Care')$$,'42501',null,'disabled member denied');
select is((select count(*)::integer from public.providers where id=pg_temp.id('p2')),0,'disabled member cannot read');
select pg_temp.login(7);
select throws_ok($$select public.create_provider('caretaker',pg_temp.id('o1'),'SYNTHETIC Care')$$,'42501',null,'foreign org owner cannot create in org1');
select is((select count(*)::integer from public.providers where id=pg_temp.id('p2')),0,'foreign org owner cannot read');
reset role;
select is((select display_name from public.providers where id=pg_temp.id('p2')),'SYNTHETIC Clinic','read-only member edit had no effect');
select throws_ok($$insert into public.providers(category,public_reference,display_name) values('doctor','SCV-DOC-900001','x')$$,
  '23514',null,'provider needs an owner');
select throws_ok($$insert into public.providers(category,individual_owner_profile_id,organization_id,public_reference,display_name)
  values('doctor',pg_temp.u(2),pg_temp.id('o1'),'SCV-DOC-900002','x')$$,'23514',null,'provider cannot have two owners');
select throws_ok($$insert into public.providers(category,organization_id,public_reference,display_name)
  values('doctor',pg_temp.id('o1'),'SCV-DOC-900003','x')$$,'23505',null,'one provider per organization and category');
select throws_ok($$insert into public.lab_profiles(provider_id) values(pg_temp.id('p2'))$$,'23503',null,'extension category must match provider');
select throws_ok($$insert into public.ambulance_profiles(provider_id,scheduled_only) values(pg_temp.id('p2'),false)$$,'23514',null,'ambulance cannot enable emergency dispatch');
select throws_ok($$update public.providers set public_reference='SCV-DOC-999999' where id=pg_temp.id('p2')$$,'42501',null,'public reference immutable');
select throws_ok($$update public.providers set organization_id=pg_temp.id('o2') where id=pg_temp.id('p2')$$,'42501',null,'ownership immutable');
select throws_ok($$update public.providers set category='caretaker' where id=pg_temp.id('p2')$$,'42501',null,'category immutable');

select pg_temp.login(4);
select throws_ok($$select public.add_staff_credential_case(pg_temp.id('p2'),pg_temp.u(5))$$,'42501',null,'billing member cannot hold a doctor credential case');
select throws_ok($$select public.add_staff_credential_case(pg_temp.id('p2'),pg_temp.u(2))$$,'42501',null,'non-member cannot hold a credential case');
select throws_ok($$select public.add_staff_credential_case(pg_temp.id('p1'),pg_temp.u(6))$$,'42501',null,'staff cases need an organization provider');
select set_config('test.cs',public.add_staff_credential_case(pg_temp.id('p2'),pg_temp.u(6))::text,true);
select is(public.add_staff_credential_case(pg_temp.id('p2'),pg_temp.u(6)),pg_temp.id('cs'),'staff case creation is idempotent');
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p2'),pg_temp.u(6),'doc_staff_government_id',
  'application/pdf',10,null,null,null,pg_temp.k(61))$$,'42501',null,'manager cannot upload a staff member''s documents');
update public.doctor_profiles set specialty='Family medicine',qualification='SYNTHETIC MD',languages=array['hi'] where provider_id=pg_temp.id('p2');
select set_config('test.o_reg',(select document_id::text from public.register_provider_document(pg_temp.id('p2'),null,
  'doc_org_registration','application/pdf',500,null,null,null,pg_temp.k(62))),true);
select lives_ok($$select pg_temp.put(pg_temp.path('p2','o_reg'),500,'application/pdf')$$,'org document uploaded');
select lives_ok($$select public.confirm_provider_document(pg_temp.id('o_reg'),repeat('d',64))$$,'org document confirmed');
select lives_ok($$select public.submit_provider_verification(pg_temp.id('c2'),pg_temp.pver('p2'),pg_temp.k(63))$$,'org provider submitted');

select pg_temp.login(6);
select throws_ok($$select * from public.register_provider_document(pg_temp.id('p2'),null,'doc_org_registration',
  'application/pdf',10,null,null,null,pg_temp.k(64))$$,'42501',null,'staff member cannot upload provider-level documents');
select set_config('test.s_gid',(select document_id::text from public.register_provider_document(pg_temp.id('p2'),pg_temp.u(6),
  'doc_staff_government_id','application/pdf',700,null,null,null,pg_temp.k(65))),true);
select set_config('test.s_reg',(select document_id::text from public.register_provider_document(pg_temp.id('p2'),pg_temp.u(6),
  'doc_staff_medical_registration','application/pdf',800,null,null,current_date+300,pg_temp.k(66))),true);
select lives_ok($$select pg_temp.put(pg_temp.path('p2','s_gid'),700,'application/pdf')$$,'staff ID uploaded by subject');
select lives_ok($$select pg_temp.put(pg_temp.path('p2','s_reg'),800,'application/pdf')$$,'staff registration uploaded by subject');
select lives_ok($$select public.confirm_provider_document(pg_temp.id('s_gid'),repeat('e',64))$$,'staff ID confirmed');
select lives_ok($$select public.confirm_provider_document(pg_temp.id('s_reg'),repeat('f',64))$$,'staff registration confirmed');
select is((select count(*)::integer from public.provider_verification_cases where id=pg_temp.id('cs')),1,'subject can read own staff case');
select throws_ok($$select public.submit_provider_verification(pg_temp.id('cs'),pg_temp.cver('cs')+1,pg_temp.k(69))$$,'40001',null,'staff submit binds to the case version');
select lives_ok($$select public.submit_provider_verification(pg_temp.id('cs'),pg_temp.cver('cs'),pg_temp.k(67))$$,'subject submits own staff case');
select pg_temp.login(15);
select throws_ok($$select public.submit_provider_verification(pg_temp.id('cs'),1,pg_temp.k(68))$$,'42501',null,'another staff member cannot submit');
select pg_temp.login(4);
select is((select count(*)::integer from public.provider_documents where subject_profile_id=pg_temp.u(6)),0,'manager cannot see staff personal documents');
select throws_ok($$select * from public.authorize_provider_document_access(pg_temp.id('s_gid'),'owner_view')$$,'42501',null,'manager cannot open staff personal documents');
reset role;
select ok(not private.person_is_verified(pg_temp.id('p2'),pg_temp.u(6)),'unapproved organization doctor is not assignable');

-- Reviewer conflicts on organization providers.
insert into public.admin_capabilities(profile_id,capability,organization_id,reason_code)
  values(pg_temp.u(4),'provider:review',null,'SYNTHETIC_TEST');
select pg_temp.login(4,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c2'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c2'),pg_temp.k(70))$$,'42501',null,'organization member cannot approve own organization');
reset role;
update public.admin_capabilities set revoked_at=now() where profile_id=pg_temp.u(4);
select pg_temp.login(12,'aal2');
select throws_ok($$select public.decide_provider_verification(pg_temp.id('c2'),'approved',null,null,now()+interval '30 days',
  pg_temp.cver('c2'),pg_temp.k(70))$$,'42501',null,'reviewer scoped to another organization denied');
select is((select count(*)::integer from public.providers where id=pg_temp.id('p2')),0,'reviewer scoped to another organization reads nothing');

select pg_temp.login(9,'aal2');
select lives_ok($$select public.review_provider_document(pg_temp.id('o_reg'),'accepted',null,null,pg_temp.dver('o_reg'))$$,'org document accepted');
select lives_ok($$select public.decide_provider_verification(pg_temp.id('c2'),'approved',null,null,now()+interval '120 days',
  pg_temp.cver('c2'),pg_temp.k(71))$$,'org provider approved');
reset role;
select ok(private.provider_is_verified(pg_temp.id('p2')),'org provider verified');
select ok(not private.person_is_verified(pg_temp.id('p2'),pg_temp.u(6)),'org approval alone does not make staff assignable (Q06)');
select pg_temp.login(9,'aal2');
select lives_ok($$select public.review_provider_document(pg_temp.id('s_gid'),'accepted',null,null,pg_temp.dver('s_gid'))$$,'staff ID accepted');
select lives_ok($$select public.review_provider_document(pg_temp.id('s_reg'),'accepted',null,null,pg_temp.dver('s_reg'))$$,'staff registration accepted');
select lives_ok($$select public.decide_provider_verification(pg_temp.id('cs'),'approved',null,null,now()+interval '120 days',
  pg_temp.cver('cs'),pg_temp.k(72))$$,'staff credential approved');
reset role;
select ok(private.person_is_verified(pg_temp.id('p2'),pg_temp.u(6)),'individually verified staff doctor is assignable');
select ok(not private.person_is_verified(pg_temp.id('p2'),pg_temp.u(15)),'other org doctor without a case is not assignable');
select ok(not private.person_is_verified(pg_temp.id('p2'),pg_temp.u(1)),'verified independent doctor is not assignable through another provider');
select ok(private.person_is_verified(pg_temp.id('p1'),pg_temp.u(1)),'independent verified doctor is assignable to own provider');
select ok(not private.person_is_verified(pg_temp.id('p1'),pg_temp.u(6)),'staff doctor is not assignable to an unrelated provider');
select is((select verification_state from public.providers where id=pg_temp.id('p2')),'approved','staff case does not alter the provider mirror');
update public.organization_members set status='disabled',disabled_at=now() where organization_id=pg_temp.id('o1') and profile_id=pg_temp.u(6);
select ok(not private.person_is_verified(pg_temp.id('p2'),pg_temp.u(6)),'disabled membership removes assignability');
update public.organization_members set status='active',disabled_at=null where organization_id=pg_temp.id('o1') and profile_id=pg_temp.u(6);
select pg_temp.login(11,'aal2');
select lives_ok($$select public.suspend_provider(pg_temp.id('cs'),'SYNTHETIC_SUSPEND',null,pg_temp.cver('cs'),pg_temp.k(73))$$,'staff credential suspended');
reset role;
select ok(not private.person_is_verified(pg_temp.id('p2'),pg_temp.u(6)),'suspended staff credential removes assignability');
select ok(private.provider_is_verified(pg_temp.id('p2')),'staff suspension leaves the organization listed');
select pg_temp.login(11,'aal2');
select lives_ok($$select public.reinstate_provider(pg_temp.id('cs'),null,pg_temp.cver('cs'),pg_temp.k(74))$$,'staff credential reinstated');
select lives_ok($$select public.suspend_provider(pg_temp.id('c2'),'SYNTHETIC_SUSPEND',null,pg_temp.cver('c2'),pg_temp.k(75))$$,'org provider suspended');
reset role;
select ok(not private.person_is_verified(pg_temp.id('p2'),pg_temp.u(6)),'provider suspension removes staff assignability');
select pg_temp.login(11,'aal2');
select lives_ok($$select public.reinstate_provider(pg_temp.id('c2'),null,pg_temp.cver('c2'),pg_temp.k(76))$$,'org provider reinstated');
reset role;
select ok(private.person_is_verified(pg_temp.id('p2'),pg_temp.u(6)),'reinstated staff doctor is assignable again');
update public.organizations set status='disabled' where id=pg_temp.id('o1');
select ok(not private.provider_is_verified(pg_temp.id('p2')),'disabled organization is not verified');
select pg_temp.as_anon();
select is((select count(*)::integer from public.provider_directory where category='doctor'),1,'disabled organization leaves the directory');
reset role;
update public.organizations set status='active' where id=pg_temp.id('o1');

-- ===== Audit and append-only history =====
select ok((select count(*)::integer from public.audit_events where target_table='provider_verification_cases')>0,'case transitions audited');
select ok((select count(*)::integer from public.audit_events where target_table='provider_documents')>0,'document changes audited');
select is((select count(*)::integer from public.audit_events where target_table in ('providers','doctor_profiles',
  'lab_profiles','ambulance_profiles','caretaker_profiles','provider_verification_cases','provider_documents',
  'provider_verification_events') and (before_state ?| array['registration_number','private_phone',
  'object_path','sha256','label','message','review_message','published_profile','submitted_profile','display_name']
  or after_state ?| array['registration_number','private_phone','object_path','sha256','label','message','review_message',
  'published_profile','submitted_profile','display_name'])),0,'audit rows carry no private or free-text fields');
select throws_ok($$update public.provider_verification_events set reason_code='FORGED'$$,'42501',null,'events cannot be edited');
select throws_ok($$delete from public.provider_verification_events$$,'42501',null,'events cannot be deleted');
select throws_ok($$truncate public.provider_verification_events cascade$$,'42501',null,'events cannot be truncated');
select throws_ok($$delete from public.provider_document_access_grants$$,'42501',null,'tickets cannot be deleted');
set local role service_role;
select throws_ok($$insert into public.provider_verification_events(case_id,provider_id,event_type,actor_kind)
  values(pg_temp.id('c1'),pg_temp.id('p1'),'approved','admin')$$,'42501',null,'service_role cannot forge verification events');
select throws_ok($$insert into public.provider_document_access_grants(document_id,object_path,grantee_profile_id,purpose_code,expires_at,created_at)
  values(pg_temp.id('d1_gid'),pg_temp.path('p1','d1_gid'),pg_temp.u(2),'owner_view',now()+interval '60 seconds',now())$$,
  '42501',null,'service_role cannot forge access tickets');
reset role;
select pg_temp.login(1);
select is((select count(*)::integer from public.provider_verification_events where provider_id=pg_temp.id('p2')),0,'owner cannot read another provider''s events');
select ok((select count(*)::integer from public.provider_verification_events where provider_id=pg_temp.id('p1'))>0,'owner reads own review history');
select throws_ok($$select request_hash from public.provider_verification_events$$,'42501',null,'idempotency hashes are not exposed');
reset role;

select * from finish();
rollback;
