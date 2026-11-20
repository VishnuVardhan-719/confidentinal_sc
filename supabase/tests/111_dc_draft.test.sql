\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dc_fixture.inc
-- DC04/DC05 drafts: DC01 actors, validation, versions, keyed replay, gate, visit substates,
-- post-visit window, privacy of side effects. DB NOT EXECUTED.

-- 1. Visits. Accept all, then move, then drive (as the fixture owner; claims pick the actor).
select pg_temp.dc_book('W1',0) as v1 \gset
select pg_temp.dc_book('W1',1) as v2 \gset
select pg_temp.dc_book('W2',2) as v3 \gset
select pg_temp.dc_book('W1',3) as v4 \gset
select pg_temp.dc_book('W1',4) as v5 \gset
select pg_temp.dc_move(:'v1',0), pg_temp.dc_move(:'v2',1), pg_temp.dc_move(:'v3',2), pg_temp.dc_move(:'v4',3), pg_temp.dc_move(:'v5',4);
select pg_temp.dc_start(:'v1','W1');
select pg_temp.to_arrived(:'v2',pg_temp.dc_actor('W1'),pg_temp.dc_actor('P')) as v2code \gset
select pg_temp.dc_as('W1');
select public.verify_arrival_code(:'v2',:'v2code',6,gen_random_uuid());
select pg_temp.dc_start(:'v3','W2');
select pg_temp.dc_start(:'v4','W1');
select pg_temp.dc_start(:'v5','W1');
select pg_temp.assert_true((select array_agg(substate order by booking_id::text=:'v2') from public.doctor_visits where booking_id in (:'v1',:'v2'))
 =array['service_started','arrival_verified'],'v1 started, v2 verified but not started');
select pg_temp.dc_events(:'v1') as v1_events \gset

set local role authenticated;

-- 2. DC01: only the assigned doctor of a started visit writes or reads the draft.
select set_config('dc.v1',:'v1',true), set_config('dc.v2',:'v2',true);
do $$ declare n text; begin
 foreach n in array array['W2','M','O','OG','P','X'] loop
  perform pg_temp.dc_as(n);
  perform pg_temp.dc_expect(format('select public.save_clinical_draft(%L,0,%L::jsonb,gen_random_uuid())',current_setting('dc.v1'),pg_temp.dc_content()),
   '42501','forbidden',n||' cannot save the draft');
  perform pg_temp.dc_expect(format('select public.get_clinical_draft(%L)',current_setting('dc.v1')),'P0002','not_found',n||' cannot read the draft');
 end loop;
 perform pg_temp.dc_as('W1');
 perform pg_temp.dc_expect(format('select public.save_clinical_draft(%L,0,''{}''::jsonb,gen_random_uuid())',current_setting('dc.v2')),
  '42501','forbidden','no draft before service_started (arrival_verified)');
 perform pg_temp.dc_expect(format('select public.get_clinical_draft(%L)',current_setting('dc.v2')),'P0002','not_found','no draft read before start');
end $$;

-- 3. Before the first save the author sees an empty draft.
select pg_temp.dc_as('W1');
select pg_temp.assert_true((select d->>'status'='none' and (d->>'version')::integer=0 and d->'content'='{}'::jsonb)
 from public.get_clinical_draft(:'v1') d,'empty draft for the author');

-- 4. Create, version checks, keyed replay.
select '40000000-0000-4000-8000-000000000001' as k1 \gset
select pg_temp.assert_true(public.save_clinical_draft(:'v1',0,'{"vitals":{"spo2_pct":85}}',:'k1')=1,'first save creates version 1');
select pg_temp.assert_true(public.save_clinical_draft(:'v1',0,'{"vitals":{"spo2_pct":85}}',:'k1')=1,'same key and body replays version 1');
select pg_temp.expect_state(format('select public.save_clinical_draft(%L,0,''{"vitals":{"spo2_pct":86}}''::jsonb,%L)',:'v1',:'k1'),'40001','same key, other body');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,0,''{}''::jsonb,gen_random_uuid())',:'v1'),'40001','stale_version','second create on version 0');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,5,''{}''::jsonb,gen_random_uuid())',:'v1'),'40001','stale_version','future version');
select pg_temp.assert_true(public.save_clinical_draft(:'v1',1,pg_temp.dc_content(),gen_random_uuid())=2,'expected version 1 saves version 2');
select pg_temp.assert_true(public.save_clinical_draft(:'v1',0,'{"vitals":{"spo2_pct":85}}',:'k1')=1,'old key still replays its own result');
select pg_temp.assert_true((select d->>'status'='draft' and (d->>'version')::integer=2 and d->'content'=pg_temp.dc_content())
 from public.get_clinical_draft(:'v1') d,'author reads the saved draft');

-- 5. DC04 validation at the database (the route check is not trusted).
do $$ declare bad text; begin
 perform pg_temp.dc_as('W1');
 foreach bad in array array['{"vitals":{"spo2_pct":101}}','{"vitals":{"temperature":{"value":37,"unit":"F"}}}','{"vitals":{"systolic":120}}',
  '{"examination":{"findings":""}}','{"prescription":{"items":[{"form":"pill"}]}}','{"plan":{"follow_up_on":"tomorrow"}}','{"extra":true}','[]'] loop
  perform pg_temp.dc_expect(format('select public.save_clinical_draft(%L,2,%L::jsonb,gen_random_uuid())',current_setting('dc.v1'),bad),
   '22023','invalid_input','rejects '||bad);
 end loop;
 perform pg_temp.dc_expect(format('select public.save_clinical_draft(%L,2,null,gen_random_uuid())',current_setting('dc.v1')),'22023','invalid_input','null content');
 perform pg_temp.dc_expect(format('select public.save_clinical_draft(%L,2,''{}''::jsonb,null)',current_setting('dc.v1')),'22023','invalid_input','null key');
end $$;
select pg_temp.assert_true(pg_temp.dc_draft_version(:'v1')=2,'rejected saves change nothing');

-- 6. Dangerous but plausible readings are kept as entered and flagged (DC04).
select pg_temp.assert_true(public.save_clinical_draft(:'v1',2,jsonb_set(pg_temp.dc_content(),'{vitals,spo2_pct}','85'),gen_random_uuid())=3,'low SpO2 saved');
select pg_temp.assert_true((select (d#>>'{content,vitals,spo2_pct}')::integer=85 and d->'vital_warnings'='["spo2_low"]'::jsonb)
 from public.get_clinical_draft(:'v1') d,'value preserved, warning reported');

-- 7. Gate: writes need on; the draft stays readable.
reset role;
select pg_temp.set_gate('off','doctor_clinical');
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,3,''{}''::jsonb,gen_random_uuid())',:'v1'),'55000','feature_unavailable','gate off');
select pg_temp.assert_true((select (d->>'version')::integer=3 from public.get_clinical_draft(:'v1') d),'draft readable with the gate off');
reset role;
select pg_temp.set_gate('suspended','doctor_clinical');
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,3,''{}''::jsonb,gen_random_uuid())',:'v1'),'55000','feature_suspended','gate suspended');
reset role;
select pg_temp.set_gate('on','doctor_clinical');
set local role authenticated;

-- 8. Privacy of side effects: no booking event or outbox row, one audit row with ids only.
reset role;
select pg_temp.assert_true(pg_temp.dc_events(:'v1')=:v1_events,'draft saves write no booking event or outbox row');
select pg_temp.assert_true((select count(*)=1 from public.audit_events a join clinical_private.consultations c on c.id=a.target_id
 where c.booking_id=:'v1' and a.action='clinical.draft_created' and a.target_type='consultation'),'one draft_created audit row');
select pg_temp.assert_true(not exists(select 1 from public.audit_events where action like 'clinical.%' and action not in
 ('clinical.draft_created','clinical.record_signed','clinical.prescription_signed','clinical.record_amended','clinical.record_viewed')),'only known clinical audit actions');
select pg_temp.assert_true((select count(*)=3 from public.idempotency_requests where action='clinical.draft'
 and actor_profile_id=pg_temp.dc_actor('W1')),'one replay row per committed save');
select pg_temp.assert_true(not exists(select 1 from public.idempotency_requests r where r.action='clinical.draft' and r.request_hash like '%Synthetic%'),
 'replay rows hold a hash, not content');
set local role authenticated;

-- 9. Q06 lapse mid-visit stops clinical writes (DC01 assignee predicate).
select pg_temp.dc_save(:'v3','W2',0) as v3_draft \gset
reset role;
select pg_temp.expire_case(pg_temp.dc_actor('W2'));
set local role authenticated;
select pg_temp.dc_as('W2');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,1,''{}''::jsonb,gen_random_uuid())',:'v3'),'42501','forbidden','lapsed credential cannot save');
select pg_temp.dc_expect(format('select public.get_clinical_draft(%L)',:'v3'),'P0002','not_found','lapsed credential cannot read the draft');
reset role;
select pg_temp.expire_case(pg_temp.dc_actor('W2'),false);
set local role authenticated;

-- 10. Interruption freezes the draft privately.
select pg_temp.dc_save(:'v4','W1',0);
select pg_temp.dc_as('W1');
select public.interrupt_doctor_visit(:'v4',8,'patient_requested_stop',gen_random_uuid());
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,1,''{}''::jsonb,gen_random_uuid())',:'v4'),'42501','forbidden','no save after interruption');
select pg_temp.dc_expect(format('select public.get_clinical_draft(%L)',:'v4'),'P0002','not_found','no read after interruption');
reset role;
select pg_temp.assert_true(pg_temp.dc_draft_version(:'v4')=1,'interrupted draft kept');
set local role authenticated;

-- 11. Post-visit: the doctor who completed the visit may continue until end_at + 12 h.
select pg_temp.dc_complete(:'v1','W1');
select pg_temp.assert_true(pg_temp.dc_save(:'v1','W1',3)=4,'post-visit save by the completing doctor');
select pg_temp.dc_as('W2');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,4,''{}''::jsonb,gen_random_uuid())',:'v1'),'42501','forbidden','other doctor post-visit');
select pg_temp.dc_save(:'v5','W1',0);
select pg_temp.dc_complete(:'v5','W1');
reset role;
select pg_temp.p5_shift(:'v5',now()-interval '13 hours');
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,1,''{}''::jsonb,gen_random_uuid())',:'v5'),'42501','forbidden','post-visit window closed');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,1,true,true,gen_random_uuid())',:'v5'),'42501','forbidden','no signature after the window');

-- 12. Membership disabled: no author even inside the window.
reset role;
update public.organization_members set status='disabled' where profile_id=pg_temp.dc_actor('W1') and organization_id='c8000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,4,''{}''::jsonb,gen_random_uuid())',:'v1'),'42501','forbidden','disabled membership');
rollback;
