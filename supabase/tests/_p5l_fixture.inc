-- Synthetic rollback-only P5 lab fixtures. Include after _b01_fixture.inc and _p5s_fixture.inc.
-- Reuses organisation A's lab provider (pg_temp.p5_provider('lab')) and its one service
-- (pg_temp.p5_service('lab'); adding a second lab service of A would make that helper
-- ambiguous). Workers W1 and W2 already pass Q06 for the lab provider through the public path.
--  b1..01 patient P (patient b2..01, address b5..01, PIN 599991)
--  c1..01 M scheduler/owner   c1..02 W1 technician (resource c6..01)   c1..03 W2 (c6..02)
--  c1..05 O ops org:A          c1..06 OG ops global                     c1..07 MB owner of org B
--  c1..08 WB staff of org B (resource c9600000..08, not eligible)        c1..09 X outsider
--  c9..01 U staff of org A, provider:read, no Q06 case (resource c9600000..01, has availability)
--  c9..02 Q a second patient (patient c9200000..02)
reset role;
-- LAB-Q11: home collection in the approved public snapshot. The snapshot is frozen at
-- approval, so the fixture rebuilds it once with the snapshot trigger off.
insert into public.lab_profiles(provider_id,home_collection) values (pg_temp.p5_provider('lab'),true);
alter table public.providers disable trigger i02h_public_snapshot;
update public.providers set published_profile=providers_private.build_public_snapshot(id,category) where id=pg_temp.p5_provider('lab');
alter table public.providers enable trigger i02h_public_snapshot;
-- LAB-Q04 staging proposal: lead 120 min, horizon 30 days, before 30 min, after 90 min.
insert into public.lab_policy_versions(id,version,lead_minutes,horizon_days,before_buffer_minutes,after_buffer_minutes,status)
 values ('c7000000-0000-4000-8000-000000000001',1,120,30,30,90,'published');
-- The lab test through the public command: venous blood, EDTA and serum, 8 h fasting.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.set_lab_test(pg_temp.p5_service('lab'),'venous_blood',array['edta','serum'],8,'fasting',0,'c7100000-0000-4000-8000-000000000001');
reset role;
insert into auth.users(id,email) values
 ('c9000000-0000-4000-8000-000000000001','p5l-unverified@example.invalid'),
 ('c9000000-0000-4000-8000-000000000002','p5l-patient-q@example.invalid');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('c8000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','staff','active',now(),array['provider:read']);
insert into public.resources(id,kind,person_profile_id) values
 ('c9600000-0000-4000-8000-000000000001','person','c9000000-0000-4000-8000-000000000001'),
 ('c9600000-0000-4000-8000-000000000008','person','c1000000-0000-4000-8000-000000000008');
insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
 select pg_temp.p5_provider('lab'),'c9600000-0000-4000-8000-000000000001',d,'00:00','23:59',current_date-2,current_date+365 from generate_series(0,6) d;
insert into public.patients(id,self_profile_id) values ('c9200000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000002');
insert into public.consent_events(id,actor_profile_id,patient_id,purpose,policy_version,decision) values
 ('c9210000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000002','c9200000-0000-4000-8000-000000000002','self_patient_access','synthetic-v1','granted');
insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
 select 'c9200000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000002',s,'c9210000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000002'
 from unnest(array['booking:read','booking:create','profile:read','profile:write']) s;

-- Helpers. All run as the fixture owner; claims select the acting profile.
create function pg_temp.lab_v(p_booking uuid) returns integer language sql as $$ select version from public.bookings where id=p_booking; $$;
create function pg_temp.lab_sub(p_booking uuid) returns text language sql as $$ select substate from public.lab_orders where booking_id=p_booking; $$;
create function pg_temp.lab_state(p_booking uuid) returns text language sql as $$ select state from public.bookings where id=p_booking; $$;
create function pg_temp.lab_res(p_booking uuid) returns text language sql as $$
 select string_agg(distinct rr.status,',') from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=p_booking; $$;
create function pg_temp.lab_active(p_booking uuid) returns integer language sql as $$
 select count(*)::integer from public.booking_assignments where booking_id=p_booking and status='active'; $$;
-- Patient P requests the lab test through the lab command (fresh key).
create function pg_temp.lab_create(p_start timestamptz,p_ack boolean default true) returns uuid language plpgsql as $$
begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 return public.create_lab_booking_request('b2000000-0000-4000-8000-000000000001',pg_temp.p5_service('lab'),'b5000000-0000-4000-8000-000000000001',p_start,p_ack,gen_random_uuid());
end $$;
-- Scheduler M accepts with one technician resource (fresh key, current version).
create function pg_temp.lab_accept(p_booking uuid,p_resource uuid default 'c6000000-0000-4000-8000-000000000001') returns integer language plpgsql as $$
begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 return public.accept_lab_booking(p_booking,pg_temp.lab_v(p_booking),p_resource,gen_random_uuid());
end $$;
create function pg_temp.lab_book(p_start timestamptz,p_resource uuid default 'c6000000-0000-4000-8000-000000000001') returns uuid language plpgsql as $$
declare b uuid:=pg_temp.lab_create(p_start); begin perform pg_temp.lab_accept(b,p_resource); return b; end $$;
-- A technician step with the current version and a fresh key.
create function pg_temp.lab_step(p_booking uuid,p_actor uuid,p_step text,p_failure text default null) returns integer language plpgsql as $$
begin
 perform pg_temp.as_user(p_actor);
 return public.advance_lab_order(p_booking,p_step,pg_temp.lab_v(p_booking),p_failure,gen_random_uuid());
end $$;
-- SQL text for expect_state: a step with the current version (or p_version) and a fresh key.
create function pg_temp.step_sql(p_booking uuid,p_step text,p_failure text default null,p_version integer default null) returns text language sql as $$
 select format('select public.advance_lab_order(%L,%L,%s,%L,%L)',p_booking,p_step,coalesce(p_version,pg_temp.lab_v(p_booking)),p_failure,gen_random_uuid()); $$;
create function pg_temp.cancel_sql(p_booking uuid,p_reason text default 'other') returns text language sql as $$
 select format('select public.cancel_booking(%L,%s,%L)',p_booking,pg_temp.lab_v(p_booking),p_reason); $$;
-- Accepted on day p_day and moved so that p_start is its start (default: started 10 minutes ago).
-- Close one live booking of a resource before moving another into an overlapping period.
create function pg_temp.lab_live(p_resource uuid default 'c6000000-0000-4000-8000-000000000001',p_start timestamptz default now()-interval '10 minutes',p_day integer default 1) returns uuid language plpgsql as $$
declare b uuid:=pg_temp.lab_book(pg_temp.p5_at(p_day),p_resource); begin perform pg_temp.p5_shift(b,p_start); return b; end $$;
-- Collection started and sample collected by the technician who owns p_resource.
create function pg_temp.lab_collected(p_resource uuid default 'c6000000-0000-4000-8000-000000000001',p_start timestamptz default now()-interval '10 minutes',p_day integer default 1) returns uuid language plpgsql as $$
declare b uuid:=pg_temp.lab_live(p_resource,p_start,p_day); tech uuid:=(select person_profile_id from public.resources where id=p_resource); begin
 perform pg_temp.lab_step(b,tech,'start_collection');
 perform pg_temp.lab_step(b,tech,'collected');
 return b;
end $$;
