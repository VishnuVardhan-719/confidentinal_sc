-- I02 hardening item 2 / Kiro / integ/friend-backend. Forward migration after 202611170005.
-- Ports O-I01 anonymous-account rejection into F's identity helpers. Supabase anonymous
-- sign-ins are disabled in config.toml, but the database must not rely on that setting:
-- an anonymous Auth user still gets a profile row from the auth.users trigger.
begin;

-- CREATE OR REPLACE keeps the existing narrow EXECUTE grants.
create or replace function identity_private.active_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is false
    and not exists(select 1 from auth.users u where u.id = auth.uid() and u.is_anonymous)
    and exists(select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

-- Every definer command starts here, so commands that do not call active_account()
-- directly also reject anonymous sessions before taking any lock.
create or replace function identity_private.require_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not identity_private.active_account() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform 1 from public.profiles where id = actor and status = 'active' for no key update;
  if not found then raise exception using errcode = '42501', message = 'forbidden'; end if;
  return actor;
end;
$$;

commit;
