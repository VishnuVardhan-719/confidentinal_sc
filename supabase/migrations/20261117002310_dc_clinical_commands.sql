-- DC clinical core 2/2: predicates, commands and reads / Kiro / feat/DC-clinical-core / base integ/all bed2877.
-- DB NOT EXECUTED. Authored and desk-checked only; no Docker or database was available.
-- Design: docs/specs/DC_clinical_core_design.md A4-A7. Contract: P5 shared engine A10 (gate),
-- A13 (keyed replay), A1 rule 5 (errors).
-- Order inside every command (contract A13.1): require_actor; input shape and content check
-- (22023); request hash; keyed replay before live authorization; predicate; gate; locks
-- booking -> consultation; replay again; recheck predicate and gate; state and version;
-- mutation; record_request in the same transaction.
-- Nothing here writes booking_events, notification_outbox or N01 sources, and no audit row,
-- log line or replay row carries clinical content (audit_events holds ids only).
-- DC-extras interface (design A1, keep stable): public.get_clinical_record,
-- public.list_clinical_records, clinical_private.record_reader, clinical_private.record_document,
-- clinical_private.latest_record_id.
begin;

do $$ begin
 if to_regprocedure('clinical_private.check_sign(jsonb,boolean,boolean)') is null then
  raise exception 'DC clinical commands require 20261117002300_dc_clinical_model.sql'; end if;
end $$;

-- Gate (design A7): every clinical write needs doctor_clinical on. Reads never check it.
create function clinical_private.require_on() returns void language plpgsql volatile security definer set search_path='' as $$
declare s text:=booking_private.gate_state('doctor_clinical'); begin
 if s='suspended' then raise exception using errcode='55000',message='feature_suspended'; end if;
 if s<>'on' then raise exception using errcode='55000',message='feature_unavailable'; end if;
end $$;

-- Current owner, or accepted active provider:read member of an active organization.
create function clinical_private.provider_member(p_provider_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.providers p where p.id=p_provider_id and
  (p.individual_owner_profile_id=auth.uid() or exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
   where m.organization_id=p.organization_id and m.profile_id=auth.uid() and m.status='active' and m.accepted_at is not null
   and o.status='active' and 'provider:read'=any(m.scopes))));
$$;

-- In-visit author: the DC01 assignee predicate while the visit is started.
create function clinical_private.in_visit_author(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.doctor_visits v join public.bookings b on b.id=v.booking_id
  where v.booking_id=p_booking_id and b.category='doctor' and b.state='in_progress' and v.substate='service_started')
 and coalesce(doctor_private.assignee(p_booking_id),false);
$$;

-- Post-visit author (design A4, DCQ-3): the person on the visit's own assignment, which the
-- doctor's own completion ended, inside the DC01 window (end_at + 12 h), with the same
-- publishability, resource eligibility (active resource and membership) and Q06 tests as
-- identity_private.is_assigned. An ops close or an interruption leaves no author.
create function clinical_private.post_visit_author(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b
  join public.doctor_visits v on v.booking_id=b.id
  join public.booking_assignments a on a.id=v.assignment_id and a.booking_id=b.id
  join public.resources r on r.id=a.resource_id
  where b.id=p_booking_id and b.category='doctor' and b.state='completed' and v.substate='service_completed'
  and a.status='ended' and a.purpose='doctor_visit' and a.assigned_profile_id=auth.uid()
  and r.kind='person' and r.person_profile_id=auth.uid()
  and clock_timestamp()<b.end_at+interval '12 hours'
  and public.provider_is_publishable(b.provider_id) and booking_private.resource_eligible(b.provider_id,r.id)
  and providers_private.person_is_verified(b.provider_id,auth.uid()));
$$;

create function clinical_private.author(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(clinical_private.in_visit_author(p_booking_id),false) or coalesce(clinical_private.post_visit_author(p_booking_id),false);
$$;

-- Amender (design A4, DCQ-4): signer of the record, still a verified member, within 30 days of
-- the chain's first signature. The latest-version test is the command's (record_superseded).
create function clinical_private.amender(p_record_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from clinical_private.clinical_records r join clinical_private.clinical_records root on root.id=r.root_record_id
  where r.id=p_record_id and r.signed_by=auth.uid() and clock_timestamp()<root.signed_at+interval '30 days'
  and providers_private.person_is_verified(r.provider_id,auth.uid()) and clinical_private.provider_member(r.provider_id));
$$;

-- DC09 readers: the linked self patient, or the signer while still a member of the provider.
-- Schedulers, ops, other doctors and service_role are never readers.
create function clinical_private.record_reader(p_record_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from clinical_private.clinical_records r where r.id=p_record_id and
  (booking_private.patient(r.patient_id,'booking:read') or (r.signed_by=auth.uid() and clinical_private.provider_member(r.provider_id))));
$$;

create function clinical_private.booking_reader(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.bookings b where b.id=p_booking_id and b.category='doctor' and booking_private.patient(b.patient_id,'booking:read'))
 or exists(select 1 from clinical_private.clinical_records r where r.booking_id=p_booking_id and r.signed_by=auth.uid()
  and clinical_private.provider_member(r.provider_id));
$$;

create function clinical_private.latest_record_id(p_booking_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select latest_record_id from clinical_private.consultations where booking_id=p_booking_id;
$$;

-- The finalized document (design A1). No authorization and no audit: callers check record_reader.
-- No phone, address, patient id, amount or OTP.
create function clinical_private.record_document(p_record_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('record_id',r.id,'booking_id',r.booking_id,'booking_ref',b.public_ref,'record_version',r.record_version,
  'kind',r.kind,'supersedes_record_id',r.supersedes_record_id,'amendment_reason',r.amendment_reason,'is_latest',c.latest_record_id=r.id,
  'signed_at',r.signed_at,'signer',jsonb_build_object('name',s.display_name),
  'provider',jsonb_build_object('reference',p.public_reference,'name',p.published_profile->>'display_name'),
  'patient',jsonb_build_object('name',pp.display_name),
  'visit',jsonb_build_object('start_at',b.start_at,'end_at',b.end_at),
  'content',r.content,'vital_warnings',to_jsonb(clinical_private.vital_warnings(r.content->'vitals')),'content_sha256',r.content_sha256)
 from clinical_private.clinical_records r
 join clinical_private.consultations c on c.id=r.consultation_id
 join public.bookings b on b.id=r.booking_id
 join public.providers p on p.id=r.provider_id
 join public.profiles s on s.id=r.signed_by
 join public.patients pt on pt.id=r.patient_id
 join public.profiles pp on pp.id=pt.self_profile_id
 where r.id=p_record_id;
$$;

-- Typed prescription rows from frozen content; returns the number of lines.
create function clinical_private.insert_items(p_record_id uuid,p_content jsonb) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare cnt integer; begin
 insert into clinical_private.prescription_items(record_id,line_no,medication_name,form,strength,dose,route,frequency,duration_days,quantity,
  instructions,allergy_override_reason)
 select p_record_id,x.ord,x.item->>'medication_name',x.item->>'form',x.item->>'strength',x.item->>'dose',x.item->>'route',x.item->>'frequency',
  (x.item->>'duration_days')::numeric::integer,(x.item->>'quantity')::numeric::integer,x.item->>'instructions',x.item->>'allergy_override_reason'
 from jsonb_array_elements(coalesce(p_content#>'{prescription,items}','[]'::jsonb)) with ordinality x(item,ord);
 get diagnostics cnt=row_count;
 return cnt;
end $$;

-- DC04/DC05 keyed autosave. p_expected_version 0 creates the draft (version 1).
create function public.save_clinical_draft(p_booking_id uuid,p_expected_version integer,p_content jsonb,p_request_key uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior integer; b public.bookings; c clinical_private.consultations; result integer; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 0 and 2147483646 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 perform clinical_private.check_content(p_content,false);
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version,p_content));
 select r.result_version into prior from booking_private.replay(actor,'clinical.draft',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not clinical_private.author(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform clinical_private.require_on();
 select * into b from public.bookings where id=p_booking_id for update;
 select * into c from clinical_private.consultations where booking_id=b.id for update;
 select r.result_version into prior from booking_private.replay(actor,'clinical.draft',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not clinical_private.author(b.id) or (c.id is not null and c.author_profile_id<>actor) then
  raise exception using errcode='42501',message='forbidden'; end if;
 perform clinical_private.require_on();
 if c.id is null then
  if p_expected_version<>0 then raise exception using errcode='40001',message='stale_version'; end if;
  insert into clinical_private.consultations(booking_id,patient_id,provider_id,assignment_id,author_profile_id,content)
  select b.id,b.patient_id,b.provider_id,v.assignment_id,actor,p_content from public.doctor_visits v where v.booking_id=b.id
  returning * into c;
  result:=c.version;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'clinical.draft_created','consultation',c.id);
 else
  if c.status='signed' then raise exception using errcode='55000',message='draft_signed'; end if;
  if c.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
  if c.version>=5000 then raise exception using errcode='53300',message='draft_save_limit'; end if;
  update clinical_private.consultations set content=p_content,version=version+1,saved_at=clock_timestamp() where id=c.id returning version into result;
 end if;
 perform booking_private.record_request(actor,'clinical.draft',p_request_key,h,c.id,result);
 return result;
end $$;

-- Author only; anyone else gets the same P0002 as an unknown booking. No audit (own work).
create function public.get_clinical_draft(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); c clinical_private.consultations; begin
 if p_booking_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if not clinical_private.author(p_booking_id) then raise exception using errcode='P0002',message='not_found'; end if;
 select * into c from clinical_private.consultations where booking_id=p_booking_id;
 if c.id is not null and c.author_profile_id<>actor then raise exception using errcode='P0002',message='not_found'; end if;
 if c.id is null then
  return jsonb_build_object('booking_id',p_booking_id,'status','none','version',0,'content','{}'::jsonb,'saved_at',null::timestamptz,
   'record_id',null::uuid,'vital_warnings','[]'::jsonb,'allergy_conflicts','[]'::jsonb);
 end if;
 return jsonb_build_object('booking_id',c.booking_id,'status',c.status,'version',c.version,'content',c.content,'saved_at',c.saved_at,
  'record_id',c.latest_record_id,'vital_warnings',to_jsonb(clinical_private.vital_warnings(c.content->'vitals')),
  'allergy_conflicts',to_jsonb(clinical_private.allergy_conflicts(c.content)));
end $$;

-- DC07/DC08: freezes the exact draft version into an immutable record. Booking state and
-- payment state are neither read nor changed.
create function public.sign_clinical_record(p_booking_id uuid,p_expected_version integer,p_authored_confirmed boolean,
 p_allergies_reviewed boolean,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior uuid; b public.bookings; c clinical_private.consultations;
 rid uuid:=gen_random_uuid(); items integer; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646
 or p_authored_confirmed is null or p_allergies_reviewed is null then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version,p_authored_confirmed,p_allergies_reviewed));
 select r.result_id into prior from booking_private.replay(actor,'clinical.sign',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not clinical_private.author(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform clinical_private.require_on();
 select * into b from public.bookings where id=p_booking_id for update;
 select * into c from clinical_private.consultations where booking_id=b.id for update;
 select r.result_id into prior from booking_private.replay(actor,'clinical.sign',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not clinical_private.author(b.id) or (c.id is not null and c.author_profile_id<>actor) then
  raise exception using errcode='42501',message='forbidden'; end if;
 perform clinical_private.require_on();
 if c.id is not null and c.status='signed' then raise exception using errcode='55000',message='draft_signed'; end if;
 if c.id is null or c.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 perform clinical_private.check_sign(c.content,p_authored_confirmed,p_allergies_reviewed);
 insert into clinical_private.clinical_records(id,consultation_id,booking_id,patient_id,provider_id,root_record_id,record_version,kind,
  signed_by,source_draft_version,content)
 values(rid,c.id,c.booking_id,c.patient_id,c.provider_id,rid,1,'original',actor,c.version,c.content);
 items:=clinical_private.insert_items(rid,c.content);
 update clinical_private.consultations set status='signed',latest_record_id=rid where id=c.id;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'clinical.record_signed','clinical_record',rid);
 if items>0 then
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'clinical.prescription_signed','clinical_record',rid);
 end if;
 perform booking_private.record_request(actor,'clinical.sign',p_request_key,h,rid,1);
 return rid;
end $$;

-- DC07 append-only correction: a complete new version that supersedes the latest one.
create function public.amend_clinical_record(p_record_id uuid,p_content jsonb,p_reason text,p_authored_confirmed boolean,
 p_allergies_reviewed boolean,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior uuid; r clinical_private.clinical_records; b public.bookings;
 c clinical_private.consultations; rid uuid:=gen_random_uuid(); items integer; begin
 if p_record_id is null or p_request_key is null or p_authored_confirmed is null or p_allergies_reviewed is null
 or p_reason is null or char_length(btrim(p_reason))<1 or char_length(p_reason)>500 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 perform clinical_private.check_content(p_content,false);
 h:=booking_private.request_hash(jsonb_build_array(p_record_id,p_content,p_reason,p_authored_confirmed,p_allergies_reviewed));
 select x.result_id into prior from booking_private.replay(actor,'clinical.amend',p_request_key,h) x;
 if prior is not null then return prior; end if;
 if not clinical_private.amender(p_record_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform clinical_private.require_on();
 select * into r from clinical_private.clinical_records where id=p_record_id;
 select * into b from public.bookings where id=r.booking_id for update;
 select * into c from clinical_private.consultations where id=r.consultation_id for update;
 select x.result_id into prior from booking_private.replay(actor,'clinical.amend',p_request_key,h) x;
 if prior is not null then return prior; end if;
 if not clinical_private.amender(r.id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform clinical_private.require_on();
 if c.latest_record_id is distinct from r.id then raise exception using errcode='55000',message='record_superseded'; end if;
 perform clinical_private.check_sign(p_content,p_authored_confirmed,p_allergies_reviewed);
 insert into clinical_private.clinical_records(id,consultation_id,booking_id,patient_id,provider_id,root_record_id,record_version,kind,
  supersedes_record_id,amendment_reason,signed_by,content)
 values(rid,c.id,r.booking_id,r.patient_id,r.provider_id,r.root_record_id,r.record_version+1,'amendment',r.id,btrim(p_reason),actor,p_content);
 items:=clinical_private.insert_items(rid,p_content);
 update clinical_private.consultations set latest_record_id=rid where id=c.id;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'clinical.record_amended','clinical_record',rid);
 if items>0 then
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'clinical.prescription_signed','clinical_record',rid);
 end if;
 perform booking_private.record_request(actor,'clinical.amend',p_request_key,h,rid,r.record_version+1);
 return rid;
end $$;

-- DC09 and the DC-extras read. Every successful read is audited (ids only).
create function public.get_clinical_record(p_record_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if p_record_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if not clinical_private.record_reader(p_record_id) then raise exception using errcode='P0002',message='not_found'; end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'clinical.record_viewed','clinical_record',p_record_id);
 return clinical_private.record_document(p_record_id);
end $$;

-- Version list without content. A patient with no signed record gets an empty list; drafts
-- are never listed.
create function public.list_clinical_records(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if p_booking_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if not clinical_private.booking_reader(p_booking_id) then raise exception using errcode='P0002',message='not_found'; end if;
 return jsonb_build_object('booking_id',p_booking_id,'records',coalesce((select jsonb_agg(jsonb_build_object('record_id',r.id,
  'record_version',r.record_version,'kind',r.kind,'signed_at',r.signed_at,'supersedes_record_id',r.supersedes_record_id,
  'is_latest',c.latest_record_id=r.id) order by r.record_version)
  from clinical_private.clinical_records r join clinical_private.consultations c on c.id=r.consultation_id where r.booking_id=p_booking_id),'[]'::jsonb));
end $$;

revoke all on all functions in schema clinical_private from public, anon, authenticated, service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.save_clinical_draft(uuid,integer,jsonb,uuid)','public.get_clinical_draft(uuid)',
  'public.sign_clinical_record(uuid,integer,boolean,boolean,uuid)','public.amend_clinical_record(uuid,jsonb,text,boolean,boolean,uuid)',
  'public.get_clinical_record(uuid)','public.list_clinical_records(uuid)']::regprocedure[] loop
  execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
