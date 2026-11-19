-- P5 doctor core: visit model / Kiro / feat/S01-doctor-core / base origin/integ/all 2470161.
-- Design: docs/specs/P5_doctor_flow_design.md (task/P5-doctor-design) §4, §5. Forward only.
-- Synthetic staging only. Adds the doctor substate model and its database guards:
--  * doctor_visits.substate gains arrival_verified (DC02), absence_reported, interrupted.
--  * booking_events.reason gains the doctor codes (design §5.3, plus arrival_verified).
--  * booking_transitions gains confirmed -> interrupted for the assignee (design B-4).
--  * doctor_private.guard_visit: substate edges, booking state and a matching event (§4.3).
--  * doctor_private.guard_doctor_booking: doctor booking state changes must match the
--    substate, so cancellation is only possible while scheduled (B-12) and no command
--    can start a visit before the arrival code is verified.
--  * public.doctor_visit_exceptions (§5.2): coded, append-then-resolve, no API grants.
--  * service_role loses writes on doctor_visits (P01 H2).
-- Guarantees hold for application roles; the table owner can still disable triggers.
begin;

create schema doctor_private;
revoke all on schema doctor_private from public, anon, authenticated, service_role;

alter table public.doctor_visits drop constraint doctor_visits_substate_check;
alter table public.doctor_visits add constraint doctor_visits_substate_check check (substate in
 ('scheduled','en_route','arrived','arrival_verified','service_started','service_completed','absence_reported','interrupted'));

-- Rebuilt from the twelve built values (202611170005) plus the doctor codes.
alter table public.booking_events drop constraint booking_events_reason_check;
alter table public.booking_events add constraint booking_events_reason_check check (reason in
 ('requested','accepted','confirmed','patient_request','provider_unavailable','unable_to_service','other',
  'en_route','arrived','service_started','service_completed','reassigned',
  'arrival_verified','absence_reported','address_not_found','declined_at_door','unsafe_conditions',
  'doctor_unable','patient_requested_stop','ended_for_emergency'));

insert into public.booking_transitions(from_state,to_state,actor_kind) values ('confirmed','interrupted','assigned');

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
  and (e.reason=new.substate or (new.substate='interrupted' and e.reason=any(doctor_private.pre_start_reasons()||doctor_private.in_visit_reasons()))))
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 return new;
end $$;
create trigger p5d_visit_guard before insert or update or delete on public.doctor_visits for each row execute function doctor_private.guard_visit();
create trigger p5d_visit_no_truncate before truncate on public.doctor_visits for each statement execute function booking_private.immutable();

-- Runs after b01_booking_guard (trigger names fire in alphabetical order). The substate
-- read here is the one before the command updates it.
create function doctor_private.guard_doctor_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare sub text; begin
 if new.category<>'doctor' or new.state is not distinct from old.state then return new; end if;
 select substate into sub from public.doctor_visits where booking_id=old.id;
 if sub is null then
  if new.state in ('in_progress','completed','interrupted','no_show') then raise exception using errcode='55000',message='invalid_transition'; end if;
  return new;
 end if;
 if (new.state='cancelled' and sub<>'scheduled') or (new.state='in_progress' and sub<>'arrival_verified')
 or (new.state='completed' and sub<>'service_started')
 or (new.state='interrupted' and sub not in ('en_route','arrived','arrival_verified','service_started'))
 or (new.state='no_show' and sub<>'absence_reported')
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 return new;
end $$;
create trigger p5d_doctor_booking_guard before update on public.bookings for each row execute function doctor_private.guard_doctor_booking();

create table public.doctor_visit_exceptions (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 kind text not null check (kind in ('absence_reported','interrupted','closed_while_ineligible')),
 reason text not null,
 opened_by_profile_id uuid not null references public.profiles(id),
 opened_at timestamptz not null default now(),
 status text not null default 'open' check (status in ('open','resolved')),
 resolution text,
 resolved_by_profile_id uuid references public.profiles(id),
 resolved_at timestamptz,
 version integer not null default 1 check (version > 0),
 check ((kind='absence_reported' and reason='absence_reported')
  or (kind='interrupted' and reason in ('address_not_found','declined_at_door','unsafe_conditions','doctor_unable','patient_requested_stop','ended_for_emergency'))
  or (kind='closed_while_ineligible' and reason in ('service_completed','patient_requested_stop','unsafe_conditions','doctor_unable','ended_for_emergency'))),
 check ((status='open') = (resolution is null and resolved_by_profile_id is null and resolved_at is null)),
 check (status='open' or (status='resolved' and resolution is not null and resolved_by_profile_id is not null and resolved_at is not null)),
 check (resolution is null or (kind='absence_reported' and resolution in ('no_show','interrupted')) or (kind<>'absence_reported' and resolution='acknowledged')),
 check (resolved_by_profile_id is null or resolved_by_profile_id<>opened_by_profile_id)
);
create unique index p5d_exception_open on public.doctor_visit_exceptions(booking_id) where status='open';

create function doctor_private.guard_exception() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_exception'; end if;
 if TG_OP='INSERT' then
  if new.status<>'open' or new.version<>1 then raise exception using errcode='55000',message='invalid_transition'; end if;
  return new;
 end if;
 if old.status<>'open' or new.status<>'resolved' or new.version<>old.version+1
 or (to_jsonb(new)-array['status','resolution','resolved_by_profile_id','resolved_at','version'])
  is distinct from (to_jsonb(old)-array['status','resolution','resolved_by_profile_id','resolved_at','version'])
 then raise exception using errcode='55000',message='immutable_exception'; end if;
 return new;
end $$;
create trigger p5d_exception_guard before insert or update or delete on public.doctor_visit_exceptions for each row execute function doctor_private.guard_exception();
create trigger p5d_exception_no_truncate before truncate on public.doctor_visit_exceptions for each statement execute function booking_private.immutable();

alter table public.doctor_visit_exceptions enable row level security;
revoke all on public.doctor_visit_exceptions from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate, trigger, references on public.doctor_visits from service_role;

-- Replay rule (design §7.0): the latest event is this actor's, with this reason, at
-- exactly the version the caller expected to produce.
create function doctor_private.replayed(booking uuid, expected integer, reason_codes text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select expected is not null and expected between 1 and 2147483646 and exists(select 1 from public.bookings b
  join public.booking_events e on e.booking_id=b.id and e.aggregate_version=b.version
  where b.id=booking and b.category='doctor' and b.version=expected+1 and e.actor_profile_id=auth.uid() and e.reason=any(reason_codes));
$$;

revoke all on all functions in schema doctor_private from public, anon, authenticated, service_role;
revoke all on all tables in schema doctor_private from public, anon, authenticated, service_role;
commit;
