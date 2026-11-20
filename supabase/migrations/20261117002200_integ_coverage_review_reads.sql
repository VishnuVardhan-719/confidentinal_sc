-- Integration fix / Claude / integ/all. Range 0022xx: cross-block fixes found by CI.
-- Synthetic local/staging only.
--
-- N01 (002130) now writes a coverage_review_events row when an area is proposed. C01's read
-- policy admitted any coverage verifier, so a verifier who is also the provider's owner,
-- proposer or org member could read the review trail of their own area (suite 004,
-- 'owner cannot read internal reviews'). Reads now carry the same conflict exclusions as
-- review_service_area (C01).
begin;

create or replace function catalog_private.area_reviewer(area uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.provider_service_areas a join public.providers p on p.id=a.provider_id
 where a.id=area and catalog_private.verifier(p.organization_id)
  and p.individual_owner_profile_id is distinct from auth.uid() and a.proposed_by is distinct from auth.uid()
  and not exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.profile_id=auth.uid()));
$$;

commit;
