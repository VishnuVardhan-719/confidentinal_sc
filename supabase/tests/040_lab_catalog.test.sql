\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab: preflight, lab reason codes, set_lab_test, get_lab_test_public, lab policy
-- immutability (design S12.1 020, contract S1, S2.2, S9.4). Authored; DB NOT EXECUTED.

-- Preflight: every shared object the lab block uses must exist (contract S2.2).
select lab_private.assert_shared();
do $$ declare f text; renamed text; begin
 foreach f in array array['booking_private.require_gate(text,text)','booking_private.assignee_finish(uuid,text,text,uuid)',
  'booking_private.create_request_core(uuid,uuid,uuid,timestamptz,uuid,text,text,interval,interval)','booking_private.open_exception(uuid,text,text)',
  'booking_private.resource_busy(uuid,uuid)','booking_private.replay(uuid,text,uuid,text)'] loop
  renamed:=split_part(split_part(f,'(',1),'.',2)||'_p5l_off';
  execute format('alter function %s rename to %I',f,renamed);
  perform pg_temp.expect_state('select lab_private.assert_shared()','55000','preflight raises without '||f);
  execute format('alter function %s rename to %I',split_part(f,'.',1)||'.'||renamed||'('||split_part(f,'(',2),split_part(split_part(f,'(',1),'.',2));
 end loop;
 alter table booking_private.category_paths rename to category_paths_p5l_off;
 perform pg_temp.expect_state('select lab_private.assert_shared()','55000','preflight raises without category_paths');
 alter table booking_private.category_paths_p5l_off rename to category_paths;
 alter table booking_private.feature_gates disable trigger p5s_gate_no_delete;
 delete from booking_private.feature_gates where key='lab';
 perform pg_temp.expect_state('select lab_private.assert_shared()','55000','preflight raises without the lab gate row');
 insert into booking_private.feature_gates(key,state) values ('lab','on');
 alter table booking_private.feature_gates enable trigger p5s_gate_no_delete;
 perform lab_private.assert_shared();
end $$;

-- S9.4 lab reason pairs; collection_started blocks cancel; shared lab pairs unchanged.
select pg_temp.assert_true((select array_agg(code||':'||blocks_cancel order by code) from booking_private.category_reasons
 where category='lab' and code in ('collection_started','sample_collected','sample_handed_over','collection_failed','handoff_failed','absence_reported','no_show_confirmed','absence_disputed'))
 =array['absence_disputed:false','absence_reported:true','collection_failed:false','collection_started:true','handoff_failed:false','no_show_confirmed:false','sample_collected:false','sample_handed_over:false'],'lab reason pairs and blocks_cancel');
select pg_temp.assert_true(not exists(select 1 from booking_private.category_reasons where code in ('collection_started','sample_collected','sample_handed_over','collection_failed','handoff_failed') and category<>'lab'),'lab codes paired with lab only');
select pg_temp.assert_true((select count(*)=0 from booking_private.category_reasons where category='lab' and code in ('en_route','arrived','service_started','service_completed','ended_for_emergency','reassigned')),'no doctor/ambulance/care milestone pairs for lab');

-- set_lab_test: owner M succeeded in the fixture; a manager with provider:manage succeeds.
insert into auth.users(id,email) values ('c9000000-0000-4000-8000-000000000011','p5l-manager@example.invalid');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('c8000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000011','manager','active',now(),array['provider:read','provider:manage']);
do $$ declare s uuid:=pg_temp.p5_service('lab'); v integer; a integer; k uuid:=gen_random_uuid(); begin
 perform pg_temp.assert_true((select version=1 and sample_type='venous_blood' and container_codes=array['edta','serum'] and fasting_hours=8 and preparation_code='fasting'
  from public.lab_tests where service_id=s),'fixture test saved through set_lab_test');
 select count(*) into a from public.audit_events where action='lab.test_saved' and target_id=s;
 perform pg_temp.assert_true(a=1,'one audit row for the fixture save');
 perform pg_temp.as_user('c9000000-0000-4000-8000-000000000011');
 v:=public.set_lab_test(s,'venous_blood',array['edta','serum','fluoride'],8,'fasting',1,k);
 perform pg_temp.assert_true(v=2,'manager saves version 2');
 perform pg_temp.assert_true(public.set_lab_test(s,'venous_blood',array['edta','serum','fluoride'],8,'fasting',1,k)=2,'same key and arguments replay');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''urine_cup''],0,''none'',1,%L)',s,k),'40001','same key, other arguments');
 perform pg_temp.assert_true((select count(*) from public.audit_events where action='lab.test_saved' and target_id=s)=a+1,'one audit row per success, none per replay');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''venous_blood'',array[''edta''],8,''fasting'',1,gen_random_uuid())',s),'40001','stale expected version');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''venous_blood'',array[''edta''],8,''fasting'',0,gen_random_uuid())',s),'40001','insert version on an existing test');
 -- Callers without the manage predicate: staff, technician, other organisation, outsider, patient.
 foreach k in array array['c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003','c9000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000007','c1000000-0000-4000-8000-000000000008','c1000000-0000-4000-8000-000000000009','b1000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(k);
  perform pg_temp.expect_state(format('select public.set_lab_test(%L,''venous_blood'',array[''edta''],8,''fasting'',2,gen_random_uuid())',s),'42501','no manage predicate '||k);
 end loop;
 -- Input domain: 22023 before any lookup; a direct write that bypasses the command hits the CHECKs.
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''plasma'',array[''edta''],0,''none'',2,gen_random_uuid())',s),'22023','unknown sample type');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''jar''],0,''none'',2,gen_random_uuid())',s),'22023','unknown container');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''urine_cup'',''urine_cup''],0,''none'',2,gen_random_uuid())',s),'22023','duplicate container');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[]::text[],0,''none'',2,gen_random_uuid())',s),'22023','no container');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''edta'',''serum'',''fluoride'',''citrate'',''heparin'',''urine_cup'',''stool_cup''],0,''none'',2,gen_random_uuid())',s),'22023','seven containers');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''edta'',null],0,''none'',2,gen_random_uuid())',s),'22023','null container');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''venous_blood'',array[''edta''],17,''fasting'',2,gen_random_uuid())',s),'22023','fasting_hours 17');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''venous_blood'',array[''edta''],0,''fasting'',2,gen_random_uuid())',s),'22023','fasting code without hours');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''venous_blood'',array[''edta''],8,''none'',2,gen_random_uuid())',s),'22023','hours without fasting code');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''urine_cup''],0,''none'',2,null)',s),'22023','request key required');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''urine_cup''],0,''none'',0,gen_random_uuid())',pg_temp.p5_service('doctor')),'22023','non-lab service');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''urine'',array[''urine_cup''],0,''none'',0,gen_random_uuid())',gen_random_uuid()),'42501','unknown service');
 perform pg_temp.expect_state(format('update public.lab_tests set container_codes=array[''edta'',''edta''],version=version+1 where service_id=%L',s),'23514','duplicate containers fail the CHECK');
 perform pg_temp.expect_state(format('update public.lab_tests set fasting_hours=0,version=version+1 where service_id=%L',s),'23514','fasting pair CHECK');
 perform pg_temp.expect_state(format('update public.lab_tests set provider_id=%L,version=version+1 where service_id=%L',pg_temp.p5_provider('doctor'),s),'22023','provider must own the lab service');
 perform pg_temp.expect_state(format('insert into public.lab_tests(service_id,provider_id,sample_type,container_codes) values (%L,%L,''urine'',array[''urine_cup''])',pg_temp.p5_service('doctor'),pg_temp.p5_provider('doctor')),'22023','lab_tests only for lab services');
 perform pg_temp.expect_state(format('update public.lab_tests set sample_type=''urine'',container_codes=array[''urine_cup''],fasting_hours=0,preparation_code=''none'' where service_id=%L',s),'40001','direct update without a version bump');
 perform pg_temp.expect_state(format('delete from public.lab_tests where service_id=%L',s),'55000','lab tests are never deleted');
 perform pg_temp.expect_state('truncate public.lab_tests','55000','lab tests are never truncated');
 -- Suspended provider: the manager predicate refuses.
 update public.providers set status='suspended' where id=pg_temp.p5_provider('lab');
 perform pg_temp.expect_state(format('select public.set_lab_test(%L,''venous_blood'',array[''edta''],8,''fasting'',2,gen_random_uuid())',s),'42501','suspended provider');
 update public.providers set status='active' where id=pg_temp.p5_provider('lab');
end $$;

-- get_lab_test_public: exactly three keys when allowed, callable as anon; null otherwise.
select pg_temp.p5_service('lab') as lab_service \gset
select set_config('request.jwt.claims','',true);
set local role anon;
select public.get_lab_test_public(:'lab_service') as anon_test \gset
reset role;
select pg_temp.assert_true(pg_temp.keys(:'anon_test'::jsonb)=array['fasting_hours','preparation_code','sample_type']
 and (:'anon_test'::jsonb)->>'sample_type'='venous_blood' and ((:'anon_test'::jsonb)->>'fasting_hours')::int=8,'anon reads exactly three public keys');
do $$ declare s uuid:=pg_temp.p5_service('lab'); st text; begin
 foreach st in array array['off','suspended'] loop
  update booking_private.feature_gates set state=st where key='lab';
  perform pg_temp.assert_true(public.get_lab_test_public(s) is null,'public test null when the gate is '||st);
 end loop;
 update booking_private.feature_gates set state='on' where key='lab';
 update public.services set status='draft' where id=s;
 perform pg_temp.assert_true(public.get_lab_test_public(s) is null,'public test null for a draft service');
 update public.services set status='published' where id=s;
 update public.providers set status='suspended' where id=pg_temp.p5_provider('lab');
 perform pg_temp.assert_true(public.get_lab_test_public(s) is null,'public test null when the provider is not bookable');
 update public.providers set status='active' where id=pg_temp.p5_provider('lab');
 perform pg_temp.assert_true(public.get_lab_test_public(pg_temp.p5_service('doctor')) is null,'public test null for a non-lab service');
 perform pg_temp.assert_true(public.get_lab_test_public(s) is not null,'public test back once everything is restored');
end $$;

-- Published lab policies are immutable (booking_private.policy_immutable); drafts may change.
select pg_temp.expect_state('update public.lab_policy_versions set lead_minutes=60 where version=1','55000','published lab policy update refused');
select pg_temp.expect_state('delete from public.lab_policy_versions where version=1','55000','published lab policy delete refused');
select pg_temp.expect_state('truncate public.lab_policy_versions','55000','lab policy truncate refused');
insert into public.lab_policy_versions(version,lead_minutes,horizon_days,before_buffer_minutes,after_buffer_minutes) values (2,60,10,15,30);
update public.lab_policy_versions set lead_minutes=90 where version=2;
select pg_temp.expect_state('insert into public.lab_policy_versions(version,lead_minutes,horizon_days,before_buffer_minutes,after_buffer_minutes) values (3,60,10,61,30)','23514','before buffer above 60 refused');
select pg_temp.expect_state('insert into public.lab_policy_versions(version,lead_minutes,horizon_days,before_buffer_minutes,after_buffer_minutes) values (3,60,91,15,30)','23514','horizon above 90 days refused');
\echo 1..1
\echo ok 1 - 040_lab_catalog
rollback;
