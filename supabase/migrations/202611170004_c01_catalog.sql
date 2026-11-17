-- C01 / task/C01-catalog / base 6c317735. Depends on I01 and I02.
-- No reference/coverage seeds. Trusted operator imports require approved sources.
begin;
create extension if not exists btree_gist with schema extensions;
create schema catalog_private;
revoke all on schema catalog_private from public, anon, authenticated;
grant usage on schema catalog_private to authenticated;

create table public.service_catalog_types (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 category text not null check(category in ('doctor','lab','ambulance','caretaker')),
 name text not null check(char_length(btrim(name)) between 1 and 160),
 unit text not null check(unit in ('visit','test','trip','hour','day')),
 unique(id,category), unique(id,unit)
);
create table public.pin_directory (
 id uuid primary key default gen_random_uuid(), pin_code text not null unique check(pin_code ~ '^[1-9][0-9]{5}$'),
 state text not null, district text not null, city text not null,
 source_reference text not null check(char_length(btrim(source_reference))>0)
);
create table public.services (
 id uuid primary key default gen_random_uuid(), provider_id uuid not null, category text not null,
 catalog_type_id uuid not null, title text not null check(char_length(btrim(title)) between 1 and 160),
 description text not null default '' check(char_length(description)<=2000),
 duration_minutes integer not null check(duration_minutes between 1 and 10080),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(provider_id,category) references public.providers(id,category) on delete restrict,
 foreign key(catalog_type_id,category) references public.service_catalog_types(id,category) on delete restrict,
 unique(id,catalog_type_id)
);
create index c01_services_provider on public.services(provider_id);
create table public.service_price_versions (
 id uuid primary key default gen_random_uuid(), service_id uuid not null, catalog_type_id uuid not null,
 version integer not null check(version>0), amount_paise bigint not null check(amount_paise between 0 and 10000000000),
 currency text not null default 'INR' check(currency='INR'), unit text not null,
 terms_version text not null check(char_length(btrim(terms_version)) between 1 and 160),
 effective_from timestamptz not null, effective_to timestamptz,
 created_at timestamptz not null default now(),
 check(isfinite(effective_from) and (effective_to is null or (isfinite(effective_to) and effective_to>effective_from))),
 foreign key(service_id,catalog_type_id) references public.services(id,catalog_type_id) on delete restrict,
 foreign key(catalog_type_id,unit) references public.service_catalog_types(id,unit) on delete restrict,
 unique(service_id,version),
 exclude using gist (service_id with =, tstzrange(effective_from,effective_to,'[)') with &&)
);
create table public.provider_service_areas (
 id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.providers(id) on delete restrict,
 pin_code text not null references public.pin_directory(pin_code) on delete restrict,
 proposed_by uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'proposed' check(status in ('proposed','approved','rejected','revoked')),
 valid_from timestamptz, valid_to timestamptz,
 approved_by uuid references public.profiles(id) on delete restrict, approved_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status<>'approved' or (approved_by is not null and approved_at is not null and valid_from is not null and valid_to is not null)),
 check(valid_from is null or isfinite(valid_from)), check(valid_to is null or (isfinite(valid_to) and valid_to>valid_from and valid_to<=valid_from+interval '12 months'))
);
create unique index c01_area_current on public.provider_service_areas(provider_id,pin_code) where status in ('proposed','approved');
create index c01_area_pin on public.provider_service_areas(pin_code,provider_id);
-- Separate proposal counter: never changes the I02 onboarding aggregate version.
create table public.provider_catalog_counters (
 id uuid primary key default gen_random_uuid(),
 provider_id uuid not null unique references public.providers(id) on delete restrict,
 coverage_version integer not null default 1 check(coverage_version>0)
);
create table public.coverage_review_events (
 id uuid primary key default gen_random_uuid(), area_id uuid not null references public.provider_service_areas(id) on delete restrict,
 actor_profile_id uuid not null references public.profiles(id) on delete restrict,
 from_status text not null, to_status text not null,
 reason text not null check(char_length(btrim(reason)) between 1 and 1000),
 area_version integer not null, occurred_at timestamptz not null default now()
);
create index c01_reviews_area on public.coverage_review_events(area_id);

create function catalog_private.verifier(org_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select identity_private.active_account() and auth.jwt()->>'aal'='aal2' and exists(
  select 1 from public.admin_capabilities where profile_id=auth.uid() and capability='coverage:verify'
  and (scope_key='global' or scope_key='org:'||org_id::text)
  and valid_from<=now() and (expires_at is null or expires_at>now()) and revoked_at is null);
$$;
-- I02 access('read') also includes provider verifiers; catalog private rows are
-- deliberately scoped to owners/managers and coverage reviewers instead.
create function catalog_private.can_read(provider uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.providers p where p.id=provider and
 (p.individual_owner_profile_id=auth.uid() or providers_private.org_admin(p.organization_id,'provider:read')));
$$;
create function catalog_private.lock_manager(provider uuid) returns public.providers
language plpgsql security definer set search_path='' as $$
declare result public.providers;
begin
 if not providers_private.access(provider,'manage') then raise exception using errcode='42501',message='forbidden'; end if;
 result := providers_private.lock_provider(provider);
 if not providers_private.access(provider,'manage') or result.status='suspended' or result.verification_state='suspended' then
  raise exception using errcode='42501',message='forbidden'; end if;
 return result;
end $$;
create function catalog_private.price_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if old.effective_to is null and new.effective_to is not null
    and (to_jsonb(new)-'effective_to')=(to_jsonb(old)-'effective_to') then return new; end if;
 end if;
 raise exception using errcode='55000',message='immutable_price';
end $$;
create trigger c01_price_immutable before update or delete on public.service_price_versions
 for each row execute function catalog_private.price_immutable();
create trigger c01_price_no_truncate before truncate on public.service_price_versions
 for each statement execute function providers_private.immutable_event();
create trigger c01_review_immutable before update or delete on public.coverage_review_events
 for each row execute function providers_private.immutable_event();
create trigger c01_review_no_truncate before truncate on public.coverage_review_events
 for each statement execute function providers_private.immutable_event();

-- Authoritative minimum discovery eligibility; availability is B01, not promised.
create function identity_private.provider_publicly_bookable(provider uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.provider_is_publishable(provider)
 and exists(select 1 from public.services s join public.service_price_versions v on v.service_id=s.id
  where s.provider_id=provider and s.status='published' and v.effective_from<=now() and (v.effective_to is null or v.effective_to>now()))
 and exists(select 1 from public.provider_service_areas a where a.provider_id=provider and a.status='approved'
  and a.valid_from<=now() and a.valid_to>now());
$$;
create function public.search_providers(p_category text,p_pin text,p_price_max text default null,p_limit integer default 20,
 p_after_amount text default null,p_after_provider uuid default null,p_after_service uuid default null,p_provider_id uuid default null)
returns table(provider_id uuid,category text,display_name text,service_id uuid,service_title text,duration_minutes integer,
 amount_paise text,currency text,unit text,terms_version text,pin_code text,city text,advisory_availability text)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_category is null or p_category not in ('doctor','lab','ambulance','caretaker') or p_pin is null or p_pin !~ '^[1-9][0-9]{5}$'
  or p_limit is null or p_limit not between 1 and 50 or
  (p_price_max is not null and (p_price_max !~ '^(0|[1-9][0-9]{0,18})$' or p_price_max::numeric>10000000000)) or
  (num_nonnulls(p_after_amount,p_after_provider,p_after_service) not in (0,3)) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if p_after_amount is not null and (p_after_amount !~ '^(0|[1-9][0-9]{0,18})$' or p_after_amount::numeric>10000000000) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 return query select p.id,p.category,pp.display_name,s.id,s.title,s.duration_minutes,v.amount_paise::text,v.currency,v.unit,v.terms_version,a.pin_code,d.city,null::text
 from public.providers p join public.provider_profiles pp on pp.provider_id=p.id
 join public.services s on s.provider_id=p.id and s.status='published'
 join public.service_price_versions v on v.service_id=s.id and v.effective_from<=now() and (v.effective_to is null or v.effective_to>now())
 join public.provider_service_areas a on a.provider_id=p.id and a.pin_code=p_pin and a.status='approved' and a.valid_from<=now() and a.valid_to>now()
 join public.pin_directory d on d.pin_code=a.pin_code
 where p.category=p_category and (p_provider_id is null or p.id=p_provider_id) and identity_private.provider_publicly_bookable(p.id)
 and (p_price_max is null or v.amount_paise<=p_price_max::bigint)
 and (p_after_amount is null or (v.amount_paise,p.id,s.id)>(p_after_amount::bigint,p_after_provider,p_after_service))
 order by v.amount_paise,p.id,s.id limit p_limit;
end $$;
create function public.get_public_provider(p_provider_id uuid,p_category text,p_pin text)
returns table(provider_id uuid,category text,display_name text,service_id uuid,service_title text,duration_minutes integer,
 amount_paise text,currency text,unit text,terms_version text,pin_code text,city text,advisory_availability text)
language sql stable security definer set search_path='' as $$
 select * from public.search_providers(p_category,p_pin,null,50,null,null,null,p_provider_id);
$$;

-- expected_version=0 creates; category and owner are derived, never trusted input.
create function public.upsert_service(p_provider_id uuid,p_catalog_type_id uuid,p_title text,p_description text,
 p_duration_minutes integer,p_status text,p_expected_version integer,p_service_id uuid default null,p_request_key uuid default null)
returns public.services language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.providers; result public.services; prior public.idempotency_requests;
 request_hash text:=jsonb_build_array(p_provider_id,p_catalog_type_id,p_title,p_description,p_duration_minutes,p_status)::text;
begin
 p:=catalog_private.lock_manager(p_provider_id);
 if p_title is null or char_length(btrim(p_title)) not between 1 and 160 or p_description is null or char_length(p_description)>2000
  or p_duration_minutes is null or p_duration_minutes not between 1 and 10080 or p_status is null or p_status not in ('draft','published','archived') then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if p_service_id is null then
  if p_request_key is null or p_expected_version is distinct from 0 then raise exception using errcode='22023',message='invalid_input'; end if;
  select * into prior from public.idempotency_requests where actor_profile_id=actor and action='catalog.service.create' and request_key=p_request_key;
  if found then
   if prior.request_hash<>request_hash then raise exception using errcode='40001',message='conflict'; end if;
   select * into result from public.services where id=prior.result_id; return result;
  end if;
  if p_status<>'draft' then raise exception using errcode='23514',message='initial_draft_required'; end if;
  if (select count(*) from public.services where provider_id=p.id)>=100 then
   raise exception using errcode='23514',message='service_limit'; end if;
  insert into public.services(provider_id,category,catalog_type_id,title,description,duration_minutes,status)
   values(p.id,p.category,p_catalog_type_id,btrim(p_title),p_description,p_duration_minutes,p_status) returning * into result;
  insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
   values(actor,'catalog.service.create',p_request_key,request_hash,result.id);
 else
  select * into result from public.services where id=p_service_id and provider_id=p.id for update;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  if result.catalog_type_id is distinct from p_catalog_type_id then raise exception using errcode='22023',message='type_immutable'; end if;
  if p_status='published' and not exists(select 1 from public.service_price_versions where service_id=result.id
   and effective_from<=now() and (effective_to is null or effective_to>now())) then
   raise exception using errcode='23514',message='price_required'; end if;
  update public.services set title=btrim(p_title),description=p_description,duration_minutes=p_duration_minutes,status=p_status,
   version=version+1,updated_at=now() where id=p_service_id and version=p_expected_version returning * into result;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.service.changed','service',result.id);
 return result;
end $$;

create function public.publish_price_version(p_service_id uuid,p_amount_paise text,p_terms_version text,p_expected_version integer,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s public.services; p_id uuid; result uuid; prior public.idempotency_requests;
 stamp timestamptz; request_hash text:=jsonb_build_array(p_service_id,p_amount_paise,p_terms_version,p_expected_version)::text; next_version integer;
begin
 select provider_id into p_id from public.services where id=p_service_id;
 perform catalog_private.lock_manager(p_id);
 select * into s from public.services where id=p_service_id for update;
 if p_request_key is null or p_amount_paise is null or p_amount_paise !~ '^(0|[1-9][0-9]{0,18})$'
  or p_amount_paise::numeric>10000000000 or p_terms_version is null or char_length(btrim(p_terms_version)) not between 1 and 160 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 select * into prior from public.idempotency_requests where actor_profile_id=actor and action='catalog.price.create' and request_key=p_request_key;
 if found then
  if prior.request_hash<>request_hash then raise exception using errcode='40001',message='conflict'; end if;
  return jsonb_build_object('priceVersionId',prior.result_id);
 end if;
 if s.version is distinct from p_expected_version then raise exception using errcode='40001',message='conflict'; end if;
 if (select count(*) from public.service_price_versions where service_id=s.id)>=200 then
  raise exception using errcode='23514',message='price_version_limit'; end if;
 stamp:=clock_timestamp();
 update public.service_price_versions set effective_to=stamp where service_id=s.id and effective_to is null;
 select coalesce(max(version),0)+1 into next_version from public.service_price_versions where service_id=s.id;
 insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
  select s.id,s.catalog_type_id,next_version,p_amount_paise::bigint,t.unit,btrim(p_terms_version),stamp
  from public.service_catalog_types t where t.id=s.catalog_type_id returning id into result;
 update public.services set version=version+1,updated_at=now() where id=s.id;
 insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
  values(actor,'catalog.price.create',p_request_key,request_hash,result);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.price.published','service_price_version',result);
 return jsonb_build_object('priceVersionId',result);
end $$;

create function public.propose_service_area(p_provider_id uuid,p_pin text,p_expected_version integer,p_request_key uuid)
returns public.provider_service_areas language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.providers; result public.provider_service_areas; prior public.idempotency_requests; counter_version integer; expired public.provider_service_areas;
 request_hash text:=jsonb_build_array(p_provider_id,p_pin,p_expected_version)::text;
begin
 p:=catalog_private.lock_manager(p_provider_id);
 if p_pin is null or p_pin !~ '^[1-9][0-9]{5}$' or p_request_key is null then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into prior from public.idempotency_requests where actor_profile_id=actor and action='catalog.coverage.create' and request_key=p_request_key;
 if found then
  if prior.request_hash<>request_hash then raise exception using errcode='40001',message='conflict'; end if;
  select * into result from public.provider_service_areas where id=prior.result_id; return result;
 end if;
 insert into public.provider_catalog_counters(provider_id) values(p.id) on conflict(provider_id) do nothing;
 select coverage_version into counter_version from public.provider_catalog_counters where provider_id=p.id for update;
 if counter_version is distinct from p_expected_version then raise exception using errcode='40001',message='conflict'; end if;
 -- Re-proposal retires only expired approval, preserving the old review/history.
 for expired in update public.provider_service_areas set status='revoked',version=version+1,updated_at=now()
  where provider_id=p.id and pin_code=p_pin and status='approved' and valid_to<=now() returning * loop
  insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
   values(expired.id,actor,'approved','revoked','Expired approval replaced by a new proposal.',expired.version);
  insert into public.audit_events(actor_profile_id,action,target_type,target_id)
   values(actor,'catalog.coverage.expired','provider_service_area',expired.id);
 end loop;
 if (select count(*) from public.provider_service_areas where provider_id=p.id and status<>'revoked')>=50 then
  raise exception using errcode='23514',message='coverage_limit'; end if;
 insert into public.provider_service_areas(provider_id,pin_code,proposed_by) values(p.id,p_pin,actor) returning * into result;
 update public.provider_catalog_counters set coverage_version=coverage_version+1 where provider_id=p.id;
 insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
  values(actor,'catalog.coverage.create',p_request_key,request_hash,result.id);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.coverage.proposed','provider_service_area',result.id);
 return result;
end $$;
create function public.withdraw_service_area(p_area_id uuid,p_expected_version integer)
returns public.provider_service_areas language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p_id uuid; result public.provider_service_areas;
begin
 select provider_id into p_id from public.provider_service_areas where id=p_area_id;
 perform catalog_private.lock_manager(p_id);
 update public.provider_service_areas set status='revoked',version=version+1,updated_at=now()
  where id=p_area_id and version=p_expected_version and status in ('proposed','approved') returning * into result;
 if not found then raise exception using errcode='40001',message='conflict'; end if;
 insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
  values(result.id,actor,case when result.approved_by is null then 'proposed' else 'approved' end,'revoked','Provider withdrew coverage.',result.version);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.coverage.withdrawn','provider_service_area',result.id);
 return result;
end $$;
create function public.review_service_area(p_area_id uuid,p_decision text,p_reason text,p_expected_version integer,p_valid_until timestamptz default null)
returns public.provider_service_areas language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); a public.provider_service_areas; p public.providers; org_id uuid;
begin
 select pp.* into p from public.providers pp join public.provider_service_areas aa on aa.provider_id=pp.id where aa.id=p_area_id;
 if not found or not catalog_private.verifier(p.organization_id) then raise exception using errcode='42501',message='forbidden'; end if;
 org_id:=p.organization_id;
 if org_id is not null then
  perform 1 from public.organizations where id=org_id for update;
  perform 1 from public.organization_members where organization_id=org_id and profile_id=actor for update;
 end if;
 perform 1 from public.providers where id=p.id for update;
 perform 1 from public.admin_capabilities where profile_id=actor and capability='coverage:verify' for share;
 select * into a from public.provider_service_areas where id=p_area_id for update;
 if not catalog_private.verifier(org_id) or p.individual_owner_profile_id=actor or a.proposed_by=actor
  or exists(select 1 from public.organization_members where organization_id=org_id and profile_id=actor) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if a.version is distinct from p_expected_version then raise exception using errcode='40001',message='conflict'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 or p_decision is null or not
  ((a.status='proposed' and p_decision in ('approved','rejected')) or (a.status='approved' and p_decision='revoked'))
  or (p_decision='approved' and (p_valid_until is null or not isfinite(p_valid_until) or p_valid_until<=now() or p_valid_until>now()+interval '12 months')) then
  raise exception using errcode='22023',message='invalid_transition'; end if;
 insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
  values(a.id,actor,a.status,p_decision,btrim(p_reason),a.version+1);
 update public.provider_service_areas set status=p_decision,version=version+1,updated_at=now(),
  valid_from=case when p_decision='approved' then now() else valid_from end,
  valid_to=case when p_decision='approved' then p_valid_until else valid_to end,
  approved_by=case when p_decision='approved' then actor else approved_by end,
  approved_at=case when p_decision='approved' then now() else approved_at end where id=a.id returning * into a;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.coverage.'||p_decision,'provider_service_area',a.id);
 return a;
end $$;

do $$ declare t text; begin
 foreach t in array array['service_catalog_types','pin_directory','services','service_price_versions','provider_service_areas','coverage_review_events','provider_catalog_counters'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy c01_counter_read on public.provider_catalog_counters for select to authenticated using(catalog_private.can_read(provider_id));
create policy c01_types_read on public.service_catalog_types for select to authenticated using(identity_private.active_account());
create policy c01_pins_read on public.pin_directory for select to authenticated using(identity_private.active_account());
create policy c01_services_read on public.services for select to authenticated using(catalog_private.can_read(provider_id));
create policy c01_prices_read on public.service_price_versions for select to authenticated
 using(exists(select 1 from public.services s where s.id=service_id and catalog_private.can_read(s.provider_id)));
create policy c01_areas_read on public.provider_service_areas for select to authenticated using(catalog_private.can_read(provider_id) or
 exists(select 1 from public.providers p where p.id=provider_id and catalog_private.verifier(p.organization_id)));
create policy c01_reviews_read on public.coverage_review_events for select to authenticated using(exists(
 select 1 from public.provider_service_areas a join public.providers p on p.id=a.provider_id
 where a.id=area_id and catalog_private.verifier(p.organization_id)));
-- Owners see their area status, never reviewer identity or internal review ledger.
revoke select on public.provider_service_areas from authenticated;
grant select(id,provider_id,pin_code,status,valid_from,valid_to,version,created_at,updated_at) on public.provider_service_areas to authenticated;
revoke all on all functions in schema catalog_private from public,anon,authenticated;
grant execute on function catalog_private.can_read(uuid),catalog_private.verifier(uuid) to authenticated;
revoke all on function identity_private.provider_publicly_bookable(uuid) from public,anon,authenticated;
revoke all on function public.search_providers(text,text,text,integer,text,uuid,uuid,uuid),public.get_public_provider(uuid,text,text),
 public.upsert_service(uuid,uuid,text,text,integer,text,integer,uuid,uuid),public.publish_price_version(uuid,text,text,integer,uuid),
 public.propose_service_area(uuid,text,integer,uuid),public.withdraw_service_area(uuid,integer),public.review_service_area(uuid,text,text,integer,timestamptz)
 from public,anon,authenticated;
grant execute on function public.search_providers(text,text,text,integer,text,uuid,uuid,uuid),public.get_public_provider(uuid,text,text) to anon,authenticated;
grant execute on function public.upsert_service(uuid,uuid,text,text,integer,text,integer,uuid,uuid),public.publish_price_version(uuid,text,text,integer,uuid),
 public.propose_service_area(uuid,text,integer,uuid),public.withdraw_service_area(uuid,integer),public.review_service_area(uuid,text,text,integer,timestamptz) to authenticated;
commit;

-- Forward corrections after first local application: SQL regression caught
-- transaction-start visibility of freshly published prices; keep original DDL.
begin;
create or replace function identity_private.provider_publicly_bookable(provider uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.provider_is_publishable(provider)
 and exists(select 1 from public.services s join public.service_price_versions v on v.service_id=s.id
  where s.provider_id=provider and s.status='published' and v.effective_from<=statement_timestamp() and (v.effective_to is null or v.effective_to>statement_timestamp()))
 and exists(select 1 from public.provider_service_areas a where a.provider_id=provider and a.status='approved'
  and a.valid_from<=now() and a.valid_to>now());
$$;
create or replace function public.search_providers(p_category text,p_pin text,p_price_max text default null,p_limit integer default 20,
 p_after_amount text default null,p_after_provider uuid default null,p_after_service uuid default null,p_provider_id uuid default null)
returns table(provider_id uuid,category text,display_name text,service_id uuid,service_title text,duration_minutes integer,
 amount_paise text,currency text,unit text,terms_version text,pin_code text,city text,advisory_availability text)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_category is null or p_category not in ('doctor','lab','ambulance','caretaker') or p_pin is null or p_pin !~ '^[1-9][0-9]{5}$'
  or p_limit is null or p_limit not between 1 and 50 or
  (p_price_max is not null and (p_price_max !~ '^(0|[1-9][0-9]{0,18})$' or p_price_max::numeric>10000000000)) or
  (num_nonnulls(p_after_amount,p_after_provider,p_after_service) not in (0,3)) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if p_after_amount is not null and (p_after_amount !~ '^(0|[1-9][0-9]{0,18})$' or p_after_amount::numeric>10000000000) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 return query select p.id,p.category,pp.display_name,s.id,s.title,s.duration_minutes,v.amount_paise::text,v.currency,v.unit,v.terms_version,a.pin_code,d.city,null::text
 from public.providers p join public.provider_profiles pp on pp.provider_id=p.id
 join public.services s on s.provider_id=p.id and s.status='published'
 join public.service_price_versions v on v.service_id=s.id and v.effective_from<=statement_timestamp() and (v.effective_to is null or v.effective_to>statement_timestamp())
 join public.provider_service_areas a on a.provider_id=p.id and a.pin_code=p_pin and a.status='approved' and a.valid_from<=now() and a.valid_to>now()
 join public.pin_directory d on d.pin_code=a.pin_code
 where p.category=p_category and (p_provider_id is null or p.id=p_provider_id) and identity_private.provider_publicly_bookable(p.id)
 and (p_price_max is null or v.amount_paise<=p_price_max::bigint)
 and (p_after_amount is null or (v.amount_paise,p.id,s.id)>(p_after_amount::bigint,p_after_provider,p_after_service))
 order by v.amount_paise,p.id,s.id limit p_limit;
end $$;
create or replace function public.upsert_service(p_provider_id uuid,p_catalog_type_id uuid,p_title text,p_description text,
 p_duration_minutes integer,p_status text,p_expected_version integer,p_service_id uuid default null,p_request_key uuid default null)
returns public.services language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.providers; result public.services; prior public.idempotency_requests;
 request_hash text:=jsonb_build_array(p_provider_id,p_catalog_type_id,p_title,p_description,p_duration_minutes,p_status)::text;
begin
 p:=catalog_private.lock_manager(p_provider_id);
 if p_title is null or char_length(btrim(p_title)) not between 1 and 160 or p_description is null or char_length(p_description)>2000
  or p_duration_minutes is null or p_duration_minutes not between 1 and 10080 or p_status is null or p_status not in ('draft','published','archived') then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if p_service_id is null then
  if p_request_key is null or p_expected_version is distinct from 0 then raise exception using errcode='22023',message='invalid_input'; end if;
  select * into prior from public.idempotency_requests where actor_profile_id=actor and action='catalog.service.create' and request_key=p_request_key;
  if found then
   if prior.request_hash<>request_hash then raise exception using errcode='40001',message='conflict'; end if;
   select * into result from public.services where id=prior.result_id; return result;
  end if;
  if p_status<>'draft' then raise exception using errcode='23514',message='initial_draft_required'; end if;
  if (select count(*) from public.services where provider_id=p.id)>=100 then
   raise exception using errcode='23514',message='service_limit'; end if;
  insert into public.services(provider_id,category,catalog_type_id,title,description,duration_minutes,status)
   values(p.id,p.category,p_catalog_type_id,btrim(p_title),p_description,p_duration_minutes,p_status) returning * into result;
  insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
   values(actor,'catalog.service.create',p_request_key,request_hash,result.id);
 else
  select * into result from public.services where id=p_service_id and provider_id=p.id for update;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  if result.catalog_type_id is distinct from p_catalog_type_id then raise exception using errcode='22023',message='type_immutable'; end if;
  if p_status='published' and not exists(select 1 from public.service_price_versions where service_id=result.id
   and effective_from<=statement_timestamp() and (effective_to is null or effective_to>statement_timestamp())) then
   raise exception using errcode='23514',message='price_required'; end if;
  update public.services set title=btrim(p_title),description=p_description,duration_minutes=p_duration_minutes,status=p_status,
   version=version+1,updated_at=now() where id=p_service_id and version=p_expected_version returning * into result;
  if not found then raise exception using errcode='40001',message='conflict'; end if;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.service.changed','service',result.id);
 return result;
end $$;
create or replace function public.publish_price_version(p_service_id uuid,p_amount_paise text,p_terms_version text,p_expected_version integer,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s public.services; p_id uuid; result uuid; prior public.idempotency_requests;
 stamp timestamptz; request_hash text:=jsonb_build_array(p_service_id,p_amount_paise,p_terms_version,p_expected_version)::text; next_version integer;
begin
 select provider_id into p_id from public.services where id=p_service_id;
 perform catalog_private.lock_manager(p_id);
 select * into s from public.services where id=p_service_id for update;
 if p_request_key is null or p_amount_paise is null or p_amount_paise !~ '^(0|[1-9][0-9]{0,18})$'
  or p_amount_paise::numeric>10000000000 or p_terms_version is null or char_length(btrim(p_terms_version)) not between 1 and 160 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 select * into prior from public.idempotency_requests where actor_profile_id=actor and action='catalog.price.create' and request_key=p_request_key;
 if found then
  if prior.request_hash<>request_hash then raise exception using errcode='40001',message='conflict'; end if;
  return jsonb_build_object('priceVersionId',prior.result_id);
 end if;
 if s.version is distinct from p_expected_version then raise exception using errcode='40001',message='conflict'; end if;
 if (select count(*) from public.service_price_versions where service_id=s.id)>=200 then
  raise exception using errcode='23514',message='price_version_limit'; end if;
 stamp:=statement_timestamp();
 update public.service_price_versions set effective_to=stamp where service_id=s.id and effective_to is null;
 select coalesce(max(version),0)+1 into next_version from public.service_price_versions where service_id=s.id;
 insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
  select s.id,s.catalog_type_id,next_version,p_amount_paise::bigint,t.unit,btrim(p_terms_version),stamp
  from public.service_catalog_types t where t.id=s.catalog_type_id returning id into result;
 update public.services set version=version+1,updated_at=now() where id=s.id;
 insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
  values(actor,'catalog.price.create',p_request_key,request_hash,result);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.price.published','service_price_version',result);
 return jsonb_build_object('priceVersionId',result);
end $$;
create or replace function public.propose_service_area(p_provider_id uuid,p_pin text,p_expected_version integer,p_request_key uuid)
returns public.provider_service_areas language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.providers; result public.provider_service_areas; prior public.idempotency_requests; counter_version integer; expired public.provider_service_areas;
 request_hash text:=jsonb_build_array(p_provider_id,p_pin,p_expected_version)::text;
begin
 p:=catalog_private.lock_manager(p_provider_id);
 if p_pin is null or p_pin !~ '^[1-9][0-9]{5}$' or p_request_key is null then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into prior from public.idempotency_requests where actor_profile_id=actor and action='catalog.coverage.create' and request_key=p_request_key;
 if found then
  if prior.request_hash<>request_hash then raise exception using errcode='40001',message='conflict'; end if;
  select * into result from public.provider_service_areas where id=prior.result_id; result.approved_by:=null; result.proposed_by:=null; return result;
 end if;
 insert into public.provider_catalog_counters(provider_id) values(p.id) on conflict(provider_id) do nothing;
 select coverage_version into counter_version from public.provider_catalog_counters where provider_id=p.id for update;
 if counter_version is distinct from p_expected_version then raise exception using errcode='40001',message='conflict'; end if;
 -- Re-proposal retires only expired approval, preserving the old review/history.
 for expired in update public.provider_service_areas set status='revoked',version=version+1,updated_at=now()
  where provider_id=p.id and pin_code=p_pin and status='approved' and valid_to<=now() returning * loop
  insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
   values(expired.id,actor,'approved','revoked','Expired approval replaced by a new proposal.',expired.version);
  insert into public.audit_events(actor_profile_id,action,target_type,target_id)
   values(actor,'catalog.coverage.expired','provider_service_area',expired.id);
 end loop;
 if (select count(*) from public.provider_service_areas where provider_id=p.id and status<>'revoked')>=50 then
  raise exception using errcode='23514',message='coverage_limit'; end if;
 insert into public.provider_service_areas(provider_id,pin_code,proposed_by) values(p.id,p_pin,actor) returning * into result;
 update public.provider_catalog_counters set coverage_version=coverage_version+1 where provider_id=p.id;
 insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
  values(actor,'catalog.coverage.create',p_request_key,request_hash,result.id);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.coverage.proposed','provider_service_area',result.id);
 result.approved_by:=null; result.proposed_by:=null; return result;
end $$;
create or replace function public.withdraw_service_area(p_area_id uuid,p_expected_version integer)
returns public.provider_service_areas language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p_id uuid; result public.provider_service_areas;
begin
 select provider_id into p_id from public.provider_service_areas where id=p_area_id;
 perform catalog_private.lock_manager(p_id);
 update public.provider_service_areas set status='revoked',version=version+1,updated_at=now()
  where id=p_area_id and version=p_expected_version and status in ('proposed','approved') returning * into result;
 if not found then raise exception using errcode='40001',message='conflict'; end if;
 insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
  values(result.id,actor,case when result.approved_by is null then 'proposed' else 'approved' end,'revoked','Provider withdrew coverage.',result.version);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.coverage.withdrawn','provider_service_area',result.id);
 result.approved_by:=null; result.proposed_by:=null; return result;
end $$;
create function catalog_private.area_reviewer(area uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.provider_service_areas a join public.providers p on p.id=a.provider_id
 where a.id=area and catalog_private.verifier(p.organization_id));
$$;
revoke all on function catalog_private.area_reviewer(uuid) from public,anon,authenticated;
grant execute on function catalog_private.area_reviewer(uuid) to authenticated;
drop policy c01_reviews_read on public.coverage_review_events;
create policy c01_reviews_read on public.coverage_review_events for select to authenticated using(catalog_private.area_reviewer(area_id));

commit;

-- Forward addition: coverage-only reviewers need a narrow queue independently of
-- I02 provider-verifier RLS. Do not broaden private provider-table privileges.
begin;
drop policy c01_areas_read on public.provider_service_areas;
create policy c01_areas_read on public.provider_service_areas for select to authenticated
 using(catalog_private.can_read(provider_id) or catalog_private.area_reviewer(id));
create function public.list_service_area_reviews(p_limit integer default 20,p_after uuid default null,p_after_priority integer default null,p_after_created_at timestamptz default null)
returns table(area_id uuid,provider_id uuid,category text,display_name text,pin_code text,status text,
 valid_from timestamptz,valid_to timestamptz,version integer,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not identity_private.active_account() or auth.jwt()->>'aal' is distinct from 'aal2' or not exists(
  select 1 from public.admin_capabilities where profile_id=auth.uid() and capability='coverage:verify'
   and valid_from<=now() and (expires_at is null or expires_at>now()) and revoked_at is null) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid_input'; end if;
 if num_nonnulls(p_after,p_after_priority,p_after_created_at) not in (0,3)
  or (p_after_priority is not null and p_after_priority not in (0,1)) then
  raise exception using errcode='22023',message='invalid_cursor'; end if;
 if p_after is not null and not exists(
  select 1 from public.provider_service_areas a join public.providers p on p.id=a.provider_id
   where a.id=p_after and a.created_at=p_after_created_at and catalog_private.verifier(p.organization_id)) then
  raise exception using errcode='22023',message='invalid_cursor'; end if;
 return query select a.id,p.id,p.category,pp.display_name,a.pin_code,a.status,a.valid_from,a.valid_to,a.version,a.created_at
  from public.provider_service_areas a join public.providers p on p.id=a.provider_id
  join public.provider_profiles pp on pp.provider_id=p.id
  where catalog_private.verifier(p.organization_id) and (p_after is null or ((a.status<>'proposed'),a.created_at,a.id)>((p_after_priority=1),p_after_created_at,p_after))
  order by (a.status<>'proposed'),a.created_at,a.id limit p_limit;
end $$;
revoke all on function public.list_service_area_reviews(integer,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.list_service_area_reviews(integer,uuid,integer,timestamptz) to authenticated;
commit;

-- Forward SQL regression fix: qualify capability fields against queue OUT columns.
begin;
create or replace function public.list_service_area_reviews(p_limit integer default 20,p_after uuid default null,p_after_priority integer default null,p_after_created_at timestamptz default null)
returns table(area_id uuid,provider_id uuid,category text,display_name text,pin_code text,status text,
 valid_from timestamptz,valid_to timestamptz,version integer,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not identity_private.active_account() or auth.jwt()->>'aal' is distinct from 'aal2' or not exists(
  select 1 from public.admin_capabilities cap where cap.profile_id=auth.uid() and cap.capability='coverage:verify'
   and cap.valid_from<=now() and (cap.expires_at is null or cap.expires_at>now()) and cap.revoked_at is null) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid_input'; end if;
 if num_nonnulls(p_after,p_after_priority,p_after_created_at) not in (0,3)
  or (p_after_priority is not null and p_after_priority not in (0,1)) then
  raise exception using errcode='22023',message='invalid_cursor'; end if;
 if p_after is not null and not exists(
  select 1 from public.provider_service_areas a join public.providers p on p.id=a.provider_id
   where a.id=p_after and a.created_at=p_after_created_at and catalog_private.verifier(p.organization_id)) then
  raise exception using errcode='22023',message='invalid_cursor'; end if;
 return query select a.id,p.id,p.category,pp.display_name,a.pin_code,a.status,a.valid_from,a.valid_to,a.version,a.created_at
  from public.provider_service_areas a join public.providers p on p.id=a.provider_id
  join public.provider_profiles pp on pp.provider_id=p.id
  where catalog_private.verifier(p.organization_id) and (p_after is null or ((a.status<>'proposed'),a.created_at,a.id)>((p_after_priority=1),p_after_created_at,p_after))
  order by (a.status<>'proposed'),a.created_at,a.id limit p_limit;
end $$;
commit;

-- Forward independent-review fix: absent MFA claims must be false, never NULL.
begin;
create or replace function catalog_private.verifier(org_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select identity_private.active_account() and (auth.jwt()->>'aal' is not distinct from 'aal2') and exists(
  select 1 from public.admin_capabilities where profile_id=auth.uid() and capability='coverage:verify'
  and (scope_key='global' or scope_key='org:'||org_id::text)
  and valid_from<=now() and (expires_at is null or expires_at>now()) and revoked_at is null);
$$;
commit;

-- Forward contract-review correction: only the owning principal withdraws coverage.
begin;
create or replace function public.withdraw_service_area(p_area_id uuid,p_expected_version integer)
returns public.provider_service_areas language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p_id uuid; owner_row public.providers; result public.provider_service_areas;
begin
 select provider_id into p_id from public.provider_service_areas where id=p_area_id;
 owner_row:=catalog_private.lock_manager(p_id);
 if owner_row.individual_owner_profile_id is distinct from actor and not exists(
  select 1 from public.organization_members where organization_id=owner_row.organization_id
   and profile_id=actor and membership_role='owner' and status='active') then
  raise exception using errcode='42501',message='forbidden'; end if;
 update public.provider_service_areas set status='revoked',version=version+1,updated_at=now()
  where id=p_area_id and version=p_expected_version and status in ('proposed','approved') returning * into result;
 if not found then raise exception using errcode='40001',message='conflict'; end if;
 insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
  values(result.id,actor,case when result.approved_by is null then 'proposed' else 'approved' end,'revoked','Provider withdrew coverage.',result.version);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'catalog.coverage.withdrawn','provider_service_area',result.id);
 result.approved_by:=null; result.proposed_by:=null; return result;
end $$;
commit;
