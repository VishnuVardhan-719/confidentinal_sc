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

revoke all on function doctor_private.assignee(uuid) from public, anon, authenticated, service_role;
revoke all on function doctor_private.closeout(uuid) from public, anon, authenticated, service_role;
commit;
