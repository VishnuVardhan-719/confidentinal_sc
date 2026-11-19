\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _p5d_fixture.inc
-- P5 doctor block: DC01 assigned-doctor authorization, DC02 arrival code, visit commands,
-- on the shared engine (contract v1.0). Ops close and resolution are suite 022's.

-- 1. Catalog: definer, empty search_path, no anon/PUBLIC/service_role execution.
do $$ declare f regprocedure; begin
 foreach f in array array['public.advance_visit(uuid,text,integer,uuid)','public.report_patient_absent(uuid,integer,uuid)',
  'public.interrupt_doctor_visit(uuid,integer,text,uuid)','public.issue_arrival_code(uuid,uuid)','public.verify_arrival_code(uuid,text,integer,uuid)',
  'public.open_arrival_fallback(uuid,integer,text,uuid)','public.confirm_arrival_fallback(uuid,integer,uuid)',
  'public.list_my_doctor_visits(integer,timestamptz,uuid)','public.get_doctor_visit(uuid)']::regprocedure[] loop
  perform pg_temp.assert_true((select prosecdef and exists(select 1 from unnest(proconfig) x where x in ('search_path=""','search_path=')) from pg_proc where oid=f),f||' definer with empty search path');
  perform pg_temp.assert_true(not has_function_privilege('anon',f,'EXECUTE'),f||' no guest execution');
  perform pg_temp.assert_true(not has_function_privilege('public',f,'EXECUTE'),f||' no PUBLIC execution');
  perform pg_temp.assert_true(not has_function_privilege('service_role',f,'EXECUTE'),f||' no service_role execution');
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE'),f||' authenticated may execute');
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='doctor_private' loop
  perform pg_temp.assert_true(exists(select 1 from pg_proc p, unnest(p.proconfig) x where p.oid=f and x in ('search_path=""','search_path=')),f||' empty search path');
  perform pg_temp.assert_true(not has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' private helper not executable by API roles');
 end loop;
end $$;
select pg_temp.assert_true(to_regprocedure('public.advance_visit(uuid,text,integer)') is null,'unkeyed advance_visit dropped');
select pg_temp.assert_true(to_regclass('public.doctor_visit_exceptions') is null,'no doctor-only exception table; the shared one is used');
select pg_temp.assert_true(not has_schema_privilege('authenticated','doctor_private','USAGE') and not has_schema_privilege('service_role','doctor_private','USAGE')
 and not has_schema_privilege('anon','doctor_private','USAGE'),'doctor_private schema closed to API roles');
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach t in array array['doctor_private.arrival_challenges','doctor_private.arrival_key','doctor_private.verify_failures','doctor_private.arrival_fallbacks'] loop
   perform pg_temp.assert_true(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' no privilege on '||t);
  end loop;
  perform pg_temp.assert_true(not has_table_privilege(r,'public.doctor_visits','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'),r||' no writes on doctor_visits');
 end loop;
end $$;
select pg_temp.assert_true((select array_agg(column_name::text order by column_name) from information_schema.columns
 where table_schema='doctor_private' and table_name='arrival_challenges')
 =array['assignment_id','attempts','booking_id','code_hmac','doctor_profile_id','ended_at','expires_at','id','issued_at','issued_to_profile_id','salt','status'],
 'challenge table stores no plaintext code column');
select pg_temp.assert_true((select count(*)=6 from booking_private.category_reasons where category='doctor'
 and code in ('address_not_found','declined_at_door','doctor_unable','patient_requested_stop','arrival_verified','arrival_assisted')),'doctor reason pairs registered');
select pg_temp.assert_true((select count(*)=7 from booking_private.category_reasons where category='doctor'
 and code in ('en_route','arrived','service_started','service_completed','absence_reported','unsafe_conditions','ended_for_emergency')),'shared doctor reason pairs present');
select pg_temp.assert_true((select blocks_cancel from booking_private.category_reasons where category='doctor' and code='arrival_verified'),'arrival_verified blocks cancel');

-- 2. Fixture visits, all moved inside the assignee window.
set local role authenticated;
select pg_temp.new_visit(0) as v1 \gset
select pg_temp.new_visit(1) as v2 \gset
select pg_temp.new_visit(2) as v3 \gset
select pg_temp.new_visit(3) as v4 \gset
select pg_temp.new_visit(4) as v5 \gset
select pg_temp.new_visit(5) as v6 \gset
select pg_temp.new_visit(6) as v7 \gset
select pg_temp.new_visit(7) as v8 \gset
select pg_temp.new_visit(8) as v9 \gset
reset role;
select pg_temp.move_into_window(x::uuid,(n-1)::integer) from unnest(array[:'v1',:'v2',:'v3',:'v4',:'v5',:'v6',:'v7',:'v8',:'v9']) with ordinality u(x,n);
select pg_temp.assert_true((select count(*)=9 and bool_and(substate='scheduled') from public.doctor_visits
 where booking_id in (:'v1',:'v2',:'v3',:'v4',:'v5',:'v6',:'v7',:'v8',:'v9')),'accepted visits start scheduled');
set local role authenticated;

-- 3. DC01: wrong actors cannot drive any doctor command (v9, scheduled, in window).
select set_config('p5d.v9',:'v9',true);
do $$ declare u uuid; begin
 foreach u in array array['b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000005']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',current_setting('p5d.v9')),'42501',u||' en_route denied');
  perform pg_temp.expect_state(format('select public.report_patient_absent(%L,4,gen_random_uuid())',current_setting('p5d.v9')),'42501',u||' absence denied');
  perform pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,4,''doctor_unable'',gen_random_uuid())',current_setting('p5d.v9')),'42501',u||' interrupt denied');
  perform pg_temp.expect_state(format('select public.verify_arrival_code(%L,''123456'',4,gen_random_uuid())',current_setting('p5d.v9')),'42501',u||' verify denied');
 end loop;
end $$;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'v9'),'42501','outsider cannot issue a code');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'v9'),'42501','doctor cannot issue a code to themself');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,null)',:'v9'),'22023','request key required');
select pg_temp.expect_state(format('select public.advance_visit(%L,''paid'',4,gen_random_uuid())',:'v9'),'22023','unknown substate rejected before any lookup');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","is_anonymous":true}',true);
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'v9'),'42501','anonymous session denied');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',gen_random_uuid()),'42501','unknown booking denied like a forbidden one');
select set_config('request.jwt.claims','{}',true);
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'v9'),'42501','signed-out caller denied');

-- 4. Gate phases (contract §10.1) on v9: suspended blocks start steps only; off allows them for accepted work.
reset role;
select pg_temp.set_gate('suspended');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'v9'),'55000','suspended gate blocks en_route');
reset role;
select pg_temp.set_gate('off');
set local role authenticated;
select pg_temp.assert_true(public.advance_visit(:'v9','en_route',4,gen_random_uuid())=5,'gate off: accepted visit may still start');
reset role;
select pg_temp.set_gate('on');
set local role authenticated;

-- 5. Full path with arrival verification and keyed replay (v1).
select gen_random_uuid() as k_en \gset
select gen_random_uuid() as k_ar \gset
select gen_random_uuid() as k_ve \gset
select gen_random_uuid() as k_st \gset
select gen_random_uuid() as k_co \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_visit(%L,''arrived'',4,gen_random_uuid())',:'v1'),'55000','cannot skip en_route');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',3,gen_random_uuid())',:'v1'),'40001','stale version');
select pg_temp.assert_true(public.advance_visit(:'v1','en_route',4,:'k_en')=5,'en_route');
select pg_temp.assert_true(public.advance_visit(:'v1','en_route',4,:'k_en')=5,'en_route replay returns the same version');
select pg_temp.expect_state(format('select public.advance_visit(%L,''arrived'',4,%L)',:'v1',:'k_en'),'40001','same key with other arguments is an idempotency conflict');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'v1'),'40001','new key at an old version is stale');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''provider_unavailable'')',:'v1'),'55000','scheduler/doctor cannot cancel after en_route');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''patient_request'')',:'v1'),'55000','patient cannot cancel after en_route');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'v1'),'55000','no code before the doctor reports arrival');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v1','arrived',5,:'k_ar')=6,'arrived');
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_started'',6,gen_random_uuid())',:'v1'),'55000','cannot start before arrival is verified');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,''123456'',6,gen_random_uuid())',:'v1'),'55000','verify without an issued code');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select gen_random_uuid() as k_is \gset
select public.issue_arrival_code(:'v1',:'k_is') as issued1 \gset
select (:'issued1'::jsonb)->>'code' as code1 \gset
select lpad((((:'code1')::int+1)%1000000)::text,6,'0') as wrong1 \gset
select pg_temp.assert_true(:'code1' ~ '^[0-9]{6}$','six digit code');
select pg_temp.assert_true(((:'issued1'::jsonb)->>'expires_at')::timestamptz between now()+interval '4 minutes' and clock_timestamp()+interval '5 minutes','five minute validity');
select pg_temp.assert_true(public.issue_arrival_code(:'v1',:'k_is')=:'issued1'::jsonb,'issuance replay with the same key returns the same code (H3)');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'v1'),'53300','60 second cooldown between codes');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,%L)',gen_random_uuid(),:'k_is'),'40001','issuance key reused for another booking conflicts');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6,gen_random_uuid())',:'v1',:'code1'),'42501','patient cannot verify their own code');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,%L)',:'v1',:'k_is'),'42501','keys are per actor: the doctor gets an ordinary, denied issuance');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.assert_true((select count(*)=1 and bool_and(status='active' and attempts=0 and length(code_hmac)=32
 and position(convert_to(:'code1','UTF8') in code_hmac)=0 and doctor_profile_id='b1000000-0000-4000-8000-000000000002')
 from doctor_private.arrival_challenges where booking_id=:'v1'),'one hashed challenge bound to the assigned doctor; the replay issued nothing');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'v1' and action='booking.arrival_code_issued'),'issuance audited once');
select pg_temp.assert_true((select count(*)=0 from public.notification_outbox where booking_id=:'v1' and payload::text like '%'||:'code1'||'%'),'outbox never carries the code');
select pg_temp.assert_true((select count(*)=0 from public.idempotency_requests where request_hash like '%'||:'code1'||'%'),'replay ledger never carries the code');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6,gen_random_uuid())',:'v1',:'code1'),'42501','outsider with the right code denied');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,''12345'',6,gen_random_uuid())',:'v1'),'22023','five digits rejected');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,''12a456'',6,gen_random_uuid())',:'v1'),'22023','non-digits rejected');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,5,gen_random_uuid())',:'v1',:'code1'),'40001','stale verify');
select gen_random_uuid() as k_wr \gset
select pg_temp.assert_true(public.verify_arrival_code(:'v1',:'wrong1',6,:'k_wr')='{"verified":false,"attempts_remaining":4}'::jsonb,'wrong code counted');
select pg_temp.assert_true(public.verify_arrival_code(:'v1',:'wrong1',6,:'k_wr')='{"verified":false,"attempts_remaining":4}'::jsonb,'failed verification replays its outcome (M1)');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6,%L)',:'v1',:'code1',:'k_wr'),'40001','a failed key cannot be reused with another code');
reset role;
select pg_temp.assert_true((select attempts=1 and status='active' from doctor_private.arrival_challenges where booking_id=:'v1'),'failed attempt persisted once');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'v1' and action='booking.arrival_code_failed'),'failed attempt audited once');
select pg_temp.assert_true((select count(*)=1 from doctor_private.verify_failures where booking_id=:'v1'),'one failure record');
select pg_temp.assert_true(pg_temp.sub(:'v1')='arrived' and (select version from public.bookings where id=:'v1')=6,'wrong code changes no booking state');
set local role authenticated;
select pg_temp.assert_true(public.verify_arrival_code(:'v1',:'code1',6,:'k_ve')='{"verified":true,"version":7}'::jsonb,'right code verifies');
select pg_temp.assert_true(public.verify_arrival_code(:'v1',:'code1',6,:'k_ve')='{"verified":true,"version":7}'::jsonb,'verify replay returns the same result');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6,%L)',:'v1',:'wrong1',:'k_ve'),'40001','verify key reused with another code conflicts');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'v1'),'55000','no new code after verification');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,7,gen_random_uuid())',:'v1',:'code1'),'55000','consumed code cannot be reused');
select pg_temp.assert_true(public.advance_visit(:'v1','service_started',7,:'k_st')=8,'service_started');
select pg_temp.assert_true(public.advance_visit(:'v1','service_completed',8,:'k_co')=9,'service_completed');
select pg_temp.assert_true(public.advance_visit(:'v1','service_completed',8,:'k_co')=9,'completion replay after access ended');
reset role;
select pg_temp.set_gate('suspended');
set local role authenticated;
select pg_temp.assert_true(public.advance_visit(:'v1','en_route',4,:'k_en')=5,'early-step replay still returns its version after a later step and a gate suspension');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,%L)',:'v1',:'k_en'),'42501','keys are per actor: another actor gets an ordinary, denied call');
reset role;
select pg_temp.set_gate('on');
select pg_temp.assert_true(pg_temp.state(:'v1')='completed' and pg_temp.sub(:'v1')='service_completed','completed');
select pg_temp.assert_true((select array_agg(reason order by aggregate_version) from public.booking_events where booking_id=:'v1')
 =array['requested','accepted','confirmed','en_route','arrived','arrival_verified','service_started','service_completed'],'one event per milestone, in order; replays wrote none');
select pg_temp.assert_true((select count(*)=8 from public.notification_outbox where booking_id=:'v1')
 and (select count(*)=8 from public.audit_events where target_id=:'v1' and action in ('booking.requested','booking.accepted','booking.confirmed','booking.en_route','booking.arrived','booking.arrival_verified','booking.service_started','booking.service_completed')),
 'audit and outbox row per event');
select pg_temp.assert_true((select count(*)=5 from public.idempotency_requests where actor_profile_id='b1000000-0000-4000-8000-000000000002'
 and request_key in (:'k_en',:'k_ar',:'k_ve',:'k_st',:'k_co')),'one idempotency row per keyed step');
select pg_temp.assert_true((select bool_and(status='consumed') from doctor_private.arrival_challenges where booking_id=:'v1'),'challenge consumed');
select pg_temp.assert_true((select bool_and(status='ended') from public.booking_assignments where booking_id=:'v1'),'assignment ended at completion');
select pg_temp.assert_true((select bool_and(r.status='active') from public.resource_reservations r join public.booking_assignments a on a.id=r.assignment_id
 where a.booking_id=:'v1'),'doctor completion keeps the reservation through its buffer (contract §12)');
select pg_temp.assert_true((select count(*)=0 from public.booking_exceptions where booking_id=:'v1'),'eligible completion opens no exception');
set local role authenticated;

-- 6. Code expiry, exhaustion, regeneration cap, then emergency interruption without a code (v2).
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v2','en_route',4,gen_random_uuid())=5 and public.advance_visit(:'v2','arrived',5,gen_random_uuid())=6,'v2 arrived');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v2',gen_random_uuid())->>'code' as c2a \gset
reset role;
select pg_temp.age_codes(:'v2',interval '6 minutes');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6,gen_random_uuid())',:'v2',:'c2a'),'55000','expired code rejected');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v2',gen_random_uuid())->>'code' as c2b \gset
select lpad((((:'c2b')::int+1)%1000000)::text,6,'0') as w2b \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((public.verify_arrival_code(:'v2',:'w2b',6,gen_random_uuid())->>'attempts_remaining')::int=4-n,'attempt '||(n+1)) from generate_series(0,3) n;
select pg_temp.assert_true(public.verify_arrival_code(:'v2',:'w2b',6,gen_random_uuid())='{"verified":false,"attempts_remaining":0}'::jsonb,'fifth wrong attempt exhausts');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6,gen_random_uuid())',:'v2',:'c2b'),'55000','exhausted code cannot be used even when right');
reset role;
select pg_temp.assert_true((select array_agg(status order by issued_at) from doctor_private.arrival_challenges where booking_id=:'v2')=array['revoked','exhausted'],'regeneration revoked the old code; fifth miss exhausted the new one');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'v2' and action='booking.arrival_code_exhausted')
 and (select count(*)=4 from public.audit_events where target_id=:'v2' and action='booking.arrival_code_failed'),'failures and lockout audited');
select pg_temp.age_codes(:'v2',interval '2 minutes');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.issue_arrival_code(:'v2',gen_random_uuid()) ? 'code','third code');
reset role;
select pg_temp.age_codes(:'v2',interval '2 minutes');
set local role authenticated;
select pg_temp.assert_true(public.issue_arrival_code(:'v2',gen_random_uuid()) ? 'code','fourth code (third regeneration)');
reset role;
select pg_temp.age_codes(:'v2',interval '2 minutes');
set local role authenticated;
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'v2'),'53300','no fourth regeneration');
select gen_random_uuid() as k_v2 \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,6,''patient_requested_stop'',gen_random_uuid())',:'v2'),'22023','in-visit reason before start rejected');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,6,''clinical notes'',gen_random_uuid())',:'v2'),'22023','free text reason rejected');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v2',6,'ended_for_emergency',:'k_v2')=7,'emergency interruption needs no code');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v2',6,'ended_for_emergency',:'k_v2')=7,'interruption replay after access ended');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v2')='interrupted' and pg_temp.sub(:'v2')='interrupted' and pg_temp.events(:'v2')=7,'v2 interrupted once');
select pg_temp.assert_true((select count(*)=0 from doctor_private.arrival_challenges where booking_id=:'v2' and status='active'),'interruption revokes the live code');
select pg_temp.assert_true((select array_agg(kind||':'||reason||':'||status) from public.booking_exceptions where booking_id=:'v2')
 =array['interrupted:ended_for_emergency:open'],'interruption opens one shared exception for ops review');
select pg_temp.assert_true((select bool_and(status='ended') from public.booking_assignments where booking_id=:'v2')
 and (select bool_and(r.status='active') from public.resource_reservations r join public.booking_assignments a on a.id=r.assignment_id where a.booking_id=:'v2'),
 'access ended, reservation kept');
set local role authenticated;
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_started'',7,gen_random_uuid())',:'v2'),'42501','no commands after interruption');

-- 7. Absence (v3).
select gen_random_uuid() as k_v3 \gset
select pg_temp.expect_state(format('select public.report_patient_absent(%L,4,gen_random_uuid())',:'v3'),'55000','absence not from scheduled');
select pg_temp.assert_true(public.advance_visit(:'v3','en_route',4,gen_random_uuid())=5,'v3 en_route');
select pg_temp.expect_state(format('select public.report_patient_absent(%L,5,gen_random_uuid())',:'v3'),'55000','absence not from en_route');
select pg_temp.assert_true(public.advance_visit(:'v3','arrived',5,gen_random_uuid())=6,'v3 arrived');
select pg_temp.assert_true(public.report_patient_absent(:'v3',6,:'k_v3')=7,'absence reported');
select pg_temp.assert_true(public.report_patient_absent(:'v3',6,:'k_v3')=7,'absence replay after access ended');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,7,''doctor_unable'',gen_random_uuid())',:'v3'),'42501','no commands after absence');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,7,''patient_request'')',:'v3'),'55000','no cancellation after absence');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v3')='confirmed' and pg_temp.sub(:'v3')='absence_reported' and pg_temp.events(:'v3')=7,'absence keeps the booking confirmed for review');
select pg_temp.assert_true((select array_agg(kind||':'||reason||':'||status) from public.booking_exceptions where booking_id=:'v3')
 =array['absence_reported:absence_reported:open'],'absence opens the shared exception');
select pg_temp.assert_true((select bool_and(status='ended') from public.booking_assignments where booking_id=:'v3'),'absence ends doctor access');
set local role authenticated;

-- 8. Pre-start interruption (v4) and in-visit interruption (v5).
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,4,''doctor_unable'',gen_random_uuid())',:'v4'),'55000','no interruption from scheduled; cancel instead');
select pg_temp.assert_true(public.advance_visit(:'v4','en_route',4,gen_random_uuid())=5,'v4 en_route');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,5,null,gen_random_uuid())',:'v4'),'22023','null reason rejected');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v4',5,'address_not_found',gen_random_uuid())=6,'pre-start interruption');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'v5'),'55000','no code while scheduled');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v5','en_route',4,gen_random_uuid())=5 and public.advance_visit(:'v5','arrived',5,gen_random_uuid())=6,'v5 arrived');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v5',gen_random_uuid())->>'code' as c5 \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((public.verify_arrival_code(:'v5',:'c5',6,gen_random_uuid())->>'version')::int=7
 and public.advance_visit(:'v5','service_started',7,gen_random_uuid())=8,'v5 started');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,8,''address_not_found'',gen_random_uuid())',:'v5'),'22023','pre-start reason during visit rejected');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v5',8,'patient_requested_stop',gen_random_uuid())=9,'in-visit interruption');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v4')='interrupted' and pg_temp.state(:'v5')='interrupted','confirmed -> interrupted and in_progress -> interrupted');
select pg_temp.assert_true((select array_agg(kind order by kind) from public.booking_exceptions where booking_id=:'v5')=array['interrupted'],'eligible interruption: no closed_while_ineligible');
set local role authenticated;

-- 9. Closeout (contract §5): the provider is suspended while visits are in progress (v6, v7).
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v6','en_route',4,gen_random_uuid())=5 and public.advance_visit(:'v6','arrived',5,gen_random_uuid())=6
 and public.advance_visit(:'v7','en_route',4,gen_random_uuid())=5 and public.advance_visit(:'v7','arrived',5,gen_random_uuid())=6,'v6 and v7 arrived');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v6',gen_random_uuid())->>'code' as c6 \gset
select public.issue_arrival_code(:'v7',gen_random_uuid())->>'code' as c7 \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((public.verify_arrival_code(:'v6',:'c6',6,gen_random_uuid())->>'version')::int=7 and public.advance_visit(:'v6','service_started',7,gen_random_uuid())=8
 and (public.verify_arrival_code(:'v7',:'c7',6,gen_random_uuid())->>'version')::int=7 and public.advance_visit(:'v7','service_started',7,gen_random_uuid())=8,'v6 and v7 started');
reset role;
update public.providers set status='suspended' where id='b3000000-0000-4000-8000-000000000001';
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not identity_private.is_assigned(:'v6','doctor_visit'),'suspension removes the assignee predicate');
set local role authenticated;
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'v8'),'42501','suspended provider: no new milestones');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_completed'',8,gen_random_uuid())',:'v6'),'42501','closeout is only for the person on the visit');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,8,''doctor_unable'',gen_random_uuid())',:'v7'),'42501','outsider cannot interrupt through closeout');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v6','service_completed',8,gen_random_uuid())=9,'doctor in the home can still record completion');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,8,''address_not_found'',gen_random_uuid())',:'v7'),'22023','closeout keeps the in-visit reason list');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v7',8,'patient_requested_stop',gen_random_uuid())=9,'doctor in the home can still record interruption');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v6')='completed' and (select array_agg(kind||':'||reason||':'||status) from public.booking_exceptions where booking_id=:'v6')
 =array['closed_while_ineligible:service_completed:open'],'completion while ineligible flagged for review');
select pg_temp.assert_true(pg_temp.state(:'v7')='interrupted' and (select array_agg(kind||':'||reason order by kind) from public.booking_exceptions where booking_id=:'v7')
 =array['closed_while_ineligible:patient_requested_stop','interrupted:patient_requested_stop'],'interruption while ineligible flagged twice: ineligible close and interruption review');
update public.providers set status='active' where id='b3000000-0000-4000-8000-000000000001';

-- 10. Guards hold below the commands (owner context, triggers enabled) and for API roles (v8 scheduled).
select pg_temp.expect_state(format('update public.doctor_visits set substate=''service_completed'' where booking_id=%L',:'v8'),'55000','skip edge rejected');
select pg_temp.expect_state(format('update public.doctor_visits set substate=''en_route'' where booking_id=%L',:'v8'),'55000','valid edge without its transition rejected');
select pg_temp.expect_state(format('update public.doctor_visits set assignment_id=gen_random_uuid() where booking_id=%L',:'v8'),'55000','assignment binding immutable');
select pg_temp.expect_state(format('delete from public.doctor_visits where booking_id=%L',:'v8'),'55000','visit delete rejected');
select pg_temp.expect_state('truncate public.doctor_visits','55000','visit truncate rejected');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select booking_private.transition(%L,''in_progress'',''service_started'')',:'v8'),'55000','booking cannot start without a verified arrival');
select pg_temp.expect_state(format('insert into public.doctor_visits(booking_id,assignment_id) select %L,id from public.booking_assignments where booking_id=%L',:'v9',:'v9'),'23505','one visit row per booking');
select pg_temp.expect_state(format('update doctor_private.arrival_challenges set code_hmac=code_hmac where booking_id=%L',:'v1'),'55000','spent challenge immutable');
select pg_temp.expect_state(format('delete from doctor_private.arrival_challenges where booking_id=%L',:'v1'),'55000','challenge delete rejected');
select pg_temp.expect_state('update doctor_private.arrival_key set key=key','55000','key immutable');
set local role authenticated;
select pg_temp.expect_state(format('update public.doctor_visits set substate=''en_route'' where booking_id=%L',:'v8'),'42501','authenticated cannot write visits');
select pg_temp.expect_state('select count(*) from doctor_private.arrival_challenges','42501','authenticated cannot read challenges');
reset role;
set local role service_role;
select pg_temp.expect_state(format('update public.doctor_visits set substate=''en_route'' where booking_id=%L',:'v8'),'42501','service_role cannot write visits');
select pg_temp.expect_state('select key from doctor_private.arrival_key','42501','service_role cannot read the key');
reset role;
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.cancel_booking(:'v8',4,'provider_unavailable')=5,'scheduler may cancel while scheduled');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v8')='cancelled' and pg_temp.sub(:'v8')='scheduled'
 and (select bool_and(r.status='released') from public.resource_reservations r join public.booking_assignments a on a.id=r.assignment_id where a.booking_id=:'v8'),
 'scheduled cancellation releases the reservation');

\echo 1..1
\echo ok 1 - p5d_doctor_core
rollback;
