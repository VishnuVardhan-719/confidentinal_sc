-- P5 shared engine 5/5 / Kiro / feat/P5-shared-engine / base integ/all f549ad3.
-- Contract §7: shared create core, generic create/accept/cancel/list_slots rewrites,
-- admission gates (§10). Signatures unchanged. Requires 001550-001580.
begin;

-- The built create body (001100) with action, hash, lead time and horizon supplied by
-- the caller. No gate check: callers do it. Never granted.
create function booking_private.create_request_core(p_patient_id uuid,p_service_id uuid,p_address_id uuid,p_start_at timestamptz,
 p_request_key uuid,p_action text,p_request_hash text,p_min_lead interval,p_horizon interval) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s public.services; price public.service_price_versions; a public.patient_addresses;
 policy uuid; result uuid; prior record;
begin
 if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform 1 from public.patients where id=p_patient_id for update;
 if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 select * into a from public.patient_addresses where id=p_address_id and patient_id=p_patient_id for share;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 if p_request_key is null or p_start_at is null or not isfinite(p_start_at) or p_action is null or p_request_hash is null
 or p_min_lead is null or p_horizon is null then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into prior from booking_private.replay(actor,p_action,p_request_key,p_request_hash);
 if prior.result_id is not null then return prior.result_id; end if;
 -- Replay precedes caps/horizon: retries remain safe after the quota fills.
 if p_start_at<=clock_timestamp()+p_min_lead or p_start_at>clock_timestamp()+p_horizon then
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
 if p_start_at<=clock_timestamp()+p_min_lead then raise exception using errcode='22023',message='invalid_input'; end if;
 select id into policy from public.booking_policy_versions where status='published' order by version desc limit 1;
 insert into public.bookings(requester_profile_id,patient_id,provider_id,category,service_id,price_version_id,amount_paise,currency,policy_version_id,terms_version,address_snapshot,contact_snapshot,start_at,end_at)
 values(actor,p_patient_id,s.provider_id,s.category,s.id,price.id,price.amount_paise,price.currency,policy,price.terms_version,
 jsonb_build_object('line1',a.line1,'locality',a.locality,'pin_code',a.pin_code),jsonb_build_object('name',a.contact_name,'phone',a.phone),
 p_start_at,p_start_at+make_interval(mins=>s.duration_minutes)) returning id into result;
 perform booking_private.transition(result,'requested','requested',p_request_key);
 perform booking_private.record_request(actor,p_action,p_request_key,p_request_hash,result,null);
 return result;
end $$;

-- Generic create: doctor and caretaker only (category_paths), database gate only.
create or replace function public.create_booking_request(p_patient_id uuid,p_service_id uuid,p_address_id uuid,p_start_at timestamptz,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); hash text; prior record; cat text; result uuid; begin
 if p_request_key is null or p_start_at is null or not isfinite(p_start_at) then raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_patient_id,p_service_id,p_address_id,p_start_at));
 select * into prior from booking_private.replay(actor,'booking.create',p_request_key,hash);
 if prior.result_id is not null then return prior.result_id; end if;
 select s.category into cat from public.services s where s.id=p_service_id;
 if cat is null then raise exception using errcode='42501',message='forbidden'; end if;
 if not coalesce((select generic_create from booking_private.category_paths where category=cat),false) then
  raise exception using errcode='55000',message='use_category_command'; end if;
 perform booking_private.require_gate(cat,'admission');
 result:=booking_private.create_request_core(p_patient_id,p_service_id,p_address_id,p_start_at,p_request_key,'booking.create',hash,interval '0',interval '90 days');
 -- Recheck after the core's locks: a gate change that committed meanwhile is seen.
 perform booking_private.require_gate(cat,'admission');
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
 if not coalesce((select generic_accept from booking_private.category_paths where category=b.category),false) then
  raise exception using errcode='55000',message='use_category_command'; end if;
 perform booking_private.require_gate(b.category,'admission');
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
  purpose:=case when r.kind='vehicle' then 'vehicle' else booking_private.person_purpose(b.category) end;
  insert into public.booking_assignments(booking_id,resource_id,purpose,assigned_profile_id,period)
  values(b.id,r.id,purpose,r.person_profile_id,tstzrange(b.start_at,b.end_at,'[)')) returning id into assignment;
  -- p5s_reservation_guard raises 55000 resource_busy for unresolved work elsewhere.
  insert into public.resource_reservations(assignment_id,resource_id,occupied_period) values(assignment,r.id,occupied);
  if r.kind='person' then person_assignment:=assignment; end if;
 end loop;
 perform booking_private.transition(b.id,'accepted','accepted');
 result:=booking_private.transition(b.id,'confirmed','confirmed');
 if b.category='doctor' then insert into public.doctor_visits(booking_id,assignment_id) values(b.id,person_assignment); end if;
 return result;
end $$;

-- Built body (001100) plus the blocks_cancel rule. No gate check: cancel is closeout.
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
 if exists(select 1 from public.booking_events ev join booking_private.category_reasons cr on cr.category=b.category and cr.code=ev.reason
  where ev.booking_id=b.id and cr.blocks_cancel) then raise exception using errcode='55000',message='invalid_transition'; end if;
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

-- Built body (0005) plus the admission path, the gate and the busy predicate.
create or replace function public.list_slots(p_provider_id uuid,p_service_id uuid,p_date date) returns table(start_at timestamptz,end_at timestamptz,advisory boolean)
language plpgsql volatile security definer set search_path='' as $$
declare s public.services; buf integer; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 if p_date is null or not isfinite(p_date) or p_date<(clock_timestamp() at time zone 'Asia/Kolkata')::date
 or p_date>(clock_timestamp() at time zone 'Asia/Kolkata')::date+31 then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into s from public.services where id=p_service_id and provider_id=p_provider_id and status='published';
 if not found or not identity_private.provider_publicly_bookable(p_provider_id) then return; end if;
 if not coalesce((select generic_create from booking_private.category_paths where category=s.category),false)
 or booking_private.gate_state(s.category)<>'on' then return; end if;
 select buffer_minutes into buf from public.booking_policy_versions where status='published' order by version desc limit 1;
 return query with candidates as(
  select t as begins,t+make_interval(mins=>s.duration_minutes) as ends from generate_series(p_date::timestamp at time zone 'Asia/Kolkata',
   (p_date+1)::timestamp at time zone 'Asia/Kolkata',interval '15 minutes') t
  where t>clock_timestamp() and t+make_interval(mins=>s.duration_minutes)<=(p_date+1)::timestamp at time zone 'Asia/Kolkata'
 ), eligible as(
  select r.id,r.kind from public.resources r where booking_private.resource_eligible(p_provider_id,r.id) and not booking_private.resource_busy(r.id)
 ), free as(
  select c.*,r.kind from candidates c join eligible r on true
  where booking_private.in_schedule(p_provider_id,r.id,tstzrange(c.begins-make_interval(mins=>coalesce(buf,0)),c.ends+make_interval(mins=>coalesce(buf,0)),'[)'))
  and not exists(select 1 from public.resource_reservations rr where rr.resource_id=r.id and rr.status='active'
   and rr.occupied_period && tstzrange(c.begins-make_interval(mins=>coalesce(buf,0)),c.ends+make_interval(mins=>coalesce(buf,0)),'[)'))
 ) select f.begins,f.ends,true from free f group by f.begins,f.ends
 having bool_or(f.kind='person') and (s.category<>'ambulance' or bool_or(f.kind='vehicle')) order by f.begins limit 96;
end $$;

revoke all on function booking_private.create_request_core(uuid,uuid,uuid,timestamptz,uuid,text,text,interval,interval) from public,anon,authenticated,service_role;
do $$ declare f text; begin
 foreach f in array array['public.create_booking_request(uuid,uuid,uuid,timestamptz,uuid)','public.accept_booking(uuid,integer,uuid[])',
  'public.cancel_booking(uuid,integer,text)','public.list_slots(uuid,uuid,date)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
