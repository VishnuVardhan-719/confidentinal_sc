\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §10 (P5-04): the database gate decides every phase. Admission needs
-- 'on'; start is refused only under 'suspended'; closeout, reads and config never check.

-- Seed and privileges. The fixture switched all four on; the migration seeds them off (OD-5).
-- Later blocks add their own gates (doctor_arrival_fallback, notify_*); this suite owns the four category gates.
select pg_temp.assert_true((select array_agg(key order by key) from booking_private.feature_gates where key in ('ambulance','caretaker','doctor','lab'))=array['ambulance','caretaker','doctor','lab'],'four category gates');
select pg_temp.assert_true((select count(*)=4 from booking_private.feature_gate_events where key in ('ambulance','caretaker','doctor','lab') and from_state is null and to_state='off' and version=1),'seeded off by the migration');
do $$ declare t text; r text; p text; begin
 foreach t in array array['feature_gates','feature_gate_events','reason_codes','category_reasons','category_paths','exception_kinds'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    perform pg_temp.assert_true(not has_table_privilege(r,'booking_private.'||t,p),format('%s has no %s on %s',r,p,t));
   end loop;
  end loop;
 end loop;
 foreach t in array array['booking_private.gate_state(text)','booking_private.require_gate(text,text)'] loop
  perform pg_temp.assert_true(not has_function_privilege('authenticated',t,'EXECUTE') and not has_function_privilege('service_role',t,'EXECUTE'),t||' not granted');
 end loop;
end $$;

-- A gate change writes exactly one immutable event and bumps the version.
select count(*) as events_before from booking_private.feature_gate_events \gset
select version as lab_v from booking_private.feature_gates where key='lab' \gset
update booking_private.feature_gates set state='suspended',version=99 where key='lab';
select pg_temp.assert_true((select count(*) from booking_private.feature_gate_events)=:events_before+1,'one event per gate change');
select pg_temp.assert_true((select version=:lab_v+1 from booking_private.feature_gates where key='lab'),'version forced to old + 1');
select pg_temp.assert_true(exists(select 1 from booking_private.feature_gate_events where key='lab' and from_state='on' and to_state='suspended' and version=:lab_v+1 and db_role='postgres'),'event records from, to, version and role');
select pg_temp.expect_state('update booking_private.feature_gate_events set to_state=''on''','55000','gate events immutable');
select pg_temp.expect_state('delete from booking_private.feature_gate_events','55000','gate events cannot be deleted');
select pg_temp.expect_state('delete from booking_private.feature_gates where key=''lab''','55000','gates cannot be deleted');
select pg_temp.expect_state('update booking_private.feature_gates set state=''maybe'' where key=''lab''','23514','unknown gate state');
select pg_temp.expect_state('select booking_private.require_gate(''lab'',''other'')','22023','unknown phase');
select pg_temp.assert_true(booking_private.gate_state('p01')='off','missing key reads off');

-- Phase matrix through require_gate for each category and state.
do $$ declare c text; g text; ph text; m text; begin
 foreach c in array array['doctor','lab','ambulance','caretaker'] loop
  foreach g in array array['on','off','suspended'] loop
   update booking_private.feature_gates set state=g where key=c;
   m:=null; begin perform booking_private.require_gate(c,'admission'); exception when others then get stacked diagnostics m=message_text; end;
   perform pg_temp.assert_true(m is not distinct from case when g='on' then null else 'feature_unavailable' end,format('%s admission under %s: %s',c,g,coalesce(m,'allowed')));
   m:=null; begin perform booking_private.require_gate(c,'start'); exception when others then get stacked diagnostics m=message_text; end;
   perform pg_temp.assert_true(m is not distinct from case when g='suspended' then 'feature_suspended' end,format('%s start under %s: %s',c,g,coalesce(m,'allowed')));
   foreach ph in array array['closeout','read','config'] loop
    perform booking_private.require_gate(c,ph);
   end loop;
  end loop;
  update booking_private.feature_gates set state='on' where key=c;
 end loop;
end $$;

-- Generic commands under each gate: doctor and caretaker (the generic admission categories).
select ((clock_timestamp() at time zone 'Asia/Kolkata')::date+3)::text as day \gset
select set_config('p5.day',:'day',true);
do $$ declare c text; g text; m text; b uuid; begin
 foreach c in array array['doctor','caretaker'] loop
  foreach g in array array['off','suspended','on'] loop
   update booking_private.feature_gates set state=g where key=c;
   perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
   m:=null; b:=null;
   begin b:=public.create_booking_request('b2000000-0000-4000-8000-000000000001',pg_temp.p5_service(c),'b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(3),gen_random_uuid());
   exception when others then get stacked diagnostics m=message_text; end;
   perform pg_temp.assert_true(m is not distinct from case when g='on' then null else 'feature_unavailable' end,format('%s generic create under %s: %s',c,g,coalesce(m,'allowed')));
   perform pg_temp.assert_true(((select count(*) from public.list_slots(pg_temp.p5_provider(c),pg_temp.p5_service(c),current_setting('p5.day')::date))>0)=(g='on'),format('%s slots under %s',c,g));
  end loop;
 end loop;
end $$;

-- Doctor: accept refused with the gate off; start, closeout, reads and cancel continue.
select pg_temp.p5_create('doctor',pg_temp.p5_at(2)) as gated \gset
select pg_temp.p5_provider('doctor') as doc_provider \gset
update booking_private.feature_gates set state='off' where key='doctor';
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''c6000000-0000-4000-8000-000000000001''::uuid])',:'gated'),'55000','accept refused with the gate off');
update booking_private.feature_gates set state='on' where key='doctor';
select pg_temp.p5_accept(:'gated',array['c6000000-0000-4000-8000-000000000001'::uuid]);
update booking_private.feature_gates set state='off' where key='doctor';
select pg_temp.p5_shift(:'gated',now()+interval '10 minutes');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.get_booking(:'gated')->>'state'='confirmed','assignee read with the gate off');
select pg_temp.assert_true(public.get_assignment_contact(:'gated') ? 'contact','contact read with the gate off');
select pg_temp.assert_true(public.advance_visit(:'gated','en_route',4,gen_random_uuid())=5,'start step with the gate off');
reset role;
update booking_private.feature_gates set state='suspended' where key='doctor';
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.get_booking(:'gated')->>'state'='confirmed','patient read with the gate suspended');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)>=1 from public.list_bookings(:'doc_provider')),'scheduler list with the gate suspended');
reset role;
-- Closeout under suspension: assignee completion and ops close are never gated.
select pg_temp.p5_raw('lab','in_progress',now()-interval '10 minutes','c1000000-0000-4000-8000-000000000002') as lab_live \gset
select pg_temp.p5_raw('ambulance','confirmed',now()-interval '20 hours') as amb_late \gset
select pg_temp.p5_raw('caretaker','requested',pg_temp.p5_at(4)) as care_req \gset
update booking_private.feature_gates set state='suspended';
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.assignee_finish(:'lab_live','completed','other',gen_random_uuid());
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.assert_true(public.ops_close_booking(:'amb_late',2,'interrupted','ops_closeout',gen_random_uuid())=3,'ops close with the gate suspended');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.decline_booking(:'care_req',2,'provider_unavailable')=3,'decline with the gate suspended');
reset role;
update booking_private.feature_gates set state='off';
select pg_temp.p5_raw('lab','requested',pg_temp.p5_at(5)) as lab_req \gset
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.cancel_booking(:'lab_req',2,'patient_request')=3,'cancel with the gate off');
reset role;
select pg_temp.assert_true((select state from public.bookings where id=:'lab_live')='completed','closeout with the gate suspended');
\echo 1..1
\echo ok 1 - 023_p5s_gates
rollback;
