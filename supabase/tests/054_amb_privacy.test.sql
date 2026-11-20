\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5a_fixture.inc
-- P5 ambulance projections and contact (design §7.4, §9.4, test plan 034; contract §8.3-§8.6).
-- Authored, DB NOT EXECUTED.
create function pg_temp.contact_audits() returns integer language sql as $$
 select count(*)::integer from public.audit_events where action in ('booking.contact_viewed','booking.contact_viewed_ops'); $$;
create function pg_temp.pii_free(j jsonb) returns boolean language sql as $$
 select j::text not like '%Synthetic exact address%' and j::text not like '%Synthetic destination line%' and j::text not like '%+91%'
  and j::text not like '%Synthetic patient%' and j::text not like '%Synthetic ward desk%' and j::text not like '%b2000000-0000-4000-8000-000000000001%'
  and j::text not like '%c3000000-0000-4000-8000-000000000003%' and j::text not like '%amount%' and j::text not like '%c1000000-%'; $$;
create function pg_temp.staff_keys() returns text[] language sql as $$
 select pg_temp.sorted(array['booking_id','public_ref','provider_reference','service_title','start_at','end_at','state','substate','version',
  'requirement','driver_name','vehicle_type','vehicle_key','timeline','pickup_pin','destination_pin']); $$;
create function pg_temp.patient_keys() returns text[] language sql as $$
 select pg_temp.sorted(array['booking_id','public_ref','provider_reference','service_title','start_at','end_at','state','substate','version',
  'requirement','driver_name','vehicle_type','vehicle_key','timeline','pickup','destination']); $$;

select pg_temp.amb_trip(pg_temp.p5_at(2)) as p \gset
select pg_temp.contact_audits() as a0 \gset

-- 034-1 scheduler: PINs only, exact keys, no contact, patient id, provider id or amount.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.get_trip(:'p') as sv \gset
select pg_temp.assert_true(pg_temp.keys(:'sv'::jsonb)=pg_temp.staff_keys() and pg_temp.pii_free(:'sv'::jsonb),'scheduler key set, no contact');
select pg_temp.assert_true((:'sv'::jsonb)->>'pickup_pin'='599991' and (:'sv'::jsonb)->>'destination_pin'='599991' and (:'sv'::jsonb)->>'vehicle_key'='SYNP5V01'
 and (:'sv'::jsonb)->>'driver_name'='Synthetic driver one','scheduler sees PINs, plate and driver name');
select pg_temp.assert_true((select bool_and(pg_temp.keys(e)=pg_temp.sorted(array['occurred_at','reason'])) from jsonb_array_elements((:'sv'::jsonb)->'timeline') e),'timeline has no actor ids');
select pg_temp.assert_true(pg_temp.keys(public.get_booking(:'p'))=pg_temp.sorted(array['id','public_ref','provider_reference','category','service_id','pin_code','start_at','end_at',
 'state','version','amount_paise','currency','terms_version','policy_version_id']),'generic get_booking gives the scheduler no address');
select pg_temp.expect_state(format('select public.get_assignment_contact(%L)',:'p'),'P0002','scheduler who is not the driver gets no contact');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'p'),'P0002','scheduler gets no destination');
-- 034-2 patient: own addresses; no plate before the driver sets off.
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.get_trip(:'p') as pv \gset
select pg_temp.assert_true(pg_temp.keys(:'pv'::jsonb)=pg_temp.patient_keys(),'patient key set');
select pg_temp.assert_true((:'pv'::jsonb)->'pickup'->>'line1'='Synthetic exact address' and (:'pv'::jsonb)->'destination'->>'line1'='Synthetic destination line'
 and (:'pv'::jsonb)->'vehicle_key'='null'::jsonb and (:'pv'::jsonb)->>'driver_name'='Synthetic driver one','patient sees own addresses, driver name, no plate yet');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'p'),'P0002','patient reads the trip, not the assignee destination');
-- Outsiders and other operators.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select pg_temp.expect_state(format('select public.get_trip(%L)',:'p'),'P0002','other operator');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.get_trip(%L)',:'p'),'P0002','unassigned staff');
-- 034-3 driver before the H1 window: nothing.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.get_trip(%L)',:'p'),'P0002','driver before start - 60 min');
select pg_temp.expect_state(format('select public.get_assignment_contact(%L)',:'p'),'P0002','no contact before the window');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'p'),'P0002','no destination before the window');
select pg_temp.assert_true((select count(*)=0 from public.list_driver_trips(50,null)),'future trip not listed for the driver');
select pg_temp.assert_true(pg_temp.contact_audits()=:a0,'denials write no audit');

-- Inside the window: audited contact and destination, one row per allowed call.
select pg_temp.amb_live(:'p');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.keys(public.get_trip(:'p'))=pg_temp.staff_keys() and pg_temp.pii_free(public.get_trip(:'p')),'driver key set, no contact');
select pg_temp.assert_true((select count(*)=1 from public.list_driver_trips(50,null)),'live trip listed for the driver');
select pg_temp.assert_true((public.get_assignment_contact(:'p'))->'contact'->>'phone'='+919999999999','driver reads the pickup contact');
select pg_temp.assert_true(pg_temp.contact_audits()=:a0+1,'one audit row for the contact read');
select public.get_trip_destination(:'p') as dv \gset
select pg_temp.assert_true(pg_temp.keys(:'dv'::jsonb)=pg_temp.sorted(array['booking_id','public_ref','destination','requirement'])
 and (:'dv'::jsonb)->'destination'->>'line1'='Synthetic destination line' and pg_temp.contact_audits()=:a0+2,'destination read audited once');
select pg_temp.assert_true((select bool_and(target_type='booking' and target_id=:'p'::uuid and actor_profile_id='c1000000-0000-4000-8000-000000000002')
 from public.audit_events where action='booking.contact_viewed'),'audit rows carry ids only');
-- The patient sees the plate only while the driver reports en_route, arrived, picked_up.
select pg_temp.amb_step(:'p','en_route');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((public.get_trip(:'p'))->>'vehicle_key'='SYNP5V01','plate after setting off');
select pg_temp.amb_step(:'p','arrived');
select pg_temp.amb_step(:'p','picked_up');
select pg_temp.amb_step(:'p','destination_reached');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((public.get_trip(:'p'))->'vehicle_key'='null'::jsonb and (public.get_trip(:'p'))->>'state'='completed','no plate after the trip');
select pg_temp.contact_audits() as a1 \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.get_trip(%L)',:'p'),'P0002','driver after completion');
select pg_temp.expect_state(format('select public.get_assignment_contact(%L)',:'p'),'P0002','no contact after completion');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'p'),'P0002','no destination after completion');
select pg_temp.assert_true(pg_temp.contact_audits()=:a1,'no audit for denials');
select pg_temp.amb_retire(:'p',3);

-- After a pre-pickup interruption the driver has no contact.
select pg_temp.amb_trip(pg_temp.p5_at(3),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as q \gset
select pg_temp.amb_live(:'q');
select pg_temp.amb_step(:'q','interrupt','c1000000-0000-4000-8000-000000000003','unsafe_conditions');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'q'),'P0002','no destination after interruption');
select pg_temp.amb_retire(:'q',6);

-- Ops (OD-3): contact only with an open exception or an escalatable booking, audited separately.
select pg_temp.amb_trip(pg_temp.p5_at(5),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as s \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'s'),'P0002','ops without an exception');
select pg_temp.expect_state(format('select public.get_trip(%L)',:'s'),'P0002','ops has no trip projection');
select pg_temp.amb_trip(pg_temp.p5_at(4)) as r \gset
select pg_temp.amb_live(:'r');
select pg_temp.amb_step(:'r','en_route');
select pg_temp.amb_step(:'r','arrived');
select pg_temp.amb_step(:'r','absence');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'r'),'P0002','driver after reporting absence');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.assert_true((public.get_trip_destination(:'r'))->>'requirement'='seated'
 and (select count(*)=1 from public.audit_events where action='booking.contact_viewed_ops' and target_id=:'r'::uuid),'ops reads with an open exception, audited as ops');
select pg_temp.amb_retire(:'r',9);

-- 034-4 queue refreshes never audit; rows have the scheduler key set.
select pg_temp.contact_audits() as a2 \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)>=4 and bool_and(pg_temp.keys(x)=pg_temp.staff_keys() and pg_temp.pii_free(x)) from public.list_trip_queue(pg_temp.amb_provider(),50,null) x),'queue rows');
select pg_temp.assert_true((select count(*)>=4 from public.list_trip_queue(pg_temp.amb_provider(),50,null)) and pg_temp.contact_audits()=:a2,'two refreshes, zero audit rows');
select pg_temp.expect_state('select * from public.list_trip_queue(''c3000000-0000-4000-8000-000000000003'',51,null)','22023','limit capped at 50');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state('select * from public.list_trip_queue(''c3000000-0000-4000-8000-000000000003'',20,null)','42501','driver cannot read the queue');

-- 034-5 no ambulance table or bookings in Realtime. 034-6 privileges.
select pg_temp.assert_true((select count(*)=0 from pg_publication_tables where pubname='supabase_realtime'
 and tablename in ('bookings','transport_trips','ambulance_vehicles','ambulance_drivers','vehicle_credential_documents','vehicle_credential_events')),'nothing published to Realtime');
do $$ declare f text; r text; begin
 foreach f in array array['public.list_transport_slots(text,uuid,date,text)','public.request_transport(uuid,uuid,uuid,uuid,text,timestamptz,uuid)',
  'public.accept_transport(uuid,integer,uuid,uuid,uuid)','public.advance_trip(uuid,text,integer,uuid,text)','public.get_trip(uuid)',
  'public.get_trip_destination(uuid)','public.list_trip_queue(uuid,integer,uuid)','public.list_driver_trips(integer,uuid)'] loop
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' authenticated only');
 end loop;
 foreach f in array array['ambulance_private.trip_view(uuid,text)','ambulance_private.advance_result(uuid,integer)','ambulance_private.covers(uuid,text)',
  'ambulance_private.slot_free(uuid,uuid,timestamptz,timestamptz)','ambulance_private.policy()','ambulance_private.guard_trip()'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.assert_true(not has_function_privilege(r,f,'EXECUTE'),f||' not executable by '||r);
  end loop;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.assert_true(not has_table_privilege(r,'public.transport_trips','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'transport_trips closed to '||r);
 end loop;
 perform pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.transport_trips'::regclass),'transport_trips RLS on');
end $$;
\echo 1..1
\echo ok 1 - 054_amb_privacy
rollback;
