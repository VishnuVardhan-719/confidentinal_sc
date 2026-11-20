\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- Provider task configuration and the public task read. Design §6.2, T03, T04, T05 (setter),
-- T24; contract §10.1 (config phase, admission read), §13 (keyed replay).

select pg_temp.p5_service('caretaker') as care_a \gset
select pg_temp.p5_service('doctor') as doc_service \gset
select pg_temp.assert_true((select task_codes=array['companionship','mobility_support'] and version=1 from public.care_service_tasks where service_id=:'care_a'),'fixture list saved through the setter');
select pg_temp.assert_true(exists(select 1 from public.audit_events where action='care.service_tasks_set' and target_type='service' and target_id=:'care_a' and actor_profile_id='c1000000-0000-4000-8000-000000000001'),'setter audited');
set local role authenticated;

-- T03: closed list.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,%L::text[],1,gen_random_uuid())',:'care_a',x),'22023','task list refused '||x)
 from unnest(array['{medication_reminder}','{wound_care}','{vitals}','{companionship,companionship}','{""}','{}','{companionship,NULL}',
  '{companionship,mobility_support,personal_care_support,meal_support,light_household,escort_walk,companionship}']) x;
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],-1,gen_random_uuid())',:'care_a'),'22023','negative version refused');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],1,null)',:'care_a'),'22023','request key required');

-- T04: who may set tasks.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],1,gen_random_uuid())',:'care_a'),'42501','outsider');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],1,gen_random_uuid())',:'care_a'),'42501','provider:read staff');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],1,gen_random_uuid())',:'care_a'),'42501','scheduler-only member');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],1,gen_random_uuid())',:'care_a'),'42501','other organisation owner');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],0,gen_random_uuid())',gen_random_uuid()),'42501','unknown service');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],0,gen_random_uuid())',:'care_a'),'40001','create over an existing list is stale');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],7,gen_random_uuid())',:'care_a'),'40001','stale version');
select pg_temp.assert_true(public.set_care_service_tasks(:'care_a',array['companionship','meal_support'],1,'f0000000-0000-4000-8000-000000000001')=2,'manager updates the list');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],0,gen_random_uuid())',:'doc_service'),'22023','doctor service refused');

-- Replay (§13): same key and arguments returns the original version even after a later
-- change and after the manager loses provider:manage; a changed argument conflicts.
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.set_care_service_tasks(:'care_a',array['companionship'],2,gen_random_uuid())=3,'later change');
select pg_temp.assert_true(public.set_care_service_tasks(:'care_a',array['companionship','meal_support'],1,'f0000000-0000-4000-8000-000000000001')=2,'replay after a later change');
reset role;
update public.organization_members set scopes=array['provider:read'] where profile_id='e1000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.set_care_service_tasks(:'care_a',array['companionship','meal_support'],1,'f0000000-0000-4000-8000-000000000001')=2,'replay after losing provider:manage');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],1,''f0000000-0000-4000-8000-000000000001'')',:'care_a'),'40001','same key, changed argument');
select pg_temp.expect_state(format('select public.set_care_service_tasks(%L,array[''companionship''],3,gen_random_uuid())',:'care_a'),'42501','new call without provider:manage');
reset role;
select pg_temp.assert_true((select version=3 and task_codes=array['companionship'] from public.care_service_tasks where service_id=:'care_a'),'replays wrote nothing');
select pg_temp.assert_true((select count(*)=1 from public.idempotency_requests where action='p5.care.set_tasks' and request_key='f0000000-0000-4000-8000-000000000001'),'one replay row');

-- Config phase: allowed with the gate off and suspended.
update booking_private.feature_gates set state='suspended' where key='caretaker';
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.set_care_service_tasks(:'care_a',array['escort_walk'],3,gen_random_uuid())=4,'setter under a suspended gate');
reset role;
update booking_private.feature_gates set state='off' where key='caretaker';
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.set_care_service_tasks(:'care_a',array['companionship'],4,gen_random_uuid())=5,'setter under an off gate');

-- T05 (setter side): unsupported offers are refused.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.expect_state('select public.set_care_service_tasks(''e4100000-0000-4000-8000-000000000003'',array[''companionship''],1,gen_random_uuid())','22023','hourly price refused');
select pg_temp.expect_state('select public.set_care_service_tasks(''e4100000-0000-4000-8000-000000000004'',array[''companionship''],1,gen_random_uuid())','22023','721 minutes refused');
select pg_temp.assert_true(public.set_care_service_tasks('e4100000-0000-4000-8000-000000000005',array['companionship'],0,gen_random_uuid())=1,'a supported unscoped offer can be scoped');
reset role;
-- Suspended provider: the setter refuses (catalog lock_manager).
update public.providers set status='suspended' where id='e3000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.expect_state('select public.set_care_service_tasks(''e4100000-0000-4000-8000-000000000001'',array[''escort_walk''],1,gen_random_uuid())','42501','suspended provider');
reset role;
update public.providers set status='active' where id='e3000000-0000-4000-8000-000000000001';

-- T24: public read as a guest. Gate off: the list is shown, bookable is false.
set local role anon;
select set_config('request.jwt.claims','',true);
select pg_temp.assert_true(pg_temp.keys(public.get_care_service_tasks(:'care_a'))=array['bookable','service_id','task_codes','version'],'task read key set');
select pg_temp.assert_true((public.get_care_service_tasks(:'care_a')->>'bookable')::boolean=false,'not bookable while the gate is off');
reset role;
update booking_private.feature_gates set state='on' where key='caretaker';
set local role anon;
select pg_temp.assert_true((public.get_care_service_tasks(:'care_a')->>'bookable')::boolean and public.get_care_service_tasks(:'care_a')->'task_codes'=to_jsonb(array['companionship']),'bookable with the gate on');
select pg_temp.assert_true(public.get_care_service_tasks(:'care_a')::text !~ '(c3000000|provider_id|c1000000)','no provider UUID or staff data');
select pg_temp.assert_true(not (public.get_care_service_tasks('e4100000-0000-4000-8000-000000000003')->>'bookable')::boolean,'hourly offer never bookable');
select pg_temp.expect_state(format('select public.get_care_service_tasks(%L)',:'doc_service'),'P0002','non-caretaker service');
select pg_temp.expect_state(format('select public.get_care_service_tasks(%L)',gen_random_uuid()),'P0002','unknown service');
reset role;
update public.services set status='draft' where id='e4100000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.expect_state('select public.get_care_service_tasks(''e4100000-0000-4000-8000-000000000001'')','P0002','draft service');
reset role;
update public.services set status='published' where id='e4100000-0000-4000-8000-000000000001';
update public.providers set status='suspended' where id='e3000000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.expect_state('select public.get_care_service_tasks(''e4100000-0000-4000-8000-000000000001'')','P0002','non-bookable provider');
reset role;
update public.providers set status='active' where id='e3000000-0000-4000-8000-000000000001';

-- Task list rows are forward-only even for privileged SQL (offer identity).
select pg_temp.expect_state(format('update public.care_service_tasks set task_codes=array[''escort_walk''] where service_id=%L',:'care_a'),'40001','version must move with the list');
select pg_temp.expect_state(format('delete from public.care_service_tasks where service_id=%L',:'care_a'),'55000','task list delete refused');
select pg_temp.expect_state('truncate public.care_service_tasks','55000','task list truncate refused');
\echo 1..1
\echo ok 1 - 061_p5c_service_tasks
rollback;
