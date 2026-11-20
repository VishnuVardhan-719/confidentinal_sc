\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
-- Authored, DB NOT EXECUTED. Actual built commands plus each category ledger path.
select pg_temp.p5_create('doctor',pg_temp.p5_at(3)) as b \gset
select pg_temp.assert_true((select count(*)=1 from notify_private.events where source_kind='booking_event' and booking_id=:'b'),'create intake');
select pg_temp.p5_accept(:'b',array['c6000000-0000-4000-8000-000000000001'::uuid]);
select pg_temp.assert_true((select count(*)=3 from notify_private.events where source_kind='booking_event' and booking_id=:'b'),'accepted and confirmed each intake');
select pg_temp.p5_shift(:'b',clock_timestamp()+interval '10 minutes');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select public.advance_visit(:'b','en_route',4);
select public.advance_visit(:'b','arrived',5);
select public.advance_visit(:'b','service_started',6);
select public.advance_visit(:'b','service_completed',7);
select pg_temp.p5_create('doctor',pg_temp.p5_at(4)) as declined \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.decline_booking(:'declined',2,'provider_unavailable');
select pg_temp.p5_create('doctor',pg_temp.p5_at(5)) as cancelled \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.cancel_booking(:'cancelled',2,'patient_request');
do $$ declare c text; k uuid; before_n integer; begin
 foreach c in array array['doctor','lab','ambulance','caretaker'] loop
  k:=pg_temp.n01_event(c,'confirmed','accepted','confirmed');
  perform pg_temp.assert_true(exists(select 1 from notify_private.events where id=k),'category intake '||c);
 end loop;
 select count(*) into before_n from notify_private.events;
 begin
  perform pg_temp.p5_create('doctor',pg_temp.p5_at(6));
  raise exception using errcode='Z0001';
 exception when sqlstate 'Z0001' then null; end;
 perform pg_temp.assert_true((select count(*) from notify_private.events)=before_n,'rolled-back command/intake atomicity');
end $$;
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox o left join notify_private.events e on e.source_kind='booking_event' and e.source_id=o.event_id where e.id is null),'every post-migration outbox has intake');
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox o join public.booking_events b on b.id=o.event_id
 where o.payload<>jsonb_build_object('booking_id',b.booking_id,'event',b.reason,'version',b.aggregate_version)),'outbox payload unchanged');
-- Removing/reinstalling only our own trigger inside this rollback-only fixture
-- simulates a pre-migration row; installing intake never backfills that history.
alter table public.notification_outbox disable trigger n01_intake_booking;
select pg_temp.p5_create('doctor',pg_temp.p5_at(7)) as history \gset
alter table public.notification_outbox enable trigger n01_intake_booking;
select pg_temp.assert_true(not exists(select 1 from notify_private.events where source_kind='booking_event' and booking_id=:'history'),'history not enqueued');
-- B01 historically retains Supabase default service-role writes (design Q3).
-- Exercise intake for that role when present; never assert a missing shared
-- hardening migration has landed. N01's own tables remain fully denied.
do $$ declare r text; b uuid; src uuid; begin
 foreach r in array array['anon','authenticated'] loop
  perform pg_temp.assert_true(not has_table_privilege(r,'public.notification_outbox','INSERT'),'cannot forge outbox '||r);
 end loop;
 if has_table_privilege('service_role','public.notification_outbox','INSERT') then
  b:=pg_temp.p5_raw('doctor','confirmed',clock_timestamp()+interval '1 hour');
  insert into public.booking_events(booking_id,actor_profile_id,from_state,to_state,aggregate_version,reason)
   values(b,'c1000000-0000-4000-8000-000000000001','accepted','confirmed',3,'confirmed') returning id into src;
  set local role service_role;
  insert into public.notification_outbox(booking_id,event_id,payload) values(b,src,jsonb_build_object('booking_id',b,'event','confirmed','version',3));
  reset role;
  perform pg_temp.assert_true(exists(select 1 from notify_private.events where source_kind='booking_event' and source_id=src),'service-role source insert fires intake');
  raise notice 'Existing B01 service-role writes require shared hardening before external activation (N01 Q3)';
 end if;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 101_n01_intake_booking
rollback;
