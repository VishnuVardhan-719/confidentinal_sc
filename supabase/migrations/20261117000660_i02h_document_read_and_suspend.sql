-- I02 hardening item 7 + CodeRabbit finding 1 / Kiro / integ/friend-backend.
-- Ports O-I02:10-13, 248-257, 969-1001 onto F:
--  * provider:document_read and provider:suspend are separate from provider:verify.
--    Verifiers decide; only document readers open files; only suspenders suspend.
--  * Every file read is authorized and audited: authorize_provider_document_read issues
--    a 60 s ticket and writes an audit row. The Storage SELECT path requires a live
--    ticket AND re-evaluates the same authorization at read time.
-- Finding 1 (CWE-863): F's signing ban (i02_no_signing, F-2:304-309) is kept unchanged,
-- so no URL can outlive the ticket. Reads happen only through authenticated Storage
-- downloads, which evaluate this policy on every request.
begin;

alter table public.admin_capabilities drop constraint admin_capabilities_capability_check;
alter table public.admin_capabilities add constraint admin_capabilities_capability_check
  check (capability in ('provider:verify','provider:document_read','provider:suspend',
    'coverage:verify','security:audit','membership:admin'));

-- Forward fix: an absent aal claim made F's verifier return NULL instead of false
-- (same defect C01 fixed for catalog_private.verifier). NULL inside "if not ..." skips the raise.
create or replace function providers_private.verifier(org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(identity_private.has_capability('provider:verify', org_id), false);
$$;
create function providers_private.suspender(org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(identity_private.has_capability('provider:suspend', org_id), false);
$$;

-- Lock order unchanged (organization, membership, provider). Suspenders may now lock.
create or replace function providers_private.lock_provider(provider uuid) returns public.providers
language plpgsql security definer set search_path = '' as $$
declare result public.providers; org_id uuid;
begin
  if not providers_private.access(provider,'manage') and not exists (
    select 1 from public.providers p where p.id=provider
      and (providers_private.verifier(p.organization_id) or providers_private.suspender(p.organization_id))
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

create or replace function public.review_provider(p_provider_id uuid,p_decision text,p_reason text,p_expected_version integer)
returns public.providers language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.providers; reviewed_ids uuid[] := '{}';
  needed text := case when p_decision = 'suspended' then 'provider:suspend' else 'provider:verify' end;
begin
  p := providers_private.lock_provider(p_provider_id);
  perform 1 from public.admin_capabilities where profile_id=actor and capability=needed for share;
  if not coalesce(identity_private.has_capability(needed, p.organization_id), false) or p.individual_owner_profile_id=actor
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

-- Append-only read tickets. Not in an exposed schema; service_role has no usage on it.
create table providers_private.document_read_tickets (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.provider_documents(id) on delete restrict,
  object_name text not null,
  grantee_profile_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null check (purpose in ('owner_view','admin_review')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at = created_at + interval '60 seconds')
);
create index document_read_tickets_lookup_idx on providers_private.document_read_tickets(object_name, grantee_profile_id, expires_at);
create index document_read_tickets_document_idx on providers_private.document_read_tickets(document_id);
create index document_read_tickets_grantee_idx on providers_private.document_read_tickets(grantee_profile_id);
alter table providers_private.document_read_tickets enable row level security;
revoke all on providers_private.document_read_tickets from public, anon, authenticated;
create trigger i02h_ticket_immutable before update or delete on providers_private.document_read_tickets
  for each row execute function providers_private.immutable_event();
create trigger i02h_ticket_no_truncate before truncate on providers_private.document_read_tickets
  for each statement execute function providers_private.immutable_event();

-- Single authorization rule used at ticket issue time and again at every read.
-- owner_view: individual owner, or owner/manager with evidence:manage.
-- admin_review: provider:document_read (aal2, scoped) while the case is under review,
-- never for the owner, an organization member or the document's uploader.
create function providers_private.document_read_allowed(p_document_id uuid, p_purpose text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(identity_private.active_account() and exists (
    select 1 from public.provider_documents d join public.providers p on p.id = d.provider_id
    where d.id = p_document_id and (
      (p_purpose = 'owner_view' and (p.individual_owner_profile_id = auth.uid()
        or providers_private.org_admin(p.organization_id, 'evidence:manage')))
      or (p_purpose = 'admin_review' and d.status in ('pending','verified')
        and p.verification_state in ('submitted','under_review')
        and identity_private.has_capability('provider:document_read', p.organization_id)
        and p.individual_owner_profile_id is distinct from auth.uid()
        and d.owner_profile_id <> auth.uid()
        and not exists (select 1 from public.organization_members m
          where m.organization_id = p.organization_id and m.profile_id = auth.uid())))), false);
$$;

create function public.authorize_provider_document_read(p_document_id uuid, p_purpose text)
returns table(bucket text, object_path text, ticket_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); doc public.provider_documents; ticket providers_private.document_read_tickets;
begin
  if p_document_id is null or p_purpose is null or p_purpose not in ('owner_view','admin_review')
    or not providers_private.document_read_allowed(p_document_id, p_purpose) then
    raise exception using errcode='42501',message='forbidden'; end if;
  select * into doc from public.provider_documents d where d.id = p_document_id;
  -- Reservations without bytes have nothing to read; same answer as unauthorized.
  if not exists (select 1 from storage.objects o where o.bucket_id = doc.bucket_id and o.name = doc.object_name) then
    raise exception using errcode='42501',message='forbidden'; end if;
  insert into providers_private.document_read_tickets(document_id, object_name, grantee_profile_id, purpose, created_at, expires_at)
    values (doc.id, doc.object_name, actor, p_purpose, now(), now() + interval '60 seconds') returning * into ticket;
  insert into public.audit_events(actor_profile_id, action, target_type, target_id)
    values (actor, 'provider.document_read_' || p_purpose, 'provider_document', doc.id);
  return query select doc.bucket_id, doc.object_name, ticket.expires_at;
end;
$$;

-- Storage guard. Reads need a live ticket for this caller and object, and the ticket's
-- purpose must still be authorized now (revoked capability or state change ends access
-- inside the 60 s window). Writes are unchanged except for the 'expired' editable state.
create or replace function providers_private.object_access(bucket text,object_path text,writing boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(bucket='provider-verification' and exists (
    select 1 from public.provider_documents d join public.providers p on p.id=d.provider_id
    where d.bucket_id=bucket and d.object_name=object_path and (
      (not writing and exists (select 1 from providers_private.document_read_tickets t
        where t.document_id = d.id and t.object_name = d.object_name and t.grantee_profile_id = auth.uid()
          and t.expires_at > now() and providers_private.document_read_allowed(d.id, t.purpose))) or
      (writing and d.owner_profile_id=auth.uid() and d.status='pending' and providers_private.owner_editable(p.verification_state)
        and providers_private.access(p.id,'manage')
        and (p.organization_id is null or providers_private.org_admin(p.organization_id,'evidence:manage')))
    )
  ), false);
$$;

-- Metadata and provider-row visibility for the two new admin capabilities.
create function providers_private.admin_reader(org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select providers_private.suspender(org_id) or coalesce(identity_private.has_capability('provider:document_read', org_id), false);
$$;
create function providers_private.document_reader_for(provider uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.providers p where p.id = provider
    and p.verification_state in ('submitted','under_review')
    and coalesce(identity_private.has_capability('provider:document_read', p.organization_id), false));
$$;
create policy providers_admin_reader_read on public.providers for select to authenticated
  using (providers_private.admin_reader(organization_id));
drop policy provider_documents_read on public.provider_documents;
create policy provider_documents_read on public.provider_documents for select to authenticated
  using (providers_private.access(provider_id,'evidence') or providers_private.document_reader_for(provider_id));

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
      and c.scope_key='global' and c.capability in ('provider:verify','provider:document_read','provider:suspend','coverage:verify','membership:admin')
      and c.valid_from<=now() and (c.expires_at is null or c.expires_at>now())
  );
$$;

revoke all on function providers_private.suspender(uuid), providers_private.document_read_allowed(uuid,text),
  providers_private.admin_reader(uuid), providers_private.document_reader_for(uuid) from public, anon, authenticated;
-- Used directly by RLS policies, so the caller role needs EXECUTE. document_read_allowed
-- and suspender are only called inside definer functions and stay ungranted.
grant execute on function providers_private.admin_reader(uuid), providers_private.document_reader_for(uuid) to authenticated;
revoke all on function public.authorize_provider_document_read(uuid,text) from public, anon, authenticated;
grant execute on function public.authorize_provider_document_read(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
