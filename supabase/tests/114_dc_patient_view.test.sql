\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dc_fixture.inc
-- DC09 patient consultation view and the DC-extras read interface: linked patient only,
-- signer while a member, negative actors, audit, no draft or contact leak. DB NOT EXECUTED.

select pg_temp.dc_book('W1',0) as v1 \gset
select pg_temp.dc_book('W1',1) as v2 \gset
select pg_temp.dc_move(:'v1',0), pg_temp.dc_move(:'v2',1);
select pg_temp.dc_start(:'v1','W1');
select pg_temp.dc_start(:'v2','W1');
select pg_temp.dc_save(:'v1','W1',0);
select pg_temp.dc_sign(:'v1','W1',1) as r1 \gset
select pg_temp.dc_as('W1');
select public.amend_clinical_record(:'r1',jsonb_set(pg_temp.dc_content(),'{plan,advice}','"Synthetic amended advice"'),'Synthetic advice correction',true,true,gen_random_uuid()) as r2 \gset
select pg_temp.dc_save(:'v2','W1',0,pg_temp.dc_minimal());
set local role authenticated;

-- 1. The linked patient lists and reads every signed version.
select pg_temp.dc_as('P');
select public.list_clinical_records(:'v1') as list \gset
select pg_temp.assert_true((:'list'::jsonb)->>'booking_id'=:'v1' and jsonb_array_length((:'list'::jsonb)->'records')=2
 and (:'list'::jsonb)#>>'{records,0,record_id}'=:'r1' and (:'list'::jsonb)#>>'{records,0,is_latest}'='false'
 and (:'list'::jsonb)#>>'{records,1,record_id}'=:'r2' and (:'list'::jsonb)#>>'{records,1,is_latest}'='true'
 and (:'list'::jsonb)#>>'{records,1,kind}'='amendment','two versions, latest marked');
select pg_temp.assert_true(not ((:'list'::jsonb)#>'{records,0}') ? 'content','the list carries no content');
select public.get_clinical_record(:'r2') as doc \gset
select pg_temp.assert_true(pg_temp.keys(:'doc'::jsonb)=array['amendment_reason','booking_id','booking_ref','content','content_sha256','is_latest','kind',
 'patient','provider','record_id','record_version','signed_at','signer','supersedes_record_id','visit','vital_warnings'],'document keys are the DC-extras contract');
select pg_temp.assert_true((:'doc'::jsonb)#>>'{content,plan,advice}'='Synthetic amended advice' and (:'doc'::jsonb)->>'supersedes_record_id'=:'r1'
 and (:'doc'::jsonb)->>'amendment_reason'='Synthetic advice correction' and ((:'doc'::jsonb)->>'is_latest')::boolean
 and (:'doc'::jsonb)->'vital_warnings'='[]'::jsonb and length((:'doc'::jsonb)->>'content_sha256')=64,'amended document');
select pg_temp.assert_true(position('+91' in :'doc')=0 and position('Synthetic exact address' in :'doc')=0 and position('b2000000-0000-4000-8000-000000000001' in :'doc')=0
 and position('amount' in :'doc')=0,'no phone, address, patient id or amount');
select pg_temp.assert_true((select (d->>'is_latest')::boolean=false and d#>>'{content,plan,advice}'='Synthetic rest and fluids' from public.get_clinical_record(:'r1') d),
 'original version still readable as issued');

-- 2. Every read is audited with ids only.
reset role;
select pg_temp.assert_true(pg_temp.dc_audits('clinical.record_viewed',:'r2')=1 and pg_temp.dc_audits('clinical.record_viewed',:'r1')=1,'one audit row per read');
select pg_temp.assert_true((select actor_profile_id=pg_temp.dc_actor('P') and target_type='clinical_record' from public.audit_events
 where action='clinical.record_viewed' and target_id=:'r2'),'audit names the reader and the record');
set local role authenticated;

-- 3. Drafts are never visible to the patient; an unsigned visit lists nothing.
select pg_temp.dc_as('P');
select pg_temp.dc_expect(format('select public.get_clinical_draft(%L)',:'v2'),'P0002','not_found','patient cannot read a draft');
select pg_temp.assert_true((select jsonb_array_length(l->'records')=0 from public.list_clinical_records(:'v2') l),'unsigned visit lists no record');

-- 4. Nobody else reads: other doctor, scheduler, ops, outsider. Same 404 as an unknown id.
select set_config('dc.r1',:'r1',true), set_config('dc.v1',:'v1',true);
do $$ declare n text; begin
 foreach n in array array['W2','M','O','OG','X'] loop
  perform pg_temp.dc_as(n);
  perform pg_temp.dc_expect(format('select public.get_clinical_record(%L)',current_setting('dc.r1')),'P0002','not_found',n||' cannot read the record');
  perform pg_temp.dc_expect(format('select public.list_clinical_records(%L)',current_setting('dc.v1')),'P0002','not_found',n||' cannot list records');
 end loop;
 perform pg_temp.dc_as('P');
 perform pg_temp.dc_expect('select public.get_clinical_record(gen_random_uuid())','P0002','not_found','unknown record');
end $$;
reset role;
select pg_temp.assert_true(not exists(select 1 from public.audit_events where action='clinical.record_viewed'
 and actor_profile_id<>pg_temp.dc_actor('P')),'denied reads write no audit row');
set local role authenticated;

-- 5. The signer reads while a member; reads ignore the gate.
select pg_temp.dc_as('W1');
select pg_temp.assert_true((select d->>'record_id'=:'r1' from public.get_clinical_record(:'r1') d),'signer reads');
reset role;
select pg_temp.set_gate('off','doctor_clinical');
set local role authenticated;
select pg_temp.dc_as('P');
select pg_temp.assert_true((select d->>'record_id'=:'r2' from public.get_clinical_record(:'r2') d),'patient reads with the gate off');
reset role;
select pg_temp.set_gate('suspended','doctor_clinical');
set local role authenticated;
select pg_temp.dc_as('P');
select pg_temp.assert_true((select jsonb_array_length(l->'records')=2 from public.list_clinical_records(:'v1') l),'patient lists with the gate suspended');
reset role;
select pg_temp.set_gate('on','doctor_clinical');

-- 6. Revoked patient access and a disabled signer membership both end reads.
update public.patient_access set revoked_at=now() where patient_id='b2000000-0000-4000-8000-000000000001' and scope='booking:read';
update public.organization_members set status='disabled' where profile_id=pg_temp.dc_actor('W1') and organization_id='c8000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.dc_as('P');
select pg_temp.dc_expect(format('select public.get_clinical_record(%L)',:'r1'),'P0002','not_found','revoked patient access');
select pg_temp.dc_expect(format('select public.list_clinical_records(%L)',:'v1'),'P0002','not_found','revoked patient access lists nothing');
select pg_temp.dc_as('W1');
select pg_temp.dc_expect(format('select public.get_clinical_record(%L)',:'r1'),'P0002','not_found','former member');

-- 7. Private helpers for DC-extras agree with the public read.
reset role;
select pg_temp.assert_true(clinical_private.latest_record_id(:'v1')=:'r2'::uuid,'latest_record_id');
select pg_temp.assert_true(clinical_private.record_document(:'r2')=((:'doc'::jsonb)),'record_document equals the public read');
\echo 1..1
\echo ok 1 - 114_dc_patient_view
rollback;
