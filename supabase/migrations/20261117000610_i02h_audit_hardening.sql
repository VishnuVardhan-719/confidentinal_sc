-- I02 hardening item 3 / Kiro / integ/friend-backend. Forward migration.
-- Ports O-I01:234 and O-I02:276-277. Supabase default privileges give service_role
-- ALL on public tables, so a leaked service key could forge or delete audit history.
-- Only postgres-owned definer commands write these ledgers; they keep owner rights.
begin;

revoke insert, update, delete, truncate, trigger, references
  on public.audit_events, public.provider_verification_events from service_role;

-- Scoped admin capability check (aal2, unexpired, unrevoked). A NULL organization
-- matches only global grants. Never accepts a caller-supplied actor.
create function identity_private.has_capability(p_capability text, p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select identity_private.active_account()
    and (auth.jwt()->>'aal' is not distinct from 'aal2')
    and exists (
      select 1 from public.admin_capabilities c
      where c.profile_id = auth.uid() and c.capability = p_capability
        and (c.scope_key = 'global' or c.scope_key = 'org:' || p_organization_id::text)
        and c.revoked_at is null and c.valid_from <= now()
        and (c.expires_at is null or c.expires_at > now())
    );
$$;
revoke all on function identity_private.has_capability(text, uuid) from public, anon, authenticated;
grant execute on function identity_private.has_capability(text, uuid) to authenticated;

-- Auditor read path (P_AUDIT). F's audit rows carry no organization column, so only
-- global security:audit holders can read them; org-scoped audit needs a target->org
-- mapping and is left for a later reviewed change.
grant select on public.audit_events to authenticated;
create policy audit_events_auditor_read on public.audit_events for select to authenticated
  using (identity_private.has_capability('security:audit', null));

commit;
