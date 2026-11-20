\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5a_fixture.inc
-- P5 ambulance gate phases (contract §10.1, §10.4) and keyed replay after every
-- assignment-ending command (contract §13.3). Authored, DB NOT EXECUTED.
select public_reference as amb_ref from public.providers where id='c3000000-0000-4000-8000-000000000003' \gset
select set_config('p5a.ref',:'amb_ref',true);

-- §10.4 per gate state: admission only when on; decline, cancel and reads in every state;
-- each change writes one feature_gate_events row.
do $$ declare st text; b1 uuid; b2 uuid; n integer; d integer:=1; begin
 foreach st in array array['on','off','suspended'] loop
  d:=d+1;
  update booking_private.feature_gates set state='on' where key='ambulance' and state<>'on';
  b1:=pg_temp.amb_request(pg_temp.p5_at(d));
  b2:=pg_temp.amb_request(pg_temp.p5_at(d,2));
  select count(*) into n from booking_private.feature_gate_events where key='ambulance';
  if st<>'on' then
   update booking_private.feature_gates set state=st where key='ambulance';
   perform pg_temp.assert_true((select count(*) from booking_private.feature_gate_events where key='ambulance')=n+1
    and (select to_state from booking_private.feature_gate_events where key='ambulance' order by changed_at desc,version desc limit 1)=st,st||': one gate event');
   perform pg_temp.expect_state(format('select pg_temp.amb_request(%L)',pg_temp.p5_at(d,4)),'55000',st||': request refused');
   perform pg_temp.expect_state(format('select pg_temp.amb_accept(%L)',b1),'55000',st||': accept refused');
   perform pg_temp.assert_true((select count(*) from public.list_transport_slots(current_setting('p5a.ref'),pg_temp.amb_service(),(pg_temp.p5_at(d) at time zone 'Asia/Kolkata')::date,'seated'))=0,st||': no slots');
  else
   perform pg_temp.assert_true(pg_temp.amb_accept(b1)=4,'on: accept');
  end if;
  perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true((public.get_trip(b1))->>'booking_id'=b1::text,st||': patient read');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true((public.get_trip(b2))->>'booking_id'=b2::text,st||': scheduler read');
  perform pg_temp.assert_true(public.decline_booking(b2,2,'provider_unavailable')=3,st||': decline');
  perform pg_temp.assert_true(public.cancel_booking(b1,(select version from public.bookings where id=b1),'provider_unavailable')>0,st||': cancel');
 end loop;
 update booking_private.feature_gates set state='on' where key='ambulance';
end $$;
select pg_temp.assert_true(not has_table_privilege('authenticated','booking_private.feature_gates','SELECT,UPDATE')
 and not has_table_privilege('service_role','booking_private.feature_gates','SELECT,UPDATE'),'gates closed to API roles');

-- §13.3 replay after assignment-ending commands, by the same driver, after their authority ends.
create function pg_temp.replay_checks(p_booking uuid,p_step text,p_reason text,p_version integer,p_key uuid,p_result jsonb,p_label text) returns void language plpgsql as $$
declare n integer:=pg_temp.amb_events(p_booking); begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 perform pg_temp.assert_true(public.advance_trip(p_booking,p_step,p_version,p_key,p_reason)=p_result and pg_temp.amb_events(p_booking)=n,p_label||': same key and arguments replay');
 perform pg_temp.expect_state(format('select public.advance_trip(%L,%L,%s,%L,%L)',p_booking,p_step,p_version+1,p_key,p_reason),'40001',p_label||': same key, changed version');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
 perform pg_temp.expect_state(format('select public.advance_trip(%L,%L,%s,%L,%L)',p_booking,p_step,p_version,p_key,p_reason),'42501',p_label||': another actor with the key is a new call');
 -- Membership revoked, Q06 case expired, gate suspended: the replay still answers.
 update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000002' and organization_id='c8000000-0000-4000-8000-000000000001';
 update public.staff_credential_documents set expires_at=now()-interval '1 second'
  where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.amb_provider() and subject_profile_id='c1000000-0000-4000-8000-000000000002');
 update booking_private.feature_gates set state='suspended' where key='ambulance';
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 perform pg_temp.assert_true(public.advance_trip(p_booking,p_step,p_version,p_key,p_reason)=p_result,p_label||': replay after authority ends');
 update booking_private.feature_gates set state='on' where key='ambulance';
 update public.staff_credential_documents set expires_at=now()+interval '1 year'
  where case_id=(select id from public.provider_verification_cases where provider_id=pg_temp.amb_provider() and subject_profile_id='c1000000-0000-4000-8000-000000000002');
 update public.organization_members set status='active' where profile_id='c1000000-0000-4000-8000-000000000002' and organization_id='c8000000-0000-4000-8000-000000000001';
 perform pg_temp.assert_true(pg_temp.amb_events(p_booking)=n,p_label||': replays wrote no event');
end $$;

-- Completion.
select pg_temp.amb_trip(pg_temp.p5_at(6)) as t1 \gset
select pg_temp.amb_live(:'t1');
select pg_temp.amb_step(:'t1','en_route');
select pg_temp.amb_step(:'t1','arrived');
select pg_temp.amb_step(:'t1','picked_up');
select gen_random_uuid() as k1 \gset
select pg_temp.amb_step(:'t1','destination_reached','c1000000-0000-4000-8000-000000000002',null,:'k1') as r1 \gset
select pg_temp.replay_checks(:'t1','destination_reached',null,7,:'k1',:'r1'::jsonb,'destination_reached');
select pg_temp.amb_retire(:'t1',3);

-- Interruption before pickup.
select pg_temp.amb_trip(pg_temp.p5_at(7)) as t2 \gset
select pg_temp.amb_live(:'t2');
select pg_temp.amb_step(:'t2','en_route');
select gen_random_uuid() as k2 \gset
select pg_temp.amb_step(:'t2','interrupt','c1000000-0000-4000-8000-000000000002','vehicle_breakdown',:'k2') as r2 \gset
select pg_temp.replay_checks(:'t2','interrupt','vehicle_breakdown',5,:'k2',:'r2'::jsonb,'interrupt before pickup');
select pg_temp.amb_retire(:'t2',6);

-- Interruption on board (also opens the blocking exception once).
select pg_temp.amb_trip(pg_temp.p5_at(8)) as t3 \gset
select pg_temp.amb_live(:'t3');
select pg_temp.amb_step(:'t3','en_route');
select pg_temp.amb_step(:'t3','arrived');
select pg_temp.amb_step(:'t3','picked_up');
select gen_random_uuid() as k3 \gset
select pg_temp.amb_step(:'t3','interrupt','c1000000-0000-4000-8000-000000000002','requirement_mismatch',:'k3') as r3 \gset
select pg_temp.replay_checks(:'t3','interrupt','requirement_mismatch',7,:'k3',:'r3'::jsonb,'interrupt on board');
select pg_temp.assert_true((select count(*)=1 from public.booking_exceptions where booking_id=:'t3' and kind='interrupted_after_pickup'),'replays opened no second exception');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select public.ops_resolve_exception((select id from public.booking_exceptions where booking_id=:'t3' and kind='interrupted_after_pickup'),1,'resolved',gen_random_uuid());
select pg_temp.amb_retire(:'t3',9);

-- Absence, and a retry after the later ops step.
select pg_temp.amb_trip(pg_temp.p5_at(9)) as t4 \gset
select pg_temp.amb_live(:'t4');
select pg_temp.amb_step(:'t4','en_route');
select pg_temp.amb_step(:'t4','arrived');
select gen_random_uuid() as k4 \gset
select pg_temp.amb_step(:'t4','absence','c1000000-0000-4000-8000-000000000002',null,:'k4') as r4 \gset
select pg_temp.replay_checks(:'t4','absence',null,6,:'k4',:'r4'::jsonb,'absence');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select gen_random_uuid() as ko \gset
select public.ops_close_booking(:'t4',7,'no_show','no_show_confirmed',:'ko') as ov \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.advance_trip(:'t4','absence',6,:'k4')=:'r4'::jsonb,'absence replays after the ops close');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.assert_true(public.ops_close_booking(:'t4',7,'no_show','no_show_confirmed',:'ko')=:ov,'ops close replays on the ambulance booking');
select pg_temp.amb_retire(:'t4',12);
\echo 1..1
\echo ok 1 - 055_amb_gates_replay
rollback;
