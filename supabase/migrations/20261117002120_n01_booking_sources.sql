-- N01 booking intake and catalogue. Authored, DB NOT EXECUTED.
begin;
do $$ begin
 if to_regclass('notify_private.events') is null or to_regclass('notify_private.rules') is null
 or to_regclass('public.notification_outbox') is null or to_regclass('public.booking_exceptions') is null
 or to_regclass('booking_private.category_reasons') is null
 or to_regprocedure('booking_private.person_purpose(text)') is null then
  raise exception 'N01 booking sources require core and P5 shared exceptions/reasons'; end if;
end $$;
create function notify_private.intake_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into notify_private.events(source_kind,source_id,booking_id,occurred_at)
 values('booking_event',new.event_id,new.booking_id,new.created_at) on conflict(source_kind,source_id) do nothing;
 return null;
end $$;
create function notify_private.intake_exception() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into notify_private.events(source_kind,source_id,booking_id,occurred_at)
 values('booking_exception',new.id,new.booking_id,new.opened_at) on conflict(source_kind,source_id) do nothing;
 return null;
end $$;
create trigger n01_intake_booking after insert on public.notification_outbox for each row execute function notify_private.intake_booking();
create trigger n01_intake_exception after insert on public.booking_exceptions for each row execute function notify_private.intake_exception();

-- Owner-only, idempotent catalogue seed. After category migrations merge, a reviewed
-- owner transaction calls this again; absent registry codes are deliberately skipped.
-- No category registry is changed by N01. Exact category codes: design section 5;
-- shared contract section 9.4 supersedes old category reason mappings.
create function notify_private.seed_booking_rules() returns void language plpgsql security definer set search_path='' as $$
declare c text; code text; aud text; actor text; from_s text; n text; key_name text; ext text; pri text; emergency boolean; begin
 for c,code in
  select cr.category,cr.code from booking_private.category_reasons cr
  where cr.code in ('requested','accepted','confirmed','patient_request','provider_unavailable','unable_to_service','other',
   'en_route','arrived','service_started','service_completed','absence_reported','unsafe_conditions','ended_for_emergency',
   'no_show_confirmed','absence_disputed','ops_closeout','provider_did_not_attend',
   'address_not_found','declined_at_door','doctor_unable','patient_requested_stop',
   'collection_started','sample_collected','sample_handed_over','collection_failed','handoff_failed',
   'picked_up','destination_reached','eligibility_blocked','vehicle_breakdown','requirement_mismatch','driver_unable')
  and exists(select 1 from booking_private.reason_codes r where r.code=cr.code)
 loop
  -- The reason and state both match: a cancellation reason must not accidentally
  -- trigger a milestone, and an emergency code on an interruption remains safety.
  if code='requested' then
   insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,ttl)
   values('B01-'||c,'booking_event',code,'requested',array[c],'schedulers','transactional','booking','booking.request_received','ext.action_needed','until_start') on conflict do nothing;
  end if;
  if code='confirmed' then
   foreach aud in array array['patient','assignees'] loop
    insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,ttl)
    values('B03-'||c||'-'||aud,'booking_event',code,'confirmed',array[c],aud,'transactional','booking',
     case aud when 'patient' then 'booking.confirmed' else 'booking.assigned' end,'ext.booking_update','until_start') on conflict do nothing;
   end loop;
  end if;
  -- B04/B08 match terminal state for any registered reason in that category.
  insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,ttl)
  values('B04-'||c||'-'||code,'booking_event',code,'declined',array[c],'patient','transactional','booking','booking.declined','ext.booking_update','h24') on conflict do nothing;
  foreach aud in array array['patient','schedulers'] loop
   insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,ttl)
   values('B08-'||c||'-'||code||'-'||aud,'booking_event',code,'expired',array[c],aud,
    case aud when 'patient' then 'transactional' else 'routine' end,'booking','booking.expired',case aud when 'patient' then 'ext.booking_update' end,'h24') on conflict do nothing;
  end loop;
  foreach actor in array array['patient','not_patient'] loop
   foreach from_s in array array['draft','requested','accepted','confirmed'] loop
    foreach aud in array array['patient','schedulers','assignees'] loop
     if actor='patient' and aud='patient' then continue; end if;
     n:=case when actor='patient' then 'B05' when from_s='confirmed' then 'B07' else 'B06' end;
     pri:=case when n='B07' and aud='patient' then 'safety' else 'transactional' end;
     key_name:=case when actor='patient' then 'booking.cancelled_by_patient' when aud<>'patient' then 'booking.cancelled'
      when n='B07' then 'booking.cancelled_confirmed' else 'booking.cancelled_by_provider' end;
     ext:=case when actor='patient' and aud='schedulers' then 'ext.booking_update'
      when actor='not_patient' and aud='patient' then case when n='B07' then 'ext.not_going_ahead' else 'ext.booking_update' end end;
     insert into notify_private.rules(id,source_kind,match_code,match_from_state,match_to_state,match_categories,match_actor,audience,priority,topic,inapp_key,ext_key,ttl)
     values(n||'-'||c||'-'||code||'-'||from_s||'-'||aud,'booking_event',code,from_s,'cancelled',array[c],actor,aud,pri,'booking',key_name,ext,'until_end') on conflict do nothing;
    end loop;
   end loop;
  end loop;
  if code in ('en_route','arrived') and c in ('doctor','ambulance') then
   n:=case code when 'en_route' then 'B09' else 'B10' end;
   insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,quiet_exempt,ttl)
   values(n||'-'||c,'booking_event',code,'confirmed',array[c],'patient','transactional','booking','visit.'||code,'ext.booking_update',true,'arrival') on conflict do nothing;
  end if;
  if code in ('service_started','collection_started','picked_up','sample_collected') then
   n:=case when code='sample_collected' then 'B12' else 'B11' end;
   insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ttl)
   values(n||'-'||c||'-'||code,'booking_event',code,'in_progress',array[c],'patient','routine','booking',
    case when n='B12' then 'visit.sample_collected' else 'visit.started' end,'h24') on conflict do nothing;
  end if;
  if code in ('service_completed','sample_handed_over','destination_reached') then
   foreach aud in array array['patient','schedulers'] loop
    insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ttl)
    values('B13-'||c||'-'||code||'-'||aud,'booking_event',code,'completed',array[c],aud,'routine','booking','visit.completed','h24') on conflict do nothing;
   end loop;
  end if;
  n:=case when c<>'ambulance' and code in ('patient_request','patient_requested_stop','declined_at_door','collection_failed','handoff_failed',
   'ops_closeout','provider_did_not_attend','absence_disputed') then 'B14' else 'B15' end;
  emergency:=c='ambulance' or code in ('ended_for_emergency','unsafe_conditions');
  foreach aud in array array['patient','schedulers','assignees'] loop
   insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,emergency_notice,ttl)
   values(n||'-'||c||'-'||code||'-'||aud,'booking_event',code,'interrupted',array[c],aud,
    case when n='B15' and aud='patient' then 'safety' else 'transactional' end,'booking',
    case when aud<>'patient' then 'visit.interrupted_staff' when n='B14' then 'visit.ended_early' else 'visit.interrupted' end,
    case when aud='patient' then case when n='B15' then 'ext.not_going_ahead' else 'ext.booking_update' end end,emergency and aud='patient','h24') on conflict do nothing;
  end loop;
  if code in ('absence_reported','no_show_confirmed') and c<>'caretaker' then
   n:=case code when 'absence_reported' then 'B16' else 'B17' end;
   foreach aud in array array['patient','schedulers','ops'] loop
    if n='B17' and aud='ops' then continue; end if;
    insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,ttl)
    values(n||'-'||c||'-'||aud,'booking_event',code,case when n='B17' then 'no_show' else 'confirmed' end,array[c],aud,'transactional','booking',
     case when n='B17' then 'visit.no_show' when aud='patient' then 'visit.absence_reported' else 'visit.absence_reported_staff' end,
     case when aud='patient' then 'ext.booking_update' end,'h24') on conflict do nothing;
   end loop;
  end if;
  if code='eligibility_blocked' and c='ambulance' then
   foreach aud in array array['patient','schedulers'] loop
    insert into notify_private.rules(id,source_kind,match_code,match_to_state,match_categories,audience,priority,topic,inapp_key,ext_key,quiet_exempt,ttl)
    values('B18-'||aud,'booking_event',code,'confirmed',array[c],aud,'transactional','booking',
     case aud when 'patient' then 'trip.problem' else 'trip.blocked_staff' end,
     case aud when 'patient' then 'ext.booking_update' else 'ext.action_needed' end,true,'until_start') on conflict do nothing;
   end loop;
  end if;
 end loop;
end $$;
select notify_private.seed_booking_rules();
insert into notify_private.rules(id,source_kind,match_code,audience,priority,topic,inapp_key,ttl)
select case when code='interrupted_after_pickup' then 'X01' else 'X02-'||code end,'booking_exception',code,'ops',
 case when code='interrupted_after_pickup' then 'safety' else 'transactional' end,'booking','ops.exception_opened','h24'
from booking_private.exception_kinds;
revoke all on all functions in schema notify_private from public,anon,authenticated,service_role;
commit;
