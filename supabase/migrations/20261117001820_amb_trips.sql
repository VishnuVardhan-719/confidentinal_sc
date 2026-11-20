-- P5 ambulance 3/3 / Kiro / feat/P5-ambulance / base integ/all 51c7439.
-- Design §5.1, §5.6, §6, §7.2-§7.4 under contract v1.0 §15 (Ambulance): admission through
-- create_request_core, own accept and slots, trip progress through the shared transition,
-- closeout, exception and replay helpers. Ops escalation, exceptions, busy guard and contact
-- are shared (contract §6, §8.4, §11) and are not redefined here. trip_exceptions and the
-- ambulance ops RPCs of the design are not created (contract §6.1, §15).
-- Synthetic local/staging only. Gate 'ambulance' stays as seeded (off). Authored, DB NOT EXECUTED.
-- Lock order (contract §11.4): booking, organisation then provider, resources by id,
-- transport_trips row, booking_exceptions rows.
begin;

do $$ begin
 if to_regprocedure('booking_private.require_gate(text,text)') is null
 or to_regprocedure('booking_private.gate_state(text)') is null
 or to_regprocedure('booking_private.request_hash(jsonb)') is null
 or to_regprocedure('booking_private.replay(uuid,text,uuid,text)') is null
 or to_regprocedure('booking_private.record_request(uuid,text,uuid,text,uuid,integer)') is null
 or to_regprocedure('booking_private.transition(uuid,text,text,uuid)') is null
 or to_regprocedure('booking_private.closeout_assignee(uuid)') is null
 or to_regprocedure('booking_private.assignee_finish(uuid,text,text,uuid)') is null
 or to_regprocedure('booking_private.finish_assignments(uuid)') is null
 or to_regprocedure('booking_private.open_exception(uuid,text,text)') is null
 or to_regprocedure('booking_private.resource_busy(uuid,uuid)') is null
 or to_regprocedure('booking_private.contact_allowed(uuid)') is null
 or to_regprocedure('booking_private.create_request_core(uuid,uuid,uuid,timestamptz,uuid,text,text,interval,interval)') is null
 or to_regprocedure('booking_private.patient(uuid,text)') is null
 or to_regprocedure('booking_private.patient_for_requester(uuid,uuid)') is null
 or to_regprocedure('booking_private.in_schedule(uuid,uuid,tstzrange)') is null
 or to_regprocedure('identity_private.is_assigned(uuid,text)') is null
 or to_regprocedure('identity_private.provider_publicly_bookable(uuid)') is null
 or to_regprocedure('ambulance_private.driver_eligible(uuid,uuid,timestamptz)') is null
 or to_regprocedure('ambulance_private.vehicle_eligible(uuid,uuid,text,timestamptz)') is null
 or to_regclass('booking_private.category_reasons') is null or to_regclass('booking_private.reason_codes') is null
 or to_regclass('public.booking_exceptions') is null
 or not exists(select 1 from booking_private.exception_kinds where code='interrupted_after_pickup' and blocks_resources)
 or not exists(select 1 from booking_private.exception_kinds where code='absence_reported')
 or not exists(select 1 from booking_private.exception_kinds where code='eligibility_lapsed')
 or not exists(select 1 from booking_private.category_paths where category='ambulance' and not generic_create and not generic_accept
  and assignee_close='end_assignments')
 or booking_private.person_purpose('ambulance') is distinct from 'driver' then
  raise exception 'P5 ambulance 001820: shared engine prerequisites (20261117001550-001590) or 001800 missing';
 end if;
end $$;

-- Contract §9.4 ambulance-owned codes. Shared codes (en_route, arrived, absence_reported,
-- unsafe_conditions, ended_for_emergency, ops codes) are already seeded by 001550.
insert into booking_private.reason_codes(code) values
 ('picked_up'),('destination_reached'),('eligibility_blocked'),('vehicle_breakdown'),('requirement_mismatch'),('driver_unable')
 on conflict do nothing;
insert into booking_private.category_reasons(category,code,blocks_cancel) values
 ('ambulance','picked_up',true),('ambulance','destination_reached',false),('ambulance','eligibility_blocked',false),
 ('ambulance','vehicle_breakdown',false),('ambulance','requirement_mismatch',false),('ambulance','driver_unable',false)
 on conflict do nothing;

-- §5.6 synthetic-staging policy values (AMB-Q01 to Q03). Changing one is a reviewed migration.
create function ambulance_private.policy(out create_lead interval,out accept_lead interval,out horizon interval,
 out before_buffer interval,out after_buffer interval,out max_duration integer)
language sql immutable set search_path='' as $$
 select interval '120 minutes',interval '60 minutes',interval '30 days',interval '30 minutes',interval '30 minutes',360;
$$;
create function ambulance_private.driver_reasons() returns text[] language sql immutable set search_path='' as $$
 select array['vehicle_breakdown','unsafe_conditions','requirement_mismatch','ended_for_emergency','driver_unable']::text[];
$$;

-- §5.1 the trip. Driver and vehicle come from booking_assignments, never from columns here.
-- Substate is the last milestone the driver reported; bookings.state is the lifecycle
-- authority (contract §6.1). Ops never writes it.
create table public.transport_trips (
 booking_id uuid primary key references public.bookings(id),
 destination_snapshot jsonb not null check (jsonb_typeof(destination_snapshot)='object'
  and destination_snapshot ?& array['line1','locality','pin_code'] and (destination_snapshot-array['line1','locality','pin_code'])='{}'::jsonb),
 destination_pin text not null check (destination_pin ~ '^[1-9][0-9]{5}$'),
 requirement_code text not null check (requirement_code in ('seated','wheelchair','stretcher')),
 substate text not null default 'requested' check (substate in ('requested','assigned','en_route','arrived','absence_reported',
  'picked_up','destination_reached','trip_interrupted')),
 version integer not null default 1 check (version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (destination_snapshot->>'pin_code'=destination_pin)
);

-- Substate edge and (substate, booking state) pair, read from the booking at trigger time.
create function ambulance_private.guard_trip() returns trigger language plpgsql security definer set search_path='' as $$
declare v_state text; begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_trip'; end if;
 if TG_OP='INSERT' then
  if new.substate<>'requested' or new.version<>1 or not exists(select 1 from public.bookings b
   where b.id=new.booking_id and b.category='ambulance' and b.state='requested') then
   raise exception using errcode='55000',message='invalid_trip'; end if;
  return new;
 end if;
 if (to_jsonb(new)-array['substate','version','updated_at']) is distinct from (to_jsonb(old)-array['substate','version','updated_at'])
 or new.version<>old.version+1 then raise exception using errcode='55000',message='immutable_trip'; end if;
 select b.state into v_state from public.bookings b where b.id=new.booking_id;
 if not ((old.substate,new.substate) in (('requested','assigned'),('assigned','en_route'),('en_route','arrived'),
   ('arrived','absence_reported'),('arrived','picked_up'),('picked_up','destination_reached'),
   ('assigned','trip_interrupted'),('en_route','trip_interrupted'),('arrived','trip_interrupted'),('picked_up','trip_interrupted'))
  and (new.substate,v_state) in (('assigned','confirmed'),('en_route','confirmed'),('arrived','confirmed'),('absence_reported','confirmed'),
   ('picked_up','in_progress'),('destination_reached','completed'),('trip_interrupted','interrupted'))) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 return new;
end $$;
create trigger amb_trip_guard before insert or update or delete on public.transport_trips
 for each row execute function ambulance_private.guard_trip();
create trigger amb_trip_no_truncate before truncate on public.transport_trips
 for each statement execute function booking_private.immutable();

-- A resource can take [begins - before, ends + after): inside one availability rule and
-- free of active reservations. Advisory only; the exclusion and guard decide at accept.
create function ambulance_private.slot_free(p_provider_id uuid,p_resource_id uuid,p_begins timestamptz,p_ends timestamptz) returns boolean
language sql volatile security definer set search_path='' as $$
 select booking_private.in_schedule(p_provider_id,p_resource_id,
   tstzrange(p_begins-(ambulance_private.policy()).before_buffer,p_ends+(ambulance_private.policy()).after_buffer,'[)'))
 and not exists(select 1 from public.resource_reservations rr where rr.resource_id=p_resource_id and rr.status='active'
  and rr.occupied_period && tstzrange(p_begins-(ambulance_private.policy()).before_buffer,p_ends+(ambulance_private.policy()).after_buffer,'[)'));
$$;

-- Destination PIN is approved, currently valid coverage of the operator (AMB-Q04 default yes).
create function ambulance_private.covers(p_provider_id uuid,p_pin text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.provider_service_areas a where a.provider_id=p_provider_id and a.pin_code=p_pin and a.status='approved'
  and a.valid_from<=clock_timestamp() and a.valid_to>clock_timestamp());
$$;

-- Projection per viewer (contract §8.3 rule for category projections). Non-patients get
-- PINs only: no address line, locality, contact, patient id, amount or currency, and
-- nobody gets actor ids. The patient sees the plate only while the driver reports
-- en_route, arrived or picked_up on a live booking (AMB-Q08).
create function ambulance_private.trip_view(p_booking_id uuid,p_viewer text) returns jsonb
language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('booking_id',b.id,'public_ref',b.public_ref,'provider_reference',p.public_reference,'service_title',s.title,
  'start_at',b.start_at,'end_at',b.end_at,'state',b.state,'substate',t.substate,'version',b.version,'requirement',t.requirement_code,
  'driver_name',dr.name,'vehicle_type',vh.vehicle_type,
  'vehicle_key',case when p_viewer<>'patient' or (t.substate in ('en_route','arrived','picked_up') and b.state in ('confirmed','in_progress'))
   then vh.vehicle_key end,
  'timeline',coalesce((select jsonb_agg(jsonb_build_object('reason',e.reason,'occurred_at',e.occurred_at) order by e.aggregate_version)
   from public.booking_events e where e.booking_id=b.id),'[]'::jsonb))
 || case when p_viewer='patient' then jsonb_build_object(
   'pickup',jsonb_build_object('line1',b.address_snapshot->>'line1','locality',b.address_snapshot->>'locality','pin_code',b.address_snapshot->>'pin_code'),
   'destination',t.destination_snapshot)
  else jsonb_build_object('pickup_pin',b.address_snapshot->>'pin_code','destination_pin',t.destination_pin) end
 from public.bookings b join public.transport_trips t on t.booking_id=b.id
 join public.providers p on p.id=b.provider_id join public.services s on s.id=b.service_id
 left join lateral (select coalesce(nullif(btrim(x.display_name),''),'Driver') as name from public.booking_assignments a
  join public.profiles x on x.id=a.assigned_profile_id where a.booking_id=b.id and a.purpose='driver'
  order by (a.status='active') desc,a.ended_at desc nulls first,a.id limit 1) dr on true
 left join lateral (select r.vehicle_key,v.vehicle_type from public.booking_assignments a join public.resources r on r.id=a.resource_id
  left join public.ambulance_vehicles v on v.resource_id=r.id where a.booking_id=b.id and a.purpose='vehicle'
  order by (a.status='active') desc,a.ended_at desc nulls first,a.id limit 1) vh on true
 where b.id=p_booking_id;
$$;

-- Replay answer for advance_trip, derived from the event the first call wrote.
create function ambulance_private.advance_result(p_event_id uuid,p_version integer) returns jsonb
language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('version',p_version,
  'substate',case e.reason when 'en_route' then 'en_route' when 'arrived' then 'arrived' when 'absence_reported' then 'absence_reported'
   when 'picked_up' then 'picked_up' when 'destination_reached' then 'destination_reached' when 'eligibility_blocked' then 'assigned'
   else 'trip_interrupted' end,
  'blocked',case when e.reason='eligibility_blocked' then 'eligibility_blocked' end)
 from public.booking_events e where e.id=p_event_id;
$$;

-- §7.2 advisory slots: gate on, ambulance lead time and horizon, one free eligible driver
-- and one free eligible vehicle for the requirement, busy resources excluded (§11.1).
-- Takes the public provider reference (as 001300); the provider UUID never leaves the server.
create function public.list_transport_slots(p_provider_reference text,p_service_id uuid,p_date date,p_requirement text)
returns table(start_at timestamptz,end_at timestamptz,advisory boolean)
language plpgsql volatile security definer set search_path='' as $$
declare v_provider uuid; v_service public.services; v_pol record; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 if p_provider_reference is null or p_provider_reference !~ '^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19}$' or p_service_id is null
 or p_requirement is null or p_requirement not in ('seated','wheelchair','stretcher')
 or p_date is null or not isfinite(p_date) or p_date<(clock_timestamp() at time zone 'Asia/Kolkata')::date
 or p_date>(clock_timestamp() at time zone 'Asia/Kolkata')::date+31 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if booking_private.gate_state('ambulance')<>'on' then return; end if;
 select p.id into v_provider from public.providers p where p.public_reference=p_provider_reference and p.category='ambulance';
 if v_provider is null then return; end if;
 select * into v_pol from ambulance_private.policy();
 select * into v_service from public.services sv where sv.id=p_service_id and sv.provider_id=v_provider and sv.status='published' and sv.category='ambulance';
 if not found or not identity_private.provider_publicly_bookable(v_provider) or v_service.duration_minutes>v_pol.max_duration then return; end if;
 return query with candidates as(
  select c as begins,c+make_interval(mins=>v_service.duration_minutes) as ends from generate_series(p_date::timestamp at time zone 'Asia/Kolkata',
   (p_date+1)::timestamp at time zone 'Asia/Kolkata',interval '15 minutes') c
  where c>clock_timestamp()+v_pol.create_lead and c<=clock_timestamp()+v_pol.horizon
  and c+make_interval(mins=>v_service.duration_minutes)<=(p_date+1)::timestamp at time zone 'Asia/Kolkata'
 ), drivers as(
  select d.resource_id as rid from public.ambulance_drivers d where d.provider_id=v_provider and d.status='active'
  and not booking_private.resource_busy(d.resource_id)
 ), vehicles as(
  select v.resource_id as rid from public.ambulance_vehicles v where v.provider_id=v_provider and v.case_state='approved'
  and p_requirement=any(v.supports) and not booking_private.resource_busy(v.resource_id)
 ), free as(
  select c.begins,c.ends,'person'::text as kind from candidates c join drivers r
   on ambulance_private.driver_eligible(v_provider,r.rid,c.ends) and ambulance_private.slot_free(v_provider,r.rid,c.begins,c.ends)
  union all
  select c.begins,c.ends,'vehicle'::text from candidates c join vehicles r
   on ambulance_private.vehicle_eligible(v_provider,r.rid,p_requirement,c.ends) and ambulance_private.slot_free(v_provider,r.rid,c.begins,c.ends)
 ) select f.begins,f.ends,true from free f group by f.begins,f.ends
 having bool_or(f.kind='person') and bool_or(f.kind='vehicle') order by f.begins limit 96;
end $$;

-- §7.2 request. Replay (transport.create) precedes the gate, caps and locks (contract §13.2);
-- create_request_core does patient authorization, pickup coverage, price, policy, the
-- 10-request cap, the booking insert, the requested event and the replay row.
create function public.request_transport(p_patient_id uuid,p_service_id uuid,p_pickup_address_id uuid,p_destination_address_id uuid,
 p_requirement_code text,p_start_at timestamptz,p_request_key uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_hash text; v_prior record; v_pol record; v_service public.services;
 v_provider public.providers; v_dest public.patient_addresses; v_self uuid; v_ends timestamptz; v_result uuid; begin
 if p_patient_id is null or p_service_id is null or p_pickup_address_id is null or p_destination_address_id is null
 or p_requirement_code is null or p_start_at is null or p_request_key is null or not isfinite(p_start_at)
 or p_requirement_code not in ('seated','wheelchair','stretcher') or p_pickup_address_id=p_destination_address_id then
  raise exception using errcode='22023',message='invalid_input'; end if;
 v_hash:=booking_private.request_hash(jsonb_build_array(p_patient_id,p_service_id,p_pickup_address_id,p_destination_address_id,p_requirement_code,p_start_at));
 select * into v_prior from booking_private.replay(v_actor,'transport.create',p_request_key,v_hash);
 if v_prior.result_id is not null then return v_prior.result_id; end if;
 perform booking_private.require_gate('ambulance','admission');
 if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 -- Patient row first (M1 order, as the core): serialises the overlap rule and the cap.
 perform 1 from public.patients where id=p_patient_id for update;
 if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 select * into v_prior from booking_private.replay(v_actor,'transport.create',p_request_key,v_hash);
 if v_prior.result_id is not null then return v_prior.result_id; end if;
 select * into v_dest from public.patient_addresses where id=p_destination_address_id and patient_id=p_patient_id for share;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 select * into v_pol from ambulance_private.policy();
 select * into v_service from public.services where id=p_service_id;
 if not found or v_service.category<>'ambulance' or v_service.status<>'published' or v_service.duration_minutes>v_pol.max_duration then
  raise exception using errcode='42501',message='forbidden'; end if;
 select * into v_provider from public.providers where id=v_service.provider_id;
 -- S01-Q24 self-dealing: the patient is not the operator's owner or an active member.
 select self_profile_id into v_self from public.patients where id=p_patient_id;
 if v_provider.individual_owner_profile_id is not distinct from v_self or exists(select 1 from public.organization_members m
  where m.organization_id=v_provider.organization_id and m.profile_id=v_self and m.status='active') then
  raise exception using errcode='42501',message='forbidden'; end if;
 v_ends:=p_start_at+make_interval(mins=>v_service.duration_minutes);
 -- MR-08: one live ambulance request per overlapping interval per patient. Past ones are ignored (AMB-Q13).
 if exists(select 1 from public.bookings x where x.patient_id=p_patient_id and x.category='ambulance'
  and x.state in ('requested','accepted','confirmed','in_progress') and x.end_at>clock_timestamp()
  and tstzrange(x.start_at,x.end_at,'[)') && tstzrange(p_start_at,v_ends,'[)')) then
  raise exception using errcode='55000',message='overlapping_request'; end if;
 v_result:=booking_private.create_request_core(p_patient_id,p_service_id,p_pickup_address_id,p_start_at,p_request_key,
  'transport.create',v_hash,v_pol.create_lead,v_pol.horizon);
 -- A concurrent first call with this key committed while we waited: the core replayed.
 if exists(select 1 from public.transport_trips where booking_id=v_result) then return v_result; end if;
 -- The core now holds the provider lock: coverage and the gate are rechecked under it.
 perform booking_private.require_gate('ambulance','admission');
 if not ambulance_private.covers(v_provider.id,v_dest.pin_code) then raise exception using errcode='42501',message='forbidden'; end if;
 if not exists(select 1 from public.ambulance_drivers d where d.provider_id=v_provider.id and d.status='active'
  and ambulance_private.driver_eligible(v_provider.id,d.resource_id,v_ends))
 or not exists(select 1 from public.ambulance_vehicles v where v.provider_id=v_provider.id
  and ambulance_private.vehicle_eligible(v_provider.id,v.resource_id,p_requirement_code,v_ends)) then
  raise exception using errcode='55000',message='requirement_unavailable'; end if;
 insert into public.transport_trips(booking_id,destination_snapshot,destination_pin,requirement_code)
 values(v_result,jsonb_build_object('line1',v_dest.line1,'locality',v_dest.locality,'pin_code',v_dest.pin_code),v_dest.pin_code,p_requirement_code);
 return v_result;
end $$;

-- §7.2 accept with one driver and one vehicle. Keyed (contract §13.2). The reservation
-- guard (001570) raises resource_busy for unresolved work in any category; the GiST
-- exclusion makes one of N overlapping accepts win (23P01).
create function public.accept_transport(p_booking_id uuid,p_expected_version integer,p_driver_resource_id uuid,
 p_vehicle_resource_id uuid,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_hash text; v_prior record; v_pol record; v_b public.bookings;
 v_trip public.transport_trips; v_service public.services; v_res public.resources; v_assignment uuid; v_occupied tstzrange;
 v_result integer; v_event uuid; begin
 if p_booking_id is null or p_expected_version is null or p_driver_resource_id is null or p_vehicle_resource_id is null
 or p_request_key is null or p_driver_resource_id=p_vehicle_resource_id then raise exception using errcode='22023',message='invalid_input'; end if;
 v_hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version,p_driver_resource_id,p_vehicle_resource_id));
 select * into v_prior from booking_private.replay(v_actor,'p5.ambulance.accept',p_request_key,v_hash);
 if v_prior.result_version is not null then return v_prior.result_version; end if;
 select * into v_b from public.bookings where id=p_booking_id;
 if not found or not booking_private.scheduler(v_b.provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if v_b.category<>'ambulance' then raise exception using errcode='P0002',message='not_found'; end if;
 perform booking_private.require_gate('ambulance','admission');
 select * into v_b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(v_b.provider_id);
 select * into v_prior from booking_private.replay(v_actor,'p5.ambulance.accept',p_request_key,v_hash);
 if v_prior.result_version is not null then return v_prior.result_version; end if;
 if not booking_private.scheduler(v_b.provider_id) or not public.provider_is_publishable(v_b.provider_id) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if v_b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 select * into v_pol from ambulance_private.policy();
 if v_b.state<>'requested' then raise exception using errcode='55000',message='invalid_transition'; end if;
 if v_b.start_at<clock_timestamp()+v_pol.accept_lead then raise exception using errcode='55000',message='accept_window_closed'; end if;
 if not booking_private.patient_for_requester(v_b.patient_id,v_b.requester_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into v_trip from public.transport_trips where booking_id=v_b.id;
 if not found then raise exception using errcode='55000',message='invalid_transition'; end if;
 select * into v_service from public.services where id=v_b.service_id for share;
 if v_service.status<>'published' or not identity_private.provider_publicly_bookable(v_b.provider_id)
 or not ambulance_private.covers(v_b.provider_id,v_b.address_snapshot->>'pin_code')
 or not ambulance_private.covers(v_b.provider_id,v_trip.destination_pin)
 or not exists(select 1 from public.service_price_versions pv where pv.id=v_b.price_version_id and pv.service_id=v_b.service_id
  and pv.effective_from<=clock_timestamp() and (pv.effective_to is null or pv.effective_to>clock_timestamp()) and pv.amount_paise=v_b.amount_paise) then
  raise exception using errcode='40001',message='offer_changed'; end if;
 perform 1 from public.resources where id in (p_driver_resource_id,p_vehicle_resource_id) order by id for update;
 if not exists(select 1 from public.resources where id=p_driver_resource_id and kind='person')
 or not exists(select 1 from public.resources where id=p_vehicle_resource_id and kind='vehicle') then
  raise exception using errcode='22023',message='invalid_resources'; end if;
 if not ambulance_private.driver_eligible(v_b.provider_id,p_driver_resource_id,v_b.end_at)
 or not ambulance_private.vehicle_eligible(v_b.provider_id,p_vehicle_resource_id,v_trip.requirement_code,v_b.end_at) then
  raise exception using errcode='55000',message='resource_ineligible'; end if;
 -- The driver is never the patient.
 if exists(select 1 from public.resources r join public.patients pt on pt.id=v_b.patient_id
  where r.id=p_driver_resource_id and r.person_profile_id=pt.self_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if booking_private.resource_busy(p_driver_resource_id,v_b.id) or booking_private.resource_busy(p_vehicle_resource_id,v_b.id) then
  raise exception using errcode='55000',message='resource_busy'; end if;
 -- A gate switched off or suspended while this command waited on a lock is seen here.
 perform booking_private.require_gate('ambulance','admission');
 v_occupied:=tstzrange(v_b.start_at-v_pol.before_buffer,v_b.end_at+v_pol.after_buffer,'[)');
 for v_res in select * from public.resources where id in (p_driver_resource_id,p_vehicle_resource_id) order by id loop
  if not booking_private.in_schedule(v_b.provider_id,v_res.id,v_occupied) then raise exception using errcode='40001',message='schedule_changed'; end if;
  insert into public.booking_assignments(booking_id,resource_id,purpose,assigned_profile_id,period)
  values(v_b.id,v_res.id,case when v_res.kind='vehicle' then 'vehicle' else 'driver' end,v_res.person_profile_id,tstzrange(v_b.start_at,v_b.end_at,'[)'))
  returning id into v_assignment;
  insert into public.resource_reservations(assignment_id,resource_id,occupied_period) values(v_assignment,v_res.id,v_occupied);
 end loop;
 perform booking_private.transition(v_b.id,'accepted','accepted',p_request_key);
 v_result:=booking_private.transition(v_b.id,'confirmed','confirmed',p_request_key);
 update public.transport_trips set substate='assigned',version=version+1,updated_at=clock_timestamp() where booking_id=v_b.id;
 select id into v_event from public.booking_events where booking_id=v_b.id and aggregate_version=v_result;
 perform booking_private.record_request(v_actor,'p5.ambulance.accept',p_request_key,v_hash,v_event,v_result);
 return v_result;
end $$;

-- §7.3 driver milestones. Steps from in_progress (destination_reached, interrupt on board)
-- go through assignee_finish and so also accept closeout (contract §5.2). Gate phases
-- (contract §10.1): en_route, arrived, picked_up are start; the rest are closeout.
-- Replay order per contract §13.1. Returns {version, substate, blocked}.
create function public.advance_trip(p_booking_id uuid,p_step text,p_expected_version integer,p_request_key uuid,p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_hash text; v_prior record; v_b public.bookings; v_trip public.transport_trips;
 v_phase text; v_next text; v_result integer; v_event uuid; v_driver uuid; v_vehicle uuid; v_lower timestamptz; v_ok boolean; begin
 if p_booking_id is null or p_step is null or p_expected_version is null or p_request_key is null
 or p_step not in ('en_route','arrived','absence','picked_up','destination_reached','interrupt') then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if (p_step='interrupt') <> (p_reason is not null) or (p_reason is not null and not (p_reason=any(ambulance_private.driver_reasons()))) then
  raise exception using errcode='22023',message='invalid_reason'; end if;
 v_hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_step,p_expected_version,p_reason));
 select * into v_prior from booking_private.replay(v_actor,'p5.ambulance.advance',p_request_key,v_hash);
 if v_prior.result_version is not null then return ambulance_private.advance_result(v_prior.result_id,v_prior.result_version); end if;
 select * into v_b from public.bookings where id=p_booking_id;
 v_ok:=found and v_b.category='ambulance' and (identity_private.is_assigned(v_b.id,'driver')
  or (p_step in ('destination_reached','interrupt') and booking_private.closeout_assignee(v_b.id)));
 if not coalesce(v_ok,false) then raise exception using errcode='42501',message='forbidden'; end if;
 v_phase:=case when p_step in ('en_route','arrived','picked_up') then 'start' else 'closeout' end;
 perform booking_private.require_gate('ambulance',v_phase);
 select * into v_b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(v_b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=v_b.id and status='active') order by id for update;
 select * into v_trip from public.transport_trips where booking_id=v_b.id for update;
 perform 1 from public.booking_exceptions where booking_id=v_b.id and status='open' order by id for update;
 select * into v_prior from booking_private.replay(v_actor,'p5.ambulance.advance',p_request_key,v_hash);
 if v_prior.result_version is not null then return ambulance_private.advance_result(v_prior.result_id,v_prior.result_version); end if;
 v_ok:=identity_private.is_assigned(v_b.id,'driver') or (p_step in ('destination_reached','interrupt') and booking_private.closeout_assignee(v_b.id));
 if not coalesce(v_ok,false) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('ambulance',v_phase);
 if v_b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if v_trip.booking_id is null or not (
  (p_step='en_route' and v_trip.substate='assigned' and v_b.state='confirmed')
  or (p_step='arrived' and v_trip.substate='en_route' and v_b.state='confirmed')
  or (p_step in ('absence','picked_up') and v_trip.substate='arrived' and v_b.state='confirmed')
  or (p_step='destination_reached' and v_trip.substate='picked_up' and v_b.state='in_progress')
  or (p_step='interrupt' and ((v_trip.substate in ('assigned','en_route','arrived') and v_b.state='confirmed')
   or (v_trip.substate='picked_up' and v_b.state='in_progress')))) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_step='en_route' then
  select a.resource_id,lower(rr.occupied_period) into v_driver,v_lower from public.booking_assignments a
   join public.resource_reservations rr on rr.assignment_id=a.id where a.booking_id=v_b.id and a.purpose='driver' and a.status='active';
  select a.resource_id into v_vehicle from public.booking_assignments a where a.booking_id=v_b.id and a.purpose='vehicle' and a.status='active';
  if v_lower is null or clock_timestamp()<v_lower then raise exception using errcode='55000',message='too_early'; end if;
  -- Papers that lapsed after acceptance: record the block instead of raising, because a
  -- raise would roll back the record of the failure. The operator may still cancel.
  if not (ambulance_private.driver_eligible(v_b.provider_id,v_driver,v_b.end_at)
   and ambulance_private.vehicle_eligible(v_b.provider_id,v_vehicle,v_trip.requirement_code,v_b.end_at)) then
   if exists(select 1 from public.booking_exceptions where booking_id=v_b.id and kind='eligibility_lapsed' and status='open') then
    raise exception using errcode='55000',message='eligibility_blocked'; end if;
   v_result:=booking_private.transition(v_b.id,'confirmed','eligibility_blocked',p_request_key);
   perform booking_private.open_exception(v_b.id,'eligibility_lapsed','eligibility_blocked');
   select id into v_event from public.booking_events where booking_id=v_b.id and aggregate_version=v_result;
   perform booking_private.record_request(v_actor,'p5.ambulance.advance',p_request_key,v_hash,v_event,v_result);
   return jsonb_build_object('version',v_result,'substate',v_trip.substate,'blocked','eligibility_blocked');
  end if;
  v_result:=booking_private.transition(v_b.id,'confirmed','en_route',p_request_key); v_next:='en_route';
 elsif p_step='arrived' then
  v_result:=booking_private.transition(v_b.id,'confirmed','arrived',p_request_key); v_next:='arrived';
 elsif p_step='absence' then
  -- Support decides no_show (OD-1); the driver's assignment ends now (contract §8.4, §12.1).
  v_result:=booking_private.transition(v_b.id,'confirmed','absence_reported',p_request_key); v_next:='absence_reported';
  perform booking_private.open_exception(v_b.id,'absence_reported','absence_reported');
  perform booking_private.finish_assignments(v_b.id);
 elsif p_step='picked_up' then
  v_result:=booking_private.transition(v_b.id,'in_progress','picked_up',p_request_key); v_next:='picked_up';
 elsif p_step='destination_reached' then
  v_result:=booking_private.assignee_finish(v_b.id,'completed','destination_reached',p_request_key); v_next:='destination_reached';
 elsif v_b.state='in_progress' then
  -- Interruption on board (S01-Q25): blocks driver and vehicle until ops resolves it.
  -- The resource rows are already locked above (contract §6.3, §11.4).
  v_result:=booking_private.assignee_finish(v_b.id,'interrupted',p_reason,p_request_key); v_next:='trip_interrupted';
  perform booking_private.open_exception(v_b.id,'interrupted_after_pickup',p_reason);
 else
  v_result:=booking_private.transition(v_b.id,'interrupted',p_reason,p_request_key); v_next:='trip_interrupted';
  perform booking_private.finish_assignments(v_b.id);
 end if;
 update public.transport_trips set substate=v_next,version=version+1,updated_at=clock_timestamp() where booking_id=v_b.id;
 select id into v_event from public.booking_events where booking_id=v_b.id and aggregate_version=v_result;
 perform booking_private.record_request(v_actor,'p5.ambulance.advance',p_request_key,v_hash,v_event,v_result);
 return jsonb_build_object('version',v_result,'substate',v_next,'blocked',null);
end $$;

-- §7.4 reads. Viewer order patient, scheduler, driver (live or closeout); else P0002.
create function public.get_trip(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_b public.bookings; v_viewer text; begin
 select * into v_b from public.bookings where id=p_booking_id and category='ambulance';
 if not found or not exists(select 1 from public.transport_trips where booking_id=v_b.id) then
  raise exception using errcode='P0002',message='not_found'; end if;
 v_viewer:=case when booking_private.patient(v_b.patient_id,'booking:read') then 'patient'
  when booking_private.scheduler(v_b.provider_id) then 'scheduler'
  when identity_private.is_assigned(v_b.id,'driver') or booking_private.closeout_assignee(v_b.id) then 'driver' end;
 if v_viewer is null then raise exception using errcode='P0002',message='not_found'; end if;
 return ambulance_private.trip_view(v_b.id,v_viewer);
end $$;

-- Contract §8.4: the destination is not in the booking snapshot, so it has its own read,
-- gated by the shared contact_allowed and audited with the same actions as
-- get_assignment_contact (which serves the pickup address and contact). Volatile: POST.
create function public.get_trip_destination(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); v_b public.bookings; v_trip public.transport_trips; v_viewer text; begin
 v_viewer:=booking_private.contact_allowed(p_booking_id);
 select * into v_b from public.bookings where id=p_booking_id;
 if v_viewer is null or not found or v_b.category<>'ambulance' then raise exception using errcode='P0002',message='not_found'; end if;
 select * into v_trip from public.transport_trips where booking_id=v_b.id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id)
 values(v_actor,case v_viewer when 'ops' then 'booking.contact_viewed_ops' else 'booking.contact_viewed' end,'booking',v_b.id);
 return jsonb_build_object('booking_id',v_b.id,'public_ref',v_b.public_ref,'destination',v_trip.destination_snapshot,
  'requirement',v_trip.requirement_code);
end $$;

-- Scheduler queue: PIN-level projection, keyset on booking id, no audit (no contact).
create function public.list_trip_queue(p_provider_id uuid,p_limit integer default 20,p_after uuid default null) returns setof jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid_input'; end if;
 if p_provider_id is null or not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 return query select ambulance_private.trip_view(b.id,'scheduler') from public.bookings b join public.transport_trips t on t.booking_id=b.id
  where b.provider_id=p_provider_id and b.category='ambulance' and (p_after is null or b.id>p_after) order by b.id limit p_limit;
end $$;

-- The caller's own trips, gated by is_assigned or closeout_assignee, never by an
-- assignment row alone (contract §8.3, R P5-13).
create function public.list_driver_trips(p_limit integer default 20,p_after uuid default null) returns setof jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=identity_private.require_actor(); begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid_input'; end if;
 return query select ambulance_private.trip_view(b.id,'driver') from public.bookings b join public.transport_trips t on t.booking_id=b.id
  where b.category='ambulance' and (p_after is null or b.id>p_after)
  and exists(select 1 from public.booking_assignments a where a.booking_id=b.id and a.purpose='driver' and a.assigned_profile_id=v_actor)
  and (identity_private.is_assigned(b.id,'driver') or booking_private.closeout_assignee(b.id))
  order by b.id limit p_limit;
end $$;

alter table public.transport_trips enable row level security;
revoke all on table public.transport_trips from public,anon,authenticated,service_role;
revoke all on function ambulance_private.policy(),ambulance_private.driver_reasons(),ambulance_private.guard_trip(),
 ambulance_private.slot_free(uuid,uuid,timestamptz,timestamptz),ambulance_private.covers(uuid,text),
 ambulance_private.trip_view(uuid,text),ambulance_private.advance_result(uuid,integer)
 from public,anon,authenticated,service_role;
do $$ declare f text; begin
 foreach f in array array['public.list_transport_slots(text,uuid,date,text)',
  'public.request_transport(uuid,uuid,uuid,uuid,text,timestamptz,uuid)','public.accept_transport(uuid,integer,uuid,uuid,uuid)',
  'public.advance_trip(uuid,text,integer,uuid,text)','public.get_trip(uuid)','public.get_trip_destination(uuid)',
  'public.list_trip_queue(uuid,integer,uuid)','public.list_driver_trips(integer,uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
