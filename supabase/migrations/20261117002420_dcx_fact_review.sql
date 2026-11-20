-- DC extras 3/5 / Kiro / feat/DC-extras / base integ/all bed2877.
-- Design §5: DC11 health fact verification history. Synthetic local/staging only.
-- Authored, DB NOT EXECUTED.
--
-- A fact is a head row plus immutable versions. A verification points at one exact version
-- (FK fact_id, fact_version), so revising a fact appends version n+1 and every review of
-- version n stays linked to n. Patients record and revise (source patient_reported); only a
-- currently verified clinician during a started visit for the same patient verifies, with a
-- coded evidence kind and an identifier reference. Patients never create verifications, so
-- "doctor verified" never means a patient declaration or a bare click.
-- All three tables: RLS on, no policies, no privilege for any API role. Reads go through
-- list_health_facts. Audit rows hold ids and an action only; the statement never leaves the
-- tables (no event, outbox or notification row is written).
begin;

do $$ declare obj text; begin
 foreach obj in array array['dcx_private.require_feature(text,text)','dcx_private.in_visit_doctor(uuid)','booking_private.patient(uuid,text)',
  'doctor_private.assignee(uuid)','doctor_private.closeout(uuid)'] loop
  if to_regprocedure(obj) is null then raise exception 'DC extras 002420 preflight: missing %',obj; end if;
 end loop;
end $$;

create table public.health_facts (
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.patients(id) on delete restrict,
 kind text not null check (kind in ('allergy','condition','medication','procedure','other')),
 current_version integer not null default 1 check (current_version between 1 and 1000),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index dcx_facts_patient on public.health_facts(patient_id,created_at,id);
create table public.health_fact_versions (
 fact_id uuid not null references public.health_facts(id) on delete restrict,
 version integer not null check (version between 1 and 1000),
 kind text not null check (kind in ('allergy','condition','medication','procedure','other')),
 statement text not null check (char_length(statement) between 1 and 200 and statement=btrim(statement) and statement !~ '[[:cntrl:]]'),
 source text not null check (source='patient_reported'),
 recorded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key (fact_id,version)
);
create table public.health_fact_verifications (
 id uuid primary key default gen_random_uuid(),
 fact_id uuid not null,
 fact_version integer not null,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 provider_id uuid not null references public.providers(id) on delete restrict,
 reviewer_profile_id uuid not null references public.profiles(id) on delete restrict,
 outcome text not null check (outcome in ('confirmed','not_confirmed')),
 evidence_kind text not null check (evidence_kind in ('document_reviewed','clinical_examination','prior_clinical_record','medication_inspected')),
 evidence_ref text not null check (evidence_ref ~ '^[A-Za-z0-9._:/-]{1,80}$'),
 reviewed_at timestamptz not null default clock_timestamp(),
 foreign key (fact_id,fact_version) references public.health_fact_versions(fact_id,version) on delete restrict,
 unique (fact_id,fact_version,booking_id)
);
create index dcx_fact_reviews_booking on public.health_fact_verifications(booking_id);

-- Head guard: only current_version (+1) and updated_at change; kind and patient are fixed.
create function dcx_private.guard_fact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_fact'; end if;
 if TG_OP='INSERT' then
  if new.current_version<>1 then raise exception using errcode='55000',message='immutable_fact'; end if;
  return new;
 end if;
 if new.id is distinct from old.id or new.patient_id is distinct from old.patient_id or new.kind is distinct from old.kind
 or new.created_at is distinct from old.created_at or new.current_version<>old.current_version+1 then
  raise exception using errcode='55000',message='immutable_fact'; end if;
 return new;
end $$;
create trigger dcx_fact_guard before insert or update or delete on public.health_facts for each row execute function dcx_private.guard_fact();
create trigger dcx_fact_no_truncate before truncate on public.health_facts for each statement execute function booking_private.immutable();
-- A version row is written only as the head's current version, with the head's kind.
create function dcx_private.guard_fact_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.health_facts f where f.id=new.fact_id and f.current_version=new.version and f.kind=new.kind) then
  raise exception using errcode='55000',message='immutable_fact'; end if;
 return new;
end $$;
create trigger dcx_fact_version_insert before insert on public.health_fact_versions for each row execute function dcx_private.guard_fact_version();
create trigger dcx_fact_version_immutable before update or delete on public.health_fact_versions for each row execute function booking_private.immutable();
create trigger dcx_fact_version_no_truncate before truncate on public.health_fact_versions for each statement execute function booking_private.immutable();
create trigger dcx_fact_review_immutable before update or delete on public.health_fact_verifications for each row execute function booking_private.immutable();
create trigger dcx_fact_review_no_truncate before truncate on public.health_fact_verifications for each statement execute function booking_private.immutable();

do $$ declare t text; begin
 foreach t in array array['health_facts','health_fact_versions','health_fact_verifications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function public.record_health_fact(p_patient_id uuid,p_kind text,p_statement text,p_request_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s text:=btrim(p_statement); h text; prior record; fid uuid; begin
 if p_patient_id is null or p_request_key is null or p_kind is null or p_kind not in ('allergy','condition','medication','procedure','other')
 or s is null or char_length(s) not between 1 and 200 or s ~ '[[:cntrl:]]' then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_patient_id,p_kind,s));
 select * into prior from booking_private.replay(actor,'dcx.fact.record',p_request_key,h);
 if prior.result_id is not null then return jsonb_build_object('fact_id',prior.result_id,'version',prior.result_version); end if;
 if not booking_private.patient(p_patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_fact_review','write');
 perform 1 from public.patients where id=p_patient_id for update;
 select * into prior from booking_private.replay(actor,'dcx.fact.record',p_request_key,h);
 if prior.result_id is not null then return jsonb_build_object('fact_id',prior.result_id,'version',prior.result_version); end if;
 if not booking_private.patient(p_patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_fact_review','write');
 if (select count(*) from public.health_facts where patient_id=p_patient_id)>=100 then
  raise exception using errcode='53300',message='fact_limit'; end if;
 insert into public.health_facts(patient_id,kind) values(p_patient_id,p_kind) returning id into fid;
 insert into public.health_fact_versions(fact_id,version,kind,statement,source,recorded_by_profile_id) values(fid,1,p_kind,s,'patient_reported',actor);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'health_fact.recorded','health_fact',fid);
 perform booking_private.record_request(actor,'dcx.fact.record',p_request_key,h,fid,1);
 return jsonb_build_object('fact_id',fid,'version',1);
end $$;

-- Appends version n+1. p_expected_version is the fact's current_version.
create function public.revise_health_fact(p_fact_id uuid,p_statement text,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s text:=btrim(p_statement); h text; prior record; f public.health_facts; begin
 if p_fact_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 999
 or s is null or char_length(s) not between 1 and 200 or s ~ '[[:cntrl:]]' then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_fact_id,s,p_expected_version));
 select * into prior from booking_private.replay(actor,'dcx.fact.revise',p_request_key,h);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into f from public.health_facts where id=p_fact_id;
 if not found or not booking_private.patient(f.patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_fact_review','write');
 select * into f from public.health_facts where id=p_fact_id for update;
 select * into prior from booking_private.replay(actor,'dcx.fact.revise',p_request_key,h);
 if prior.result_version is not null then return prior.result_version; end if;
 if not booking_private.patient(f.patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_fact_review','write');
 if f.current_version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 update public.health_facts set current_version=current_version+1,updated_at=clock_timestamp() where id=f.id;
 insert into public.health_fact_versions(fact_id,version,kind,statement,source,recorded_by_profile_id)
  values(f.id,f.current_version+1,f.kind,s,'patient_reported',actor);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'health_fact.revised','health_fact',f.id);
 perform booking_private.record_request(actor,'dcx.fact.revise',p_request_key,h,f.id,f.current_version+1);
 return f.current_version+1;
end $$;

-- Lock order: booking (share), fact head (update). A revision committing first makes the
-- review stale (40001); a review committing first stays on the version it saw.
create function public.verify_health_fact(p_fact_id uuid,p_fact_version integer,p_booking_id uuid,p_outcome text,
 p_evidence_kind text,p_evidence_ref text,p_request_key uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior record; b public.bookings; f public.health_facts; rid uuid; begin
 if p_fact_id is null or p_booking_id is null or p_request_key is null or p_fact_version is null or p_fact_version not between 1 and 1000
 or p_outcome is null or p_outcome not in ('confirmed','not_confirmed')
 or p_evidence_kind is null or p_evidence_kind not in ('document_reviewed','clinical_examination','prior_clinical_record','medication_inspected')
 or p_evidence_ref is null or p_evidence_ref !~ '^[A-Za-z0-9._:/-]{1,80}$' then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_fact_id,p_fact_version,p_booking_id,p_outcome,p_evidence_kind,p_evidence_ref));
 select * into prior from booking_private.replay(actor,'dcx.fact.verify',p_request_key,h);
 if prior.result_id is not null then return prior.result_id; end if;
 select * into b from public.bookings where id=p_booking_id;
 select * into f from public.health_facts where id=p_fact_id;
 -- Unknown fact, other patient's fact and wrong doctor all answer the same.
 if b.id is null or f.id is null or f.patient_id<>b.patient_id or not dcx_private.in_visit_doctor(b.id) then
  raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_fact_review','write');
 select * into b from public.bookings where id=p_booking_id for share;
 select * into f from public.health_facts where id=p_fact_id for update;
 select * into prior from booking_private.replay(actor,'dcx.fact.verify',p_request_key,h);
 if prior.result_id is not null then return prior.result_id; end if;
 if f.patient_id<>b.patient_id or not dcx_private.in_visit_doctor(b.id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_fact_review','write');
 if f.current_version<>p_fact_version then raise exception using errcode='40001',message='stale_version'; end if;
 if exists(select 1 from public.health_fact_verifications v where v.fact_id=f.id and v.fact_version=p_fact_version and v.booking_id=b.id) then
  raise exception using errcode='55000',message='already_reviewed'; end if;
 insert into public.health_fact_verifications(fact_id,fact_version,booking_id,provider_id,reviewer_profile_id,outcome,evidence_kind,evidence_ref)
  values(f.id,p_fact_version,b.id,b.provider_id,actor,p_outcome,p_evidence_kind,p_evidence_ref) returning id into rid;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'health_fact.verified','health_fact',f.id);
 perform booking_private.record_request(actor,'dcx.fact.verify',p_request_key,h,rid,p_fact_version);
 return rid;
end $$;

-- Patient (profile:read), or the visit's doctor (DC01 assignee or closeout) for that
-- booking's patient. Every version with its source, and every review with the reviewer's
-- account display name and the provider's public reference (no profile ids). A doctor read is
-- audited (ids only).
create function public.list_health_facts(p_patient_id uuid,p_booking_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); doctor boolean:=false; begin
 if p_patient_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 perform dcx_private.require_feature('doctor_fact_review','read');
 if not booking_private.patient(p_patient_id,'profile:read') then
  doctor:=p_booking_id is not null and exists(select 1 from public.bookings b where b.id=p_booking_id and b.patient_id=p_patient_id
   and b.category='doctor' and (doctor_private.assignee(b.id) or doctor_private.closeout(b.id)));
  if not doctor then raise exception using errcode='P0002',message='not_found'; end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'health_fact.read_by_doctor','booking',p_booking_id);
 end if;
 return jsonb_build_object('patient_id',p_patient_id,'facts',coalesce((select jsonb_agg(jsonb_build_object(
   'fact_id',f.id,'kind',f.kind,'current_version',f.current_version,
   'versions',(select jsonb_agg(jsonb_build_object('version',v.version,'statement',v.statement,'source',v.source,'recorded_at',v.recorded_at)
     order by v.version) from public.health_fact_versions v where v.fact_id=f.id),
   'verifications',coalesce((select jsonb_agg(jsonb_build_object('fact_version',r.fact_version,'outcome',r.outcome,
     'evidence_kind',r.evidence_kind,'evidence_ref',r.evidence_ref,'reviewed_at',r.reviewed_at,
     'reviewer_name',(select pr.display_name from public.profiles pr where pr.id=r.reviewer_profile_id),
     'provider_reference',(select p.public_reference from public.providers p where p.id=r.provider_id))
     order by r.reviewed_at,r.id) from public.health_fact_verifications r where r.fact_id=f.id),'[]'::jsonb))
   order by f.created_at,f.id)
  from (select * from public.health_facts x where x.patient_id=p_patient_id order by x.created_at,x.id limit 100) f),'[]'::jsonb));
end $$;

revoke all on all functions in schema dcx_private from public, anon, authenticated, service_role;
do $$ declare f text; begin
 foreach f in array array['public.record_health_fact(uuid,text,text,uuid)','public.revise_health_fact(uuid,text,integer,uuid)',
  'public.verify_health_fact(uuid,integer,uuid,text,text,text,uuid)','public.list_health_facts(uuid,uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
