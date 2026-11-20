-- P5 shared engine 2/5 / Kiro / feat/P5-shared-engine / base integ/all f549ad3.
-- Contract §4 (category-scoped transitions, guard), §5 (assignee closeout), §6.2 (ops
-- capability and predicate), §8.2 (verified assignees, P5-05 staff evidence kind).
-- Requires 20261117001550. Synthetic local/staging only.
begin;

-- §6.2: the six built values (000660) plus booking:incident. OD-2: nobody holds it yet.
alter table public.admin_capabilities drop constraint admin_capabilities_capability_check;
alter table public.admin_capabilities add constraint admin_capabilities_capability_check
 check (capability in ('provider:verify','provider:document_read','provider:suspend',
  'coverage:verify','security:audit','membership:admin','booking:incident'));

-- §4.2 rebuild in place. RLS and the closed grants on the table stay as built.
alter table public.booking_transitions drop constraint booking_transitions_pkey;
alter table public.booking_transitions drop constraint booking_transitions_actor_kind_check;
delete from public.booking_transitions;
alter table public.booking_transitions add column category text not null
 check (category in ('doctor','lab','ambulance','caretaker'));
alter table public.booking_transitions add constraint booking_transitions_actor_kind_check
 check (actor_kind in ('patient','provider','assigned','closeout','ops','system'));
alter table public.booking_transitions add constraint booking_transitions_pkey primary key (category,from_state,to_state,actor_kind);
-- Column order of the rebuilt table: from_state,to_state,actor_kind,category.
-- §4.3 matrix. The provider confirmed->no_show edge is gone for every category (OD-1).
insert into public.booking_transitions(category,from_state,to_state,actor_kind)
 select c,t.f,t.t,t.k from unnest(array['doctor','lab','ambulance','caretaker']) c,(values
  ('draft','requested','patient'),('draft','cancelled','patient'),
  ('requested','cancelled','patient'),('requested','cancelled','provider'),
  ('requested','declined','provider'),('requested','accepted','provider'),('requested','expired','system'),
  ('accepted','confirmed','provider'),('accepted','cancelled','patient'),('accepted','cancelled','provider'),
  ('confirmed','cancelled','patient'),('confirmed','cancelled','provider'),
  ('confirmed','in_progress','assigned'),('confirmed','interrupted','ops'),
  ('in_progress','completed','assigned'),('in_progress','completed','closeout'),
  ('in_progress','interrupted','assigned'),('in_progress','interrupted','closeout'),('in_progress','interrupted','ops')) t(f,t,k)
 union all select 'doctor','confirmed','cancelled','assigned'
 union all select c,'confirmed','interrupted','assigned' from unnest(array['doctor','ambulance']) c
 union all select c,'confirmed','no_show','ops' from unnest(array['doctor','lab','ambulance']) c;

-- §4.4 person purpose per category.
create function booking_private.person_purpose(p_category text) returns text language sql immutable set search_path='' as $$
 select case p_category when 'doctor' then 'doctor_visit' when 'lab' then 'lab_collection'
  when 'caretaker' then 'caretaker' when 'ambulance' then 'driver' end;
$$;

-- §8.2 P5-05: staff evidence kind. Provider-level evidence keeps required_kind
-- (ambulance providers still submit vehicle_permit); drivers submit a licence.
create function providers_private.required_staff_kind(p_category text) returns text language sql immutable set search_path='' as $$
 select case p_category when 'doctor' then 'registration' when 'lab' then 'licence'
  when 'ambulance' then 'licence' when 'caretaker' then 'background_check' end;
$$;

create or replace function providers_private.staff_evidence_ready(subject_case uuid,verified_only boolean) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.provider_verification_cases c join public.providers p on p.id=c.provider_id
 join public.staff_credential_documents d on d.case_id=c.id
 join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_name
 where c.id=subject_case and d.kind=providers_private.required_staff_kind(p.category)
 and d.status=case when verified_only then 'verified' else 'pending' end and d.expires_at>clock_timestamp())
 and not exists(select 1 from public.staff_credential_documents d where d.case_id=subject_case
 and d.status=case when verified_only then 'verified' else 'pending' end
 and (d.expires_at<=clock_timestamp() or not exists(select 1 from storage.objects o where o.bucket_id=d.bucket_id and o.name=d.object_name)));
$$;

-- Latest body is 001500 (M4 live-document cap). Only the written kind changes.
create or replace function public.add_staff_credential_document(p_case_id uuid,p_content_type text,p_expires_at timestamptz,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); c public.provider_verification_cases; d public.staff_credential_documents;
 doc uuid:=gen_random_uuid(); category text; begin
 select * into c from public.provider_verification_cases where id=p_case_id;
 if not found or not providers_private.staff_case_editor(c.provider_id,c.subject_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(c.provider_id);
 select * into c from public.provider_verification_cases where id=p_case_id for update;
 if not providers_private.staff_case_editor(c.provider_id,c.subject_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or c.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if c.state not in ('draft','rejected') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_content_type is null or p_content_type not in ('application/pdf','image/jpeg','image/png') or p_expires_at is null
 or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '5 years'
 then raise exception using errcode='22023',message='invalid_input'; end if;
 if (select count(*) from public.staff_credential_documents where case_id=c.id and status in ('pending','verified'))>=50
 then raise exception using errcode='53300',message='document_limit'; end if;
 select p.category into category from public.providers p where p.id=c.provider_id;
 update public.staff_credential_documents set status='superseded' where case_id=c.id and status='pending';
 insert into public.staff_credential_documents(id,case_id,uploaded_by_profile_id,kind,object_name,content_type,expires_at)
 values(doc,c.id,actor,providers_private.required_staff_kind(category),'staff/'||c.id::text||'/'||doc::text||case p_content_type
 when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_content_type,p_expires_at) returning * into d;
 update public.provider_verification_cases set version=version+1,updated_at=clock_timestamp() where id=c.id;
 perform providers_private.staff_event(c.id,'document_added');
 return jsonb_build_object('id',d.id,'bucket_id',d.bucket_id,'object_name',d.object_name,'version',c.version+1);
end $$;

-- §8.2: every person resource needs Q06 verification, in every category.
create or replace function booking_private.resource_eligible(provider uuid,resource uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.providers p join public.resources r on r.id=resource and r.status='active' where p.id=provider and
 ((r.kind='person' and providers_private.person_is_verified(p.id,r.person_profile_id) and exists(select 1 from public.profiles a where a.id=r.person_profile_id and a.status='active') and
 (p.individual_owner_profile_id=r.person_profile_id or exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
 where m.organization_id=p.organization_id and m.profile_id=r.person_profile_id and m.status='active' and m.accepted_at is not null
 and o.status='active' and 'provider:read'=any(m.scopes)))) or
 (r.kind='vehicle' and ((p.organization_id is not null and r.owner_organization_id=p.organization_id) or
 (p.individual_owner_profile_id is not null and r.owner_profile_id=p.individual_owner_profile_id)))));
$$;

create or replace function identity_private.is_assigned(p_booking_id uuid,p_purpose text) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b join public.booking_assignments a on a.booking_id=b.id
 join public.resources r on r.id=a.resource_id where b.id=p_booking_id and b.state in ('confirmed','in_progress')
 and a.status='active' and a.ended_at is null and a.purpose=p_purpose and r.kind='person' and r.person_profile_id=auth.uid()
 and a.assigned_profile_id=auth.uid() and clock_timestamp() >= b.start_at-interval '60 minutes'
 and clock_timestamp() < b.end_at+interval '12 hours'
 and public.provider_is_publishable(b.provider_id) and booking_private.resource_eligible(b.provider_id,r.id)
 and p_purpose=booking_private.person_purpose(b.category)
 and providers_private.person_is_verified(b.provider_id,auth.uid()));
$$;

-- §5.2 closeout: no time window, publishability or Q06 test; current ownership or
-- accepted active provider:read membership and an active account stay required.
create function booking_private.closeout_assignee(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b
  join public.booking_assignments a on a.booking_id=b.id join public.resources r on r.id=a.resource_id
  join public.providers p on p.id=b.provider_id
  where b.id=p_booking_id and b.state='in_progress' and a.status='active' and a.purpose=booking_private.person_purpose(b.category)
  and a.assigned_profile_id=auth.uid() and r.kind='person' and r.status='active' and r.person_profile_id=auth.uid()
  and (p.individual_owner_profile_id=auth.uid() or exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
   where m.organization_id=p.organization_id and m.profile_id=auth.uid() and m.status='active' and m.accepted_at is not null
   and 'provider:read'=any(m.scopes) and o.status='active')));
$$;
-- The same predicate for the assigned person, read by ops (§6.4 condition c).
create function booking_private.closeout_possible(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.bookings b
  join public.booking_assignments a on a.booking_id=b.id join public.resources r on r.id=a.resource_id
  join public.providers p on p.id=b.provider_id join public.profiles x on x.id=a.assigned_profile_id
  where b.id=p_booking_id and b.state='in_progress' and a.status='active' and a.purpose=booking_private.person_purpose(b.category)
  and x.status='active' and r.kind='person' and r.status='active' and r.person_profile_id=a.assigned_profile_id
  and (p.individual_owner_profile_id=a.assigned_profile_id or exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
   where m.organization_id=p.organization_id and m.profile_id=a.assigned_profile_id and m.status='active' and m.accepted_at is not null
   and 'provider:read'=any(m.scopes) and o.status='active')));
$$;

-- §6.2 independent ops actor: AAL2 booking:incident (global, or org-scoped for an
-- organization provider) and no relationship of any status to the booking.
create function booking_private.ops_actor(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b join public.providers p on p.id=b.provider_id
  join public.patients pt on pt.id=b.patient_id
  where b.id=p_booking_id and coalesce(identity_private.has_capability('booking:incident',p.organization_id),false)
  and p.individual_owner_profile_id is distinct from auth.uid()
  and not exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.profile_id=auth.uid())
  and pt.self_profile_id is distinct from auth.uid() and b.requester_profile_id<>auth.uid()
  and not exists(select 1 from public.booking_assignments a where a.booking_id=b.id and a.assigned_profile_id=auth.uid()));
$$;

create function booking_private.actor_holds(p_kind text,p_booking public.bookings) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 return case p_kind
  when 'patient' then booking_private.patient(p_booking.patient_id,'booking:create')
  when 'provider' then booking_private.scheduler(p_booking.provider_id)
  when 'assigned' then identity_private.is_assigned(p_booking.id,booking_private.person_purpose(p_booking.category))
  when 'closeout' then booking_private.closeout_assignee(p_booking.id)
  when 'ops' then booking_private.ops_actor(p_booking.id)
  else false end;
end $$;

-- §4.4: a state change needs a transition row for the booking's category and any kind the caller holds.
create or replace function booking_private.guard_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
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
 if new.state is distinct from old.state and not exists(select 1 from public.booking_transitions t
  where t.category=old.category and t.from_state=old.state and t.to_state=new.state and booking_private.actor_holds(t.actor_kind,old)) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 return new;
end $$;

-- §5.2 assignee terminal step, called by category commands after their own locks and checks.
create function booking_private.assignee_finish(p_booking_id uuid,p_next_state text,p_reason text,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; eligible boolean; result integer; begin
 if p_next_state is null or p_next_state not in ('completed','interrupted') then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 eligible:=coalesce(identity_private.is_assigned(b.id,booking_private.person_purpose(b.category)),false);
 result:=booking_private.transition(b.id,p_next_state,p_reason,p_request_key);
 if not eligible then perform booking_private.open_exception(b.id,'closed_while_ineligible',p_reason); end if;
 perform booking_private.finish_assignments(b.id);
 return result;
end $$;

revoke all on function booking_private.person_purpose(text),providers_private.required_staff_kind(text),
 booking_private.closeout_assignee(uuid),booking_private.closeout_possible(uuid),booking_private.ops_actor(uuid),
 booking_private.actor_holds(text,public.bookings),booking_private.guard_booking(),
 booking_private.assignee_finish(uuid,text,text,uuid),
 providers_private.staff_evidence_ready(uuid,boolean),booking_private.resource_eligible(uuid,uuid),identity_private.is_assigned(uuid,text)
 from public,anon,authenticated,service_role;
revoke all on function public.add_staff_credential_document(uuid,text,timestamptz,integer) from public,anon,authenticated,service_role;
grant execute on function public.add_staff_credential_document(uuid,text,timestamptz,integer) to authenticated;
commit;
