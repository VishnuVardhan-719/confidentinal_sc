-- P5 lab 3/3 / Kiro / feat/P5-lab / base integ/all 51c7439.
-- Lab commands and projections. Contract v1.0 S5 (closeout), S8.3 (projection rule),
-- S10 (gates), S12 (lab releases), S13 (keyed replay), S15 lab; design S6-S8.
-- Requires 20261117001700 and 001710. Synthetic local/staging only.
-- Gate phases (S10.1): admission = get_lab_test_public, list_lab_slots, create, accept;
-- start = start_collection; closeout = absence, collected, handoff, failures, follow-up;
-- read = get_lab_order, list_lab_followups; config = set_lab_test.
-- OD-1 default: no lab no-show command. Absence opens the shared absence_reported
-- exception and ops resolves it through ops_close_booking (S6.4).
-- Lock order (S11.4): booking, provider (organisation first), resources by id, lab_orders.
begin;

do $$ begin
 if to_regprocedure('lab_private.assert_shared()') is null or to_regclass('public.lab_orders') is null
 or to_regclass('public.lab_order_items') is null or to_regclass('public.lab_tests') is null then
  raise exception using errcode='55000',message='lab_orders_required'; end if;
 perform lab_private.assert_shared();
end $$;

-- Live assignee authority for a lab step. Terminal steps from in_progress also accept
-- the shared closeout predicate (S5.2); start, absence and collected never do.
create function lab_private.may_advance(p_booking_id uuid,p_terminal boolean) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.bookings b where b.id=p_booking_id and b.category='lab')
 and (identity_private.is_assigned(p_booking_id,'lab_collection')
  or (p_terminal and booking_private.closeout_assignee(p_booking_id)));
$$;

-- Provider configuration (S10.1 config phase): no gate. Manager predicate as C01.
create function public.set_lab_test(p_service_id uuid,p_sample_type text,p_container_codes text[],p_fasting_hours integer,
 p_preparation_code text,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s public.services; t public.lab_tests; hash text; prior record; result integer; begin
 if p_service_id is null or p_expected_version is null or p_expected_version<0 or p_request_key is null
 or p_sample_type is null or p_sample_type not in ('venous_blood','capillary_blood','urine','stool','swab')
 or p_container_codes is null or cardinality(p_container_codes) not between 1 and 6 or array_position(p_container_codes,null) is not null
 or not (p_container_codes <@ array['edta','serum','fluoride','citrate','heparin','urine_cup','stool_cup','swab_tube']::text[])
 or not lab_private.codes_unique(p_container_codes)
 or p_fasting_hours is null or p_fasting_hours not between 0 and 16
 or p_preparation_code is null or p_preparation_code not in ('none','fasting','first_morning_sample')
 or (p_fasting_hours>0)<>(p_preparation_code='fasting') then
  raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_service_id,p_sample_type,p_container_codes,p_fasting_hours,p_preparation_code,p_expected_version));
 select * into prior from booking_private.replay(actor,'p5.lab.test',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into s from public.services where id=p_service_id;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 perform catalog_private.lock_manager(s.provider_id);
 select * into prior from booking_private.replay(actor,'p5.lab.test',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into s from public.services where id=p_service_id for share;
 if s.category<>'lab' then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into t from public.lab_tests where service_id=s.id for update;
 if not found then
  if p_expected_version<>0 then raise exception using errcode='40001',message='stale_version'; end if;
  insert into public.lab_tests(service_id,provider_id,sample_type,container_codes,fasting_hours,preparation_code)
  values(s.id,s.provider_id,p_sample_type,p_container_codes,p_fasting_hours,p_preparation_code) returning version into result;
 else
  if t.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
  update public.lab_tests set sample_type=p_sample_type,container_codes=p_container_codes,fasting_hours=p_fasting_hours,
   preparation_code=p_preparation_code,version=version+1,updated_at=clock_timestamp() where service_id=s.id returning version into result;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'lab.test_saved','service',s.id);
 perform booking_private.record_request(actor,'p5.lab.test',p_request_key,hash,s.id,result);
 return result;
end $$;

-- Admission catalog read (S10.1): empty unless the lab gate is on. Callable by anon.
create function public.get_lab_test_public(p_service_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sample_type',t.sample_type,'fasting_hours',t.fasting_hours,'preparation_code',t.preparation_code)
 from public.lab_tests t join public.services s on s.id=t.service_id
 where t.service_id=p_service_id and s.category='lab' and s.status='published'
 and booking_private.gate_state('lab')='on' and identity_private.provider_publicly_bookable(s.provider_id);
$$;

-- Advisory slots: one verified, free, not-busy person for the whole buffered period.
create function public.list_lab_slots(p_service_id uuid,p_date date) returns table(start_at timestamptz,end_at timestamptz,advisory boolean)
language plpgsql volatile security definer set search_path='' as $$
declare s public.services; pol public.lab_policy_versions; today date:=(clock_timestamp() at time zone 'Asia/Kolkata')::date; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 if p_service_id is null or p_date is null or not isfinite(p_date) then raise exception using errcode='22023',message='invalid_input'; end if;
 if booking_private.gate_state('lab')<>'on' then return; end if;
 select * into pol from public.lab_policy_versions where status='published' order by version desc limit 1;
 if not found then return; end if;
 if p_date<today or p_date>today+pol.horizon_days then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into s from public.services where id=p_service_id and category='lab' and status='published';
 if not found or not identity_private.provider_publicly_bookable(s.provider_id)
 or (select p.published_profile->>'home_collection' from public.providers p where p.id=s.provider_id) is distinct from 'true'
 or not exists(select 1 from public.lab_tests t where t.service_id=s.id) then return; end if;
 return query with candidates as (
  select g as begins,g+make_interval(mins=>s.duration_minutes) as ends
  from generate_series(p_date::timestamp at time zone 'Asia/Kolkata',(p_date+1)::timestamp at time zone 'Asia/Kolkata',interval '15 minutes') g
  where g>clock_timestamp()+make_interval(mins=>pol.lead_minutes) and g<=clock_timestamp()+make_interval(days=>pol.horizon_days)
  and g+make_interval(mins=>s.duration_minutes)<=(p_date+1)::timestamp at time zone 'Asia/Kolkata'
 ), people as (
  select r.id from public.resources r where r.kind='person' and booking_private.resource_eligible(s.provider_id,r.id)
  and not booking_private.resource_busy(r.id)
 ) select c.begins,c.ends,true from candidates c
 where exists(select 1 from people x where
  booking_private.in_schedule(s.provider_id,x.id,tstzrange(c.begins-make_interval(mins=>pol.before_buffer_minutes),c.ends+make_interval(mins=>pol.after_buffer_minutes),'[)'))
  and not exists(select 1 from public.resource_reservations rr where rr.resource_id=x.id and rr.status='active'
   and rr.occupied_period && tstzrange(c.begins-make_interval(mins=>pol.before_buffer_minutes),c.ends+make_interval(mins=>pol.after_buffer_minutes),'[)')))
 order by c.begins limit 96;
end $$;

-- S7.3 lab create through the shared core. Replay precedes the gate and caps (M1 rule).
create function public.create_lab_booking_request(p_patient_id uuid,p_service_id uuid,p_address_id uuid,p_start_at timestamptz,
 p_preparation_acknowledged boolean,p_request_key uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); hash text; prior record; s public.services; t public.lab_tests;
 pol public.lab_policy_versions; b public.bookings; result uuid; needs boolean; begin
 if p_patient_id is null or p_service_id is null or p_address_id is null or p_request_key is null
 or p_start_at is null or not isfinite(p_start_at) then raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_patient_id,p_service_id,p_address_id,p_start_at,p_preparation_acknowledged));
 select * into prior from booking_private.replay(actor,'lab.create',p_request_key,hash);
 if prior.result_id is not null then return prior.result_id; end if;
 if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('lab','admission');
 -- The patient-row lock serialises this patient's creates (MR-08 below, the core's cap).
 perform 1 from public.patients where id=p_patient_id for update;
 select * into prior from booking_private.replay(actor,'lab.create',p_request_key,hash);
 if prior.result_id is not null then return prior.result_id; end if;
 select * into s from public.services where id=p_service_id;
 if not found or s.category<>'lab' then raise exception using errcode='42501',message='forbidden'; end if;
 -- LAB-Q07: the patient's self profile has no relationship of any status to the lab.
 if exists(select 1 from public.providers p join public.patients pt on pt.id=p_patient_id where p.id=s.provider_id
  and (p.individual_owner_profile_id=pt.self_profile_id or exists(select 1 from public.organization_members m
   where m.organization_id=p.organization_id and m.profile_id=pt.self_profile_id))) then
  raise exception using errcode='42501',message='forbidden'; end if;
 -- LAB-Q11: home collection is part of the approved, frozen public snapshot.
 if (select p.published_profile->>'home_collection' from public.providers p where p.id=s.provider_id) is distinct from 'true'
 or not exists(select 1 from public.lab_tests x where x.service_id=s.id) then
  raise exception using errcode='42501',message='forbidden'; end if;
 select * into pol from public.lab_policy_versions where status='published' order by version desc limit 1;
 if not found then raise exception using errcode='55000',message='lab_policy_required'; end if;
 select * into t from public.lab_tests where service_id=s.id;
 needs:=t.preparation_code<>'none' or t.fasting_hours>0;
 if needs and p_preparation_acknowledged is not true then raise exception using errcode='22023',message='preparation_ack_required'; end if;
 -- MR-08: one open request per overlapping lab window; past-start requests are ignored (SP-5).
 if exists(select 1 from public.bookings x where x.patient_id=p_patient_id and x.category='lab' and x.state='requested'
  and x.end_at>clock_timestamp()
  and tstzrange(x.start_at,x.end_at,'[)') && tstzrange(p_start_at,p_start_at+make_interval(mins=>s.duration_minutes),'[)')) then
  raise exception using errcode='55000',message='overlapping_lab_request'; end if;
 result:=booking_private.create_request_core(p_patient_id,p_service_id,p_address_id,p_start_at,p_request_key,'lab.create',hash,
  make_interval(mins=>pol.lead_minutes),make_interval(days=>pol.horizon_days));
 if exists(select 1 from public.lab_orders where booking_id=result) then return result; end if;
 -- The core holds the provider lock now, so the test definition is stable from here on.
 select * into t from public.lab_tests where service_id=p_service_id;
 needs:=t.preparation_code<>'none' or t.fasting_hours>0;
 if needs and p_preparation_acknowledged is not true then raise exception using errcode='22023',message='preparation_ack_required'; end if;
 select * into b from public.bookings where id=result;
 insert into public.lab_orders(booking_id,policy_version_id,before_buffer_minutes,after_buffer_minutes,preparation_ack_at)
 values(b.id,pol.id,pol.before_buffer_minutes,pol.after_buffer_minutes,case when needs then clock_timestamp() end);
 insert into public.lab_order_items(booking_id,service_id,price_version_id,title_snapshot,unit_paise,line_paise,
  sample_type,container_codes,fasting_hours,preparation_code)
 select b.id,b.service_id,b.price_version_id,x.title,b.amount_paise,b.amount_paise,t.sample_type,t.container_codes,t.fasting_hours,t.preparation_code
 from public.services x where x.id=b.service_id;
 -- A gate change that committed while this command waited on a lock is seen (S10.2).
 perform booking_private.require_gate('lab','admission');
 return result;
end $$;

-- Lab acceptance with one verified technician. Reservation inserts pass the shared
-- reservation guard (resource_busy, 55000) and the global exclusion (23P01).
create function public.accept_lab_booking(p_booking_id uuid,p_expected_version integer,p_resource_id uuid,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); hash text; prior record; b public.bookings; o public.lab_orders;
 r public.resources; assignment uuid; occupied tstzrange; result integer; event uuid; begin
 if p_booking_id is null or p_expected_version is null or p_resource_id is null or p_request_key is null then
  raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version,p_resource_id));
 select * into prior from booking_private.replay(actor,'p5.lab.accept',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or not booking_private.scheduler(b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if b.category<>'lab' then raise exception using errcode='55000',message='use_category_command'; end if;
 perform booking_private.require_gate('lab','admission');
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 select * into o from public.lab_orders where booking_id=b.id for update;
 select * into prior from booking_private.replay(actor,'p5.lab.accept',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not booking_private.scheduler(b.provider_id) or not public.provider_is_publishable(b.provider_id) then
  raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('lab','admission');
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if o.booking_id is null then raise exception using errcode='55000',message='use_category_command'; end if;
 if b.state<>'requested' or o.substate<>'pending' or b.start_at<=clock_timestamp() then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if not booking_private.patient_for_requester(b.patient_id,b.requester_profile_id) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if not exists(select 1 from public.services s where s.id=b.service_id and s.status='published')
 or not identity_private.provider_publicly_bookable(b.provider_id)
 or not exists(select 1 from public.provider_service_areas where provider_id=b.provider_id and pin_code=b.address_snapshot->>'pin_code'
  and status='approved' and valid_from<=clock_timestamp() and valid_to>clock_timestamp())
 or not exists(select 1 from public.service_price_versions v where v.id=b.price_version_id and v.service_id=b.service_id
  and v.effective_from<=clock_timestamp() and (v.effective_to is null or v.effective_to>clock_timestamp()) and v.amount_paise=b.amount_paise) then
  raise exception using errcode='40001',message='offer_changed'; end if;
 -- Q06: resource_eligible verifies the person for every category (S8.2). No self-assignment.
 select * into r from public.resources where id=p_resource_id;
 if not found or r.kind<>'person' or not booking_private.resource_eligible(b.provider_id,r.id)
 or r.person_profile_id=(select pt.self_profile_id from public.patients pt where pt.id=b.patient_id) then
  raise exception using errcode='42501',message='forbidden'; end if;
 occupied:=tstzrange(b.start_at-make_interval(mins=>o.before_buffer_minutes),b.end_at+make_interval(mins=>o.after_buffer_minutes),'[)');
 if not booking_private.in_schedule(b.provider_id,r.id,occupied) then raise exception using errcode='40001',message='schedule_changed'; end if;
 insert into public.booking_assignments(booking_id,resource_id,purpose,assigned_profile_id,period)
 values(b.id,r.id,'lab_collection',r.person_profile_id,tstzrange(b.start_at,b.end_at,'[)')) returning id into assignment;
 insert into public.resource_reservations(assignment_id,resource_id,occupied_period) values(assignment,r.id,occupied);
 perform booking_private.transition(b.id,'accepted','accepted',p_request_key);
 result:=booking_private.transition(b.id,'confirmed','confirmed',p_request_key);
 update public.lab_orders set substate='scheduled',assignment_id=assignment,version=version+1 where booking_id=b.id;
 select id into event from public.booking_events where booking_id=b.id and aggregate_version=result;
 perform booking_private.record_request(actor,'p5.lab.accept',p_request_key,hash,event,result);
 return result;
end $$;

-- Technician milestones (design S6, contract S5.2 and S12.1). Terminal steps go through
-- the shared assignee_finish, which opens closed_while_ineligible when the live predicate
-- fails and releases through category_paths (lab: release).
create function public.advance_lab_order(p_booking_id uuid,p_step text,p_expected_version integer,p_failure_code text,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); hash text; prior record; b public.bookings; o public.lab_orders;
 terminal boolean; result integer; event uuid; begin
 if p_booking_id is null or p_expected_version is null or p_request_key is null or p_step is null
 or p_step not in ('start_collection','report_absence','collected','handed_over','collection_failed','handoff_failed')
 or (p_step='collection_failed' and (p_failure_code is null
  or p_failure_code not in ('patient_declined','preparation_not_followed','sample_not_obtained','technician_unable')))
 or (p_step='handoff_failed' and (p_failure_code is null
  or p_failure_code not in ('sample_damaged','sample_lost','technician_unable','lab_not_receiving')))
 or (p_step not in ('collection_failed','handoff_failed') and p_failure_code is not null) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 terminal:=p_step in ('handed_over','collection_failed','handoff_failed');
 hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_step,p_expected_version,p_failure_code));
 select * into prior from booking_private.replay(actor,'p5.lab.advance',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not lab_private.may_advance(p_booking_id,terminal) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_step='start_collection' then perform booking_private.require_gate('lab','start'); end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into o from public.lab_orders where booking_id=b.id for update;
 select * into prior from booking_private.replay(actor,'p5.lab.advance',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not lab_private.may_advance(b.id,terminal) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_step='start_collection' then perform booking_private.require_gate('lab','start'); end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if o.booking_id is null then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_step='start_collection' then
  if b.state<>'confirmed' or o.substate<>'scheduled' then raise exception using errcode='55000',message='invalid_transition'; end if;
  -- E10/E11: from start_at - before buffer, until end_at + after buffer (LAB-Q14).
  if clock_timestamp()<b.start_at-make_interval(mins=>o.before_buffer_minutes)
  or clock_timestamp()>=b.end_at+make_interval(mins=>o.after_buffer_minutes) then
   raise exception using errcode='55000',message='outside_window'; end if;
  result:=booking_private.transition(b.id,'in_progress','collection_started',p_request_key);
  update public.lab_orders set substate='collecting',version=version+1 where booking_id=b.id;
 elsif p_step='report_absence' then
  if b.state<>'confirmed' or o.substate<>'scheduled' then raise exception using errcode='55000',message='invalid_transition'; end if;
  if clock_timestamp()<b.start_at or clock_timestamp()>=b.end_at+make_interval(mins=>o.after_buffer_minutes) then
   raise exception using errcode='55000',message='outside_window'; end if;
  -- The booking stays confirmed; the shared exception is what ops resolves (OD-1).
  result:=booking_private.transition(b.id,'confirmed','absence_reported',p_request_key);
  perform booking_private.open_exception(b.id,'absence_reported','absence_reported');
  perform booking_private.finish_assignments(b.id);
  update public.lab_orders set substate='absence_reported',version=version+1 where booking_id=b.id;
 elsif p_step='collected' then
  if b.state<>'in_progress' or o.substate<>'collecting' then raise exception using errcode='55000',message='invalid_transition'; end if;
  result:=booking_private.transition(b.id,'in_progress','sample_collected',p_request_key);
  update public.lab_orders set substate='collected',version=version+1 where booking_id=b.id;
 else
  if b.state<>'in_progress' or o.substate<>(case when p_step='collection_failed' then 'collecting' else 'collected' end) then
   raise exception using errcode='55000',message='invalid_transition'; end if;
  result:=booking_private.assignee_finish(b.id,case when p_step='handed_over' then 'completed' else 'interrupted' end,
   case when p_step='handed_over' then 'sample_handed_over' else p_step end,p_request_key);
  update public.lab_orders set substate=p_step,failure_code=p_failure_code,version=version+1 where booking_id=b.id;
 end if;
 select id into event from public.booking_events where booking_id=b.id and aggregate_version=result;
 perform booking_private.record_request(actor,'p5.lab.advance',p_request_key,hash,event,result);
 return result;
end $$;

-- Provider first-line follow-up (contract S6.1: lab-owned). Changes no booking state.
-- The same code again returns the same result; another code is a conflict.
create function public.lab_close_followup(p_booking_id uuid,p_code text,p_request_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); hash text; prior record; b public.bookings; o public.lab_orders; begin
 if p_booking_id is null or p_request_key is null or p_code is null
 or p_code not in ('patient_contacted','new_booking_offered','escalated_to_platform') then
  raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_code));
 select * into prior from booking_private.replay(actor,'p5.lab.followup',p_request_key,hash);
 if prior.result_version is not null then
  return (select jsonb_build_object('closed_at',x.followup_closed_at) from public.lab_orders x where x.booking_id=p_booking_id); end if;
 select * into b from public.bookings where id=p_booking_id and category='lab';
 if not found or not booking_private.scheduler(b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 select * into o from public.lab_orders where booking_id=b.id for update;
 select * into prior from booking_private.replay(actor,'p5.lab.followup',p_request_key,hash);
 if prior.result_version is not null then return jsonb_build_object('closed_at',o.followup_closed_at); end if;
 if not booking_private.scheduler(b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if o.booking_id is null or o.substate not in ('absence_reported','collection_failed','handoff_failed') then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if o.followup_closed_at is not null then
  if o.followup_code<>p_code then raise exception using errcode='55000',message='followup_closed'; end if;
 else
  update public.lab_orders set followup_closed_at=clock_timestamp(),followup_closed_by=actor,followup_code=p_code,version=version+1
  where booking_id=b.id returning * into o;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'lab.followup_closed','booking',b.id);
 end if;
 perform booking_private.record_request(actor,'p5.lab.followup',p_request_key,hash,b.id,o.version);
 return jsonb_build_object('closed_at',o.followup_closed_at);
end $$;

-- Role-shaped projection (design S8.2, contract S8.3 rule). Viewer order: patient,
-- scheduler, live or closeout assignee; anyone else P0002. No address, contact,
-- patient_id or provider UUID for any viewer; no title or amount for the technician.
create function public.get_lab_order(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; o public.lab_orders; i public.lab_order_items; base jsonb; tech text; resource uuid; followup text; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id and category='lab';
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 select * into o from public.lab_orders where booking_id=b.id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 select * into i from public.lab_order_items where booking_id=b.id;
 select a.resource_id,nullif(x.display_name,'') into resource,tech from public.booking_assignments a
  join public.profiles x on x.id=a.assigned_profile_id where a.id=o.assignment_id;
 followup:=case when o.substate in ('absence_reported','collection_failed','handoff_failed') then
  case when o.followup_closed_at is null then 'open' else 'closed' end end;
 base:=jsonb_build_object('booking_id',b.id,'public_ref',b.public_ref,
  'provider_reference',(select p.public_reference from public.providers p where p.id=b.provider_id),
  'state',b.state,'substate',o.substate,'start_at',b.start_at,'end_at',b.end_at,
  'preparation_code',i.preparation_code,'fasting_hours',i.fasting_hours);
 if booking_private.patient(b.patient_id,'booking:read') then
  return base||jsonb_build_object('title',i.title_snapshot,'line_paise',i.line_paise::text,'technician_name',tech,'followup_status',followup,
   'timeline',coalesce((select jsonb_agg(jsonb_build_object('reason',ev.reason,'occurred_at',ev.occurred_at) order by ev.aggregate_version)
    from public.booking_events ev where ev.booking_id=b.id),'[]'::jsonb));
 elsif booking_private.scheduler(b.provider_id) then
  return base||jsonb_build_object('title',i.title_snapshot,'sample_type',i.sample_type,'container_codes',to_jsonb(i.container_codes),
   'resource_id',resource,'technician_name',tech,'failure_code',o.failure_code,'followup_status',followup,'followup_code',o.followup_code);
 elsif identity_private.is_assigned(b.id,'lab_collection') or booking_private.closeout_assignee(b.id) then
  return base||jsonb_build_object('sample_type',i.sample_type,'container_codes',to_jsonb(i.container_codes),'quantity',i.quantity);
 end if;
 raise exception using errcode='P0002',message='not_found';
end $$;

-- Scheduler follow-up queue (design S7.1). Ids, codes and times only; no patient data.
create function public.list_lab_followups(p_provider_id uuid,p_limit integer default 20,p_after uuid default null) returns setof jsonb
language plpgsql volatile security definer set search_path='' as $$
declare suspended boolean; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 if p_provider_id is null or p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid_input'; end if;
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 suspended:=booking_private.gate_state('lab')='suspended';
 return query select jsonb_build_object('booking_id',q.id,'public_ref',q.public_ref,'kind',q.kind,'substate',q.substate,'opened_at',q.opened_at)
 from (select b.id,b.public_ref,o.substate,
   case when o.substate in ('absence_reported','collection_failed','handoff_failed') then o.substate
    when o.substate in ('collecting','collected') then 'custody_overdue' else 'gate_suspended' end as kind,
   case when o.substate in ('absence_reported','collection_failed','handoff_failed') then
     (select max(ev.occurred_at) from public.booking_events ev where ev.booking_id=b.id and ev.reason=o.substate)
    when o.substate in ('collecting','collected') then b.end_at+make_interval(mins=>o.after_buffer_minutes)
    else (select g.changed_at from booking_private.feature_gates g where g.key='lab') end as opened_at
  from public.bookings b join public.lab_orders o on o.booking_id=b.id
  where b.provider_id=p_provider_id and (p_after is null or b.id>p_after)
  and ((o.substate in ('absence_reported','collection_failed','handoff_failed') and o.followup_closed_at is null)
   or (o.substate in ('collecting','collected') and booking_private.booking_overdue(b.id))
   or (suspended and o.substate='scheduled' and b.state='confirmed'))
  order by b.id limit p_limit) q
 order by q.id;
end $$;

revoke all on function lab_private.may_advance(uuid,boolean) from public,anon,authenticated,service_role;
do $$ declare f text; begin
 foreach f in array array['public.set_lab_test(uuid,text,text[],integer,text,integer,uuid)','public.get_lab_test_public(uuid)',
  'public.list_lab_slots(uuid,date)','public.create_lab_booking_request(uuid,uuid,uuid,timestamptz,boolean,uuid)',
  'public.accept_lab_booking(uuid,integer,uuid,uuid)','public.advance_lab_order(uuid,text,integer,text,uuid)',
  'public.lab_close_followup(uuid,text,uuid)','public.get_lab_order(uuid)','public.list_lab_followups(uuid,integer,uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
grant execute on function public.get_lab_test_public(uuid) to anon;
notify pgrst, 'reload schema';
commit;
