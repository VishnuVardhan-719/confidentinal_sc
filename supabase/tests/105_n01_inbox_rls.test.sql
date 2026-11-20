\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
select pg_temp.n01_event('doctor','confirmed','accepted','confirmed') as e \gset
select notify_worker.expand(500);
select id as own from public.notifications where event_id=:'e' and recipient_profile_id='b1000000-0000-4000-8000-000000000001' \gset
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)=1 from public.notifications),'recipient sees only own');
select pg_temp.expect_state('update public.notifications set read_at=clock_timestamp()','42501','direct update denied');
select pg_temp.expect_state('delete from public.notifications','42501','direct delete denied');
select pg_temp.assert_true(public.mark_notifications_read(array[:'own'::uuid])=1,'mark own read');
select pg_temp.assert_true(public.mark_notifications_read(array[:'own'::uuid])=0,'read is idempotent');
select pg_temp.expect_state('select public.mark_notifications_read(array[array[''b1000000-0000-4000-8000-000000000001''::uuid]])','22023','multidimensional ids rejected before array_position');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true((select count(*)=0 from public.notifications),'another patient sees none');
select pg_temp.assert_true(public.mark_notifications_read(array[:'own'::uuid])=0,'cross-user id silently ignored');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.assert_true((select count(*)=0 from public.notifications),'other provider scheduler sees none');
reset role;
update public.profiles set status='disabled' where id='b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)=0 from public.notifications),'disabled recipient sees none');
select pg_temp.expect_state('select public.mark_all_notifications_read(clock_timestamp())','42501','disabled cannot mutate');
reset role;
set local role anon;
select pg_temp.expect_state('select * from public.notifications','42501','anonymous no privilege');
reset role;
set local role service_role;
select pg_temp.expect_state('select * from public.notifications','42501','service role no inbox privilege despite bypass RLS');
reset role;
select pg_temp.expect_state(format('update public.notifications set read_at=null where id=%L',:'own'),'55000','cannot clear read_at');
select pg_temp.expect_state(format('update public.notifications set template_key=''other.key'' where id=%L',:'own'),'55000','only read_at mutable');
select pg_temp.expect_state('truncate public.notifications','55000','cannot truncate');
select pg_temp.expect_state('delete from public.notifications','55000','cannot delete');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 105_n01_inbox_rls
rollback;
