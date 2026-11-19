-- P5 shared engine 4/5 / Kiro / feat/P5-shared-engine / base integ/all f549ad3.
-- Contract §8.3-§8.5 (P5-06, P5-12): exact get_booking key sets, one audited contact
-- RPC for assignees and ops, base-table SELECT revoked. Requires 001550-001570.
-- OD-3 yes (ops contact only with an open exception or an escalatable booking),
-- OD-4 no (schedulers see the PIN only), OD-9 no (assignees see no amount).
begin;

-- Viewer resolved in order patient, scheduler, assignee (live or closeout); first match wins.
create or replace function public.get_booking(p_booking_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; result jsonb; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 result:=jsonb_build_object('id',b.id,'public_ref',b.public_ref,
  'provider_reference',(select p.public_reference from public.providers p where p.id=b.provider_id),'category',b.category,
  'pin_code',b.address_snapshot->>'pin_code','start_at',b.start_at,'end_at',b.end_at,'state',b.state,'version',b.version);
 if booking_private.patient(b.patient_id,'booking:read') then
  result:=result||jsonb_build_object('service_id',b.service_id,'amount_paise',b.amount_paise::text,'currency',b.currency,
   'terms_version',b.terms_version,'policy_version_id',b.policy_version_id,
   'patient_id',b.patient_id,'address_snapshot',b.address_snapshot,'contact_snapshot',b.contact_snapshot);
 elsif booking_private.scheduler(b.provider_id) then
  result:=result||jsonb_build_object('service_id',b.service_id,'amount_paise',b.amount_paise::text,'currency',b.currency,
   'terms_version',b.terms_version,'policy_version_id',b.policy_version_id);
 elsif not (identity_private.is_assigned(b.id,booking_private.person_purpose(b.category)) or booking_private.closeout_assignee(b.id)) then
  raise exception using errcode='P0002',message='not_found';
 end if;
 if b.category='doctor' then result:=result||jsonb_build_object('substate',(select substate from public.doctor_visits where booking_id=b.id)); end if;
 return result;
end $$;

create function booking_private.contact_allowed(p_booking_id uuid) returns text
language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; begin
 select * into b from public.bookings where id=p_booking_id;
 if not found then return null; end if;
 if identity_private.is_assigned(b.id,booking_private.person_purpose(b.category)) then return 'assignee'; end if;
 if booking_private.ops_actor(b.id) and booking_private.escalatable(b.id) then return 'ops'; end if;
 return null;
end $$;

-- Volatile and audited: routes call it with POST because PostgREST runs GET RPCs read-only.
create function public.get_assignment_contact(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; viewer text; begin
 viewer:=booking_private.contact_allowed(p_booking_id);
 if viewer is null then raise exception using errcode='P0002',message='not_found'; end if;
 select * into b from public.bookings where id=p_booking_id;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id)
 values(actor,case viewer when 'ops' then 'booking.contact_viewed_ops' else 'booking.contact_viewed' end,'booking',b.id);
 return jsonb_build_object('booking_id',b.id,'public_ref',b.public_ref,
  'address',jsonb_build_object('line1',b.address_snapshot->>'line1','locality',b.address_snapshot->>'locality','pin_code',b.address_snapshot->>'pin_code'),
  'contact',jsonb_build_object('name',b.contact_snapshot->>'name','phone',b.contact_snapshot->>'phone'));
end $$;

-- §8.5 base-table access. Patient timelines come from category projections.
revoke select on public.bookings,public.booking_events,public.booking_assignments,public.resource_reservations,public.doctor_visits from authenticated;
drop policy b01_bookings_patient on public.bookings;
drop policy b01_events_patient on public.booking_events;
drop policy b01_assignment_self on public.booking_assignments;
drop policy b01_visits_patient on public.doctor_visits;
revoke execute on function booking_private.patient_booking(uuid),booking_private.assigned(uuid,text) from authenticated;

revoke all on function booking_private.contact_allowed(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_booking(uuid),public.get_assignment_contact(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_booking(uuid),public.get_assignment_contact(uuid) to authenticated;
commit;
