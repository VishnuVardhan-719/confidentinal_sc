-- N01 / feat/N01-notifications / base integ/all 51c7439.
-- Authored, DB NOT EXECUTED. Contract: N01_notifications_design.md sections 6, 12.
begin;
do $$ begin
 if to_regclass('booking_private.feature_gates') is null
 or to_regclass('booking_private.reason_codes') is null
 or to_regclass('public.bookings') is null
 or to_regprocedure('booking_private.immutable()') is null
 or to_regprocedure('identity_private.active_account()') is null then
  raise exception 'N01 core requires the merged identity, booking and P5 shared engine';
 end if;
end $$;

create schema notify_private;
create schema notify_worker;
revoke all on schema notify_private,notify_worker from public,anon,authenticated,service_role;
grant usage on schema notify_worker to service_role;

create table notify_private.events (
 id uuid primary key default gen_random_uuid(),
 source_kind text not null check(source_kind in ('booking_event','booking_exception','payment_event','provider_verification','staff_credential','coverage_review','reminder')),
 source_id uuid not null, booking_id uuid references public.bookings(id), occurred_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','expanded','skipped','failed','dead')),
 skip_reason text check(skip_reason in ('gate_off','stale','unmatched_rule')),
 attempts integer not null default 0 check(attempts between 0 and 10),
 error_code text check(error_code is null or error_code ~ '^[A-Z0-9]{5}$' or error_code='audience_capped'),
 expanded_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(source_kind,source_id)
);
create index n01_events_pending on notify_private.events(status,created_at) where status in ('pending','failed');
create table notify_private.rules (
 id text primary key,
 source_kind text not null check(source_kind in ('booking_event','booking_exception','payment_event','provider_verification','staff_credential','coverage_review','reminder')),
 match_code text not null, match_from_state text,match_to_state text,match_categories text[],
 match_actor text check(match_actor in ('patient','not_patient')),
 audience text not null check(audience in ('patient','schedulers','assignees','ops','finance','provider_managers','provider_finance_readers','verifiers','coverage_verifiers','staff_subject','collector')),
 priority text not null check(priority in ('safety','transactional','routine')),
 topic text not null check(topic in ('booking','payment','verification')),
 inapp_key text not null check(inapp_key ~ '^[a-z][a-z_]*\.[a-z][a-z0-9_]*$'),
 ext_key text check(ext_key in ('ext.booking_update','ext.action_needed','ext.not_going_ahead','ext.account_update')),
 emergency_notice boolean not null default false,quiet_exempt boolean not null default false,
 ttl text not null check(ttl in ('until_start','until_end','arrival','h24')),
 -- A conditional FK: non-booking match codes belong to their own source ledger.
 booking_reason_code text generated always as (case when source_kind='booking_event' then match_code end) stored references booking_private.reason_codes(code),
 unique nulls not distinct(source_kind,match_code,match_from_state,match_to_state,match_categories,match_actor,audience)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),recipient_profile_id uuid not null references public.profiles(id),
 event_id uuid not null references notify_private.events(id),rule_id text not null references notify_private.rules(id),
 template_key text not null,template_version integer not null check(template_version>0),
 priority text not null check(priority in ('safety','transactional','routine')),booking_id uuid references public.bookings(id),
 params jsonb not null default '{}' check(jsonb_typeof(params)='object' and
  (params-array['public_ref','category','state','reason','start_at','amount_paise','emergency_notice'])='{}'::jsonb),
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 unique(event_id,recipient_profile_id,template_key)
);
create index n01_inbox_page on public.notifications(recipient_profile_id,created_at desc,id desc);
create index n01_inbox_unread on public.notifications(recipient_profile_id) where read_at is null;
create table public.notification_preferences (
 profile_id uuid not null references public.profiles(id),channel text not null check(channel in ('sms','email','whatsapp')),
 topic text not null check(topic in ('booking','payment','verification')),enabled boolean not null,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default clock_timestamp(),primary key(profile_id,channel,topic)
);
create table notify_private.channel_consent_events (
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id),
 channel text not null check(channel in ('sms','email','whatsapp')),topic text not null check(topic in ('booking','payment','verification')),
 decision text not null check(decision in ('granted','withdrawn')),
 notice_version text not null check(char_length(btrim(notice_version)) between 1 and 80),
 source text not null check(source in ('settings','vendor_opt_out')),occurred_at timestamptz not null default clock_timestamp()
);
create index n01_consent_latest on notify_private.channel_consent_events(profile_id,channel,topic,occurred_at desc);
create table notify_private.deliveries (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references notify_private.events(id),
 rule_id text not null references notify_private.rules(id),recipient_profile_id uuid not null references public.profiles(id),
 booking_id uuid references public.bookings(id),channel text not null check(channel in ('sms','email','whatsapp')),
 template_key text not null check(template_key in ('ext.booking_update','ext.action_needed','ext.not_going_ahead','ext.account_update')),
 template_version integer not null check(template_version>0),locale text not null check(locale in ('en','te','hi')),
 priority text not null check(priority in ('safety','transactional','routine')),topic text not null check(topic in ('booking','payment','verification')),
 dedupe_key text not null unique,collapse_key text,
 status text not null default 'queued' check(status in ('queued','leased','sent','suppressed','superseded','expired','dead')),
 suppress_reason text check(suppress_reason in ('preference_off','consent_missing','no_destination','recipient_ineligible','rate_limited','global_cap','booking_moved_on')),
 not_before timestamptz not null,not_after timestamptz not null,attempts integer not null default 0 check(attempts between 0 and 20),
 lease_until timestamptz,last_error_code text check(last_error_code in ('timeout','network','vendor_throttled','vendor_5xx','config_error','invalid_destination','template_rejected','destination_opted_out','content_rejected')),
 vendor_ref text check(char_length(vendor_ref)<=128),sent_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),version integer not null default 1 check(version>0),
 check((status='suppressed')=(suppress_reason is not null)),check((status='leased')=(lease_until is not null)),check((status='sent')=(sent_at is not null)),
 check(priority<>'safety' or collapse_key is null)
);
create index n01_delivery_queue on notify_private.deliveries(channel,status,not_before) where status='queued';
create index n01_delivery_sent on notify_private.deliveries(recipient_profile_id,channel,sent_at) where status='sent';
create index n01_delivery_collapse on notify_private.deliveries(collapse_key) where status='queued';
create table notify_private.delivery_attempts (
 delivery_id uuid not null references notify_private.deliveries(id),attempt_no integer not null check(attempt_no>0),
 adapter text not null default 'log' check(adapter='log'),started_at timestamptz not null,finished_at timestamptz not null,
 outcome text not null check(outcome in ('accepted','retryable','permanent','lease_expired')),
 error_code text check(error_code in ('timeout','network','vendor_throttled','vendor_5xx','config_error','invalid_destination','template_rejected','destination_opted_out','content_rejected')),
 primary key(delivery_id,attempt_no)
);
create table notify_private.delivery_transitions (
 id uuid primary key default gen_random_uuid(),delivery_id uuid not null references notify_private.deliveries(id),
 from_status text not null,to_status text not null,reason text,db_role text not null,occurred_at timestamptz not null default clock_timestamp()
);
create table notify_private.settings (
 id boolean primary key default true check(id),max_event_age_minutes integer not null default 1440 check(max_event_age_minutes>0),
 max_audience integer not null default 50 check(max_audience between 1 and 500),
 quiet_start time not null default '21:00',quiet_end time not null default '08:00',quiet_tz text not null default 'Asia/Kolkata' check(quiet_tz='Asia/Kolkata'),
 per_recipient_hour integer not null default 5 check(per_recipient_hour>=0),per_recipient_day integer not null default 20 check(per_recipient_day>=0),
 safety_alarm_per_day integer not null default 10 check(safety_alarm_per_day>0),
 daily_cap_sms integer not null default 0 check(daily_cap_sms>=0),daily_cap_email integer not null default 0 check(daily_cap_email>=0),
 daily_cap_whatsapp integer not null default 0 check(daily_cap_whatsapp>=0),max_attempts integer not null default 6 check(max_attempts between 1 and 20),
 backoff_base_seconds integer not null default 30 check(backoff_base_seconds>0),backoff_cap_seconds integer not null default 1800 check(backoff_cap_seconds>0),
 lease_seconds integer not null default 60 check(lease_seconds between 1 and 3600),arrival_ttl_minutes integer not null default 30 check(arrival_ttl_minutes>0)
);
insert into notify_private.settings default values;
create table notify_private.settings_events (
 id uuid primary key default gen_random_uuid(),old_row jsonb not null,new_row jsonb not null,db_role text not null,changed_at timestamptz not null default clock_timestamp()
);
-- Durable, ids/codes-only alarms; no external alerting or support promise.
create table notify_private.alarms (
 id uuid primary key default gen_random_uuid(),delivery_id uuid not null references notify_private.deliveries(id),
 code text not null check(code in ('safety_volume','safety_undelivered')),occurred_at timestamptz not null default clock_timestamp(),unique(delivery_id,code)
);

create function notify_private.guard_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP<>'UPDATE' or (to_jsonb(new)-array['status','skip_reason','attempts','error_code','expanded_at']) is distinct from
  (to_jsonb(old)-array['status','skip_reason','attempts','error_code','expanded_at']) then
  raise exception using errcode='55000',message='immutable_notification'; end if;
 return new;
end $$;
create function notify_private.guard_inbox() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP<>'UPDATE' then raise exception using errcode='55000',message='immutable_notification'; end if;
 if (to_jsonb(new)-'read_at') is distinct from (to_jsonb(old)-'read_at') or old.read_at is not null
 or new.read_at is null or new.read_at>clock_timestamp() then
  raise exception using errcode='55000',message='immutable_notification'; end if;
 return new;
end $$;
create function notify_private.guard_delivery() returns trigger language plpgsql security definer set search_path='' as $$
declare caller text:=coalesce(nullif(current_setting('role',true),'none'),session_user); begin
 if TG_OP<>'UPDATE' then raise exception using errcode='55000',message='immutable_notification'; end if;
 if (to_jsonb(new)-array['status','suppress_reason','not_before','not_after','attempts','lease_until','last_error_code','vendor_ref','sent_at','updated_at','version']) is distinct from
  (to_jsonb(old)-array['status','suppress_reason','not_before','not_after','attempts','lease_until','last_error_code','vendor_ref','sent_at','updated_at','version']) then
  raise exception using errcode='55000',message='immutable_notification'; end if;
 if new.version<>old.version+1 then raise exception using errcode='40001',message='stale_version'; end if;
 if new.status<>old.status then
  if not ((old.status='queued' and new.status in ('leased','suppressed','superseded','expired'))
   or (old.status='leased' and new.status in ('sent','queued','dead'))
   or (old.status='dead' and new.status='queued' and caller='postgres')) then
   raise exception using errcode='55000',message='invalid_transition'; end if;
  insert into notify_private.delivery_transitions(delivery_id,from_status,to_status,reason,db_role)
   values(old.id,old.status,new.status,coalesce(new.suppress_reason,new.last_error_code),caller);
 end if;
 return new;
end $$;
create function notify_private.settings_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into notify_private.settings_events(old_row,new_row,db_role)
 values(to_jsonb(old),to_jsonb(new),coalesce(nullif(current_setting('role',true),'none'),session_user)); return null;
end $$;
create trigger n01_events_guard before update or delete on notify_private.events for each row execute function notify_private.guard_event();
create trigger n01_events_no_truncate before truncate on notify_private.events for each statement execute function booking_private.immutable();
create trigger n01_inbox_guard before update or delete on public.notifications for each row execute function notify_private.guard_inbox();
create trigger n01_inbox_no_truncate before truncate on public.notifications for each statement execute function booking_private.immutable();
create trigger n01_delivery_guard before update or delete on notify_private.deliveries for each row execute function notify_private.guard_delivery();
create trigger n01_delivery_no_truncate before truncate on notify_private.deliveries for each statement execute function booking_private.immutable();
create trigger n01_settings_event after update on notify_private.settings for each row execute function notify_private.settings_changed();
create trigger n01_settings_no_delete before delete on notify_private.settings for each row execute function booking_private.immutable();
create trigger n01_settings_no_truncate before truncate on notify_private.settings for each statement execute function booking_private.immutable();
do $$ declare t text; begin
 foreach t in array array['channel_consent_events','delivery_attempts','delivery_transitions','settings_events','alarms'] loop
  execute format('create trigger n01_immutable before update or delete on notify_private.%I for each row execute function booking_private.immutable()',t);
  execute format('create trigger n01_no_truncate before truncate on notify_private.%I for each statement execute function booking_private.immutable()',t);
 end loop;
 foreach t in array array['events','rules','channel_consent_events','deliveries','delivery_attempts','delivery_transitions','settings','settings_events','alarms'] loop
  execute format('alter table notify_private.%I enable row level security',t);
  execute format('revoke all on notify_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
revoke all on public.notifications,public.notification_preferences from public,anon,authenticated,service_role;
grant select on public.notifications,public.notification_preferences to authenticated;
create policy n01_inbox_recipient on public.notifications for select to authenticated
 using(recipient_profile_id=auth.uid() and identity_private.active_account());
create policy n01_prefs_self on public.notification_preferences for select to authenticated
 using(profile_id=auth.uid() and identity_private.active_account());
insert into booking_private.feature_gates(key) values('notify_inapp'),('notify_sms'),('notify_email'),('notify_whatsapp');
revoke all on all functions in schema notify_private from public,anon,authenticated,service_role;
commit;
