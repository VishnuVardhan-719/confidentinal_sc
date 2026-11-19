-- P5 doctor block: DC01 assigned-doctor authorization / Kiro / feat/S01-doctor-core / base integ/all f549ad3.
-- Contract §4.4, §5.2, §8.2; design §6. Both predicates are thin doctor wrappers over the
-- shared ones, so the doctor block adds no second definition of "assigned" or "closeout":
--  * doctor_private.assignee(booking): shared identity_private.is_assigned(booking,'doctor_visit')
--    (window, active assignment, publishable provider, eligible resource, Q06 verification),
--    plus the caller is the person on the visit's own assignment (doctor_visits.assignment_id).
--    Used for every step that starts from `confirmed`.
--  * doctor_private.closeout(booking): shared booking_private.closeout_assignee(booking)
--    (in_progress, same person, still owner or active member; no window, publishability or
--    verification), plus substate service_started and the visit's own assignment. Used only
--    for completion and in-visit interruption, through booking_private.assignee_finish, which
--    opens the shared closed_while_ineligible exception when the assignee predicate fails.
-- guard_booking, the transition matrix and the actor kinds are the shared block's (001560).
-- Also here: the doctor self-dealing check at accept (below).
begin;

create function doctor_private.assignee(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.is_assigned(p_booking_id,'doctor_visit') and exists(select 1 from public.bookings b
  join public.doctor_visits v on v.booking_id=b.id
  join public.booking_assignments a on a.id=v.assignment_id and a.booking_id=b.id
  where b.id=p_booking_id and b.category='doctor' and a.status='active' and a.purpose='doctor_visit'
  and a.assigned_profile_id=auth.uid());
$$;

create function doctor_private.closeout(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select booking_private.closeout_assignee(p_booking_id) and exists(select 1 from public.bookings b
  join public.doctor_visits v on v.booking_id=b.id
  join public.booking_assignments a on a.id=v.assignment_id and a.booking_id=b.id
  where b.id=p_booking_id and b.category='doctor' and b.state='in_progress' and v.substate='service_started'
  and a.status='active' and a.purpose='doctor_visit' and a.assigned_profile_id=auth.uid());
$$;

-- Self-dealing (design B-6, first half): a provider may not assign a doctor who is the
-- patient (patients.self_profile_id) or who requested the booking. Category-scoped trigger on
-- the accept transition (contract §1 rule 1, the same hook shape as care's accept_check in
-- §7.2), so the shared accept_booking is not replaced. The built accept inserts the
-- assignments before it moves the booking to `accepted`, so they are visible here. The
-- second half of B-6 (overdue doctor is busy) is the shared reservation guard (§11).
create function doctor_private.guard_doctor_accept() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.booking_assignments a join public.patients pt on pt.id=old.patient_id
  where a.booking_id=old.id and a.status='active' and a.assigned_profile_id is not null
  and (a.assigned_profile_id=pt.self_profile_id or a.assigned_profile_id=old.requester_profile_id)) then
  raise exception using errcode='42501',message='self_assignment'; end if;
 return new;
end $$;
create trigger p5d_doctor_accept_guard before update on public.bookings for each row
 when (old.category='doctor' and old.state='requested' and new.state='accepted') execute function doctor_private.guard_doctor_accept();

revoke all on function doctor_private.assignee(uuid) from public, anon, authenticated, service_role;
revoke all on function doctor_private.closeout(uuid) from public, anon, authenticated, service_role;
revoke all on function doctor_private.guard_doctor_accept() from public, anon, authenticated, service_role;
commit;
