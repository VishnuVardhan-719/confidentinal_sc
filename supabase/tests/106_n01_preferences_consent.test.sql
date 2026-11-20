\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
select pg_temp.assert_true(not exists(select 1 from public.notification_preferences),'no preference means off');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.set_notification_preference('sms','booking',true,'notice-v1',0)=1,'first preference version');
select pg_temp.expect_state('select public.set_notification_preference(''sms'',''booking'',false,''notice-v1'',0)','40001','stale version refused');
select pg_temp.expect_state('select public.set_notification_preference(''whatsapp'',''booking'',true,''notice-v1'',0)','55000','WhatsApp unavailable');
select pg_temp.expect_state('select public.set_notification_preference(''sms'',''booking'',true,'' '',1)','22023','blank notice');
reset role;
select pg_temp.assert_true((select enabled and version=1 from public.notification_preferences),'projection written');
select pg_temp.assert_true((select count(*)=1 from notify_private.channel_consent_events where decision='granted' and source='settings'),'consent written');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where action='notification.preference_changed'),'one audit event');
do $$ begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 begin
  perform public.set_notification_preference('sms','booking',false,'notice-v1',1);
  raise exception using errcode='Z0001';
 exception when sqlstate 'Z0001' then null; end;
 perform pg_temp.assert_true((select enabled and version=1 from public.notification_preferences),'rolled-back projection');
 perform pg_temp.assert_true((select count(*)=1 from notify_private.channel_consent_events),'rolled-back consent');
 perform pg_temp.assert_true((select count(*)=1 from public.audit_events where action='notification.preference_changed'),'rolled-back audit');
end $$;
do $$ declare i integer; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 for i in 1..19 loop perform public.set_notification_preference('sms','booking',false,'notice-v1',i); end loop;
 perform pg_temp.expect_state('select public.set_notification_preference(''sms'',''booking'',true,''notice-v1'',20)','53300','21st call in hour');
 perform pg_temp.assert_true((select count(*)=20 from notify_private.channel_consent_events),'rate limit writes nothing');
end $$;
select pg_temp.expect_state('update notify_private.channel_consent_events set decision=''withdrawn''','55000','consent immutable');
select pg_temp.expect_state('truncate notify_private.channel_consent_events','55000','consent no truncate');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 106_n01_preferences_consent
rollback;
