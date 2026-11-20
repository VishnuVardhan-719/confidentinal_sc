-- N01 authenticated commands / Authored, DB NOT EXECUTED.
begin;
do $$ begin
 if to_regclass('public.notifications') is null or to_regclass('public.notification_preferences') is null
 or to_regclass('notify_private.deliveries') is null or to_regclass('public.audit_events') is null
 or to_regprocedure('identity_private.require_actor()') is null
 or to_regprocedure('identity_private.has_capability(text,uuid)') is null
 or to_regprocedure('booking_private.gate_state(text)') is null then
  raise exception 'N01 user RPCs require core, identity, capabilities and gates'; end if;
end $$;
create function public.mark_notifications_read(p_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); n integer; begin
 if p_ids is null or cardinality(p_ids) not between 1 and 100 or array_ndims(p_ids) is distinct from 1 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if array_position(p_ids,null) is not null then
  raise exception using errcode='22023',message='invalid_input'; end if;
 update public.notifications set read_at=clock_timestamp()
  where id=any(p_ids) and recipient_profile_id=actor and read_at is null;
 get diagnostics n=row_count; return n;
end $$;
create function public.mark_all_notifications_read(p_before timestamptz) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); n integer; begin
 if p_before is null or not isfinite(p_before) then raise exception using errcode='22023',message='invalid_input'; end if;
 update public.notifications set read_at=clock_timestamp()
  where recipient_profile_id=actor and read_at is null and created_at<=p_before;
 get diagnostics n=row_count; return n;
end $$;
create function public.set_notification_preference(p_channel text,p_topic text,p_enabled boolean,p_notice_version text,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); prior integer; result integer; begin
 if p_channel is null or p_channel not in ('sms','email','whatsapp') or p_topic is null or p_topic not in ('booking','payment','verification')
  or p_enabled is null or p_notice_version is null or char_length(btrim(p_notice_version)) not between 1 and 80
  or p_expected_version is null or p_expected_version<0 then raise exception using errcode='22023',message='invalid_input'; end if;
 if p_channel='whatsapp' and booking_private.gate_state('notify_whatsapp')='off' then
  raise exception using errcode='55000',message='feature_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('n01:preference:'||actor::text,0));
 if (select count(*) from notify_private.channel_consent_events where profile_id=actor and source='settings' and occurred_at>clock_timestamp()-interval '1 hour')>=20 then
  raise exception using errcode='53300',message='rate_limited'; end if;
 select version into prior from public.notification_preferences where profile_id=actor and channel=p_channel and topic=p_topic for update;
 if coalesce(prior,0)<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 result:=coalesce(prior,0)+1;
 insert into public.notification_preferences(profile_id,channel,topic,enabled,version)
  values(actor,p_channel,p_topic,p_enabled,result)
  on conflict(profile_id,channel,topic) do update set enabled=excluded.enabled,version=excluded.version,updated_at=clock_timestamp();
 insert into notify_private.channel_consent_events(profile_id,channel,topic,decision,notice_version,source)
  values(actor,p_channel,p_topic,case when p_enabled then 'granted' else 'withdrawn' end,btrim(p_notice_version),'settings');
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'notification.preference_changed','profile',actor);
 return result;
end $$;
create function public.list_notification_failures(p_limit integer default 50,p_after uuid default null) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if not coalesce(identity_private.has_capability('security:audit',null),false) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='invalid_input'; end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'notification.failures_viewed','profile',actor);
 return query select jsonb_build_object('delivery_id',d.id,'event_id',d.event_id,'rule_id',d.rule_id,'channel',d.channel,
  'priority',d.priority,'status',d.status,'attempts',d.attempts,'last_error_code',d.last_error_code,'created_at',d.created_at,'updated_at',d.updated_at)
 from notify_private.deliveries d where (d.status in ('dead','expired') or (d.priority='safety' and d.status='suppressed'))
  and (p_after is null or d.id>p_after) order by d.id limit p_limit;
end $$;
revoke all on function public.mark_notifications_read(uuid[]),public.mark_all_notifications_read(timestamptz),
 public.set_notification_preference(text,text,boolean,text,integer),public.list_notification_failures(integer,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.mark_notifications_read(uuid[]),public.mark_all_notifications_read(timestamptz),
 public.set_notification_preference(text,text,boolean,text,integer),public.list_notification_failures(integer,uuid) to authenticated;
commit;
