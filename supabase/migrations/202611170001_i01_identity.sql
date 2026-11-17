-- I01 / Codex / task/I01-auth-rls / base d532f09b6f8d091a1843485f11ab3cd3ec3b549e.
-- Depends on Supabase Auth/Storage. Synthetic isolated targets only. Not applied here.
-- Canonical v0.1, owner-approved defaults. I02 extends providers/evidence; no listing here.
-- No client privileged-grant command. Bootstrap/revoke provider/admin/owner rights
-- through reviewed out-of-band SQL with audit and named human approval.
-- Forward corrections only after application; rollback requires dependency review.
begin;

create schema if not exists identity_private;
revoke all on schema identity_private from public, anon, authenticated;
grant usage on schema identity_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '' check (char_length(display_name) <= 100),
  locale text not null default 'en' check (locale in ('en','te','hi')),
  status text not null default 'active' check (status in ('active','disabled')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  self_profile_id uuid not null unique references public.profiles(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  purpose text not null check (purpose = 'self_patient_access'),
  policy_version text not null check (char_length(btrim(policy_version)) between 1 and 80),
  decision text not null check (decision = 'granted'),
  occurred_at timestamptz not null default now()
);
create index consent_actor_idx on public.consent_events(actor_profile_id);
create index consent_patient_idx on public.consent_events(patient_id);
create table public.patient_access (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  grantee_profile_id uuid not null references public.profiles(id) on delete restrict,
  scope text not null check (scope in ('profile:read','profile:write','booking:read','booking:create')),
  source text not null default 'self' check (source = 'self'),
  consent_event_id uuid not null references public.consent_events(id) on delete restrict,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  valid_from timestamptz not null default now(), expires_at timestamptz,
  revoked_at timestamptz, created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > valid_from),
  unique(patient_id, grantee_profile_id, scope)
);
create index patient_access_grantee_idx on public.patient_access(grantee_profile_id, patient_id, scope);
create index patient_access_consent_idx on public.patient_access(consent_event_id);
create index patient_access_grantor_idx on public.patient_access(granted_by);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  status text not null default 'active' check (status in ('active','disabled')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  membership_role text not null check (membership_role in ('owner','manager','staff','billing')),
  status text not null check (status in ('invited','active','disabled')),
  scopes text[] not null default '{}',
  accepted_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (scopes <@ array['org:read','org:edit','members:read','provider:read','provider:manage','evidence:manage','schedule:manage','finance:read']::text[]),
  check (array_position(scopes, null) is null),
  unique(organization_id, profile_id)
);
create index organization_members_profile_idx on public.organization_members(profile_id, organization_id);
create table public.admin_capabilities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  capability text not null check (capability in ('provider:verify','coverage:verify','security:audit','membership:admin')),
  scope_key text not null check (scope_key = 'global' or scope_key ~ '^org:[0-9a-f-]{36}$'),
  granted_by uuid not null references public.profiles(id) on delete restrict,
  valid_from timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > valid_from),
  unique(profile_id, capability, scope_key)
);
create index admin_capabilities_grantor_idx on public.admin_capabilities(granted_by);
-- Identity/ownership skeleton only. Category authorization is assigned by a trusted
-- onboarding/review process; creating an organization alone grants no provider role.
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  individual_owner_profile_id uuid references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  category text not null check (category in ('doctor','lab','ambulance','caretaker')),
  status text not null default 'inactive' check (status in ('active','inactive','suspended')),
  verification_state text not null default 'draft' check (verification_state in ('draft','submitted','verified','rejected','expired','suspended')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(individual_owner_profile_id, organization_id) = 1),
  unique(id,category)
);
create unique index providers_individual_category_idx on public.providers(individual_owner_profile_id,category) where individual_owner_profile_id is not null;
create unique index providers_org_category_idx on public.providers(organization_id,category) where organization_id is not null;
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  action text not null, target_type text not null, target_id uuid not null,
  occurred_at timestamptz not null default now()
);
create index audit_actor_idx on public.audit_events(actor_profile_id);
create index audit_target_idx on public.audit_events(target_type,target_id,occurred_at);
create table public.idempotency_requests (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  action text not null, request_key uuid not null, request_hash text not null,
  result_id uuid not null, created_at timestamptz not null default now(),
  unique(actor_profile_id,action,request_key)
);

-- Helpers pin all decisions to auth.uid(), never a caller-supplied actor.
-- Definer lookups avoid recursive RLS. No rows or arbitrary SQL are exported.
create function identity_private.active_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;
create function identity_private.org_scope(org_id uuid, required_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select identity_private.active_account() and exists (
    select 1 from public.organization_members m join public.organizations o on o.id = m.organization_id
    where m.organization_id = org_id and m.profile_id = auth.uid()
      and m.status = 'active' and o.status = 'active' and required_scope = any(m.scopes)
  );
$$;
create function identity_private.patient_scope(subject_id uuid, required_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select identity_private.active_account() and exists (
    select 1 from public.patient_access a join public.patients p on p.id = a.patient_id
    where a.patient_id = subject_id and a.grantee_profile_id = auth.uid()
      and p.self_profile_id = auth.uid() and a.source = 'self' and a.scope = required_scope
      and a.valid_from <= now() and a.revoked_at is null and (a.expires_at is null or a.expires_at > now())
  );
$$;
revoke all on all functions in schema identity_private from public, anon, authenticated;
grant execute on function identity_private.active_account(), identity_private.org_scope(uuid,text), identity_private.patient_scope(uuid,text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles','patients','patient_access','consent_events','organizations','organization_members','admin_capabilities','providers','audit_events','idempotency_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select on public.profiles, public.patients, public.patient_access, public.consent_events,
  public.organizations, public.organization_members, public.admin_capabilities, public.providers to authenticated;
-- No direct INSERT/UPDATE/DELETE policies or grants, including audit/consent.
create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid() and identity_private.active_account());
create policy patients_self on public.patients for select to authenticated
  using (identity_private.patient_scope(id,'profile:read'));
create policy patient_access_self on public.patient_access for select to authenticated
  using (grantee_profile_id = auth.uid() and identity_private.patient_scope(patient_id,scope));
create policy consent_self on public.consent_events for select to authenticated
  using (actor_profile_id = auth.uid() and identity_private.patient_scope(patient_id,'profile:read'));
create policy organizations_scoped on public.organizations for select to authenticated
  using (identity_private.org_scope(id,'org:read'));
create policy organization_members_scoped on public.organization_members for select to authenticated
  using (identity_private.org_scope(organization_id,'members:read') or
    (profile_id = auth.uid() and identity_private.org_scope(organization_id,'org:read')));
create policy admin_capabilities_self on public.admin_capabilities for select to authenticated
  using (profile_id = auth.uid() and identity_private.active_account() and
    auth.jwt()->>'aal' = 'aal2' and revoked_at is null and valid_from <= now() and (expires_at is null or expires_at > now()));
create policy providers_owner on public.providers for select to authenticated
  using (identity_private.active_account() and (individual_owner_profile_id = auth.uid() or
    identity_private.org_scope(organization_id,'provider:read')));

create function identity_private.provision_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Never copy raw_user_meta_data roles, owner IDs, status or verification.
  insert into public.profiles(id) values(new.id);
  return new;
end;
$$;
revoke all on function identity_private.provision_profile() from public, anon, authenticated;
create trigger i01_auth_profile after insert on auth.users for each row execute function identity_private.provision_profile();
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

-- Serialize actor writes without conflicting with reciprocal invitation FK key-share locks.
-- Trusted account disabling must use this profile row and the same lock order.
create function identity_private.require_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.profiles where id = actor and status = 'active' for no key update;
  if not found then raise exception using errcode = '42501', message = 'forbidden'; end if;
  return actor;
end;
$$;
revoke all on function identity_private.require_actor() from public, anon, authenticated;

create function public.update_self_profile(p_display_name text, p_locale text, p_expected_version integer)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result public.profiles;
begin
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 100 or p_locale is null or p_locale not in ('en','te','hi') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  update public.profiles set display_name = btrim(p_display_name), locale = p_locale, version = version + 1, updated_at = now()
    where id = actor and version = p_expected_version returning * into result;
  if not found then raise exception using errcode = '40001', message = 'conflict'; end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'profile.updated','profile',actor);
  return result;
end;
$$;
create function public.create_self_patient(p_policy_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); subject_id uuid; consent_id uuid;
begin
  if p_policy_version is null or char_length(btrim(p_policy_version)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select id into subject_id from public.patients where self_profile_id = actor;
  -- Idempotent identity creation never resurrects revoked access or changes consent.
  if found then
    if not identity_private.patient_scope(subject_id,'profile:read') then raise exception using errcode = '42501', message = 'forbidden'; end if;
    return subject_id;
  end if;
  insert into public.patients(self_profile_id) values(actor) returning id into subject_id;
  insert into public.consent_events(actor_profile_id,patient_id,purpose,policy_version,decision)
    values(actor,subject_id,'self_patient_access',btrim(p_policy_version),'granted') returning id into consent_id;
  insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
    select subject_id,actor,s,consent_id,actor from unnest(array['profile:read','profile:write','booking:read','booking:create']) s;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'patient.created','patient',subject_id);
  return subject_id;
end;
$$;
create function public.create_organization(p_name text, p_request_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); org_id uuid; prior public.idempotency_requests;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 160 or p_request_key is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into prior from public.idempotency_requests where actor_profile_id = actor and action = 'organization.create' and request_key = p_request_key;
  if found then
    if not identity_private.org_scope(prior.result_id,'org:edit') then raise exception using errcode = '42501', message = 'forbidden'; end if;
    if prior.request_hash <> md5(btrim(p_name)) then raise exception using errcode = '40001', message = 'conflict'; end if;
    return prior.result_id;
  end if;
  -- require_actor serializes creation per actor; disabled orgs still count.
  if (select count(*) from public.audit_events where actor_profile_id = actor and action = 'organization.created') >= 5 then
    raise exception using errcode = '23514', message = 'organization_limit';
  end if;
  insert into public.organizations(name) values(btrim(p_name)) returning id into org_id;
  insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes)
    values(org_id,actor,'owner','active',array['org:read','org:edit','members:read','provider:read','provider:manage','evidence:manage','schedule:manage','finance:read']);
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'organization.created','organization',org_id);
  insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
    values(actor,'organization.create',p_request_key,md5(btrim(p_name)),org_id);
  return org_id;
end;
$$;
create function public.update_organization(p_organization_id uuid, p_name text, p_expected_version integer)
returns public.organizations language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result public.organizations;
begin
  perform 1 from public.organizations where id = p_organization_id for update;
  perform 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor for update;
  if not identity_private.org_scope(p_organization_id,'org:edit') or not exists (
    select 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor and membership_role in ('owner','manager')
  ) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 160 then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  update public.organizations set name = btrim(p_name), updated_at = now(), version = version + 1
    where id = p_organization_id and version = p_expected_version returning * into result;
  if not found then raise exception using errcode = '40001', message = 'conflict'; end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'organization.updated','organization',p_organization_id);
  return result;
end;
$$;
create function public.set_organization_member(p_organization_id uuid, p_profile_id uuid, p_membership_role text, p_status text, p_scopes text[], p_expected_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result uuid;
begin
  perform 1 from public.organizations where id = p_organization_id for update;
  perform 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor for update;
  if p_profile_id = actor or not identity_private.org_scope(p_organization_id,'members:read') or not exists (
    select 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor and membership_role = 'owner'
  ) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_membership_role is null or p_membership_role not in ('manager','staff','billing') or p_status is null or p_status not in ('invited','active','disabled') or p_scopes is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists(select 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor and p_scopes <@ scopes) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if not exists(select 1 from public.profiles where id = p_profile_id and status = 'active') then raise exception using errcode = '42501', message = 'forbidden'; end if;
  -- Existing owners are immutable here: no ownership transfer, removal of the last
  -- owner or self promotion. Owner transfer requires a separate reviewed command.
  if exists(select 1 from public.organization_members where organization_id = p_organization_id and profile_id = p_profile_id and membership_role = 'owner') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_expected_version = 0 then
    if p_status <> 'invited' then raise exception using errcode = '22023', message = 'invitation_required'; end if;
    insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes)
      values(p_organization_id,p_profile_id,p_membership_role,'invited',p_scopes) returning id into result;
  else
    -- Owners cannot activate invitations, including ones disabled before acceptance.
    if p_status = 'active' and not exists (
      select 1 from public.organization_members where organization_id = p_organization_id and profile_id = p_profile_id
        and (status = 'active' or accepted_at is not null)
    ) then raise exception using errcode = '42501', message = 'invitation_required'; end if;
    -- Scope expansion and reactivation require fresh invitee acceptance.
    -- All right-hand expressions refer to the old row before this update.
    update public.organization_members set membership_role = p_membership_role,
      status = case when p_status = 'active' and (not (p_scopes <@ scopes) or status = 'disabled') then 'invited' else p_status end,
      accepted_at = case
        when p_status = 'invited' or not (p_scopes <@ scopes) or (status = 'disabled' and p_status = 'active') then null
        when status = 'active' then coalesce(accepted_at, now()) else accepted_at end,
      scopes = p_scopes,
      version = version + 1, updated_at = now()
      where organization_id = p_organization_id and profile_id = p_profile_id and version = p_expected_version returning id into result;
    if not found then raise exception using errcode = '40001', message = 'conflict'; end if;
  end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'membership.changed','organization_member',result);
  return result;
end;
$$;
-- Narrow discovery path: only the caller's invited rows in active organizations.
-- Does not expose org details, other members, profile IDs, or active memberships.
create function public.list_organization_invites()
returns table(organization_id uuid, scopes text[], version integer)
language sql stable security definer set search_path = '' as $$
  select m.organization_id, m.scopes, m.version
    from public.organization_members m join public.organizations o on o.id = m.organization_id
    where identity_private.active_account() and m.profile_id = auth.uid()
      and m.status = 'invited' and o.status = 'active'
    order by m.organization_id;
$$;
-- Invitee only: no supplied profile ID, no rights granted before acceptance.
create function public.accept_organization_invite(p_organization_id uuid, p_expected_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result uuid;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception using errcode = '42501', message = 'forbidden'; end if;
  perform 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor for update;
  if not found or not exists (
    select 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor and status = 'invited'
  ) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  update public.organization_members set status = 'active', accepted_at = now(), version = version + 1, updated_at = now()
    where organization_id = p_organization_id and profile_id = actor and version = p_expected_version returning id into result;
  if not found then raise exception using errcode = '40001', message = 'conflict'; end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'membership.accepted','organization_member',result);
  return result;
end;
$$;
create function public.identity_roles() returns setof text
language sql stable security definer set search_path = '' as $$
  select 'patient'::text where identity_private.active_account()
  union
  select p.category from public.providers p where identity_private.active_account() and p.status <> 'suspended' and (
    p.individual_owner_profile_id = auth.uid() or identity_private.org_scope(p.organization_id,'provider:read'))
  union
  select 'admin'::text where identity_private.active_account() and auth.jwt()->>'aal' = 'aal2' and exists (
    select 1 from public.admin_capabilities c where c.profile_id = auth.uid() and c.revoked_at is null
      and c.scope_key = 'global' and c.capability in ('provider:verify','coverage:verify','membership:admin')
      and c.valid_from <= now() and (c.expires_at is null or c.expires_at > now())
  );
$$;

revoke all on function public.update_self_profile(text,text,integer), public.create_self_patient(text), public.create_organization(text,uuid),
  public.update_organization(uuid,text,integer), public.set_organization_member(uuid,uuid,text,text,text[],integer), public.accept_organization_invite(uuid,integer), public.list_organization_invites(), public.identity_roles() from public, anon, authenticated;
grant execute on function public.update_self_profile(text,text,integer), public.create_self_patient(text), public.create_organization(text,uuid),
  public.update_organization(uuid,text,integer), public.set_organization_member(uuid,uuid,text,text,text[],integer), public.accept_organization_invite(uuid,integer), public.list_organization_invites(), public.identity_roles() to authenticated;

-- Restrictive policies are fail-closed even if permissive policies are added by
-- accident. I02 must replace these only alongside document metadata authorization.
-- RLS is already enabled on storage.objects/buckets by Supabase Storage (the migration role
-- is not their owner, so ALTER TABLE fails on a real project). Only add restrictive policies.
create policy i01_objects_locked on storage.objects as restrictive for all to anon, authenticated using (false) with check (false);
create policy i01_buckets_locked on storage.buckets as restrictive for all to anon, authenticated using (false) with check (false);
commit;
