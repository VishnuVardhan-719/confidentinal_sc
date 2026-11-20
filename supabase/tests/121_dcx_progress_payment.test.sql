\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dcx_fixture.inc
\ir _p01_fixture.inc
-- DC03 progress delta read and DC10 visit-facing payment status. DB NOT EXECUTED.
-- B01 visits: patient P1 b1..01, doctor D1 b1..02. P01 visit: org A doctor W1 c1..02.

select pg_temp.dcx_started(1) as ids \gset
select (:'ids'::uuid[])[1] as v1 \gset
-- A staff visit two days ahead (W1, scheduler M) for the scheduler and other-doctor cases.
select pg_temp.p5_book('doctor',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001']::uuid[]) as s1 \gset

-- DC03 (a)/(b): patient and doctor read; key allowlist; events equal booking_events.
select set_config('dcx.v1',:'v1',true);
select set_config('dcx.s1',:'s1',true);
do $$ declare b uuid:=current_setting('dcx.v1')::uuid; s uuid:=current_setting('dcx.s1')::uuid; j jsonb; e jsonb; u uuid; begin
 foreach u in array array['b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002']::uuid[] loop
  perform pg_temp.as_user(u);
  j:=public.get_visit_progress(b,0);
  perform pg_temp.assert_true(pg_temp.keys(j)=array['booking_id','events','state','substate','terminal','version'],u||' progress key allowlist');
  perform pg_temp.assert_true((j->>'version')::integer=8 and j->>'state'='in_progress' and j->>'substate'='service_started' and not (j->>'terminal')::boolean,u||' current state');
  perform pg_temp.assert_true(jsonb_array_length(j->'events')=(select count(*) from public.booking_events where booking_id=b),u||' every event from version 0');
  for e in select * from jsonb_array_elements(j->'events') loop
   perform pg_temp.assert_true(pg_temp.keys(e)=array['occurred_at','reason','version'],'event key allowlist');
  end loop;
  j:=public.get_visit_progress(b,6);
  perform pg_temp.assert_true((select array_agg((x->>'version')::integer order by (x->>'version')::integer) from jsonb_array_elements(j->'events') x)=array[7,8],
   u||' reconnect delta returns only versions after the cursor');
  perform pg_temp.assert_true(jsonb_array_length(public.get_visit_progress(b,8)->'events')=0,u||' nothing missed returns no events');
 end loop;
 -- Wrong actors get the same not_found as a missing booking.
 foreach u in array array['b1000000-0000-4000-8000-000000000003','e9000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000009']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.get_visit_progress(%L,0)',b),'P0002',u||' cannot read another visit');
 end loop;
 perform pg_temp.expect_state('select public.get_visit_progress(gen_random_uuid(),0)','P0002','unknown booking');
 -- Staff visit: the assigned W1 reads it, the scheduler M and W2 do not.
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 perform pg_temp.assert_true(public.get_visit_progress(s,0)->>'substate'='scheduled','assigned staff doctor reads an upcoming visit');
 foreach u in array array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.get_visit_progress(%L,0)',s),'P0002',u||' is not the visit doctor');
 end loop;
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.get_visit_progress(%L,-1)',b),'22023','negative cursor');
end $$;

-- DC03 (b): outbox payloads for this visit carry only booking_id, event and version.
select pg_temp.assert_true((select bool_and(pg_temp.keys(payload)<@array['booking_id','event','version']) from public.notification_outbox where booking_id=:'v1'),
 'outbox payload has no clinical, contact or address key');

-- DC03 terminal flag and gate phases.
select pg_temp.dcx_complete(:'v1');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((public.get_visit_progress(:'v1',8)->>'terminal')::boolean and public.get_visit_progress(:'v1',8)->'events'->0->>'reason'='service_completed',
 'completion is terminal and delivered as one event');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.get_visit_progress(:'v1',0)->>'state'='completed','the doctor still reads after completion ended the assignment');
select pg_temp.set_gate('suspended','doctor_progress');
select pg_temp.assert_true(public.get_visit_progress(:'v1',0) is not null,'reads stay open while suspended');
select pg_temp.set_gate('off','doctor_progress');
select pg_temp.expect_state(format('select public.get_visit_progress(%L,0)',:'v1'),'55000','gate off');
select pg_temp.set_gate('on','doctor_progress');

-- DC10 (a): the visit completes while its payment is due; completion does not wait on payment.
select pg_temp.p01_book(false) as p1 \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.get_visit_payment_status(:'p1')->'payment'->>'state'='due'
 and public.get_visit_payment_status(:'p1')->'visit'->>'state'='in_progress','in progress with payment due');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select public.advance_visit(:'p1','service_completed',(select version from public.bookings where id=:'p1'),gen_random_uuid());
select pg_temp.assert_true((select state from public.bookings where id=:'p1')='completed' and (select state from public.payments where booking_id=:'p1')='due',
 'completion committed while payment stays due');

-- DC10 (b): a collection report changes no booking state, version or event.
create temp table dcx_before as select b.version,(select count(*) from public.booking_events e where e.booking_id=b.id) events from public.bookings b where b.id=:'p1';
select pg_temp.p01_report(:'p1');
select pg_temp.assert_true((select b.version=x.version and (select count(*) from public.booking_events e where e.booking_id=b.id)=x.events and b.state='completed'
 from public.bookings b, dcx_before x where b.id=:'p1'),'reporting a collection leaves the booking untouched');

-- DC10 (c): pay-after is never gateway-paid; projection holds no amount, collector or reference.
select set_config('dcx.p1',:'p1',true);
do $$ declare b uuid:=current_setting('dcx.p1')::uuid; j jsonb; u uuid; begin
 foreach u in array array['b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002']::uuid[] loop
  perform pg_temp.as_user(u);
  j:=public.get_visit_payment_status(b);
  perform pg_temp.assert_true(pg_temp.keys(j)=array['booking_id','payment','payment_available','visit'],u||' status key allowlist');
  perform pg_temp.assert_true(pg_temp.keys(j->'payment')=array['collection_path','gateway_paid','no_charge','review_pending','settled_directly','state','version'],
   u||' payment block has no amount, collector or reference');
  perform pg_temp.assert_true(pg_temp.keys(j->'visit')=array['completed','state','substate','version'],u||' visit block');
  perform pg_temp.assert_true(j->'payment'->>'collection_path'='direct_pay_after' and not (j->'payment'->>'gateway_paid')::boolean
   and (j->'visit'->>'completed')::boolean,u||' completed, pay-after, not gateway-paid');
 end loop;
 foreach u in array array['b1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000009',
  'e9000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.get_visit_payment_status(%L)',b),'P0002',u||' cannot read');
 end loop;
end $$;
select pg_temp.assert_true((select pg_get_constraintdef(c.oid) like '%direct_pay_after%' and pg_get_constraintdef(c.oid) not like '%gateway%'
 from pg_constraint c where c.conrelid='public.payments'::regclass and pg_get_constraintdef(c.oid) like '%collection_path%'),'only the direct pay-after path exists');

-- Pay-after off: the visit block is still returned, the payment block is null.
reset role;
update payments_private.settings set pay_after_enabled=false;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not (public.get_visit_payment_status(:'p1')->>'payment_available')::boolean
 and jsonb_typeof(public.get_visit_payment_status(:'p1')->'payment')='null'
 and public.get_visit_payment_status(:'p1')->'visit'->>'state'='completed','visit status independent of the payment gate');
select pg_temp.set_gate('off','doctor_visit_payment');
select pg_temp.expect_state(format('select public.get_visit_payment_status(%L)',:'p1'),'55000','own gate off');

\echo 1..1
\echo ok 1 - 121_dcx_progress_payment
rollback;
