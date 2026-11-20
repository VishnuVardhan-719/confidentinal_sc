-- P5 ambulance 1/3 / Kiro / feat/P5-ambulance / base integ/all 51c7439.
-- Design docs/specs/P5_ambulance_flow_design.md §5.3-§5.5, §7.1, §9 under contract v1.0
-- (docs/specs/P5_shared_engine_contract.md, which wins where they differ).
-- Fleet: vehicles, vehicle evidence, read tickets, driver roster and the two eligibility
-- predicates every trip command uses. Synthetic local/staging only. Authored, DB NOT EXECUTED.
-- Lock order for fleet commands: organisation, provider (booking_private.lock_provider),
-- resource, vehicle or roster row, documents, capability row (for share).
begin;

-- Preflight: every shared object this file uses must exist (contract §2.2).
do $$ begin
 if to_regprocedure('booking_private.lock_provider(uuid)') is null
 or to_regprocedure('booking_private.resource_eligible(uuid,uuid)') is null
 or to_regprocedure('booking_private.scheduler(uuid)') is null
 or to_regprocedure('booking_private.immutable()') is null
 or to_regprocedure('providers_private.required_staff_kind(text)') is null
 or to_regprocedure('providers_private.staff_evidence_ready(uuid,boolean)') is null
 or to_regprocedure('providers_private.staff_member(uuid,uuid)') is null
 or to_regprocedure('providers_private.org_admin(uuid,text)') is null
 or to_regprocedure('providers_private.access(uuid,text)') is null
 or to_regprocedure('identity_private.has_capability(text,uuid)') is null
 or to_regprocedure('identity_private.require_actor()') is null
 or to_regclass('public.ambulance_profiles') is null
 or to_regclass('public.provider_verification_cases') is null
 or to_regclass('booking_private.feature_gates') is null then
  raise exception 'P5 ambulance 001800: shared engine prerequisites (20261117001550-001590) missing';
 end if;
 -- P5-05: drivers are verified with a licence, not the provider-level vehicle_permit.
 if providers_private.required_staff_kind('ambulance') is distinct from 'licence' then
  raise exception 'P5 ambulance 001800: required_staff_kind(ambulance) must be licence';
 end if;
end $$;

create schema ambulance_private;
revoke all on schema ambulance_private from public,anon,authenticated,service_role;

-- §5.3 one row per vehicle resource. The registration number is resources.vehicle_key.
create table public.ambulance_vehicles (
 resource_id uuid primary key references public.resources(id),
 provider_id uuid not null,
 category text not null default 'ambulance' check (category='ambulance'),
 vehicle_type text not null check (vehicle_type in ('basic','patient_transfer')),
 supports text[] not null check (cardinality(supports) between 1 and 3 and array_position(supports,null) is null
  and supports <@ array['seated','wheelchair','stretcher']::text[]),
 case_state text not null default 'draft' check (case_state in ('draft','submitted','approved','rejected','suspended')),
 submitted_at timestamptz,
 verified_until timestamptz,
 decided_by_profile_id uuid references public.profiles(id),
 version integer not null default 1 check (version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (provider_id,category) references public.providers(id,category),
 check (case_state<>'approved' or (verified_until is not null and isfinite(verified_until) and decided_by_profile_id is not null)),
 check (case_state not in ('submitted','approved','suspended') or submitted_at is not null)
);
create index amb_vehicles_provider on public.ambulance_vehicles(provider_id);

-- §5.4 vehicle evidence, same shape as Q06 staff_credential_documents.
create table public.vehicle_credential_documents (
 id uuid primary key default gen_random_uuid(),
 vehicle_resource_id uuid not null references public.ambulance_vehicles(resource_id),
 uploaded_by_profile_id uuid not null references public.profiles(id),
 kind text not null check (kind in ('registration_certificate','fitness_certificate','permit','insurance')),
 bucket_id text not null default 'provider-verification' check (bucket_id='provider-verification'),
 object_name text not null unique,
 content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
 status text not null default 'pending' check (status in ('pending','verified','rejected','superseded')),
 expires_at timestamptz not null check (isfinite(expires_at)),
 created_at timestamptz not null default now(),
 check (object_name='vehicle/'||vehicle_resource_id::text||'/'||id::text||case content_type
  when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end)
);
create index amb_vehicle_documents_vehicle on public.vehicle_credential_documents(vehicle_resource_id);

-- Immutable case ledger, one row per vehicle version. Reason is a code, or the
-- verifier's decision text about the papers (1-500 chars, as Q06). No patient data.
create table public.vehicle_credential_events (
 id uuid primary key default gen_random_uuid(),
 vehicle_resource_id uuid not null references public.ambulance_vehicles(resource_id),
 actor_profile_id uuid not null references public.profiles(id),
 to_state text not null check (to_state in ('draft','submitted','approved','rejected','suspended')),
 reason text not null check (char_length(btrim(reason)) between 1 and 500),
 aggregate_version integer not null check (aggregate_version>0),
 occurred_at timestamptz not null default now(),
 unique (vehicle_resource_id,aggregate_version)
);
create trigger amb_vehicle_events_immutable before update or delete on public.vehicle_credential_events
 for each row execute function booking_private.immutable();
create trigger amb_vehicle_events_no_truncate before truncate on public.vehicle_credential_events
 for each statement execute function booking_private.immutable();

-- §5.5 driver roster. A person may drive for several operators; the global person
-- resource and the reservation exclusion stop overlapping work.
create table public.ambulance_drivers (
 provider_id uuid not null,
 resource_id uuid not null references public.resources(id),
 category text not null default 'ambulance' check (category='ambulance'),
 status text not null default 'active' check (status in ('active','disabled')),
 version integer not null default 1 check (version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (provider_id,resource_id),
 foreign key (provider_id,category) references public.providers(id,category)
);
create index amb_drivers_resource on public.ambulance_drivers(resource_id);

-- §5.4 60-second read tickets (copy of the 000660 model). No signed URLs.
create table ambulance_private.vehicle_document_read_tickets (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.vehicle_credential_documents(id),
 object_name text not null,
 grantee_profile_id uuid not null references public.profiles(id),
 purpose text not null check (purpose in ('owner_view','admin_review')),
 created_at timestamptz not null,
 expires_at timestamptz not null,
 check (expires_at=created_at+interval '60 seconds')
);
create index amb_tickets_lookup on ambulance_private.vehicle_document_read_tickets(object_name,grantee_profile_id,expires_at);
create index amb_tickets_document on ambulance_private.vehicle_document_read_tickets(document_id);
create trigger amb_tickets_immutable before update or delete on ambulance_private.vehicle_document_read_tickets
 for each row execute function booking_private.immutable();
create trigger amb_tickets_no_truncate before truncate on ambulance_private.vehicle_document_read_tickets
 for each statement execute function booking_private.immutable();

-- Guards: the backstop for a definer bug. No API role holds any table privilege.
create function ambulance_private.guard_vehicle() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_vehicle'; end if;
 if TG_OP='INSERT' then
  if new.case_state<>'draft' or new.version<>1 or not exists(select 1 from public.resources r join public.providers p on p.id=new.provider_id
   where r.id=new.resource_id and r.kind='vehicle' and p.category='ambulance'
   and ((p.organization_id is not null and r.owner_organization_id=p.organization_id)
    or (p.individual_owner_profile_id is not null and r.owner_profile_id=p.individual_owner_profile_id))) then
   raise exception using errcode='55000',message='invalid_vehicle'; end if;
  return new;
 end if;
 if new.resource_id is distinct from old.resource_id or new.provider_id is distinct from old.provider_id
 or new.category is distinct from old.category or new.created_at is distinct from old.created_at or new.version<>old.version+1
 or ((new.vehicle_type is distinct from old.vehicle_type or new.supports is distinct from old.supports) and old.case_state not in ('draft','rejected')) then
  raise exception using errcode='55000',message='immutable_vehicle'; end if;
 if new.case_state is distinct from old.case_state and not (
  (old.case_state in ('draft','rejected') and new.case_state='submitted')
  or (old.case_state='submitted' and new.case_state in ('approved','rejected'))
  or (old.case_state='approved' and new.case_state='suspended')) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 return new;
end $$;
create trigger amb_vehicle_guard before insert or update or delete on public.ambulance_vehicles
 for each row execute function ambulance_private.guard_vehicle();
create trigger amb_vehicle_no_truncate before truncate on public.ambulance_vehicles
 for each statement execute function booking_private.immutable();

create function ambulance_private.guard_vehicle_document() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_document'; end if;
 if TG_OP='INSERT' then
  if new.status<>'pending' then raise exception using errcode='55000',message='invalid_document'; end if;
  return new;
 end if;
 if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status')
 or not (old.status='pending' and new.status in ('verified','rejected','superseded')) then
  raise exception using errcode='55000',message='immutable_document'; end if;
 return new;
end $$;
create trigger amb_document_guard before insert or update or delete on public.vehicle_credential_documents
 for each row execute function ambulance_private.guard_vehicle_document();
create trigger amb_document_no_truncate before truncate on public.vehicle_credential_documents
 for each statement execute function booking_private.immutable();

create function ambulance_private.guard_driver() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_driver'; end if;
 if TG_OP='INSERT' then
  if new.version<>1 or not exists(select 1 from public.resources r join public.providers p on p.id=new.provider_id
   where r.id=new.resource_id and r.kind='person' and p.category='ambulance'
   and (p.individual_owner_profile_id=r.person_profile_id or providers_private.staff_member(p.id,r.person_profile_id))) then
   raise exception using errcode='55000',message='invalid_driver'; end if;
  return new;
 end if;
 if (to_jsonb(new)-array['status','version','updated_at']) is distinct from (to_jsonb(old)-array['status','version','updated_at'])
 or new.version<>old.version+1 then raise exception using errcode='55000',message='immutable_driver'; end if;
 return new;
end $$;
create trigger amb_driver_guard before insert or update or delete on public.ambulance_drivers
 for each row execute function ambulance_private.guard_driver();
create trigger amb_driver_no_truncate before truncate on public.ambulance_drivers
 for each statement execute function booking_private.immutable();

-- AMB-Q05 default: all four papers. One function, so the rule lives in one place.
create function ambulance_private.required_vehicle_kinds() returns text[] language sql immutable set search_path='' as $$
 select array['registration_certificate','fitness_certificate','permit','insurance']::text[];
$$;

-- Every required kind has a document in the wanted status, unexpired past p_until, with
-- its storage object. For pending (submission) no pending document may be expired or
-- missing its bytes. Recomputed every time; verified_until is display data only.
create function ambulance_private.vehicle_evidence_ready(p_resource_id uuid,p_verified_only boolean,p_until timestamptz) returns boolean
language sql volatile security definer set search_path='' as $$
 select p_until is not null and isfinite(p_until) and not exists(select 1 from unnest(ambulance_private.required_vehicle_kinds()) k(kind)
  where not exists(select 1 from public.vehicle_credential_documents d join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_name
   where d.vehicle_resource_id=p_resource_id and d.kind=k.kind
   and d.status=case when p_verified_only then 'verified' else 'pending' end
   and d.expires_at>greatest(p_until,clock_timestamp())))
 and (p_verified_only or not exists(select 1 from public.vehicle_credential_documents d where d.vehicle_resource_id=p_resource_id
  and d.status='pending' and (d.expires_at<=clock_timestamp()
   or not exists(select 1 from storage.objects o where o.bucket_id=d.bucket_id and o.name=d.object_name))));
$$;

-- §5.5 vehicle_eligible: owned by the provider (resource_eligible), approved case,
-- supports the requirement, and every required paper verified past p_until.
create function ambulance_private.vehicle_eligible(p_provider_id uuid,p_resource_id uuid,p_requirement text,p_until timestamptz) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(p_requirement is not null and booking_private.resource_eligible(p_provider_id,p_resource_id)
  and exists(select 1 from public.ambulance_vehicles v join public.resources r on r.id=v.resource_id
   where v.resource_id=p_resource_id and v.provider_id=p_provider_id and v.case_state='approved'
   and r.kind='vehicle' and r.status='active' and p_requirement=any(v.supports))
  and ambulance_private.vehicle_evidence_ready(p_resource_id,true,p_until),false);
$$;

-- §5.5 driver_eligible: on the active roster, resource_eligible (which since 001560
-- includes Q06 person_is_verified), and a driving licence valid past p_until. An
-- individual owner needs a verified licence provider document, because
-- person_is_verified short-circuits for owners; staff need the approved Q06 licence case.
create function ambulance_private.driver_eligible(p_provider_id uuid,p_resource_id uuid,p_until timestamptz) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(p_until is not null and isfinite(p_until) and booking_private.resource_eligible(p_provider_id,p_resource_id)
  and exists(select 1 from public.resources r
   join public.profiles x on x.id=r.person_profile_id and x.status='active'
   join public.ambulance_drivers d on d.resource_id=r.id and d.provider_id=p_provider_id and d.status='active'
   join public.providers p on p.id=p_provider_id and p.category='ambulance'
   where r.id=p_resource_id and r.kind='person' and r.status='active' and (
    (p.individual_owner_profile_id=r.person_profile_id and exists(select 1 from public.provider_documents pd
      join storage.objects o on o.bucket_id=pd.bucket_id and o.name=pd.object_name
      where pd.provider_id=p.id and pd.kind='licence' and pd.status='verified' and pd.expires_at>greatest(p_until,clock_timestamp())))
    or (providers_private.staff_member(p.id,r.person_profile_id) and exists(select 1 from public.provider_verification_cases c
      where c.provider_id=p.id and c.subject_profile_id=r.person_profile_id and c.state='approved' and c.verified_until>p_until
      and providers_private.staff_evidence_ready(c.id,true)
      and exists(select 1 from public.staff_credential_documents sd where sd.case_id=c.id
       and sd.kind=providers_private.required_staff_kind('ambulance') and sd.status='verified' and sd.expires_at>p_until))))),false);
$$;

-- Fleet manager: individual owner or org owner/manager with provider:manage.
create function ambulance_private.fleet_manager(p_provider_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(identity_private.active_account() and exists(select 1 from public.providers p where p.id=p_provider_id and p.category='ambulance')
  and providers_private.access(p_provider_id,'manage'),false);
$$;
-- Evidence editor: individual owner or org owner/manager with evidence:manage.
create function ambulance_private.evidence_editor(p_provider_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(identity_private.active_account() and exists(select 1 from public.providers p where p.id=p_provider_id and p.category='ambulance'
  and (p.individual_owner_profile_id=auth.uid() or providers_private.org_admin(p.organization_id,'evidence:manage'))),false);
$$;

create function ambulance_private.vehicle_event(p_resource_id uuid,p_code text,p_message text default null) returns void
language sql volatile security definer set search_path='' as $$
 insert into public.vehicle_credential_events(vehicle_resource_id,actor_profile_id,to_state,reason,aggregate_version)
 select resource_id,auth.uid(),case_state,coalesce(p_message,p_code),version from public.ambulance_vehicles where resource_id=p_resource_id;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id)
 values(auth.uid(),'ambulance.vehicle_'||p_code,'ambulance_vehicle',p_resource_id);
$$;

-- Single read rule used at ticket issue time and again at every storage read (001810).
-- admin_review: provider:document_read (AAL2, scoped), case submitted, unlinked to the
-- operator (not the owner, no membership row of any status, not the uploader).
create function ambulance_private.vehicle_document_read_allowed(p_document_id uuid,p_purpose text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(identity_private.active_account() and exists(select 1 from public.vehicle_credential_documents d
  join public.ambulance_vehicles v on v.resource_id=d.vehicle_resource_id join public.providers p on p.id=v.provider_id
  where d.id=p_document_id and (
   (p_purpose='owner_view' and (p.individual_owner_profile_id=auth.uid() or providers_private.org_admin(p.organization_id,'evidence:manage')))
   or (p_purpose='admin_review' and d.status in ('pending','verified') and v.case_state='submitted'
    and coalesce(identity_private.has_capability('provider:document_read',p.organization_id),false)
    and p.individual_owner_profile_id is distinct from auth.uid() and d.uploaded_by_profile_id<>auth.uid()
    and not exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.profile_id=auth.uid())))),false);
$$;

-- §7.1 register or edit a vehicle. Version 0 inserts; edits only in draft/rejected.
create function public.register_ambulance_vehicle(p_provider_id uuid,p_resource_id uuid,p_vehicle_type text,p_supports text[],p_expected_version integer)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_vehicle public.ambulance_vehicles; begin
 if not ambulance_private.fleet_manager(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_resource_id is null or p_vehicle_type is null or p_supports is null or p_expected_version is null or p_expected_version<0
 or p_vehicle_type not in ('basic','patient_transfer') or cardinality(p_supports) not between 1 and 3
 or array_position(p_supports,null) is not null or not (p_supports <@ array['seated','wheelchair','stretcher']::text[])
 or (select count(distinct x) from unnest(p_supports) x)<>cardinality(p_supports) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 perform booking_private.lock_provider(p_provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 if not ambulance_private.fleet_manager(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if not exists(select 1 from public.resources r where r.id=p_resource_id and r.kind='vehicle' and r.status='active')
 or not booking_private.resource_eligible(p_provider_id,p_resource_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if not exists(select 1 from public.ambulance_profiles a where a.provider_id=p_provider_id and p_vehicle_type=any(a.fleet_types)) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 select * into v_vehicle from public.ambulance_vehicles where resource_id=p_resource_id for update;
 if p_expected_version=0 then
  if found then raise exception using errcode='40001',message='stale_version'; end if;
  insert into public.ambulance_vehicles(resource_id,provider_id,vehicle_type,supports)
  values(p_resource_id,p_provider_id,p_vehicle_type,p_supports) returning * into v_vehicle;
  perform ambulance_private.vehicle_event(p_resource_id,'created');
 else
  if not found or v_vehicle.provider_id<>p_provider_id then raise exception using errcode='42501',message='forbidden'; end if;
  if v_vehicle.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
  if v_vehicle.case_state not in ('draft','rejected') then raise exception using errcode='55000',message='invalid_transition'; end if;
  update public.ambulance_vehicles set vehicle_type=p_vehicle_type,supports=p_supports,version=version+1,updated_at=clock_timestamp()
   where resource_id=p_resource_id returning * into v_vehicle;
  perform ambulance_private.vehicle_event(p_resource_id,'saved');
 end if;
 return v_vehicle.version;
end $$;

-- §7.1 reserve a document slot; the bytes go to Storage under object_name (see 001810).
create function public.add_vehicle_document(p_resource_id uuid,p_kind text,p_content_type text,p_expires_at timestamptz,p_expected_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_vehicle public.ambulance_vehicles; v_doc public.vehicle_credential_documents;
 v_id uuid:=gen_random_uuid(); begin
 select * into v_vehicle from public.ambulance_vehicles where resource_id=p_resource_id;
 if not found or not ambulance_private.evidence_editor(v_vehicle.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(v_vehicle.provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 select * into v_vehicle from public.ambulance_vehicles where resource_id=p_resource_id for update;
 if not ambulance_private.evidence_editor(v_vehicle.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or v_vehicle.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if v_vehicle.case_state not in ('draft','rejected') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_kind is null or not (p_kind=any(ambulance_private.required_vehicle_kinds()))
 or p_content_type is null or p_content_type not in ('application/pdf','image/jpeg','image/png')
 or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '5 years' then
  raise exception using errcode='22023',message='invalid_input'; end if;
 perform 1 from public.vehicle_credential_documents where vehicle_resource_id=p_resource_id order by id for update;
 if (select count(*) from public.vehicle_credential_documents where vehicle_resource_id=p_resource_id and status in ('pending','verified'))>=50 then
  raise exception using errcode='53300',message='document_limit'; end if;
 update public.vehicle_credential_documents set status='superseded' where vehicle_resource_id=p_resource_id and kind=p_kind and status='pending';
 insert into public.vehicle_credential_documents(id,vehicle_resource_id,uploaded_by_profile_id,kind,object_name,content_type,expires_at)
 values(v_id,p_resource_id,v_actor,p_kind,'vehicle/'||p_resource_id::text||'/'||v_id::text||case p_content_type
  when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_content_type,p_expires_at) returning * into v_doc;
 update public.ambulance_vehicles set version=version+1,updated_at=clock_timestamp() where resource_id=p_resource_id;
 perform ambulance_private.vehicle_event(p_resource_id,'document_added');
 return jsonb_build_object('id',v_doc.id,'bucket_id',v_doc.bucket_id,'object_name',v_doc.object_name,'version',v_vehicle.version+1);
end $$;

-- §7.1 submit: one pending, unexpired document with its bytes for every required kind.
create function public.submit_vehicle_case(p_resource_id uuid,p_expected_version integer) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_vehicle public.ambulance_vehicles; begin
 select * into v_vehicle from public.ambulance_vehicles where resource_id=p_resource_id;
 if not found or not ambulance_private.evidence_editor(v_vehicle.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(v_vehicle.provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 select * into v_vehicle from public.ambulance_vehicles where resource_id=p_resource_id for update;
 if not ambulance_private.evidence_editor(v_vehicle.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or v_vehicle.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if v_vehicle.case_state not in ('draft','rejected') then raise exception using errcode='55000',message='invalid_transition'; end if;
 perform 1 from public.vehicle_credential_documents where vehicle_resource_id=p_resource_id order by id for update;
 if not ambulance_private.vehicle_evidence_ready(p_resource_id,false,clock_timestamp()) then
  raise exception using errcode='55000',message='credentials_required'; end if;
 update public.ambulance_vehicles set case_state='submitted',submitted_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
  where resource_id=p_resource_id;
 perform ambulance_private.vehicle_event(p_resource_id,'submitted');
 return v_vehicle.version+1;
end $$;

-- §7.1 audited 60 s read ticket. The Storage download path is 001810.
create function public.authorize_vehicle_document_read(p_document_id uuid,p_purpose text)
returns table(bucket text,object_path text,ticket_expires_at timestamptz)
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_doc public.vehicle_credential_documents; v_at timestamptz:=clock_timestamp(); begin
 if p_document_id is null or p_purpose is null or p_purpose not in ('owner_view','admin_review')
 or not ambulance_private.vehicle_document_read_allowed(p_document_id,p_purpose) then
  raise exception using errcode='42501',message='forbidden'; end if;
 select * into v_doc from public.vehicle_credential_documents d where d.id=p_document_id;
 -- A reservation without bytes has nothing to read; same answer as unauthorized.
 if not exists(select 1 from storage.objects o where o.bucket_id=v_doc.bucket_id and o.name=v_doc.object_name) then
  raise exception using errcode='42501',message='forbidden'; end if;
 insert into ambulance_private.vehicle_document_read_tickets(document_id,object_name,grantee_profile_id,purpose,created_at,expires_at)
 values(v_doc.id,v_doc.object_name,v_actor,p_purpose,v_at,v_at+interval '60 seconds');
 insert into public.audit_events(actor_profile_id,action,target_type,target_id)
 values(v_actor,'ambulance.vehicle_document_read_'||p_purpose,'vehicle_credential_document',v_doc.id);
 return query select v_doc.bucket_id,v_doc.object_name,v_at+interval '60 seconds';
end $$;

-- §7.1 review. approved/rejected need provider:verify, suspended needs provider:suspend.
-- AMB-Q16 default: approval needs an admin_review ticket issued after submission for
-- every pending document, and the evidence still ready.
create function public.review_vehicle_case(p_resource_id uuid,p_decision text,p_reason text,p_expected_version integer) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_vehicle public.ambulance_vehicles; v_org uuid; v_expiry timestamptz;
 v_needed text:=case when p_decision='suspended' then 'provider:suspend' else 'provider:verify' end; begin
 if p_resource_id is null or p_expected_version is null or p_decision is null or p_decision not in ('approved','rejected','suspended')
 or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception using errcode='22023',message='invalid_input'; end if;
 select v.* into v_vehicle from public.ambulance_vehicles v join public.providers p on p.id=v.provider_id
  where v.resource_id=p_resource_id and coalesce(identity_private.has_capability(v_needed,p.organization_id),false);
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(v_vehicle.provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 select * into v_vehicle from public.ambulance_vehicles where resource_id=p_resource_id for update;
 perform 1 from public.vehicle_credential_documents where vehicle_resource_id=p_resource_id order by id for update;
 select organization_id into v_org from public.providers where id=v_vehicle.provider_id;
 -- Serialise with capability revocation, as review_provider does.
 perform 1 from public.admin_capabilities where profile_id=v_actor and capability=v_needed for share;
 if not coalesce(identity_private.has_capability(v_needed,v_org),false)
 or exists(select 1 from public.providers p where p.id=v_vehicle.provider_id and p.individual_owner_profile_id=v_actor)
 or exists(select 1 from public.organization_members m where m.organization_id=v_org and m.profile_id=v_actor)
 or exists(select 1 from public.vehicle_credential_documents d where d.vehicle_resource_id=p_resource_id and d.uploaded_by_profile_id=v_actor) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if v_vehicle.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if not ((v_vehicle.case_state='submitted' and p_decision in ('approved','rejected')) or (v_vehicle.case_state='approved' and p_decision='suspended')) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_decision='approved' then
  if not ambulance_private.vehicle_evidence_ready(p_resource_id,false,clock_timestamp()) then
   raise exception using errcode='55000',message='credentials_required'; end if;
  if exists(select 1 from public.vehicle_credential_documents d where d.vehicle_resource_id=p_resource_id and d.status='pending'
   and not exists(select 1 from ambulance_private.vehicle_document_read_tickets t where t.document_id=d.id and t.purpose='admin_review'
    and t.created_at>=v_vehicle.submitted_at)) then
   raise exception using errcode='55000',message='review_incomplete'; end if;
  select min(d.expires_at) into v_expiry from public.vehicle_credential_documents d where d.vehicle_resource_id=p_resource_id and d.status='pending';
  update public.vehicle_credential_documents set status='verified' where vehicle_resource_id=p_resource_id and status='pending';
 elsif p_decision='rejected' then
  update public.vehicle_credential_documents set status='rejected' where vehicle_resource_id=p_resource_id and status='pending';
 end if;
 update public.ambulance_vehicles set case_state=p_decision,
  verified_until=case when p_decision='approved' then v_expiry else verified_until end,
  decided_by_profile_id=v_actor,version=version+1,updated_at=clock_timestamp() where resource_id=p_resource_id;
 perform ambulance_private.vehicle_event(p_resource_id,p_decision,btrim(p_reason));
 return v_vehicle.version+1;
end $$;

-- §7.1 roster. Disabling a driver with a future active driver reservation for this
-- operator is refused; past kept reservations do not block (contract §11.3).
create function public.set_ambulance_driver(p_provider_id uuid,p_resource_id uuid,p_status text,p_expected_version integer) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_row public.ambulance_drivers; begin
 if not ambulance_private.fleet_manager(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_resource_id is null or p_status is null or p_status not in ('active','disabled') or p_expected_version is null or p_expected_version<0 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 perform booking_private.lock_provider(p_provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 if not ambulance_private.fleet_manager(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if not exists(select 1 from public.resources r join public.providers p on p.id=p_provider_id where r.id=p_resource_id and r.kind='person'
  and (p.individual_owner_profile_id=r.person_profile_id or providers_private.staff_member(p.id,r.person_profile_id))) then
  raise exception using errcode='42501',message='forbidden'; end if;
 select * into v_row from public.ambulance_drivers where provider_id=p_provider_id and resource_id=p_resource_id for update;
 if p_expected_version=0 then
  if found then raise exception using errcode='40001',message='stale_version'; end if;
  insert into public.ambulance_drivers(provider_id,resource_id,status) values(p_provider_id,p_resource_id,p_status) returning * into v_row;
 else
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  if v_row.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
  if p_status='disabled' and exists(select 1 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id
   join public.bookings b on b.id=a.booking_id where rr.resource_id=p_resource_id and rr.status='active' and a.purpose='driver'
   and b.provider_id=p_provider_id and upper(rr.occupied_period)>clock_timestamp()) then
   raise exception using errcode='40001',message='resource_in_use'; end if;
  update public.ambulance_drivers set status=p_status,version=version+1,updated_at=clock_timestamp()
   where provider_id=p_provider_id and resource_id=p_resource_id returning * into v_row;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(v_actor,'ambulance.driver_saved','resource',p_resource_id);
 return v_row.version;
end $$;

-- §7.1 fleet view for the operator: metadata only, never document content or licence numbers.
create function public.get_fleet(p_provider_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); begin
 if p_provider_id is null or not (ambulance_private.fleet_manager(p_provider_id) or (booking_private.scheduler(p_provider_id)
  and exists(select 1 from public.providers p where p.id=p_provider_id and p.category='ambulance'))) then
  raise exception using errcode='42501',message='forbidden'; end if;
 return jsonb_build_object(
  'vehicles',coalesce((select jsonb_agg(jsonb_build_object('resource_id',v.resource_id,'vehicle_key',r.vehicle_key,'vehicle_type',v.vehicle_type,
    'supports',to_jsonb(v.supports),'case_state',v.case_state,'verified_until',v.verified_until,'version',v.version,
    'eligible_now',ambulance_private.vehicle_eligible(v.provider_id,v.resource_id,v.supports[1],clock_timestamp()),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'status',d.status,'expires_at',d.expires_at) order by d.created_at,d.id)
     from public.vehicle_credential_documents d where d.vehicle_resource_id=v.resource_id and d.status in ('pending','verified')),'[]'::jsonb))
    order by v.resource_id)
   from public.ambulance_vehicles v join public.resources r on r.id=v.resource_id where v.provider_id=p_provider_id),'[]'::jsonb),
  'drivers',coalesce((select jsonb_agg(jsonb_build_object('resource_id',d.resource_id,
    'display_name',coalesce(nullif(btrim(x.display_name),''),'Driver'),'status',d.status,'version',d.version,
    'eligible_now',ambulance_private.driver_eligible(d.provider_id,d.resource_id,clock_timestamp()),
    'licence_valid_until',coalesce((select c.verified_until from public.provider_verification_cases c
      where c.provider_id=d.provider_id and c.subject_profile_id=r.person_profile_id and c.state='approved'),
     (select max(pd.expires_at) from public.provider_documents pd join public.providers p on p.id=pd.provider_id
      where pd.provider_id=d.provider_id and p.individual_owner_profile_id=r.person_profile_id and pd.kind='licence' and pd.status='verified')))
    order by d.resource_id)
   from public.ambulance_drivers d join public.resources r on r.id=d.resource_id join public.profiles x on x.id=r.person_profile_id
   where d.provider_id=p_provider_id),'[]'::jsonb));
end $$;

-- §9 grants. Tables: RLS on, no policy, no API-role privilege. Private functions: none.
do $$ declare t text; begin
 foreach t in array array['public.ambulance_vehicles','public.vehicle_credential_documents','public.vehicle_credential_events',
  'public.ambulance_drivers','ambulance_private.vehicle_document_read_tickets'] loop
  execute format('alter table %s enable row level security',t);
  execute format('revoke all on table %s from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function ambulance_private.guard_vehicle(),ambulance_private.guard_vehicle_document(),ambulance_private.guard_driver(),
 ambulance_private.required_vehicle_kinds(),ambulance_private.vehicle_evidence_ready(uuid,boolean,timestamptz),
 ambulance_private.vehicle_eligible(uuid,uuid,text,timestamptz),ambulance_private.driver_eligible(uuid,uuid,timestamptz),
 ambulance_private.fleet_manager(uuid),ambulance_private.evidence_editor(uuid),ambulance_private.vehicle_event(uuid,text,text),
 ambulance_private.vehicle_document_read_allowed(uuid,text)
 from public,anon,authenticated,service_role;
do $$ declare f text; begin
 foreach f in array array['public.register_ambulance_vehicle(uuid,uuid,text,text[],integer)',
  'public.add_vehicle_document(uuid,text,text,timestamptz,integer)','public.submit_vehicle_case(uuid,integer)',
  'public.authorize_vehicle_document_read(uuid,text)','public.review_vehicle_case(uuid,text,text,integer)',
  'public.set_ambulance_driver(uuid,uuid,text,integer)','public.get_fleet(uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
commit;
