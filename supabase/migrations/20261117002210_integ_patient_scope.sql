-- Integration fix / Claude / integ/all. Range 0022xx: cross-block fixes found by CI.
-- Synthetic local/staging only.
--
-- B01 booking_private.patient(subject,scope) compared a.scope=scope. In a SQL function a column
-- name wins over a parameter name, so that was a.scope=a.scope (always true): any live self
-- access row granted every scope, and revoking one scope ended nothing. Found by suite 114
-- (revoked booking:read still read clinical records). The parameter is now referenced by
-- position; the rest of the body is unchanged.
begin;

create or replace function booking_private.patient(subject uuid,scope text) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.patient_access a join public.patients p on p.id=a.patient_id
 where p.id=$1 and p.self_profile_id=auth.uid() and a.grantee_profile_id=auth.uid() and a.granted_by=auth.uid()
 and a.source='self' and a.scope=$2 and a.revoked_at is null and a.valid_from<=clock_timestamp()
 and (a.expires_at is null or a.expires_at>clock_timestamp()));
$$;

commit;
