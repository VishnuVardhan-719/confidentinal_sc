-- Synthetic rollback-only DC clinical-core fixtures (design A9). DB NOT EXECUTED.
-- Loads _p5d_fixture.inc, which loads _b01_fixture.inc and _p5s_fixture.inc; none is edited here.
-- Include after _tap_helpers.inc. Actors (pg_temp.dc_actor): P b1..01 (patient b2..01), M c1..01
-- owner/scheduler of organisation A, W1 c1..02 and W2 c1..03 Q06-approved doctors of A's doctor
-- provider c3..01 (resources c6..01, c6..02), O c1..05 ops org:A, OG c1..06 ops global, X c1..09.
\ir _p5d_fixture.inc

-- The shared fixture already turned every gate on; this keeps the intent explicit.
update booking_private.feature_gates set state='on' where key='doctor_clinical' and state<>'on';

create function pg_temp.dc_actor(n text) returns uuid language sql immutable as $$
 select (case n when 'P' then 'b1000000-0000-4000-8000-000000000001' when 'M' then 'c1000000-0000-4000-8000-000000000001'
  when 'W1' then 'c1000000-0000-4000-8000-000000000002' when 'W2' then 'c1000000-0000-4000-8000-000000000003'
  when 'O' then 'c1000000-0000-4000-8000-000000000005' when 'OG' then 'c1000000-0000-4000-8000-000000000006'
  when 'X' then 'c1000000-0000-4000-8000-000000000009' end)::uuid;
$$;
create function pg_temp.dc_as(n text) returns void language sql as $$ select pg_temp.as_user(pg_temp.dc_actor(n)); $$;

-- Like expect_state, and the message must match too (clinical codes share 22023 and 55000).
create function pg_temp.dc_expect(statement text,expected_state text,expected_message text,label text) returns void language plpgsql as $$
declare st text; msg text; begin
 begin execute statement; exception when others then
  get stacked diagnostics st=returned_sqlstate, msg=message_text;
  if st=expected_state and msg=expected_message then return; end if;
  raise exception 'FAIL: %, expected % %, got % %',label,expected_state,expected_message,st,msg;
 end;
 raise exception 'FAIL: %, unexpectedly succeeded',label;
end $$;

-- Accepts one visit for doctor n on day +2 (booking version 4). Run as the fixture owner, and
-- accept every visit of a suite before moving any: a visit moved into the past makes its
-- doctor busy for new accepts (shared reservation guard).
create function pg_temp.dc_book(n text,p_slot integer) returns uuid language sql as $$
 select pg_temp.p5_book('doctor',pg_temp.p5_at(2,p_slot),array[(select id from public.resources where person_profile_id=pg_temp.dc_actor(n))]);
$$;
-- Moves a visit into the assignee window. Slots are 90 minutes apart; visits last 30 minutes.
create function pg_temp.dc_move(p_booking uuid,p_slot integer) returns void language sql as $$
 select pg_temp.p5_shift(p_booking,now()+interval '10 minutes'-p_slot*interval '90 minutes');
$$;
-- Drives a moved visit to service_started (booking version 8) as doctor n; the patient issues the code.
create function pg_temp.dc_start(p_booking uuid,n text) returns void language sql as $$
 select pg_temp.to_started(p_booking,pg_temp.dc_actor(n));
$$;
create function pg_temp.dc_complete(p_booking uuid,n text) returns integer language plpgsql as $$
begin perform pg_temp.dc_as(n); return public.advance_visit(p_booking,'service_completed',8,gen_random_uuid()); end $$;

-- A complete record a doctor may sign: normal vitals, one allergy that does not match the one
-- prescription line, one test.
create function pg_temp.dc_content() returns jsonb language sql immutable as $$
 select '{
  "vitals": {"temperature": {"value": 37.0, "unit": "C"}, "systolic": 120, "diastolic": 80, "pulse_bpm": 78, "spo2_pct": 98, "resp_rate": 16},
  "examination": {"chief_complaint": "Synthetic cough", "symptom_duration": "3 days", "findings": "Synthetic chest clear"},
  "assessment": {"summary": "Synthetic viral illness", "certainty": "provisional",
   "diagnoses": [{"label": "Synthetic upper respiratory infection", "certainty": "probable"}], "outcome": "follow_up"},
  "allergies": {"status": "recorded", "items": [{"substance": "Penicillin", "reaction": "Synthetic rash"}]},
  "prescription": {"status": "prescribed", "items": [{"medication_name": "Paracetamol", "form": "tablet", "strength": "500 mg",
   "dose": "1 tablet", "route": "oral", "frequency": "three_times_daily", "duration_days": 3, "quantity": 9}]},
  "plan": {"advice": "Synthetic rest and fluids", "follow_up_on": "2026-12-01", "tests": [{"name": "Synthetic CBC"}]}
 }'::jsonb;
$$;
-- A signable record with no medicine and an undetermined assessment.
create function pg_temp.dc_minimal() returns jsonb language sql immutable as $$
 select '{"examination": {"findings": "Synthetic findings"},
  "assessment": {"summary": "Synthetic uncertain picture", "certainty": "undetermined", "outcome": "follow_up"},
  "allergies": {"status": "none_known"}, "prescription": {"status": "none_indicated"}}'::jsonb;
$$;

create function pg_temp.dc_save(p_booking uuid,n text,p_version integer,p_content jsonb default null) returns integer language plpgsql as $$
begin perform pg_temp.dc_as(n); return public.save_clinical_draft(p_booking,p_version,coalesce(p_content,pg_temp.dc_content()),gen_random_uuid()); end $$;
create function pg_temp.dc_sign(p_booking uuid,n text,p_version integer) returns uuid language plpgsql as $$
begin perform pg_temp.dc_as(n); return public.sign_clinical_record(p_booking,p_version,true,true,gen_random_uuid()); end $$;
create function pg_temp.dc_draft_version(p_booking uuid) returns integer language sql as $$
 select version from clinical_private.consultations where booking_id=p_booking $$;
create function pg_temp.dc_events(p_booking uuid) returns bigint language sql as $$
 select (select count(*) from public.booking_events where booking_id=p_booking)
  +(select count(*) from public.notification_outbox where booking_id=p_booking) $$;
create function pg_temp.dc_audits(p_action text,p_target uuid) returns bigint language sql as $$
 select count(*) from public.audit_events where action=p_action and target_id=p_target $$;
