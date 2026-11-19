-- Synthetic rollback-only P5 doctor fixtures (contract §2.3). Extends the shared
-- _p5s_fixture.inc, which itself extends _b01_fixture.inc; neither is edited here.
-- Include after _tap_helpers.inc. Actors from _b01_fixture.inc: patient ...01,
-- owner-doctor/scheduler ...02, outsider ...03, reviewer ...04, unrelated staff ...05.
\ir _p5s_fixture.inc

-- The doctor gate is off by default (OD-5). Owner context, as §7.5 does for built suites.
update booking_private.feature_gates set state='on' where key='doctor' and state<>'on';

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',json_build_object('sub',u)::text,true); end $$;
-- Requested by the patient, accepted by the owner-doctor; returns the booking at version 4.
create function pg_temp.new_visit(slot integer) returns uuid language plpgsql as $$
declare booking uuid; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 booking:=public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',
  date_trunc('day',now())+interval '2 days 4 hours'+slot*interval '1 hour',gen_random_uuid());
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform public.accept_booking(booking,2,array['b6000000-0000-4000-8000-000000000001'::uuid]);
 return booking;
end $$;
-- Owner-only move of the booking window into the assignee window, as 011 does. Assignment
-- and reservation ranges stay two days ahead, so the resource is never busy or overdue here.
create function pg_temp.move_into_window(booking uuid) returns void language plpgsql as $$ begin
 alter table public.bookings disable trigger b01_booking_guard;
 update public.bookings set start_at=now()+interval '10 minutes',end_at=now()+interval '40 minutes' where id=booking;
 alter table public.bookings enable trigger b01_booking_guard;
end $$;
-- Backdates one booking's arrival codes so cooldown and expiry run in one transaction.
create function pg_temp.age_codes(booking uuid,by_interval interval) returns void language plpgsql as $$ begin
 alter table doctor_private.arrival_challenges disable trigger p5d_challenge_guard;
 update doctor_private.arrival_challenges set issued_at=issued_at-by_interval,expires_at=expires_at-by_interval where booking_id=booking;
 alter table doctor_private.arrival_challenges enable trigger p5d_challenge_guard;
end $$;
create function pg_temp.set_gate(state text) returns void language sql as $$
 update booking_private.feature_gates set state=$1 where key='doctor' and state<>$1;
$$;
create function pg_temp.sub(booking uuid) returns text language sql as $$ select substate from public.doctor_visits where booking_id=booking $$;
create function pg_temp.state(booking uuid) returns text language sql as $$ select state from public.bookings where id=booking $$;
create function pg_temp.events(booking uuid) returns bigint language sql as $$ select count(*) from public.booking_events where booking_id=booking $$;
