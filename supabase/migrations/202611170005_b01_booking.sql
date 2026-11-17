-- B01 / Codex / task/B01-booking / base 802a8bdc. Depends on I01/I02/C01.
-- Synthetic local/staging only. No policy/reference seeds or payment/clinical activation.
-- P01 must create its independent obligation on confirmation (including existing
-- confirmed bookings); this migration never labels a booking as gateway-paid.
begin;
create extension if not exists btree_gist with schema extensions;
create schema booking_private;
revoke all on schema booking_private from public, anon, authenticated;
grant usage on schema booking_private to authenticated;

create table public.booking_policy_versions (
 id uuid primary key default gen_random_uuid(), version integer not null unique check(version>0),
 terms_text_ref text not null check(char_length(btrim(terms_text_ref)) between 1 and 160),
 cancel_window_minutes integer check(cancel_window_minutes>=0),
 request_expiry_minutes integer check(request_expiry_minutes>0),
 buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 1440),
 status text not null default 'draft' check(status in ('draft','published','disabled')),
 created_at timestamptz not null default now()
);
create table public.patient_addresses (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id),
 line1 text not null check(char_length(btrim(line1)) between 1 and 240),
 locality text not null check(char_length(btrim(locality)) between 1 and 120),
 pin_code text not null check(pin_code ~ '^[1-9][0-9]{5}$'),
 contact_name text not null check(char_length(btrim(contact_name)) between 1 and 100),
 phone text not null check(phone ~ '^\+91[6-9][0-9]{9}$'), version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index b01_address_patient on public.patient_addresses(patient_id);
create sequence booking_private.public_ref_seq;
create table public.bookings (
 id uuid primary key default gen_random_uuid(),
 public_ref text not null unique default ('SCV-'||lpad(nextval('booking_private.public_ref_seq')::text,12,'0')),
 requester_profile_id uuid not null references public.profiles(id), patient_id uuid not null references public.patients(id),
 provider_id uuid not null, category text not null, service_id uuid not null references public.services(id),
 price_version_id uuid not null references public.service_price_versions(id),
 amount_paise bigint not null check(amount_paise>=0), currency text not null default 'INR' check(currency='INR'),
 policy_version_id uuid references public.booking_policy_versions(id), terms_version text not null,
 address_snapshot jsonb not null check(jsonb_typeof(address_snapshot)='object'),
 contact_snapshot jsonb not null check(jsonb_typeof(contact_snapshot)='object'),
 start_at timestamptz not null, end_at timestamptz not null,
 state text not null default 'draft' check(state in ('draft','requested','accepted','confirmed','in_progress','completed','declined','expired','cancelled','no_show','interrupted')),
 version integer not null default 1 check(version>0),
 supersedes_booking_id uuid references public.bookings(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(provider_id,category) references public.providers(id,category),
 check(isfinite(start_at) and isfinite(end_at) and end_at>start_at),
 unique(requester_profile_id,supersedes_booking_id)
);
create index b01_booking_patient on public.bookings(patient_id,id);
create index b01_booking_provider on public.bookings(provider_id,id);
create table public.booking_transitions (
 from_state text not null,to_state text not null,actor_kind text not null check(actor_kind in ('patient','provider','assigned','system')),
 primary key(from_state,to_state,actor_kind)
);
insert into public.booking_transitions values
 ('draft','requested','patient'),('draft','cancelled','patient'),
 ('requested','cancelled','patient'),('requested','cancelled','provider'),
 ('requested','declined','provider'),('requested','expired','system'),
 ('requested','accepted','provider'),('accepted','confirmed','provider'),
 ('accepted','cancelled','patient'),('accepted','cancelled','provider'),
 ('confirmed','cancelled','patient'),('confirmed','cancelled','provider'),
 ('confirmed','no_show','provider'),('confirmed','in_progress','assigned'),
 ('in_progress','completed','assigned'),('in_progress','interrupted','assigned');
create table public.booking_events (
 id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),
 actor_profile_id uuid not null references public.profiles(id),from_state text not null,to_state text not null,
 aggregate_version integer not null check(aggregate_version>0),
 reason text not null check(reason in ('requested','accepted','confirmed','patient_request','provider_unavailable','unable_to_service','other','en_route','arrived','service_started','service_completed','reassigned')),
 request_key uuid,occurred_at timestamptz not null default now(),unique(booking_id,aggregate_version)
);
create table public.resources (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('person','vehicle')),
 person_profile_id uuid unique references public.profiles(id),
 vehicle_key text unique check(vehicle_key ~ '^[A-Z0-9]{6,20}$'),
 owner_organization_id uuid references public.organizations(id),owner_profile_id uuid references public.profiles(id),
 status text not null default 'active' check(status in ('active','disabled')),
 version integer not null default 1 check(version>0),
 check((kind='person' and person_profile_id is not null and vehicle_key is null and owner_organization_id is null and owner_profile_id is null)
 or (kind='vehicle' and person_profile_id is null and vehicle_key is not null and num_nonnulls(owner_organization_id,owner_profile_id)=1))
);
create table public.availability_rules (
 id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.providers(id),resource_id uuid not null references public.resources(id),
 weekday integer not null check(weekday between 0 and 6),local_start time not null,local_end time not null,
 timezone text not null default 'Asia/Kolkata' check(timezone='Asia/Kolkata'),
 effective_from date not null,effective_to date not null,version integer not null default 1 check(version>0),
 check(local_end>local_start and local_end<'24:00'::time),check(isfinite(effective_from) and isfinite(effective_to) and effective_to>=effective_from)
);
create index b01_rules_provider on public.availability_rules(provider_id,resource_id);
create table public.availability_exceptions (
 id uuid primary key default gen_random_uuid(),provider_id uuid not null references public.providers(id),resource_id uuid not null references public.resources(id),
 period tstzrange not null,kind text not null default 'unavailable' check(kind='unavailable'),
 reason text not null check(reason in ('unavailable','maintenance','other')),
 check(not isempty(period) and not lower_inf(period) and not upper_inf(period) and isfinite(lower(period)) and isfinite(upper(period)) and lower_inc(period) and not upper_inc(period))
);
create index b01_exceptions_resource on public.availability_exceptions(resource_id);
create table public.booking_assignments (
 id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),resource_id uuid not null references public.resources(id),
 purpose text not null check(purpose in ('doctor_visit','lab_collection','caretaker','driver','vehicle')),
 assigned_profile_id uuid references public.profiles(id),period tstzrange not null,
 status text not null default 'active' check(status in ('active','replaced','ended')),ended_at timestamptz,
 check((status='active' and ended_at is null) or (status<>'active' and ended_at is not null)),
 check(not isempty(period) and not lower_inf(period) and not upper_inf(period) and isfinite(lower(period)) and isfinite(upper(period)) and lower_inc(period) and not upper_inc(period)),
 unique(id,resource_id),unique(id,booking_id)
);
create unique index b01_assignment_current on public.booking_assignments(booking_id,purpose) where status='active';
create index b01_assignment_actor on public.booking_assignments(assigned_profile_id,booking_id);
create table public.resource_reservations (
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null unique,resource_id uuid not null references public.resources(id),
 occupied_period tstzrange not null,status text not null default 'active' check(status in ('active','released')),
 foreign key(assignment_id,resource_id) references public.booking_assignments(id,resource_id),
 check(not isempty(occupied_period) and not lower_inf(occupied_period) and not upper_inf(occupied_period) and isfinite(lower(occupied_period)) and isfinite(upper(occupied_period)) and lower_inc(occupied_period) and not upper_inc(occupied_period)),
 exclude using gist (resource_id with =,occupied_period with &&) where(status='active')
);
create table public.doctor_visits (
 booking_id uuid primary key references public.bookings(id),assignment_id uuid not null,
 substate text not null default 'scheduled' check(substate in ('scheduled','en_route','arrived','service_started','service_completed')),
 foreign key(assignment_id,booking_id) references public.booking_assignments(id,booking_id)
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id),
 event_id uuid not null unique references public.booking_events(id),
 payload jsonb not null check(jsonb_typeof(payload)='object'),created_at timestamptz not null default now()
);

-- Helpers deliberately do not use identity_roles() or caller-supplied actors.
create function booking_private.patient(subject uuid,scope text) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.patient_access a join public.patients p on p.id=a.patient_id
 where p.id=subject and p.self_profile_id=auth.uid() and a.grantee_profile_id=auth.uid() and a.granted_by=auth.uid()
 and a.source='self' and a.scope=scope and a.revoked_at is null and a.valid_from<=clock_timestamp()
 and (a.expires_at is null or a.expires_at>clock_timestamp()));
$$;
create function booking_private.scheduler(provider uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.providers p where p.id=provider and
 (p.individual_owner_profile_id=auth.uid() or exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
 where m.organization_id=p.organization_id and m.profile_id=auth.uid() and m.status='active' and o.status='active'
 and m.accepted_at is not null and 'schedule:manage'=any(m.scopes))));
$$;
create function booking_private.resource_eligible(provider uuid,resource uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.providers p join public.resources r on r.id=resource and r.status='active' where p.id=provider and
 ((r.kind='person' and exists(select 1 from public.profiles a where a.id=r.person_profile_id and a.status='active') and
 (p.individual_owner_profile_id=r.person_profile_id or exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
 where m.organization_id=p.organization_id and m.profile_id=r.person_profile_id and m.status='active' and m.accepted_at is not null
 and o.status='active' and 'provider:read'=any(m.scopes)))) or
 (r.kind='vehicle' and ((p.organization_id is not null and r.owner_organization_id=p.organization_id) or
 (p.individual_owner_profile_id is not null and r.owner_profile_id=p.individual_owner_profile_id)))));
$$;
create function identity_private.is_assigned(p_booking_id uuid,p_purpose text) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b join public.booking_assignments a on a.booking_id=b.id
 join public.resources r on r.id=a.resource_id where b.id=p_booking_id and b.state in ('confirmed','in_progress')
 and a.status='active' and a.ended_at is null and a.purpose=p_purpose and r.kind='person' and r.person_profile_id=auth.uid()
 and a.assigned_profile_id=auth.uid() and a.period @> clock_timestamp() is not null
 and public.provider_is_publishable(b.provider_id) and booking_private.resource_eligible(b.provider_id,r.id)
 and ((b.category='doctor' and p_purpose='doctor_visit') or (b.category='lab' and p_purpose='lab_collection')
 or (b.category='caretaker' and p_purpose='caretaker') or (b.category='ambulance' and p_purpose='driver')));
$$;
create function booking_private.assigned(p_booking_id uuid,p_purpose text) returns boolean
language sql volatile security definer set search_path='' as $$ select identity_private.is_assigned(p_booking_id,p_purpose); $$;
create function booking_private.patient_booking(booking uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.bookings b where b.id=booking and booking_private.patient(b.patient_id,'booking:read'));
$$;
create function booking_private.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='immutable_event'; end $$;
create function booking_private.policy_immutable() returns trigger language plpgsql set search_path='' as $$
begin if old.status='published' then raise exception using errcode='55000',message='immutable_policy'; end if;
 if TG_OP='DELETE' then return old; end if; return new; end $$;
create trigger b01_policy_immutable before update or delete on public.booking_policy_versions for each row execute function booking_private.policy_immutable();
create trigger b01_event_immutable before update or delete on public.booking_events for each row execute function booking_private.immutable();
create trigger b01_event_no_truncate before truncate on public.booking_events for each statement execute function booking_private.immutable();

create function booking_private.guard_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare who text; begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_booking'; end if;
 if TG_OP='INSERT' then
  if new.state<>'draft' or new.version<>1 or not exists(select 1 from public.services s join public.service_price_versions v on v.service_id=s.id
   where s.id=new.service_id and s.provider_id=new.provider_id and s.category=new.category and v.id=new.price_version_id
   and v.amount_paise=new.amount_paise and v.currency=new.currency and v.terms_version=new.terms_version) then
   raise exception using errcode='55000',message='invalid_snapshot'; end if;
  return new;
 end if;
 if (to_jsonb(new)-array['state','version','updated_at']) is distinct from (to_jsonb(old)-array['state','version','updated_at']) then
  raise exception using errcode='55000',message='immutable_snapshot'; end if;
 if new.version<>old.version+1 then raise exception using errcode='40001',message='stale_version'; end if;
 if new.state is distinct from old.state then
  who:=case when new.state in ('in_progress','completed','interrupted') then 'assigned'
   when new.state in ('accepted','confirmed','declined','no_show') then 'provider'
   when new.state='expired' then 'system'
   when booking_private.patient(old.patient_id,'booking:create') then 'patient' else 'provider' end;
  if not exists(select 1 from public.booking_transitions t where t.from_state=old.state and t.to_state=new.state and t.actor_kind=who)
   or (who='patient' and not booking_private.patient(old.patient_id,'booking:create'))
   or (who='provider' and not booking_private.scheduler(old.provider_id))
   or (who='assigned' and not (identity_private.is_assigned(old.id,'doctor_visit') or identity_private.is_assigned(old.id,'lab_collection')
    or identity_private.is_assigned(old.id,'caretaker') or identity_private.is_assigned(old.id,'driver')))
   or who='system' then raise exception using errcode='55000',message='invalid_transition'; end if;
 end if;
 return new;
end $$;
create trigger b01_booking_guard before insert or update or delete on public.bookings for each row execute function booking_private.guard_booking();
create trigger b01_booking_no_truncate before truncate on public.bookings for each statement execute function booking_private.immutable();

-- Every state/substate mutation writes the event, audit and minimal outbox atomically.
create function booking_private.transition(booking uuid,next_state text,reason_code text,request_key uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare b public.bookings; prior text; event uuid; begin
 select * into b from public.bookings where id=booking for update; prior:=b.state;
 update public.bookings set state=next_state,version=version+1,updated_at=clock_timestamp() where id=booking returning * into b;
 insert into public.booking_events(booking_id,actor_profile_id,from_state,to_state,aggregate_version,reason,request_key)
 values(booking,auth.uid(),prior,next_state,b.version,reason_code,request_key) returning id into event;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(auth.uid(),'booking.'||reason_code,'booking',booking);
 insert into public.notification_outbox(booking_id,event_id,payload) values(booking,event,jsonb_build_object('booking_id',booking,'event',reason_code,'version',b.version));
 return b.version;
end $$;
create function booking_private.release(booking uuid) returns void language sql security definer set search_path='' as $$
 update public.resource_reservations set status='released' where assignment_id in(select id from public.booking_assignments where booking_id=booking and status='active');
 update public.booking_assignments set status='ended',ended_at=clock_timestamp() where booking_id=booking and status='active';
$$;
create function booking_private.in_schedule(provider uuid,resource uuid,period tstzrange) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.availability_rules a where a.provider_id=provider and a.resource_id=resource
 and (lower(period) at time zone a.timezone)::date between a.effective_from and a.effective_to
 and extract(dow from lower(period) at time zone a.timezone)=a.weekday
 and period <@ tstzrange(((lower(period) at time zone a.timezone)::date+a.local_start) at time zone a.timezone,
 ((lower(period) at time zone a.timezone)::date+a.local_end) at time zone a.timezone,'[)'))
 and not exists(select 1 from public.availability_exceptions e where e.resource_id=resource and e.period && period);
$$;
-- Locks shared with I02/C01 provider/coverage edits. Membership edits acquire org
-- first, so races are serialized. Global resource locks protect rule/blackout edits.
create function booking_private.lock_provider(provider uuid) returns void language plpgsql security definer set search_path='' as $$
declare org uuid; begin
 select organization_id into org from public.providers where id=provider;
 if org is not null then perform 1 from public.organizations where id=org for update; end if;
 perform 1 from public.providers where id=provider for update;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
end $$;

create function public.save_patient_address(p_patient_id uuid,p_line1 text,p_locality text,p_pin text,p_contact_name text,p_phone text,p_expected_version integer,p_address_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); result uuid; begin
 if not booking_private.patient(p_patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version=0 and p_address_id is null then
  insert into public.patient_addresses(patient_id,line1,locality,pin_code,contact_name,phone)
   values(p_patient_id,p_line1,p_locality,p_pin,p_contact_name,p_phone) returning id into result;
 else
  perform 1 from public.patient_addresses where id=p_address_id and patient_id=p_patient_id for update;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  update public.patient_addresses set line1=p_line1,locality=p_locality,pin_code=p_pin,contact_name=p_contact_name,phone=p_phone,
   version=version+1,updated_at=clock_timestamp() where id=p_address_id and version=p_expected_version returning id into result;
  if not found then raise exception using errcode='40001',message='stale_version'; end if;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.address_saved','patient_address',result);
 return result;
end $$;

create function public.create_booking_request(p_patient_id uuid,p_service_id uuid,p_address_id uuid,p_start_at timestamptz,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s public.services; price public.service_price_versions; a public.patient_addresses;
 policy uuid; result uuid; prior public.idempotency_requests; request_hash text;
begin
 if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 select * into a from public.patient_addresses where id=p_address_id and patient_id=p_patient_id for share;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 if p_request_key is null or p_start_at is null or not isfinite(p_start_at) then raise exception using errcode='22023',message='invalid_input'; end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_patient_id,p_service_id,p_address_id,p_start_at)::text,'UTF8')),'hex');
 select * into prior from public.idempotency_requests where actor_profile_id=actor and action='booking.create' and request_key=p_request_key;
 if found then
  if prior.request_hash<>request_hash then raise exception using errcode='40001',message='idempotency_conflict'; end if;
  return prior.result_id;
 end if;
 select * into s from public.services where id=p_service_id;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(s.provider_id);
 select * into s from public.services where id=p_service_id for share;
 if not identity_private.provider_publicly_bookable(s.provider_id) or s.status<>'published'
 or not exists(select 1 from public.provider_service_areas where provider_id=s.provider_id and pin_code=a.pin_code and status='approved'
 and valid_from<=clock_timestamp() and valid_to>clock_timestamp()) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into price from public.service_price_versions where service_id=s.id and effective_from<=clock_timestamp()
 and (effective_to is null or effective_to>clock_timestamp()) for share;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 if p_start_at<=clock_timestamp() then raise exception using errcode='22023',message='invalid_input'; end if;
 select id into policy from public.booking_policy_versions where status='published' order by version desc limit 1;
 insert into public.bookings(requester_profile_id,patient_id,provider_id,category,service_id,price_version_id,amount_paise,currency,policy_version_id,terms_version,address_snapshot,contact_snapshot,start_at,end_at)
 values(actor,p_patient_id,s.provider_id,s.category,s.id,price.id,price.amount_paise,price.currency,policy,price.terms_version,
 jsonb_build_object('line1',a.line1,'locality',a.locality,'pin_code',a.pin_code),jsonb_build_object('name',a.contact_name,'phone',a.phone),
 p_start_at,p_start_at+make_interval(mins=>s.duration_minutes)) returning id into result;
 perform booking_private.transition(result,'requested','requested',p_request_key);
 insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id)
 values(actor,'booking.create',p_request_key,request_hash,result);
 return result;
end $$;

create function public.accept_booking(p_booking_id uuid,p_expected_version integer,p_resource_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; s public.services; r public.resources;
 assignment uuid; person_assignment uuid; buf integer:=0; occupied tstzrange; purpose text; result integer;
begin
 select * into b from public.bookings where id=p_booking_id;
 if not found or not booking_private.scheduler(b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 if not booking_private.scheduler(b.provider_id) or not public.provider_is_publishable(b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.state<>'requested' or b.start_at<=clock_timestamp() then raise exception using errcode='55000',message='invalid_transition'; end if;
 if not booking_private.patient_for_requester(b.patient_id,b.requester_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into s from public.services where id=b.service_id for share;
 if s.status<>'published' or not identity_private.provider_publicly_bookable(b.provider_id)
 or not exists(select 1 from public.provider_service_areas where provider_id=b.provider_id and pin_code=b.address_snapshot->>'pin_code'
 and status='approved' and valid_from<=clock_timestamp() and valid_to>clock_timestamp())
 or not exists(select 1 from public.service_price_versions v where v.id=b.price_version_id and v.service_id=b.service_id
 and v.effective_from<=clock_timestamp() and (v.effective_to is null or v.effective_to>clock_timestamp()) and v.amount_paise=b.amount_paise)
 then raise exception using errcode='40001',message='offer_changed'; end if;
 if p_resource_ids is null or cardinality(p_resource_ids)<>(case when b.category='ambulance' then 2 else 1 end)
 or array_position(p_resource_ids,null) is not null or (select count(distinct x) from unnest(p_resource_ids) x)<>cardinality(p_resource_ids)
 then raise exception using errcode='22023',message='invalid_resources'; end if;
 -- UUID ordering is global across providers/categories, preventing cross-org
 -- doctor/driver duplicate-person reservations from evading the exclusion.
 perform 1 from public.resources where id=any(p_resource_ids) order by id for update;
 if (select count(*) from public.resources where id=any(p_resource_ids))<>cardinality(p_resource_ids)
 or exists(select 1 from unnest(p_resource_ids) x where not booking_private.resource_eligible(b.provider_id,x))
 then raise exception using errcode='42501',message='forbidden'; end if;
 if (select count(*) from public.resources where id=any(p_resource_ids) and kind='person')<>1
 or (b.category='ambulance' and (select count(*) from public.resources where id=any(p_resource_ids) and kind='vehicle')<>1)
 then raise exception using errcode='22023',message='invalid_resources'; end if;
 select buffer_minutes into buf from public.booking_policy_versions where id=b.policy_version_id;
 occupied:=tstzrange(b.start_at-make_interval(mins=>coalesce(buf,0)),b.end_at+make_interval(mins=>coalesce(buf,0)),'[)');
 for r in select * from public.resources where id=any(p_resource_ids) order by id loop
  if not booking_private.in_schedule(b.provider_id,r.id,occupied) then raise exception using errcode='40001',message='schedule_changed'; end if;
  purpose:=case when r.kind='vehicle' then 'vehicle' when b.category='doctor' then 'doctor_visit' when b.category='lab' then 'lab_collection' when b.category='caretaker' then 'caretaker' else 'driver' end;
  insert into public.booking_assignments(booking_id,resource_id,purpose,assigned_profile_id,period)
  values(b.id,r.id,purpose,r.person_profile_id,tstzrange(b.start_at,b.end_at,'[)')) returning id into assignment;
  insert into public.resource_reservations(assignment_id,resource_id,occupied_period) values(assignment,r.id,occupied);
  if r.kind='person' then person_assignment:=assignment; end if;
 end loop;
 perform booking_private.transition(b.id,'accepted','accepted');
 result:=booking_private.transition(b.id,'confirmed','confirmed');
 if b.category='doctor' then insert into public.doctor_visits(booking_id,assignment_id) values(b.id,person_assignment); end if;
 return result;
end $$;

-- This predicate checks the original requester's continuing grant; it accepts no
-- caller authority and is never granted to clients.
create function booking_private.patient_for_requester(subject uuid,requester uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.patients p join public.profiles x on x.id=p.self_profile_id
 join public.patient_access a on a.patient_id=p.id where p.id=subject and p.self_profile_id=requester and x.status='active'
 and a.grantee_profile_id=requester and a.granted_by=requester and a.source='self' and a.scope='booking:create'
 and a.revoked_at is null and a.valid_from<=clock_timestamp() and (a.expires_at is null or a.expires_at>clock_timestamp()));
$$;
create function public.decline_booking(p_booking_id uuid,p_expected_version integer,p_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found or not booking_private.scheduler(b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 if not booking_private.scheduler(b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.state<>'requested' then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_reason is null or p_reason not in ('provider_unavailable','unable_to_service','other') then raise exception using errcode='22023',message='invalid_reason'; end if;
 return booking_private.transition(b.id,'declined',p_reason);
end $$;
create function public.cancel_booking(p_booking_id uuid,p_expected_version integer,p_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; cutoff integer; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found or not (booking_private.patient(b.patient_id,'booking:create') or booking_private.scheduler(b.provider_id)) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 if not (booking_private.patient(b.patient_id,'booking:create') or booking_private.scheduler(b.provider_id)) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.state not in ('draft','requested','accepted','confirmed') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_reason is null or p_reason not in ('patient_request','provider_unavailable','unable_to_service','other') then raise exception using errcode='22023',message='invalid_reason'; end if;
 if b.state in ('accepted','confirmed') then
  select cancel_window_minutes into cutoff from public.booking_policy_versions where id=b.policy_version_id and status='published';
  if cutoff is null or clock_timestamp()>b.start_at-make_interval(mins=>cutoff) then raise exception using errcode='55000',message='cancellation_policy_required'; end if;
 end if;
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 perform booking_private.release(b.id);
 return booking_private.transition(b.id,'cancelled',p_reason);
end $$;
create function public.advance_visit(p_booking_id uuid,p_substate text,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; visit public.doctor_visits; next_state text; result integer; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found or not identity_private.is_assigned(b.id,'doctor_visit') then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 if not identity_private.is_assigned(b.id,'doctor_visit') then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 select * into visit from public.doctor_visits where booking_id=b.id for update;
 if p_substate is null or not ((visit.substate='scheduled' and p_substate='en_route') or (visit.substate='en_route' and p_substate='arrived')
 or (visit.substate='arrived' and p_substate='service_started') or (visit.substate='service_started' and p_substate='service_completed'))
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 -- Operational markers only: no arrival OTP, clinical acceptance, prescription,
 -- consent or real-patient authority is inferred from these transitions.
 next_state:=case p_substate when 'service_started' then 'in_progress' when 'service_completed' then 'completed' else b.state end;
 result:=booking_private.transition(b.id,next_state,p_substate);
 update public.doctor_visits set substate=p_substate where booking_id=b.id;
 if p_substate='service_completed' then perform booking_private.release(b.id); end if;
 return result;
end $$;
create function public.request_reschedule(p_booking_id uuid,p_expected_version integer,p_start_at timestamptz,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if not exists(select 1 from public.bookings b where b.id=p_booking_id and booking_private.patient(b.patient_id,'booking:create'))
 then raise exception using errcode='42501',message='forbidden'; end if;
 -- No approved policy exists for limits/acceptance/release of old reservations.
 -- Explicitly disabled rather than guessing one or editing immutable snapshots.
 raise exception using errcode='55000',message='reschedule_policy_required';
end $$;

-- Read projections. Base booking/snapshot SELECT is patient-only; provider queue
-- must pass through this projection so preacceptance and terminal contact stays private.
create function public.get_booking(p_booking_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; result jsonb; patient boolean; details boolean; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 patient:=booking_private.patient(b.patient_id,'booking:read');
 if not patient and not booking_private.scheduler(b.provider_id) and not (identity_private.is_assigned(b.id,'doctor_visit')
 or identity_private.is_assigned(b.id,'lab_collection') or identity_private.is_assigned(b.id,'caretaker') or identity_private.is_assigned(b.id,'driver'))
 then raise exception using errcode='P0002',message='not_found'; end if;
 result:=jsonb_build_object('id',b.id,'public_ref',b.public_ref,'provider_id',b.provider_id,'category',b.category,'service_id',b.service_id,
 'pin_code',b.address_snapshot->>'pin_code','start_at',b.start_at,'end_at',b.end_at,'state',b.state,'version',b.version,
 'amount_paise',b.amount_paise::text,'currency',b.currency,'terms_version',b.terms_version,'policy_version_id',b.policy_version_id);
 details:=patient or (b.state in ('confirmed','in_progress') and public.provider_is_publishable(b.provider_id)
 and (booking_private.scheduler(b.provider_id) or identity_private.is_assigned(b.id,'doctor_visit') or identity_private.is_assigned(b.id,'lab_collection')
 or identity_private.is_assigned(b.id,'caretaker') or identity_private.is_assigned(b.id,'driver')));
 if details then result:=result||jsonb_build_object('patient_id',b.patient_id,'address_snapshot',b.address_snapshot,'contact_snapshot',b.contact_snapshot); end if;
 if b.category='doctor' then result:=result||jsonb_build_object('substate',(select substate from public.doctor_visits where booking_id=b.id)); end if;
 return result;
end $$;
create function public.list_bookings(p_provider_id uuid default null,p_limit integer default 20,p_after uuid default null) returns setof jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid_input'; end if;
 if p_provider_id is not null and not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 return query select public.get_booking(b.id) from public.bookings b where (p_after is null or b.id>p_after)
 and ((p_provider_id is not null and b.provider_id=p_provider_id) or (p_provider_id is null and booking_private.patient(b.patient_id,'booking:read')))
 order by b.id limit p_limit;
end $$;
create function public.get_provider_queue(p_provider_id uuid,p_limit integer default 20,p_after uuid default null) returns setof jsonb
language sql volatile security definer set search_path='' as $$ select * from public.list_bookings(p_provider_id,p_limit,p_after); $$;

-- Trusted scheduling commands: current ownership/membership, explicit resource
-- eligibility and version checks. A blackout conflicting with accepted work is
-- rejected; the operator must resolve that booking explicitly before adding it.
create function public.upsert_booking_resource(p_provider_id uuid,p_kind text,p_person_profile_id uuid default null,p_vehicle_key text default null,p_expected_version integer default 0,p_resource_id uuid default null,p_status text default 'active')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.providers; r public.resources; result uuid; begin
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(p_provider_id);
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into p from public.providers where id=p_provider_id;
 if p_kind is null or p_kind not in ('person','vehicle') or p_status is null or p_status not in ('active','disabled')
 or p_expected_version is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if p_kind='person' and (p_person_profile_id is null or p_vehicle_key is not null or not exists(select 1 from public.profiles x where x.id=p_person_profile_id and x.status='active')
 or not (p.individual_owner_profile_id is not distinct from p_person_profile_id or exists(select 1 from public.organization_members m
 where m.organization_id=p.organization_id and m.profile_id=p_person_profile_id and m.status='active' and m.accepted_at is not null and 'provider:read'=any(m.scopes))))
 then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version=0 and p_resource_id is null then
  if p_kind='person' then
   -- Reuse a person's canonical global identity across organizations/categories.
   select id into result from public.resources where person_profile_id=p_person_profile_id;
   if result is not null then return result; end if;
  end if;
  insert into public.resources(kind,person_profile_id,vehicle_key,owner_organization_id,owner_profile_id,status)
  values(p_kind,p_person_profile_id,p_vehicle_key,case when p_kind='vehicle' then p.organization_id end,
   case when p_kind='vehicle' then p.individual_owner_profile_id end,p_status) returning id into result;
 else
  select * into r from public.resources where id=p_resource_id for update;
  if not found or not booking_private.resource_eligible(p_provider_id,r.id) or (r.kind='person' and r.person_profile_id<>actor)
  then raise exception using errcode='42501',message='forbidden'; end if;
  if r.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
  if r.kind is distinct from p_kind or r.person_profile_id is distinct from p_person_profile_id or r.vehicle_key is distinct from p_vehicle_key
  then raise exception using errcode='55000',message='immutable_resource'; end if;
  if p_status='disabled' and exists(select 1 from public.resource_reservations where resource_id=r.id and status='active')
  then raise exception using errcode='40001',message='resource_in_use'; end if;
  update public.resources set status=p_status,version=version+1 where id=r.id returning id into result;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.resource_saved','resource',result);
 return result;
end $$;
create function public.set_booking_availability(p_provider_id uuid,p_resource_id uuid,p_weekday integer,p_local_start time,p_local_end time,p_effective_from date,p_effective_to date,p_expected_version integer,p_rule_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); result uuid; begin
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(p_provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 if not booking_private.scheduler(p_provider_id) or not booking_private.resource_eligible(p_provider_id,p_resource_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version=0 and p_rule_id is null then
  insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
   values(p_provider_id,p_resource_id,p_weekday,p_local_start,p_local_end,p_effective_from,p_effective_to) returning id into result;
 else
  perform 1 from public.availability_rules where id=p_rule_id and provider_id=p_provider_id and resource_id=p_resource_id for update;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  -- Do not rewrite availability under accepted reservations. This conservative
  -- rule avoids silently invalidating accepted work while policy is unresolved.
  if exists(select 1 from public.resource_reservations where resource_id=p_resource_id and status='active') then raise exception using errcode='40001',message='resource_in_use'; end if;
  update public.availability_rules set weekday=p_weekday,local_start=p_local_start,local_end=p_local_end,effective_from=p_effective_from,effective_to=p_effective_to,version=version+1
   where id=p_rule_id and version=p_expected_version returning id into result;
  if not found then raise exception using errcode='40001',message='stale_version'; end if;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.availability_saved','availability_rule',result);
 return result;
end $$;
create function public.add_booking_blackout(p_provider_id uuid,p_resource_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_reason text,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); result uuid; r public.resources; period tstzrange; begin
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(p_provider_id);
 select * into r from public.resources where id=p_resource_id for update;
 if not found or not booking_private.scheduler(p_provider_id) or not booking_private.resource_eligible(p_provider_id,p_resource_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or r.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if p_start_at is null or p_end_at is null or p_end_at<=p_start_at then raise exception using errcode='22023',message='invalid_input'; end if;
 period:=tstzrange(p_start_at,p_end_at,'[)');
 if exists(select 1 from public.resource_reservations where resource_id=r.id and status='active' and occupied_period && period) then raise exception using errcode='40001',message='resource_in_use'; end if;
 insert into public.availability_exceptions(provider_id,resource_id,period,reason) values(p_provider_id,r.id,period,p_reason) returning id into result;
 update public.resources set version=version+1 where id=r.id;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.blackout_added','availability_exception',result);
 return result;
end $$;

create function public.list_slots(p_provider_id uuid,p_service_id uuid,p_date date) returns table(start_at timestamptz,end_at timestamptz,advisory boolean)
language plpgsql volatile security definer set search_path='' as $$
declare s public.services; buf integer; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 if p_date is null or not isfinite(p_date) or p_date<(clock_timestamp() at time zone 'Asia/Kolkata')::date
 or p_date>(clock_timestamp() at time zone 'Asia/Kolkata')::date+31 then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into s from public.services where id=p_service_id and provider_id=p_provider_id and status='published';
 if not found or not identity_private.provider_publicly_bookable(p_provider_id) then return; end if;
 select buffer_minutes into buf from public.booking_policy_versions where status='published' order by version desc limit 1;
 return query with candidates as(
  select t as begins,t+make_interval(mins=>s.duration_minutes) as ends from generate_series(p_date::timestamp at time zone 'Asia/Kolkata',
   (p_date+1)::timestamp at time zone 'Asia/Kolkata',interval '15 minutes') t
  where t>clock_timestamp() and t+make_interval(mins=>s.duration_minutes)<=(p_date+1)::timestamp at time zone 'Asia/Kolkata'
 ), free as(
  select c.*,r.kind from candidates c join public.resources r on booking_private.resource_eligible(p_provider_id,r.id)
  where booking_private.in_schedule(p_provider_id,r.id,tstzrange(c.begins-make_interval(mins=>coalesce(buf,0)),c.ends+make_interval(mins=>coalesce(buf,0)),'[)'))
  and not exists(select 1 from public.resource_reservations rr where rr.resource_id=r.id and rr.status='active'
   and rr.occupied_period && tstzrange(c.begins-make_interval(mins=>coalesce(buf,0)),c.ends+make_interval(mins=>coalesce(buf,0)),'[)'))
 ) select f.begins,f.ends,true from free f group by f.begins,f.ends
 having bool_or(f.kind='person') and (s.category<>'ambulance' or bool_or(f.kind='vehicle')) order by f.begins limit 96;
end $$;

-- No table grants that could reveal provider-queue contacts. All writes through
-- explicit definer commands. Worker/outbox/transition-policy rows remain closed.
do $$ declare t text; begin
 foreach t in array array['booking_policy_versions','patient_addresses','bookings','booking_events','booking_transitions','resources','availability_rules','availability_exceptions','booking_assignments','resource_reservations','doctor_visits','notification_outbox'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
grant select on public.patient_addresses,public.bookings,public.booking_events,public.resources,public.availability_rules,public.availability_exceptions,public.booking_assignments,public.resource_reservations,public.doctor_visits to authenticated;
create policy b01_addresses_patient on public.patient_addresses for select to authenticated using(booking_private.patient(patient_id,'profile:read'));
create policy b01_bookings_patient on public.bookings for select to authenticated using(booking_private.patient(patient_id,'booking:read'));
create policy b01_events_patient on public.booking_events for select to authenticated using(booking_private.patient_booking(booking_id));
create policy b01_resources_scoped on public.resources for select to authenticated using(identity_private.active_account() and (person_profile_id=auth.uid()
 or exists(select 1 from public.availability_rules a where a.resource_id=resources.id and booking_private.scheduler(a.provider_id))));
create policy b01_rules_scoped on public.availability_rules for select to authenticated using(booking_private.scheduler(provider_id));
create policy b01_exceptions_scoped on public.availability_exceptions for select to authenticated using(booking_private.scheduler(provider_id));
-- Patients see their timeline through projection, never resource/person identifiers.
create policy b01_assignment_self on public.booking_assignments for select to authenticated using(assigned_profile_id=auth.uid() and
 (booking_private.assigned(booking_id,purpose)));
-- Reservations encode another patient's occupied time. Expose only free/busy via
-- list_slots; no base SELECT policy, despite grant, so cross-tenant rows stay closed.
create policy b01_visits_patient on public.doctor_visits for select to authenticated using(booking_private.patient_booking(booking_id));

revoke all on all functions in schema booking_private from public,anon,authenticated;
revoke all on function identity_private.is_assigned(uuid,text) from public,anon,authenticated;
grant execute on function booking_private.patient(uuid,text),booking_private.scheduler(uuid),booking_private.patient_booking(uuid),booking_private.assigned(uuid,text) to authenticated;
revoke all on all sequences in schema booking_private from public,anon,authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('save_patient_address','create_booking_request','accept_booking','decline_booking','cancel_booking','advance_visit','request_reschedule','get_booking','list_bookings','get_provider_queue','upsert_booking_resource','set_booking_availability','add_booking_blackout','list_slots') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.name);
  execute format('grant execute on function %s to authenticated',f.name);
 end loop;
end $$;
commit;
