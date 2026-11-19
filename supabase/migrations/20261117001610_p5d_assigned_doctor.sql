-- P5 doctor core: DC01 assigned-doctor authorization / Kiro / feat/S01-doctor-core / base 2470161.
-- Design §6. Two predicates guard every doctor command:
--  * Assignee: the built identity_private.is_assigned(booking,'doctor_visit') (001100): H1
--    window, active assignment for auth.uid(), publishable provider, eligible resource,
--    person_is_verified. Unchanged here.
--  * Closeout (design B-2): lets the doctor who is already inside a started visit record
--    that it ended even if the window closed, the provider was suspended or the credential
--    lapsed mid-visit (DQ-10). Only for in_progress + service_started, only the person on
--    the active doctor_visit assignment, and only while still the individual owner or an
--    active accepted member with provider:read of an active organization. Commands that
--    pass only through closeout open a closed_while_ineligible exception.
-- guard_booking is the 001100 body with one added clause for closeout; nothing else changed.
begin;

create function doctor_private.closeout(booking uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.bookings b
  join public.doctor_visits v on v.booking_id=b.id
  join public.booking_assignments a on a.id=v.assignment_id and a.booking_id=b.id
  join public.resources r on r.id=a.resource_id
  join public.providers p on p.id=b.provider_id
  where b.id=booking and b.category='doctor' and b.state='in_progress' and v.substate='service_started'
  and a.status='active' and a.ended_at is null and a.purpose='doctor_visit'
  and r.kind='person' and r.person_profile_id=auth.uid() and a.assigned_profile_id=auth.uid()
  and (p.individual_owner_profile_id=auth.uid() or exists(select 1 from public.organization_members m
   join public.organizations o on o.id=m.organization_id where m.organization_id=p.organization_id
   and m.profile_id=auth.uid() and m.status='active' and m.accepted_at is not null and o.status='active'
   and 'provider:read'=any(m.scopes))));
$$;
revoke all on function doctor_private.closeout(uuid) from public, anon, authenticated, service_role;

create or replace function booking_private.guard_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare who text; begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_booking'; end if;
 if TG_OP='INSERT' then
  if new.state<>'draft' or new.version<>1 or not exists(select 1 from public.services s join public.service_price_versions v on v.service_id=s.id
   where s.id=new.service_id and s.provider_id=new.provider_id and s.category=new.category and v.id=new.price_version_id
   and v.amount_paise=new.amount_paise and v.currency=new.currency and v.terms_version=new.terms_version) then
   raise exception using errcode='55000',message='invalid_snapshot'; end if;
  return new;
 end if;
 if (to_jsonb(new)-array['state','version','updated_at']) is distinct from (to_jsonb(old)-array['state','version','updated_at']) then
  raise exception using errcode='55000',message='immutable_snapshot'; end if;
 if new.version<>old.version+1 then raise exception using errcode='40001',message='stale_version'; end if;
 if new.state is distinct from old.state then
  who:=case when new.state in ('in_progress','completed','interrupted') then 'assigned'
   when new.state in ('accepted','confirmed','declined','no_show') then 'provider'
   when new.state='expired' then 'system'
   when booking_private.patient(old.patient_id,'booking:create') then 'patient' else 'provider' end;
  if not exists(select 1 from public.booking_transitions t where t.from_state=old.state and t.to_state=new.state and t.actor_kind=who)
   or (who='patient' and not booking_private.patient(old.patient_id,'booking:create'))
   or (who='provider' and not (booking_private.scheduler(old.provider_id)
    or (new.state='cancelled' and identity_private.is_assigned(old.id,'doctor_visit'))))
   or (who='assigned' and not (identity_private.is_assigned(old.id,'doctor_visit') or identity_private.is_assigned(old.id,'lab_collection')
    or identity_private.is_assigned(old.id,'caretaker') or identity_private.is_assigned(old.id,'driver')
    or (old.category='doctor' and old.state='in_progress' and new.state in ('completed','interrupted') and doctor_private.closeout(old.id))))
   or who='system' then raise exception using errcode='55000',message='invalid_transition'; end if;
 end if;
 return new;
end $$;

commit;
