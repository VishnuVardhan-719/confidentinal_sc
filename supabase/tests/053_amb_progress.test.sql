\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5a_fixture.inc
-- P5 ambulance trip progress: advance_trip, closeout, absence, interruption and the shared
-- ops path on trips (design §6, §7.3, test plan 033; contract §4.3, §5, §6, §9.4, §12).
-- Trips on W1/V01 and W2/V02 alternate; each finished trip is moved into the past
-- (W1/V01 at 3,9,15,21,27,33,39 h; W2/V02 at 6,12,18,30,36 h) so kept buffers never overlap.
-- Authored, DB NOT EXECUTED.

-- 033-1 full journey: completed, assignments ended, reservations kept, ordered events.
select pg_temp.amb_trip(pg_temp.p5_at(2)) as j \gset
select pg_temp.amb_live(:'j');
select pg_temp.assert_true((pg_temp.amb_step(:'j','en_route'))->>'substate'='en_route','set off');
select pg_temp.assert_true((pg_temp.amb_step(:'j','arrived'))->>'substate'='arrived','arrived');
select pg_temp.assert_true(pg_temp.amb_substate(:'j')='confirmed/arrived','still confirmed before pickup');
select pg_temp.assert_true((pg_temp.amb_step(:'j','picked_up'))->>'substate'='picked_up' and pg_temp.amb_substate(:'j')='in_progress/picked_up','on board is in_progress');
select pg_temp.amb_step(:'j','destination_reached') as jr \gset
select pg_temp.assert_true(pg_temp.keys(:'jr'::jsonb)=pg_temp.sorted(array['blocked','substate','version']) and (:'jr'::jsonb)->>'substate'='destination_reached'
 and (:'jr'::jsonb)->'blocked'='null'::jsonb and ((:'jr'::jsonb)->>'version')::integer=(select version from public.bookings where id=:'j'),'result shape');
select pg_temp.assert_true(pg_temp.amb_substate(:'j')='completed/destination_reached','completed');
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=:'j' and status='active')
 and (select count(*)=2 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=:'j' and rr.status='active'),
 'assignments ended, buffered reservations kept (category_paths end_assignments)');
select pg_temp.assert_true((select array_agg(reason order by aggregate_version)=array['requested','accepted','confirmed','en_route','arrived','picked_up','destination_reached']
 from public.booking_events where booking_id=:'j'),'events in order');
select pg_temp.assert_true((select array_agg(from_state||'>'||to_state order by aggregate_version) from public.booking_events where booking_id=:'j' and aggregate_version>4)
 =array['confirmed>confirmed','confirmed>confirmed','confirmed>in_progress','in_progress>completed'],'milestones before pickup keep the booking confirmed');
select pg_temp.assert_true((select bool_and(pg_temp.keys(payload)=pg_temp.sorted(array['booking_id','event','version'])) from public.notification_outbox where booking_id=:'j'),'outbox ids and codes only');
select pg_temp.assert_true((select count(*)=0 from public.booking_exceptions where booking_id=:'j'),'eligible completion opens no exception');
select pg_temp.assert_true((select version=6 from public.transport_trips where booking_id=:'j'),'trip version per substate step');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''arrived'')',:'j'),'42501','no step after a terminal state (assignment ended)');
select pg_temp.expect_state('update public.transport_trips set substate=''en_route'',version=version+1 where booking_id='''||:'j'||'''','55000','trip guard: no substate rewind');
select pg_temp.expect_state('update public.transport_trips set requirement_code=''stretcher'',version=version+1 where booking_id='''||:'j'||'''','55000','trip guard: requirement immutable');
select pg_temp.expect_state('delete from public.transport_trips where booking_id='''||:'j'||'''','55000','trip guard: no delete');
select pg_temp.amb_retire(:'j',3);

-- 033-2 order, 033-4 authority, 033-11 replay, 033-7 cancel after the first milestone.
select pg_temp.amb_trip(pg_temp.p5_at(3),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as o \gset
select pg_temp.amb_live(:'o');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''picked_up'',''c1000000-0000-4000-8000-000000000003'')',:'o'),'55000','pickup before setting off');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''arrived'',''c1000000-0000-4000-8000-000000000003'')',:'o'),'55000','arrival before setting off');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''destination_reached'',''c1000000-0000-4000-8000-000000000003'')',:'o'),'55000','destination before pickup');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''absence'',''c1000000-0000-4000-8000-000000000003'')',:'o'),'55000','absence before arrival');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''c1000000-0000-4000-8000-000000000002'')',:'o'),'42501','unassigned driver of the operator');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''c1000000-0000-4000-8000-000000000001'')',:'o'),'42501','scheduler cannot report milestones');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''b1000000-0000-4000-8000-000000000001'')',:'o'),'42501','patient cannot report milestones');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''c1000000-0000-4000-8000-000000000008'')',:'o'),'42501','other operator staff');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.advance_trip(%L,''fly'',4,gen_random_uuid())',:'o'),'22023','unknown step');
select pg_temp.expect_state(format('select public.advance_trip(%L,''en_route'',4,null)',:'o'),'22023','key required');
select pg_temp.expect_state(format('select public.advance_trip(%L,''en_route'',3,gen_random_uuid())',:'o'),'40001','stale version');
select pg_temp.assert_true(pg_temp.amb_events(:'o')=3,'refused steps wrote nothing');
-- 033-3 too early: lower(occupied_period) is start - 30 minutes.
select pg_temp.p5_shift(:'o',clock_timestamp()+interval '31 minutes');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''c1000000-0000-4000-8000-000000000003'')',:'o'),'55000','one minute before the reserved period: too_early');
select pg_temp.p5_shift(:'o',clock_timestamp()+interval '29 minutes');
select gen_random_uuid() as ko \gset
select pg_temp.amb_step(:'o','en_route','c1000000-0000-4000-8000-000000000003',null,:'ko') as ro \gset
select pg_temp.assert_true((:'ro'::jsonb)->>'substate'='en_route','set off at the reserved period');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(public.advance_trip(:'o','en_route',4,:'ko')=:'ro'::jsonb and pg_temp.amb_events(:'o')=4,'same key replays without an event');
select pg_temp.expect_state(format('select public.advance_trip(%L,''arrived'',4,%L)',:'o',:'ko'),'40001','same key, other step');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''c1000000-0000-4000-8000-000000000003'')',:'o'),'55000','repeat with a new key: invalid_transition');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''patient_request'')',:'o'),'55000','patient cannot cancel after en_route');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''provider_unavailable'')',:'o'),'55000','scheduler cannot cancel after en_route');
select pg_temp.amb_step(:'o','arrived','c1000000-0000-4000-8000-000000000003');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,6,''provider_unavailable'')',:'o'),'55000','scheduler cannot cancel after arrival');
-- 033-8 interruption before pickup: interrupted, no blocking exception, buffer kept.
select pg_temp.amb_step(:'o','interrupt','c1000000-0000-4000-8000-000000000003','unsafe_conditions');
select pg_temp.assert_true(pg_temp.amb_substate(:'o')='interrupted/trip_interrupted' and (select count(*)=0 from public.booking_exceptions where booking_id=:'o')
 and (select count(*)=0 from public.booking_assignments where booking_id=:'o' and status='active')
 and not booking_private.resource_busy('c6000000-0000-4000-8000-000000000004'),'pre-pickup interruption');
select pg_temp.amb_retire(:'o',6);

-- 033-12 driver reason rules; 033-8 interruption from assigned.
select pg_temp.amb_trip(pg_temp.p5_at(4)) as c \gset
select pg_temp.amb_live(:'c');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''interrupt'',''c1000000-0000-4000-8000-000000000002'',''ops_closeout'')',:'c'),'22023','ops-only reason refused for the driver');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''interrupt'')',:'c'),'22023','interruption needs a reason');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''c1000000-0000-4000-8000-000000000002'',''driver_unable'')',:'c'),'22023','reason only on interrupt');
select pg_temp.amb_step(:'c','interrupt','c1000000-0000-4000-8000-000000000002','driver_unable');
select pg_temp.assert_true(pg_temp.amb_substate(:'c')='interrupted/trip_interrupted','interrupted from assigned');
select pg_temp.amb_retire(:'c',9);

-- 033-8 interruption on board: blocking exception until ops resolves it.
select pg_temp.amb_trip(pg_temp.p5_at(5),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as d \gset
select pg_temp.amb_live(:'d');
select pg_temp.amb_step(:'d','en_route','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'d','arrived','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'d','picked_up','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'d','interrupt','c1000000-0000-4000-8000-000000000003','ended_for_emergency');
select pg_temp.assert_true(pg_temp.amb_substate(:'d')='interrupted/trip_interrupted'
 and (select count(*)=1 from public.booking_exceptions where booking_id=:'d' and kind='interrupted_after_pickup' and status='open' and reason='ended_for_emergency'),'on-board interruption opens interrupted_after_pickup');
select pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000002') and booking_private.resource_busy('c6000000-0000-4000-8000-000000000004'),'driver and vehicle blocked');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.ops_resolve_exception((select id from public.booking_exceptions where booking_id=%L),1,''resolved'',gen_random_uuid())',:'d'),'42501','the driver cannot resolve');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_resolve_exception((select id from public.booking_exceptions where booking_id=:'d'),1,'resolved',gen_random_uuid());
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000002') and not booking_private.resource_busy('c6000000-0000-4000-8000-000000000004'),'resolution unblocks');
select pg_temp.amb_retire(:'d',12);

-- 033-5 gate: suspended stops starts (en_route, arrived, picked_up); closeout continues; off allows all.
select pg_temp.amb_trip(pg_temp.p5_at(6)) as e \gset
select pg_temp.amb_live(:'e');
update booking_private.feature_gates set state='suspended' where key='ambulance';
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'')',:'e'),'55000','suspended: no setting off');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.amb_step(:'e','en_route');
update booking_private.feature_gates set state='suspended' where key='ambulance';
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''arrived'')',:'e'),'55000','suspended: no arrival');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.amb_step(:'e','arrived');
update booking_private.feature_gates set state='suspended' where key='ambulance';
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''picked_up'')',:'e'),'55000','suspended: no pickup');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.amb_step(:'e','picked_up');
update booking_private.feature_gates set state='suspended' where key='ambulance';
select pg_temp.assert_true((pg_temp.amb_step(:'e','destination_reached'))->>'substate'='destination_reached','suspended: closeout continues');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.amb_retire(:'e',15);
select pg_temp.amb_trip(pg_temp.p5_at(7),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as f \gset
select pg_temp.amb_live(:'f');
update booking_private.feature_gates set state='off' where key='ambulance';
select pg_temp.amb_step(:'f','en_route','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'f','arrived','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'f','picked_up','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'f','destination_reached','c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(pg_temp.amb_substate(:'f')='completed/destination_reached','gate off: an accepted trip runs to completion');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.amb_retire(:'f',18);
select pg_temp.amb_trip(pg_temp.p5_at(8)) as g \gset
select pg_temp.amb_live(:'g');
update booking_private.feature_gates set state='suspended' where key='ambulance';
select pg_temp.amb_step(:'g','interrupt','c1000000-0000-4000-8000-000000000002','vehicle_breakdown');
update booking_private.feature_gates set state='on' where key='ambulance';
select pg_temp.assert_true(pg_temp.amb_substate(:'g')='interrupted/trip_interrupted','suspended: interruption continues');
select pg_temp.amb_retire(:'g',21);

-- 033-6 papers lapse after acceptance: en_route records the block instead of raising.
select pg_temp.amb_trip(pg_temp.p5_at(9),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as h \gset
select pg_temp.amb_live(:'h');
select pg_temp.amb_lapse('c6000000-0000-4000-8000-000000000004',true);
select gen_random_uuid() as kh \gset
select pg_temp.amb_step(:'h','en_route','c1000000-0000-4000-8000-000000000003',null,:'kh') as rh \gset
select pg_temp.assert_true((:'rh'::jsonb)->>'blocked'='eligibility_blocked' and (:'rh'::jsonb)->>'substate'='assigned' and ((:'rh'::jsonb)->>'version')::integer=5,'blocked result, version bumped once');
select pg_temp.assert_true(pg_temp.amb_substate(:'h')='confirmed/assigned'
 and (select reason='eligibility_blocked' and from_state='confirmed' and to_state='confirmed' from public.booking_events where booking_id=:'h' and aggregate_version=5)
 and (select count(*)=1 from public.booking_exceptions where booking_id=:'h' and kind='eligibility_lapsed' and status='open' and reason='eligibility_blocked'),'block event and exception persist');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(public.advance_trip(:'h','en_route',4,:'kh')=:'rh'::jsonb,'blocked en_route replays');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''en_route'',''c1000000-0000-4000-8000-000000000003'')',:'h'),'55000','second attempt while the exception is open');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.cancel_booking(:'h',5,'provider_unavailable')=6,'operator may cancel after eligibility_blocked');
select pg_temp.assert_true((select count(*)=0 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=:'h' and rr.status='active'),'cancellation releases');
select pg_temp.amb_lapse('c6000000-0000-4000-8000-000000000004',false);

-- 033-9 provider suspended on board: closeout completes, contact is gone.
select pg_temp.amb_trip(pg_temp.p5_at(10)) as k \gset
select pg_temp.amb_live(:'k');
select pg_temp.amb_step(:'k','en_route');
select pg_temp.amb_step(:'k','arrived');
select pg_temp.amb_step(:'k','picked_up');
update public.providers set status='suspended' where id=pg_temp.amb_provider();
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not identity_private.is_assigned(:'k','driver') and booking_private.closeout_assignee(:'k'),'closeout only');
select pg_temp.expect_state(format('select public.get_assignment_contact(%L)',:'k'),'P0002','no contact after suspension');
select pg_temp.expect_state(format('select public.get_trip_destination(%L)',:'k'),'P0002','no destination after suspension');
select pg_temp.amb_step(:'k','destination_reached');
select pg_temp.assert_true(pg_temp.amb_substate(:'k')='completed/destination_reached'
 and (select count(*)=1 from public.booking_exceptions where booking_id=:'k' and kind='closed_while_ineligible' and status='open'),'closed while ineligible is recorded');
update public.providers set status='active' where id=pg_temp.amb_provider();
select pg_temp.amb_retire(:'k',27);
-- Past end_at + 12 h with the patient on board.
select pg_temp.amb_trip(pg_temp.p5_at(11),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as i \gset
select pg_temp.amb_live(:'i');
select pg_temp.amb_step(:'i','en_route','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'i','arrived','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'i','picked_up','c1000000-0000-4000-8000-000000000003');
select pg_temp.p5_shift(:'i',now()-interval '30 hours');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''arrived'',''c1000000-0000-4000-8000-000000000003'')',:'i'),'42501','outside the window only closing steps are open');
select pg_temp.amb_step(:'i','destination_reached','c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(pg_temp.amb_substate(:'i')='completed/destination_reached','closeout after end_at + 12 h');

-- 033-10 absence: support decides; the operator cannot mark no_show.
select pg_temp.amb_trip(pg_temp.p5_at(12)) as a \gset
select pg_temp.amb_live(:'a');
select pg_temp.amb_step(:'a','en_route');
select pg_temp.amb_step(:'a','arrived');
select pg_temp.amb_step(:'a','absence');
select pg_temp.assert_true(pg_temp.amb_substate(:'a')='confirmed/absence_reported'
 and (select count(*)=0 from public.booking_assignments where booking_id=:'a' and status='active')
 and (select count(*)=1 from public.booking_exceptions where booking_id=:'a' and kind='absence_reported' and status='open'),'absence keeps confirmed, ends the assignment, opens the exception');
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''interrupt'',''c1000000-0000-4000-8000-000000000002'',''driver_unable'')',:'a'),'42501','driver has no authority after reporting absence');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,7,''patient_request'')',:'a'),'55000','no cancel after absence');
select pg_temp.expect_state(format('select pg_temp.p5_step(%L,''c1000000-0000-4000-8000-000000000001'',''no_show'',''no_show_confirmed'')',:'a'),'55000','scheduler cannot set no_show');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,7,''no_show'',''no_show_confirmed'',gen_random_uuid())',:'a'),'42501','no booking:incident');
select set_config('request.jwt.claims',json_build_object('sub','c1000000-0000-4000-8000-000000000005','aal','aal1')::text,true);
select pg_temp.expect_state(format('select public.ops_close_booking(%L,7,''no_show'',''no_show_confirmed'',gen_random_uuid())',:'a'),'42501','ops without AAL2');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_close_booking(:'a',7,'no_show','no_show_confirmed',gen_random_uuid());
select pg_temp.assert_true(pg_temp.amb_substate(:'a')='no_show/absence_reported'
 and (select resolution='no_show_confirmed' and resolved_by_profile_id='c1000000-0000-4000-8000-000000000005' from public.booking_exceptions where booking_id=:'a'),
 'ops confirms no_show; substate stays the last driver milestone');
select pg_temp.amb_retire(:'a',33);
select pg_temp.amb_trip(pg_temp.p5_at(13),'c6000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000004') as a2 \gset
select pg_temp.amb_live(:'a2');
select pg_temp.amb_step(:'a2','en_route','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'a2','arrived','c1000000-0000-4000-8000-000000000003');
select pg_temp.amb_step(:'a2','absence','c1000000-0000-4000-8000-000000000003');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_close_booking(:'a2',7,'interrupted','absence_disputed',gen_random_uuid());
select pg_temp.assert_true(pg_temp.amb_substate(:'a2')='interrupted/absence_reported'
 and (select resolution='absence_disputed' from public.booking_exceptions where booking_id=:'a2'),'ops disputes the absence');
select pg_temp.amb_retire(:'a2',36);

-- Membership removed on board: closeout refused; ops closes because nobody can.
select pg_temp.amb_trip(pg_temp.p5_at(14)) as l \gset
select pg_temp.amb_live(:'l');
select pg_temp.amb_step(:'l','en_route');
select pg_temp.amb_step(:'l','arrived');
select pg_temp.amb_step(:'l','picked_up');
update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000002' and organization_id='c8000000-0000-4000-8000-000000000001';
select pg_temp.expect_state(format('select pg_temp.amb_step(%L,''destination_reached'')',:'l'),'42501','closeout refused without membership');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_close_booking(:'l',7,'interrupted','ops_closeout',gen_random_uuid());
select pg_temp.assert_true(pg_temp.amb_substate(:'l')='interrupted/picked_up','ops closes; substate untouched');
update public.organization_members set status='active' where profile_id='c1000000-0000-4000-8000-000000000002' and organization_id='c8000000-0000-4000-8000-000000000001';
select pg_temp.amb_retire(:'l',39);
\echo 1..1
\echo ok 1 - 053_amb_progress
rollback;
