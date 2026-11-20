-- N01 database worker. Authored, DB NOT EXECUTED.
begin;
do $$ begin
 if to_regclass('notify_private.deliveries') is null or to_regclass('notify_private.rules') is null
 or to_regclass('public.payment_events') is null or to_regclass('public.payment_collections') is null
 or to_regprocedure('booking_private.gate_state(text)') is null
 or to_regprocedure('booking_private.person_purpose(text)') is null
 or to_regprocedure('notify_private.intake_verification()') is null then
  raise exception 'N01 worker requires core, booking/verification sources, P5 and P01a'; end if;
end $$;

-- Internal context contains only ids, closed codes, timestamps and integer money.
-- Never copies ledger reason text, contact/address snapshots or service titles.
create function notify_private.source_context(p_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e notify_private.events; b public.bookings; be public.booking_events; pe public.payment_events;
 provider uuid; actor uuid; subject uuid; code text; from_s text; to_s text; amount text; payment uuid; collection uuid; recorder uuid;
begin
 select * into strict e from notify_private.events where id=p_event;
 if e.source_kind='booking_event' then
  select * into strict be from public.booking_events where id=e.source_id and booking_id=e.booking_id;
  if not exists(select 1 from public.notification_outbox o where o.event_id=be.id and o.booking_id=be.booking_id
   and o.payload->>'event'=be.reason and o.payload->>'version'=be.aggregate_version::text
   and o.payload->>'booking_id'=be.booking_id::text) then
   raise exception using errcode='23514',message='invalid_source'; end if;
  actor:=be.actor_profile_id; code:=be.reason; from_s:=be.from_state; to_s:=be.to_state;
 elsif e.source_kind='booking_exception' then
  select x.opened_by_profile_id,x.kind into strict actor,code from public.booking_exceptions x where x.id=e.source_id and x.booking_id=e.booking_id;
 elsif e.source_kind='payment_event' then
  select * into strict pe from public.payment_events where id=e.source_id;
  payment:=pe.payment_id; collection:=pe.collection_id; actor:=pe.actor_profile_id; code:=pe.event_type;
  if not exists(select 1 from public.payments p where p.id=payment and p.booking_id=e.booking_id) then
   raise exception using errcode='23514',message='invalid_source'; end if;
  select c.collector_profile_id,c.reported_by_profile_id,c.amount_paise::text into subject,recorder,amount
   from public.payment_collections c where c.id=collection and c.payment_id=payment;
 elsif e.source_kind='provider_verification' then
  select v.provider_id,v.actor_profile_id,v.to_state into strict provider,actor,code from public.provider_verification_events v where v.id=e.source_id;
 elsif e.source_kind='staff_credential' then
  select c.provider_id,v.actor_profile_id,v.to_state,c.subject_profile_id into strict provider,actor,code,subject
   from public.staff_credential_events v join public.provider_verification_cases c on c.id=v.case_id where v.id=e.source_id;
 elsif e.source_kind='coverage_review' then
  -- C01 withdraw records to_status=revoked. Its immutable, actor/area-bound audit
  -- distinguishes withdrawal from independent revocation without inspecting or
  -- copying the reviewer's free-text reason. Audit commits in the same tx.
  select a.provider_id,v.actor_profile_id,case when v.to_status='revoked' and exists(
    select 1 from public.audit_events au where au.action='catalog.coverage.withdrawn'
     and au.target_type='provider_service_area' and au.target_id=a.id and au.actor_profile_id=v.actor_profile_id)
   then 'withdrawn' else v.to_status end into strict provider,actor,code
   from public.coverage_review_events v join public.provider_service_areas a on a.id=v.area_id where v.id=e.source_id;
 else return jsonb_build_object('ignored',true);
 end if;
 if e.booking_id is not null then
  select * into strict b from public.bookings where id=e.booking_id; provider:=b.provider_id;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('code',code,'from_state',from_s,'to_state',to_s,'actor',actor,
  'provider',provider,'subject',subject,'recorder',recorder,'payment',payment,'collection',collection,
  'patient',(select pt.self_profile_id from public.patients pt where pt.id=b.patient_id),
  'public_ref',b.public_ref,'category',b.category,'state',b.state,'start_at',b.start_at,'end_at',b.end_at,
  'amount_paise',case when code in ('collection.reported','collection.confirmed') then amount end));
end $$;

create function notify_private.members_of(p_provider uuid,p_scope text) returns setof uuid
language sql security definer set search_path='' as $$
 select x.id from public.providers p join public.profiles x on x.status='active'
 where p.id=p_provider and (p.individual_owner_profile_id=x.id or exists(
  select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
  where m.organization_id=p.organization_id and m.profile_id=x.id and m.status='active'
   and o.status='active' and p_scope=any(m.scopes)
   and case when p_scope='finance:read' then true
    when p_scope='provider:manage' then m.membership_role in ('owner','manager') and (m.membership_role='owner' or m.accepted_at is not null)
    else m.accepted_at is not null end));
$$;
create function notify_private.schedulers_of(p_provider uuid) returns setof uuid
language sql security definer set search_path='' as $$ select * from notify_private.members_of(p_provider,'schedule:manage'); $$;
create function notify_private.managers_of(p_provider uuid) returns setof uuid
language sql security definer set search_path='' as $$ select * from notify_private.members_of(p_provider,'provider:manage'); $$;
create function notify_private.capabilities_of(p_provider uuid,p_capability text) returns setof uuid
language sql security definer set search_path='' as $$
 select distinct c.profile_id from public.admin_capabilities c join public.profiles x on x.id=c.profile_id and x.status='active'
 join public.providers p on p.id=p_provider where c.capability=p_capability
 and (c.scope_key='global' or c.scope_key='org:'||p.organization_id::text)
 and c.revoked_at is null and c.valid_from<=clock_timestamp() and (c.expires_at is null or c.expires_at>clock_timestamp());
$$;
create function notify_private.assignees_of(p_booking uuid,p_at timestamptz) returns setof uuid
language sql security definer set search_path='' as $$
 select distinct a.assigned_profile_id from public.booking_assignments a join public.bookings b on b.id=a.booking_id
 join public.profiles x on x.id=a.assigned_profile_id and x.status='active'
 where b.id=p_booking and a.purpose=booking_private.person_purpose(b.category)
 and (a.status='active' or a.ended_at>=p_at)
 and a.assigned_profile_id in(select notify_private.members_of(b.provider_id,'provider:read'));
$$;

-- All resolvers take explicit ids. A cron session has no user JWT and cannot call
-- auth.uid()-based authorization predicates. AAL2 remains required when acting.
create function notify_private.audience(p_audience text,p_event uuid) returns setof uuid
language plpgsql security definer set search_path='' as $$
declare e notify_private.events; ctx jsonb; pr public.providers; b public.bookings; begin
 select * into strict e from notify_private.events where id=p_event;
 ctx:=notify_private.source_context(e.id);
 select * into pr from public.providers where id=(ctx->>'provider')::uuid;
 select * into b from public.bookings where id=e.booking_id;
 return query
 select distinct x.id from public.profiles x where x.status='active' and (
  (p_audience='patient' and x.id=(ctx->>'patient')::uuid)
  or (p_audience='schedulers' and x.id in(select notify_private.schedulers_of(pr.id)))
  or (p_audience='provider_managers' and x.id in(select notify_private.managers_of(pr.id)))
  or (p_audience='provider_finance_readers' and x.id in(select notify_private.members_of(pr.id,'finance:read')))
  or (p_audience='assignees' and x.id in(select notify_private.assignees_of(b.id,e.occurred_at)))
  or (p_audience='staff_subject' and x.id=(ctx->>'subject')::uuid)
  or (p_audience='collector' and exists(select 1 from public.payment_collections c
    where c.payment_id=(ctx->>'payment')::uuid and c.collector_profile_id=x.id
    and ((ctx->>'collection') is null or c.id=(ctx->>'collection')::uuid)))
  or (p_audience in ('verifiers','coverage_verifiers')
   and x.id in(select notify_private.capabilities_of(pr.id,case when p_audience='verifiers' then 'provider:verify' else 'coverage:verify' end))
   and pr.individual_owner_profile_id is distinct from x.id
   and not exists(select 1 from public.organization_members m where m.organization_id=pr.organization_id and m.profile_id=x.id)
   and (p_audience<>'verifiers' or not exists(select 1 from public.provider_documents d where d.provider_id=pr.id and d.owner_profile_id=x.id)))
  or (p_audience in ('ops','finance')
   and x.id in(select notify_private.capabilities_of(pr.id,case when p_audience='ops' then 'booking:incident' else 'finance:reconcile' end))
   and (p_audience<>'finance' or exists(select 1 from public.admin_capabilities c where c.profile_id=x.id and c.capability='finance:reconcile'
     and c.scope_key='global' and c.revoked_at is null and c.valid_from<=clock_timestamp() and (c.expires_at is null or c.expires_at>clock_timestamp())))
   and pr.individual_owner_profile_id is distinct from x.id and (ctx->>'patient')::uuid is distinct from x.id and b.requester_profile_id is distinct from x.id
   and not exists(select 1 from public.organization_members m where m.organization_id=pr.organization_id and m.profile_id=x.id)
   and (p_audience<>'ops' or not exists(select 1 from public.booking_assignments a where a.booking_id=b.id and a.assigned_profile_id=x.id))
   and (p_audience<>'finance' or ((ctx->>'subject')::uuid is distinct from x.id and (ctx->>'recorder')::uuid is distinct from x.id
     and not exists(select 1 from public.patient_access pa where pa.patient_id=b.patient_id and pa.grantee_profile_id=x.id)))));
end $$;

create function notify_worker.expand(p_limit integer) returns integer
language plpgsql security definer set search_path='' as $$
declare e notify_private.events; r notify_private.rules; s notify_private.settings; ctx jsonb; who uuid; ch text; loc text;
 actor uuid; total integer:=0; matched boolean; capped boolean; deadline timestamptz; par jsonb; collapse text;
begin
 if p_limit is null or p_limit not between 1 and 500 then raise exception using errcode='22023',message='invalid_input'; end if;
 -- One expander per database avoids acquiring several recipient/collapse locks
 -- in inconsistent audience order. SKIP LOCKED still isolates event ownership.
 if not pg_try_advisory_xact_lock(hashtextextended('n01:expand',0)) then return 0; end if;
 select * into strict s from notify_private.settings;
 for e in select * from notify_private.events where status in ('pending','failed') and attempts<5 order by created_at,id limit p_limit for update skip locked loop
  total:=total+1;
  begin
   if booking_private.gate_state('notify_inapp')<>'on' then
    update notify_private.events set status='skipped',skip_reason='gate_off',expanded_at=clock_timestamp() where id=e.id; continue;
   end if;
   if e.occurred_at<clock_timestamp()-make_interval(mins=>s.max_event_age_minutes) then
    update notify_private.events set status='skipped',skip_reason='stale',expanded_at=clock_timestamp() where id=e.id; continue;
   end if;
   ctx:=notify_private.source_context(e.id); actor:=(ctx->>'actor')::uuid; matched:=false; capped:=false;
   -- Deliberate non-notifications, rather than defects in the rule catalogue.
   if (e.source_kind='booking_event' and ctx->>'code' in ('accepted','reassigned'))
    or (e.source_kind='payment_event' and ctx->>'code' not in ('collection.reported','collection.confirmed','collection.disputed','payment.disputed','payment.resolved','exception.raised','obligation.voided'))
    or (e.source_kind='coverage_review' and ctx->>'code'='withdrawn')
    or (e.source_kind='staff_credential' and ctx->>'code'='draft') then matched:=true; end if;
   for r in select * from notify_private.rules where source_kind=e.source_kind and match_code=ctx->>'code'
    and (match_from_state is null or match_from_state=ctx->>'from_state') and (match_to_state is null or match_to_state=ctx->>'to_state')
    and (match_categories is null or ctx->>'category'=any(match_categories))
    and (match_actor is null or (match_actor='patient' and actor=(ctx->>'patient')::uuid)
     or (match_actor='not_patient' and actor is distinct from (ctx->>'patient')::uuid)) order by id loop
    matched:=true;
    if (select count(*) from notify_private.audience(r.audience,e.id) x where x is distinct from actor)>s.max_audience then capped:=true; end if;
    for who in select x from notify_private.audience(r.audience,e.id) x where x is distinct from actor order by x limit s.max_audience loop
     par:=jsonb_strip_nulls(jsonb_build_object('public_ref',ctx->>'public_ref','category',ctx->>'category',
      'state',coalesce(ctx->>'to_state',ctx->>'state'),'reason',case when e.source_kind='booking_event' then ctx->>'code' end,'start_at',ctx->>'start_at',
      'amount_paise',case when r.id in ('Y01','Y02') then ctx->>'amount_paise' end,
      'emergency_notice',case when r.emergency_notice then true end));
     insert into public.notifications(recipient_profile_id,event_id,rule_id,template_key,template_version,priority,booking_id,params)
     values(who,e.id,r.id,r.inapp_key,1,r.priority,e.booking_id,par) on conflict(event_id,recipient_profile_id,template_key) do nothing;
     if r.ext_key is null then continue; end if;
     deadline:=case r.ttl when 'until_start' then (ctx->>'start_at')::timestamptz when 'until_end' then (ctx->>'end_at')::timestamptz
      when 'arrival' then least(e.occurred_at+make_interval(mins=>s.arrival_ttl_minutes),(ctx->>'end_at')::timestamptz) else e.occurred_at+interval '24 hours' end;
     select locale into loc from public.profiles where id=who;
     foreach ch in array array['sms','email','whatsapp'] loop
      if booking_private.gate_state('notify_'||ch)='off' or (r.topic='verification' and ch<>'email') then continue; end if;
      collapse:=case when r.priority<>'safety' and e.booking_id is not null then who::text||':'||ch||':'||e.booking_id::text end;
      -- Serialize same-recipient enqueue so concurrent expand calls also collapse.
      perform pg_advisory_xact_lock(hashtextextended('n01:recipient:'||who::text,0));
      insert into notify_private.deliveries(event_id,rule_id,recipient_profile_id,booking_id,channel,template_key,template_version,locale,priority,topic,dedupe_key,collapse_key,not_before,not_after)
      values(e.id,r.id,who,e.booking_id,ch,r.ext_key,1,loc,r.priority,r.topic,e.id::text||':'||who::text||':'||ch||':'||r.ext_key||':1',collapse,clock_timestamp(),deadline)
      on conflict(dedupe_key) do nothing;
      if collapse is not null then
       update notify_private.deliveries d set status='superseded',version=version+1,updated_at=clock_timestamp()
       where d.collapse_key=collapse and d.status='queued' and d.event_id<>e.id
        and exists(select 1 from notify_private.events prev
         join public.booking_events old_source on old_source.id=prev.source_id
         join public.booking_events new_source on new_source.id=e.source_id
         where prev.id=d.event_id and old_source.aggregate_version<new_source.aggregate_version);
       -- An older event expanded late cannot supersede a newer queued update.
       update notify_private.deliveries d set status='superseded',version=version+1,updated_at=clock_timestamp()
       where d.collapse_key=collapse and d.status='queued' and d.event_id=e.id
        and exists(select 1 from notify_private.deliveries newer join notify_private.events ne on ne.id=newer.event_id
         join public.booking_events newer_source on newer_source.id=ne.source_id
         join public.booking_events this_source on this_source.id=e.source_id
         where newer.collapse_key=collapse and newer.status='queued' and newer_source.aggregate_version>this_source.aggregate_version);
      end if;
     end loop;
    end loop;
   end loop;
   update notify_private.events set status=case when matched then 'expanded' else 'skipped' end,
    skip_reason=case when not matched then 'unmatched_rule' end,error_code=case when capped then 'audience_capped' end,expanded_at=clock_timestamp() where id=e.id;
  exception when others then
   update notify_private.events set attempts=e.attempts+1,status=case when e.attempts+1>=5 then 'dead' else 'failed' end,
    skip_reason=null,error_code=SQLSTATE where id=e.id;
  end;
 end loop;
 return total;
end $$;

-- Deterministic private clock helper for quiet-hours boundary tests. API callers
-- can neither execute this helper nor supply a clock to claim/complete/sweep.
create function notify_private.quiet_until(p_at timestamptz,p_start time,p_end time,p_tz text) returns timestamptz
language sql immutable security definer set search_path='' as $$
 select case
  when p_start=p_end then null
  when p_start<p_end and (p_at at time zone p_tz)::time>=p_start and (p_at at time zone p_tz)::time<p_end
   then (((p_at at time zone p_tz)::date+p_end) at time zone p_tz)
  when p_start>p_end and (p_at at time zone p_tz)::time>=p_start
   then ((((p_at at time zone p_tz)::date+1)+p_end) at time zone p_tz)
  when p_start>p_end and (p_at at time zone p_tz)::time<p_end
   then (((p_at at time zone p_tz)::date+p_end) at time zone p_tz)
 end;
$$;

create function notify_worker.claim(p_channel text,p_limit integer) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare d notify_private.deliveries; r notify_private.rules; s notify_private.settings; ctx jsonb; dest text; why text; granted boolean;
 t timestamptz; quiet timestamptz; cap integer; n integer:=0;
begin
 if p_channel is null or p_channel not in ('sms','email','whatsapp') or p_limit is null or p_limit not between 1 and 100 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if booking_private.gate_state('notify_'||p_channel)<>'on' then return; end if;
 -- Serializes channel budget reservations across workers. Leased rows count as
 -- reserved sends, otherwise two concurrent claims can exceed an owner's cap.
 perform pg_advisory_xact_lock(hashtextextended('n01:channel:'||p_channel,0));
 select * into strict s from notify_private.settings;
 cap:=case p_channel when 'sms' then s.daily_cap_sms when 'email' then s.daily_cap_email else s.daily_cap_whatsapp end;
 for d in select * from notify_private.deliveries where channel=p_channel and status='queued' and not_before<=clock_timestamp() and not_after>clock_timestamp()
  order by case priority when 'safety' then 0 when 'transactional' then 1 else 2 end,created_at,id limit p_limit for update skip locked loop
  exit when n>=p_limit;
  if booking_private.gate_state('notify_'||p_channel)<>'on' then return; end if;
  t:=clock_timestamp(); why:=null; dest:=null;
  select * into strict r from notify_private.rules where id=d.rule_id;
  ctx:=notify_private.source_context(d.event_id);
  if not exists(select 1 from public.profiles where id=d.recipient_profile_id and status='active')
   or (r.audience in ('schedulers','assignees','provider_managers','provider_finance_readers','ops','finance','verifiers','coverage_verifiers')
    and not exists(select 1 from notify_private.audience(r.audience,d.event_id) x where x=d.recipient_profile_id)) then why:='recipient_ineligible';
  elsif d.priority<>'safety' and ((r.id like 'B09-%' or r.id like 'B10-%') and ctx->>'state'<>'confirmed'
    or r.id like 'B01-%' and ctx->>'state'<>'requested') then why:='booking_moved_on';
  end if;
  if why is null then
   select case when p_channel='email' and u.email_confirmed_at is not null then nullif(u.email,'')
    when p_channel in ('sms','whatsapp') and u.phone_confirmed_at is not null then nullif(u.phone,'') end into dest
   from auth.users u where u.id=d.recipient_profile_id;
   if dest is null then why:='no_destination'; end if;
  end if;
  if why is null then
   select c.decision='granted' into granted from notify_private.channel_consent_events c
    where c.profile_id=d.recipient_profile_id and c.channel=p_channel and c.topic=d.topic order by c.occurred_at desc,c.id desc limit 1;
   if (d.priority<>'safety' or p_channel='whatsapp') and not coalesce(granted,false) then why:='consent_missing';
   elsif d.priority<>'safety' and not coalesce((select enabled from public.notification_preferences
    where profile_id=d.recipient_profile_id and channel=p_channel and topic=d.topic),false) then why:='preference_off'; end if;
  end if;
  if why is null and d.priority<>'safety' and not r.quiet_exempt then
   quiet:=notify_private.quiet_until(t,s.quiet_start,s.quiet_end,s.quiet_tz);
   if quiet is not null then
    update notify_private.deliveries set not_before=quiet,version=version+1,updated_at=t where id=d.id; continue;
   end if;
  end if;
  if why is null and d.priority<>'safety' then
   if (select count(*) from notify_private.deliveries x where x.recipient_profile_id=d.recipient_profile_id and x.channel=p_channel and x.priority<>'safety'
    and ((x.status='sent' and x.sent_at>t-interval '1 hour') or x.status='leased'))>=s.per_recipient_hour
    or (select count(*) from notify_private.deliveries x where x.recipient_profile_id=d.recipient_profile_id and x.channel=p_channel and x.priority<>'safety'
    and ((x.status='sent' and x.sent_at>t-interval '1 day') or x.status='leased'))>=s.per_recipient_day then why:='rate_limited';
   elsif (select count(*) from notify_private.deliveries x where x.channel=p_channel and x.priority<>'safety'
    and ((x.status='sent' and x.sent_at>=date_trunc('day',t at time zone s.quiet_tz) at time zone s.quiet_tz) or x.status='leased'))>=cap then why:='global_cap'; end if;
  end if;
  if why is not null then
   update notify_private.deliveries set status='suppressed',suppress_reason=why,version=version+1,updated_at=t where id=d.id;
   if d.priority='safety' then insert into notify_private.alarms(delivery_id,code) values(d.id,'safety_undelivered') on conflict do nothing; end if;
   continue;
  end if;
  if d.priority='safety' and (select count(*) from notify_private.deliveries x where x.recipient_profile_id=d.recipient_profile_id
   and x.priority='safety' and ((x.status='sent' and x.sent_at>t-interval '1 day') or x.status='leased'))>=s.safety_alarm_per_day then
   insert into notify_private.alarms(delivery_id,code) values(d.id,'safety_volume') on conflict do nothing;
  end if;
  if d.attempts>=s.max_attempts then
   -- Normally sweep/complete already made this dead. A reviewed owner requeue
   -- must raise max_attempts (up to 20), preserving attempt-number history.
   continue;
  end if;
  update notify_private.deliveries set status='leased',lease_until=t+make_interval(secs=>s.lease_seconds),attempts=attempts+1,version=version+1,updated_at=t where id=d.id;
  n:=n+1;
  return next jsonb_build_object('delivery_id',d.id,'attempt_no',d.attempts+1,'channel',p_channel,'locale',d.locale,
   'template_key',d.template_key,'template_version',d.template_version,'params',jsonb_strip_nulls(jsonb_build_object('public_ref',ctx->>'public_ref','locale',d.locale)),'destination',dest);
 end loop;
end $$;

create function notify_worker.complete(p_delivery_id uuid,p_attempt_no integer,p_outcome text,p_error_code text,p_vendor_ref text) returns void
language plpgsql security definer set search_path='' as $$
declare d notify_private.deliveries; s notify_private.settings; t timestamptz:=clock_timestamp(); ch_topic text; begin
 select * into d from notify_private.deliveries where id=p_delivery_id for update;
 if not found or p_attempt_no is null or d.status<>'leased' or d.attempts<>p_attempt_no or d.lease_until<=clock_timestamp() then
  raise exception using errcode='40001',message='stale_lease'; end if;
 if p_outcome is null or p_outcome not in ('accepted','retryable','permanent')
  or (p_outcome='accepted' and (p_error_code is not null or p_vendor_ref is null or char_length(p_vendor_ref) not between 1 and 128
   or p_vendor_ref<>'log:'||d.id::text))
  or (p_outcome='retryable' and (p_error_code is null or p_error_code not in ('timeout','network','vendor_throttled','vendor_5xx','config_error')))
  or (p_outcome='permanent' and (p_error_code is null or p_error_code not in ('invalid_destination','template_rejected','destination_opted_out','content_rejected')))
  or (p_outcome<>'accepted' and p_vendor_ref is not null) then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into strict s from notify_private.settings;
 insert into notify_private.delivery_attempts(delivery_id,attempt_no,started_at,finished_at,outcome,error_code)
 values(d.id,d.attempts,d.updated_at,t,p_outcome,p_error_code);
 update notify_private.deliveries set status=case when p_outcome='accepted' then 'sent' when p_outcome='permanent' or attempts>=s.max_attempts then 'dead' else 'queued' end,
  lease_until=null,sent_at=case when p_outcome='accepted' then t end,vendor_ref=case when p_outcome='accepted' then p_vendor_ref end,last_error_code=p_error_code,
  not_before=case when p_outcome='retryable' then t+make_interval(secs=>least(s.backoff_cap_seconds::double precision,s.backoff_base_seconds*power(2::double precision,d.attempts-1))*(1+random()*0.2)) else not_before end,
  version=version+1,updated_at=t where id=d.id;
 if p_error_code='destination_opted_out' then
  -- Same recipient lock as the public preference command prevents projection /
  -- consent inversion when a vendor opt-out races a settings change.
  perform pg_advisory_xact_lock(hashtextextended('n01:preference:'||d.recipient_profile_id::text,0));
  foreach ch_topic in array array['booking','payment','verification'] loop
   insert into notify_private.channel_consent_events(profile_id,channel,topic,decision,notice_version,source)
    values(d.recipient_profile_id,d.channel,ch_topic,'withdrawn','vendor-opt-out-v1','vendor_opt_out');
   insert into public.notification_preferences(profile_id,channel,topic,enabled) values(d.recipient_profile_id,d.channel,ch_topic,false)
    on conflict(profile_id,channel,topic) do update set enabled=false,version=public.notification_preferences.version+1,updated_at=clock_timestamp();
  end loop;
 end if;
 if d.priority='safety' and (p_outcome='permanent' or (p_outcome='retryable' and d.attempts>=s.max_attempts)) then
  insert into notify_private.alarms(delivery_id,code) values(d.id,'safety_undelivered') on conflict do nothing;
 end if;
end $$;

create function notify_worker.sweep() returns integer language plpgsql security definer set search_path='' as $$
declare d notify_private.deliveries; s notify_private.settings; n integer:=0; t timestamptz:=clock_timestamp(); begin
 select * into strict s from notify_private.settings;
 for d in select * from notify_private.deliveries where (status='leased' and lease_until<t) or (status='queued' and not_after<=t) order by id for update skip locked loop
  if d.status='leased' then
   insert into notify_private.delivery_attempts(delivery_id,attempt_no,started_at,finished_at,outcome)
    values(d.id,d.attempts,d.updated_at,t,'lease_expired');
  end if;
  update notify_private.deliveries set status=case when d.status='queued' then 'expired' when attempts>=s.max_attempts then 'dead' else 'queued' end,
   lease_until=null,not_before=t,version=version+1,updated_at=t where id=d.id;
  if d.priority='safety' and (d.status='queued' or d.attempts>=s.max_attempts) then
   insert into notify_private.alarms(delivery_id,code) values(d.id,'safety_undelivered') on conflict do nothing;
  end if;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on all functions in schema notify_private,notify_worker from public,anon,authenticated,service_role;
grant execute on function notify_worker.claim(text,integer),notify_worker.complete(uuid,integer,text,text,text) to service_role;
-- M15 guard: pg_cron is installed/scheduled only in its configured database.
do $$ begin
 if current_database()=coalesce(current_setting('cron.database_name',true),'postgres') then
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('n01-expand','* * * * *','select notify_worker.expand(100)');
  perform cron.schedule('n01-sweep','* * * * *','select notify_worker.sweep()');
 else raise notice 'N01 pg_cron jobs not scheduled in database %',current_database(); end if;
end $$;
commit;
