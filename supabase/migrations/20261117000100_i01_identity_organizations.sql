-- I01 / canonical schema v0.1, owner-approved defaults. Synthetic staging only.
-- No provider/booking/clinical/payment activation. Every exposed table denies by default.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- RESTRICT FKs retained: controlled account deletion/anonymisation awaits retention decision Q05.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text check (char_length(display_name) between 1 and 120),
  locale text not null default 'en' check (locale in ('en','te','hi')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  -- Core intentionally requires a login: dependent/delegated patients are disabled.
  self_profile_id uuid not null unique references public.profiles(id) on delete restrict,
  display_name text check (char_length(display_name) between 1 and 120),
  date_of_birth date,
  status text not null default 'active' check (status in ('active','disabled')),
  questionnaire_version integer not null default 0 check (questionnaire_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (id,self_profile_id)
);

create table public.patient_access (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  grantee_profile_id uuid not null references public.profiles(id) on delete restrict,
  grant_source text not null default 'self' check (grant_source='self'),
  scopes text[] not null default array['patient:read','patient:update','booking:read','booking:write'],
  granted_by_profile_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (patient_id,grantee_profile_id),
  foreign key (patient_id,grantee_profile_id) references public.patients(id,self_profile_id) on delete restrict,
  check (granted_by_profile_id=grantee_profile_id),
  check (cardinality(scopes)>0 and array_position(scopes,null) is null and
    scopes <@ array['patient:read','patient:update','booking:read','booking:write']),
  check (expires_at is null or expires_at>valid_from),
  check (revoked_at is null or revoked_at>=valid_from)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  status text not null default 'active' check (status in ('active','disabled')),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  membership_role text not null check (membership_role in ('owner','manager','doctor','technician','driver','caregiver','billing')),
  status text not null default 'invited' check (status in ('invited','active','disabled')),
  -- Category-specific scopes are added by later reviewed migrations, never inferred from role.
  scopes text[] not null default array['organization:read'],
  invited_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (organization_id,profile_id),
  check (cardinality(scopes)>0 and array_position(scopes,null) is null and
    scopes <@ array['organization:read','organization:update','members:read','members:manage']),
  check ((status='disabled')=(disabled_at is not null))
);
create index organization_members_profile_idx on public.organization_members(profile_id,organization_id);

create table public.admin_capabilities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  capability text not null check (capability in ('organization:read','membership:manage','capability:manage','audit:read')),
  organization_id uuid references public.organizations(id) on delete restrict,
  granted_by_profile_id uuid references public.profiles(id) on delete restrict,
  -- Issuance is an out-of-band trusted invitation, never signup metadata or self-service.
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  check (granted_by_profile_id is null or granted_by_profile_id<>profile_id),
  check (expires_at is null or expires_at>valid_from),
  check (revoked_at is null or revoked_at>=valid_from)
);
create index admin_capabilities_lookup_idx on public.admin_capabilities(profile_id,capability,organization_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  target_table text not null,
  target_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_boundary_idx on public.audit_events(organization_id,created_at);

-- Revoke Supabase's default table/function exposure; add only deliberate grants below.
revoke all on public.profiles,public.patients,public.patient_access,public.organizations,
  public.organization_members,public.admin_capabilities,public.audit_events from public,anon,authenticated;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.patient_access enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.admin_capabilities enable row level security;
alter table public.audit_events enable row level security;

create function private.is_active_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
    and not exists(select 1 from auth.users where id=(select auth.uid()) and is_anonymous)
    and exists(select 1 from public.profiles where id=(select auth.uid()) and status='active');
$$;

create function private.has_patient_scope(p_patient_id uuid,p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and exists (
    select 1 from public.patient_access a join public.patients p on p.id=a.patient_id
    where a.patient_id=p_patient_id and a.grantee_profile_id=(select auth.uid())
    and p.self_profile_id=(select auth.uid()) and p.status='active'
    and p_scope=any(a.scopes) and a.valid_from<=now() and a.revoked_at is null
    and (a.expires_at is null or a.expires_at>now()));
$$;

create function private.has_org_scope(p_organization_id uuid,p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and exists (
    select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
    where m.organization_id=p_organization_id and m.profile_id=(select auth.uid())
    and m.status='active' and o.status='active' and p_scope=any(m.scopes));
$$;

create function private.has_admin_capability(p_capability text,p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and coalesce((select auth.jwt())->>'aal','')='aal2'
    and exists(select 1 from public.admin_capabilities c
      where c.profile_id=(select auth.uid()) and c.capability=p_capability
      and (c.organization_id is null or c.organization_id=p_organization_id)
      and c.valid_from<=now() and c.revoked_at is null
      and (c.expires_at is null or c.expires_at>now()));
$$;

create function private.touch_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at:=old.created_at;
  new.updated_at:=clock_timestamp();
  new.version:=old.version+1;
  return new;
end;
$$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Never copy role/status/scopes or arbitrary metadata supplied during signup.
  insert into public.profiles(id) values(new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();
-- Existing Auth identities receive only an ordinary profile, never a role/capability.
insert into public.profiles(id) select id from auth.users on conflict(id) do nothing;

create function private.audit_access_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_boundary uuid; v_id uuid;
begin
  -- Allowlist authorization metadata and organization renames; no patient/profile names,
  -- email, DOB, health or JWT payloads.
  if tg_op<>'INSERT' then
    v_old:=to_jsonb(old);
    v_id:=old.id;
  end if;
  if tg_op<>'DELETE' then
    v_new:=to_jsonb(new);
    v_id:=new.id;
  end if;
  v_boundary:=coalesce(v_new->>'organization_id',v_old->>'organization_id')::uuid;
  if tg_table_name='organizations' then v_boundary:=v_id; end if;
  select jsonb_object_agg(key,value) into v_old from jsonb_each(v_old)
    where key in ('profile_id','self_profile_id','grantee_profile_id','membership_role','status','scopes',
      'capability','organization_id','valid_from','expires_at','revoked_at',
      'reason_code','granted_by_profile_id','invited_by_profile_id','grant_source')
      or (tg_table_name='organizations' and key='display_name');
  select jsonb_object_agg(key,value) into v_new from jsonb_each(v_new)
    where key in ('profile_id','self_profile_id','grantee_profile_id','membership_role','status','scopes',
      'capability','organization_id','valid_from','expires_at','revoked_at',
      'reason_code','granted_by_profile_id','invited_by_profile_id','grant_source')
      or (tg_table_name='organizations' and key='display_name');
  if tg_op='UPDATE' and v_old is not distinct from v_new then return null; end if;
  insert into public.audit_events(actor_profile_id,organization_id,action,target_table,target_id,before_state,after_state)
    values(auth.uid(),v_boundary,tg_op,tg_table_name,v_id,v_old,v_new);
  return null;
end;
$$;

create function private.reject_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode='42501',message='audit events are append only';
end;
$$;
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function private.reject_audit_mutation();
create trigger audit_events_no_truncate before truncate on public.audit_events
for each statement execute function private.reject_audit_mutation();
-- Only postgres-owned definer triggers append audits; service_role cannot forge rows
-- or attach triggers/references. Trusted trigger writers retain their owner privileges.
revoke insert,update,delete,truncate,trigger,references on public.audit_events from service_role;

-- Metadata/version hooks are installed on each mutable identity aggregate.
do $$
declare v_table text;
begin
  foreach v_table in array array['profiles','patients','patient_access','organizations','organization_members','admin_capabilities'] loop
    execute format('create trigger touch_version before update on public.%I for each row execute function private.touch_version()',v_table);
  end loop;
  foreach v_table in array array['profiles','patients','patient_access','organizations','organization_members','admin_capabilities'] loop
    execute format('create trigger audit_access after insert or update or delete on public.%I for each row execute function private.audit_access_change()',v_table);
  end loop;
end;
$$;

-- Read policies use caller-pinned lookup helpers and never recurse through membership RLS.
create policy profiles_self_read on public.profiles for select to authenticated
using (id=(select auth.uid()) and (select private.is_active_account()));
create policy profiles_self_update on public.profiles for update to authenticated
using (id=(select auth.uid()) and (select private.is_active_account()))
with check (id=(select auth.uid()) and status='active');
create policy patients_self_read on public.patients for select to authenticated
using (private.has_patient_scope(id,'patient:read'));
create policy patients_self_update on public.patients for update to authenticated
using (private.has_patient_scope(id,'patient:update'))
with check (self_profile_id=(select auth.uid()) and private.has_patient_scope(id,'patient:update'));
create policy patient_access_self_read on public.patient_access for select to authenticated
using (grantee_profile_id=(select auth.uid()) and (select private.is_active_account()));
create policy organizations_scoped_read on public.organizations for select to authenticated
using (private.has_org_scope(id,'organization:read') or private.has_admin_capability('organization:read',id));
create policy organizations_scoped_update on public.organizations for update to authenticated
using (private.has_org_scope(id,'organization:update'))
with check (private.has_org_scope(id,'organization:update'));
create policy memberships_scoped_read on public.organization_members for select to authenticated
using ((profile_id=(select auth.uid()) and (select private.is_active_account()))
  or private.has_org_scope(organization_id,'members:read')
  or private.has_admin_capability('membership:manage',organization_id));
create policy capabilities_scoped_read on public.admin_capabilities for select to authenticated
using ((profile_id=(select auth.uid()) and (select private.is_active_account()))
  or private.has_admin_capability('capability:manage',organization_id));
create policy audit_scoped_read on public.audit_events for select to authenticated
using (private.has_admin_capability('audit:read',organization_id));
-- No INSERT/DELETE policies; no direct UPDATE policies on grants/memberships/capabilities/audit.
grant select on public.profiles,public.patients,public.patient_access,public.organizations,
  public.organization_members,public.admin_capabilities,public.audit_events to authenticated;
grant update(display_name,locale) on public.profiles to authenticated;
grant update(display_name,date_of_birth) on public.patients to authenticated;
grant update(display_name) on public.organizations to authenticated;

create function public.onboard_self_patient() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_patient uuid;
begin
  -- Locks serialize onboarding/revocation; replays never restore a revoked grant.
  perform 1 from public.profiles where id=auth.uid() and status='active'
    and private.is_active_account() for update;
  if not found then raise exception using errcode='42501',message='active account required'; end if;
  select id into v_patient from public.patients where self_profile_id=auth.uid();
  if v_patient is not null then return v_patient; end if;
  insert into public.patients(self_profile_id) values(auth.uid()) returning id into v_patient;
  insert into public.patient_access(patient_id,grantee_profile_id,granted_by_profile_id)
    values(v_patient,auth.uid(),auth.uid());
  return v_patient;
end;
$$;

create function public.create_organization(p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  perform 1 from public.profiles where id=auth.uid() and status='active'
    and private.is_active_account() for update;
  if not found then raise exception using errcode='42501',message='active account required'; end if;
  insert into public.organizations(display_name,created_by_profile_id)
    values(btrim(p_display_name),auth.uid()) returning id into v_org;
  insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invited_by_profile_id)
    values(v_org,auth.uid(),'owner','active',array['organization:read','organization:update','members:read','members:manage'],auth.uid());
  return v_org;
end;
$$;

create function public.set_organization_member(p_organization_id uuid,p_profile_id uuid,
  p_role text,p_status text,p_scopes text[],p_expected_version integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor public.organization_members; v_target public.organization_members; v_id uuid; v_profile_status text;
begin
  if not private.is_active_account() or p_profile_id=auth.uid() then
    raise exception using errcode='42501',message='membership change denied';
  end if;
  -- Serialize membership changes within one org; lock before checking current authority.
  perform 1 from public.organizations where id=p_organization_id and status='active' for update;
  if not found then raise exception using errcode='42501',message='membership change denied'; end if;
  -- Recheck after any lock wait and hold account status stable until commit.
  perform 1 from public.profiles where id=auth.uid() and status='active' for share;
  if not found then raise exception using errcode='42501',message='active account required'; end if;
  select * into v_actor from public.organization_members
    where organization_id=p_organization_id and profile_id=auth.uid() and status='active' for update;
  if not found or v_actor.membership_role not in ('owner','manager') or not ('members:manage'=any(v_actor.scopes)) then
    raise exception using errcode='42501',message='membership change denied';
  end if;
  -- One validation denial for every target; reject scopes before table constraints run.
  if p_role is null or p_status is null or p_scopes is null or p_expected_version is null
    or p_role='owner' or p_role not in ('manager','doctor','technician','driver','caregiver','billing')
    or p_status not in ('invited','active','disabled')
    or cardinality(p_scopes)=0 or array_ndims(p_scopes)<>1
    or exists(select 1 from unnest(p_scopes) as s(scope) where s.scope is null)
    or (p_role='manager' and v_actor.membership_role<>'owner') or not (p_scopes<@v_actor.scopes) then
    raise exception using errcode='42501',message='membership change denied';
  end if;
  -- Pin target status through the mutation; missing UUIDs never reach a foreign key.
  select status into v_profile_status from public.profiles where id=p_profile_id for share;
  if not found or (v_profile_status<>'active' and p_status<>'disabled') then
    raise exception using errcode='42501',message='membership change denied';
  end if;
  select * into v_target from public.organization_members
    where organization_id=p_organization_id and profile_id=p_profile_id for update;
  if found then
    if v_target.membership_role='owner' or (v_target.membership_role='manager' and v_actor.membership_role<>'owner') then
      raise exception using errcode='42501',message='protected membership';
    end if;
    if v_actor.membership_role<>'owner' and not (v_target.scopes<@v_actor.scopes) then
      raise exception using errcode='42501',message='membership change denied';
    end if;
    if v_target.version<>p_expected_version then raise exception using errcode='40001',message='membership version conflict'; end if;
    -- Invitations are accepted by the invited subject; disabled users require a new invitation.
    if p_status not in ('invited','disabled') and not (p_status='active' and v_target.status='active') then
      raise exception using errcode='42501',message='subject must accept invitation';
    end if;
    update public.organization_members set membership_role=p_role,status=p_status,scopes=p_scopes,
      disabled_at=case when p_status='disabled' then now() else null end
      where id=v_target.id returning id into v_id;
  else
    -- A new membership has one eligibility contract and one denial, even for missing targets.
    if v_profile_status<>'active' or p_expected_version<>0 or p_status<>'invited' then
      raise exception using errcode='42501',message='membership change denied';
    end if;
    insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invited_by_profile_id)
      values(p_organization_id,p_profile_id,p_role,'invited',p_scopes,auth.uid()) returning id into v_id;
  end if;
  return v_id;
exception when check_violation then
  -- Keep constraint names and rejected-row details inside the database boundary.
  raise exception using errcode='42501',message='membership change denied';
end;
$$;

create function public.accept_organization_invite(p_organization_id uuid,p_expected_version integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_member public.organization_members;
begin
  if not private.is_active_account() then raise exception using errcode='42501',message='active account required'; end if;
  perform 1 from public.organizations where id=p_organization_id and status='active' for update;
  if not found then raise exception using errcode='42501',message='invitation unavailable'; end if;
  perform 1 from public.profiles where id=auth.uid() and status='active' for share;
  if not found then raise exception using errcode='42501',message='active account required'; end if;
  select * into v_member from public.organization_members
    where organization_id=p_organization_id and profile_id=auth.uid() and status='invited' for update;
  if not found then raise exception using errcode='42501',message='invitation unavailable'; end if;
  if p_expected_version is null or v_member.version<>p_expected_version then
    raise exception using errcode='40001',message='membership version conflict';
  end if;
  update public.organization_members set status='active' where id=v_member.id;
  return v_member.id;
end;
$$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active_account(),private.has_patient_scope(uuid,text),
  private.has_org_scope(uuid,text),private.has_admin_capability(text,uuid) to authenticated;
revoke all on function public.onboard_self_patient(),public.create_organization(text),
  public.set_organization_member(uuid,uuid,text,text,text[],integer),public.accept_organization_invite(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.onboard_self_patient(),public.create_organization(text),
  public.set_organization_member(uuid,uuid,text,text,text[],integer),public.accept_organization_invite(uuid,integer)
  to authenticated;

comment on table public.admin_capabilities is 'Trusted out-of-band invitation/grant only; each admin operation requires current scoped capability plus aal2. No blanket admin bypass.';
comment on table public.patient_access is 'I01 self-only. Composite FK prevents delegation. Later consent/dependent work requires a new reviewed migration.';
comment on table public.audit_events is 'Append-only allowlisted authorization metadata. Null actor denotes trusted database/bootstrap activity.';
commit;
