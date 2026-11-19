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
  perform doctor_private.revoke_codes(b.id);
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
 perform doctor_private.revoke_codes(b.id);
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
 perform doctor_private.revoke_codes(b.id);
 result:=booking_private.assignee_finish(b.id,'interrupted',p_reason,p_request_key);
 update public.doctor_visits set substate='interrupted' where booking_id=b.id;
 perform booking_private.open_exception(b.id,'interrupted',p_reason);
 select e.id into event from public.booking_events e where e.booking_id=b.id and e.aggregate_version=result;
 perform booking_private.record_request(actor,'p5.doctor.interrupt',p_request_key,h,event,result);
 return result;
end $$;

revoke all on all functions in schema doctor_private from public, anon, authenticated, service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.advance_visit(uuid,text,integer,uuid)','public.report_patient_absent(uuid,integer,uuid)',
  'public.interrupt_doctor_visit(uuid,integer,text,uuid)']::regprocedure[] loop
  execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
