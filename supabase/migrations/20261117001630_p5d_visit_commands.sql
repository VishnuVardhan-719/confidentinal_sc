-- P5 doctor core: visit state machine commands / Kiro / feat/S01-doctor-core / base 2470161.
-- Design §4.2, §7.0-§7.3, with the DC02 step from 001620:
--   scheduled -> en_route -> arrived -> arrival_verified -> service_started -> service_completed
--   arrived -> absence_reported; en_route|arrived|arrival_verified -> interrupted (pre-start codes);
--   service_started -> interrupted (in-visit codes).
-- Every command: definer, empty search_path, require_actor first, category from the booking,
-- lock order booking -> provider -> active assignment resources -> doctor_visits, authorization
-- before and after the locks, expected version, replay of the caller's own last event.
-- advance_visit keeps its signature, so the built routes and grants keep working.
begin;

create or replace function public.advance_visit(p_booking_id uuid,p_substate text,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; visit public.doctor_visits; next_state text; result integer;
 assignee boolean; closeout boolean:=false; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 if p_substate in ('en_route','arrived','service_started','service_completed')
 and doctor_private.replayed(b.id,p_expected_version,array[p_substate]) then return p_expected_version+1; end if;
 assignee:=identity_private.is_assigned(b.id,'doctor_visit');
 if not assignee and p_substate='service_completed' then closeout:=doctor_private.closeout(b.id); end if;
 if not (assignee or closeout) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 assignee:=identity_private.is_assigned(b.id,'doctor_visit');
 closeout:=not assignee and p_substate='service_completed' and doctor_private.closeout(b.id);
 if not (assignee or closeout) then raise exception using errcode='42501',message='forbidden'; end if;
 if b.category<>'doctor' then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if clock_timestamp()<b.start_at-interval '60 minutes' then raise exception using errcode='55000',message='visit_too_early'; end if;
 select * into visit from public.doctor_visits where booking_id=b.id for update;
 if p_substate is null or visit.booking_id is null or not ((visit.substate='scheduled' and p_substate='en_route') or (visit.substate='en_route' and p_substate='arrived')
 or (visit.substate='arrival_verified' and p_substate='service_started') or (visit.substate='service_started' and p_substate='service_completed'))
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 -- Operational reports only: no clinical acceptance, prescription or consent is inferred.
 next_state:=case p_substate when 'service_started' then 'in_progress' when 'service_completed' then 'completed' else b.state end;
 result:=booking_private.transition(b.id,next_state,p_substate);
 update public.doctor_visits set substate=p_substate where booking_id=b.id;
 if p_substate='service_completed' then
  if closeout then
   insert into public.doctor_visit_exceptions(booking_id,kind,reason,opened_by_profile_id) values(b.id,'closed_while_ineligible','service_completed',actor);
  end if;
  perform doctor_private.end_visit(b.id);
 end if;
 return result;
end $$;

create function public.report_patient_absent(p_booking_id uuid,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; visit public.doctor_visits; result integer; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 if doctor_private.replayed(b.id,p_expected_version,array['absence_reported']) then return p_expected_version+1; end if;
 if not identity_private.is_assigned(b.id,'doctor_visit') then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 if not identity_private.is_assigned(b.id,'doctor_visit') then raise exception using errcode='42501',message='forbidden'; end if;
 if b.category<>'doctor' then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 select * into visit from public.doctor_visits where booking_id=b.id for update;
 if visit.booking_id is null or visit.substate<>'arrived' then raise exception using errcode='55000',message='invalid_transition'; end if;
 perform 1 from public.doctor_visit_exceptions where booking_id=b.id and status='open' for update;
 if found then raise exception using errcode='55000',message='exception_open'; end if;
 result:=booking_private.transition(b.id,'confirmed','absence_reported');
 update public.doctor_visits set substate='absence_reported' where booking_id=b.id;
 insert into public.doctor_visit_exceptions(booking_id,kind,reason,opened_by_profile_id) values(b.id,'absence_reported','absence_reported',actor);
 perform doctor_private.end_visit(b.id);
 return result;
end $$;

create function public.interrupt_doctor_visit(p_booking_id uuid,p_expected_version integer,p_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; visit public.doctor_visits; result integer;
 assignee boolean; closeout boolean; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 if p_reason=any(doctor_private.pre_start_reasons()||doctor_private.in_visit_reasons())
 and doctor_private.replayed(b.id,p_expected_version,array[p_reason]) then return p_expected_version+1; end if;
 if not (identity_private.is_assigned(b.id,'doctor_visit') or doctor_private.closeout(b.id)) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into visit from public.doctor_visits where booking_id=b.id for update;
 assignee:=identity_private.is_assigned(b.id,'doctor_visit');
 closeout:=not assignee and visit.booking_id is not null and visit.substate='service_started' and doctor_private.closeout(b.id);
 if not (assignee or closeout) then raise exception using errcode='42501',message='forbidden'; end if;
 if b.category<>'doctor' then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_expected_version is null or b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if visit.booking_id is null or visit.substate not in ('en_route','arrived','arrival_verified','service_started') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_reason is null or (visit.substate='service_started' and not p_reason=any(doctor_private.in_visit_reasons()))
 or (visit.substate<>'service_started' and not p_reason=any(doctor_private.pre_start_reasons()))
 then raise exception using errcode='22023',message='invalid_reason'; end if;
 perform 1 from public.doctor_visit_exceptions where booking_id=b.id and status='open' for update;
 if found then raise exception using errcode='55000',message='exception_open'; end if;
 result:=booking_private.transition(b.id,'interrupted',p_reason);
 update public.doctor_visits set substate='interrupted' where booking_id=b.id;
 insert into public.doctor_visit_exceptions(booking_id,kind,reason,opened_by_profile_id)
 values(b.id,case when closeout then 'closed_while_ineligible' else 'interrupted' end,p_reason,actor);
 perform doctor_private.end_visit(b.id);
 return result;
end $$;

revoke all on all functions in schema doctor_private from public, anon, authenticated, service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.advance_visit(uuid,text,integer)','public.report_patient_absent(uuid,integer)',
  'public.interrupt_doctor_visit(uuid,integer,text)']::regprocedure[] loop
  execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
