from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
source = (root / 'supabase/migrations/202611170005_b01_booking.sql').read_text()

def function(name):
    match = re.search(r'create function ' + re.escape(name) + r'\(.*?\$\$;', source, re.S)
    assert match, name
    return match.group().replace('create function', 'create or replace function', 1)

def replace_once(text, before, after):
    assert text.count(before) == 1, before
    return text.replace(before, after, 1)

parts = ['-- B01-FIX / Codex / integ/b01-fixes / base e8a71ed.\n-- Forward only; requires Q06 credential cases (20261117001000). Synthetic staging only.\nbegin;']

eligible = function('booking_private.resource_eligible')
eligible = replace_once(eligible, "((r.kind='person' and exists", "((r.kind='person' and (p.category<>'doctor' or providers_private.person_is_verified(p.id,r.person_profile_id)) and exists")
parts.append(eligible)

assigned = function('identity_private.is_assigned')
assigned = replace_once(assigned, 'a.period @> clock_timestamp() is not null', "clock_timestamp() >= b.start_at-interval '60 minutes'\n and clock_timestamp() < b.end_at+interval '12 hours'")
assigned = replace_once(assigned, "(b.category='doctor' and p_purpose='doctor_visit')", "(b.category='doctor' and p_purpose='doctor_visit' and providers_private.person_is_verified(b.provider_id,auth.uid()))")
parts.append(assigned)

guard = function('booking_private.guard_booking')
guard = replace_once(guard, "(who='provider' and not booking_private.scheduler(old.provider_id))", "(who='provider' and not (booking_private.scheduler(old.provider_id)\n    or (new.state='cancelled' and identity_private.is_assigned(old.id,'doctor_visit'))))")
parts.append(guard)

address = function('public.save_patient_address')
address = replace_once(address, " if p_expected_version=0 and p_address_id is null then", " -- Serialize all address/booking creates for this patient before counting.\n perform 1 from public.patients where id=p_patient_id for update;\n if not booking_private.patient(p_patient_id,'profile:write') then raise exception using errcode='42501',message='forbidden'; end if;\n if p_expected_version=0 and p_address_id is null then\n  if (select count(*) from public.patient_addresses where patient_id=p_patient_id)>=20 then\n   raise exception using errcode='53300',message='address_limit'; end if;")
parts.append(address)

create = function('public.create_booking_request')
create = replace_once(create, ' select * into a from public.patient_addresses', " perform 1 from public.patients where id=p_patient_id for update;\n if not booking_private.patient(p_patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;\n select * into a from public.patient_addresses")
create = replace_once(create, ' select * into s from public.services where id=p_service_id;', " -- Replay precedes caps/horizon: retries remain safe after the quota fills.\n if p_start_at<=clock_timestamp() or p_start_at>clock_timestamp()+interval '90 days' then\n  raise exception using errcode='22023',message='invalid_input'; end if;\n if (select count(*) from public.bookings where patient_id=p_patient_id and state='requested')>=10 then\n  raise exception using errcode='53300',message='pending_booking_limit'; end if;\n select * into s from public.services where id=p_service_id;")
parts.append(create)

accept = function('public.accept_booking')
accept = replace_once(accept, " if b.state<>'requested'", " if b.category<>'doctor' then raise exception using errcode='55000',message='category_deferred_to_s01'; end if;\n if b.state<>'requested'")
parts.append(accept)

cancel = function('public.cancel_booking')
cancel = cancel.replace("booking_private.scheduler(b.provider_id)) then", "booking_private.scheduler(b.provider_id) or identity_private.is_assigned(b.id,'doctor_visit')) then")
cancel = replace_once(cancel, " if b.state in ('accepted','confirmed') then", " -- Provider cancellation is available without inventing a fee or payment state.\n if booking_private.patient(b.patient_id,'booking:create') and not booking_private.scheduler(b.provider_id)\n and not identity_private.is_assigned(b.id,'doctor_visit') then\n  if clock_timestamp()>=b.start_at then raise exception using errcode='55000',message='cancellation_window_closed'; end if;\n  if b.state in ('accepted','confirmed') then")
cancel = replace_once(cancel, "  if cutoff is null or clock_timestamp()>b.start_at-make_interval(mins=>cutoff) then raise exception using errcode='55000',message='cancellation_policy_required'; end if;", "   if cutoff is not null and clock_timestamp()>b.start_at-make_interval(mins=>cutoff) then\n    raise exception using errcode='55000',message='cancellation_window_closed'; end if;\n  end if;")
# Transition must see the active assignment before release ends it.
cancel = replace_once(cancel, 'cutoff integer; begin', 'cutoff integer; result integer; begin')
cancel = replace_once(cancel, " perform booking_private.release(b.id);\n return booking_private.transition(b.id,'cancelled',p_reason);", " result:=booking_private.transition(b.id,'cancelled',p_reason);\n perform booking_private.release(b.id);\n return result;")
parts.append(cancel)

advance = function('public.advance_visit')
advance = replace_once(advance, ' select * into visit from public.doctor_visits', " if clock_timestamp()<b.start_at-interval '60 minutes' then\n  raise exception using errcode='55000',message='visit_too_early'; end if;\n select * into visit from public.doctor_visits")
parts.append(advance)

# Schedulers still need the queue outside the clinical window, but not exact contacts.
projection = function('public.get_booking')
projection = replace_once(projection, "details:=patient or (b.state in ('confirmed','in_progress') and public.provider_is_publishable(b.provider_id)", "details:=patient or (b.state in ('confirmed','in_progress') and public.provider_is_publishable(b.provider_id)\n and clock_timestamp()>=b.start_at-interval '60 minutes' and clock_timestamp()<b.end_at+interval '12 hours'")
parts.append(projection)
parts.append('commit;\n')
(root / 'supabase/migrations/20261117001100_b01_authorization_limits.sql').write_text('\n\n'.join(parts))
