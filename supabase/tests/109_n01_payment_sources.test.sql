\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
-- Authored, DB NOT EXECUTED. Exact P01a source columns and reason constraints.
do $$ declare b uuid; pay uuid; col uuid; code text; ev uuid; intake uuid; expected text; who uuid; v integer:=100; begin
 b:=pg_temp.p5_raw('doctor','confirmed',clock_timestamp()+interval '1 hour','c1000000-0000-4000-8000-000000000002');
 select id into pay from public.payments where booking_id=b;
 insert into public.payment_collections(payment_id,collector_profile_id,reported_by_profile_id,amount_paise,method,request_key)
 values(pay,'c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002',12345,'cash',gen_random_uuid()) returning id into col;
 foreach code in array array['collection.reported','collection.confirmed','collection.disputed','payment.disputed','payment.resolved','exception.raised','obligation.voided','collection.voided'] loop
  v:=v+1;
  insert into public.payment_events(payment_id,collection_id,actor_profile_id,capability,event_type,payment_version,reason_code)
   values(pay,case when code like 'collection.%' then col end,'c1000000-0000-4000-8000-000000000004','finance',code,v,'other') returning id into ev;
  select id into strict intake from notify_private.events where source_kind='payment_event' and source_id=ev;
  perform notify_worker.expand(500);
  expected:=case code when 'collection.reported' then 'payment.collection_recorded' when 'collection.confirmed' then 'payment.collection_confirmed'
   when 'collection.disputed' then 'payment.collection_disputed' when 'payment.disputed' then 'payment.disputed' when 'payment.resolved' then 'payment.resolved'
   when 'exception.raised' then 'payment.exception' when 'obligation.voided' then 'payment.nothing_due' end;
  if expected is null then
   perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=intake),'Y08 intentionally silent');
  else
   perform pg_temp.assert_true(exists(select 1 from public.notifications where event_id=intake and template_key=expected),'payment key '||code);
   perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=intake and template_key<>expected),'only expected key '||code);
  end if;
  perform pg_temp.assert_true(not exists(select 1 from notify_private.deliveries where event_id=intake),'no external payment '||code);
  perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=intake and params ? 'amount_paise' and code not in ('collection.reported','collection.confirmed')),'amount only Y01/Y02');
  if code in ('collection.reported','collection.confirmed') then
   perform pg_temp.assert_true((select params->>'amount_paise'='12345' from public.notifications where event_id=intake),'amount string');
  end if;
  if code='collection.disputed' then
   perform pg_temp.assert_true((select array_agg(recipient_profile_id)=array['c1000000-0000-4000-8000-000000000002']::uuid[] from public.notifications where event_id=intake),'collector recipient');
  elsif code='payment.disputed' then
   perform pg_temp.assert_true((select array_agg(recipient_profile_id order by recipient_profile_id)=array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000006']::uuid[] from public.notifications where event_id=intake),'finance and finance reader recipients');
  elsif code='payment.resolved' then
   perform pg_temp.assert_true((select count(*)=2 from public.notifications where event_id=intake),'patient plus all collectors on payment-level resolution');
  end if;
 end loop;
end $$;
-- P01a's closed event_type CHECK refuses gateway.*; no invented gateway row is
-- seeded. If a later P01b adds gateway types, all such types are deliberately
-- silent in expand's payment allowlist.
select pg_temp.assert_true(not exists(select 1 from notify_private.rules where source_kind='payment_event' and (match_code like 'gateway.%' or ext_key is not null)),'no gateway or external payment rules');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 109_n01_payment_sources
rollback;
