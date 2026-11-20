-- DC extras 1/5 / Kiro / feat/DC-extras / base integ/all bed2877.
-- Design docs/specs/DC_extras_design.md §1-§2: private schema, feature gates (all seeded off)
-- and the three visit predicates the DC03/DC10-DC13 RPCs share.
-- Synthetic local/staging only. Authored, DB NOT EXECUTED.
begin;

do $$ declare obj text; begin
 foreach obj in array array['booking_private.patient(uuid,text)','identity_private.active_account()','identity_private.require_actor()',
  'doctor_private.assignee(uuid)','doctor_private.closeout(uuid)','providers_private.person_is_verified(uuid,uuid)',
  'booking_private.gate_state(text)','booking_private.request_hash(jsonb)','booking_private.replay(uuid,text,uuid,text)',
  'booking_private.record_request(uuid,text,uuid,text,uuid,integer)','booking_private.immutable()'] loop
  if to_regprocedure(obj) is null then raise exception 'DC extras preflight: missing %',obj; end if;
 end loop;
 foreach obj in array array['booking_private.feature_gates','public.doctor_visits','public.booking_assignments','public.idempotency_requests'] loop
  if to_regclass(obj) is null then raise exception 'DC extras preflight: missing %',obj; end if;
 end loop;
end $$;

create schema dcx_private;
revoke all on schema dcx_private from public, anon, authenticated, service_role;

-- OD-5 style: every DC-extras capability starts off; a reviewed owner step turns it on.
insert into booking_private.feature_gates(key) values ('doctor_progress'),('doctor_visit_payment'),('doctor_fact_review'),
 ('doctor_visit_proof'),('doctor_photos') on conflict do nothing;

-- write: on only (suspended -> feature_suspended, off -> feature_unavailable).
-- read: on or suspended. withdraw: never blocked (revocation and consent withdrawal).
create function dcx_private.require_feature(p_key text,p_mode text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare s text:=booking_private.gate_state(p_key); begin
 if p_mode='write' then
  if s='suspended' then raise exception using errcode='55000',message='feature_suspended'; end if;
  if s<>'on' then raise exception using errcode='55000',message='feature_unavailable'; end if;
 elsif p_mode='read' then
  if s not in ('on','suspended') then raise exception using errcode='55000',message='feature_unavailable'; end if;
 elsif p_mode is distinct from 'withdraw' then
  raise exception using errcode='22023',message='invalid_input';
 end if;
end $$;

-- The patient (or a grantee holding p_scope) of a doctor booking.
create function dcx_private.visit_patient(p_booking_id uuid,p_scope text) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce((select booking_private.patient(b.patient_id,p_scope) from public.bookings b
  where b.id=p_booking_id and b.category='doctor'),false);
$$;

-- Read-only doctor predicate: the person on the visit's own assignment, still active or ended
-- by a terminal step, who is still the owner or an accepted active provider:read member of an
-- active organization. Ignores the window and Q06 (like doctor_private.visit_member), so it
-- never authorizes a write.
create function dcx_private.visit_doctor(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b
  join public.doctor_visits v on v.booking_id=b.id
  join public.booking_assignments a on a.id=v.assignment_id and a.booking_id=b.id
  join public.resources r on r.id=a.resource_id
  join public.providers p on p.id=b.provider_id
  where b.id=p_booking_id and b.category='doctor' and a.purpose='doctor_visit' and a.assigned_profile_id=auth.uid()
  and r.kind='person' and r.person_profile_id=auth.uid()
  and ((a.status='active' and b.state in ('confirmed','in_progress'))
   or (a.status='ended' and b.state in ('completed','interrupted')))
  and (p.individual_owner_profile_id=auth.uid() or exists(select 1 from public.organization_members m
   join public.organizations o on o.id=m.organization_id where m.organization_id=p.organization_id
   and m.profile_id=auth.uid() and m.status='active' and m.accepted_at is not null and o.status='active'
   and 'provider:read'=any(m.scopes))));
$$;

-- Write predicate for clinical-adjacent steps during the visit: started visit, DC01 assignee
-- or closeout on the visit's own assignment, and a currently verified clinician (Q06).
create function dcx_private.in_visit_doctor(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce((select b.state='in_progress' and v.substate='service_started'
  and (doctor_private.assignee(b.id) or doctor_private.closeout(b.id))
  and providers_private.person_is_verified(b.provider_id,auth.uid())
  from public.bookings b join public.doctor_visits v on v.booking_id=b.id
  where b.id=p_booking_id and b.category='doctor'),false);
$$;

revoke all on all functions in schema dcx_private from public, anon, authenticated, service_role;
commit;
