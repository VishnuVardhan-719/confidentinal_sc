-- I02 / provider onboarding, private verification documents, admin verification.
-- Implements docs/I02_DESIGN.md. Synthetic staging only (Q05). No payout/tax fields (Q03).
-- One provider per owner+category and per-person staff credentials (Q06). No clinical fields (Q09).
-- Listed is not bookable: PIN coverage/services (C01) and assignment (B01) are separate gates.
begin;

-- ---------------------------------------------------------------------------
-- 0. Forward corrections to I01 objects (design section 11); I01 migration is untouched.
-- ---------------------------------------------------------------------------
alter table public.admin_capabilities drop constraint admin_capabilities_capability_check;
alter table public.admin_capabilities add constraint admin_capabilities_capability_check
  check (capability in ('organization:read','membership:manage','capability:manage','audit:read',
    'provider:review','provider:document_read','provider:suspend'));

alter table public.organization_members drop constraint organization_members_scopes_check;
alter table public.organization_members add constraint organization_members_scopes_check
  check (cardinality(scopes)>0 and array_position(scopes,null) is null and
    scopes <@ array['organization:read','organization:update','members:read','members:manage',
      'provider:read','provider:manage']);

-- Owners cannot self-grant through set_organization_member, so the initial owner scopes grow here.
create or replace function public.create_organization(p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  perform 1 from public.profiles where id=auth.uid() and status='active'
    and private.is_active_account() for update;
  if not found then raise exception using errcode='42501',message='active account required'; end if;
  insert into public.organizations(display_name,created_by_profile_id)
    values(btrim(p_display_name),auth.uid()) returning id into v_org;
  insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invited_by_profile_id)
    values(v_org,auth.uid(),'owner','active',
      array['organization:read','organization:update','members:read','members:manage','provider:read','provider:manage'],auth.uid());
  return v_org;
end;
$$;
update public.organization_members
  set scopes=array(select distinct s from unnest(scopes||array['provider:read','provider:manage']) as t(s) order by s)
  where membership_role='owner' and status='active' and not (scopes @> array['provider:read','provider:manage']);

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table private.provider_reference_counters (
  prefix text primary key check (prefix in ('DOC','LAB','AMB','CARE')),
  last_value bigint not null default 0 check (last_value>=0)
);
insert into private.provider_reference_counters(prefix) values('DOC'),('LAB'),('AMB'),('CARE');

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('doctor','lab','ambulance','caretaker')),
  individual_owner_profile_id uuid references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  public_reference text not null unique check (public_reference ~ '^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  verification_state text not null default 'draft'
    check (verification_state in ('draft','submitted','approved','rejected','suspended','expired')),
  published_profile jsonb,
  published_at timestamptz,
  verified_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  check ((individual_owner_profile_id is null) <> (organization_id is null)),
  check (category<>'lab' or organization_id is not null),
  unique (id,category),
  check ((verification_state='approved') =
    (published_profile is not null and published_at is not null and verified_until is not null))
);
create unique index providers_individual_category_uq on public.providers(individual_owner_profile_id,category)
  where individual_owner_profile_id is not null;
create unique index providers_org_category_uq on public.providers(organization_id,category)
  where organization_id is not null;
create index providers_state_category_idx on public.providers(verification_state,category);
create index providers_org_idx on public.providers(organization_id);

create table public.doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique,
  category text not null default 'doctor' check (category='doctor'),
  specialty text check (char_length(specialty)<=500),
  qualification text check (char_length(qualification)<=500),
  languages text[] check (cardinality(languages)<=10 and array_position(languages,null) is null),
  years_experience smallint check (years_experience between 0 and 70),
  bio text check (char_length(bio)<=1000),
  registration_council text check (char_length(registration_council)<=500),
  registration_number text check (char_length(registration_number)<=500),
  private_phone text check (char_length(private_phone)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  foreign key (provider_id,category) references public.providers(id,category) on delete restrict
);
create table public.lab_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique,
  category text not null default 'lab' check (category='lab'),
  accreditation_label text check (char_length(accreditation_label)<=500),
  home_collection boolean,
  bio text check (char_length(bio)<=1000),
  legal_registration_number text check (char_length(legal_registration_number)<=500),
  management_contact text check (char_length(management_contact)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  foreign key (provider_id,category) references public.providers(id,category) on delete restrict
);
create table public.ambulance_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique,
  category text not null default 'ambulance' check (category='ambulance'),
  fleet_types text[] check (fleet_types <@ array['basic','patient_transfer'] and cardinality(fleet_types)<=10),
  bio text check (char_length(bio)<=1000),
  permit_number text check (char_length(permit_number)<=500),
  dispatcher_contact text check (char_length(dispatcher_contact)<=500),
  -- Emergency dispatch stays disabled by construction.
  scheduled_only boolean not null default true check (scheduled_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  foreign key (provider_id,category) references public.providers(id,category) on delete restrict
);
create table public.caretaker_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique,
  category text not null default 'caretaker' check (category='caretaker'),
  skills text[] check (cardinality(skills)<=10 and array_position(skills,null) is null),
  languages text[] check (cardinality(languages)<=10 and array_position(languages,null) is null),
  bio text check (char_length(bio)<=1000),
  private_phone text check (char_length(private_phone)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  foreign key (provider_id,category) references public.providers(id,category) on delete restrict
);

create table public.provider_verification_cases (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  subject_profile_id uuid references public.profiles(id) on delete restrict,
  state text not null default 'draft'
    check (state in ('draft','submitted','approved','rejected','suspended','expired')),
  submitted_at timestamptz,
  submitted_provider_version integer,
  submitted_profile jsonb,
  decided_at timestamptz,
  decided_by_profile_id uuid references public.profiles(id) on delete restrict,
  reason_code text check (reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  message text check (char_length(message)<=500),
  verified_until timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique nulls not distinct (provider_id,subject_profile_id),
  check (state<>'approved' or (verified_until is not null and decided_by_profile_id is not null)),
  check (state not in ('rejected','suspended') or reason_code is not null),
  check (decided_by_profile_id is null or decided_by_profile_id is distinct from subject_profile_id)
);
create index provider_cases_state_idx on public.provider_verification_cases(state,verified_until);

create table public.provider_document_types (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  category text not null check (category in ('doctor','lab','ambulance','caretaker')),
  scope text not null check (scope in ('provider','staff')),
  owner_kind text not null check (owner_kind in ('individual','organization','any')),
  required boolean not null,
  requires_expiry boolean not null,
  check (scope='provider' or owner_kind='any')
);
-- PLACEHOLDER requirement rows (OQ-1): the owner/verification lead must confirm them.
insert into public.provider_document_types(code,category,scope,owner_kind,required,requires_expiry) values
 ('doc_government_id','doctor','provider','individual',true,false),
 ('doc_medical_registration','doctor','provider','individual',true,true),
 ('doc_qualification','doctor','provider','individual',true,false),
 ('doc_org_registration','doctor','provider','organization',true,false),
 ('doc_staff_government_id','doctor','staff','any',true,false),
 ('doc_staff_medical_registration','doctor','staff','any',true,true),
 ('lab_business_registration','lab','provider','organization',true,false),
 ('lab_accreditation','lab','provider','organization',false,true),
 ('lab_signatory_id','lab','provider','organization',true,false),
 ('lab_staff_government_id','lab','staff','any',false,false),
 ('amb_operator_permit','ambulance','provider','any',true,true),
 ('amb_government_id','ambulance','provider','individual',true,false),
 ('amb_org_registration','ambulance','provider','organization',true,false),
 ('amb_staff_driver_licence','ambulance','staff','any',true,true),
 ('amb_staff_government_id','ambulance','staff','any',true,false),
 ('care_government_id','caretaker','provider','individual',true,false),
 ('care_training_certificate','caretaker','provider','any',false,false),
 ('care_org_registration','caretaker','provider','organization',true,false),
 ('care_staff_government_id','caretaker','staff','any',true,false);

create table public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  subject_profile_id uuid references public.profiles(id) on delete restrict,
  document_type text not null references public.provider_document_types(code) on delete restrict,
  bucket text not null default 'provider-verification' check (bucket='provider-verification'),
  object_path text not null unique,
  status text not null default 'reserved'
    check (status in ('reserved','uploaded','accepted','rejected','replaced','withdrawn')),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  label text check (char_length(label)<=80),
  issued_on date,
  expires_on date,
  uploaded_by_profile_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  replaced_by_document_id uuid references public.provider_documents(id) on delete restrict,
  reviewed_by_profile_id uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason_code text check (review_reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  review_message text check (char_length(review_message)<=500),
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  check (expires_on is null or issued_on is null or expires_on>issued_on),
  check (object_path = provider_id::text||'/'||id::text),
  unique (provider_id,idempotency_key)
);
create index provider_documents_lookup_idx on public.provider_documents(provider_id,subject_profile_id,document_type,status);
create index provider_documents_expiry_idx on public.provider_documents(expires_on) where status in ('uploaded','accepted');

create table public.provider_verification_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.provider_verification_cases(id) on delete restrict,
  provider_id uuid not null references public.providers(id) on delete restrict,
  event_type text not null check (event_type in ('created','submitted','approved','rejected','suspended',
    'reinstated','expired','document_reviewed','document_accessed')),
  from_state text,
  to_state text,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('owner','org_member','subject','admin','system')),
  document_id uuid references public.provider_documents(id) on delete restrict,
  reason_code text check (reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  message text check (char_length(message)<=500),
  idempotency_key uuid,
  request_hash text,
  result_version integer,
  created_at timestamptz not null default now()
);
create unique index provider_events_idem_uq on public.provider_verification_events(case_id,idempotency_key)
  where idempotency_key is not null;
create index provider_events_provider_idx on public.provider_verification_events(provider_id,created_at);

create table public.provider_document_access_grants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.provider_documents(id) on delete restrict,
  object_path text not null,
  grantee_profile_id uuid not null references public.profiles(id) on delete restrict,
  purpose_code text not null check (purpose_code in ('owner_view','admin_review')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at = created_at + interval '60 seconds')
);
create index provider_access_grants_lookup_idx on public.provider_document_access_grants(object_path,grantee_profile_id,expires_at);

revoke all on public.providers,public.doctor_profiles,public.lab_profiles,public.ambulance_profiles,
  public.caretaker_profiles,public.provider_verification_cases,public.provider_document_types,
  public.provider_documents,public.provider_verification_events,public.provider_document_access_grants
  from public,anon,authenticated;
revoke all on private.provider_reference_counters from public,anon,authenticated;
alter table public.providers enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.lab_profiles enable row level security;
alter table public.ambulance_profiles enable row level security;
alter table public.caretaker_profiles enable row level security;
alter table public.provider_verification_cases enable row level security;
alter table public.provider_document_types enable row level security;
alter table public.provider_documents enable row level security;
alter table public.provider_verification_events enable row level security;
alter table public.provider_document_access_grants enable row level security;
-- Events are immutable even for service_role; trusted definer triggers/commands write them.
revoke insert,update,delete,truncate,trigger,references on public.provider_verification_events from service_role;
revoke insert,update,delete,truncate,trigger,references on public.provider_document_access_grants from service_role;

-- ---------------------------------------------------------------------------
-- 2. Private helpers (all definer, pinned search_path)
-- ---------------------------------------------------------------------------
create function private.provider_org(p_provider_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.providers where id=p_provider_id;
$$;

create function private.can_manage_provider(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and exists(
    select 1 from public.providers p where p.id=p_provider_id and (
      p.individual_owner_profile_id=(select auth.uid())
      or (p.organization_id is not null and private.has_org_scope(p.organization_id,'provider:manage'))));
$$;

create function private.has_review_cap(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.providers p where p.id=p_provider_id)
    and private.has_admin_capability('provider:review',private.provider_org(p_provider_id));
$$;

create function private.can_read_provider(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and exists(
    select 1 from public.providers p where p.id=p_provider_id and (
      p.individual_owner_profile_id=(select auth.uid())
      or (p.organization_id is not null and private.has_org_scope(p.organization_id,'provider:read'))
      or private.has_admin_capability('provider:review',p.organization_id)
      or private.has_admin_capability('provider:suspend',p.organization_id)));
$$;

create function private.can_edit_provider(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_provider(p_provider_id) and exists(
    select 1 from public.providers p where p.id=p_provider_id
      and p.verification_state in ('draft','rejected','expired','approved'));
$$;

create function private.is_case_subject(p_case_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and exists(
    select 1 from public.provider_verification_cases c
    where c.id=p_case_id and c.subject_profile_id=(select auth.uid()));
$$;

create function private.has_document_grant(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and exists(
    select 1 from public.provider_document_access_grants g
    where g.object_path=p_name and g.grantee_profile_id=(select auth.uid()) and g.expires_at>now());
$$;

create function private.can_upload_document_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_account() and exists(
    select 1 from public.provider_documents d
    where d.object_path=p_name and d.status='reserved'
      and d.uploaded_by_profile_id=(select auth.uid())
      and d.created_at>now()-interval '1 hour');
$$;

create function private.staff_role(p_category text) returns text
language sql immutable set search_path = '' as $$
  select case p_category when 'doctor' then 'doctor' when 'ambulance' then 'driver'
    when 'caretaker' then 'caregiver' when 'lab' then 'technician' end;
$$;

-- Used by B01/S01 definer commands. Not granted to API roles (would reveal other people's status).
create function private.provider_is_verified(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.providers p
    join public.provider_verification_cases c on c.provider_id=p.id and c.subject_profile_id is null
    where p.id=p_provider_id and p.verification_state='approved' and c.state='approved'
      and p.verified_until>now() and c.verified_until>now()
      and ((p.individual_owner_profile_id is not null and exists(
              select 1 from public.profiles pr where pr.id=p.individual_owner_profile_id and pr.status='active'))
        or (p.organization_id is not null and exists(
              select 1 from public.organizations o where o.id=p.organization_id and o.status='active'))));
$$;

create function private.person_is_verified(p_provider_id uuid,p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.provider_is_verified(p_provider_id)
    and exists(select 1 from public.profiles pr where pr.id=p_profile_id and pr.status='active')
    and exists(select 1 from public.providers p where p.id=p_provider_id and (
      p.individual_owner_profile_id=p_profile_id
      or (p.organization_id is not null
        and exists(select 1 from public.provider_verification_cases sc
          where sc.provider_id=p.id and sc.subject_profile_id=p_profile_id
            and sc.state='approved' and sc.verified_until>now())
        and exists(select 1 from public.organization_members m
          where m.organization_id=p.organization_id and m.profile_id=p_profile_id and m.status='active'
            and m.membership_role=private.staff_role(p.category)))));
$$;

create function private.next_provider_reference(p_category text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_prefix text; v_n bigint;
begin
  v_prefix:=case p_category when 'doctor' then 'DOC' when 'lab' then 'LAB' when 'ambulance' then 'AMB' when 'caretaker' then 'CARE' end;
  -- Row lock serializes allocation; gaps are acceptable and numbers are never reused.
  update private.provider_reference_counters set last_value=last_value+1 where prefix=v_prefix returning last_value into v_n;
  return 'SCV-'||v_prefix||'-'||lpad(v_n::text,6,'0');
end;
$$;

create function private.build_public_snapshot(p_provider_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  -- Allowlist only. Registration/permit/phone/contact columns are never read here.
  select jsonb_strip_nulls(jsonb_build_object('display_name',p.display_name,'category',p.category)
    || case p.category
      when 'doctor' then coalesce((select jsonb_build_object('specialty',d.specialty,'qualification',d.qualification,
          'languages',to_jsonb(d.languages),'years_experience',d.years_experience,'bio',d.bio)
          from public.doctor_profiles d where d.provider_id=p.id),'{}'::jsonb)
      when 'lab' then coalesce((select jsonb_build_object('accreditation_label',l.accreditation_label,
          'home_collection',l.home_collection,'bio',l.bio)
          from public.lab_profiles l where l.provider_id=p.id),'{}'::jsonb)
      when 'ambulance' then coalesce((select jsonb_build_object('fleet_types',to_jsonb(a.fleet_types),'bio',a.bio)
          from public.ambulance_profiles a where a.provider_id=p.id),'{}'::jsonb)
      when 'caretaker' then coalesce((select jsonb_build_object('skills',to_jsonb(c.skills),
          'languages',to_jsonb(c.languages),'bio',c.bio)
          from public.caretaker_profiles c where c.provider_id=p.id),'{}'::jsonb)
    end)
  from public.providers p where p.id=p_provider_id;
$$;

-- Number of required document types lacking an acceptable document (unexpired through p_until).
create function private.missing_required_documents(p_provider_id uuid,p_subject_id uuid,p_statuses text[],p_until date)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.providers p
  join public.provider_document_types t on t.category=p.category and t.required
    and t.scope=case when p_subject_id is null then 'provider' else 'staff' end
    and t.owner_kind in ('any',case when p.organization_id is null then 'individual' else 'organization' end)
  where p.id=p_provider_id and not exists(
    select 1 from public.provider_documents d
    where d.provider_id=p.id and d.subject_profile_id is not distinct from p_subject_id
      and d.document_type=t.code and d.status=any(p_statuses)
      and (d.expires_on is null or d.expires_on>=p_until));
$$;

-- True when the caller would be approving their own evidence.
create function private.reviewer_conflict(p_provider_id uuid,p_subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_subject_id=(select auth.uid()),false)
    or exists(select 1 from public.providers p where p.id=p_provider_id and (
      p.individual_owner_profile_id=(select auth.uid())
      or (p.organization_id is not null and exists(select 1 from public.organization_members m
        where m.organization_id=p.organization_id and m.profile_id=(select auth.uid())))))
    or exists(select 1 from public.provider_documents d
      where d.provider_id=p_provider_id and d.subject_profile_id is not distinct from p_subject_id
        and d.uploaded_by_profile_id=(select auth.uid()));
$$;

create function private.protect_provider_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id<>old.id or new.category<>old.category
    or new.individual_owner_profile_id is distinct from old.individual_owner_profile_id
    or new.organization_id is distinct from old.organization_id
    or new.public_reference<>old.public_reference then
    raise exception using errcode='42501',message='provider identity is immutable';
  end if;
  return new;
end;
$$;
create trigger protect_identity before update on public.providers
for each row execute function private.protect_provider_identity();

create function private.protect_document_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id<>old.id or new.provider_id<>old.provider_id or new.object_path<>old.object_path
    or new.bucket<>old.bucket or new.subject_profile_id is distinct from old.subject_profile_id
    or new.document_type<>old.document_type or new.mime_type<>old.mime_type
    or new.size_bytes<>old.size_bytes or new.uploaded_by_profile_id<>old.uploaded_by_profile_id then
    raise exception using errcode='42501',message='document identity is immutable';
  end if;
  return new;
end;
$$;
create trigger protect_identity before update on public.provider_documents
for each row execute function private.protect_document_identity();

create function private.bump_provider_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Content edits in an extension row change the provider version that submit binds to.
  update public.providers set updated_at=now() where id=new.provider_id;
  return null;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['providers','doctor_profiles','lab_profiles','ambulance_profiles','caretaker_profiles',
    'provider_verification_cases','provider_documents'] loop
    execute format('create trigger touch_version before update on public.%I for each row execute function private.touch_version()',v_table);
  end loop;
  foreach v_table in array array['doctor_profiles','lab_profiles','ambulance_profiles','caretaker_profiles'] loop
    execute format('create trigger bump_provider after update on public.%I for each row execute function private.bump_provider_version()',v_table);
  end loop;
end;
$$;

create trigger events_immutable before update or delete on public.provider_verification_events
for each row execute function private.reject_audit_mutation();
create trigger events_no_truncate before truncate on public.provider_verification_events
for each statement execute function private.reject_audit_mutation();
create trigger grants_immutable before update or delete on public.provider_document_access_grants
for each row execute function private.reject_audit_mutation();
create trigger grants_no_truncate before truncate on public.provider_document_access_grants
for each statement execute function private.reject_audit_mutation();

create function private.audit_provider_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_id uuid; v_boundary uuid; v_provider uuid;
  v_keys text[]:=array['provider_id','case_id','document_id','category','organization_id','individual_owner_profile_id',
    'subject_profile_id','state','verification_state','status','verified_until','document_type','reason_code',
    'decided_by_profile_id','reviewed_by_profile_id','expires_on','event_type','from_state','to_state',
    'actor_kind','review_reason_code'];
begin
  -- Allowlist only: never file paths/hashes/labels, free-text messages, registration/permit numbers,
  -- phone/contact values or JWT payloads.
  if tg_op<>'INSERT' then v_old:=to_jsonb(old); v_id:=old.id; end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new); v_id:=new.id; end if;
  v_provider:=coalesce(v_new->>'provider_id',v_old->>'provider_id')::uuid;
  if tg_table_name='providers' then
    v_boundary:=coalesce(v_new->>'organization_id',v_old->>'organization_id')::uuid;
  else
    select organization_id into v_boundary from public.providers where id=v_provider;
  end if;
  select jsonb_object_agg(key,value) into v_old from jsonb_each(v_old) where key=any(v_keys);
  select jsonb_object_agg(key,value) into v_new from jsonb_each(v_new) where key=any(v_keys);
  if tg_op='UPDATE' and v_old is not distinct from v_new then return null; end if;
  insert into public.audit_events(actor_profile_id,organization_id,action,target_table,target_id,before_state,after_state)
    values(auth.uid(),v_boundary,tg_op,tg_table_name,v_id,v_old,v_new);
  return null;
end;
$$;
do $$
declare v_table text;
begin
  foreach v_table in array array['providers','doctor_profiles','lab_profiles','ambulance_profiles','caretaker_profiles',
    'provider_verification_cases','provider_documents','provider_verification_events'] loop
    execute format('create trigger audit_provider after insert or update or delete on public.%I for each row execute function private.audit_provider_change()',v_table);
  end loop;
end;
$$;

-- Single place that mutates case state and the provider mirror, and appends the event.
create function private.transition_case(p_case_id uuid,p_to text,p_actor_kind text,p_event text,
  p_reason text,p_message text,p_verified_until timestamptz,p_snapshot jsonb,p_provider_version integer,
  p_key uuid,p_hash text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_case public.provider_verification_cases; v_from text; v_version integer;
begin
  select * into v_case from public.provider_verification_cases where id=p_case_id for update;
  if not found then raise exception using errcode='42501',message='transition denied'; end if;
  v_from:=v_case.state;
  if not ((v_from,p_to) in (('draft','submitted'),('rejected','submitted'),('expired','submitted'),
      ('approved','submitted'),('submitted','approved'),('submitted','rejected'),('approved','suspended'),
      ('suspended','approved'),('approved','expired'),('suspended','expired'))) then
    raise exception using errcode='42501',message='transition denied';
  end if;
  if p_to='submitted' then
    update public.provider_verification_cases set state='submitted',submitted_at=now(),
      submitted_provider_version=p_provider_version,submitted_profile=p_snapshot,decided_at=null,
      decided_by_profile_id=null,reason_code=null,message=null,verified_until=null,suspended_at=null
      where id=p_case_id returning version into v_version;
  elsif p_to='approved' and v_from='submitted' then
    update public.provider_verification_cases set state='approved',decided_at=now(),decided_by_profile_id=auth.uid(),
      reason_code=null,message=p_message,verified_until=p_verified_until
      where id=p_case_id returning version into v_version;
  elsif p_to='approved' then
    update public.provider_verification_cases set state='approved',decided_at=now(),decided_by_profile_id=auth.uid(),
      reason_code=null,message=p_message,suspended_at=null
      where id=p_case_id returning version into v_version;
  elsif p_to='rejected' then
    update public.provider_verification_cases set state='rejected',decided_at=now(),decided_by_profile_id=auth.uid(),
      reason_code=p_reason,message=p_message,verified_until=null
      where id=p_case_id returning version into v_version;
  elsif p_to='suspended' then
    update public.provider_verification_cases set state='suspended',decided_at=now(),decided_by_profile_id=auth.uid(),
      reason_code=p_reason,message=p_message,suspended_at=now()
      where id=p_case_id returning version into v_version;
  else
    update public.provider_verification_cases set state='expired',decided_at=now(),decided_by_profile_id=null,
      reason_code='VERIFICATION_EXPIRED',message=null
      where id=p_case_id returning version into v_version;
  end if;
  if v_case.subject_profile_id is null then
    select * into v_case from public.provider_verification_cases where id=p_case_id;
    update public.providers set verification_state=p_to,
      published_profile=case when p_to='approved' then v_case.submitted_profile end,
      published_at=case when p_to='approved' then now() end,
      verified_until=case when p_to='approved' then v_case.verified_until end
      where id=v_case.provider_id;
  end if;
  insert into public.provider_verification_events(case_id,provider_id,event_type,from_state,to_state,
    actor_profile_id,actor_kind,reason_code,message,idempotency_key,request_hash,result_version)
    values(p_case_id,v_case.provider_id,p_event,v_from,p_to,auth.uid(),p_actor_kind,p_reason,p_message,p_key,p_hash,v_version);
  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC commands. One generic denial (42501); stale versions 40001; key reuse 23505.
-- ---------------------------------------------------------------------------
create function public.create_provider(p_category text,p_organization_id uuid,p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_case uuid; v_name text:=btrim(coalesce(p_display_name,'')); v_ref text; v_kind text;
begin
  if not private.is_active_account() or p_category is null or p_category not in ('doctor','lab','ambulance','caretaker')
    or char_length(v_name) not between 1 and 160 or (p_organization_id is null and p_category='lab') then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  perform 1 from public.profiles where id=auth.uid() and status='active' for update;
  if not found then raise exception using errcode='42501',message='provider command denied'; end if;
  if p_organization_id is null then
    select id into v_id from public.providers where individual_owner_profile_id=auth.uid() and category=p_category;
    v_kind:='owner';
  else
    perform 1 from public.organizations where id=p_organization_id and status='active' for share;
    if not found or not private.has_org_scope(p_organization_id,'provider:manage') then
      raise exception using errcode='42501',message='provider command denied';
    end if;
    select id into v_id from public.providers where organization_id=p_organization_id and category=p_category;
    v_kind:='org_member';
  end if;
  if v_id is not null then return v_id; end if;
  v_ref:=private.next_provider_reference(p_category);
  insert into public.providers(category,individual_owner_profile_id,organization_id,public_reference,display_name)
    values(p_category,case when p_organization_id is null then auth.uid() end,p_organization_id,v_ref,v_name)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    -- A concurrent creator won; return the single row for this owner+category.
    select id into v_id from public.providers where category=p_category and
      (individual_owner_profile_id=auth.uid() and p_organization_id is null or organization_id=p_organization_id);
    return v_id;
  end if;
  -- Category is allowlisted above, so the extension table name is not user-controlled.
  execute format('insert into public.%I(provider_id) values($1)',p_category||'_profiles') using v_id;
  insert into public.provider_verification_cases(provider_id) values(v_id) returning id into v_case;
  insert into public.provider_verification_events(case_id,provider_id,event_type,to_state,actor_profile_id,actor_kind)
    values(v_case,v_id,'created','draft',auth.uid(),v_kind);
  return v_id;
end;
$$;

create function public.add_staff_credential_case(p_provider_id uuid,p_profile_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_provider public.providers; v_case uuid;
begin
  if not private.is_active_account() or p_provider_id is null or p_profile_id is null then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select * into v_provider from public.providers where id=p_provider_id for update;
  if not found or v_provider.organization_id is null or not private.has_org_scope(v_provider.organization_id,'provider:manage')
    or not exists(select 1 from public.organization_members m
      where m.organization_id=v_provider.organization_id and m.profile_id=p_profile_id and m.status='active'
        and m.membership_role=private.staff_role(v_provider.category))
    or not exists(select 1 from public.profiles where id=p_profile_id and status='active') then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select id into v_case from public.provider_verification_cases where provider_id=p_provider_id and subject_profile_id=p_profile_id;
  if v_case is not null then return v_case; end if;
  insert into public.provider_verification_cases(provider_id,subject_profile_id) values(p_provider_id,p_profile_id) returning id into v_case;
  insert into public.provider_verification_events(case_id,provider_id,event_type,to_state,actor_profile_id,actor_kind)
    values(v_case,p_provider_id,'created','draft',auth.uid(),'org_member');
  return v_case;
end;
$$;

create function public.register_provider_document(p_provider_id uuid,p_subject_profile_id uuid,p_document_type text,
  p_mime_type text,p_size_bytes integer,p_label text,p_issued_on date,p_expires_on date,p_idempotency_key uuid)
returns table(document_id uuid,bucket text,object_path text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_provider public.providers; v_type public.provider_document_types; v_state text; v_doc public.provider_documents; v_id uuid;
begin
  if not private.is_active_account() or p_provider_id is null or p_document_type is null or p_mime_type is null
    or p_size_bytes is null or p_idempotency_key is null then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select * into v_provider from public.providers where id=p_provider_id for share;
  if not found then raise exception using errcode='42501',message='provider command denied'; end if;
  if p_subject_profile_id is null then
    if not private.can_manage_provider(p_provider_id) then
      raise exception using errcode='42501',message='provider command denied';
    end if;
  elsif p_subject_profile_id<>auth.uid() or v_provider.organization_id is null then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select state into v_state from public.provider_verification_cases
    where provider_id=p_provider_id and subject_profile_id is not distinct from p_subject_profile_id for share;
  if not found or v_state in ('submitted','suspended') then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select * into v_type from public.provider_document_types where code=p_document_type;
  if not found or v_type.category<>v_provider.category
    or v_type.scope<>(case when p_subject_profile_id is null then 'provider' else 'staff' end)
    or v_type.owner_kind not in ('any',case when v_provider.organization_id is null then 'individual' else 'organization' end)
    or (v_type.requires_expiry and p_expires_on is null) or (p_expires_on is not null and p_expires_on<=current_date) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select * into v_doc from public.provider_documents where provider_id=p_provider_id and idempotency_key=p_idempotency_key;
  if found then
    if v_doc.document_type<>p_document_type or v_doc.subject_profile_id is distinct from p_subject_profile_id
      or v_doc.mime_type<>p_mime_type or v_doc.size_bytes<>p_size_bytes or v_doc.uploaded_by_profile_id<>auth.uid() then
      raise exception using errcode='23505',message='idempotency key reused with different arguments';
    end if;
    return query select v_doc.id,v_doc.bucket,v_doc.object_path;
    return;
  end if;
  v_id:=gen_random_uuid();
  insert into public.provider_documents(id,provider_id,subject_profile_id,document_type,object_path,mime_type,size_bytes,
    label,issued_on,expires_on,uploaded_by_profile_id,idempotency_key)
    values(v_id,p_provider_id,p_subject_profile_id,p_document_type,p_provider_id::text||'/'||v_id::text,p_mime_type,
      p_size_bytes,p_label,p_issued_on,p_expires_on,auth.uid(),p_idempotency_key)
    returning * into v_doc;
  return query select v_doc.id,v_doc.bucket,v_doc.object_path;
exception when check_violation then
  raise exception using errcode='42501',message='provider command denied';
end;
$$;

create function public.confirm_provider_document(p_document_id uuid,p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_doc public.provider_documents; v_size bigint; v_mime text; v_state text;
begin
  if not private.is_active_account() or p_document_id is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select * into v_doc from public.provider_documents where id=p_document_id and uploaded_by_profile_id=auth.uid();
  if not found then raise exception using errcode='42501',message='provider command denied'; end if;
  perform 1 from public.providers where id=v_doc.provider_id for share;
  select * into v_doc from public.provider_documents where id=p_document_id for update;
  if v_doc.status='uploaded' and v_doc.sha256=p_sha256 then return; end if;
  select state into v_state from public.provider_verification_cases
    where provider_id=v_doc.provider_id and subject_profile_id is not distinct from v_doc.subject_profile_id;
  if v_state is null or v_doc.status<>'reserved' or v_doc.created_at<=now()-interval '1 hour' or v_state in ('submitted','suspended') then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select (o.metadata->>'size')::bigint,o.metadata->>'mimetype' into v_size,v_mime
    from storage.objects o where o.bucket_id=v_doc.bucket and o.name=v_doc.object_path;
  if not found or v_size is distinct from v_doc.size_bytes or v_mime is distinct from v_doc.mime_type then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  update public.provider_documents set status='replaced',replaced_by_document_id=v_doc.id
    where provider_id=v_doc.provider_id and subject_profile_id is not distinct from v_doc.subject_profile_id
      and document_type=v_doc.document_type and status='uploaded' and id<>v_doc.id;
  update public.provider_documents set status='uploaded',sha256=p_sha256 where id=v_doc.id;
end;
$$;

create function public.withdraw_provider_document(p_document_id uuid,p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_doc public.provider_documents; v_state text;
begin
  if not private.is_active_account() or p_document_id is null or p_expected_version is null then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select * into v_doc from public.provider_documents where id=p_document_id;
  if not found then raise exception using errcode='42501',message='provider command denied'; end if;
  perform 1 from public.providers where id=v_doc.provider_id for share;
  select * into v_doc from public.provider_documents where id=p_document_id for update;
  -- coalesce: a NULL comparison must deny, never fall through an IF.
  if not coalesce((v_doc.subject_profile_id is null and private.can_manage_provider(v_doc.provider_id))
       or (v_doc.subject_profile_id is not null and v_doc.subject_profile_id=auth.uid()),false) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select state into v_state from public.provider_verification_cases
    where provider_id=v_doc.provider_id and subject_profile_id is not distinct from v_doc.subject_profile_id;
  -- Withdrawing evidence from a listed or under-review provider would leave it verified without it.
  if v_state is null or v_state not in ('draft','rejected','expired') or v_doc.status not in ('reserved','uploaded','accepted','rejected') then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  if v_doc.version<>p_expected_version then raise exception using errcode='40001',message='document version conflict'; end if;
  update public.provider_documents set status='withdrawn' where id=v_doc.id;
end;
$$;

-- p_expected_version: provider version for the provider-level case (binds the snapshot to the reviewed content);
-- case version for a staff credential case (the subject cannot read the provider row).
create function public.submit_provider_verification(p_case_id uuid,p_expected_version integer,p_idempotency_key uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_case public.provider_verification_cases; v_provider public.providers; v_ev public.provider_verification_events;
  v_hash text; v_ok boolean; v_snapshot jsonb; v_kind text;
begin
  if not private.is_active_account() or p_case_id is null or p_expected_version is null or p_idempotency_key is null then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select provider_id into v_case.provider_id from public.provider_verification_cases where id=p_case_id;
  if not found then raise exception using errcode='42501',message='provider command denied'; end if;
  select * into v_provider from public.providers where id=v_case.provider_id for update;
  select * into v_case from public.provider_verification_cases where id=p_case_id for update;
  if v_case.subject_profile_id is null then
    if not private.can_manage_provider(v_provider.id) then raise exception using errcode='42501',message='provider command denied'; end if;
    v_kind:=case when v_provider.organization_id is null then 'owner' else 'org_member' end;
  else
    if v_case.subject_profile_id<>auth.uid() or v_provider.organization_id is null
      or not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
        where m.organization_id=v_provider.organization_id and m.profile_id=auth.uid() and m.status='active'
          and o.status='active' and m.membership_role=private.staff_role(v_provider.category)) then
      raise exception using errcode='42501',message='provider command denied';
    end if;
    v_kind:='subject';
  end if;
  v_hash:=md5(p_case_id::text||':'||p_expected_version::text);
  select * into v_ev from public.provider_verification_events where case_id=p_case_id and idempotency_key=p_idempotency_key;
  if found then
    if v_ev.request_hash is distinct from v_hash or v_ev.event_type<>'submitted' then
      raise exception using errcode='23505',message='idempotency key reused with different arguments';
    end if;
    return v_ev.result_version;
  end if;
  if (case when v_case.subject_profile_id is null then v_provider.version else v_case.version end)<>p_expected_version then
    raise exception using errcode='40001',message='version conflict';
  end if;
  if v_case.state not in ('draft','rejected','expired','approved') then
    raise exception using errcode='42501',message='transition denied';
  end if;
  if v_case.subject_profile_id is null then
    v_ok:=case v_provider.category
      when 'doctor' then (select d.specialty is not null and d.qualification is not null and cardinality(d.languages)>0
        and (v_provider.organization_id is not null or (d.registration_council is not null and d.registration_number is not null))
        from public.doctor_profiles d where d.provider_id=v_provider.id)
      when 'lab' then (select l.legal_registration_number is not null and l.management_contact is not null
        from public.lab_profiles l where l.provider_id=v_provider.id)
      when 'ambulance' then (select cardinality(a.fleet_types)>0 and a.permit_number is not null and a.dispatcher_contact is not null
        from public.ambulance_profiles a where a.provider_id=v_provider.id)
      when 'caretaker' then (select cardinality(c.skills)>0 and cardinality(c.languages)>0
        from public.caretaker_profiles c where c.provider_id=v_provider.id)
    end;
    if not coalesce(v_ok,false) then raise exception using errcode='42501',message='provider profile incomplete'; end if;
    v_snapshot:=private.build_public_snapshot(v_provider.id);
  end if;
  if private.missing_required_documents(v_provider.id,v_case.subject_profile_id,array['uploaded','accepted'],current_date+1)>0 then
    raise exception using errcode='42501',message='required documents missing';
  end if;
  return private.transition_case(p_case_id,'submitted',v_kind,'submitted',null,null,null,v_snapshot,
    v_provider.version,p_idempotency_key,v_hash);
end;
$$;

create function public.review_provider_document(p_document_id uuid,p_decision text,p_reason_code text,p_message text,
  p_expected_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_doc public.provider_documents; v_case public.provider_verification_cases; v_version integer;
begin
  if not private.is_active_account() or p_document_id is null or p_decision is null
    or p_decision not in ('accepted','rejected') or p_expected_version is null
    or (p_decision='rejected' and (p_reason_code is null or p_reason_code !~ '^[A-Z][A-Z0-9_]{2,63}$'))
    or (p_reason_code is not null and p_reason_code !~ '^[A-Z][A-Z0-9_]{2,63}$')
    or char_length(coalesce(p_message,''))>500 then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select * into v_doc from public.provider_documents where id=p_document_id;
  if not found or not private.has_review_cap(v_doc.provider_id) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  perform 1 from public.providers where id=v_doc.provider_id for update;
  select * into v_case from public.provider_verification_cases
    where provider_id=v_doc.provider_id and subject_profile_id is not distinct from v_doc.subject_profile_id for update;
  select * into v_doc from public.provider_documents where id=p_document_id for update;
  if v_case.id is null or v_doc.status<>'uploaded' or v_case.state<>'submitted' or private.reviewer_conflict(v_doc.provider_id,v_doc.subject_profile_id) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  if v_doc.version<>p_expected_version then raise exception using errcode='40001',message='document version conflict'; end if;
  update public.provider_documents set status=p_decision,reviewed_by_profile_id=auth.uid(),reviewed_at=now(),
    review_reason_code=p_reason_code,review_message=p_message where id=v_doc.id returning version into v_version;
  insert into public.provider_verification_events(case_id,provider_id,event_type,from_state,to_state,actor_profile_id,
    actor_kind,document_id,reason_code,message,result_version)
    values(v_case.id,v_case.provider_id,'document_reviewed',v_case.state,v_case.state,auth.uid(),'admin',v_doc.id,
      p_reason_code,p_message,v_version);
  return v_version;
end;
$$;

create function public.decide_provider_verification(p_case_id uuid,p_decision text,p_reason_code text,p_message text,
  p_verified_until timestamptz,p_expected_version integer,p_idempotency_key uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_case public.provider_verification_cases; v_ev public.provider_verification_events; v_hash text;
begin
  if not private.is_active_account() or p_case_id is null or p_decision is null or p_decision not in ('approved','rejected')
    or p_expected_version is null or p_idempotency_key is null or char_length(coalesce(p_message,''))>500
    or (p_decision='rejected' and (p_reason_code is null or p_reason_code !~ '^[A-Z][A-Z0-9_]{2,63}$'))
    or (p_decision='approved' and (p_verified_until is null or p_verified_until<=now() or p_verified_until>now()+interval '365 days')) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select provider_id into v_case.provider_id from public.provider_verification_cases where id=p_case_id;
  if not found or not private.has_review_cap(v_case.provider_id) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  perform 1 from public.providers where id=v_case.provider_id for update;
  select * into v_case from public.provider_verification_cases where id=p_case_id for update;
  if private.reviewer_conflict(v_case.provider_id,v_case.subject_profile_id) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  v_hash:=md5(concat_ws(':',p_case_id,p_decision,p_reason_code,p_message,p_verified_until,p_expected_version));
  select * into v_ev from public.provider_verification_events where case_id=p_case_id and idempotency_key=p_idempotency_key;
  if found then
    if v_ev.request_hash is distinct from v_hash then
      raise exception using errcode='23505',message='idempotency key reused with different arguments';
    end if;
    return v_ev.result_version;
  end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='case version conflict'; end if;
  if v_case.state<>'submitted' then raise exception using errcode='42501',message='transition denied'; end if;
  if p_decision='approved' and private.missing_required_documents(v_case.provider_id,v_case.subject_profile_id,
      array['accepted'],(p_verified_until at time zone 'UTC')::date)>0 then
    raise exception using errcode='42501',message='accepted documents required';
  end if;
  return private.transition_case(p_case_id,p_decision,'admin',p_decision,p_reason_code,p_message,
    case when p_decision='approved' then p_verified_until end,null,null,p_idempotency_key,v_hash);
end;
$$;

create function public.suspend_provider(p_case_id uuid,p_reason_code text,p_message text,p_expected_version integer,
  p_idempotency_key uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_case public.provider_verification_cases; v_ev public.provider_verification_events; v_hash text;
begin
  if not private.is_active_account() or p_case_id is null or p_expected_version is null or p_idempotency_key is null
    or p_reason_code is null or p_reason_code !~ '^[A-Z][A-Z0-9_]{2,63}$' or char_length(coalesce(p_message,''))>500 then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select provider_id into v_case.provider_id from public.provider_verification_cases where id=p_case_id;
  if not found or not private.has_admin_capability('provider:suspend',private.provider_org(v_case.provider_id)) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  perform 1 from public.providers where id=v_case.provider_id for update;
  select * into v_case from public.provider_verification_cases where id=p_case_id for update;
  if private.reviewer_conflict(v_case.provider_id,v_case.subject_profile_id) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  v_hash:=md5(concat_ws(':','suspend',p_case_id,p_reason_code,p_message,p_expected_version));
  select * into v_ev from public.provider_verification_events where case_id=p_case_id and idempotency_key=p_idempotency_key;
  if found then
    if v_ev.request_hash is distinct from v_hash then
      raise exception using errcode='23505',message='idempotency key reused with different arguments';
    end if;
    return v_ev.result_version;
  end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='case version conflict'; end if;
  return private.transition_case(p_case_id,'suspended','admin','suspended',p_reason_code,p_message,null,null,null,p_idempotency_key,v_hash);
end;
$$;

create function public.reinstate_provider(p_case_id uuid,p_message text,p_expected_version integer,p_idempotency_key uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_case public.provider_verification_cases; v_ev public.provider_verification_events; v_hash text;
begin
  if not private.is_active_account() or p_case_id is null or p_expected_version is null or p_idempotency_key is null
    or char_length(coalesce(p_message,''))>500 then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  select provider_id into v_case.provider_id from public.provider_verification_cases where id=p_case_id;
  if not found or not private.has_admin_capability('provider:suspend',private.provider_org(v_case.provider_id)) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  perform 1 from public.providers where id=v_case.provider_id for update;
  select * into v_case from public.provider_verification_cases where id=p_case_id for update;
  if private.reviewer_conflict(v_case.provider_id,v_case.subject_profile_id) then
    raise exception using errcode='42501',message='provider command denied';
  end if;
  v_hash:=md5(concat_ws(':','reinstate',p_case_id,p_message,p_expected_version));
  select * into v_ev from public.provider_verification_events where case_id=p_case_id and idempotency_key=p_idempotency_key;
  if found then
    if v_ev.request_hash is distinct from v_hash then
      raise exception using errcode='23505',message='idempotency key reused with different arguments';
    end if;
    return v_ev.result_version;
  end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='case version conflict'; end if;
  -- verified_until bounds every accepted required document (checked at approval), so it is the expiry gate.
  if v_case.state<>'suspended' or v_case.verified_until is null or v_case.verified_until<=now() then
    raise exception using errcode='42501',message='transition denied';
  end if;
  return private.transition_case(p_case_id,'approved','admin','reinstated',null,p_message,null,null,null,p_idempotency_key,v_hash);
end;
$$;

create function public.authorize_provider_document_access(p_document_id uuid,p_purpose text)
returns table(bucket text,object_path text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_doc public.provider_documents; v_case public.provider_verification_cases; v_provider public.providers; v_ok boolean:=false;
begin
  if not private.is_active_account() or p_document_id is null or p_purpose is null or p_purpose not in ('owner_view','admin_review') then
    raise exception using errcode='42501',message='document access denied';
  end if;
  select * into v_doc from public.provider_documents where id=p_document_id;
  if not found or v_doc.status='reserved' then raise exception using errcode='42501',message='document access denied'; end if;
  select * into v_provider from public.providers where id=v_doc.provider_id;
  select * into v_case from public.provider_verification_cases
    where provider_id=v_doc.provider_id and subject_profile_id is not distinct from v_doc.subject_profile_id;
  if p_purpose='owner_view' then
    v_ok:=case when v_doc.subject_profile_id is null then private.can_manage_provider(v_doc.provider_id)
      else v_doc.subject_profile_id=auth.uid() end;
  else
    v_ok:=private.has_admin_capability('provider:document_read',v_provider.organization_id)
      and v_doc.status in ('uploaded','accepted')
      and (v_case.state='submitted' or (v_case.state in ('approved','suspended') and v_provider.verification_state in ('approved','suspended')));
  end if;
  if not coalesce(v_ok,false) then raise exception using errcode='42501',message='document access denied'; end if;
  insert into public.provider_document_access_grants(document_id,object_path,grantee_profile_id,purpose_code,created_at,expires_at)
    values(v_doc.id,v_doc.object_path,auth.uid(),p_purpose,now(),now()+interval '60 seconds');
  insert into public.provider_verification_events(case_id,provider_id,event_type,from_state,to_state,actor_profile_id,
    actor_kind,document_id,reason_code)
    values(v_case.id,v_doc.provider_id,'document_accessed',v_case.state,v_case.state,auth.uid(),
      case when p_purpose='admin_review' then 'admin' when v_doc.subject_profile_id is not null then 'subject'
        when v_provider.organization_id is null then 'owner' else 'org_member' end,
      v_doc.id,case when p_purpose='admin_review' then 'ADMIN_REVIEW' else 'OWNER_VIEW' end);
  return query select v_doc.bucket,v_doc.object_path;
end;
$$;

create function public.expire_due_verifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_candidate record; v_case public.provider_verification_cases; v_count integer:=0;
begin
  -- Server job only (service_role execute). Safe to repeat; the directory also rechecks expiry on read.
  -- Lock order matches every command (provider, then case); recheck after the lock and skip changed rows.
  for v_candidate in select c.id,c.provider_id from public.provider_verification_cases c
    where c.state in ('approved','suspended') and c.verified_until<=now() order by c.verified_until loop
    perform 1 from public.providers where id=v_candidate.provider_id for update;
    select * into v_case from public.provider_verification_cases where id=v_candidate.id for update;
    if v_case.state in ('approved','suspended') and v_case.verified_until<=now() then
      perform private.transition_case(v_case.id,'expired','system','expired',null,null,null,null,null,null,null);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS policies and grants
-- ---------------------------------------------------------------------------
create policy providers_read on public.providers for select to authenticated using (private.can_read_provider(id));
create policy providers_update_content on public.providers for update to authenticated
using (private.can_edit_provider(id)) with check (private.can_edit_provider(id));

create policy doctor_profiles_read on public.doctor_profiles for select to authenticated using (private.can_read_provider(provider_id));
create policy doctor_profiles_update on public.doctor_profiles for update to authenticated
using (private.can_edit_provider(provider_id)) with check (private.can_edit_provider(provider_id));
create policy lab_profiles_read on public.lab_profiles for select to authenticated using (private.can_read_provider(provider_id));
create policy lab_profiles_update on public.lab_profiles for update to authenticated
using (private.can_edit_provider(provider_id)) with check (private.can_edit_provider(provider_id));
create policy ambulance_profiles_read on public.ambulance_profiles for select to authenticated using (private.can_read_provider(provider_id));
create policy ambulance_profiles_update on public.ambulance_profiles for update to authenticated
using (private.can_edit_provider(provider_id)) with check (private.can_edit_provider(provider_id));
create policy caretaker_profiles_read on public.caretaker_profiles for select to authenticated using (private.can_read_provider(provider_id));
create policy caretaker_profiles_update on public.caretaker_profiles for update to authenticated
using (private.can_edit_provider(provider_id)) with check (private.can_edit_provider(provider_id));

create policy cases_read on public.provider_verification_cases for select to authenticated
using (private.can_read_provider(provider_id) or private.is_case_subject(id));
create policy documents_read on public.provider_documents for select to authenticated
using ((subject_profile_id is null and (private.can_manage_provider(provider_id) or private.has_review_cap(provider_id)))
  or (subject_profile_id is not null and ((subject_profile_id=(select auth.uid()) and (select private.is_active_account()))
    or private.has_review_cap(provider_id))));
create policy events_read on public.provider_verification_events for select to authenticated
using (private.can_read_provider(provider_id) or private.is_case_subject(case_id));
create policy document_types_read on public.provider_document_types for select to authenticated using (true);

grant select on public.providers,public.doctor_profiles,public.lab_profiles,public.ambulance_profiles,
  public.caretaker_profiles,public.provider_verification_cases,public.provider_document_types to authenticated;
grant select(id,provider_id,subject_profile_id,document_type,bucket,status,mime_type,size_bytes,label,issued_on,
  expires_on,uploaded_by_profile_id,replaced_by_document_id,reviewed_by_profile_id,reviewed_at,review_reason_code,
  review_message,created_at,updated_at,version) on public.provider_documents to authenticated;
grant select(id,case_id,provider_id,event_type,from_state,to_state,actor_profile_id,actor_kind,document_id,
  reason_code,message,result_version,created_at) on public.provider_verification_events to authenticated;
grant update(display_name) on public.providers to authenticated;
grant update(specialty,qualification,languages,years_experience,bio,registration_council,registration_number,private_phone)
  on public.doctor_profiles to authenticated;
grant update(accreditation_label,home_collection,bio,legal_registration_number,management_contact) on public.lab_profiles to authenticated;
grant update(fleet_types,bio,permit_number,dispatcher_contact) on public.ambulance_profiles to authenticated;
grant update(skills,languages,bio,private_phone) on public.caretaker_profiles to authenticated;

-- Public projection: only published, unexpired, verified providers with an active owner/organization.
create view public.provider_directory with (security_barrier=true) as
select p.public_reference,p.category,
  p.published_profile->>'display_name' as display_name,
  p.published_profile->>'specialty' as specialty,
  p.published_profile->>'qualification' as qualification,
  case when jsonb_typeof(p.published_profile->'languages')='array'
    then array(select jsonb_array_elements_text(p.published_profile->'languages')) end as languages,
  (p.published_profile->>'years_experience')::smallint as years_experience,
  case when jsonb_typeof(p.published_profile->'skills')='array'
    then array(select jsonb_array_elements_text(p.published_profile->'skills')) end as skills,
  case when jsonb_typeof(p.published_profile->'fleet_types')='array'
    then array(select jsonb_array_elements_text(p.published_profile->'fleet_types')) end as fleet_types,
  (p.published_profile->>'home_collection')::boolean as home_collection,
  p.published_profile->>'accreditation_label' as accreditation_label,
  p.published_profile->>'bio' as bio,
  p.published_at
from public.providers p
where p.verification_state='approved' and p.published_profile is not null and p.verified_until>now()
  and ((p.individual_owner_profile_id is not null and exists(
        select 1 from public.profiles pr where pr.id=p.individual_owner_profile_id and pr.status='active'))
    or (p.organization_id is not null and exists(
        select 1 from public.organizations o where o.id=p.organization_id and o.status='active')));
revoke all on public.provider_directory from public,anon,authenticated;
grant select on public.provider_directory to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private Storage bucket and storage.objects policies
-- ---------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('provider-verification','provider-verification',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=5242880,
  allowed_mime_types=array['application/pdf','image/jpeg','image/png'];

create policy provider_verification_insert on storage.objects for insert to authenticated
with check (bucket_id='provider-verification' and private.can_upload_document_object(name));
create policy provider_verification_select on storage.objects for select to authenticated
using (bucket_id='provider-verification' and private.has_document_grant(name));
-- No UPDATE/DELETE policy: no overwrite, upsert or deletion through API roles.

-- ---------------------------------------------------------------------------
-- 6. Function privileges (private schema is re-locked, then deliberate grants are restored)
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active_account(),private.has_patient_scope(uuid,text),
  private.has_org_scope(uuid,text),private.has_admin_capability(text,uuid),
  private.can_read_provider(uuid),private.can_edit_provider(uuid),private.can_manage_provider(uuid),
  private.has_review_cap(uuid),private.is_case_subject(uuid),private.has_document_grant(text),
  private.can_upload_document_object(text) to authenticated;

revoke all on function public.create_provider(text,uuid,text),public.add_staff_credential_case(uuid,uuid),
  public.register_provider_document(uuid,uuid,text,text,integer,text,date,date,uuid),
  public.confirm_provider_document(uuid,text),public.withdraw_provider_document(uuid,integer),
  public.submit_provider_verification(uuid,integer,uuid),
  public.review_provider_document(uuid,text,text,text,integer),
  public.decide_provider_verification(uuid,text,text,text,timestamptz,integer,uuid),
  public.suspend_provider(uuid,text,text,integer,uuid),public.reinstate_provider(uuid,text,integer,uuid),
  public.authorize_provider_document_access(uuid,text),public.expire_due_verifications()
  from public,anon,authenticated;
grant execute on function public.create_provider(text,uuid,text),public.add_staff_credential_case(uuid,uuid),
  public.register_provider_document(uuid,uuid,text,text,integer,text,date,date,uuid),
  public.confirm_provider_document(uuid,text),public.withdraw_provider_document(uuid,integer),
  public.submit_provider_verification(uuid,integer,uuid),
  public.review_provider_document(uuid,text,text,text,integer),
  public.decide_provider_verification(uuid,text,text,text,timestamptz,integer,uuid),
  public.suspend_provider(uuid,text,text,integer,uuid),public.reinstate_provider(uuid,text,integer,uuid),
  public.authorize_provider_document_access(uuid,text) to authenticated;
grant execute on function public.expire_due_verifications() to service_role;

comment on table public.providers is 'One provider per owner+category. verification_state/published_* are written only by transition_case; the directory shows only published, unexpired rows.';
comment on table public.provider_documents is 'Metadata only. object_path/sha256 are not selectable by API roles; reads need a 60-second access grant ticket.';
comment on table public.provider_verification_events is 'Append-only verification and document-access history.';
commit;
