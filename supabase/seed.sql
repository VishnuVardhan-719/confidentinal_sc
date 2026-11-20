-- Synthetic LOCAL development seed (R-6). Loaded only by `npx supabase db reset` (config.toml [db.seed]).
-- Every person, email, phone, address and PIN here is fictional. Never load this file into a shared or
-- production database: it creates accounts with a published demo password (docs/HANDOFF_FRONTEND.md §2).
-- Mirrors supabase/tests/_b01_fixture.inc, which the booking suites prove is searchable and bookable.
do $$ begin
  if exists (select 1 from auth.users) then
    raise exception 'seed.sql is for an empty local database only (auth.users is not empty)';
  end if;
end $$;

-- Accounts. Password for all: SureCure-local-demo-1 (local only).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('SureCure-local-demo-1', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'patient@seed.example.invalid'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, 'doctor.one@seed.example.invalid'),
  ('d1000000-0000-4000-8000-000000000003'::uuid, 'doctor.two@seed.example.invalid'),
  ('d1000000-0000-4000-8000-000000000004'::uuid, 'reviewer@seed.example.invalid')
) as u(id, email);
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like '%@seed.example.invalid';

-- i01 provisions public.profiles on auth.users insert.
update public.profiles p set display_name = v.name
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'Asha Demo'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, 'Dr. Ravi Demo'),
  ('d1000000-0000-4000-8000-000000000003'::uuid, 'Dr. Meena Demo'),
  ('d1000000-0000-4000-8000-000000000004'::uuid, 'Reviewer Demo')
) as v(id, name) where p.id = v.id;

-- Patient with self access and one address.
insert into public.patients (id, self_profile_id) values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001');
insert into public.consent_events (id, actor_profile_id, patient_id, purpose, policy_version, decision) values
  ('d2100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
   'self_patient_access', 'synthetic-v1', 'granted');
insert into public.patient_access (patient_id, grantee_profile_id, scope, consent_event_id, granted_by)
select 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', s,
  'd2100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'
from unnest(array['booking:read', 'booking:create', 'profile:read', 'profile:write']) s;
insert into public.pin_directory (pin_code, state, district, city, source_reference) values
  ('599991', 'Synthetic', 'Synthetic North', 'Demo City', 'R-6 local seed'),
  ('599992', 'Synthetic', 'Synthetic South', 'Demo City', 'R-6 local seed');
insert into public.patient_addresses (id, patient_id, line1, locality, pin_code, contact_name, phone) values
  ('d5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '12 Demo Street, Flat 3', 'Demo Nagar',
   '599991', 'Asha Demo', '+919999900001');

-- Two approved individual doctors, each with a verified registration document, one published visit,
-- a price, coverage of both demo PINs, a person resource and a 09:00-18:00 IST weekly schedule.
insert into public.providers (id, individual_owner_profile_id, category, status, verification_state) values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'doctor', 'active', 'approved'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000003', 'doctor', 'active', 'approved');
insert into public.provider_profiles (provider_id, display_name) values
  ('d3000000-0000-4000-8000-000000000001', 'Dr. Ravi Demo (General Physician)'),
  ('d3000000-0000-4000-8000-000000000002', 'Dr. Meena Demo (Paediatrics)');
insert into public.provider_documents (id, provider_id, owner_profile_id, kind, object_name, content_type, status, expires_at)
select ('d310000' || n || '-0000-4000-8000-000000000001')::uuid, ('d3000000-0000-4000-8000-00000000000' || n)::uuid,
  ('d1000000-0000-4000-8000-00000000000' || (n + 1))::uuid, 'registration',
  'd3000000-0000-4000-8000-00000000000' || n || '/d310000' || n || '-0000-4000-8000-000000000001.pdf',
  'application/pdf', 'verified', now() + interval '1 year'
from generate_series(1, 2) n;
insert into storage.objects (bucket_id, name)
select 'provider-verification', object_name from public.provider_documents
where provider_id in ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002');
insert into public.service_catalog_types (id, code, category, name, unit) values
  ('d4000000-0000-4000-8000-000000000001', 'doctor_home_visit', 'doctor', 'Doctor home visit', 'visit');
insert into public.services (id, provider_id, category, catalog_type_id, title, duration_minutes, status) values
  ('d4100000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'doctor', 'd4000000-0000-4000-8000-000000000001',
   'General physician home visit', 30, 'published'),
  ('d4100000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002', 'doctor', 'd4000000-0000-4000-8000-000000000001',
   'Child health home visit', 45, 'published');
insert into public.service_price_versions (id, service_id, catalog_type_id, version, amount_paise, unit, terms_version, effective_from) values
  ('d4200000-0000-4000-8000-000000000001', 'd4100000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
   1, 60000, 'visit', 'synthetic-v1', now() - interval '1 day'),
  ('d4200000-0000-4000-8000-000000000002', 'd4100000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001',
   1, 80000, 'visit', 'synthetic-v1', now() - interval '1 day');
insert into public.provider_service_areas (provider_id, pin_code, proposed_by, status, approved_by, approved_at, valid_from, valid_to)
select p.id, pin, p.individual_owner_profile_id, 'approved', 'd1000000-0000-4000-8000-000000000004', now(),
  now() - interval '1 day', now() + interval '6 months'
from public.providers p cross join (values ('599991'), ('599992')) as pins(pin)
where p.id in ('d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002');
insert into public.resources (id, kind, person_profile_id) values
  ('d6000000-0000-4000-8000-000000000001', 'person', 'd1000000-0000-4000-8000-000000000002'),
  ('d6000000-0000-4000-8000-000000000002', 'person', 'd1000000-0000-4000-8000-000000000003');
insert into public.availability_rules (provider_id, resource_id, weekday, local_start, local_end, effective_from, effective_to)
select ('d3000000-0000-4000-8000-00000000000' || n)::uuid, ('d6000000-0000-4000-8000-00000000000' || n)::uuid, d,
  '09:00', '18:00', current_date, current_date + 365
from generate_series(1, 2) n cross join generate_series(0, 6) d;

-- Local demo only: open the doctor gate so the booking flow works end to end. Lab, ambulance and
-- caretaker stay off (OD-5 keeps every gate off in migrations; this file never runs in production).
update booking_private.feature_gates set state = 'on' where key = 'doctor';
