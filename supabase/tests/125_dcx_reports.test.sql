\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dcx_fixture.inc
-- DC14 report RPCs (migration 20261117002450, which requires feat/DC-clinical-core). DB NOT EXECUTED.
-- Structure, authorization denials, gate and input checks. The signed-record happy path (patient
-- and signer render, render log, amendment renders a new version) needs the clinical-core
-- fixture (_dc_fixture.inc, not on this branch) and is listed as a follow-up in the handoff.
-- PDF bytes, xref and determinism are covered by tests/unit/pdf.test.ts.

select pg_temp.assert_true((select to_state from booking_private.feature_gate_events where key='doctor_reports' order by version limit 1)='off','doctor_reports seeded off');
do $$ declare f regprocedure; r text; begin
 foreach f in array array['public.get_clinical_report_source(uuid)','public.record_clinical_report(uuid,text,text,uuid)']::regprocedure[] loop
  perform pg_temp.assert_true((select prosecdef and exists(select 1 from unnest(proconfig) x where x in ('search_path=""','search_path=')) from pg_proc where oid=f),f||' definer, empty search path');
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE') and not has_function_privilege('public',f,'EXECUTE'),f||' authenticated only');
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.assert_true(not has_table_privilege(r,'public.clinical_report_renders','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' no privilege on renders');
 end loop;
end $$;
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.clinical_report_renders'::regclass),'renders RLS on');
select pg_temp.assert_true(not exists(select 1 from storage.buckets where id in ('clinical-records','clinical-reports')),'no report bucket: PDFs are streamed, never stored');
select pg_temp.assert_true((select count(*)=2 from pg_trigger where tgrelid='public.clinical_report_renders'::regclass and not tgisinternal),'renders append-only triggers');

-- Unknown or unreadable record: the same not_found for everyone.
do $$ declare u uuid; begin
 foreach u in array array['b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state('select public.get_clinical_report_source(gen_random_uuid())','P0002',u||' unknown record');
  perform pg_temp.expect_state(format('select public.record_clinical_report(gen_random_uuid(),''dcx-report-1'',%L,gen_random_uuid())',repeat('a',64)),'P0002',u||' unknown record render');
 end loop;
 perform pg_temp.expect_state(format('select public.record_clinical_report(gen_random_uuid(),''dcx-report-1'',%L,gen_random_uuid())','nothex'),'22023','hash shape');
 perform pg_temp.expect_state(format('select public.record_clinical_report(gen_random_uuid(),''DCX REPORT'',%L,gen_random_uuid())',repeat('a',64)),'22023','renderer version shape');
 perform pg_temp.expect_state('select public.get_clinical_report_source(null)','22023','null record');
end $$;
select pg_temp.set_gate('off','doctor_reports');
select pg_temp.expect_state('select public.get_clinical_report_source(gen_random_uuid())','55000','gate off');
select set_config('request.jwt.claims','',true);
set local role anon;
select pg_temp.expect_state('select public.get_clinical_report_source(gen_random_uuid())','42501','anon cannot call');
reset role;

\echo 1..1
\echo ok 1 - 125_dcx_reports
rollback;
