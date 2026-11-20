-- Synthetic N01 fixture; Authored, DB NOT EXECUTED.
-- Extends both shared fixtures without editing them. Caller begins a transaction.
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
reset role;
-- P5's fixture enables all registered gates. N01 resets its channels explicitly.
update booking_private.feature_gates set state='off' where key like 'notify_%';
select notify_worker.expand(500);
update booking_private.feature_gates set state='on' where key='notify_inapp';
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes)
values('c8000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000009','manager','active',now(),array['provider:read','provider:manage','schedule:manage']);
update public.organization_members set scopes=scopes||array['finance:read']
where profile_id='c1000000-0000-4000-8000-000000000001';
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
('c1000000-0000-4000-8000-000000000004','coverage:verify','global','b1000000-0000-4000-8000-000000000004'),
('c1000000-0000-4000-8000-000000000006','security:audit','global','b1000000-0000-4000-8000-000000000004'),
('c1000000-0000-4000-8000-000000000006','finance:reconcile','global','b1000000-0000-4000-8000-000000000004');
update auth.users set email_confirmed_at=clock_timestamp() where id in
 ('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001');
update auth.users set phone='19999990001',phone_confirmed_at=clock_timestamp() where id='b1000000-0000-4000-8000-000000000001';
update auth.users set phone='19999990002',phone_confirmed_at=null where id='c1000000-0000-4000-8000-000000000001';

-- Registry additions are only test fixtures, standing in for pending categories.
insert into booking_private.reason_codes(code)
select x from unnest(array['address_not_found','declined_at_door','doctor_unable','patient_requested_stop',
 'collection_started','sample_collected','sample_handed_over','collection_failed','handoff_failed',
 'picked_up','destination_reached','eligibility_blocked','vehicle_breakdown','requirement_mismatch','driver_unable']) x on conflict do nothing;
insert into booking_private.category_reasons(category,code,blocks_cancel)
select c,r,r in ('collection_started','picked_up') from (values
 ('doctor','address_not_found'),('doctor','declined_at_door'),('doctor','doctor_unable'),('doctor','patient_requested_stop'),
 ('lab','collection_started'),('lab','sample_collected'),('lab','sample_handed_over'),('lab','collection_failed'),('lab','handoff_failed'),
 ('ambulance','picked_up'),('ambulance','destination_reached'),('ambulance','eligibility_blocked'),('ambulance','vehicle_breakdown'),
 ('ambulance','requirement_mismatch'),('ambulance','driver_unable')) x(c,r) on conflict do nothing;
select notify_private.seed_booking_rules();

create function pg_temp.n01_event(cat text,code text,from_s text,to_s text,
 actor uuid default 'c1000000-0000-4000-8000-000000000001',at_time timestamptz default clock_timestamp()) returns uuid language plpgsql as $$
declare b uuid; ev uuid; intake uuid; v integer; begin
 b:=pg_temp.p5_raw(cat,to_s,clock_timestamp()+interval '1 hour','c1000000-0000-4000-8000-000000000002');
 select version+1 into v from public.bookings where id=b;
 insert into public.booking_events(booking_id,actor_profile_id,from_state,to_state,aggregate_version,reason,occurred_at)
 values(b,actor,from_s,to_s,v,code,at_time) returning id into ev;
 insert into public.notification_outbox(booking_id,event_id,payload,created_at)
 values(b,ev,jsonb_build_object('booking_id',b,'event',code,'version',v),at_time);
 select id into intake from notify_private.events where source_kind='booking_event' and source_id=ev;
 return intake;
end $$;
create function pg_temp.n01_delivery(pri text default 'transactional',ch text default 'sms',code text default 'en_route') returns uuid language plpgsql as $$
declare e uuid; d uuid; begin
 update booking_private.feature_gates set state='on' where key='notify_'||ch;
 e:=pg_temp.n01_event('doctor',code,case when pri='safety' then 'confirmed' else 'confirmed' end,
  case when pri='safety' then 'interrupted' else 'confirmed' end);
 perform notify_worker.expand(500);
 select id into strict d from notify_private.deliveries where event_id=e and channel=ch and recipient_profile_id='b1000000-0000-4000-8000-000000000001';
 return d;
end $$;
create function pg_temp.n01_optin(ch text default 'sms',enabled_value boolean default true) returns void language plpgsql as $$
begin
 insert into public.notification_preferences(profile_id,channel,topic,enabled)
 values('b1000000-0000-4000-8000-000000000001',ch,'booking',enabled_value)
 on conflict(profile_id,channel,topic) do update set enabled=excluded.enabled,version=public.notification_preferences.version+1;
 insert into notify_private.channel_consent_events(profile_id,channel,topic,decision,notice_version,source)
 values('b1000000-0000-4000-8000-000000000001',ch,'booking','granted','fixture-v1','settings');
end $$;
create function pg_temp.n01_no_quiet() returns void language sql as $$
 update notify_private.settings set quiet_start='08:00',quiet_end='08:00',daily_cap_sms=1000,daily_cap_email=1000,daily_cap_whatsapp=1000; $$;
