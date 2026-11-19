-- kiro-avail / fix/availability-by-reference.
-- Public search (000640/000670) returns provider_reference (SCV-DOC|LAB|AMB|CARE-NNNNNN),
-- never the provider UUID, but list_slots took p_provider_id uuid, so a patient could not
-- go from search to availability. This overload resolves the public reference internally
-- and delegates to the existing UUID implementation; the UUID is never returned.
-- create_booking_request needs no change: it takes p_service_id, which search already returns.
-- An unknown, unpublished or non-bookable reference returns zero rows (same as the UUID path),
-- so the endpoint is no oracle for which references exist.
begin;

create function public.list_slots(p_provider_reference text, p_service_id uuid, p_date date)
returns table(start_at timestamptz, end_at timestamptz, advisory boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare v_provider uuid;
begin
  if not identity_private.active_account() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_provider_reference is null or p_provider_reference !~ '^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19}$' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select p.id into v_provider from public.providers p where p.public_reference = p_provider_reference;
  if v_provider is null then
    -- Still validate the date window so malformed input fails the same way for every reference.
    if p_date is null or not isfinite(p_date) or p_date < (clock_timestamp() at time zone 'Asia/Kolkata')::date
      or p_date > (clock_timestamp() at time zone 'Asia/Kolkata')::date + 31 then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    return;
  end if;
  return query select s.start_at, s.end_at, s.advisory from public.list_slots(v_provider, p_service_id, p_date) s;
end;
$$;

revoke all on function public.list_slots(text, uuid, date) from public, anon, authenticated;
grant execute on function public.list_slots(text, uuid, date) to authenticated;

commit;
