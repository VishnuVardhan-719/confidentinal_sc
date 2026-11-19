\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §11 (P5-02): one busy predicate across categories and providers,
-- enforced by the reservation guard on every acceptance path. W1 (c6..01) is a lab
-- technician, driver, caregiver and doctor for organisation A; V1 is c6..03.

select pg_temp.assert_true(exists(select 1 from pg_trigger where tgname='p5s_reservation_guard' and tgrelid='public.resource_reservations'::regclass and tgenabled='O'),'reservation guard installed');
select pg_temp.assert_true(not has_function_privilege('authenticated','booking_private.resource_busy(uuid,uuid)','EXECUTE'),'busy predicate not granted');
-- Only W1 serves the doctor provider, so generic slots show W1's state.
delete from public.availability_rules where provider_id=pg_temp.p5_provider('doctor') and resource_id='c6000000-0000-4000-8000-000000000002';
select ((clock_timestamp() at time zone 'Asia/Kolkata')::date+3)::text as day \gset
select pg_temp.p5_provider('doctor') as doc_provider,pg_temp.p5_service('doctor') as doc_service \gset
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)>0 from public.list_slots(:'doc_provider'::uuid,:'doc_service'::uuid,:'day'::date)),'doctor slots while W1 is free');
reset role;

-- (1) Lab work overruns its reservation: W1 cannot be accepted as a driver.
select pg_temp.p5_book('lab',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001'::uuid]) as l1 \gset
select pg_temp.p5_shift(:'l1',now()-interval '3 hours');
select pg_temp.p5_step(:'l1','c1000000-0000-4000-8000-000000000002','in_progress','other');
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'collected sample past its reservation keeps W1 busy');
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001',:'l1'),'own booking excluded');
select pg_temp.assert_true(booking_private.booking_overdue(:'l1'),'lab booking overdue');
select pg_temp.p5_create('ambulance',pg_temp.p5_at(4)) as a1 \gset
select set_config('p5.a1',:'a1',true);
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000001''::uuid,''c6000000-0000-4000-8000-000000000003''::uuid])',:'a1'),'55000','ambulance accept with busy technician');
do $$ declare m text; begin
 begin perform pg_temp.p5_accept(current_setting('p5.a1')::uuid,array['c6000000-0000-4000-8000-000000000001'::uuid,'c6000000-0000-4000-8000-000000000003'::uuid]);
 exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='resource_busy','busy message is resource_busy, got '||coalesce(m,'none'));
end $$;
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)=0 from public.list_slots(:'doc_provider'::uuid,:'doc_service'::uuid,:'day'::date)),'generic slots exclude the busy person');
reset role;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.assignee_finish(:'l1','completed','other',gen_random_uuid());
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'(5) lab completion frees W1');

-- (2) The reverse: an overrunning trip blocks a lab accept.
select pg_temp.p5_book('ambulance',pg_temp.p5_at(2,2),array['c6000000-0000-4000-8000-000000000001'::uuid,'c6000000-0000-4000-8000-000000000003'::uuid]) as a2 \gset
select pg_temp.p5_shift(:'a2',now()-interval '4 hours');
select pg_temp.p5_step(:'a2','c1000000-0000-4000-8000-000000000002','in_progress','other');
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000001') and booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'overrunning trip keeps driver and vehicle busy');
select pg_temp.p5_create('lab',pg_temp.p5_at(4,2)) as l2 \gset
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000001''::uuid])',:'l2'),'55000','lab accept with busy driver');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.assignee_finish(:'a2','completed','other',gen_random_uuid());
select pg_temp.assert_true((select bool_and(rr.status='active') from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=:'a2'),'ambulance keeps reservations after finish');
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001') and not booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'(5) ambulance completion frees driver and vehicle');

-- (3) A care session past its upper bound blocks a doctor accept.
select pg_temp.p5_book('caretaker',pg_temp.p5_at(2,4),array['c6000000-0000-4000-8000-000000000001'::uuid]) as c3 \gset
select pg_temp.p5_shift(:'c3',now()-interval '5 hours');
select pg_temp.p5_step(:'c3','c1000000-0000-4000-8000-000000000002','in_progress','service_started');
select pg_temp.p5_create('doctor',pg_temp.p5_at(4,4)) as d3 \gset
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000001''::uuid])',:'d3'),'55000','doctor accept with busy caregiver');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.assignee_finish(:'c3','completed','service_completed',gen_random_uuid());
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'(5) care completion frees W1');
select pg_temp.p5_accept(:'d3',array['c6000000-0000-4000-8000-000000000001'::uuid]);
select pg_temp.p5_shift(:'d3',now()-interval '6 hours');
select pg_temp.p5_step(:'d3','c1000000-0000-4000-8000-000000000002','in_progress','service_started');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.assignee_finish(:'d3','completed','service_completed',gen_random_uuid());
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'(5) doctor completion frees W1');

-- (4) An open interrupted_after_pickup exception blocks vehicle and driver after their
-- assignments ended; resolving it unblocks them.
select pg_temp.p5_book('ambulance',pg_temp.p5_at(2,6),array['c6000000-0000-4000-8000-000000000001'::uuid,'c6000000-0000-4000-8000-000000000003'::uuid]) as a4 \gset
select pg_temp.p5_shift(:'a4',now()-interval '10 minutes');
select pg_temp.p5_step(:'a4','c1000000-0000-4000-8000-000000000002','in_progress','other');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select 1 from public.resources where id in ('c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003') order by id for update;
select booking_private.assignee_finish(:'a4','interrupted','unsafe_conditions',gen_random_uuid());
select booking_private.open_exception(:'a4','interrupted_after_pickup','unsafe_conditions') as pickup_exc \gset
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=:'a4' and status='active'),'trip assignments ended');
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000001') and booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'blocking exception keeps driver and vehicle busy');
select pg_temp.p5_create('ambulance',pg_temp.p5_at(5)) as a5 \gset
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000001''::uuid,''c6000000-0000-4000-8000-000000000003''::uuid])',:'a5'),'55000','blocked vehicle and driver refused');
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000002''::uuid,''c6000000-0000-4000-8000-000000000003''::uuid])',:'a5'),'55000','blocked vehicle refused with a free driver');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.expect_state(format('select public.ops_resolve_exception(%L,1,''no_show_confirmed'',gen_random_uuid())',:'pickup_exc'),'55000','resolution must belong to the kind');
select pg_temp.assert_true(public.ops_resolve_exception(:'pickup_exc',1,'resolved',gen_random_uuid())=2,'ops resolves the pickup exception');
reset role;
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001') and not booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'resolution unblocks');
select pg_temp.p5_accept(:'a5',array['c6000000-0000-4000-8000-000000000001'::uuid,'c6000000-0000-4000-8000-000000000003'::uuid]);
select pg_temp.assert_true((select state from public.bookings where id=:'a5')='confirmed','accept succeeds once unblocked');

-- (6) Reservations cannot be reactivated, deleted, inserted released or truncated.
select pg_temp.expect_state(format('update public.resource_reservations set status=''active'' where assignment_id in (select id from public.booking_assignments where booking_id=%L)',:'l1'),'55000','released reservation cannot be reactivated by the owner');
select pg_temp.expect_state(format('update public.resource_reservations set occupied_period=tstzrange(now(),now()+interval ''1 hour'') where assignment_id in (select id from public.booking_assignments where booking_id=%L)',:'a5'),'55000','reservation period immutable');
select pg_temp.expect_state(format('delete from public.resource_reservations where assignment_id in (select id from public.booking_assignments where booking_id=%L)',:'a2'),'55000','reservation delete refused');
select pg_temp.expect_state('truncate public.resource_reservations cascade','55000','reservation truncate refused');
select pg_temp.expect_state(format('insert into public.resource_reservations(assignment_id,resource_id,occupied_period,status) select id,resource_id,tstzrange(now()+interval ''40 days'',now()+interval ''41 days''),''released'' from public.booking_assignments where booking_id=%L and purpose=''vehicle''',:'a5'),'55000','reservation inserted released refused');
select pg_temp.assert_true((select count(*)=0 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id in (:'a1',:'l2')),'refused accepts left no reservation');
\echo 1..1
\echo ok 1 - 021_p5s_resource_busy
rollback;
