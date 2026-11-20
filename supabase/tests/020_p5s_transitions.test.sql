\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §4 (P5-01): category-scoped transitions; the guard accepts a state
-- change when any actor kind the caller holds has a row for (category, from, to).

select pg_temp.assert_true((select count(*)=82 from public.booking_transitions),'matrix size: 4x19 + doctor assignee cancel + 2 assignee interrupts + 3 ops no-shows');
select pg_temp.assert_true(not exists(select 1 from public.booking_transitions where to_state='no_show' and actor_kind<>'ops'),'no provider no_show edge in any category (OD-1)');
select pg_temp.assert_true((select array_agg(category order by category) from public.booking_transitions where to_state='no_show')=array['ambulance','doctor','lab'],'ops no_show for doctor, lab, ambulance only');
select pg_temp.assert_true(not exists(select 1 from public.booking_transitions where to_state='completed' and actor_kind='ops'),'ops never completes');
select pg_temp.assert_true((select array_agg(category) from public.booking_transitions where from_state='confirmed' and to_state='cancelled' and actor_kind='assigned')=array['doctor'],'assignee cancel is doctor only');
select pg_temp.assert_true((select array_agg(category order by category) from public.booking_transitions where from_state='confirmed' and to_state='interrupted' and actor_kind='assigned')=array['ambulance','doctor'],'pre-start assignee interruption: doctor, ambulance');
select pg_temp.assert_true((select count(*)=0 from public.booking_transitions where from_state in ('completed','cancelled','declined','expired','no_show','interrupted')),'terminal states never reopen');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.booking_transitions','SELECT') and not has_table_privilege('anon','public.booking_transitions','SELECT'),'transition policy stays closed');
select pg_temp.assert_true(booking_private.person_purpose('doctor')='doctor_visit' and booking_private.person_purpose('lab')='lab_collection'
 and booking_private.person_purpose('caretaker')='caretaker' and booking_private.person_purpose('ambulance')='driver' and booking_private.person_purpose('x') is null,'person purpose per category');
do $$ declare f text; begin
 foreach f in array array['booking_private.person_purpose(text)','booking_private.actor_holds(text,public.bookings)','booking_private.guard_booking()',
  'booking_private.closeout_assignee(uuid)','booking_private.closeout_possible(uuid)','booking_private.ops_actor(uuid)','booking_private.assignee_finish(uuid,text,text,uuid)'] loop
  perform pg_temp.assert_true(not has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' not granted');
 end loop;
end $$;

-- Every row: a holder of that kind succeeds; an outsider (c1..09) holding no kind gets 55000.
-- closeout rows use a booking past its window so the assignee holds closeout only.
do $$ declare t record; b uuid; holder uuid; st timestamptz; reason text; who uuid; n integer:=0; begin
 for t in select * from public.booking_transitions order by category,from_state,to_state,actor_kind loop
  st:=case when t.actor_kind='closeout' then now()-interval '20 hours' else now()+interval '10 minutes' end;
  who:=case when t.actor_kind in ('assigned','closeout') then 'c1000000-0000-4000-8000-000000000002'::uuid end;
  holder:=case t.actor_kind when 'patient' then 'b1000000-0000-4000-8000-000000000001'::uuid when 'provider' then 'c1000000-0000-4000-8000-000000000001'::uuid
   when 'ops' then 'c1000000-0000-4000-8000-000000000005'::uuid when 'system' then 'c1000000-0000-4000-8000-000000000001'::uuid else who end;
  reason:=case t.to_state when 'requested' then 'requested' when 'accepted' then 'accepted' when 'confirmed' then 'confirmed' when 'no_show' then 'no_show_confirmed' else 'other' end;
  b:=pg_temp.p5_raw(t.category,t.from_state,st,who);
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
  perform pg_temp.expect_state(format('select booking_private.transition(%L,%L,%L)',b,t.to_state,reason),'55000',format('outsider %s %s->%s (%s)',t.category,t.from_state,t.to_state,t.actor_kind));
  b:=pg_temp.p5_raw(t.category,t.from_state,st,who);
  if t.actor_kind='system' then
   perform pg_temp.as_user(holder);
   perform pg_temp.expect_state(format('select booking_private.transition(%L,%L,%L)',b,t.to_state,reason),'55000',format('system edge never satisfiable %s',t.category));
  else
   perform pg_temp.p5_step(b,holder,t.to_state,reason);
   perform pg_temp.assert_true((select state from public.bookings where id=b)=t.to_state,format('holder %s %s->%s (%s)',t.category,t.from_state,t.to_state,t.actor_kind));
   n:=n+1;
  end if;
 end loop;
 perform pg_temp.assert_true(n=78,'78 satisfiable rows exercised, got '||n);
end $$;

-- Closeout-only holder: the window has closed, so the assigned predicate fails.
select pg_temp.p5_raw('lab','in_progress',now()-interval '20 hours','c1000000-0000-4000-8000-000000000002') as late \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not identity_private.is_assigned(:'late','lab_collection') and booking_private.closeout_assignee(:'late'),'late assignee holds closeout only');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(not booking_private.closeout_assignee(:'late'),'another member of the provider never holds closeout');

-- Scheduler no-show is gone for all four categories; ops no-show for doctor/lab/ambulance only.
do $$ declare c text; b uuid; begin
 foreach c in array array['doctor','lab','ambulance','caretaker'] loop
  b:=pg_temp.p5_raw(c,'confirmed',now()-interval '1 hour');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform pg_temp.expect_state(format('select booking_private.transition(%L,''no_show'',''other'')',b),'55000','scheduler no_show denied '||c);
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
  if c='caretaker' then
   perform pg_temp.expect_state(format('select booking_private.transition(%L,''no_show'',''other'')',b),'55000','ops no_show denied for caretaker');
  else
   perform booking_private.transition(b,'no_show','no_show_confirmed');
   perform pg_temp.assert_true((select state from public.bookings where id=b)='no_show','ops no_show '||c);
  end if;
 end loop;
end $$;

-- R P5-01 fix: lab no-show through the shared ops path, next to direct provider denial.
select pg_temp.p5_raw('lab','confirmed',now()+interval '10 minutes','c1000000-0000-4000-8000-000000000002') as lab_absent \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.open_exception(:'lab_absent','absence_reported','absence_reported');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''no_show'',''no_show_confirmed'',gen_random_uuid())',:'lab_absent'),'42501','lab scheduler cannot confirm no_show');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.assert_true(public.ops_close_booking(:'lab_absent',2,'no_show','no_show_confirmed',gen_random_uuid())=3,'lab no_show through ops');
reset role;
select pg_temp.assert_true((select state from public.bookings where id=:'lab_absent')='no_show','lab booking no_show');
select pg_temp.assert_true((select resolution from public.booking_exceptions where booking_id=:'lab_absent')='no_show_confirmed','absence resolved as confirmed');

-- Assignee cancellation: doctor only (command and guard), others denied.
select pg_temp.p5_raw('doctor','confirmed',now()+interval '10 minutes','c1000000-0000-4000-8000-000000000002') as doc_cancel \gset
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select public.cancel_booking(:'doc_cancel',2,'unable_to_service');
reset role;
select pg_temp.assert_true((select state from public.bookings where id=:'doc_cancel')='cancelled','doctor assignee (not scheduler) cancels confirmed');
do $$ declare c text; b uuid; begin
 foreach c in array array['lab','ambulance','caretaker'] loop
  b:=pg_temp.p5_raw(c,'confirmed',now()+interval '10 minutes','c1000000-0000-4000-8000-000000000002');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
  perform pg_temp.assert_true(identity_private.is_assigned(b,booking_private.person_purpose(c)),c||' assignee in window');
  perform pg_temp.expect_state(format('select public.cancel_booking(%L,2,''unable_to_service'')',b),'42501',c||' assignee cancel command denied');
  perform pg_temp.expect_state(format('select booking_private.transition(%L,''cancelled'',''unable_to_service'')',b),'55000',c||' assignee cancel guard denied');
 end loop;
end $$;

-- Wrong purpose: a lab-collection assignment on an ambulance booking cannot start it.
select pg_temp.p5_raw('ambulance','confirmed',now()+interval '10 minutes','c1000000-0000-4000-8000-000000000002','lab_collection') as wrong \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select booking_private.transition(%L,''in_progress'',''other'')',:'wrong'),'55000','wrong-purpose assignee cannot start');
select pg_temp.assert_true(not identity_private.is_assigned(:'wrong','lab_collection') and not identity_private.is_assigned(:'wrong','driver'),'wrong purpose never assigned');
\echo 1..1
\echo ok 1 - 020_p5s_transitions
rollback;
