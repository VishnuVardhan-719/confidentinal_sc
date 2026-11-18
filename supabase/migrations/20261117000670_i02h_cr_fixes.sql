-- I02 hardening CodeRabbit fixes / Kiro / integ/friend-backend. Forward migration.
-- Triage: C:\tmp\scv_logs\cr_hardening_triage.md (review of 05ec926), findings 1-5.
--  1. expire_due_providers() had no caller. Scheduled hourly with pg_cron (Supabase
--     PostgreSQL extension). Search already hides a provider at the exact expiry
--     instant (credentials_ready); the job makes the stored state canonical.
--  2. Approval snapshots only unexpired pending evidence. credentials_ready() already
--     refuses approval while uploaded pending evidence is expired, so this is defence
--     in depth: the reviewed set and the 'verified' update use the same predicate.
--  3. Coverage bounds in search use statement_timestamp(), the same clock as prices.
--  4. Keyed document replay returns the provider's current version and refuses to
--     replay a reservation that is no longer live (superseded/rejected/expired: 40001).
--  5. Concurrent expiry sweeps serialize on a transaction advisory lock, so two sweeps
--     can never take organization locks in opposite orders.
-- Findings 6/7 (lock duration of the 000620/000640 backfills) are accepted: both ran
-- before launch on near-empty tables. Replaying them on a populated database needs a
-- maintenance window.
begin;

-- 4. Same signature as 000650; CREATE OR REPLACE keeps its grants.
create or replace function public.add_provider_document(p_provider_id uuid,p_kind text,p_content_type text,p_expires_at timestamptz,
  p_expected_version integer,p_request_key uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); p public.providers; result public.provider_documents;
  doc_id uuid := gen_random_uuid(); new_version integer; prior public.idempotency_requests; request_hash text;
begin
  p := providers_private.lock_provider(p_provider_id);
  if not providers_private.access(p.id,'manage') or (p.organization_id is not null and not providers_private.org_admin(p.organization_id,'evidence:manage')) then
    raise exception using errcode='42501',message='forbidden'; end if;
  if p_request_key is not null then
    request_hash := jsonb_build_array(p_provider_id,p_kind,p_content_type,extract(epoch from p_expires_at)::text,p_expected_version)::text;
    select * into prior from public.idempotency_requests
      where actor_profile_id=actor and action='provider.document.reserve' and request_key=p_request_key;
    if found then
      select * into result from public.provider_documents where id=prior.result_id;
      if prior.request_hash is distinct from request_hash or result.provider_id is distinct from p_provider_id
        or result.kind is distinct from p_kind or result.content_type is distinct from p_content_type
        or result.expires_at is distinct from p_expires_at or result.owner_profile_id is distinct from actor then
        raise exception using errcode='23505',message='idempotency_conflict'; end if;
      -- The original reservation was replaced or closed; replaying it would hand the
      -- client a dead upload target.
      if result.status not in ('pending','verified') then
        raise exception using errcode='40001',message='conflict'; end if;
      return jsonb_build_object('document',to_jsonb(result),'provider_version',p.version);
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

-- 2. Same body as 000660 except the expiry predicate on the reviewed set.
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
      where d.provider_id=p.id and d.status='pending' and d.expires_at > now()
        and exists (select 1 from storage.objects o where o.bucket_id=d.bucket_id and o.name=d.object_name);
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

-- 5. Same body as 000650 plus the sweep-wide advisory lock.
create or replace function public.expire_due_providers() returns integer
language plpgsql security definer set search_path = '' as $$
declare candidate record; p public.providers; moved integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('i02h.expire_due_providers', 0));
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

-- 3. Same body as 000640 with statement_timestamp() on the coverage window.
create or replace function public.search_providers(p_category text, p_pin text, p_price_max text default null, p_limit integer default 20,
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
    and a.valid_from <= statement_timestamp() and a.valid_to > statement_timestamp()
  join public.pin_directory d on d.pin_code = a.pin_code
  where p.category = p_category and (p_provider_reference is null or p.public_reference = p_provider_reference)
    and identity_private.provider_publicly_bookable(p.id)
    and (p_price_max is null or v.amount_paise <= p_price_max::bigint)
    and (p_after_amount is null or (v.amount_paise, p.public_reference collate "C", s.id)
      > (p_after_amount::bigint, p_after_provider collate "C", p_after_service))
  order by v.amount_paise, p.public_reference collate "C", s.id limit p_limit;
end;
$$;

-- 1. Hourly sweep. cron.schedule() with a job name replaces an existing job of that
-- name, so a replay does not duplicate it. The job runs as the migration owner.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('i02h-expire-due-providers', '17 * * * *', 'select public.expire_due_providers()');

notify pgrst, 'reload schema';
commit;
