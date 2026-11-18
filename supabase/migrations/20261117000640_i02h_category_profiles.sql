-- I02 hardening item 5 (+ search part of item 4) / Kiro / integ/friend-backend.
-- Ports O-I02:78-135, 387-406, 1068-1092 onto F's names:
--  * per-category public detail tables keyed by (provider_id, category);
--  * a separate provider_private_details table (column-level split: registration,
--    permit and phone numbers are never in a public projection and are hidden from
--    provider:read-only members);
--  * a frozen allowlisted snapshot (providers.published_profile) written only by a
--    trigger when verification_state becomes approved and cleared when it leaves;
--  * search/get_public_provider return the public reference and the snapshot instead
--    of the internal provider UUID and live profile rows.
-- No clinical fields (Q09). Ambulance rows are scheduled-only by construction.
begin;

-- States in which the owner may edit onboarding data. Item 6 widens this to 'expired'.
create function providers_private.owner_editable(p_state text) returns boolean
language sql immutable set search_path = '' as $$ select p_state in ('draft','rejected'); $$;

create function providers_private.valid_labels(p_values text[], p_max integer) returns boolean
language sql immutable set search_path = '' as $$
  select p_values is not null and cardinality(p_values) <= p_max and array_position(p_values, null) is null
    and not exists (select 1 from unnest(p_values) v where char_length(btrim(v)) not between 1 and 80);
$$;

create table public.doctor_profiles (
  provider_id uuid primary key,
  category text not null default 'doctor' check (category = 'doctor'),
  specialty text check (char_length(btrim(specialty)) between 1 and 160),
  qualification text check (char_length(btrim(qualification)) between 1 and 160),
  languages text[] not null default '{}' check (providers_private.valid_labels(languages, 10)),
  years_experience smallint check (years_experience between 0 and 70),
  updated_at timestamptz not null default now(),
  foreign key (provider_id, category) references public.providers(id, category) on delete restrict
);
create table public.lab_profiles (
  provider_id uuid primary key,
  category text not null default 'lab' check (category = 'lab'),
  accreditation_label text check (char_length(btrim(accreditation_label)) between 1 and 160),
  home_collection boolean,
  updated_at timestamptz not null default now(),
  foreign key (provider_id, category) references public.providers(id, category) on delete restrict
);
create table public.ambulance_profiles (
  provider_id uuid primary key,
  category text not null default 'ambulance' check (category = 'ambulance'),
  fleet_types text[] not null default '{}'
    check (fleet_types <@ array['basic','patient_transfer']::text[] and providers_private.valid_labels(fleet_types, 2)),
  -- Emergency dispatch stays disabled in the schema.
  scheduled_only boolean not null default true check (scheduled_only),
  updated_at timestamptz not null default now(),
  foreign key (provider_id, category) references public.providers(id, category) on delete restrict
);
create table public.caretaker_profiles (
  provider_id uuid primary key,
  category text not null default 'caretaker' check (category = 'caretaker'),
  skills text[] not null default '{}' check (providers_private.valid_labels(skills, 10)),
  languages text[] not null default '{}' check (providers_private.valid_labels(languages, 10)),
  updated_at timestamptz not null default now(),
  foreign key (provider_id, category) references public.providers(id, category) on delete restrict
);
create table public.provider_private_details (
  provider_id uuid primary key references public.providers(id) on delete restrict,
  registration_council text check (char_length(btrim(registration_council)) between 1 and 160),
  registration_number text check (char_length(btrim(registration_number)) between 1 and 80),
  permit_number text check (char_length(btrim(permit_number)) between 1 and 80),
  private_phone text check (private_phone ~ '^\+91[6-9][0-9]{9}$'),
  updated_at timestamptz not null default now()
);

-- Owners, owner/manager members with provider:manage and scoped verifiers only.
create function providers_private.private_details_reader(provider uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select identity_private.active_account() and exists (
    select 1 from public.providers p where p.id = provider and (
      p.individual_owner_profile_id = auth.uid()
      or providers_private.org_admin(p.organization_id, 'provider:manage')
      or providers_private.verifier(p.organization_id)));
$$;

do $$ declare t text; begin
  foreach t in array array['doctor_profiles','lab_profiles','ambulance_profiles','caretaker_profiles','provider_private_details'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
create policy doctor_profiles_read on public.doctor_profiles for select to authenticated
  using (providers_private.access(provider_id, 'read'));
create policy lab_profiles_read on public.lab_profiles for select to authenticated
  using (providers_private.access(provider_id, 'read'));
create policy ambulance_profiles_read on public.ambulance_profiles for select to authenticated
  using (providers_private.access(provider_id, 'read'));
create policy caretaker_profiles_read on public.caretaker_profiles for select to authenticated
  using (providers_private.access(provider_id, 'read'));
create policy provider_private_details_read on public.provider_private_details for select to authenticated
  using (providers_private.private_details_reader(provider_id));

-- Allowlist only. provider_private_details is never read here.
create function providers_private.build_public_snapshot(p_provider_id uuid, p_category text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(
    jsonb_build_object('category', p_category,
      'display_name', (select pp.display_name from public.provider_profiles pp where pp.provider_id = p_provider_id),
      'description', (select nullif(pp.description, '') from public.provider_profiles pp where pp.provider_id = p_provider_id))
    || case p_category
      when 'doctor' then coalesce((select jsonb_build_object('specialty', d.specialty, 'qualification', d.qualification,
          'languages', to_jsonb(d.languages), 'years_experience', d.years_experience)
          from public.doctor_profiles d where d.provider_id = p_provider_id), '{}'::jsonb)
      when 'lab' then coalesce((select jsonb_build_object('accreditation_label', l.accreditation_label,
          'home_collection', l.home_collection)
          from public.lab_profiles l where l.provider_id = p_provider_id), '{}'::jsonb)
      when 'ambulance' then coalesce((select jsonb_build_object('fleet_types', to_jsonb(a.fleet_types),
          'scheduled_only', a.scheduled_only)
          from public.ambulance_profiles a where a.provider_id = p_provider_id), '{}'::jsonb)
      when 'caretaker' then coalesce((select jsonb_build_object('skills', to_jsonb(c.skills),
          'languages', to_jsonb(c.languages))
          from public.caretaker_profiles c where c.provider_id = p_provider_id), '{}'::jsonb)
      else '{}'::jsonb end);
$$;

alter table public.providers add column published_profile jsonb, add column published_at timestamptz;
update public.providers set published_profile = providers_private.build_public_snapshot(id, category), published_at = now()
  where verification_state = 'approved';
alter table public.providers add constraint providers_published_iff_approved
  check ((verification_state = 'approved') = (published_profile is not null and published_at is not null));

-- The snapshot is frozen at approval: later edits to profile rows (by any path) never
-- reach the public projection until the next approval. Direct writes are overridden.
create function providers_private.freeze_public_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.verification_state = 'approved' then
    if TG_OP = 'INSERT' or old.verification_state is distinct from 'approved' then
      new.published_profile := providers_private.build_public_snapshot(new.id, new.category);
      new.published_at := now();
    else
      new.published_profile := old.published_profile;
      new.published_at := old.published_at;
    end if;
  else
    new.published_profile := null;
    new.published_at := null;
  end if;
  return new;
end;
$$;
create trigger i02h_public_snapshot before insert or update on public.providers
  for each row execute function providers_private.freeze_public_snapshot();

create function providers_private.json_kind_ok(p_value jsonb, p_kind text) returns boolean
language sql immutable set search_path = '' as $$
  select p_value is null or jsonb_typeof(p_value) = 'null' or case p_kind
    when 'text' then jsonb_typeof(p_value) = 'string'
    when 'labels' then jsonb_typeof(p_value) = 'array'
      and not exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
    when 'int' then jsonb_typeof(p_value) = 'number' and p_value::text ~ '^[0-9]{1,3}$'
    when 'bool' then jsonb_typeof(p_value) = 'boolean'
    else false end;
$$;
create function providers_private.json_labels(p_value jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'array'
    then array(select btrim(x) from jsonb_array_elements_text(p_value) x) else '{}'::text[] end;
$$;

-- Full replace of the category row and private row. Owner-editable states only,
-- optimistic provider version, audit in the same transaction.
create function public.set_provider_details(p_provider_id uuid, p_details jsonb, p_private jsonb, p_expected_version integer)
returns public.providers language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.providers;
  allowed text[]; allowed_private text[];
begin
  p := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p.id, 'manage') or not providers_private.owner_editable(p.verification_state) then
    raise exception using errcode = '42501', message = 'forbidden'; end if;
  allowed := case p.category when 'doctor' then array['specialty','qualification','languages','years_experience']
    when 'lab' then array['accreditation_label','home_collection'] when 'ambulance' then array['fleet_types']
    else array['skills','languages'] end;
  allowed_private := case p.category when 'doctor' then array['registration_council','registration_number','private_phone']
    when 'lab' then array['registration_number','private_phone'] when 'ambulance' then array['permit_number','private_phone']
    else array['private_phone'] end;
  if p_details is null or jsonb_typeof(p_details) <> 'object' or p_private is null or jsonb_typeof(p_private) <> 'object'
    or p_expected_version is null
    or exists (select 1 from jsonb_object_keys(p_details) k where k <> all(allowed))
    or exists (select 1 from jsonb_object_keys(p_private) k where k <> all(allowed_private))
    or exists (select 1 from jsonb_each(p_details) e where not providers_private.json_kind_ok(e.value,
      case when e.key in ('languages','skills','fleet_types') then 'labels' when e.key = 'years_experience' then 'int'
        when e.key = 'home_collection' then 'bool' else 'text' end))
    or exists (select 1 from jsonb_each(p_private) e where not providers_private.json_kind_ok(e.value, 'text')) then
    raise exception using errcode = '22023', message = 'invalid_input'; end if;
  update public.providers set version = version + 1, updated_at = now()
    where id = p.id and version = p_expected_version returning * into result;
  if not found then raise exception using errcode = '40001', message = 'conflict'; end if;
  if p.category = 'doctor' then
    insert into public.doctor_profiles(provider_id, specialty, qualification, languages, years_experience)
      values (p.id, nullif(btrim(p_details->>'specialty'), ''), nullif(btrim(p_details->>'qualification'), ''),
        providers_private.json_labels(p_details->'languages'), (p_details->>'years_experience')::smallint)
      on conflict (provider_id) do update set specialty = excluded.specialty, qualification = excluded.qualification,
        languages = excluded.languages, years_experience = excluded.years_experience, updated_at = now();
  elsif p.category = 'lab' then
    insert into public.lab_profiles(provider_id, accreditation_label, home_collection)
      values (p.id, nullif(btrim(p_details->>'accreditation_label'), ''), (p_details->>'home_collection')::boolean)
      on conflict (provider_id) do update set accreditation_label = excluded.accreditation_label,
        home_collection = excluded.home_collection, updated_at = now();
  elsif p.category = 'ambulance' then
    insert into public.ambulance_profiles(provider_id, fleet_types)
      values (p.id, providers_private.json_labels(p_details->'fleet_types'))
      on conflict (provider_id) do update set fleet_types = excluded.fleet_types, updated_at = now();
  else
    insert into public.caretaker_profiles(provider_id, skills, languages)
      values (p.id, providers_private.json_labels(p_details->'skills'), providers_private.json_labels(p_details->'languages'))
      on conflict (provider_id) do update set skills = excluded.skills, languages = excluded.languages, updated_at = now();
  end if;
  insert into public.provider_private_details(provider_id, registration_council, registration_number, permit_number, private_phone)
    values (p.id, nullif(btrim(p_private->>'registration_council'), ''), nullif(btrim(p_private->>'registration_number'), ''),
      nullif(btrim(p_private->>'permit_number'), ''), nullif(btrim(p_private->>'private_phone'), ''))
    on conflict (provider_id) do update set registration_council = excluded.registration_council,
      registration_number = excluded.registration_number, permit_number = excluded.permit_number,
      private_phone = excluded.private_phone, updated_at = now();
  insert into public.audit_events(actor_profile_id, action, target_type, target_id)
    values (actor, 'provider.details_updated', 'provider', p.id);
  return result;
end;
$$;

-- Search and detail return the public reference and the frozen snapshot. Keyset
-- order uses the C collation so ORDER BY and the cursor comparison always agree.
drop function public.get_public_provider(uuid, text, text);
drop function public.search_providers(text, text, text, integer, text, uuid, uuid, uuid);
create function public.search_providers(p_category text, p_pin text, p_price_max text default null, p_limit integer default 20,
  p_after_amount text default null, p_after_provider text default null, p_after_service uuid default null,
  p_provider_reference text default null)
returns table(provider_reference text, category text, display_name text, public_profile jsonb, service_id uuid,
  service_title text, duration_minutes integer, amount_paise text, currency text, unit text, terms_version text,
  pin_code text, city text, advisory_availability text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_category is null or p_category not in ('doctor','lab','ambulance','caretaker') or p_pin is null or p_pin !~ '^[1-9][0-9]{5}$'
    or p_limit is null or p_limit not between 1 and 50
    or (p_price_max is not null and (p_price_max !~ '^(0|[1-9][0-9]{0,18})$' or p_price_max::numeric > 10000000000))
    or num_nonnulls(p_after_amount, p_after_provider, p_after_service) not in (0,3)
    or (p_after_provider is not null and p_after_provider !~ '^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19}$')
    or (p_provider_reference is not null and p_provider_reference !~ '^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19}$') then
    raise exception using errcode = '22023', message = 'invalid_input'; end if;
  if p_after_amount is not null and (p_after_amount !~ '^(0|[1-9][0-9]{0,18})$' or p_after_amount::numeric > 10000000000) then
    raise exception using errcode = '22023', message = 'invalid_input'; end if;
  return query select p.public_reference, p.category, p.published_profile->>'display_name', p.published_profile,
    s.id, s.title, s.duration_minutes, v.amount_paise::text, v.currency, v.unit, v.terms_version, a.pin_code, d.city, null::text
  from public.providers p
  join public.services s on s.provider_id = p.id and s.status = 'published'
  join public.service_price_versions v on v.service_id = s.id and v.effective_from <= statement_timestamp()
    and (v.effective_to is null or v.effective_to > statement_timestamp())
  join public.provider_service_areas a on a.provider_id = p.id and a.pin_code = p_pin and a.status = 'approved'
    and a.valid_from <= now() and a.valid_to > now()
  join public.pin_directory d on d.pin_code = a.pin_code
  where p.category = p_category and (p_provider_reference is null or p.public_reference = p_provider_reference)
    and identity_private.provider_publicly_bookable(p.id)
    and (p_price_max is null or v.amount_paise <= p_price_max::bigint)
    and (p_after_amount is null or (v.amount_paise, p.public_reference collate "C", s.id)
      > (p_after_amount::bigint, p_after_provider collate "C", p_after_service))
  order by v.amount_paise, p.public_reference collate "C", s.id limit p_limit;
end;
$$;
create function public.get_public_provider(p_provider_reference text, p_category text, p_pin text)
returns table(provider_reference text, category text, display_name text, public_profile jsonb, service_id uuid,
  service_title text, duration_minutes integer, amount_paise text, currency text, unit text, terms_version text,
  pin_code text, city text, advisory_availability text)
language sql stable security definer set search_path = '' as $$
  select * from public.search_providers(p_category, p_pin, null, 50, null, null, null, p_provider_reference)
  where p_provider_reference is not null;
$$;

revoke all on function providers_private.owner_editable(text), providers_private.valid_labels(text[], integer),
  providers_private.private_details_reader(uuid), providers_private.build_public_snapshot(uuid, text),
  providers_private.freeze_public_snapshot(), providers_private.json_kind_ok(jsonb, text),
  providers_private.json_labels(jsonb) from public, anon, authenticated;
grant execute on function providers_private.private_details_reader(uuid) to authenticated;
revoke all on function public.set_provider_details(uuid, jsonb, jsonb, integer),
  public.search_providers(text, text, text, integer, text, text, uuid, text), public.get_public_provider(text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_provider_details(uuid, jsonb, jsonb, integer) to authenticated;
grant execute on function public.search_providers(text, text, text, integer, text, text, uuid, text),
  public.get_public_provider(text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
