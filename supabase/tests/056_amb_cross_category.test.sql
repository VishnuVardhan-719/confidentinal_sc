\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5a_fixture.inc
-- Contract §11.5 from the ambulance side: one person resource (W1, W2) works for the lab,
-- doctor and ambulance providers of organisation A. Unresolved work past its reservation,
-- in any category, blocks accept_transport and list_transport_slots; ambulance work
-- blocks the other categories the same way. Lab and doctor bookings use the _p5s helpers
-- (generic accept switched on for the call only). Authored, DB NOT EXECUTED.
select public_reference as amb_ref from public.providers where id='c3000000-0000-4000-8000-000000000003' \gset
create function pg_temp.slots(p_date timestamptz,p_req text default 'seated') returns integer language sql as $$
 select count(*)::integer from public.list_transport_slots((select public_reference from public.providers where id='c3000000-0000-4000-8000-000000000003'),
  pg_temp.amb_service(),(p_date at time zone 'Asia/Kolkata')::date,p_req); $$;

-- (1) A lab collection in progress past its reservation blocks the ambulance accept.
select pg_temp.p5_book('lab',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001'::uuid]) as lab1 \gset
select pg_temp.p5_shift(:'lab1',now()-interval '10 minutes');
select pg_temp.p5_step(:'lab1','c1000000-0000-4000-8000-000000000002','in_progress','other');
select pg_temp.p5_shift(:'lab1',now()-interval '3 hours');
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'overrunning lab work makes W1 busy');
select pg_temp.amb_request(pg_temp.p5_at(3)) as t1 \gset
select pg_temp.expect_state(format('select pg_temp.amb_accept(%L)',:'t1'),'55000','ambulance accept with a busy lab technician: resource_busy');
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=:'t1'),'nothing reserved');
select pg_temp.assert_true(pg_temp.slots(pg_temp.p5_at(3))>0,'slots remain through the free driver');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.set_ambulance_driver(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000002','disabled',1);
select pg_temp.assert_true(pg_temp.slots(pg_temp.p5_at(3))=0,'busy W1 is excluded from slots');
select public.set_ambulance_driver(pg_temp.amb_provider(),'c6000000-0000-4000-8000-000000000002','active',2);
-- (5) closing the lab work frees the person; the ambulance accept then succeeds.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.assignee_finish(:'lab1','completed','other',gen_random_uuid());
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'closed lab work frees W1');
select pg_temp.assert_true(pg_temp.amb_accept(:'t1')=4,'ambulance accept after the lab closes');

-- (2) The reverse: an overrunning trip blocks a lab accept for its driver.
select pg_temp.amb_trip(pg_temp.p5_at(4),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as t2 \gset
select pg_temp.p5_shift(:'t2',now()-interval '2 hours');
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000002') and booking_private.booking_overdue(:'t2'),'trip overruns');
select pg_temp.p5_create('lab',pg_temp.p5_at(5)) as lab2 \gset
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000002''::uuid])',:'lab2'),'55000','lab accept with an overrunning driver: resource_busy');
-- The overrun shows in the shared ops queue for the org-scoped ops holder.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.assert_true((select bool_or((x->>'booking_id')::uuid=:'t2'::uuid and (x->>'overdue')::boolean and x->>'category'='ambulance')
 from public.list_booking_exceptions(50,null) x),'overrunning trip listed as overdue');

-- (4) An on-board interruption blocks the person for a doctor accept until ops resolves it.
select pg_temp.amb_live(:'t1');
select pg_temp.amb_step(:'t1','en_route');
select pg_temp.amb_step(:'t1','arrived');
select pg_temp.amb_step(:'t1','picked_up');
select pg_temp.amb_step(:'t1','interrupt','c1000000-0000-4000-8000-000000000002','unsafe_conditions');
select pg_temp.p5_create('doctor',pg_temp.p5_at(6)) as doc1 \gset
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000001''::uuid])',:'doc1'),'55000','doctor accept with a blocked driver: resource_busy');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_resolve_exception((select id from public.booking_exceptions where booking_id=:'t1' and kind='interrupted_after_pickup'),1,'resolved',gen_random_uuid());
select pg_temp.amb_retire(:'t1',4);
select pg_temp.assert_true(pg_temp.p5_accept(:'doc1',array['c6000000-0000-4000-8000-000000000001'::uuid])=4,'doctor accept after resolution');

-- (5) After a normal ambulance completion the driver is not busy.
select pg_temp.amb_trip(pg_temp.p5_at(7),'c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003') as t3 \gset
select pg_temp.amb_live(:'t3');
select pg_temp.amb_step(:'t3','en_route');
select pg_temp.amb_step(:'t3','arrived');
select pg_temp.amb_step(:'t3','picked_up');
select pg_temp.amb_step(:'t3','destination_reached');
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001') and not booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'completed trip leaves nothing busy');
\echo 1..1
\echo ok 1 - 056_amb_cross_category
rollback;
