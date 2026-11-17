-- I01 follow-ups / Codex / task/I01-auth-rls / base 84321ae.
-- Forward-only extension of 001. Apply only to a reviewed isolated local target.
-- No Auth/Storage policy changes and no broadening of client table write grants.
begin;
alter table public.organization_members add column invite_expires_at timestamptz default (clock_timestamp()+interval '14 days');
-- Preserve the last issued time of existing invitations rather than renewing them.
update public.organization_members set invite_expires_at = updated_at + interval '14 days' where status = 'invited';
update public.organization_members set invite_expires_at = null where status <> 'invited';
-- Only invitation RPCs assign expiry; active owner inserts must keep NULL.
alter table public.organization_members alter column invite_expires_at drop default;
alter table public.organization_members add constraint invited_membership_expiry
  check (status <> 'invited' or invite_expires_at is not null);
create index organization_pending_invites_idx on public.organization_members(organization_id,invite_expires_at) where status='invited';

create or replace function public.set_organization_member(p_organization_id uuid, p_profile_id uuid, p_membership_role text, p_status text, p_scopes text[], p_expected_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result uuid;
  prior public.organization_members; next_status text; needs_acceptance boolean;
begin
  perform 1 from public.organizations where id = p_organization_id for update;
  perform 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor for update;
  if p_profile_id = actor or not identity_private.org_scope(p_organization_id,'members:read') or not exists (
    select 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor and membership_role = 'owner'
  ) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_membership_role is null or p_membership_role not in ('manager','staff','billing') or p_status is null or p_status not in ('invited','active','disabled') or p_scopes is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists(select 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor and p_scopes <@ scopes) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if not exists(select 1 from public.profiles where id = p_profile_id and status = 'active') then raise exception using errcode = '42501', message = 'forbidden'; end if;
  select * into prior from public.organization_members
    where organization_id = p_organization_id and profile_id = p_profile_id for update;
  if found and prior.membership_role = 'owner' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_expected_version = 0 then
    if p_status <> 'invited' then raise exception using errcode = '22023', message = 'invitation_required'; end if;
    if prior.id is not null then raise exception using errcode = '23505', message = 'membership_exists'; end if;
    next_status := 'invited'; needs_acceptance := true;
  else
    if prior.id is null or prior.version is distinct from p_expected_version then
      raise exception using errcode = '40001', message = 'conflict';
    end if;
    if p_status = 'active' and prior.status <> 'active' and prior.accepted_at is null then
      raise exception using errcode = '42501', message = 'invitation_required';
    end if;
    needs_acceptance := p_status = 'invited' or not (p_scopes <@ prior.scopes)
      or (prior.status = 'disabled' and p_status = 'active')
      or (p_membership_role = 'manager' and prior.membership_role in ('staff','billing'));
    next_status := case when p_status = 'active' and needs_acceptance then 'invited' else p_status end;
  end if;
  -- The organization row lock serializes pending-slot allocation across owners.
  -- Expired invitations consume no slot; refreshing one must reacquire capacity.
  if next_status = 'invited' and (
    select count(*) from public.organization_members m
    where m.organization_id = p_organization_id and m.profile_id <> p_profile_id
      and m.status = 'invited' and m.invite_expires_at > clock_timestamp()
  ) >= 25 then raise exception using errcode = '23514', message = 'invitation_limit'; end if;
  if p_expected_version = 0 then
    insert into public.organization_members(organization_id,profile_id,membership_role,status,scopes,invite_expires_at)
      values(p_organization_id,p_profile_id,p_membership_role,'invited',p_scopes,clock_timestamp()+interval '14 days') returning id into result;
  else
    update public.organization_members set membership_role = p_membership_role, status = next_status,
      accepted_at = case when needs_acceptance then null
        when prior.status = 'active' then coalesce(prior.accepted_at,clock_timestamp()) else prior.accepted_at end,
      invite_expires_at = case when next_status = 'invited' then clock_timestamp()+interval '14 days' else null end,
      scopes = p_scopes, version = version + 1, updated_at = now()
      where id = prior.id returning id into result;
  end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'membership.changed','organization_member',result);
  return result;
end;
$$;
create or replace function public.accept_organization_invite(p_organization_id uuid, p_expected_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := identity_private.require_actor(); result uuid;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception using errcode = '42501', message = 'forbidden'; end if;
  perform 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor for update;
  if not found or not exists (
    select 1 from public.organization_members where organization_id = p_organization_id and profile_id = actor and status = 'invited' and invite_expires_at > clock_timestamp()
  ) then raise exception using errcode = '42501', message = 'forbidden'; end if;
  update public.organization_members set status = 'active', accepted_at = now(), invite_expires_at = null, version = version + 1, updated_at = now()
    where organization_id = p_organization_id and profile_id = actor and version = p_expected_version returning id into result;
  if not found then raise exception using errcode = '40001', message = 'conflict'; end if;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'membership.accepted','organization_member',result);
  return result;
end;
$$;
create function public.list_organizations(p_limit integer default 20, p_cursor uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_page_limit';
  end if;
  return (
    with candidates as (
      select o.id,o.name,o.version from public.organizations o where (p_cursor is null or o.id > p_cursor) order by id limit p_limit+1
    ), page as (select * from candidates order by id limit p_limit)
    select jsonb_build_object(
      'organizations',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from page p),'[]'::jsonb),
      'nextCursor',case when (select count(*) from candidates)>p_limit
        then (select to_jsonb(p.id) from page p order by p.id desc limit 1) else null end)
  );
end;
$$;

create function public.list_organization_members(p_organization_id uuid, p_limit integer default 20, p_cursor uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_page_limit';
  end if;
  return (
    with candidates as (
      select m.id,m.profile_id,m.membership_role,m.status,m.scopes,m.version,m.invite_expires_at from public.organization_members m where m.organization_id=p_organization_id and (p_cursor is null or m.id > p_cursor) order by id limit p_limit+1
    ), page as (select * from candidates order by id limit p_limit)
    select jsonb_build_object(
      'members',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from page p),'[]'::jsonb),
      'nextCursor',case when (select count(*) from candidates)>p_limit
        then (select to_jsonb(p.id) from page p order by p.id desc limit 1) else null end)
  );
end;
$$;

create function public.list_organization_invites_page(p_limit integer default 20, p_cursor uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_page_limit';
  end if;
  return (
    with candidates as (
      select m.organization_id,m.scopes,m.version,m.invite_expires_at from public.organization_members m join public.organizations o on o.id=m.organization_id where identity_private.active_account() and m.profile_id=auth.uid() and m.status='invited' and o.status='active' and m.invite_expires_at > statement_timestamp() and (p_cursor is null or m.organization_id > p_cursor) order by organization_id limit p_limit+1
    ), page as (select * from candidates order by organization_id limit p_limit)
    select jsonb_build_object(
      'invitations',coalesce((select jsonb_agg(to_jsonb(p) order by p.organization_id) from page p),'[]'::jsonb),
      'nextCursor',case when (select count(*) from candidates)>p_limit
        then (select to_jsonb(p.organization_id) from page p order by p.organization_id desc limit 1) else null end)
  );
end;
$$;
-- Compatibility path for the existing no-argument Auth invite endpoint.
-- Bounded to 50 and excludes expired invitations; paginated routes use the page RPC.
create or replace function public.list_organization_invites()
returns table(organization_id uuid, scopes text[], version integer)
language sql stable security definer set search_path = '' as $$
  select m.organization_id,m.scopes,m.version
  from public.organization_members m join public.organizations o on o.id=m.organization_id
  where identity_private.active_account() and m.profile_id=auth.uid()
    and m.status='invited' and o.status='active' and m.invite_expires_at > statement_timestamp()
  order by m.organization_id limit 50;
$$;
revoke all on function public.list_organizations(integer,uuid), public.list_organization_members(uuid,integer,uuid),
  public.list_organization_invites_page(integer,uuid) from public,anon,authenticated;
grant execute on function public.list_organizations(integer,uuid), public.list_organization_members(uuid,integer,uuid),
  public.list_organization_invites_page(integer,uuid) to authenticated;
-- CREATE OR REPLACE preserves existing narrow execute ACLs on member/accept/legacy RPCs.
notify pgrst,'reload schema';
commit;
