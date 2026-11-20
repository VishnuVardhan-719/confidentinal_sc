\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dcx_fixture.inc
-- DC11 health fact verification history. DB NOT EXECUTED.
-- Patient P1 b1..01 (b2..01), doctor D1 b1..02 on started visits; P2 e9..01 (e9..02).

select pg_temp.dcx_started(2) as ids \gset
select set_config('dcx.v1',(:'ids'::uuid[])[1]::text,true), set_config('dcx.v2',(:'ids'::uuid[])[2]::text,true);
-- A third, upcoming visit for D1 that has not started (for the "not in visit" case).
select pg_temp.new_visit(9) as v3 \gset
select set_config('dcx.v3',:'v3',true);

do $$ declare v1 uuid:=current_setting('dcx.v1')::uuid; v2 uuid:=current_setting('dcx.v2')::uuid; v3 uuid:=current_setting('dcx.v3')::uuid;
 p1 constant uuid:='b2000000-0000-4000-8000-000000000001'; p2 constant uuid:='e9000000-0000-4000-8000-000000000002';
 fact uuid; other_fact uuid; j jsonb; k uuid:=gen_random_uuid(); r uuid; r2 uuid; n integer; begin
 -- Patient records a fact; source is fixed to patient_reported; replay and conflict.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 j:=public.record_health_fact(p1,'allergy','Penicillin - rash',k);
 fact:=(j->>'fact_id')::uuid;
 perform pg_temp.assert_true((j->>'version')::integer=1,'first version is 1');
 perform pg_temp.assert_true(public.record_health_fact(p1,'allergy','Penicillin - rash',k)=j,'same key and payload replays');
 perform pg_temp.expect_state(format('select public.record_health_fact(%L,''allergy'',''Sulfa'',%L)',p1,k),'40001','same key, other payload');
 perform pg_temp.assert_true((select source from public.health_fact_versions where fact_id=fact and version=1)='patient_reported','patient source preserved');
 perform pg_temp.expect_state(format('select public.record_health_fact(%L,''allergy'',''x'',gen_random_uuid())',p2),'42501','P1 cannot write P2 facts');
 perform pg_temp.expect_state(format('select public.record_health_fact(%L,''diagnosis'',''x'',gen_random_uuid())',p1),'22023','unknown kind');
 perform pg_temp.expect_state(format('select public.record_health_fact(%L,''other'',%L,gen_random_uuid())',p1,repeat('x',201)),'22023','statement too long');
 perform pg_temp.as_user('e9000000-0000-4000-8000-000000000001');
 other_fact:=(public.record_health_fact(p2,'condition','Asthma',gen_random_uuid())->>'fact_id')::uuid;

 -- (b) Only the started visit's verified doctor reviews, with evidence; the reviewer is the caller.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''document_reviewed'',''DOC-1'',gen_random_uuid())',fact,v1),'42501','patient cannot verify own fact');
 foreach r in array array['b1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(r);
  perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''document_reviewed'',''DOC-1'',gen_random_uuid())',fact,v1),'42501',r||' is not the visit doctor');
 end loop;
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''document_reviewed'',''DOC-1'',gen_random_uuid())',fact,v3),'42501','visit not started');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''document_reviewed'',''DOC-1'',gen_random_uuid())',other_fact,v1),'42501','fact of another patient');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''patient_statement'',''DOC-1'',gen_random_uuid())',fact,v1),'22023','patient statement is not evidence');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''document_reviewed'',''seen it'',gen_random_uuid())',fact,v1),'22023','evidence must be an identifier');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''document_reviewed'',null,gen_random_uuid())',fact,v1),'22023','evidence required');
 k:=gen_random_uuid();
 r:=public.verify_health_fact(fact,1,v1,'confirmed','document_reviewed','DOC-1',k);
 perform pg_temp.assert_true(public.verify_health_fact(fact,1,v1,'confirmed','document_reviewed','DOC-1',k)=r,'review replays');
 perform pg_temp.assert_true((select reviewer_profile_id='b1000000-0000-4000-8000-000000000002' and booking_id=v1 and fact_version=1
  and provider_id='b3000000-0000-4000-8000-000000000001' from public.health_fact_verifications where id=r),'reviewer is the caller, linked to the exact version and visit');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''not_confirmed'',''clinical_examination'',''EXAM'',gen_random_uuid())',fact,v1),'55000','one review per version and visit');
 perform pg_temp.assert_true(exists(select 1 from public.audit_events where action='health_fact.verified' and target_id=fact),'review audited');

 -- (a) Revising appends version 2; the review stays on version 1; a stale review is refused.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.revise_health_fact(%L,''Penicillin - hives'',2,gen_random_uuid())',fact),'40001','stale revision');
 perform pg_temp.assert_true(public.revise_health_fact(fact,'Penicillin - hives',1,gen_random_uuid())=2,'revision appends version 2');
 perform pg_temp.assert_true((select statement from public.health_fact_versions where fact_id=fact and version=1)='Penicillin - rash','version 1 unchanged');
 perform pg_temp.assert_true((select fact_version from public.health_fact_verifications where id=r)=1,'old review stays linked to version 1');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform pg_temp.expect_state(format('select public.verify_health_fact(%L,1,%L,''confirmed'',''document_reviewed'',''DOC-1'',gen_random_uuid())',fact,v2),'40001','review of a superseded version');
 r2:=public.verify_health_fact(fact,2,v2,'not_confirmed','clinical_examination','EXAM-2',gen_random_uuid());

 -- Reads: patient sees every version and review (reviewer name, provider reference, no ids).
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 j:=public.list_health_facts(p1,null)->'facts'->0;
 perform pg_temp.assert_true(jsonb_array_length(j->'versions')=2 and jsonb_array_length(j->'verifications')=2,'history: two versions, two reviews');
 perform pg_temp.assert_true(pg_temp.keys(j->'verifications'->0)=array['evidence_kind','evidence_ref','fact_version','outcome','provider_reference','reviewed_at','reviewer_name'],
  'review projection has no profile ids');
 perform pg_temp.assert_true(not (public.list_health_facts(p1,null)::text like '%b1000000-0000-4000-8000-000000000002%'),'doctor profile id not exposed');
 perform pg_temp.expect_state(format('select public.list_health_facts(%L,null)',p2),'P0002','P1 cannot list P2');
 -- The visit doctor reads with the booking id (audited); without it, or for another patient, not.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 n:=(select count(*) from public.audit_events where action='health_fact.read_by_doctor');
 perform pg_temp.assert_true(jsonb_array_length(public.list_health_facts(p1,v1)->'facts')=1,'visit doctor reads the patient facts');
 perform pg_temp.assert_true((select count(*) from public.audit_events where action='health_fact.read_by_doctor' and target_id=v1)=n+1,'doctor read audited');
 perform pg_temp.expect_state(format('select public.list_health_facts(%L,null)',p1),'P0002','doctor without a visit');
 perform pg_temp.expect_state(format('select public.list_health_facts(%L,%L)',p2,v1),'P0002','visit of another patient');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
 perform pg_temp.expect_state(format('select public.list_health_facts(%L,%L)',p1,v1),'P0002','outsider');
end $$;

-- (c) Append-only below the commands (owner path) and gates.
select pg_temp.expect_state($$update public.health_fact_versions set statement='x'$$,'55000','versions immutable');
select pg_temp.expect_state($$delete from public.health_fact_versions$$,'55000','versions not deletable');
select pg_temp.expect_state($$update public.health_fact_verifications set outcome='not_confirmed'$$,'55000','reviews immutable');
select pg_temp.expect_state($$delete from public.health_fact_verifications$$,'55000','reviews not deletable');
select pg_temp.expect_state($$truncate public.health_fact_verifications cascade$$,'55000','reviews not truncatable');
select pg_temp.expect_state($$update public.health_facts set kind='other'$$,'55000','fact kind fixed');
select pg_temp.expect_state($$update public.health_facts set current_version=current_version+2$$,'55000','versions move by one');
select pg_temp.expect_state($$delete from public.health_facts$$,'55000','facts not deletable');
select pg_temp.expect_state(format($$insert into public.health_fact_versions(fact_id,version,kind,statement,source,recorded_by_profile_id)
 select id,current_version+1,kind,'x','patient_reported','b1000000-0000-4000-8000-000000000001' from public.health_facts limit 1$$),'55000','version must equal the head');
select pg_temp.expect_state($$insert into public.health_fact_versions(fact_id,version,kind,statement,source,recorded_by_profile_id)
 select id,current_version,kind,'x','clinician_recorded','b1000000-0000-4000-8000-000000000001' from public.health_facts limit 1$$,'23514','no other source in this block');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.set_gate('suspended','doctor_fact_review');
select pg_temp.expect_state($$select public.record_health_fact('b2000000-0000-4000-8000-000000000001','other','x',gen_random_uuid())$$,'55000','suspended blocks writes');
select pg_temp.assert_true(public.list_health_facts('b2000000-0000-4000-8000-000000000001',null) is not null,'suspended keeps reads');
select pg_temp.set_gate('off','doctor_fact_review');
select pg_temp.expect_state($$select public.list_health_facts('b2000000-0000-4000-8000-000000000001',null)$$,'55000','off closes reads');

\echo 1..1
\echo ok 1 - 122_dcx_fact_review
rollback;
