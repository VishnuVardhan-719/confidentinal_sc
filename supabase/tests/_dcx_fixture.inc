-- Synthetic rollback-only DC-extras fixtures. DB NOT EXECUTED.
-- Include after _tap_helpers.inc. Loads _p5d_fixture.inc (which loads _b01 and _p5s); none of
-- them is edited here.
-- Actors: B01 patient P1 b1..01 (patient b2..01), B01 owner-doctor D1 b1..02 (provider b3..01,
-- resource b6..01), outsider b1..03; P5 org A doctor provider c3..01 with scheduler M c1..01,
-- staff doctors W1 c1..02 (resource c6..01) and W2 c1..03 (c6..02), outsider X c1..09.
-- Added here: second patient P2 e9..01 (patient e9..02) with a self grant.
\ir _p5d_fixture.inc

reset role;
insert into auth.users(id,email) values ('e9000000-0000-4000-8000-000000000001','dcx-patient-two@example.invalid');
insert into public.patients(id,self_profile_id) values ('e9000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000001');
insert into public.consent_events(id,actor_profile_id,patient_id,purpose,policy_version,decision) values
 ('e9000000-0000-4000-8000-000000000003','e9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','self_patient_access','synthetic-v1','granted');
insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
 select 'e9000000-0000-4000-8000-000000000002','e9000000-0000-4000-8000-000000000001',s,
 'e9000000-0000-4000-8000-000000000003','e9000000-0000-4000-8000-000000000001'
 from unnest(array['booking:read','booking:create','profile:read','profile:write']) s;

-- The B01 fixture turns every gate on, including the DC-extras gates that 002400 seeds off.
update booking_private.feature_gates set state='on' where key like 'doctor%' and state<>'on';

-- n B01 visits (patient P1, doctor D1), all accepted first (so a moved visit never makes D1
-- busy for the next accept), then moved into the window (slot k starts at now+50-40k min) and
-- driven to service_started (version 8). Slots 0 and 1 end in the future.
create function pg_temp.dcx_started(n integer) returns uuid[] language plpgsql as $$
declare ids uuid[]:='{}'; k integer; begin
 for k in 0..n-1 loop ids:=ids||pg_temp.new_visit(k); end loop;
 for k in 0..n-1 loop
  perform pg_temp.move_into_window(ids[k+1],k);
  perform pg_temp.to_started(ids[k+1],'b1000000-0000-4000-8000-000000000002');
 end loop;
 return ids;
end $$;
-- D1 completes one started visit (8 -> 9).
create function pg_temp.dcx_complete(b uuid) returns void language plpgsql as $$ begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform public.advance_visit(b,'service_completed',8,gen_random_uuid());
end $$;
