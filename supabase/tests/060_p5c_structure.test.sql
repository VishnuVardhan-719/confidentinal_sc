\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- P5 care structure: paths, gate, reasons, closed task list, privileges, RLS, Realtime.
-- Design T20-T22, T25; contract §1 rules 2-3, §7.2, §9.4, §10.1.

-- Paths and gate (contract §7.2, §10.1). No care-owned gate table.
select pg_temp.assert_true((select generic_create and generic_accept and assignee_close='release' from booking_private.category_paths where category='caretaker'),'caretaker: generic create and accept, release on finish');
select pg_temp.assert_true((select bool_and(not generic_accept) from booking_private.category_paths where category in ('lab','ambulance')),'lab and ambulance paths untouched');
select pg_temp.assert_true(to_regclass('care_private.gate') is null,'no care_private.gate (contract §10.1)');
select pg_temp.assert_true(exists(select 1 from booking_private.feature_gate_events where key='caretaker' and from_state is null and to_state='off' and version=1),'caretaker gate seeded off by the shared block');

-- Reasons (§9.4): care writes only shared caretaker pairs and adds none.
select pg_temp.assert_true((select count(*)=7 from booking_private.category_reasons where category='caretaker' and code in
 ('service_started','service_completed','patient_request','provider_unavailable','unable_to_service','ended_for_emergency','other')),'every care event reason is paired');
select pg_temp.assert_true((select count(*)=13 from booking_private.category_reasons where category='caretaker'),'care adds no caretaker pair');
select pg_temp.assert_true((select blocks_cancel from booking_private.category_reasons where category='caretaker' and code='service_started'),'a started session blocks cancellation');
select pg_temp.assert_true(not exists(select 1 from booking_private.category_reasons where category='caretaker' and code in ('no_show_confirmed','absence_disputed','absence_reported')),'caretaker has no absence or no-show codes');

-- Triggers: one category guard on bookings named *_booking_guard, one request trigger.
select pg_temp.assert_true((select array_agg(tgname::text order by tgname) from pg_trigger where tgrelid='public.bookings'::regclass and not tgisinternal and tgname like 'p5c%')
 =array['p5c_care_booking_guard','p5c_care_plan_on_request'],'care triggers on bookings');
select pg_temp.assert_true((select count(*)=2 from pg_trigger where tgrelid='public.care_plans'::regclass and not tgisinternal),'plan guard and truncate guard');
select pg_temp.assert_true((select count(*)=2 from pg_trigger where tgrelid='public.care_service_tasks'::regclass and not tgisinternal),'task guard and truncate guard');

-- Closed nonclinical list.
select pg_temp.assert_true(care_private.valid_tasks(array['companionship']) and care_private.valid_tasks(array['companionship','mobility_support','personal_care_support','meal_support','light_household','escort_walk']),'valid lists');
select pg_temp.assert_true(not care_private.valid_tasks(x),'invalid list '||coalesce(x::text,'null')) from (values (null::text[]),('{}'::text[]),
 (array['medication_reminder']),(array['wound_care']),(array['vitals']),(array['companionship',null]),(array['companionship','companionship']),(array['']),
 (array['companionship','mobility_support','personal_care_support','meal_support','light_household','escort_walk','companionship']),('{{companionship}}'::text[])) v(x);

-- Tables: RLS on; no privilege of any kind for API roles (T20, T21).
do $$ declare t text; r text; p text; begin
 foreach t in array array['public.care_plans','public.care_service_tasks'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=t::regclass),t||' RLS on');
  perform pg_temp.assert_true(not exists(select 1 from pg_policies where schemaname='public' and tablename=split_part(t,'.',2)),t||' has no policy');
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    perform pg_temp.assert_true(not has_table_privilege(r,t,p),format('%s has no %s on %s',r,p,t));
   end loop;
  end loop;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.assert_true(not has_schema_privilege(r,'care_private','USAGE'),r||' has no care_private usage');
 end loop;
end $$;
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state('select * from public.care_plans','42501','authenticated cannot select plans');
select pg_temp.expect_state('select * from public.care_service_tasks','42501','authenticated cannot select task lists');
select pg_temp.expect_state('insert into public.care_service_tasks(service_id,task_codes) values (''c4100000-0000-4000-8000-000000000001'',array[''companionship''])','42501','authenticated cannot insert task lists');
select pg_temp.expect_state('update public.care_plans set version=version+1','42501','authenticated cannot update plans');
select pg_temp.expect_state('delete from public.care_service_tasks','42501','authenticated cannot delete task lists');
select pg_temp.expect_state('select care_private.valid_tasks(array[''companionship''])','42501','authenticated cannot reach care_private');
reset role;

-- Functions (T22): private helpers ungranted; commands authenticated only; task read for guests.
do $$ declare f text; begin
 foreach f in array array['care_private.valid_tasks(text[])','care_private.guard_service_tasks()','care_private.guard_plan()','care_private.snapshot_plan()',
  'care_private.accept_check(public.bookings)','care_private.after_accept(uuid)','care_private.guard_care_booking()','care_private.is_caregiver(uuid,boolean)'] loop
  perform pg_temp.assert_true(not has_function_privilege('anon',f,'EXECUTE') and not has_function_privilege('authenticated',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' not granted');
  perform pg_temp.assert_true(exists(select 1 from pg_proc p,unnest(p.proconfig) x where p.oid=f::regprocedure and x in ('search_path=""','search_path=')),f||' empty search_path');
 end loop;
 foreach f in array array['public.set_care_service_tasks(uuid,text[],integer,uuid)','public.advance_care(uuid,text,integer,uuid)',
  'public.interrupt_care(uuid,text,integer,uuid)','public.attest_care(uuid,text,integer,uuid)','public.get_care_plan(uuid)'] loop
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' authenticated only');
  perform pg_temp.assert_true((select prosecdef from pg_proc where oid=f::regprocedure)
   and exists(select 1 from pg_proc p,unnest(p.proconfig) x where p.oid=f::regprocedure and x in ('search_path=""','search_path=')),f||' definer with empty search_path');
  perform pg_temp.assert_true(not exists(select 1 from pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid=f::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),f||' no PUBLIC execute');
 end loop;
 perform pg_temp.assert_true(has_function_privilege('anon','public.get_care_service_tasks(uuid)','EXECUTE') and has_function_privilege('authenticated','public.get_care_service_tasks(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.get_care_service_tasks(uuid)','EXECUTE'),'task read: anon and authenticated only');
end $$;

-- T25: no care table or bookings in the Realtime publication.
select pg_temp.assert_true((select count(*)=0 from pg_publication_tables where pubname='supabase_realtime' and tablename in ('care_plans','care_service_tasks','bookings')),'no Realtime publication');
\echo 1..1
\echo ok 1 - 060_p5c_structure
rollback;
