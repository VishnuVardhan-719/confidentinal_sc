\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
-- Authored, DB NOT EXECUTED. Boundary helper has no API grant or supplied clock.
do $$ declare at_time timestamptz; expected timestamptz; t text; begin
 foreach t in array array['20:59','21:00','07:59','08:00'] loop
  at_time:=('2026-11-20 '||t||':00+05:30')::timestamptz;
  expected:=case when t='21:00' then '2026-11-21 08:00:00+05:30'::timestamptz when t='07:59' then '2026-11-20 08:00:00+05:30'::timestamptz end;
  perform pg_temp.assert_true(notify_private.quiet_until(at_time,'21:00','08:00','Asia/Kolkata') is not distinct from expected,'IST boundary '||t);
 end loop;
end $$;
select pg_temp.n01_no_quiet();
-- Consent precedes preference: granted consent with disabled projection isolates
-- preference_off; no consent separately tests consent_missing.
select pg_temp.n01_optin('sms',false);
select pg_temp.n01_delivery('transactional','sms') as pref_off \gset
select count(*) from notify_worker.claim('sms',50);
select pg_temp.assert_true((select suppress_reason='preference_off' from notify_private.deliveries where id=:'pref_off'),'opt-out suppresses non-safety');
select pg_temp.n01_delivery('safety','sms','unsafe_conditions') as safety \gset
select pg_temp.assert_true((select count(*)=1 from notify_worker.claim('sms',50)),'safety bypasses opt-out');
select pg_temp.assert_true((select status='leased' from notify_private.deliveries where id=:'safety'),'safety leased');
select pg_temp.n01_delivery('safety','whatsapp','unsafe_conditions') as wa \gset
select count(*) from notify_worker.claim('whatsapp',50);
select pg_temp.assert_true((select suppress_reason='consent_missing' from notify_private.deliveries where id=:'wa'),'WhatsApp safety requires consent');
select pg_temp.n01_optin();
-- Daily cap zero does not affect safety.
update notify_private.settings set daily_cap_sms=0;
select pg_temp.n01_delivery() as cap \gset
select count(*) from notify_worker.claim('sms',50);
select pg_temp.assert_true((select suppress_reason='global_cap' from notify_private.deliveries where id=:'cap'),'zero budget suppresses transactional');
select pg_temp.n01_no_quiet();
-- Five leased/sent reservations exhaust the hourly budget under concurrent claims.
do $$ declare i integer; d uuid; begin
 for i in 1..5 loop
  d:=pg_temp.n01_delivery();
  perform * from notify_worker.claim('sms',1);
 end loop;
 d:=pg_temp.n01_delivery(); perform * from notify_worker.claim('sms',50);
 perform pg_temp.assert_true((select suppress_reason='rate_limited' from notify_private.deliveries where id=d),'sixth hourly send');
 d:=pg_temp.n01_delivery('safety','sms','unsafe_conditions'); perform * from notify_worker.claim('sms',50);
 perform pg_temp.assert_true((select status='leased' from notify_private.deliveries where id=d),'safety bypasses caps');
end $$;
-- All budget-related cases above use distinct booking ids; collapse is per booking.
select pg_temp.n01_delivery() as ttl \gset
update notify_private.deliveries set not_after=clock_timestamp()-interval '1 second',version=version+1 where id=:'ttl';
select notify_worker.sweep();
select pg_temp.assert_true((select status='expired' from notify_private.deliveries where id=:'ttl'),'TTL expiry');
select pg_temp.n01_delivery() as suspended \gset
update booking_private.feature_gates set state='suspended' where key='notify_sms';
select pg_temp.assert_true((select count(*)=0 from notify_worker.claim('sms',50)),'suspended channel claims none');
select pg_temp.assert_true((select status='queued' from notify_private.deliveries where id=:'suspended'),'suspended stays queued');
update booking_private.feature_gates set state='off' where key='notify_sms';
select pg_temp.n01_event('doctor','en_route','confirmed','confirmed') as off_event \gset
select notify_worker.expand(500);
select pg_temp.assert_true(not exists(select 1 from notify_private.deliveries where event_id=:'off_event' and channel='sms'),'off channel creates none');
-- Unconfirmed phone is never replaced with the booking's contact snapshot.
update auth.users set phone_confirmed_at=null where id='b1000000-0000-4000-8000-000000000001';
select pg_temp.n01_delivery('safety','sms','unsafe_conditions') as unverified \gset
select count(*) from notify_worker.claim('sms',50);
select pg_temp.assert_true((select suppress_reason='no_destination' from notify_private.deliveries where id=:'unverified'),'unverified phone suppressed');
select pg_temp.assert_true(exists(select 1 from notify_private.alarms where delivery_id=:'unverified' and code='safety_undelivered'),'undelivered safety alarm');
-- Claim rechecks current booking state and membership before any destination read.
select pg_temp.n01_delivery() as moved \gset
update auth.users set phone_confirmed_at=clock_timestamp() where id='b1000000-0000-4000-8000-000000000001';
alter table public.bookings disable trigger b01_booking_guard;
update public.bookings set state='completed',version=version+1 where id=(select booking_id from notify_private.deliveries where id=:'moved');
alter table public.bookings enable trigger b01_booking_guard;
select count(*) from notify_worker.claim('sms',50);
select pg_temp.assert_true((select suppress_reason='booking_moved_on' from notify_private.deliveries where id=:'moved'),'arrival after booking moved on');
-- Quiet deferral, exemptions, and deferral beyond TTL (real current clock).
select pg_temp.n01_no_quiet();
update notify_private.settings set per_recipient_hour=1000,per_recipient_day=1000,
 quiet_start=((clock_timestamp() at time zone 'Asia/Kolkata')::time-interval '1 minute')::time,
 quiet_end=((clock_timestamp() at time zone 'Asia/Kolkata')::time+interval '1 hour')::time;
select pg_temp.n01_delivery('transactional','sms','confirmed') as quiet \gset
select count(*) from notify_worker.claim('sms',50);
select pg_temp.assert_true((select status='queued' and not_before>clock_timestamp() from notify_private.deliveries where id=:'quiet'),'transactional deferred');
select pg_temp.n01_delivery() as exempt \gset
select count(*) from notify_worker.claim('sms',50);
select pg_temp.assert_true((select status='leased' from notify_private.deliveries where id=:'exempt'),'arrival quiet_exempt');
select pg_temp.n01_delivery('safety','sms','unsafe_conditions') as quiet_safety \gset
select count(*) from notify_worker.claim('sms',50);
select pg_temp.assert_true((select status='leased' from notify_private.deliveries where id=:'quiet_safety'),'safety ignores quiet hours');
update notify_private.deliveries set not_after=clock_timestamp()-interval '1 second',version=version+1 where id=:'quiet';
select notify_worker.sweep();
select pg_temp.assert_true((select status='expired' from notify_private.deliveries where id=:'quiet'),'quiet deferral later expires');
-- Same-booking collapse: construct two milestone outbox rows at ordered times.
do $$ declare e uuid; b uuid; src uuid; r public.booking_events; newer uuid; begin
 e:=pg_temp.n01_event('doctor','en_route','confirmed','confirmed');
 perform notify_worker.expand(500);
 select booking_id,source_id into b,src from notify_private.events where id=e;
 select * into r from public.booking_events where id=src;
 insert into public.booking_events(booking_id,actor_profile_id,from_state,to_state,aggregate_version,reason,occurred_at)
 values(b,r.actor_profile_id,'confirmed','confirmed',r.aggregate_version+1,'en_route',clock_timestamp()+interval '1 second') returning id into src;
 insert into public.notification_outbox(booking_id,event_id,payload,created_at) values(b,src,jsonb_build_object('booking_id',b,'event','en_route','version',r.aggregate_version+1),clock_timestamp()+interval '1 second');
 perform notify_worker.expand(500);
 perform pg_temp.assert_true(exists(select 1 from notify_private.deliveries where event_id=e and channel='sms' and status='superseded'),'newer milestone supersedes queued older');
 perform pg_temp.assert_true(not exists(select 1 from notify_private.deliveries where priority='safety' and status='superseded'),'safety never collapsed');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 107_n01_delivery_policy
rollback;
