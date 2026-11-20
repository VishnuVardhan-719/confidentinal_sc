\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
-- Exercise the actual built commands as well as closed-ledger source fixtures.
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by)
values('c1000000-0000-4000-8000-000000000004','provider:suspend','global','b1000000-0000-4000-8000-000000000004');
create function pg_temp.n01_provider_document(prov uuid) returns void language plpgsql as $$
declare d jsonb; v integer; begin
 select version into v from public.providers where id=prov;
 d:=public.add_provider_document(prov,'registration','application/pdf',now()+interval '1 year',v);
 insert into storage.objects(bucket_id,name) values(d->'document'->>'bucket_id',d->'document'->>'object_name');
end $$;
do $$ declare staff_case uuid; d jsonb; v integer; begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 staff_case:=public.add_staff_credential_case(pg_temp.p5_provider('lab'),'c1000000-0000-4000-8000-000000000009');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
 d:=public.add_staff_credential_document(staff_case,'application/pdf',now()+interval '1 year',1);
 insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 v:=public.submit_staff_credential_case(staff_case,2);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 v:=public.review_staff_credential_case(staff_case,'rejected','Synthetic staff review',v);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
 d:=public.add_staff_credential_document(staff_case,'application/pdf',now()+interval '1 year',v);
 insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
 v:=public.submit_staff_credential_case(staff_case,(d->>'version')::integer);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 v:=public.review_staff_credential_case(staff_case,'approved','Synthetic staff review',v);
 v:=public.review_staff_credential_case(staff_case,'suspended','Synthetic staff review',v);
 perform pg_temp.assert_true(not exists(select 1 from public.staff_credential_events se left join notify_private.events ne
  on ne.source_kind='staff_credential' and ne.source_id=se.id where se.case_id=staff_case and ne.id is null),'all public staff commands intake');
end $$;
do $$ declare prov uuid; p public.providers; decision text; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
 prov:=public.create_provider('doctor','Synthetic N01 review doctor','',null);
 perform pg_temp.n01_provider_document(prov);
 select * into p from public.providers where id=prov;
 p:=public.submit_provider(prov,p.version);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 p:=public.review_provider(prov,'under_review','Synthetic review',p.version);
 p:=public.review_provider(prov,'rejected','Synthetic review',p.version);
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
 perform pg_temp.n01_provider_document(prov);
 select * into p from public.providers where id=prov;
 p:=public.submit_provider(prov,p.version);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 p:=public.review_provider(prov,'under_review','Synthetic review',p.version);
 p:=public.review_provider(prov,'approved','Synthetic review',p.version);
 p:=public.review_provider(prov,'suspended','Synthetic review',p.version);
 p:=public.review_provider(prov,'under_review','Synthetic review',p.version);
 p:=public.review_provider(prov,'approved','Synthetic review',p.version);
 -- Owner-only clock fixture; command under test remains the actual expiry sweep.
 update public.provider_documents set expires_at=now()-interval '1 second' where provider_id=prov and status='verified';
 perform public.expire_due_providers();
 perform pg_temp.assert_true(not exists(select 1 from public.provider_verification_events v left join notify_private.events e
  on e.source_kind='provider_verification' and e.source_id=v.id where v.provider_id=prov and e.id is null),'all public provider commands intake');
 perform pg_temp.assert_true((select verification_state='expired' from public.providers where id=prov),'actual expiry path');
end $$;
insert into public.pin_directory(pin_code,state,district,city,source_reference) values
 ('599992','Synthetic','Synthetic','Synthetic','N01 rollback-only'),('599993','Synthetic','Synthetic','Synthetic','N01 rollback-only');
do $$ declare area public.provider_service_areas; proposal public.provider_service_areas; e uuid; begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 area:=public.propose_service_area(pg_temp.p5_provider('lab'),'599992',1,gen_random_uuid());
 perform pg_temp.assert_true((select count(*)=1 from public.coverage_review_events where area_id=area.id and to_status='proposed'),'proposal bridged once');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 area:=public.review_service_area(area.id,'approved','Synthetic review',area.version,now()+interval '1 month');
 area:=public.review_service_area(area.id,'revoked','Synthetic review',area.version);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 area:=public.propose_service_area(pg_temp.p5_provider('lab'),'599992',2,gen_random_uuid());
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
 area:=public.review_service_area(area.id,'rejected','Synthetic review',area.version);
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 proposal:=public.propose_service_area(pg_temp.p5_provider('lab'),'599993',3,gen_random_uuid());
 area:=public.withdraw_service_area(proposal.id,proposal.version);
 select ne.id into strict e from notify_private.events ne join public.coverage_review_events ce on ce.id=ne.source_id
  where ne.source_kind='coverage_review' and ce.area_id=area.id and ce.to_status='revoked';
 perform notify_worker.expand(500);
 perform pg_temp.assert_true((select status='expanded' from notify_private.events where id=e),'actual withdrawal classified intentionally silent');
 perform pg_temp.assert_true(not exists(select 1 from public.notifications where event_id=e),'provider withdrawal not reported as independent revocation');
 perform pg_temp.assert_true(not exists(select 1 from public.coverage_review_events v left join notify_private.events ne
  on ne.source_kind='coverage_review' and ne.source_id=v.id where ne.id is null),'all coverage commands intake');
end $$;
-- Authored, DB NOT EXECUTED. Verification ledger decisions are synthetic owner
-- fixtures; existing I02/Q06 suites separately exercise their command authority.
do $$ declare state_code text; ev uuid; subject_case uuid; ar uuid; b uuid; ex uuid; n integer; begin
 foreach state_code in array array['submitted','under_review','approved','rejected','suspended','expired'] loop
  insert into public.provider_verification_events(provider_id,actor_profile_id,from_state,to_state,reason,public_reason,provider_version)
  values(pg_temp.p5_provider('lab'),case when state_code='expired' then null else 'c1000000-0000-4000-8000-000000000004'::uuid end,
   'submitted',state_code,'Synthetic free-text never copied','Synthetic public reason never copied',1) returning id into ev;
  perform pg_temp.assert_true((select count(*)=1 from notify_private.events where source_kind='provider_verification' and source_id=ev),'provider intake '||state_code);
 end loop;
 select id into subject_case from public.provider_verification_cases where provider_id=pg_temp.p5_provider('lab') and subject_profile_id='c1000000-0000-4000-8000-000000000002';
 foreach state_code in array array['submitted','approved','rejected','suspended'] loop
  select coalesce(max(aggregate_version),0)+1 into n from public.staff_credential_events where case_id=subject_case;
  insert into public.staff_credential_events(case_id,actor_profile_id,to_state,reason,aggregate_version)
  values(subject_case,'c1000000-0000-4000-8000-000000000004',state_code,'Synthetic staff text never copied',n) returning id into ev;
  perform pg_temp.assert_true((select count(*)=1 from notify_private.events where source_kind='staff_credential' and source_id=ev),'staff intake '||state_code);
 end loop;
 select id into ar from public.provider_service_areas where provider_id=pg_temp.p5_provider('lab');
 foreach state_code in array array['proposed','approved','rejected','revoked','withdrawn'] loop
  insert into public.coverage_review_events(area_id,actor_profile_id,from_status,to_status,reason,area_version)
  values(ar,'c1000000-0000-4000-8000-000000000004','proposed',state_code,'Synthetic coverage text never copied',1) returning id into ev;
  perform pg_temp.assert_true((select count(*)=1 from notify_private.events where source_kind='coverage_review' and source_id=ev),'coverage intake '||state_code);
 end loop;
 b:=pg_temp.p5_raw('lab','confirmed',clock_timestamp()+interval '1 hour');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 ex:=booking_private.open_exception(b,'eligibility_lapsed','other');
 perform pg_temp.assert_true((select count(*)=1 from notify_private.events where source_kind='booking_exception' and source_id=ex),'exception insert');
 select count(*) into n from notify_private.events;
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
 perform public.ops_resolve_exception(ex,1,'resolved',gen_random_uuid());
 perform pg_temp.assert_true((select count(*) from notify_private.events)=n,'exception resolution writes no intake');
end $$;
select notify_worker.expand(500);
select pg_temp.assert_true(not exists(select 1 from public.notifications where params::text like '%Synthetic%'),'no free-text verification payload');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 102_n01_intake_other
rollback;
