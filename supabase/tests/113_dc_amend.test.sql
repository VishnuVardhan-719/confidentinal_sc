\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dc_fixture.inc
-- DC07 append-only amendments: chain, superseded versions, actors, window, gate, replay.
-- DB NOT EXECUTED.

select pg_temp.dc_book('W1',0) as v1 \gset
select pg_temp.dc_move(:'v1',0);
select pg_temp.dc_start(:'v1','W1');
select pg_temp.dc_save(:'v1','W1',0);
select pg_temp.dc_sign(:'v1','W1',1) as r1 \gset
select pg_temp.dc_complete(:'v1','W1');
select content_sha256 as r1_hash from clinical_private.clinical_records where id=:'r1' \gset
select jsonb_set(pg_temp.dc_content(),'{prescription,items,0,dose}','"2 tablets"') as fixed \gset
set local role authenticated;

-- 1. Only the signer amends.
select set_config('dc.r1',:'r1',true);
do $$ declare n text; begin
 foreach n in array array['W2','M','O','OG','P','X'] loop
  perform pg_temp.dc_as(n);
  perform pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''Synthetic correction'',true,true,gen_random_uuid())',
   current_setting('dc.r1'),pg_temp.dc_content()),'42501','forbidden',n||' cannot amend');
 end loop;
end $$;

-- 2. Input and content rules are the signing rules.
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''  '',true,true,gen_random_uuid())',:'r1',:'fixed'),'22023','invalid_input','blank reason');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,''{"vitals":{"spo2_pct":101}}''::jsonb,''x'',true,true,gen_random_uuid())',:'r1'),'22023','invalid_input','invalid content');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''x'',true,true,gen_random_uuid())',:'r1',pg_temp.dc_content() #- '{examination,findings}'),
 '22023','clinical_incomplete','incomplete amendment');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''x'',true,false,gen_random_uuid())',:'r1',:'fixed'),
 '22023','attestation_required','allergy review needed with a prescription');

-- 3. Gate off blocks amendments.
reset role;
select pg_temp.set_gate('off','doctor_clinical');
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''x'',true,true,gen_random_uuid())',:'r1',:'fixed'),'55000','feature_unavailable','gate off');
reset role;
select pg_temp.set_gate('on','doctor_clinical');
set local role authenticated;

-- 4. Amend after completion (no visit window applies), then replay.
select '40000000-0000-4000-8000-000000000003' as ka \gset
select pg_temp.dc_as('W1');
select public.amend_clinical_record(:'r1',:'fixed',' Synthetic dose correction ',true,true,:'ka') as r2 \gset
select pg_temp.assert_true(public.amend_clinical_record(:'r1',:'fixed',' Synthetic dose correction ',true,true,:'ka')=:'r2'::uuid,'same key replays the amendment');
select pg_temp.expect_state(format('select public.amend_clinical_record(%L,%L::jsonb,''other reason'',true,true,%L)',:'r1',:'fixed',:'ka'),'40001','same key, other reason');

reset role;
select pg_temp.assert_true((select r.kind='amendment' and r.record_version=2 and r.supersedes_record_id=:'r1'::uuid and r.root_record_id=:'r1'::uuid
 and r.amendment_reason='Synthetic dose correction' and r.source_draft_version is null and r.signed_by=pg_temp.dc_actor('W1')
 and r.content=:'fixed'::jsonb from clinical_private.clinical_records r where r.id=:'r2'),'amendment row links the chain');
select pg_temp.assert_true((select content=pg_temp.dc_content() and content_sha256=:'r1_hash' from clinical_private.clinical_records where id=:'r1'),'original unchanged');
select pg_temp.assert_true((select latest_record_id=:'r2'::uuid and version=1 and status='signed' from clinical_private.consultations where booking_id=:'v1'),'latest moves, draft untouched');
select pg_temp.assert_true((select dose='2 tablets' from clinical_private.prescription_items where record_id=:'r2' and line_no=1),'amended line stored');
select pg_temp.assert_true((select dose='1 tablet' from clinical_private.prescription_items where record_id=:'r1' and line_no=1),'original line kept');
select pg_temp.assert_true(pg_temp.dc_audits('clinical.record_amended',:'r2')=1,'amendment audited');
set local role authenticated;

-- 5. Only the latest version is amended; the chain never forks.
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''again'',true,true,gen_random_uuid())',:'r1',:'fixed'),'55000','record_superseded','superseded version');
select public.amend_clinical_record(:'r2',pg_temp.dc_content(),'Synthetic revert',true,true,gen_random_uuid()) as r3 \gset
reset role;
select pg_temp.assert_true((select record_version=3 and supersedes_record_id=:'r2'::uuid from clinical_private.clinical_records where id=:'r3'),'third version');
select pg_temp.expect_state(format('insert into clinical_private.clinical_records(id,consultation_id,booking_id,patient_id,provider_id,root_record_id,record_version,kind,
 supersedes_record_id,amendment_reason,signed_by,content) select gen_random_uuid(),consultation_id,booking_id,patient_id,provider_id,root_record_id,2,''amendment'',id,''fork'',signed_by,content
 from clinical_private.clinical_records where id=%L',:'r1'),'23505','a second successor is refused by a unique key');
select pg_temp.dc_expect(format('insert into clinical_private.clinical_records(id,consultation_id,booking_id,patient_id,provider_id,root_record_id,record_version,kind,
 supersedes_record_id,amendment_reason,signed_by,content) select gen_random_uuid(),consultation_id,booking_id,patient_id,provider_id,root_record_id,9,''amendment'',id,''skip'',signed_by,content
 from clinical_private.clinical_records where id=%L',:'r3'),'55000','invalid_transition','version must be predecessor + 1');
select pg_temp.dc_expect(format('insert into clinical_private.clinical_records(id,consultation_id,booking_id,patient_id,provider_id,root_record_id,record_version,kind,
 supersedes_record_id,amendment_reason,signed_by,content) select gen_random_uuid(),consultation_id,booking_id,patient_id,provider_id,root_record_id,4,''amendment'',id,''other signer'',%L,content
 from clinical_private.clinical_records where id=%L',pg_temp.dc_actor('W2'),:'r3'),'55000','invalid_transition','one signer per chain');

-- 6. Amendment authority: verified, still a member, inside 30 days of the first signature.
select pg_temp.expire_case(pg_temp.dc_actor('W1'));
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''x'',true,true,gen_random_uuid())',:'r3',:'fixed'),'42501','forbidden','lapsed credential');
reset role;
select pg_temp.expire_case(pg_temp.dc_actor('W1'),false);
alter table clinical_private.clinical_records disable trigger dc_record_immutable;
update clinical_private.clinical_records set signed_at=signed_at-interval '31 days' where id=:'r1';
alter table clinical_private.clinical_records enable trigger dc_record_immutable;
set local role authenticated;
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.amend_clinical_record(%L,%L::jsonb,''x'',true,true,gen_random_uuid())',:'r3',:'fixed'),'42501','forbidden','amendment window closed');
rollback;
