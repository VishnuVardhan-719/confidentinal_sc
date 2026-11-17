-- I02 / Codex / task/I02-provider-onboarding / base 84321ae.
-- Depends on I01. Local synthetic target only. Forward migration; no storage table ALTER.
begin;
create schema providers_private;
revoke all on schema providers_private from public, anon, authenticated;
grant usage on schema providers_private to authenticated;

alter table public.providers drop constraint providers_verification_state_check;
update public.providers set verification_state = case verification_state
  when 'verified' then 'approved' when 'expired' then 'suspended' else verification_state end;
update public.providers set status='inactive' where status='active' and verification_state <> 'approved';
alter table public.providers add constraint providers_active_requires_approval check (status <> 'active' or verification_state='approved');
alter table public.providers add constraint providers_verification_state_check
  check (verification_state in ('draft','submitted','under_review','approved','rejected','suspended'));

create table public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique references public.providers(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('identity','registration','licence','vehicle_permit','background_check')),
  bucket_id text not null default 'provider-verification' check (bucket_id = 'provider-verification'),
  object_name text not null unique,
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  status text not null default 'pending' check (status in ('pending','verified','rejected','superseded')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (object_name = provider_id::text || '/' || id::text || case content_type
    when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end)
);
create index provider_documents_provider_idx on public.provider_documents(provider_id);
create index provider_documents_owner_idx on public.provider_documents(owner_profile_id);
create table public.provider_verification_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  from_state text not null, to_state text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  public_reason text not null,
  reviewed_document_ids uuid[] not null default '{}',
  provider_version integer not null,
  occurred_at timestamptz not null default now()
);
create index provider_verification_provider_idx on public.provider_verification_events(provider_id);
create index provider_verification_actor_idx on public.provider_verification_events(actor_profile_id);

create function providers_private.org_admin(org_id uuid, required_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select identity_private.org_scope(org_id,required_scope) and exists (
    select 1 from public.organization_members where organization_id = org_id and profile_id = auth.uid()
      and membership_role in ('owner','manager') and (membership_role='owner' or accepted_at is not null)
  );
$$;
create function providers_private.verifier(org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select identity_private.active_account() and auth.jwt()->>'aal' = 'aal2' and exists (
    select 1 from public.admin_capabilities where profile_id = auth.uid() and capability = 'provider:verify'
      and (scope_key = 'global' or scope_key = 'org:' || org_id::text)
      and valid_from <= now() and (expires_at is null or expires_at > now()) and revoked_at is null
  );
$$;
create function providers_private.access(provider uuid, purpose text) returns boolean
language sql stable security definer set search_path = '' as $$
  select identity_private.active_account() and exists (
    select 1 from public.providers p where p.id = provider and (
      p.individual_owner_profile_id = auth.uid() or
      providers_private.org_admin(p.organization_id,case when purpose = 'read' then 'provider:read'
        when purpose = 'evidence' then 'evidence:manage' else 'provider:manage' end) or
      (purpose in ('read','evidence') and providers_private.verifier(p.organization_id)
        and (purpose <> 'evidence' or p.verification_state in ('submitted','under_review')))
    )
  );
$$;
-- Membership/organization lock order matches I01. Caller first invokes require_actor.
create function providers_private.lock_provider(provider uuid) returns public.providers
language plpgsql security definer set search_path = '' as $$
declare result public.providers; org_id uuid;
begin
  -- Authorize before locking any provider, organization or membership row.
  if not providers_private.access(provider,'manage') and not exists (
    select 1 from public.providers p where p.id=provider and providers_private.verifier(p.organization_id)
  ) then raise exception using errcode='42501',message='forbidden'; end if;
  select organization_id into org_id from public.providers where id = provider;
  if org_id is not null then
    perform 1 from public.organizations where id = org_id for update;
    perform 1 from public.organization_members where organization_id = org_id and profile_id = auth.uid() for update;
  end if;
  select * into result from public.providers where id = provider for update;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  return result;
end;
$$;
create function providers_private.required_kind(category text) returns text
language sql immutable set search_path = '' as $$
  select case category when 'doctor' then 'registration' when 'lab' then 'licence'
    when 'ambulance' then 'vehicle_permit' when 'caretaker' then 'background_check' end;
$$;
-- Internal readiness only; publication also needs approval and active ownership.
create function providers_private.credentials_ready(provider uuid, verified_only boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.providers p where p.id = provider and exists (
    select 1 from public.provider_documents d join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_name
    where d.provider_id=p.id and d.kind=providers_private.required_kind(p.category)
      and d.expires_at > now() and d.status = case when verified_only then 'verified' else 'pending' end
  )) and not exists(select 1 from public.provider_documents d where d.provider_id=provider
    and d.status = case when verified_only then 'verified' else 'pending' end and (d.expires_at <= now() or not exists (
      select 1 from storage.objects o where o.bucket_id=d.bucket_id and o.name=d.object_name)));
$$;
create function public.provider_is_publishable(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.providers p where p.id=p_provider_id and p.status='active'
    and p.verification_state='approved' and exists(select 1 from public.provider_profiles where provider_id=p.id)
    and (exists(select 1 from public.profiles where id=p.individual_owner_profile_id and status='active')
      or exists(select 1 from public.organizations where id=p.organization_id and status='active'))
    and providers_private.credentials_ready(p.id,true));
$$;

do $$ declare t text; begin
  foreach t in array array['provider_profiles','provider_documents','provider_verification_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy provider_profiles_read on public.provider_profiles for select to authenticated
  using (providers_private.access(provider_id,'read'));
create policy provider_documents_read on public.provider_documents for select to authenticated
  using (providers_private.access(provider_id,'evidence'));
create policy provider_events_read on public.provider_verification_events for select to authenticated
  using (providers_private.access(provider_id,'read'));
create policy providers_verifier_read on public.providers for select to authenticated
  using (providers_private.verifier(organization_id));

create function public.create_provider(p_category text,p_display_name text,p_description text,p_organization_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result uuid;
begin
  if p_category is null or p_category not in ('doctor','lab','ambulance','caretaker') or p_display_name is null
    or char_length(btrim(p_display_name)) not between 1 and 160 or p_description is null or char_length(p_description)>2000 then
    raise exception using errcode='22023',message='invalid_input'; end if;
  if p_organization_id is not null then
    if not providers_private.org_admin(p_organization_id,'provider:manage') then
      raise exception using errcode='42501',message='forbidden'; end if;
    perform 1 from public.organizations where id=p_organization_id for update;
    perform 1 from public.organization_members where organization_id=p_organization_id and profile_id=actor for update;
    if not providers_private.org_admin(p_organization_id,'provider:manage') then
      raise exception using errcode='42501',message='forbidden'; end if;
  end if;
  insert into public.providers(individual_owner_profile_id,organization_id,category)
    values(case when p_organization_id is null then actor end,p_organization_id,p_category) returning id into result;
  insert into public.provider_profiles(provider_id,display_name,description) values(result,btrim(p_display_name),p_description);
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'provider.created','provider',result);
  return result;
end;
$$;
create function public.update_provider(p_provider_id uuid,p_display_name text,p_description text,p_expected_version integer)
returns public.providers language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result public.providers;
begin
  result := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p_provider_id,'manage') or result.verification_state not in ('draft','rejected') then
    raise exception using errcode='42501',message='forbidden'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 160 or p_description is null or char_length(p_description)>2000 then
    raise exception using errcode='22023',message='invalid_input'; end if;
  update public.providers set version=version+1,updated_at=now() where id=p_provider_id and version=p_expected_version returning * into result;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
  -- I01 provider skeletons may not yet have an onboarding profile. Preserve the
  -- same authorization/version gate while creating or updating their first data.
  insert into public.provider_profiles(provider_id,display_name,description)
    values(p_provider_id,btrim(p_display_name),p_description)
    on conflict (provider_id) do update set display_name=excluded.display_name,
      description=excluded.description,updated_at=now();
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'provider.updated','provider',p_provider_id);
  return result;
end;
$$;
create function public.add_provider_document(p_provider_id uuid,p_kind text,p_content_type text,p_expires_at timestamptz,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.provider_documents; doc_id uuid := gen_random_uuid(); new_version integer;
begin
  p := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p.id,'manage') or (p.organization_id is not null and not providers_private.org_admin(p.organization_id,'evidence:manage'))
    or p.verification_state not in ('draft','rejected') then raise exception using errcode='42501',message='forbidden'; end if;
  if p_kind is null or p_kind not in ('identity','registration','licence','vehicle_permit','background_check')
    or p_content_type is null or p_content_type not in ('application/pdf','image/jpeg','image/png')
    or p_expires_at is null or p_expires_at <= now() or not isfinite(p_expires_at) or p_expires_at > now()+interval '5 years' then
    raise exception using errcode='22023',message='invalid_input'; end if;
  if (select count(*) from public.provider_documents where provider_id=p.id) >= 50 then
    raise exception using errcode='23514',message='document_limit'; end if;
  update public.providers set version=version+1,updated_at=now() where id=p.id and version=p_expected_version returning version into new_version;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
  update public.provider_documents set status='superseded' where provider_id=p.id and kind=p_kind and status='pending';
  insert into public.provider_documents(id,provider_id,owner_profile_id,kind,content_type,expires_at,object_name)
    values(doc_id,p.id,actor,p_kind,p_content_type,p_expires_at,p.id::text||'/'||doc_id::text||case p_content_type
      when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end) returning * into result;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'provider.document_reserved','provider_document',doc_id);
  return jsonb_build_object('document',to_jsonb(result),'provider_version',new_version);
end;
$$;
create function public.submit_provider(p_provider_id uuid,p_expected_version integer)
returns public.providers language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.providers;
begin
  p := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p.id,'manage') or p.verification_state not in ('draft','rejected') then
    raise exception using errcode='42501',message='forbidden'; end if;
  if not exists(select 1 from public.provider_profiles where provider_id=p.id) then
    raise exception using errcode='23514',message='provider_profile_required'; end if;
  if not providers_private.credentials_ready(p.id,false) then raise exception using errcode='23514',message='credentials_required'; end if;
  update public.providers set verification_state='submitted',status='inactive',version=version+1,updated_at=now()
    where id=p.id and version=p_expected_version returning * into result;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
  insert into public.provider_verification_events(provider_id,actor_profile_id,from_state,to_state,reason,public_reason,provider_version)
    values(p.id,actor,p.verification_state,'submitted','Provider submitted application','Application submitted.',result.version);
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'provider.submitted','provider',p.id);
  return result;
end;
$$;
create function public.review_provider(p_provider_id uuid,p_decision text,p_reason text,p_expected_version integer)
returns public.providers language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.providers; reviewed_ids uuid[] := '{}';
begin
  p := providers_private.lock_provider(p_provider_id);
  perform 1 from public.admin_capabilities where profile_id=actor and capability='provider:verify' for share;
  if not providers_private.verifier(p.organization_id) or p.individual_owner_profile_id=actor
    or exists(select 1 from public.organization_members where organization_id=p.organization_id and profile_id=actor)
    or exists(select 1 from public.provider_documents where provider_id=p.id and owner_profile_id=actor) then
    raise exception using errcode='42501',message='forbidden'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 or p_decision is null or not (
    (p.verification_state in ('submitted','suspended') and p_decision='under_review') or
    (p.verification_state='under_review' and p_decision in ('approved','rejected')) or
    (p.verification_state='approved' and p_decision='suspended')
  ) then raise exception using errcode='22023',message='invalid_transition'; end if;
  if p_decision='approved' and not providers_private.credentials_ready(p.id,false) then
    raise exception using errcode='23514',message='credentials_required'; end if;
  update public.providers set verification_state=p_decision,
    status=case p_decision when 'approved' then 'active' when 'suspended' then 'suspended' else 'inactive' end,
    version=version+1,updated_at=now() where id=p.id and version=p_expected_version returning * into result;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
  if p_decision='approved' then
    select coalesce(array_agg(d.id order by d.id),'{}'::uuid[]) into reviewed_ids from public.provider_documents d
      where d.provider_id=p.id and d.status='pending' and exists (select 1 from storage.objects o where o.bucket_id=d.bucket_id and o.name=d.object_name);
  end if;
  if p_decision in ('approved','rejected') then
    update public.provider_documents set status=case p_decision when 'approved' then 'verified' else 'rejected' end
      where provider_id=p.id and status='pending' and (p_decision='rejected' or id=any(reviewed_ids));
  elsif p_decision='under_review' and p.verification_state='suspended' then
    update public.provider_documents set status='pending' where provider_id=p.id and status='verified';
  end if;
  insert into public.provider_verification_events(provider_id,actor_profile_id,from_state,to_state,reason,public_reason,reviewed_document_ids,provider_version)
    values(p.id,actor,p.verification_state,p_decision,btrim(p_reason),case p_decision
      when 'under_review' then 'Application under review.' when 'approved' then 'Application approved.'
      when 'rejected' then 'Application rejected. Contact support for next steps.' else 'Provider suspended. Contact support for next steps.' end,reviewed_ids,result.version);
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'provider.'||p_decision,'provider',p.id);
  return result;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('provider-verification','provider-verification',false,10485760,array['application/pdf','image/jpeg','image/png']);

create function providers_private.object_access(bucket text,object_path text,writing boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select bucket='provider-verification' and exists (
    select 1 from public.provider_documents d join public.providers p on p.id=d.provider_id
    where d.bucket_id=bucket and d.object_name=object_path and (
      (not writing and providers_private.access(p.id,'evidence')) or
      (writing and d.owner_profile_id=auth.uid() and d.status='pending' and p.verification_state in ('draft','rejected')
        and providers_private.access(p.id,'manage')
        and (p.organization_id is null or providers_private.org_admin(p.organization_id,'evidence:manage')))
    )
  );
$$;
drop policy i01_objects_locked on storage.objects;
drop policy i01_buckets_locked on storage.buckets;
-- Restrictive guards constrain any existing/future permissive policies to this bucket.
create policy i02_objects_guard on storage.objects as restrictive for all to anon,authenticated
  using (providers_private.object_access(bucket_id,name,false)) with check (providers_private.object_access(bucket_id,name,true));
create policy i02_objects_read on storage.objects for select to authenticated using (providers_private.object_access(bucket_id,name,false));
create policy i02_objects_insert on storage.objects for insert to authenticated with check (providers_private.object_access(bucket_id,name,true));
-- Immutable objects: prohibit UPDATE/upsert/DELETE even if another permissive policy exists.
create policy i02_objects_no_update on storage.objects as restrictive for update to anon,authenticated using(false) with check(false);
create policy i02_objects_no_delete on storage.objects as restrictive for delete to anon,authenticated using(false);
create policy i02_buckets_locked on storage.buckets as restrictive for all to anon,authenticated using(false) with check(false);

revoke all on all functions in schema providers_private from public,anon,authenticated;
grant execute on function providers_private.access(uuid,text),providers_private.verifier(uuid),providers_private.object_access(text,text,boolean) to authenticated;
revoke all on function public.create_provider(text,text,text,uuid),public.update_provider(uuid,text,text,integer),
  public.add_provider_document(uuid,text,text,timestamptz,integer),public.submit_provider(uuid,integer),public.review_provider(uuid,text,text,integer),public.provider_is_publishable(uuid) from public,anon,authenticated;
grant execute on function public.create_provider(text,text,text,uuid),public.update_provider(uuid,text,text,integer),
  public.add_provider_document(uuid,text,text,timestamptz,integer),public.submit_provider(uuid,integer),public.review_provider(uuid,text,text,integer),public.provider_is_publishable(uuid) to authenticated;
-- Only boolean eligibility is available to guests. No public rows or catalog in I02.
grant execute on function public.provider_is_publishable(uuid) to anon;
-- Forward security correction: user JWTs cannot enforce a maximum expiresIn on
-- Storage signing. Deny signing, including signed upload grants, until a separate
-- reviewed signing design exists. Authenticated download/upload still use RLS.
create policy i02_no_signing on storage.objects as restrictive for all to anon,authenticated
  using (coalesce(storage.operation(),'') not in ('storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign'))
  with check (coalesce(storage.operation(),'') not in ('storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign'));
-- Provider-safe projection applies to direct REST requests as well as app routes.
revoke select on public.provider_verification_events from authenticated;
grant select(id,provider_id,from_state,to_state,public_reason,reviewed_document_ids,provider_version,occurred_at)
  on public.provider_verification_events to authenticated;

create or replace function public.identity_roles() returns setof text
language sql stable security definer set search_path = '' as $$
  select 'patient'::text where identity_private.active_account()
  union
  select p.category from public.providers p where identity_private.active_account()
    and p.status='active' and p.verification_state='approved' and public.provider_is_publishable(p.id)
    and (p.individual_owner_profile_id=auth.uid() or identity_private.org_scope(p.organization_id,'provider:read'))
  union
  select 'admin'::text where identity_private.active_account() and auth.jwt()->>'aal'='aal2' and exists (
    select 1 from public.admin_capabilities c where c.profile_id=auth.uid() and c.revoked_at is null
      and c.scope_key='global' and c.capability in ('provider:verify','coverage:verify','membership:admin')
      and c.valid_from<=now() and (c.expires_at is null or c.expires_at>now())
  );
$$;

create function providers_private.immutable_event() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception using errcode='55000',message='immutable_event'; end;
$$;
revoke all on function providers_private.immutable_event() from public,anon,authenticated;
create trigger i02_audit_immutable before update or delete on public.audit_events
  for each row execute function providers_private.immutable_event();
create trigger i02_verification_immutable before update or delete on public.provider_verification_events
  for each row execute function providers_private.immutable_event();
create trigger i02_audit_no_truncate before truncate on public.audit_events
  for each statement execute function providers_private.immutable_event();
create trigger i02_verification_no_truncate before truncate on public.provider_verification_events
  for each statement execute function providers_private.immutable_event();

commit;
