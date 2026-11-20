\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dcx_fixture.inc
-- DC13 consent-based optional photography. DB NOT EXECUTED.
-- V1 started visit of P1 b1..01 with D1 b1..02; V2 a confirmed, not started visit of D1.

select pg_temp.dcx_started(1) as ids \gset
select set_config('dcx.v1',(:'ids'::uuid[])[1]::text,true);
select pg_temp.new_visit(9) as v2 \gset
select set_config('dcx.v2',:'v2',true);

do $$ declare v1 uuid:=current_setting('dcx.v1')::uuid; v2 uuid:=current_setting('dcx.v2')::uuid; c uuid; c2 uuid; j jsonb; u uuid; k uuid:=gen_random_uuid(); begin
 -- Consent: the patient only; purpose-specific; repeat grant returns the same consent.
 foreach u in array array['b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003','e9000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.grant_photo_consent(%L,''wound_documentation'',''photo-v1'',gen_random_uuid())',v1),'42501',u||' cannot consent for P1');
 end loop;
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.grant_photo_consent(%L,''marketing'',''photo-v1'',gen_random_uuid())',v1),'22023','purpose outside the list');
 c:=public.grant_photo_consent(v1,'wound_documentation','photo-v1',k);
 perform pg_temp.assert_true(public.grant_photo_consent(v1,'wound_documentation','photo-v1',k)=c,'replay');
 perform pg_temp.assert_true(public.grant_photo_consent(v1,'wound_documentation','photo-v1',gen_random_uuid())=c,'second grant returns the granted consent');
 c2:=public.grant_photo_consent(v2,'skin_condition','photo-v1',gen_random_uuid());

 -- (a) Upload needs the started visit's verified doctor and a granted consent of this booking.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.register_visit_photo(%L,%L,''image/jpeg'',gen_random_uuid())',v1,c),'42501','patient cannot register');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform pg_temp.expect_state(format('select public.register_visit_photo(%L,%L,''image/jpeg'',gen_random_uuid())',v2,c2),'42501','visit not started');
 perform pg_temp.expect_state(format('select public.register_visit_photo(%L,%L,''image/jpeg'',gen_random_uuid())',v1,c2),'42501','consent of another booking');
 perform pg_temp.expect_state(format('select public.register_visit_photo(%L,gen_random_uuid(),''image/jpeg'',gen_random_uuid())',v1),'42501','no consent');
 perform pg_temp.expect_state(format('select public.register_visit_photo(%L,%L,''image/gif'',gen_random_uuid())',v1,c),'22023','type outside the list');
 k:=gen_random_uuid();
 j:=public.register_visit_photo(v1,c,'image/jpeg',k);
 perform pg_temp.assert_true(j->>'bucket'='visit-evidence' and j->>'object_name'='visit/'||v1||'/'||(j->>'photo_id')||'.jpg','registered name');
 perform pg_temp.assert_true(public.register_visit_photo(v1,c,'image/jpeg',k)=j,'register replays');
 perform set_config('dcx.photo',j->>'photo_id',true);
 perform set_config('dcx.obj',j->>'object_name',true);
 perform set_config('dcx.c',c::text,true);
end $$;

-- Storage predicate: write only for the registering doctor; no read without a ticket.
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),true),'registering doctor may write');
select pg_temp.assert_true(not dcx_private.photo_object_access('provider-verification',current_setting('dcx.obj'),true),'other bucket refused');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence','visit/x/y.jpg',true),'unregistered name refused');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'no download without a ticket');
select set_config('storage.operation','storage.object.upload',true);
select pg_temp.assert_true(dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'upload read-back allowed');
select set_config('storage.operation','',true);
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),true),'patient cannot write');
insert into storage.objects(bucket_id,name) values ('visit-evidence',current_setting('dcx.obj'));

-- Reads: patient and doctor with their own live ticket; (c) others denied.
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((public.authorize_visit_photo_read(current_setting('dcx.photo')::uuid)->>'object_name')=current_setting('dcx.obj'),'patient ticket');
select pg_temp.assert_true(dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'patient reads with a ticket');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'ticket is personal');
select public.authorize_visit_photo_read(current_setting('dcx.photo')::uuid);
select pg_temp.assert_true(dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'doctor reads with a ticket');
do $$ declare u uuid; begin
 foreach u in array array['e9000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.authorize_visit_photo_read(%L)',current_setting('dcx.photo')),'P0002',u||' gets no ticket');
  perform pg_temp.expect_state(format('select public.list_visit_photos(%L)',current_setting('dcx.v1')),'P0002',u||' cannot list');
  perform pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),u||' cannot read the object');
 end loop;
end $$;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not (public.list_visit_photos(current_setting('dcx.v1')::uuid)::text like '%visit/%'),'list carries no object names');
select pg_temp.assert_true(exists(select 1 from public.audit_events where action='visit_photo.read_authorized' and target_id=current_setting('dcx.photo')::uuid),'ticket audited');
-- The gate also binds Storage: off stops reads with a live ticket, suspended keeps reads.
select pg_temp.set_gate('off','doctor_photos');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'gate off: live ticket reads nothing');
select pg_temp.set_gate('suspended','doctor_photos');
select pg_temp.assert_true(dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'gate suspended: reads stay open');
select pg_temp.set_gate('on','doctor_photos');

-- (b) Withdrawal: ungated, stale version refused, reads stop at once, deletion scheduled.
select pg_temp.set_gate('off','doctor_photos');
select pg_temp.expect_state(format('select public.withdraw_photo_consent(%L,2,gen_random_uuid())',current_setting('dcx.c')),'40001','stale consent version');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.withdraw_photo_consent(%L,1,gen_random_uuid())',current_setting('dcx.c')),'P0002','doctor cannot withdraw');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.withdraw_photo_consent(current_setting('dcx.c')::uuid,1,gen_random_uuid())=2,'withdrawn with the gate off');
select pg_temp.set_gate('on','doctor_photos');
select pg_temp.assert_true((select status='withdrawn' and delete_after is not null and delete_after<=clock_timestamp() from public.visit_photos
 where id=current_setting('dcx.photo')::uuid),'photo withdrawn and scheduled for deletion');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'patient ticket no longer reads');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),false),'doctor ticket no longer reads');
select pg_temp.assert_true(not dcx_private.photo_object_access('visit-evidence',current_setting('dcx.obj'),true),'no further writes');
select pg_temp.expect_state(format('select public.authorize_visit_photo_read(%L)',current_setting('dcx.photo')),'P0002','no new ticket');
select pg_temp.expect_state(format('select public.register_visit_photo(%L,%L,''image/png'',gen_random_uuid())',current_setting('dcx.v1'),current_setting('dcx.c')),'42501','no new photo');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.withdraw_photo_consent(%L,2,gen_random_uuid())',current_setting('dcx.c')),'55000','already withdrawn');
select pg_temp.assert_true(public.grant_photo_consent(current_setting('dcx.v1')::uuid,'wound_documentation','photo-v1',gen_random_uuid())<>current_setting('dcx.c')::uuid,
 'a new consent is a new row');

-- Cap of 10 photos per booking.
do $$ declare c uuid:=(select id from public.visit_photo_consents where booking_id=current_setting('dcx.v1')::uuid and status='granted'); i integer; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 for i in 1..9 loop perform public.register_visit_photo(current_setting('dcx.v1')::uuid,c,'image/png',gen_random_uuid()); end loop;
 perform pg_temp.expect_state(format('select public.register_visit_photo(%L,%L,''image/png'',gen_random_uuid())',current_setting('dcx.v1'),c),'53300','eleventh photo');
end $$;

-- Guards below the commands (owner path).
reset role;
select pg_temp.expect_state($$update public.visit_photos set status='active',withdrawn_at=null,delete_after=null where status='withdrawn'$$,'55000','no reactivation');
select pg_temp.expect_state($$update public.visit_photos set object_name=object_name where status='active'$$,'55000','active photos only withdraw');
select pg_temp.expect_state($$delete from public.visit_photos$$,'55000','photos not deletable');
select pg_temp.expect_state($$update public.visit_photo_consents set purpose='skin_condition' where status='granted'$$,'55000','consent fields fixed');
select pg_temp.expect_state($$delete from public.visit_photo_consents$$,'55000','consents not deletable');
select pg_temp.expect_state($$update dcx_private.photo_read_tickets set expires_at=now()+interval '1 hour'$$,'55000','tickets immutable');
-- (d) the bucket stays private (also suite 120); API roles hold no table privilege.
select pg_temp.assert_true((select not public from storage.buckets where id='visit-evidence'),'bucket private');

\echo 1..1
\echo ok 1 - 124_dcx_photo_consent
rollback;
