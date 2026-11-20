\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dc_fixture.inc
-- DC06/DC07/DC08 signing: required content, warnings, allergy match, attestation, immutability,
-- typed prescription rows, hash, replay, independence from booking and payment. DB NOT EXECUTED.

select pg_temp.dc_book('W1',0) as v1 \gset
select pg_temp.dc_book('W1',1) as v2 \gset
select pg_temp.dc_move(:'v1',0), pg_temp.dc_move(:'v2',1);
select pg_temp.dc_start(:'v1','W1');
select pg_temp.dc_start(:'v2','W1');
select pg_temp.dc_events(:'v1') as v1_events \gset
select coalesce((select state from public.payments where booking_id=:'v1'),'none') as v1_payment \gset
set local role authenticated;

-- 1. Required content (clinical_incomplete). Each case saves a new draft version first.
select pg_temp.assert_true(pg_temp.dc_save(:'v1','W1',0,pg_temp.dc_content() #- '{examination,findings}')=1,'draft without findings');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,1,true,true,gen_random_uuid())',:'v1'),'22023','clinical_incomplete','findings required');
select pg_temp.assert_true(pg_temp.dc_save(:'v1','W1',1,jsonb_set(pg_temp.dc_content(),'{allergies,status}','"not_assessed"') #- '{allergies,items}')=2,'prescribing without allergy assessment');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,2,true,true,gen_random_uuid())',:'v1'),'22023','clinical_incomplete','allergies must be assessed before prescribing');

-- 2. Warnings must be acknowledged; the value is never changed.
select pg_temp.assert_true(pg_temp.dc_save(:'v1','W1',2,jsonb_set(pg_temp.dc_content(),'{vitals,spo2_pct}','85'))=3,'low SpO2 draft');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,3,true,true,gen_random_uuid())',:'v1'),'22023','warning_unacknowledged','unacknowledged warning');

-- 3. Allergy name match needs an override reason on the matching line.
select pg_temp.assert_true(pg_temp.dc_save(:'v1','W1',3,jsonb_set(pg_temp.dc_content(),'{allergies,items}','[{"substance":"paracetamol"}]'))=4,'allergy matches the medicine');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,4,true,true,gen_random_uuid())',:'v1'),'22023','allergy_conflict','allergy conflict');
select pg_temp.assert_true((select d->'allergy_conflicts'='[1]'::jsonb from public.get_clinical_draft(:'v1') d),'draft reports the conflicting line');

-- 4. Attestations.
select pg_temp.assert_true(pg_temp.dc_save(:'v1','W1',4,pg_temp.dc_content())=5,'complete draft');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,5,false,true,gen_random_uuid())',:'v1'),'22023','attestation_required','authorship not confirmed');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,5,true,false,gen_random_uuid())',:'v1'),'22023','attestation_required','allergy review not confirmed with a prescription');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,5,true,null,gen_random_uuid())',:'v1'),'22023','invalid_input','null attestation');

-- 5. Actors, version, gate.
select pg_temp.dc_as('W2');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,5,true,true,gen_random_uuid())',:'v1'),'42501','forbidden','other doctor cannot sign');
select pg_temp.dc_as('P');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,5,true,true,gen_random_uuid())',:'v1'),'42501','forbidden','patient cannot sign');
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,4,true,true,gen_random_uuid())',:'v1'),'40001','stale_version','sign needs the current draft version');
reset role;
select pg_temp.set_gate('off','doctor_clinical');
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,5,true,true,gen_random_uuid())',:'v1'),'55000','feature_unavailable','gate off');
reset role;
select pg_temp.set_gate('on','doctor_clinical');
set local role authenticated;

-- 6. Sign, then replay.
select '40000000-0000-4000-8000-000000000002' as ks \gset
select pg_temp.dc_as('W1');
select public.sign_clinical_record(:'v1',5,true,true,:'ks') as r1 \gset
select pg_temp.assert_true(public.sign_clinical_record(:'v1',5,true,true,:'ks')=:'r1'::uuid,'same key replays the record id');
select pg_temp.dc_expect(format('select public.sign_clinical_record(%L,5,true,true,gen_random_uuid())',:'v1'),'55000','draft_signed','second signature');
select pg_temp.dc_expect(format('select public.save_clinical_draft(%L,5,''{}''::jsonb,gen_random_uuid())',:'v1'),'55000','draft_signed','no edit after signing');
select pg_temp.assert_true((select d->>'status'='signed' and d->>'record_id'=:'r1' from public.get_clinical_draft(:'v1') d),'draft shows the signed record');

reset role;
-- 7. The record froze the exact draft version (DC07).
select pg_temp.assert_true((select r.kind='original' and r.record_version=1 and r.root_record_id=r.id and r.supersedes_record_id is null
 and r.signed_by=pg_temp.dc_actor('W1') and r.source_draft_version=5 and r.content=c.content and r.content=pg_temp.dc_content()
 and r.content_sha256=encode(sha256(convert_to(r.content::text,'UTF8')),'hex') and c.status='signed' and c.latest_record_id=r.id
 from clinical_private.clinical_records r join clinical_private.consultations c on c.id=r.consultation_id where r.id=:'r1'),'record equals draft v5, hashed');
select pg_temp.assert_true((select count(*)=1 from clinical_private.clinical_records where booking_id=:'v1'),'one record despite the replay');
-- DC08 typed rows equal the frozen content.
select pg_temp.assert_true((select count(*)=1 and bool_and(line_no=1 and medication_name='Paracetamol' and form='tablet' and strength='500 mg' and dose='1 tablet'
 and route='oral' and frequency='three_times_daily' and duration_days=3 and quantity=9 and instructions is null and allergy_override_reason is null)
 from clinical_private.prescription_items where record_id=:'r1'),'prescription line stored as typed columns');
select pg_temp.assert_true(pg_temp.dc_audits('clinical.record_signed',:'r1')=1 and pg_temp.dc_audits('clinical.prescription_signed',:'r1')=1,'sign and prescription audited once');
-- Booking and payment are untouched; nothing was broadcast.
select pg_temp.assert_true(pg_temp.dc_events(:'v1')=:v1_events,'no booking event or outbox row from signing');
select pg_temp.assert_true((select state='in_progress' and version=8 from public.bookings where id=:'v1'),'booking state and version unchanged');
select pg_temp.assert_true(coalesce((select state from public.payments where booking_id=:'v1'),'none')=:'v1_payment','payment state unchanged');

-- 8. Immutability for the table owner's application path (triggers) and the API roles.
select pg_temp.dc_expect(format('update clinical_private.clinical_records set content=''{}''::jsonb where id=%L',:'r1'),'55000','immutable_event','record update');
select pg_temp.dc_expect(format('delete from clinical_private.clinical_records where id=%L',:'r1'),'55000','immutable_event','record delete');
select pg_temp.dc_expect('truncate clinical_private.clinical_records cascade','55000','immutable_event','record truncate');
select pg_temp.dc_expect(format('update clinical_private.prescription_items set dose=''2 tablets'' where record_id=%L',:'r1'),'55000','immutable_event','item update');
select pg_temp.dc_expect(format('delete from clinical_private.prescription_items where record_id=%L',:'r1'),'55000','immutable_event','item delete');
select pg_temp.dc_expect(format('update clinical_private.consultations set content=''{}''::jsonb where booking_id=%L',:'v1'),'55000','invalid_transition','signed draft update');
select pg_temp.dc_expect(format('update clinical_private.consultations set status=''draft'',latest_record_id=null where booking_id=%L',:'v1'),'55000','invalid_transition','unsign');
select pg_temp.dc_expect(format('delete from clinical_private.consultations where booking_id=%L',:'v1'),'55000','immutable_record','draft delete');
select pg_temp.dc_expect(format('insert into clinical_private.prescription_items(record_id,line_no,medication_name,form,dose,route,frequency) values(%L,2,''Extra'',''tablet'',''1'',''oral'',''once_daily'')',:'r1'),
 '55000','invalid_transition','no line that is not in the frozen content');
select pg_temp.dc_expect(format('insert into clinical_private.clinical_records(id,consultation_id,booking_id,patient_id,provider_id,root_record_id,record_version,kind,signed_by,source_draft_version,content)
 select x,c.id,c.booking_id,c.patient_id,c.provider_id,x,1,''original'',c.author_profile_id,5,c.content from clinical_private.consultations c, gen_random_uuid() x where c.booking_id=%L',:'v1'),
 '55000','invalid_transition','no second original for a signed consultation');
set local role authenticated;
select pg_temp.expect_state(format('select * from clinical_private.clinical_records where id=%L',:'r1'),'42501','authenticated cannot select the record');
reset role;

-- 9. DC06 uncertainty preserved; no medicine forced (v2).
set local role authenticated;
select pg_temp.assert_true(pg_temp.dc_save(:'v2','W1',0,pg_temp.dc_minimal())=1,'minimal draft');
select pg_temp.dc_as('W1');
select public.sign_clinical_record(:'v2',1,true,false,gen_random_uuid()) as r2 \gset
reset role;
select pg_temp.assert_true((select content#>>'{assessment,certainty}'='undetermined' and content->'prescription'='{"status":"none_indicated"}'::jsonb
 from clinical_private.clinical_records where id=:'r2'),'undetermined assessment, no prescription');
select pg_temp.assert_true(not exists(select 1 from clinical_private.prescription_items where record_id=:'r2'),'no prescription rows');
select pg_temp.assert_true(pg_temp.dc_audits('clinical.prescription_signed',:'r2')=0,'no prescription audit without medicine');

-- 10. A visit can complete before or after signing; completion does not need a record.
select pg_temp.assert_true(pg_temp.dc_complete(:'v1','W1')=9,'signed visit completes');
rollback;
