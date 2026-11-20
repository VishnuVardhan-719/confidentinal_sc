\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
-- DC clinical core: catalog, privileges, RLS, gate seed, validators. DB NOT EXECUTED.

-- 1. Gate seeded off by the migration (before any fixture turns gates on).
select pg_temp.assert_true((select state='off' from booking_private.feature_gates where key='doctor_clinical'),'doctor_clinical gate seeded off');
select pg_temp.assert_true(exists(select 1 from booking_private.feature_gate_events where key='doctor_clinical' and from_state is null
 and to_state='off' and version=1),'gate seed wrote one off event');

\ir _dc_fixture.inc

-- 2. Public RPCs: definer, empty search path, authenticated only.
do $$ declare f regprocedure; begin
 foreach f in array array['public.save_clinical_draft(uuid,integer,jsonb,uuid)','public.get_clinical_draft(uuid)',
  'public.sign_clinical_record(uuid,integer,boolean,boolean,uuid)','public.amend_clinical_record(uuid,jsonb,text,boolean,boolean,uuid)',
  'public.get_clinical_record(uuid)','public.list_clinical_records(uuid)']::regprocedure[] loop
  perform pg_temp.assert_true((select prosecdef and exists(select 1 from unnest(proconfig) x where x in ('search_path=""','search_path=')) from pg_proc where oid=f),f||' definer with empty search path');
  perform pg_temp.assert_true(not has_function_privilege('anon',f,'EXECUTE'),f||' no guest execution');
  perform pg_temp.assert_true(not has_function_privilege('public',f,'EXECUTE'),f||' no PUBLIC execution');
  perform pg_temp.assert_true(not has_function_privilege('service_role',f,'EXECUTE'),f||' no service_role execution');
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE'),f||' authenticated may execute');
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clinical_private' loop
  perform pg_temp.assert_true(exists(select 1 from pg_proc p, unnest(p.proconfig) x where p.oid=f and x in ('search_path=""','search_path=')),f||' empty search path');
  perform pg_temp.assert_true(not has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' private helper not executable by API roles');
 end loop;
end $$;

-- 3. Tables: closed schema, RLS on with no policy, no privilege for any API role.
select pg_temp.assert_true(not has_schema_privilege('authenticated','clinical_private','USAGE') and not has_schema_privilege('anon','clinical_private','USAGE')
 and not has_schema_privilege('service_role','clinical_private','USAGE'),'clinical_private schema closed to API roles');
do $$ declare r text; t text; begin
 foreach t in array array['clinical_private.consultations','clinical_private.clinical_records','clinical_private.prescription_items'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=t::regclass),t||' has RLS enabled');
  perform pg_temp.assert_true(not exists(select 1 from pg_policy where polrelid=t::regclass),t||' has no policy (deny by default)');
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.assert_true(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' no privilege on '||t);
  end loop;
 end loop;
end $$;
set local role authenticated;
select pg_temp.expect_state('select count(*) from clinical_private.clinical_records','42501','authenticated cannot read records directly');
reset role;
set local role service_role;
select pg_temp.expect_state('select count(*) from clinical_private.consultations','42501','service_role cannot read drafts directly');
select pg_temp.expect_state('insert into clinical_private.consultations(booking_id) values (gen_random_uuid())','42501','service_role cannot write drafts');
reset role;
set local role anon;
select pg_temp.expect_state('select public.get_clinical_record(gen_random_uuid())','42501','guest cannot call the record read');
reset role;

-- 4. Immutability triggers are installed.
select pg_temp.assert_true((select count(*)=3 from pg_trigger where not tgisinternal and tgname in ('dc_record_immutable','dc_item_immutable','dc_consultation_guard')),'guard triggers present');
select pg_temp.assert_true((select count(*)=3 from pg_trigger where not tgisinternal and tgname in ('dc_record_no_truncate','dc_item_no_truncate','dc_consultation_no_truncate')),'truncate guards present');

-- 5. Validators (as owner): structural draft check and final check.
select clinical_private.check_content(pg_temp.dc_content(),true);
select clinical_private.check_content(pg_temp.dc_minimal(),true);
select clinical_private.check_content('{}'::jsonb,false);
do $$ declare bad jsonb; begin
 foreach bad in array array[
  '[]','{"notes":"x"}','{"vitals":{"glucose":5}}','{"vitals":{"pulse_bpm":null}}','{"vitals":{"pulse_bpm":"80"}}',
  '{"vitals":{"temperature":{"value":37}}}','{"vitals":{"temperature":{"value":37,"unit":"K"}}}','{"vitals":{"temperature":{"value":46,"unit":"C"}}}',
  '{"vitals":{"temperature":{"value":37,"unit":"F"}}}','{"vitals":{"temperature":{"value":38.25,"unit":"C"}}}','{"vitals":{"spo2_pct":101}}',
  '{"vitals":{"pulse_bpm":80.5}}','{"vitals":{"systolic":120}}','{"vitals":{"systolic":80,"diastolic":80}}',
  '{"vitals":{"acknowledged_warnings":["fever"]}}','{"vitals":{"acknowledged_warnings":["spo2_low","spo2_low"]}}',
  '{"examination":{"findings":"   "}}','{"assessment":{"certainty":"certain"}}','{"assessment":{"diagnoses":[{"label":"x","code":"j06"}]}}',
  '{"assessment":{"differentials":[1]}}','{"prescription":{"items":[{"route":"mouth"}]}}','{"prescription":{"items":[{"duration_days":366}]}}',
  '{"prescription":{"items":"Paracetamol"}}','{"plan":{"follow_up_on":"2026-02-30"}}','{"plan":{"follow_up_on":"2026-12-01T10:00:00Z"}}',
  '{"plan":{"tests":[{"name":"x","price":1}]}}']::jsonb[] loop
  perform pg_temp.dc_expect(format('select clinical_private.check_content(%L::jsonb,false)',bad),'22023','invalid_input','rejects '||bad::text);
 end loop;
 perform pg_temp.dc_expect(format('select clinical_private.check_content(%L::jsonb,false)',jsonb_build_object('examination',jsonb_build_object('findings',repeat('x',4001)))),
  '22023','invalid_input','findings over 4000 characters');
 perform pg_temp.dc_expect(format('select clinical_private.check_content(%L::jsonb,false)',jsonb_build_object('prescription',jsonb_build_object('items',
  (select jsonb_agg('{}'::jsonb) from generate_series(1,16))))),'22023','invalid_input','16 prescription lines');
end $$;
-- Partial drafts pass the structural check and fail the final one.
select clinical_private.check_content('{"prescription":{"items":[{"medication_name":"Para"}]}}',false);
do $$ declare bad jsonb; base jsonb:=pg_temp.dc_content(); begin
 foreach bad in array array[
  base #- '{examination,findings}', base #- '{assessment,summary}', base #- '{assessment,certainty}', base #- '{assessment,outcome}',
  base #- '{allergies,status}', base #- '{prescription,status}',
  jsonb_set(base,'{allergies,items}','[]'), jsonb_set(base,'{prescription,items}','[]'),
  jsonb_set(base,'{prescription,status}','"none_indicated"'), jsonb_set(base,'{allergies,status}','"not_assessed"'),
  jsonb_set(jsonb_set(base,'{assessment,certainty}','"final"'),'{assessment,diagnoses}','[]'),
  base #- '{prescription,items,0,dose}', base #- '{assessment,diagnoses,0,certainty}', jsonb_set(base,'{plan,tests}','[{"reason":"x"}]')]::jsonb[] loop
  perform pg_temp.dc_expect(format('select clinical_private.check_content(%L::jsonb,true)',bad),'22023','clinical_incomplete','incomplete '||left(bad::text,80));
 end loop;
end $$;

-- 6. Warnings keep the value and name the reading; allergy match by name.
select pg_temp.assert_true(clinical_private.vital_warnings(pg_temp.dc_content()->'vitals')='{}','normal readings: no warning');
select pg_temp.assert_true(clinical_private.vital_warnings('{"temperature":{"value":40.1,"unit":"C"},"systolic":185,"diastolic":125,"pulse_bpm":35,"spo2_pct":85,"resp_rate":6}')
 =array['temperature_high','systolic_high','diastolic_high','pulse_low','spo2_low','resp_rate_low'],'warnings in order');
select pg_temp.assert_true(clinical_private.vital_warnings('{"temperature":{"value":94,"unit":"F"},"systolic":85,"diastolic":50,"pulse_bpm":131,"resp_rate":31}')
 =array['temperature_low','systolic_low','pulse_high','resp_rate_high'],'Fahrenheit limits and inclusive warn_from');
select pg_temp.assert_true(clinical_private.vital_warnings('{"temperature":{"value":35,"unit":"C"},"spo2_pct":92}')='{}','warn_below is exclusive');
select pg_temp.assert_true(clinical_private.allergy_conflicts(pg_temp.dc_content())='{}','fixture content has no allergy match');
select pg_temp.assert_true(clinical_private.allergy_conflicts(jsonb_set(pg_temp.dc_content(),'{prescription,items}',
 '[{"medication_name":"Paracetamol"},{"medication_name":"Penicillin V potassium"}]'))=array[2],'substance inside a medication name');
select pg_temp.assert_true(clinical_private.allergy_conflicts(jsonb_set(pg_temp.dc_content(),'{prescription,items}','[{"medication_name":"Amoxicillin"}]'))='{}',
 'no drug-class knowledge (documented limit)');

-- 7. rules() is the one source of the CHECK enums on prescription_items.
select pg_temp.assert_true(clinical_private.rules()->'enums'->'form' ? 'tablet' and not (clinical_private.rules()->'enums'->'form' ? 'pill'),'form enum');
select pg_temp.assert_true(exists(select 1 from pg_constraint where conrelid='clinical_private.prescription_items'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%rules()%route%'),'route CHECK reads rules()');
rollback;
