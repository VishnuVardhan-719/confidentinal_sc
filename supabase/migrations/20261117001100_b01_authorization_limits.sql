-- B01-FIX / Codex / integ/b01-fixes / base e8a71ed.
-- Forward only; requires Q06 credential cases (20261117001000). Synthetic staging only.
begin;

create or replace function booking_private.resource_eligible(provider uuid,resource uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.providers p join public.resources r on r.id=resource and r.status='active' where p.id=provider and
 ((r.kind='person' and (p.category<>'doctor' or providers_private.person_is_verified(p.id,r.person_profile_id)) and exists(select 1 from public.profiles a where a.id=r.person_profile_id and a.status='active') and
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
 and ((b.category='doctor' and p_purpose='doctor_visit' and providers_private.person_is_verified(b.provider_id,auth.uid())) or (b.category='lab' and p_purpose='lab_collection')
 or (b.category='caretaker' and p_purpose='caretaker') or (b.category='ambulance' and p_purpose='driver')));
$$;

create or replace function booking_private.guard_booking() returns trigger language plpgsql security definer set search_path='' as $$
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
   or (who='provider' and not (booking_private.scheduler(old.provider_id)
    or (new.state='cancelled' and identity_private.is_assigned(old.id,'doctor_visit'))))
   or (who='assigned' and not (identity_private.is_assigned(old.id,'doctor_visit') or identity_private.is_assigned(old.id,'lab_collection')
    or identity_private.is_assigned(old.id,'caretaker') or identity_private.is_assigned(old.id,'driver')))
   or who='system' then raise exception using errcode='55000',message='invalid_transition'; end if;
 end if;
 return new;
end $$;

create or replace function public.save_patient_address(p_patient_id uuid,p_line1 text,p_locality text,p_pin text,p_contact_name text,p_phone text,p_expected_version integer,p_address_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); result uuid; begin
 if not booking_private.patient(p_patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;
 -- Serialize all address/booking creates for this patient before counting.
 perform 1 from public.patients where id=p_patient_id for update;
 if not booking_private.patient(p_patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version=0 and p_address_id is null then
  if (select count(*) from public.patient_addresses where patient_id=p_patient_id)>=20 then
   raise exception using errcode='53300',message='address_limit'; end if;
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

create or replace function public.create_booking_request(p_patient_id uuid,p_service_id uuid,p_address_id uuid,p_start_at timestamptz,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s public.services; price public.service_price_versions; a public.patient_addresses;
 policy uuid; result uuid; prior public.idempotency_requests; request_hash text;
begin
 if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform 1 from public.patients where id=p_patient_id for update;
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
 -- Replay precedes caps/horizon: retries remain safe after the quota fills.
 if p_start_at<=clock_timestamp() or p_start_at>clock_timestamp()+interval '90 days' then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if (select count(*) from public.bookings where patient_id=p_patient_id and state='requested')>=10 then
  raise exception using errcode='53300',message='pending_booking_limit'; end if;
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

create or replace function public.accept_booking(p_booking_id uuid,p_expected_version integer,p_resource_ids uuid[])
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
 if b.category<>'doctor' then raise exception using errcode='55000',message='category_deferred_to_s01'; end if;
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

create or replace function public.cancel_booking(p_booking_id uuid,p_expected_version integer,p_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; cutoff integer; result integer; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found or not (booking_private.patient(b.patient_id,'booking:create') or booking_private.scheduler(b.provider_id) or identity_private.is_assigned(b.id,'doctor_visit')) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 if not (booking_private.patient(b.patient_id,'booking:create') or booking_private.scheduler(b.provider_id) or identity_private.is_assigned(b.id,'doctor_visit')) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.state not in ('draft','requested','accepted','confirmed') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_reason is null or p_reason not in ('patient_request','provider_unavailable','unable_to_service','other') then raise exception using errcode='22023',message='invalid_reason'; end if;
 -- Provider cancellation is available without inventing a fee or payment state.
 if booking_private.patient(b.patient_id,'booking:create') and not booking_private.scheduler(b.provider_id)
 and not identity_private.is_assigned(b.id,'doctor_visit') then
  if clock_timestamp()>=b.start_at then raise exception using errcode='55000',message='cancellation_window_closed'; end if;
  if b.state in ('accepted','confirmed') then
  select cancel_window_minutes into cutoff from public.booking_policy_versions where id=b.policy_version_id and status='published';
   if cutoff is not null and clock_timestamp()>b.start_at-make_interval(mins=>cutoff) then
    raise exception using errcode='55000',message='cancellation_window_closed'; end if;
  end if;
 end if;
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 result:=booking_private.transition(b.id,'cancelled',p_reason);
 perform booking_private.release(b.id);
 return result;
end $$;

create or replace function public.advance_visit(p_booking_id uuid,p_substate text,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; visit public.doctor_visits; next_state text; result integer; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found or not identity_private.is_assigned(b.id,'doctor_visit') then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 if not identity_private.is_assigned(b.id,'doctor_visit') then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if clock_timestamp()<b.start_at-interval '60 minutes' then
  raise exception using errcode='55000',message='visit_too_early'; end if;
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

create or replace function public.get_booking(p_booking_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
 and clock_timestamp()>=b.start_at-interval '60 minutes' and clock_timestamp()<b.end_at+interval '12 hours'
 and (booking_private.scheduler(b.provider_id) or identity_private.is_assigned(b.id,'doctor_visit') or identity_private.is_assigned(b.id,'lab_collection')
 or identity_private.is_assigned(b.id,'caretaker') or identity_private.is_assigned(b.id,'driver')));
 if details then result:=result||jsonb_build_object('patient_id',b.patient_id,'address_snapshot',b.address_snapshot,'contact_snapshot',b.contact_snapshot); end if;
 if b.category='doctor' then result:=result||jsonb_build_object('substate',(select substate from public.doctor_visits where booking_id=b.id)); end if;
 return result;
end $$;

commit;
