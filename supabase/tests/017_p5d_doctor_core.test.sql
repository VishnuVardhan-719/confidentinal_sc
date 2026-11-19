\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
-- P5 doctor core: DC01 assigned-doctor authorization, DC02 arrival code, visit state machine.
-- Actors: patient ...01, owner-doctor/scheduler ...02, outsider ...03, unrelated staff ...05.

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',u)::text,true); end $$;
create function pg_temp.new_visit(slot integer) returns uuid language plpgsql as $$
declare booking uuid; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 booking:=public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',
  date_trunc('day',now())+interval '2 days 4 hours'+slot*interval '1 hour',gen_random_uuid());
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform public.accept_booking(booking,2,array['b6000000-0000-4000-8000-000000000001'::uuid]);
 return booking;
end $$;
-- Owner-only time move, as 011 does; the doctor booking guard ignores non-state edits.
create function pg_temp.move_into_window(booking uuid) returns void language plpgsql as $$ begin
 alter table public.bookings disable trigger b01_booking_guard;
 update public.bookings set start_at=now()+interval '10 minutes',end_at=now()+interval '40 minutes' where id=booking;
 alter table public.bookings enable trigger b01_booking_guard;
end $$;
-- Backdates one booking's arrival codes so cooldown/expiry can be exercised in one transaction.
create function pg_temp.age_codes(booking uuid,by_interval interval) returns void language plpgsql as $$ begin
 alter table doctor_private.arrival_challenges disable trigger p5d_challenge_guard;
 update doctor_private.arrival_challenges set issued_at=issued_at-by_interval,expires_at=expires_at-by_interval where booking_id=booking;
 alter table doctor_private.arrival_challenges enable trigger p5d_challenge_guard;
end $$;
create function pg_temp.sub(booking uuid) returns text language sql as $$ select substate from public.doctor_visits where booking_id=booking $$;
create function pg_temp.state(booking uuid) returns text language sql as $$ select state from public.bookings where id=booking $$;

-- 1. Catalog: definer, empty search_path, no anon/PUBLIC/service_role execution.
do $$ declare f regprocedure; begin
 foreach f in array array['public.advance_visit(uuid,text,integer)','public.report_patient_absent(uuid,integer)','public.interrupt_doctor_visit(uuid,integer,text)',
  'public.issue_arrival_code(uuid)','public.verify_arrival_code(uuid,text,integer)']::regprocedure[] loop
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
select pg_temp.assert_true(not has_schema_privilege('authenticated','doctor_private','USAGE') and not has_schema_privilege('service_role','doctor_private','USAGE')
 and not has_schema_privilege('anon','doctor_private','USAGE'),'doctor_private schema closed to API roles');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.doctor_visit_exceptions'::regclass),'exceptions RLS enabled');
select pg_temp.assert_true((select count(*)=0 from pg_policies where tablename='doctor_visit_exceptions'),'exceptions have no policies');
do $$ declare r text; t text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach t in array array['public.doctor_visit_exceptions','doctor_private.arrival_challenges','doctor_private.arrival_key'] loop
   perform pg_temp.assert_true(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' no privilege on '||t);
  end loop;
  perform pg_temp.assert_true(not has_table_privilege(r,'public.doctor_visits','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'),r||' no writes on doctor_visits');
 end loop;
end $$;
select pg_temp.assert_true((select array_agg(column_name::text order by column_name) from information_schema.columns
 where table_schema='doctor_private' and table_name='arrival_challenges')
 =array['assignment_id','attempts','booking_id','code_hmac','doctor_profile_id','ended_at','expires_at','id','issued_at','issued_to_profile_id','salt','status'],
 'challenge table stores no plaintext code column');
select pg_temp.assert_true(exists(select 1 from public.booking_transitions where from_state='confirmed' and to_state='interrupted' and actor_kind='assigned'),'B-4 edge present');

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
select pg_temp.move_into_window(x::uuid) from unnest(array[:'v1',:'v2',:'v3',:'v4',:'v5',:'v6',:'v7',:'v8',:'v9']) x;
select pg_temp.assert_true((select bool_and(substate='scheduled') from public.doctor_visits where booking_id in (:'v1',:'v9')),'accepted visits start scheduled');
set local role authenticated;

-- 3. DC01: wrong actors cannot drive any doctor command (v9, scheduled, in window).
select set_config('p5d.v9',:'v9',true);
do $$ declare u text; begin
 foreach u in array array['b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000005'] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',current_setting('p5d.v9')),'42501',u||' en_route denied');
  perform pg_temp.expect_state(format('select public.report_patient_absent(%L,4)',current_setting('p5d.v9')),'42501',u||' absence denied');
  perform pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,4,''doctor_unable'')',current_setting('p5d.v9')),'42501',u||' interrupt denied');
  perform pg_temp.expect_state(format('select public.verify_arrival_code(%L,''123456'',4)',current_setting('p5d.v9')),'42501',u||' verify denied');
 end loop;
end $$;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L)',:'v9'),'42501','outsider cannot issue a code');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L)',:'v9'),'42501','doctor cannot issue a code to themself');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","is_anonymous":true}',true);
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'v9'),'42501','anonymous session denied');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',gen_random_uuid()),'42501','unknown booking denied like a forbidden one');
select set_config('request.jwt.claims','{}',true);
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'v9'),'42501','signed-out caller denied');

-- 4. Full path with arrival verification (v1).
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_visit(%L,''arrived'',4)',:'v1'),'55000','cannot skip en_route');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',3)',:'v1'),'40001','stale version');
select pg_temp.expect_state(format('select public.advance_visit(%L,''paid'',4)',:'v1'),'55000','unknown substate');
select pg_temp.assert_true(public.advance_visit(:'v1','en_route',4)=5,'en_route');
select pg_temp.assert_true(public.advance_visit(:'v1','en_route',4)=5,'en_route replay returns the same version');
select pg_temp.expect_state(format('select public.advance_visit(%L,''arrived'',4)',:'v1'),'40001','same version with another reason is stale');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''provider_unavailable'')',:'v1'),'55000','scheduler/doctor cannot cancel after en_route');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''patient_request'')',:'v1'),'55000','patient cannot cancel after en_route');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L)',:'v1'),'55000','no code before the doctor reports arrival');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v1','arrived',5)=6,'arrived');
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_started'',6)',:'v1'),'55000','cannot start before arrival is verified');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,''123456'',6)',:'v1'),'55000','verify without an issued code');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v1') as issued1 \gset
select (:'issued1'::jsonb)->>'code' as code1 \gset
select lpad((((:'code1')::int+1)%1000000)::text,6,'0') as wrong1 \gset
select pg_temp.assert_true(:'code1' ~ '^[0-9]{6}$','six digit code');
select pg_temp.assert_true(((:'issued1'::jsonb)->>'expires_at')::timestamptz between now()+interval '4 minutes' and clock_timestamp()+interval '5 minutes','five minute validity');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L)',:'v1'),'53300','60 second cooldown between codes');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6)',:'v1',:'code1'),'42501','patient cannot verify their own code');
reset role;
select pg_temp.assert_true((select count(*)=1 and bool_and(status='active' and attempts=0 and length(code_hmac)=32
 and position(convert_to(:'code1','UTF8') in code_hmac)=0 and doctor_profile_id='b1000000-0000-4000-8000-000000000002')
 from doctor_private.arrival_challenges where booking_id=:'v1'),'one hashed challenge bound to the assigned doctor');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'v1' and action='booking.arrival_code_issued'),'issuance audited');
select pg_temp.assert_true((select count(*)=0 from public.notification_outbox where booking_id=:'v1' and payload::text like '%'||:'code1'||'%'),'outbox never carries the code');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6)',:'v1',:'code1'),'42501','outsider with the right code denied');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,''12345'',6)',:'v1'),'22023','five digits rejected');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,''12a456'',6)',:'v1'),'22023','non-digits rejected');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,5)',:'v1',:'code1'),'40001','stale verify');
select pg_temp.assert_true(public.verify_arrival_code(:'v1',:'wrong1',6)='{"verified":false,"attempts_remaining":4}'::jsonb,'wrong code counted');
reset role;
select pg_temp.assert_true((select attempts=1 and status='active' from doctor_private.arrival_challenges where booking_id=:'v1'),'failed attempt persisted');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'v1' and action='booking.arrival_code_failed'),'failed attempt audited');
select pg_temp.assert_true(pg_temp.sub(:'v1')='arrived' and (select version from public.bookings where id=:'v1')=6,'wrong code changes no booking state');
set local role authenticated;
select pg_temp.assert_true(public.verify_arrival_code(:'v1',:'code1',6)='{"verified":true,"version":7}'::jsonb,'right code verifies');
select pg_temp.assert_true(public.verify_arrival_code(:'v1',:'wrong1',6)='{"verified":true,"version":7}'::jsonb,'verify replay returns the same result');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L)',:'v1'),'55000','no new code after verification');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,7)',:'v1',:'code1'),'55000','consumed code cannot be reused');
select pg_temp.assert_true(public.advance_visit(:'v1','service_started',7)=8,'service_started');
select pg_temp.assert_true(public.get_booking(:'v1')->>'state'='in_progress','booking in_progress');
select pg_temp.assert_true(public.advance_visit(:'v1','service_completed',8)=9,'service_completed');
select pg_temp.assert_true(public.advance_visit(:'v1','service_completed',8)=9,'completion replay after access ended');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v1')='completed' and pg_temp.sub(:'v1')='service_completed','completed');
select pg_temp.assert_true((select array_agg(reason order by aggregate_version) from public.booking_events where booking_id=:'v1')
 =array['requested','accepted','confirmed','en_route','arrived','arrival_verified','service_started','service_completed'],'one event per milestone, in order');
select pg_temp.assert_true((select count(*)=8 from public.notification_outbox where booking_id=:'v1')
 and (select count(*)=8 from public.audit_events where target_id=:'v1' and action in ('booking.requested','booking.accepted','booking.confirmed','booking.en_route','booking.arrived','booking.arrival_verified','booking.service_started','booking.service_completed')),
 'audit and outbox row per event');
select pg_temp.assert_true((select bool_and(status='consumed') from doctor_private.arrival_challenges where booking_id=:'v1'),'challenge consumed');
select pg_temp.assert_true((select bool_and(status='ended') from public.booking_assignments where booking_id=:'v1'),'assignment ended at completion');
select pg_temp.assert_true((select count(*)=0 from public.doctor_visit_exceptions where booking_id=:'v1'),'eligible completion opens no exception');
set local role authenticated;

-- 5. Code expiry, exhaustion, regeneration cap, then emergency interruption without a code (v2).
select pg_temp.assert_true(public.advance_visit(:'v2','en_route',4)=5 and public.advance_visit(:'v2','arrived',5)=6,'v2 arrived');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v2')->>'code' as c2a \gset
reset role;
select pg_temp.age_codes(:'v2',interval '6 minutes');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6)',:'v2',:'c2a'),'55000','expired code rejected');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v2')->>'code' as c2b \gset
select lpad((((:'c2b')::int+1)%1000000)::text,6,'0') as w2b \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((public.verify_arrival_code(:'v2',:'w2b',6)->>'attempts_remaining')::int=4-n,'attempt '||(n+1)) from generate_series(0,3) n;
select pg_temp.assert_true(public.verify_arrival_code(:'v2',:'w2b',6)='{"verified":false,"attempts_remaining":0}'::jsonb,'fifth wrong attempt exhausts');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,%L,6)',:'v2',:'c2b'),'55000','exhausted code cannot be used even when right');
reset role;
select pg_temp.assert_true((select array_agg(status order by issued_at) from doctor_private.arrival_challenges where booking_id=:'v2')=array['revoked','exhausted'],'regeneration revoked the old code; fifth miss exhausted the new one');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'v2' and action='booking.arrival_code_exhausted')
 and (select count(*)=4 from public.audit_events where target_id=:'v2' and action='booking.arrival_code_failed'),'failures and lockout audited');
select pg_temp.age_codes(:'v2',interval '2 minutes');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.issue_arrival_code(:'v2') ? 'code','third code');
reset role;
select pg_temp.age_codes(:'v2',interval '2 minutes');
set local role authenticated;
select pg_temp.assert_true(public.issue_arrival_code(:'v2') ? 'code','fourth code (third regeneration)');
reset role;
select pg_temp.age_codes(:'v2',interval '2 minutes');
set local role authenticated;
select pg_temp.expect_state(format('select public.issue_arrival_code(%L)',:'v2'),'53300','no fourth regeneration');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,6,''patient_requested_stop'')',:'v2'),'22023','in-visit reason before start rejected');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,6,''clinical notes'')',:'v2'),'22023','free text reason rejected');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v2',6,'ended_for_emergency')=7,'emergency interruption needs no code');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v2',6,'ended_for_emergency')=7,'interruption replay');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v2')='interrupted' and pg_temp.sub(:'v2')='interrupted','v2 interrupted');
select pg_temp.assert_true((select count(*)=0 from doctor_private.arrival_challenges where booking_id=:'v2' and status='active'),'interruption revokes the live code');
select pg_temp.assert_true((select kind='interrupted' and reason='ended_for_emergency' and status='open' from public.doctor_visit_exceptions where booking_id=:'v2'),'interruption exception open');
select pg_temp.assert_true((select bool_and(status='ended') from public.booking_assignments where booking_id=:'v2')
 and (select bool_and(r.status='released') from public.resource_reservations r join public.booking_assignments a on a.id=r.assignment_id where a.booking_id=:'v2'),'access ended, reservation released');
set local role authenticated;
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_started'',7)',:'v2'),'42501','no commands after interruption');

-- 6. Absence (v3).
select pg_temp.expect_state(format('select public.report_patient_absent(%L,4)',:'v3'),'55000','absence not from scheduled');
select pg_temp.assert_true(public.advance_visit(:'v3','en_route',4)=5,'v3 en_route');
select pg_temp.expect_state(format('select public.report_patient_absent(%L,5)',:'v3'),'55000','absence not from en_route');
select pg_temp.assert_true(public.advance_visit(:'v3','arrived',5)=6,'v3 arrived');
select pg_temp.assert_true(public.report_patient_absent(:'v3',6)=7,'absence reported');
select pg_temp.assert_true(public.report_patient_absent(:'v3',6)=7,'absence replay');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,7,''doctor_unable'')',:'v3'),'42501','no commands after absence');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,7,''patient_request'')',:'v3'),'55000','no cancellation after absence');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v3')='confirmed' and pg_temp.sub(:'v3')='absence_reported','absence keeps the booking confirmed for review');
select pg_temp.assert_true((select count(*)=1 from public.doctor_visit_exceptions where booking_id=:'v3' and kind='absence_reported' and status='open'),'absence exception open');
select pg_temp.assert_true((select bool_and(status='ended') from public.booking_assignments where booking_id=:'v3'),'absence ends doctor access');
set local role authenticated;

-- 7. Pre-start interruption (v4) and in-visit interruption (v5).
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,4,''doctor_unable'')',:'v4'),'55000','no interruption from scheduled; cancel instead');
select pg_temp.assert_true(public.advance_visit(:'v4','en_route',4)=5,'v4 en_route');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,5,null)',:'v4'),'22023','null reason rejected');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v4',5,'address_not_found')=6,'pre-start interruption');
select pg_temp.assert_true(public.get_booking(:'v4')->>'state'='interrupted','confirmed -> interrupted');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L)',:'v5'),'55000','no code while scheduled');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v5','en_route',4)=5 and public.advance_visit(:'v5','arrived',5)=6,'v5 arrived');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v5')->>'code' as c5 \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((public.verify_arrival_code(:'v5',:'c5',6)->>'version')::int=7 and public.advance_visit(:'v5','service_started',7)=8,'v5 started');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,8,''address_not_found'')',:'v5'),'22023','pre-start reason during visit rejected');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v5',8,'patient_requested_stop')=9,'in-visit interruption');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v5')='interrupted' and (select kind='interrupted' from public.doctor_visit_exceptions where booking_id=:'v5'),'in_progress -> interrupted, exception interrupted');
set local role authenticated;

-- 8. Closeout (B-2, DQ-10): the provider is suspended while visits are in progress (v6, v7).
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v6','en_route',4)=5 and public.advance_visit(:'v6','arrived',5)=6
 and public.advance_visit(:'v7','en_route',4)=5 and public.advance_visit(:'v7','arrived',5)=6,'v6 and v7 arrived');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.issue_arrival_code(:'v6')->>'code' as c6 \gset
select public.issue_arrival_code(:'v7')->>'code' as c7 \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((public.verify_arrival_code(:'v6',:'c6',6)->>'version')::int=7 and public.advance_visit(:'v6','service_started',7)=8
 and (public.verify_arrival_code(:'v7',:'c7',6)->>'version')::int=7 and public.advance_visit(:'v7','service_started',7)=8,'v6 and v7 started');
reset role;
update public.providers set status='suspended' where id='b3000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not booking_private.assigned(:'v6','doctor_visit'),'suspension removes the assignee predicate');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4)',:'v8'),'42501','suspended provider: no new milestones');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.advance_visit(%L,''service_completed'',8)',:'v6'),'42501','closeout is only for the person on the visit');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,8,''doctor_unable'')',:'v7'),'42501','outsider cannot interrupt through closeout');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_visit(:'v6','service_completed',8)=9,'doctor in the home can still record completion');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,8,''address_not_found'')',:'v7'),'22023','closeout keeps the in-visit reason list');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'v7',8,'patient_requested_stop')=9,'doctor in the home can still record interruption');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v6')='completed' and (select kind='closed_while_ineligible' and reason='service_completed' and status='open'
 from public.doctor_visit_exceptions where booking_id=:'v6'),'completion while ineligible flagged for review');
select pg_temp.assert_true(pg_temp.state(:'v7')='interrupted' and (select kind='closed_while_ineligible' and reason='patient_requested_stop'
 from public.doctor_visit_exceptions where booking_id=:'v7'),'interruption while ineligible flagged for review');
update public.providers set status='active' where id='b3000000-0000-4000-8000-000000000001';

-- 9. Guards hold below the commands (owner context, triggers enabled) and for API roles (v8 scheduled).
select pg_temp.expect_state(format('update public.doctor_visits set substate=''service_completed'' where booking_id=%L',:'v8'),'55000','skip edge rejected');
select pg_temp.expect_state(format('update public.doctor_visits set substate=''en_route'' where booking_id=%L',:'v8'),'55000','valid edge without its transition rejected');
select pg_temp.expect_state(format('update public.doctor_visits set assignment_id=gen_random_uuid() where booking_id=%L',:'v8'),'55000','assignment binding immutable');
select pg_temp.expect_state(format('delete from public.doctor_visits where booking_id=%L',:'v8'),'55000','visit delete rejected');
select pg_temp.expect_state('truncate public.doctor_visits','55000','visit truncate rejected');
select set_config('request.jwt.claims',json_build_object('sub','b1000000-0000-4000-8000-000000000002')::text,true);
select pg_temp.expect_state(format('select booking_private.transition(%L,''in_progress'',''service_started'')',:'v8'),'55000','booking cannot start without a verified arrival');
select pg_temp.expect_state(format('insert into public.doctor_visits(booking_id,assignment_id) select %L,id from public.booking_assignments where booking_id=%L',:'v9',:'v9'),'23505','one visit row per booking');
select pg_temp.expect_state(format('update public.doctor_visit_exceptions set reason=''doctor_unable'' where booking_id=%L',:'v2'),'55000','exception reason immutable');
select pg_temp.expect_state(format('delete from public.doctor_visit_exceptions where booking_id=%L',:'v2'),'55000','exception delete rejected');
select pg_temp.expect_state(format('insert into public.doctor_visit_exceptions(booking_id,kind,reason,opened_by_profile_id) values(%L,''interrupted'',''doctor_unable'',''b1000000-0000-4000-8000-000000000002'')',:'v3'),'23505','one open exception per visit');
select pg_temp.expect_state(format('insert into public.doctor_visit_exceptions(booking_id,kind,reason,opened_by_profile_id) values(%L,''interrupted'',''absence_reported'',''b1000000-0000-4000-8000-000000000002'')',:'v9'),'23514','exception reason must match its kind');
update public.doctor_visit_exceptions set status='resolved',resolution='acknowledged',resolved_by_profile_id='b1000000-0000-4000-8000-000000000004',resolved_at=now(),version=version+1 where booking_id=:'v2';
select pg_temp.expect_state(format('update public.doctor_visit_exceptions set resolution=''acknowledged'',version=version+1 where booking_id=%L',:'v2'),'55000','resolved exception immutable');
select pg_temp.expect_state(format('update doctor_private.arrival_challenges set code_hmac=code_hmac where booking_id=%L',:'v1'),'55000','spent challenge immutable');
select pg_temp.expect_state(format('delete from doctor_private.arrival_challenges where booking_id=%L',:'v1'),'55000','challenge delete rejected');
select pg_temp.expect_state('update doctor_private.arrival_key set key=key','55000','key immutable');
set local role authenticated;
select pg_temp.expect_state(format('update public.doctor_visits set substate=''en_route'' where booking_id=%L',:'v8'),'42501','authenticated cannot write visits');
select pg_temp.expect_state('select count(*) from public.doctor_visit_exceptions','42501','authenticated cannot read exceptions');
select pg_temp.expect_state('select count(*) from doctor_private.arrival_challenges','42501','authenticated cannot read challenges');
reset role;
set local role service_role;
select pg_temp.expect_state(format('update public.doctor_visits set substate=''en_route'' where booking_id=%L',:'v8'),'42501','service_role cannot write visits');
select pg_temp.expect_state('select count(*) from public.doctor_visit_exceptions','42501','service_role cannot read exceptions');
select pg_temp.expect_state('select key from doctor_private.arrival_key','42501','service_role cannot read the key');
reset role;
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.cancel_booking(:'v8',4,'patient_request')=5,'patient may cancel while scheduled');
reset role;
select pg_temp.assert_true(pg_temp.state(:'v8')='cancelled' and pg_temp.sub(:'v8')='scheduled'
 and (select bool_and(r.status='released') from public.resource_reservations r join public.booking_assignments a on a.id=r.assignment_id where a.booking_id=:'v8'),'scheduled cancellation releases the reservation');

\echo 1..1
\echo ok 1 - p5d_doctor_core
rollback;
