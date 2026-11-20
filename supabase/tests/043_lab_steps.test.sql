\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab technician steps (design S6, S12.1 023; contract S4.3, S5.2, S6.4, S9.4, S12.1).
-- Authored; DB NOT EXECUTED. W1 = c1..02 (resource c6..01), W2 = c1..03 (resource c6..02).

-- A. Full path scheduled -> collecting -> collected -> handed_over.
do $$ declare b uuid; v integer; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000001');
 v:=pg_temp.lab_v(b);
 perform pg_temp.assert_true(pg_temp.lab_step(b,w1,'start_collection')=v+1 and pg_temp.lab_state(b)='in_progress' and pg_temp.lab_sub(b)='collecting','start: in_progress / collecting');
 perform pg_temp.assert_true(pg_temp.lab_step(b,w1,'collected')=v+2 and pg_temp.lab_state(b)='in_progress' and pg_temp.lab_sub(b)='collected','collected: in_progress / collected');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='active' and pg_temp.lab_active(b)=1,'custody keeps the reservation and assignment');
 perform pg_temp.assert_true(pg_temp.lab_step(b,w1,'handed_over')=v+3 and pg_temp.lab_state(b)='completed' and pg_temp.lab_sub(b)='handed_over','handoff: completed / handed_over');
 perform pg_temp.assert_true((select array_agg(reason||':'||from_state||'>'||to_state order by aggregate_version) from public.booking_events where booking_id=b and aggregate_version>v)
  =array['collection_started:confirmed>in_progress','sample_collected:in_progress>in_progress','sample_handed_over:in_progress>completed'],'one event per step with the lab codes');
 perform pg_temp.assert_true((select array_agg(action order by occurred_at,action) from public.audit_events where target_id=b and action like 'booking.%' and action not in ('booking.requested','booking.accepted','booking.confirmed'))
  @> array['booking.collection_started','booking.sample_collected','booking.sample_handed_over'],'audit action per step');
 perform pg_temp.assert_true((select bool_and(pg_temp.keys(payload)=array['booking_id','event','version']) from public.notification_outbox where booking_id=b),'outbox payload keys exactly booking_id, event, version');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='released' and pg_temp.lab_active(b)=0,'handoff releases (lab release, OD-7)');
 perform pg_temp.assert_true((select count(*)=0 from public.booking_exceptions where booking_id=b),'eligible handoff opens no exception');
 perform pg_temp.as_user(w1);
 perform pg_temp.expect_state(format('select public.get_booking(%L)',b),'P0002','technician get_booking ends at handoff');
 perform pg_temp.expect_state(format('select public.get_lab_order(%L)',b),'P0002','technician get_lab_order ends at handoff');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'handoff_failed','sample_lost'),'42501','no step after the terminal handoff (authority ended first)');
end $$;

-- B. Illegal steps and failure codes; ends in handoff_failed.
do $$ declare b uuid; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000001');
 perform pg_temp.as_user(w1);
 perform pg_temp.expect_state(pg_temp.step_sql(b,'collected'),'55000','collected from scheduled');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'handed_over'),'55000','handoff from scheduled');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'collection_failed','patient_declined'),'55000','collection failure from scheduled');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'start_collection',null,pg_temp.lab_v(b)+1),'40001','stale version');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'arrived'),'22023','unknown step');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'collected','sample_lost'),'22023','failure code on a milestone');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'collection_failed'),'22023','collection failure without a code');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'collection_failed','sample_lost'),'22023','handoff code on a collection failure');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'handoff_failed','patient_declined'),'22023','collection code on a handoff failure');
 perform pg_temp.expect_state(format('select public.advance_lab_order(%L,''start_collection'',%s,null,null)',b,pg_temp.lab_v(b)),'22023','request key required');
 perform pg_temp.lab_step(b,w1,'start_collection');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'start_collection'),'55000','repeat start');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'report_absence'),'55000','absence after start');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'handed_over'),'55000','handoff from collecting');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'handoff_failed','sample_lost'),'55000','handoff failure from collecting');
 perform pg_temp.lab_step(b,w1,'collected');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'collected'),'55000','repeat collected');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'collection_failed','patient_declined'),'55000','collection failure after collected');
 perform pg_temp.lab_step(b,w1,'handoff_failed','sample_lost');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='interrupted' and (select substate='handoff_failed' and failure_code='sample_lost' from public.lab_orders where booking_id=b),'handoff failure: interrupted with its code');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='released' and pg_temp.lab_active(b)=0,'handoff failure releases');
 perform pg_temp.assert_true((select reason from public.booking_events where booking_id=b order by aggregate_version desc limit 1)='handoff_failed','handoff_failed event');
end $$;

-- C. Collection failure.
do $$ declare b uuid; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000001');
 perform pg_temp.lab_step(b,w1,'start_collection');
 perform pg_temp.lab_step(b,w1,'collection_failed','preparation_not_followed');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='interrupted' and (select substate='collection_failed' and failure_code='preparation_not_followed' from public.lab_orders where booking_id=b),'collection failure: interrupted with its code');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='released' and pg_temp.lab_active(b)=0,'collection failure releases');
end $$;

-- D/E. Authority, timing, absence (W2).
select pg_temp.lab_live('c6000000-0000-4000-8000-000000000002') as absent \gset
do $$ declare b uuid; x uuid; w2 uuid:='c1000000-0000-4000-8000-000000000003'; begin
 select o.booking_id into b from public.lab_orders o join public.booking_assignments a on a.id=o.assignment_id
  where a.resource_id='c6000000-0000-4000-8000-000000000002' and o.substate='scheduled' and a.status='active' order by o.created_at desc limit 1;
 -- Not the assignee: other technician, scheduler, patient, outsider, ops.
 foreach x in array array['c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000009','c1000000-0000-4000-8000-000000000005']::uuid[] loop
  perform pg_temp.as_user(x);
  perform pg_temp.expect_state(pg_temp.step_sql(b,'start_collection'),'42501','not the assignee '||x);
 end loop;
 -- Q06 case expired after acceptance: the technician cannot start.
 update public.staff_credential_documents set expires_at=now()-interval '1 second'
  where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.p5_provider('lab') and subject_profile_id=w2);
 perform pg_temp.as_user(w2);
 perform pg_temp.expect_state(pg_temp.step_sql(b,'start_collection'),'42501','expired Q06 case');
 update public.staff_credential_documents set expires_at=now()+interval '1 year'
  where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.p5_provider('lab') and subject_profile_id=w2);
 -- Early: inside the assignee window, before start_at - 30 min (and before start_at for absence).
 perform pg_temp.p5_shift(b,now()+interval '45 minutes');
 perform pg_temp.as_user(w2);
 perform pg_temp.expect_state(pg_temp.step_sql(b,'start_collection'),'55000','start before start_at - before buffer');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'report_absence'),'55000','absence before start_at');
 perform pg_temp.p5_shift(b,now()+interval '10 minutes');
 perform pg_temp.as_user(w2);
 perform pg_temp.expect_state(pg_temp.step_sql(b,'report_absence'),'55000','absence 10 minutes before start_at');
 -- Late: end_at + after buffer has passed (start 121 minutes ago).
 perform pg_temp.p5_shift(b,now()-interval '121 minutes');
 perform pg_temp.as_user(w2);
 perform pg_temp.expect_state(pg_temp.step_sql(b,'start_collection'),'55000','start at end_at + after buffer');
 perform pg_temp.expect_state(pg_temp.step_sql(b,'report_absence'),'55000','absence at end_at + after buffer');
 -- In time: absence. Booking stays confirmed; reservation released; shared exception opened.
 perform pg_temp.p5_shift(b,now()-interval '10 minutes');
 perform pg_temp.lab_step(b,w2,'report_absence');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='confirmed' and pg_temp.lab_sub(b)='absence_reported','absence: confirmed / absence_reported');
 perform pg_temp.assert_true((select reason||':'||from_state||'>'||to_state from public.booking_events where booking_id=b order by aggregate_version desc limit 1)='absence_reported:confirmed>confirmed','absence event');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='released' and pg_temp.lab_active(b)=0,'absence releases and ends the assignment (S8.4)');
 perform pg_temp.assert_true((select count(*)=1 from public.booking_exceptions where booking_id=b and kind='absence_reported' and reason='absence_reported' and status='open' and opened_by_profile_id=w2),'one open absence exception');
 perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002','contact ends with the absence report');
 -- Cancellation is blocked after an absence report (blocks_cancel).
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.cancel_sql(b,'provider_unavailable'),'55000','scheduler cannot cancel after absence');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.cancel_sql(b,'patient_request'),'55000','patient cannot cancel after absence');
 -- OD-1: no provider no-show edge; ops confirms through the shared path.
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select booking_private.transition(%L,''no_show'',''no_show_confirmed'')',b),'55000','scheduler cannot confirm no-show');
end $$;

-- F. Cancellation: before the first milestone it releases; after start it is refused.
do $$ declare b uuid; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 b:=pg_temp.lab_book(pg_temp.p5_at(2),'c6000000-0000-4000-8000-000000000002');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform public.cancel_booking(b,pg_temp.lab_v(b),'patient_request');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='cancelled' and pg_temp.lab_sub(b)='scheduled' and pg_temp.lab_res(b)='released' and pg_temp.lab_active(b)=0,'patient cancel in scheduled releases');
 b:=pg_temp.lab_book(pg_temp.p5_at(3),'c6000000-0000-4000-8000-000000000002');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform public.cancel_booking(b,pg_temp.lab_v(b),'provider_unavailable');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='cancelled' and pg_temp.lab_res(b)='released','scheduler cancel in scheduled releases (D6)');
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000001');
 perform pg_temp.lab_step(b,w1,'start_collection');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.cancel_sql(b,'patient_request'),'55000','patient cancel after start');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.cancel_sql(b,'provider_unavailable'),'55000','scheduler cancel after start');
 perform pg_temp.as_user(w1);
 perform pg_temp.expect_state(pg_temp.cancel_sql(b,'other'),'42501','technician never cancels');
 -- Leave this sample collected and overdue for the follow-up queue (H).
 perform pg_temp.lab_step(b,w1,'collected');
 perform pg_temp.p5_shift(b,now()-interval '3 hours');
end $$;

-- G. No-show through ops (contract S4.5, S6.4): only after an absence exception.
do $$ declare b uuid:=(select booking_id from public.lab_orders where substate='absence_reported' limit 1); x uuid; v integer; begin
 x:=pg_temp.lab_book(pg_temp.p5_at(4),'c6000000-0000-4000-8000-000000000002');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
 perform pg_temp.expect_state(format('select public.ops_close_booking(%L,%s,''no_show'',''no_show_confirmed'',gen_random_uuid())',x,pg_temp.lab_v(x)),'55000','no-show without an absence report is not escalatable');
 v:=public.ops_close_booking(b,pg_temp.lab_v(b),'no_show','no_show_confirmed',gen_random_uuid());
 perform pg_temp.assert_true(pg_temp.lab_state(b)='no_show' and pg_temp.lab_sub(b)='absence_reported','ops no-show; lab substate unchanged (S6.1)');
 perform pg_temp.assert_true((select status='resolved' and resolution='no_show_confirmed' and resolved_by_profile_id='c1000000-0000-4000-8000-000000000005'
  from public.booking_exceptions where booking_id=b and kind='absence_reported'),'absence exception resolved as no_show_confirmed');
end $$;

-- H. Follow-ups: absence, failures, custody overdue, gate suspended; close and repeat.
do $$ declare rows jsonb; b uuid; c jsonb; m text; scheduled uuid; begin
 scheduled:=(select o.booking_id from public.lab_orders o join public.bookings b on b.id=o.booking_id where o.substate='scheduled' and b.state='confirmed' limit 1);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 select jsonb_agg(x) into rows from public.list_lab_followups(pg_temp.p5_provider('lab'),50,null) x;
 perform pg_temp.assert_true((select array_agg(distinct e->>'kind' order by e->>'kind') from jsonb_array_elements(rows) e)
  =array['absence_reported','collection_failed','custody_overdue','handoff_failed'],'follow-up kinds: absence, failures, custody overdue');
 perform pg_temp.assert_true((select bool_and(pg_temp.keys(e)=array['booking_id','kind','opened_at','public_ref','substate']) from jsonb_array_elements(rows) e),'follow-up row keys');
 perform pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(rows) e where (e->>'booking_id')::uuid=scheduled),'scheduled booking not listed while the gate is on');
 update booking_private.feature_gates set state='suspended' where key='lab';
 select jsonb_agg(x) into rows from public.list_lab_followups(pg_temp.p5_provider('lab'),50,null) x;
 perform pg_temp.assert_true(exists(select 1 from jsonb_array_elements(rows) e where (e->>'booking_id')::uuid=scheduled and e->>'kind'='gate_suspended'),'gate_suspended for accepted, not-started work');
 update booking_private.feature_gates set state='on' where key='lab';
 perform pg_temp.assert_true((select count(*) from public.list_lab_followups(pg_temp.p5_provider('lab'),1,null))=1,'limit honoured');
 perform pg_temp.expect_state(format('select public.list_lab_followups(%L,51,null)',pg_temp.p5_provider('lab')),'22023','limit above 50');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 perform pg_temp.expect_state(format('select public.list_lab_followups(%L,10,null)',pg_temp.p5_provider('lab')),'42501','technician cannot list follow-ups');
 -- Close the absence follow-up: same code repeats the result; another code conflicts.
 b:=(select booking_id from public.lab_orders where substate='absence_reported' limit 1);
 perform pg_temp.expect_state(format('select public.lab_close_followup(%L,''patient_contacted'',gen_random_uuid())',b),'42501','non-scheduler cannot close');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 c:=public.lab_close_followup(b,'patient_contacted',gen_random_uuid());
 perform pg_temp.assert_true(pg_temp.keys(c)=array['closed_at'] and (c->>'closed_at') is not null,'follow-up closed');
 perform pg_temp.assert_true(public.lab_close_followup(b,'patient_contacted',gen_random_uuid())=c,'same code returns the same result');
 perform pg_temp.expect_state(format('select public.lab_close_followup(%L,''new_booking_offered'',gen_random_uuid())',b),'55000','another code conflicts');
 perform pg_temp.expect_state(format('select public.lab_close_followup(%L,''called'',gen_random_uuid())',b),'22023','unknown code');
 perform pg_temp.assert_true((select count(*)=1 from public.audit_events where action='lab.followup_closed' and target_id=b),'one follow-up audit row');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='no_show','follow-up close leaves the booking state');
 perform pg_temp.expect_state(format('select public.lab_close_followup(%L,''patient_contacted'',gen_random_uuid())',scheduled),'55000','no follow-up for a scheduled order');
 perform pg_temp.assert_true(not exists(select 1 from public.list_lab_followups(pg_temp.p5_provider('lab'),50,null) x where (x->>'booking_id')::uuid=b),'closed follow-up leaves the queue');
end $$;

-- I. Gates on steps: suspended refuses start only; off allows every step (S01-Q01).
do $$ declare b uuid; held uuid; w2 uuid:='c1000000-0000-4000-8000-000000000003'; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 held:=(select booking_id from public.lab_orders where substate='collected' limit 1);
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000002');
 update booking_private.feature_gates set state='suspended' where key='lab';
 perform pg_temp.as_user(w2);
 perform pg_temp.expect_state(pg_temp.step_sql(b,'start_collection'),'55000','start refused while suspended');
 perform pg_temp.lab_step(held,w1,'handed_over');
 perform pg_temp.assert_true(pg_temp.lab_state(held)='completed','handoff allowed while suspended (custody can always close)');
 update booking_private.feature_gates set state='off' where key='lab';
 perform pg_temp.lab_step(b,w2,'start_collection');
 perform pg_temp.lab_step(b,w2,'collected');
 perform pg_temp.lab_step(b,w2,'handed_over');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='completed','every step allowed for accepted work while off');
 update booking_private.feature_gates set state='on' where key='lab';
end $$;
\echo 1..1
\echo ok 1 - 043_lab_steps
rollback;
