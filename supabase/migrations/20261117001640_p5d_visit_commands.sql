-- P5 doctor block: visit commands / Kiro / feat/S01-doctor-core / base integ/all f549ad3.
-- Design §4.2, §7.1-§7.3 as changed by the shared contract (§5.2, §10, §12, §13, §15), with
-- the DC02 step from 001630:
--   scheduled -> en_route -> arrived -> arrival_verified -> service_started -> service_completed
--   arrived -> absence_reported; en_route|arrived|arrival_verified -> interrupted (pre-start codes);
--   service_started -> interrupted (in-visit codes).
-- Every command (contract §13.1 order): require_actor; input shape (22023); request hash;
-- keyed replay before live authorization; DC01 predicate; gate; locks booking -> provider ->
-- active assignment resources -> doctor_visits; replay again; recheck predicate and gate;
-- version; substate; mutation; record_request in the same transaction.
-- Terminal assignee steps go through booking_private.assignee_finish, which opens the shared
-- closed_while_ineligible exception and ends assignments per category_paths (doctor:
-- end_assignments, reservations kept through the buffer). Absence opens the shared
-- absence_reported exception and ends assignments; every interruption opens an `interrupted`
-- exception for ops review. Ops resolution is the shared ops_close_booking/ops_resolve_exception.
-- advance_visit gains p_request_key (contract §13.2); the three-argument version is dropped.
-- Also here: the doctor read views list_my_doctor_visits and get_doctor_visit (end of file).
begin;

drop function public.advance_visit(uuid,text,integer);

create function public.advance_visit(p_booking_id uuid,p_substate text,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior integer; b public.bookings; visit public.doctor_visits;
 result integer; event uuid; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646
 or p_substate is null or p_substate not in ('en_route','arrived','service_started','service_completed') then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_substate,p_expected_version));
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.advance',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not (doctor_private.assignee(p_booking_id) or (p_substate='service_completed' and doctor_private.closeout(p_booking_id))) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if p_substate<>'service_completed' then perform booking_private.require_gate('doctor','start'); end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into visit from public.doctor_visits where booking_id=b.id for update;
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.advance',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not (doctor_private.assignee(b.id) or (p_substate='service_completed' and doctor_private.closeout(b.id))) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if p_substate<>'service_completed' then perform booking_private.require_gate('doctor','start'); end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if p_substate<>'service_completed' and clock_timestamp()<b.start_at-interval '60 minutes' then
  raise exception using errcode='55000',message='visit_too_early'; end if;
 if visit.booking_id is null or not ((visit.substate='scheduled' and p_substate='en_route') or (visit.substate='en_route' and p_substate='arrived')
 or (visit.substate='arrival_verified' and p_substate='service_started') or (visit.substate='service_started' and p_substate='service_completed'))
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 -- Operational reports only: no clinical acceptance, prescription or consent is inferred.
 if p_substate='service_completed' then
  perform doctor_private.end_arrival(b.id);
  result:=booking_private.assignee_finish(b.id,'completed','service_completed',p_request_key);
 else
  result:=booking_private.transition(b.id,case p_substate when 'service_started' then 'in_progress' else b.state end,p_substate,p_request_key);
 end if;
 update public.doctor_visits set substate=p_substate where booking_id=b.id;
 select e.id into event from public.booking_events e where e.booking_id=b.id and e.aggregate_version=result;
 perform booking_private.record_request(actor,'p5.doctor.advance',p_request_key,h,event,result);
 return result;
end $$;

create function public.report_patient_absent(p_booking_id uuid,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior integer; b public.bookings; visit public.doctor_visits;
 result integer; event uuid; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version));
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.absence',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not doctor_private.assignee(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into visit from public.doctor_visits where booking_id=b.id for update;
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.absence',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not doctor_private.assignee(b.id) then raise exception using errcode='42501',message='forbidden'; end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if visit.booking_id is null or visit.substate<>'arrived' then raise exception using errcode='55000',message='invalid_transition'; end if;
 result:=booking_private.transition(b.id,'confirmed','absence_reported',p_request_key);
 update public.doctor_visits set substate='absence_reported' where booking_id=b.id;
 perform doctor_private.end_arrival(b.id);
 perform booking_private.open_exception(b.id,'absence_reported','absence_reported');
 perform booking_private.finish_assignments(b.id);
 select e.id into event from public.booking_events e where e.booking_id=b.id and e.aggregate_version=result;
 perform booking_private.record_request(actor,'p5.doctor.absence',p_request_key,h,event,result);
 return result;
end $$;

create function public.interrupt_doctor_visit(p_booking_id uuid,p_expected_version integer,p_reason text,p_request_key uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior integer; b public.bookings; visit public.doctor_visits;
 result integer; event uuid; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if p_reason is null or not p_reason=any(doctor_private.pre_start_reasons()||doctor_private.in_visit_reasons()) then
  raise exception using errcode='22023',message='invalid_reason'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version,p_reason));
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.interrupt',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not (doctor_private.assignee(p_booking_id) or doctor_private.closeout(p_booking_id)) then
  raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into visit from public.doctor_visits where booking_id=b.id for update;
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.interrupt',p_request_key,h) r;
 if prior is not null then return prior; end if;
 -- Pre-start steps keep the full assignee predicate; only a started visit may use closeout.
 if not (doctor_private.assignee(b.id) or (visit.substate='service_started' and doctor_private.closeout(b.id))) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if visit.booking_id is null or visit.substate not in ('en_route','arrived','arrival_verified','service_started') then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if (visit.substate='service_started' and not p_reason=any(doctor_private.in_visit_reasons()))
 or (visit.substate<>'service_started' and not p_reason=any(doctor_private.pre_start_reasons()))
 then raise exception using errcode='22023',message='invalid_reason'; end if;
 perform doctor_private.end_arrival(b.id);
 result:=booking_private.assignee_finish(b.id,'interrupted',p_reason,p_request_key);
 update public.doctor_visits set substate='interrupted' where booking_id=b.id;
 perform booking_private.open_exception(b.id,'interrupted',p_reason);
 select e.id into event from public.booking_events e where e.booking_id=b.id and e.aggregate_version=result;
 perform booking_private.record_request(actor,'p5.doctor.interrupt',p_request_key,h,event,result);
 return result;
end $$;

-- Doctor read views (design §7.7, §7.8; contract §8.3 rule for category projections; review
-- P5-13, P5-14). Neither returns address line, locality, contact, patient_id, amounts, actor,
-- resource or assignment ids, and neither writes an audit row.

-- The person on the visit's own active assignment who is still the individual owner or an
-- accepted active provider:read member of an active organization, with an active account and
-- resource. Unlike the assignee predicate it ignores the time window and Q06 verification, so
-- a doctor sees upcoming visits and a lapsed credential (credential_ok=false); an offboarded
-- doctor (membership revoked, account disabled) sees nothing (P5-13).
create function doctor_private.visit_member(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b
  join public.doctor_visits v on v.booking_id=b.id
  join public.booking_assignments a on a.id=v.assignment_id and a.booking_id=b.id
  join public.resources r on r.id=a.resource_id
  join public.providers p on p.id=b.provider_id
  where b.id=p_booking_id and b.category='doctor' and b.state in ('confirmed','in_progress')
  and a.status='active' and a.purpose='doctor_visit' and a.assigned_profile_id=auth.uid()
  and r.kind='person' and r.status='active' and r.person_profile_id=auth.uid()
  and (p.individual_owner_profile_id=auth.uid() or exists(select 1 from public.organization_members m
   join public.organizations o on o.id=m.organization_id where m.organization_id=p.organization_id
   and m.profile_id=auth.uid() and m.status='active' and m.accepted_at is not null and o.status='active'
   and 'provider:read'=any(m.scopes))));
$$;

-- Doctor's own visits, keyset (start_at, id). can_act_now: the next pre-start or milestone
-- step is allowed now; can_close: completion or in-visit interruption is allowed now (through
-- the assignee or the closeout predicate).
create function public.list_my_doctor_visits(p_limit integer default 20, p_after_start timestamptz default null, p_after_id uuid default null)
returns setof jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if p_limit is null or p_limit not between 1 and 50 or ((p_after_start is null)<>(p_after_id is null)) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 return query
 select jsonb_build_object('id',b.id,'public_ref',b.public_ref,'provider_reference',p.public_reference,
  'start_at',b.start_at,'end_at',b.end_at,'pin_code',b.address_snapshot->>'pin_code','state',b.state,
  'substate',v.substate,'version',b.version,
  'can_act_now',doctor_private.assignee(b.id),
  'can_close',(v.substate='service_started' and (doctor_private.assignee(b.id) or doctor_private.closeout(b.id))),
  'credential_ok',providers_private.person_is_verified(b.provider_id,actor),
  'awaiting_code',exists(select 1 from doctor_private.arrival_challenges c where c.booking_id=b.id and c.status='active'
   and c.expires_at>clock_timestamp()))
 from public.bookings b join public.doctor_visits v on v.booking_id=b.id
 join public.booking_assignments a on a.id=v.assignment_id and a.booking_id=b.id
 join public.providers p on p.id=b.provider_id
 where a.assigned_profile_id=actor and a.status='active' and b.category='doctor' and b.state in ('confirmed','in_progress')
 and (p_after_start is null or (b.start_at,b.id)>(p_after_start,p_after_id))
 and doctor_private.visit_member(b.id)
 order by b.start_at,b.id limit p_limit;
end $$;

-- Patient (or a grantee with booking:read) only; anyone else, including the doctor and the
-- scheduler, gets the same P0002 as an unknown id. Reviews show only the patient-relevant
-- exception kinds; closed_while_ineligible is an internal compliance flag.
create function public.get_doctor_visit(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; v public.doctor_visits; begin
 if p_booking_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'doctor' or not booking_private.patient(b.patient_id,'booking:read') then
  raise exception using errcode='P0002',message='not_found'; end if;
 select * into v from public.doctor_visits where booking_id=b.id;
 return jsonb_build_object('id',b.id,'public_ref',b.public_ref,'state',b.state,'substate',v.substate,'version',b.version,
  'start_at',b.start_at,'end_at',b.end_at,
  'provider_reference',(select p.public_reference from public.providers p where p.id=b.provider_id),
  'provider_name',(select p.published_profile->>'display_name' from public.providers p where p.id=b.provider_id),
  'timeline',(select coalesce(jsonb_agg(jsonb_build_object('reason',e.reason,'occurred_at',e.occurred_at) order by e.aggregate_version),'[]'::jsonb)
   from public.booking_events e where e.booking_id=b.id),
  'doctor',(select jsonb_build_object('name',pr.display_name,'credential_verified',providers_private.person_is_verified(b.provider_id,a.assigned_profile_id))
   from public.booking_assignments a join public.profiles pr on pr.id=a.assigned_profile_id where a.id=v.assignment_id),
  'arrival_code_expires_at',(select c.expires_at from doctor_private.arrival_challenges c where c.booking_id=b.id and c.status='active'
   and c.expires_at>clock_timestamp() and c.issued_to_profile_id=actor),
  'arrival_fallback_expires_at',(select f.expires_at from doctor_private.arrival_fallbacks f where f.booking_id=b.id and f.status='pending'
   and f.expires_at>clock_timestamp()),
  'reviews',(select coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'reason',x.reason,'status',x.status,'resolution',x.resolution) order by x.opened_at),'[]'::jsonb)
   from public.booking_exceptions x where x.booking_id=b.id and x.kind in ('absence_reported','interrupted')));
end $$;

revoke all on all functions in schema doctor_private from public, anon, authenticated, service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.advance_visit(uuid,text,integer,uuid)','public.report_patient_absent(uuid,integer,uuid)',
  'public.interrupt_doctor_visit(uuid,integer,text,uuid)','public.list_my_doctor_visits(integer,timestamptz,uuid)',
  'public.get_doctor_visit(uuid)']::regprocedure[] loop
  execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
