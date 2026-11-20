\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dcx_fixture.inc
-- DC extras structure (DB NOT EXECUTED): gates seeded off, catalog and grants, closed tables
-- and schema, private bucket, Storage registry, no Realtime publication (DC03, design D37).

-- 1. Every DC-extras gate was created off; the fixture turned them on afterwards.
do $$ declare k text; begin
 foreach k in array array['doctor_progress','doctor_visit_payment','doctor_fact_review','doctor_visit_proof','doctor_photos'] loop
  perform pg_temp.assert_true((select to_state from booking_private.feature_gate_events where key=k order by version limit 1)='off',k||' seeded off');
 end loop;
end $$;

-- 2. Public RPCs: definer, empty search_path, authenticated only (the guest proof check also anon).
do $$ declare f regprocedure; begin
 foreach f in array array['public.get_visit_progress(uuid,integer)','public.get_visit_payment_status(uuid)',
  'public.record_health_fact(uuid,text,text,uuid)','public.revise_health_fact(uuid,text,integer,uuid)',
  'public.verify_health_fact(uuid,integer,uuid,text,text,text,uuid)','public.list_health_facts(uuid,uuid)',
  'public.issue_visit_proof(uuid,integer,uuid)','public.revoke_visit_proof(uuid,uuid)','public.list_visit_proofs(uuid)',
  'public.verify_visit_proof(text)','public.grant_photo_consent(uuid,text,text,uuid)','public.withdraw_photo_consent(uuid,integer,uuid)',
  'public.register_visit_photo(uuid,uuid,text,uuid)','public.authorize_visit_photo_read(uuid)','public.list_visit_photos(uuid)']::regprocedure[] loop
  perform pg_temp.assert_true((select prosecdef and exists(select 1 from unnest(proconfig) x where x in ('search_path=""','search_path=')) from pg_proc where oid=f),f||' definer with empty search path');
  perform pg_temp.assert_true(not has_function_privilege('public',f,'EXECUTE'),f||' no PUBLIC execution');
  perform pg_temp.assert_true(not has_function_privilege('service_role',f,'EXECUTE'),f||' no service_role execution');
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE'),f||' authenticated may execute');
  perform pg_temp.assert_true(has_function_privilege('anon',f,'EXECUTE')=(f='public.verify_visit_proof(text)'::regprocedure),f||' anon only for the guest proof check');
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='dcx_private' loop
  perform pg_temp.assert_true(exists(select 1 from pg_proc p, unnest(p.proconfig) x where p.oid=f and x in ('search_path=""','search_path=')),f||' empty search path');
  perform pg_temp.assert_true(not has_function_privilege('anon',f,'EXECUTE') and not has_function_privilege('service_role',f,'EXECUTE'),f||' no anon/service_role');
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE')=(f='dcx_private.photo_object_access(text,text,boolean)'::regprocedure),
   f||' only the Storage predicate is executable by authenticated');
 end loop;
end $$;
select pg_temp.assert_true(has_schema_privilege('authenticated','dcx_private','USAGE') and not has_schema_privilege('anon','dcx_private','USAGE')
 and not has_schema_privilege('service_role','dcx_private','USAGE'),'dcx_private: usage for the Storage predicate only');

-- 3. Tables: RLS on, no privilege for any API role (service_role included), no policy.
do $$ declare t text; r text; begin
 foreach t in array array['public.health_facts','public.health_fact_versions','public.health_fact_verifications','public.visit_photo_consents',
  'public.visit_photos','dcx_private.visit_proof_tokens','dcx_private.photo_read_tickets'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=t::regclass),t||' RLS enabled');
  perform pg_temp.assert_true(not exists(select 1 from pg_policy where polrelid=t::regclass),t||' has no policy');
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.assert_true(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' no privilege on '||t);
  end loop;
 end loop;
end $$;
select pg_temp.assert_true((select array_agg(column_name::text order by column_name) from information_schema.columns
 where table_schema='dcx_private' and table_name='visit_proof_tokens')
 =array['booking_id','expires_at','id','issued_at','issued_by_profile_id','revoked_at','revoked_by_profile_id','token_hash'],
 'proof table stores a hash, no plaintext token column');

-- 4. Storage: private bucket, registered predicate, the shared guard untouched.
select pg_temp.assert_true((select not public and file_size_limit=5242880 and allowed_mime_types=array['image/jpeg','image/png']
 from storage.buckets where id='visit-evidence'),'visit-evidence bucket is private and bounded');
select pg_temp.assert_true(not exists(select 1 from storage.buckets where public),'no public bucket exists');
select pg_temp.assert_true(exists(select 1 from providers_private.category_object_checks
 where checker='dcx_private.photo_object_access(text,text,boolean)'::regprocedure),'photo predicate registered with the shared hook');
select pg_temp.assert_true((select count(*)=2 from pg_policies where schemaname='storage' and tablename='objects'
 and policyname in ('dcx_photo_objects_insert','dcx_photo_objects_read') and permissive='PERMISSIVE'),'two permissive photo policies');
select pg_temp.assert_true(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_no_signing'),'signing ban still present');

-- 5. DC03: nothing joins the Realtime publication.
select pg_temp.assert_true((select count(*)=0 from pg_publication_tables where pubname='supabase_realtime'
 and tablename in ('bookings','booking_events','doctor_visits','notification_outbox','health_facts','visit_photos','visit_photo_consents')),'no Realtime publication');

-- 6. Gate helper semantics.
select pg_temp.set_gate('suspended','doctor_progress');
select pg_temp.expect_state($$select dcx_private.require_feature('doctor_progress','write')$$,'55000','suspended blocks writes');
select dcx_private.require_feature('doctor_progress','read');
select pg_temp.set_gate('off','doctor_progress');
select pg_temp.expect_state($$select dcx_private.require_feature('doctor_progress','read')$$,'55000','off blocks reads');
select dcx_private.require_feature('doctor_progress','withdraw');
select pg_temp.expect_state($$select dcx_private.require_feature('doctor_progress','other')$$,'22023','unknown mode');

\echo 1..1
\echo ok 1 - 120_dcx_structure
rollback;
