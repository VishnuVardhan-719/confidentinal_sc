-- I02 hardening item 6 + CodeRabbit finding 2 / Kiro / integ/friend-backend.
-- Item 6: canonical 'expired' provider state (O-I02:57, 534, 1004-1022). F keeps its
-- lazy check (provider_is_publishable already drops a provider the moment a verified
-- document expires); the service-role job below makes the state itself canonical so
-- owners, reviewers and identity_roles see 'expired' and the owner can resubmit.
-- Finding 2: add_provider_document gains an optional idempotency key. A replay must
-- match every argument (IS DISTINCT FROM) or it raises 23505; it never returns the
-- original document for different p_kind/p_content_type/p_expires_at/p_expected_version.
-- Both parts redefine add_provider_document, so they share this file.
begin;

alter table public.providers drop constraint providers_verification_state_check;
alter table public.providers add constraint providers_verification_state_check
  check (verification_state in ('draft','submitted','under_review','approved','rejected','suspended','expired'));
alter table public.provider_documents drop constraint provider_documents_status_check;
alter table public.provider_documents add constraint provider_documents_status_check
  check (status in ('pending','verified','rejected','superseded','expired'));

-- The expiry job is the only actor without a profile. NULL actor is allowed only for
-- that exact transition and audit action.
alter table public.provider_verification_events alter column actor_profile_id drop not null;
alter table public.provider_verification_events add constraint provider_verification_events_system_actor
  check (actor_profile_id is not null or (from_state = 'approved' and to_state = 'expired'));
alter table public.audit_events alter column actor_profile_id drop not null;
alter table public.audit_events add constraint audit_events_system_actor
  check (actor_profile_id is not null or action = 'provider.expired');

create or replace function providers_private.owner_editable(p_state text) returns boolean
language sql immutable set search_path = '' as $$ select p_state in ('draft','rejected','expired'); $$;

create or replace function public.update_provider(p_provider_id uuid,p_display_name text,p_description text,p_expected_version integer)
returns public.providers language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result public.providers;
begin
  result := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p_provider_id,'manage') or not providers_private.owner_editable(result.verification_state) then
    raise exception using errcode='42501',message='forbidden'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 160 or p_description is null or char_length(p_description)>2000 then
    raise exception using errcode='22023',message='invalid_input'; end if;
  update public.providers set version=version+1,updated_at=now() where id=p_provider_id and version=p_expected_version returning * into result;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
  insert into public.provider_profiles(provider_id,display_name,description)
    values(p_provider_id,btrim(p_display_name),p_description)
    on conflict (provider_id) do update set display_name=excluded.display_name,
      description=excluded.description,updated_at=now();
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'provider.updated','provider',p_provider_id);
  return result;
end;
$$;

create or replace function public.submit_provider(p_provider_id uuid,p_expected_version integer)
returns public.providers language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.providers;
begin
  p := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p.id,'manage') or not providers_private.owner_editable(p.verification_state) then
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

-- Signature change (new trailing defaulted key) needs drop + create; grants are restored below.
drop function public.add_provider_document(uuid,text,text,timestamptz,integer);
create function public.add_provider_document(p_provider_id uuid,p_kind text,p_content_type text,p_expires_at timestamptz,
  p_expected_version integer,p_request_key uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.provider_documents;
  doc_id uuid := gen_random_uuid(); new_version integer; prior public.idempotency_requests; request_hash text;
begin
  p := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p.id,'manage') or (p.organization_id is not null and not providers_private.org_admin(p.organization_id,'evidence:manage')) then
    raise exception using errcode='42501',message='forbidden'; end if;
  if p_request_key is not null then
    -- Epoch text keeps the hash independent of the session TimeZone.
    request_hash := jsonb_build_array(p_provider_id,p_kind,p_content_type,extract(epoch from p_expires_at)::text,p_expected_version)::text;
    -- The provider row lock above serializes same-key retries.
    select * into prior from public.idempotency_requests
      where actor_profile_id=actor and action='provider.document.reserve' and request_key=p_request_key;
    if found then
      select * into result from public.provider_documents where id=prior.result_id;
      if prior.request_hash is distinct from request_hash or result.provider_id is distinct from p_provider_id
        or result.kind is distinct from p_kind or result.content_type is distinct from p_content_type
        or result.expires_at is distinct from p_expires_at or result.owner_profile_id is distinct from actor then
        raise exception using errcode='23505',message='idempotency_conflict'; end if;
      return jsonb_build_object('document',to_jsonb(result),'provider_version',p_expected_version+1);
    end if;
  end if;
  if not providers_private.owner_editable(p.verification_state) then raise exception using errcode='42501',message='forbidden'; end if;
  if p_kind is null or p_kind not in ('identity','registration','licence','vehicle_permit','background_check')
    or p_content_type is null or p_content_type not in ('application/pdf','image/jpeg','image/png')
    or p_expires_at is null or p_expires_at <= now() or not isfinite(p_expires_at) or p_expires_at > now()+interval '5 years' then
    raise exception using errcode='22023',message='invalid_input'; end if;
  if (select count(*) from public.provider_documents where provider_id=p.id and status in ('pending','verified')) >= 50 then
    raise exception using errcode='23514',message='document_limit'; end if;
  update public.providers set version=version+1,updated_at=now() where id=p.id and version=p_expected_version returning version into new_version;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
  update public.provider_documents set status='superseded' where provider_id=p.id and kind=p_kind and status='pending';
  insert into public.provider_documents(id,provider_id,owner_profile_id,kind,content_type,expires_at,object_name)
    values(doc_id,p.id,actor,p_kind,p_content_type,p_expires_at,p.id::text||'/'||doc_id::text||case p_content_type
      when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end) returning * into result;
  if p_request_key is not null then
    insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
      values(actor,'provider.document.reserve',p_request_key,request_hash,doc_id);
  end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'provider.document_reserved','provider_document',doc_id);
  return jsonb_build_object('document',to_jsonb(result),'provider_version',new_version);
end;
$$;

-- Server job (service_role only). Idempotent: only approved providers holding a
-- verified document past expires_at move. Lock order matches every command:
-- organization, then provider; the condition is rechecked after the lock.
create function public.expire_due_providers() returns integer
language plpgsql security definer set search_path = '' as $$
declare candidate record; p public.providers; moved integer := 0;
begin
  for candidate in select x.id, x.organization_id from public.providers x
    where x.verification_state = 'approved' and exists (select 1 from public.provider_documents d
      where d.provider_id = x.id and d.status = 'verified' and d.expires_at <= now())
    order by x.id loop
    if candidate.organization_id is not null then
      perform 1 from public.organizations where id = candidate.organization_id for update;
    end if;
    select * into p from public.providers where id = candidate.id for update;
    if p.verification_state = 'approved' and exists (select 1 from public.provider_documents d
      where d.provider_id = p.id and d.status = 'verified' and d.expires_at <= now()) then
      update public.provider_documents set status = 'expired'
        where provider_id = p.id and status = 'verified' and expires_at <= now();
      update public.providers set verification_state = 'expired', status = 'inactive', version = version + 1, updated_at = now()
        where id = p.id returning * into p;
      insert into public.provider_verification_events(provider_id,actor_profile_id,from_state,to_state,reason,public_reason,provider_version)
        values (p.id, null, 'approved', 'expired', 'Verification document expired',
          'Verification expired. Upload current documents and resubmit.', p.version);
      insert into public.audit_events(actor_profile_id,action,target_type,target_id) values (null, 'provider.expired', 'provider', p.id);
      moved := moved + 1;
    end if;
  end loop;
  return moved;
end;
$$;

revoke all on function public.add_provider_document(uuid,text,text,timestamptz,integer,uuid), public.expire_due_providers()
  from public, anon, authenticated;
grant execute on function public.add_provider_document(uuid,text,text,timestamptz,integer,uuid) to authenticated;
grant execute on function public.expire_due_providers() to service_role;
notify pgrst, 'reload schema';
commit;
