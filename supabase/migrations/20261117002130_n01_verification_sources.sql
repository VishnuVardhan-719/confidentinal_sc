-- N01 verification intake. Free-text reasons never enter N01 projections.
-- Authored, DB NOT EXECUTED.
begin;
do $$ begin
 if to_regclass('notify_private.events') is null or to_regclass('notify_private.rules') is null
 or to_regclass('public.provider_verification_events') is null or to_regclass('public.staff_credential_events') is null
 or to_regclass('public.coverage_review_events') is null or to_regclass('public.provider_verification_cases') is null
 or to_regclass('public.provider_service_areas') is null or to_regclass('public.audit_events') is null then
  raise exception 'N01 verification sources require core and merged verification ledgers'; end if;
end $$;
create function notify_private.intake_verification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into notify_private.events(source_kind,source_id,occurred_at)
 values(TG_ARGV[0],new.id,new.occurred_at) on conflict(source_kind,source_id) do nothing; return null;
end $$;
create trigger n01_intake_provider_verification after insert on public.provider_verification_events for each row execute function notify_private.intake_verification('provider_verification');
create trigger n01_intake_staff after insert on public.staff_credential_events for each row execute function notify_private.intake_verification('staff_credential');
create trigger n01_intake_coverage after insert on public.coverage_review_events for each row execute function notify_private.intake_verification('coverage_review');
-- Reconcile design V09 with merged C01: propose_service_area inserts the area
-- and its audit but no coverage_review_events row. Bridge only new proposals;
-- existing/approved seed rows are untouched and no history is backfilled.
create function notify_private.coverage_proposed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
 values(new.id,new.proposed_by,'proposed','proposed','Coverage proposed.',new.version);
 return null;
end $$;
create trigger n01_coverage_proposed after insert on public.provider_service_areas
 for each row when (new.status='proposed') execute function notify_private.coverage_proposed();
insert into notify_private.rules(id,source_kind,match_code,audience,priority,topic,inapp_key,ext_key,ttl) values
 ('V01','provider_verification','submitted','verifiers','transactional','verification','verification.provider_submitted',null,'h24'),
 ('V02','provider_verification','under_review','provider_managers','routine','verification','verification.under_review',null,'h24'),
 ('V03','provider_verification','approved','provider_managers','transactional','verification','verification.approved','ext.account_update','h24'),
 ('V04','provider_verification','rejected','provider_managers','transactional','verification','verification.rejected','ext.account_update','h24'),
 ('V05','provider_verification','suspended','provider_managers','transactional','verification','verification.suspended','ext.account_update','h24'),
 ('V06','provider_verification','expired','provider_managers','transactional','verification','verification.expired','ext.account_update','h24'),
 ('V07','staff_credential','submitted','verifiers','transactional','verification','verification.staff_submitted',null,'h24'),
 ('V09','coverage_review','proposed','coverage_verifiers','transactional','verification','verification.coverage_proposed',null,'h24');
insert into notify_private.rules(id,source_kind,match_code,audience,priority,topic,inapp_key,ttl)
select 'V08-'||s||'-'||a,'staff_credential',s,a,'transactional','verification','verification.staff_'||s,'h24'
from unnest(array['approved','rejected','suspended']) s,unnest(array['staff_subject','provider_managers']) a;
insert into notify_private.rules(id,source_kind,match_code,audience,priority,topic,inapp_key,ttl)
select 'V10-'||s,'coverage_review',s,'provider_managers','transactional','verification','verification.coverage_'||s,'h24'
from unnest(array['approved','rejected','revoked']) s;
revoke all on function notify_private.intake_verification(),notify_private.coverage_proposed() from public,anon,authenticated,service_role;
commit;
