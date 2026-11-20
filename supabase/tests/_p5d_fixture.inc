-- Synthetic rollback-only P5 doctor fixtures (contract §2.3). Loads the base B01 fixture, then
-- the shared _p5s_fixture.inc (which requires _b01 first); neither is edited here.
-- Include after _tap_helpers.inc. Actors from _b01_fixture.inc: patient ...01,
-- owner-doctor/scheduler ...02, outsider ...03, reviewer ...04, unrelated staff ...05.
-- From _p5s_fixture.inc: organisation A (c8..01) owns doctor provider c3..01 (service c4..01);
-- M c1..01 owner/scheduler, W1 c1..02 and W2 c1..03 Q06-approved staff (resources c6..01,
-- c6..02), O c1..05 ops org:A, OG c1..06 ops global, MB c1..07, WB c1..08 (organisation B),
-- X c1..09 outsider. pg_temp.as_user(uuid) (aal2 claims), p5_book, p5_shift, p5_at come from it.
\ir _b01_fixture.inc
\ir _p5s_fixture.inc

-- The shared fixture turns every gate on, including doctor_arrival_fallback; suites that need
-- another state set it explicitly with pg_temp.set_gate.
update booking_private.feature_gates set state='on' where key='doctor' and state<>'on';

-- Requested by the B01 patient, accepted by the B01 owner-doctor; returns the booking at version 4.
create function pg_temp.new_visit(slot integer) returns uuid language plpgsql as $$
declare booking uuid; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 booking:=public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',
  date_trunc('day',now())+interval '2 days 4 hours'+slot*interval '1 hour',gen_random_uuid());
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform public.accept_booking(booking,2,array['b6000000-0000-4000-8000-000000000001'::uuid]);
 return booking;
end $$;
-- Moves one B01 visit into the assignee window. Uses the shared shift helper, so assignment and
-- reservation ranges move with the booking (review P5-18). Slots are 40 minutes apart (30-minute
-- visits, no buffer), from now+50 min backwards, so up to 17 visits of one doctor never overlap.
create function pg_temp.move_into_window(booking uuid,slot integer default 0) returns void language plpgsql as $$ begin
 perform pg_temp.p5_shift(booking,now()+interval '50 minutes'-slot*interval '40 minutes');
end $$;
-- Backdates one booking's arrival codes so cooldown and expiry run in one transaction.
create function pg_temp.age_codes(booking uuid,by_interval interval) returns void language plpgsql as $$ begin
 alter table doctor_private.arrival_challenges disable trigger p5d_challenge_guard;
 update doctor_private.arrival_challenges set issued_at=issued_at-by_interval,expires_at=expires_at-by_interval where booking_id=booking;
 alter table doctor_private.arrival_challenges enable trigger p5d_challenge_guard;
end $$;
create function pg_temp.set_gate(state text,gate text default 'doctor') returns void language sql as $$
 update booking_private.feature_gates set state=$1 where key=$2 and state<>$1;
$$;
create function pg_temp.sub(booking uuid) returns text language sql as $$ select substate from public.doctor_visits where booking_id=booking $$;
create function pg_temp.state(booking uuid) returns text language sql as $$ select state from public.bookings where id=booking $$;
create function pg_temp.version(booking uuid) returns integer language sql as $$ select version from public.bookings where id=booking $$;
create function pg_temp.events(booking uuid) returns bigint language sql as $$ select count(*) from public.booking_events where booking_id=booking $$;
-- Runs one doctor visit to `arrived` as p_doctor (versions 4 -> 6) and, if p_patient is given,
-- issues a code as the patient; returns the code (null when not issued).
create function pg_temp.to_arrived(booking uuid,p_doctor uuid,p_patient uuid default null) returns text language plpgsql as $$
declare code text; begin
 perform pg_temp.as_user(p_doctor);
 perform public.advance_visit(booking,'en_route',4,gen_random_uuid());
 perform public.advance_visit(booking,'arrived',5,gen_random_uuid());
 if p_patient is not null then
  perform pg_temp.as_user(p_patient);
  code:=public.issue_arrival_code(booking,gen_random_uuid())->>'code';
  perform pg_temp.as_user(p_doctor);
 end if;
 return code;
end $$;
-- Runs one doctor visit to `service_started` (version 8) as p_doctor with the B01 patient's code.
create function pg_temp.to_started(booking uuid,p_doctor uuid) returns void language plpgsql as $$
declare code text:=pg_temp.to_arrived(booking,p_doctor,'b1000000-0000-4000-8000-000000000001'); begin
 perform public.verify_arrival_code(booking,code,6,gen_random_uuid());
 perform public.advance_visit(booking,'service_started',7,gen_random_uuid());
end $$;
-- Expires (or restores) one staff doctor's Q06 evidence for the doctor provider, as 022 does.
create function pg_temp.expire_case(p_profile uuid,p_expired boolean default true) returns void language plpgsql as $$ begin
 update public.staff_credential_documents set expires_at=case when p_expired then now()-interval '1 second' else now()+interval '1 year' end
  where case_id=(select id from public.provider_verification_cases where provider_id='c3000000-0000-4000-8000-000000000001' and subject_profile_id=p_profile);
end $$;
