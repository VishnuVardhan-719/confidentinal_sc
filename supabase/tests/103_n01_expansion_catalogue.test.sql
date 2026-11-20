\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
-- 75 known category/reason pairs: 26 terminal/actor/audience rows each,
-- 46 milestone rows; five X, seventeen V and nine Y rows.
select pg_temp.assert_true((select count(*)=2027 from notify_private.rules),'complete concrete rule/audience catalogue');
-- Authored, DB NOT EXECUTED. Independent golden recipients for booking audiences.
create function pg_temp.n01_expected(a text) returns uuid[] language sql as $$
 select case a when 'patient' then array['b1000000-0000-4000-8000-000000000001']::uuid[]
 when 'assignees' then array['c1000000-0000-4000-8000-000000000002']::uuid[]
 when 'ops' then array['c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000006']::uuid[]
 else array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000009']::uuid[] end; $$;
do $$ declare r notify_private.rules; e uuid; expected uuid[]; actual uuid[]; actor uuid; before_n integer; expected_key text; expected_priority text; expected_state text; begin
 -- Each concrete (rule, code, category, audience) row is exercised, including
 -- B14/B15's whole closed interruption set and the guarded category reasons.
 for r in select * from notify_private.rules where source_kind='booking_event' order by id loop
  -- Literal catalogue oracle: never derive expected copy/priority/state from
  -- the columns that expansion itself reads.
  expected_key:=case left(r.id,3)
   when 'B01' then 'booking.request_received'
   when 'B03' then case when r.audience='patient' then 'booking.confirmed' else 'booking.assigned' end
   when 'B04' then 'booking.declined' when 'B05' then 'booking.cancelled_by_patient'
   when 'B06' then case when r.audience='patient' then 'booking.cancelled_by_provider' else 'booking.cancelled' end
   when 'B07' then case when r.audience='patient' then 'booking.cancelled_confirmed' else 'booking.cancelled' end
   when 'B08' then 'booking.expired' when 'B09' then 'visit.en_route' when 'B10' then 'visit.arrived'
   when 'B11' then 'visit.started' when 'B12' then 'visit.sample_collected' when 'B13' then 'visit.completed'
   when 'B14' then case when r.audience='patient' then 'visit.ended_early' else 'visit.interrupted_staff' end
   when 'B15' then case when r.audience='patient' then 'visit.interrupted' else 'visit.interrupted_staff' end
   when 'B16' then case when r.audience='patient' then 'visit.absence_reported' else 'visit.absence_reported_staff' end
   when 'B17' then 'visit.no_show' when 'B18' then case when r.audience='patient' then 'trip.problem' else 'trip.blocked_staff' end end;
  expected_priority:=case when left(r.id,3) in ('B07','B15') and r.audience='patient' then 'safety'
   when left(r.id,3) in ('B11','B12','B13') or (left(r.id,3)='B08' and r.audience='schedulers') then 'routine' else 'transactional' end;
  expected_state:=case left(r.id,3) when 'B01' then 'requested' when 'B04' then 'declined'
   when 'B05' then 'cancelled' when 'B06' then 'cancelled' when 'B07' then 'cancelled' when 'B08' then 'expired'
   when 'B11' then 'in_progress' when 'B12' then 'in_progress' when 'B13' then 'completed'
   when 'B14' then 'interrupted' when 'B15' then 'interrupted' when 'B17' then 'no_show' else 'confirmed' end;
  perform pg_temp.assert_true(r.inapp_key=expected_key and r.priority=expected_priority and r.match_to_state=expected_state,'literal booking catalogue '||r.id);
  perform pg_temp.assert_true(r.quiet_exempt=(left(r.id,3) in ('B09','B10','B18')),'literal quiet exemption '||r.id);
  actor:=case when r.match_actor='patient' then 'b1000000-0000-4000-8000-000000000001'::uuid else 'c1000000-0000-4000-8000-000000000001'::uuid end;
  e:=pg_temp.n01_event(r.match_categories[1],r.match_code,coalesce(r.match_from_state,'confirmed'),r.match_to_state,actor);
  perform notify_worker.expand(500);
  select array_agg(x order by x) into expected from unnest(pg_temp.n01_expected(r.audience)) x where x<>actor;
  select array_agg(recipient_profile_id order by recipient_profile_id) into actual from public.notifications where event_id=e and template_key=r.inapp_key;
  -- S and A share some templates; union their golden audiences for these rows.
  if r.inapp_key in ('booking.cancelled_by_patient','booking.cancelled','visit.interrupted_staff') then
   select array_agg(x order by x) into expected from unnest(array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000009']::uuid[]) x where x<>actor;
  end if;
  if r.inapp_key in ('booking.expired','visit.completed','visit.no_show') then
   select array_agg(x order by x) into expected from unnest(array['b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000009']::uuid[]) x where x<>actor;
  end if;
  if r.inapp_key='visit.absence_reported_staff' then
   select array_agg(x order by x) into expected from unnest(array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000006','c1000000-0000-4000-8000-000000000009']::uuid[]) x where x<>actor;
  end if;
  perform pg_temp.assert_true(actual is not distinct from expected,'golden recipients '||r.id);
  perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=e and rule_id=r.id and priority<>expected_priority),'priority '||r.id);
  perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=e and recipient_profile_id=actor),'actor removed '||r.id);
 end loop;
 e:=pg_temp.n01_event('doctor','accepted','requested','accepted'); perform notify_worker.expand(500);
 perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=e),'accepted intentionally silent');
 -- Unknown matching combination, known reason: B20 must expose catalogue drift.
 e:=pg_temp.n01_event('doctor','other','confirmed','confirmed'); perform notify_worker.expand(500);
 perform pg_temp.assert_true((select status='skipped' and skip_reason='unmatched_rule' from notify_private.events where id=e),'unmatched flagged');
 e:=pg_temp.n01_event('doctor','confirmed','accepted','confirmed');
 update booking_private.feature_gates set state='off' where key='notify_inapp'; perform notify_worker.expand(500);
 perform pg_temp.assert_true((select skip_reason='gate_off' from notify_private.events where id=e),'gate off');
 update booking_private.feature_gates set state='on' where key='notify_inapp';
 e:=pg_temp.n01_event('doctor','confirmed','accepted','confirmed','c1000000-0000-4000-8000-000000000001',clock_timestamp()-interval '2 days'); perform notify_worker.expand(500);
 perform pg_temp.assert_true((select skip_reason='stale' from notify_private.events where id=e),'stale');
 select count(*) into before_n from public.notifications; perform notify_worker.expand(500);
 perform pg_temp.assert_true((select count(*) from public.notifications)=before_n,'repeat expand deduplicates');
end $$;
-- Empty audience expands successfully. Actor removal is applied before the cap.
update public.organization_members set status='disabled' where organization_id='c8000000-0000-4000-8000-000000000001';
select pg_temp.n01_event('doctor','requested','draft','requested') as nobody \gset
select notify_worker.expand(500);
select pg_temp.assert_true((select status='expanded' from notify_private.events where id=:'nobody'),'empty audience expanded');
select pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=:'nobody'),'empty audience has no inbox rows');
update public.organization_members set status='active' where organization_id='c8000000-0000-4000-8000-000000000001';
-- An individual owner is both scheduler and assignee: shared template dedupes.
do $$ declare b uuid; src uuid; e uuid; begin
 b:=pg_temp.p5_raw('doctor','cancelled',clock_timestamp()+interval '1 hour','b1000000-0000-4000-8000-000000000002',null,'b4100000-0000-4000-8000-000000000001');
 insert into public.booking_events(booking_id,actor_profile_id,from_state,to_state,aggregate_version,reason)
 values(b,'b1000000-0000-4000-8000-000000000001','confirmed','cancelled',3,'patient_request') returning id into src;
 insert into public.notification_outbox(booking_id,event_id,payload) values(b,src,jsonb_build_object('booking_id',b,'event','patient_request','version',3));
 select id into e from notify_private.events where source_kind='booking_event' and source_id=src;
 perform notify_worker.expand(500);
 perform pg_temp.assert_true((select count(*)=1 from public.notifications where event_id=e and recipient_profile_id='b1000000-0000-4000-8000-000000000002'),'scheduler/assignee owner deduped');
end $$;
insert into booking_private.category_reasons(category,code) values('doctor','reassigned');
select pg_temp.n01_event('doctor','reassigned','confirmed','confirmed') as reassigned \gset
select notify_worker.expand(500);
select pg_temp.assert_true((select status='expanded' from notify_private.events where id=:'reassigned'),'reassigned intentionally silent');
select pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=:'reassigned'),'reassigned no rows');
-- Verification catalogue and exception audiences have independent literal oracles.
do $$ declare r notify_private.rules; src uuid; e uuid; subj_case uuid; area uuid; b uuid; n integer; actual uuid[]; expected uuid[]; actor uuid; kind_code text; expected_key text; expected_ext text; begin
 select id into subj_case from public.provider_verification_cases where provider_id=pg_temp.p5_provider('lab') and subject_profile_id='c1000000-0000-4000-8000-000000000002';
 select id into area from public.provider_service_areas where provider_id=pg_temp.p5_provider('lab');
 for r in select * from notify_private.rules where source_kind in ('provider_verification','staff_credential','coverage_review') order by id loop
  expected_key:=case left(r.id,3) when 'V01' then 'verification.provider_submitted' when 'V02' then 'verification.under_review'
   when 'V03' then 'verification.approved' when 'V04' then 'verification.rejected' when 'V05' then 'verification.suspended'
   when 'V06' then 'verification.expired' when 'V07' then 'verification.staff_submitted' when 'V08' then 'verification.staff_'||r.match_code
   when 'V09' then 'verification.coverage_proposed' when 'V10' then 'verification.coverage_'||r.match_code end;
  expected_ext:=case when r.audience='provider_managers' and r.match_code in ('approved','rejected','suspended','expired') then 'ext.account_update' end;
  perform pg_temp.assert_true(r.inapp_key=expected_key and r.priority=case when r.id='V02' then 'routine' else 'transactional' end
   and r.ext_key is not distinct from expected_ext,'literal verification catalogue '||r.id);
  actor:=case when r.match_code in ('submitted','proposed') then 'c1000000-0000-4000-8000-000000000001'::uuid
   when r.match_code='expired' then null else 'c1000000-0000-4000-8000-000000000004'::uuid end;
  if r.source_kind='provider_verification' then
   insert into public.provider_verification_events(provider_id,actor_profile_id,from_state,to_state,reason,public_reason,provider_version)
   values(pg_temp.p5_provider('lab'),actor,case when r.match_code='expired' then 'approved' else 'submitted' end,r.match_code,'Synthetic secret reason','Synthetic public reason',1) returning id into src;
  elsif r.source_kind='staff_credential' then
   select max(aggregate_version)+1 into n from public.staff_credential_events where case_id=subj_case;
   insert into public.staff_credential_events(case_id,actor_profile_id,to_state,reason,aggregate_version)
   values(subj_case,actor,r.match_code,'Synthetic secret reason',n) returning id into src;
  else
   insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
   values(area,actor,'proposed',r.match_code,'Synthetic secret reason',1) returning id into src;
  end if;
  select id into e from notify_private.events where source_kind=r.source_kind and source_id=src;
  perform notify_worker.expand(500);
  expected:=case when r.audience in ('verifiers','coverage_verifiers') then array['c1000000-0000-4000-8000-000000000004']::uuid[]
   when r.source_kind='staff_credential' and r.match_code<>'submitted' then array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000009']::uuid[]
   else array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000009']::uuid[] end;
  select array_agg(recipient_profile_id order by recipient_profile_id) into actual from public.notifications where event_id=e and template_key=r.inapp_key;
  perform pg_temp.assert_true(actual=expected,'verification recipients/key '||r.id);
 end loop;
 for kind_code in select code from booking_private.exception_kinds loop
  b:=pg_temp.p5_raw('ambulance','confirmed',clock_timestamp()+interval '1 hour');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
  src:=booking_private.open_exception(b,kind_code,'unsafe_conditions');
  select id into e from notify_private.events where source_kind='booking_exception' and source_id=src;
  perform notify_worker.expand(500);
  select array_agg(recipient_profile_id order by recipient_profile_id) into actual from public.notifications where event_id=e and template_key='ops.exception_opened';
  perform pg_temp.assert_true(actual=array['c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000006']::uuid[],'exception audience '||kind_code);
  perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=e and priority<>case when kind_code='interrupted_after_pickup' then 'safety' else 'transactional' end),'exception priority '||kind_code);
 end loop;
end $$;
update notify_private.settings set max_audience=1;
select pg_temp.n01_event('doctor','requested','draft','requested','b1000000-0000-4000-8000-000000000001') as capped \gset
select notify_worker.expand(500);
select pg_temp.assert_true((select error_code='audience_capped' from notify_private.events where id=:'capped'),'audience cap exposed');
select pg_temp.assert_true((select count(*)=1 from public.notifications where event_id=:'capped'),'audience cap enforced');
update notify_private.settings set max_audience=50;
-- One inconsistent source fails inside its savepoint while another expands.
select pg_temp.n01_event('doctor','confirmed','accepted','confirmed') as bad \gset
select pg_temp.n01_event('doctor','en_route','confirmed','confirmed') as good \gset
-- Do not depend on the B01 trigger's name: source mismatch is instead built by
-- inserting a separate event with no corresponding outbox (owner fixture).
insert into notify_private.events(source_kind,source_id,booking_id,occurred_at)
select 'booking_event',gen_random_uuid(),booking_id,clock_timestamp() from notify_private.events where id=:'bad';
select notify_worker.expand(500);
select pg_temp.assert_true(exists(select 1 from notify_private.events where status='failed' and error_code='P0002'),'one failed source retained');
select pg_temp.assert_true((select status='expanded' from notify_private.events where id=:'good'),'batch continued');
select pg_temp.assert_true(not exists(select 1 from public.notifications where params::text ~ 'Synthetic|1999999|599991|free-text|exact address'),'inbox PII scan');
select pg_temp.assert_true(not exists(select 1 from information_schema.columns where table_schema='notify_private' and table_name='deliveries' and column_name in ('destination','body','payload','params')),'delivery PII scan surface');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 103_n01_expansion_catalogue
rollback;
