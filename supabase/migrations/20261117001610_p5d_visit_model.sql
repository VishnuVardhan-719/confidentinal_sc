-- P5 doctor block: visit model / Kiro / feat/S01-doctor-core / base integ/all f549ad3.
-- Contract: docs/specs/P5_shared_engine_contract.md v1.0 (shared block 001550-001599).
-- Design: docs/specs/P5_doctor_flow_design.md §4, §5, as changed by contract §15.
-- Forward only. Synthetic staging only. Requires the whole shared block (preflight below).
-- This file:
--  * schema doctor_private (closed to every API role);
--  * doctor_visits.substate gains arrival_verified (DC02), absence_reported, interrupted;
--  * doctor reason codes and their doctor pairs, added to the shared registry by insert only
--    (contract §9.4: address_not_found, declined_at_door, doctor_unable, patient_requested_stop;
--    plus arrival_verified and arrival_assisted for DC02, which the contract table predates);
--  * doctor_private.guard_visit: substate edges, booking state and a matching event (design §4.3);
--  * doctor_private.guard_doctor_booking: a doctor booking may enter in_progress only after the
--    arrival code was verified. It never constrains terminal states, so the shared ops close
--    works from any substate (contract §6.1);
--  * service_role loses writes on doctor_visits (P01 H2).
-- Not here (shared block owns them): transitions matrix, guard_booking, closeout predicate,
-- exceptions, reasons registry, gates, replay, projections, base-table revokes.
-- Guarantees hold for application roles; the table owner can still disable triggers.
begin;

do $$ declare o text; begin
 foreach o in array array['booking_private.require_gate(text,text)','booking_private.request_hash(jsonb)',
  'booking_private.replay(uuid,text,uuid,text)','booking_private.record_request(uuid,text,uuid,text,uuid,integer)',
  'booking_private.closeout_assignee(uuid)','booking_private.assignee_finish(uuid,text,text,uuid)',
  'booking_private.finish_assignments(uuid)','booking_private.open_exception(uuid,text,text)',
  'booking_private.person_purpose(text)','booking_private.transition(uuid,text,text,uuid)',
  'booking_private.ops_actor(uuid)','booking_private.gate_state(text)'] loop
  if to_regprocedure(o) is null then raise exception 'P5 doctor block requires shared function %',o; end if;
 end loop;
 foreach o in array array['booking_private.reason_codes','booking_private.category_reasons','booking_private.feature_gates',
  'booking_private.exception_kinds','public.booking_exceptions'] loop
  if to_regclass(o) is null then raise exception 'P5 doctor block requires shared table %',o; end if;
 end loop;
 if not exists(select 1 from public.booking_transitions where category='doctor' and from_state='confirmed' and to_state='interrupted' and actor_kind='assigned') then
  raise exception 'P5 doctor block requires the shared category-scoped transition matrix'; end if;
end $$;

create schema doctor_private;
revoke all on schema doctor_private from public, anon, authenticated, service_role;

alter table public.doctor_visits drop constraint doctor_visits_substate_check;
alter table public.doctor_visits add constraint doctor_visits_substate_check check (substate in
 ('scheduled','en_route','arrived','arrival_verified','service_started','service_completed','absence_reported','interrupted'));

insert into booking_private.reason_codes(code) values
 ('address_not_found'),('declined_at_door'),('doctor_unable'),('patient_requested_stop'),('arrival_verified'),('arrival_assisted')
 on conflict do nothing;
-- arrival_verified and arrival_assisted (support-assisted fallback, 001630) follow arrived,
-- so cancellation is already blocked; the flag is set so the
-- table reads as the full cancellation rule (contract §9.4).
insert into booking_private.category_reasons(category,code,blocks_cancel) values
 ('doctor','address_not_found',false),('doctor','declined_at_door',false),('doctor','doctor_unable',false),
 ('doctor','patient_requested_stop',false),('doctor','arrival_verified',true),('doctor','arrival_assisted',true)
 on conflict do nothing;

-- Interruption codes by phase. Kept in one place so commands and guards agree.
create function doctor_private.pre_start_reasons() returns text[] language sql immutable set search_path='' as $$
 select array['address_not_found','declined_at_door','unsafe_conditions','doctor_unable','ended_for_emergency']::text[];
$$;
create function doctor_private.in_visit_reasons() returns text[] language sql immutable set search_path='' as $$
 select array['patient_requested_stop','unsafe_conditions','doctor_unable','ended_for_emergency']::text[];
$$;

create function doctor_private.guard_visit() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings; expected_state text; begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_visit'; end if;
 select * into b from public.bookings where id=new.booking_id;
 if TG_OP='INSERT' then
  if not found or b.category<>'doctor' or b.state<>'confirmed' or new.substate<>'scheduled' then
   raise exception using errcode='55000',message='invalid_transition'; end if;
  return new;
 end if;
 if new.booking_id is distinct from old.booking_id or new.assignment_id is distinct from old.assignment_id then
  raise exception using errcode='55000',message='immutable_visit'; end if;
 if new.substate=old.substate then return new; end if;
 if not ((old.substate='scheduled' and new.substate='en_route')
  or (old.substate='en_route' and new.substate in ('arrived','interrupted'))
  or (old.substate='arrived' and new.substate in ('arrival_verified','absence_reported','interrupted'))
  or (old.substate='arrival_verified' and new.substate in ('service_started','interrupted'))
  or (old.substate='service_started' and new.substate in ('service_completed','interrupted')))
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 expected_state:=case new.substate when 'service_started' then 'in_progress' when 'service_completed' then 'completed'
  when 'interrupted' then 'interrupted' else 'confirmed' end;
 if b.state<>expected_state then raise exception using errcode='55000',message='invalid_transition'; end if;
 -- The command must have written the transition for this exact booking version first.
 if not exists(select 1 from public.booking_events e where e.booking_id=b.id and e.aggregate_version=b.version
  and (e.reason=new.substate or (new.substate='arrival_verified' and e.reason='arrival_assisted') or (new.substate='interrupted' and e.reason=any(doctor_private.pre_start_reasons()||doctor_private.in_visit_reasons()))))
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 return new;
end $$;
create trigger p5d_visit_guard before insert or update or delete on public.doctor_visits for each row execute function doctor_private.guard_visit();
create trigger p5d_visit_no_truncate before truncate on public.doctor_visits for each statement execute function booking_private.immutable();

-- Category-scoped (contract §1 rule 1). Fires after b01_booking_guard (alphabetical order), so
-- the shared authority check has already passed. The substate read is the one before the
-- command updates it.
create function doctor_private.guard_doctor_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='in_progress' and not exists(select 1 from public.doctor_visits where booking_id=old.id and substate='arrival_verified') then
  raise exception using errcode='55000',message='arrival_not_verified'; end if;
 return new;
end $$;
create trigger p5d_doctor_booking_guard before update on public.bookings for each row
 when (old.category='doctor' and new.state is distinct from old.state) execute function doctor_private.guard_doctor_booking();

revoke insert, update, delete, truncate, trigger, references on public.doctor_visits from service_role;
revoke all on all functions in schema doctor_private from public, anon, authenticated, service_role;
revoke all on all tables in schema doctor_private from public, anon, authenticated, service_role;
commit;
