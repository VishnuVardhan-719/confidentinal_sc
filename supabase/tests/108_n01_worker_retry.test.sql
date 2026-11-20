\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
select pg_temp.n01_no_quiet();
select pg_temp.n01_optin();
select pg_temp.n01_delivery() as delivery \gset
select count(*) from notify_worker.claim('sms',1);
select pg_temp.assert_true((select status='leased' and attempts=1 and lease_until>clock_timestamp() from notify_private.deliveries where id=:'delivery'),'lease and attempt increment');
select pg_temp.expect_state(format('select notify_worker.complete(%L,2,''accepted'',null,%L)',:'delivery','log:'||:'delivery'),'40001','wrong attempt stale lease');
-- Backoff grows exponentially, jitter 0-20%, bounded by settings cap.
do $$ declare d notify_private.deliveries; i integer; lo double precision; actual double precision; start_time timestamptz; begin
 select * into strict d from notify_private.deliveries where status='leased' and channel='sms';
 for i in 1..6 loop
  start_time:=clock_timestamp();
  perform notify_worker.complete(d.id,i,'retryable','network',null);
  select * into d from notify_private.deliveries where id=d.id;
  if i=6 then perform pg_temp.assert_true(d.status='dead','max attempts dead'); exit; end if;
  lo:=least(1800,30*power(2,i-1)); actual:=extract(epoch from d.not_before-start_time);
  perform pg_temp.assert_true(actual>=lo and actual<lo*1.2+2,'backoff attempt '||i);
  update notify_private.deliveries set not_before=clock_timestamp()-interval '1 second',version=version+1 where id=d.id;
  perform * from notify_worker.claim('sms',1);
 end loop;
end $$;
select pg_temp.n01_delivery() as permanent \gset
select count(*) from notify_worker.claim('sms',1);
select notify_worker.complete(:'permanent',1,'permanent','destination_opted_out',null);
select pg_temp.assert_true((select status='dead' from notify_private.deliveries where id=:'permanent'),'permanent dead');
select pg_temp.assert_true((select count(*)=3 from notify_private.channel_consent_events where source='vendor_opt_out' and channel='sms' and decision='withdrawn'),'vendor opt-out withdraws all topics');
select pg_temp.assert_true((select count(*)=3 from public.notification_preferences where channel='sms' and not enabled),'vendor opt-out updates projection');
select pg_temp.n01_optin();
select pg_temp.n01_delivery() as expired_lease \gset
select count(*) from notify_worker.claim('sms',1);
update notify_private.deliveries set lease_until=clock_timestamp()-interval '1 second',version=version+1 where id=:'expired_lease';
select pg_temp.expect_state(format('select notify_worker.complete(%L,1,''accepted'',null,%L)',:'expired_lease','log:'||:'expired_lease'),'40001','late completion rejected even before sweep');
select notify_worker.sweep();
select pg_temp.assert_true((select status='queued' and lease_until is null from notify_private.deliveries where id=:'expired_lease'),'sweep requeues expired lease');
select pg_temp.assert_true(exists(select 1 from notify_private.delivery_attempts where delivery_id=:'expired_lease' and attempt_no=1 and outcome='lease_expired'),'expired attempt recorded');
select pg_temp.expect_state('update notify_private.delivery_attempts set adapter=''log''','55000','attempts immutable');
select pg_temp.expect_state('delete from notify_private.delivery_transitions','55000','transitions immutable');
set local role service_role;
select pg_temp.expect_state('update notify_private.deliveries set status=''queued'' where status=''dead''','42501','service role cannot requeue');
reset role;
-- Requeue preserves attempts and audit history; no attempt-number reuse.
update notify_private.deliveries set status='queued',version=version+1 where id=:'permanent';
select pg_temp.assert_true(exists(select 1 from notify_private.delivery_transitions where delivery_id=:'permanent' and from_status='dead' and to_status='queued' and db_role='postgres'),'owner requeue audited');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state('select * from public.list_notification_failures()','42501','no audit capability');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000006","aal":"aal1"}',true);
select pg_temp.expect_state('select * from public.list_notification_failures()','42501','AAL1 denied');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
select pg_temp.assert_true(not exists(select 1 from public.list_notification_failures() r where r ?| array['recipient_profile_id','booking_id','destination']),'failure projection omits identities');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='notification.failures_viewed'),'failure read audited once');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 108_n01_worker_retry
rollback;
