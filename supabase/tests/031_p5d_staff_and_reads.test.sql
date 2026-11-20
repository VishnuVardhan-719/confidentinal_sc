\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _p5d_fixture.inc
-- P5 doctor block: organisation staff doctors (review M2), doctor read views (review H2),
-- self-dealing at accept (design B-6, D30), cross-category denial (D19), kept reservations
-- (D02), overdue busy (D31) and replay after offboarding (contract §13.3).
-- Organisation A doctor provider c3..01; W1 c1..02 (resource c6..01), W2 c1..03 (c6..02),
-- scheduler M c1..01, organisation B staff WB c1..08, outsider X c1..09, patient b1..01.

-- 1. Staff visits. s1 stays two days ahead; s2/s3 (W1) and s4/s5 (W2) move into the window.
select pg_temp.p5_book('doctor',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001']::uuid[]) as s1 \gset
select pg_temp.p5_book('doctor',pg_temp.p5_at(2,1),array['c6000000-0000-4000-8000-000000000001']::uuid[]) as s2 \gset
select pg_temp.p5_book('doctor',pg_temp.p5_at(2,2),array['c6000000-0000-4000-8000-000000000001']::uuid[]) as s3 \gset
select pg_temp.p5_book('doctor',pg_temp.p5_at(3),array['c6000000-0000-4000-8000-000000000002']::uuid[]) as s4 \gset
select pg_temp.p5_book('doctor',pg_temp.p5_at(3,1),array['c6000000-0000-4000-8000-000000000002']::uuid[]) as s5 \gset
select pg_temp.p5_shift(:'s2',now()+interval '50 minutes');
select pg_temp.p5_shift(:'s3',now()+interval '10 minutes');
select pg_temp.p5_shift(:'s4',now()+interval '10 minutes');
select pg_temp.p5_shift(:'s5',now()+interval '50 minutes');
select pg_temp.assert_true((select count(*)=5 and bool_and(v.substate='scheduled' and b.version=4) from public.bookings b join public.doctor_visits v on v.booking_id=b.id
 where b.id in (:'s1',:'s2',:'s3',:'s4',:'s5')),'staff visits accepted by the scheduler start scheduled at version 4');

-- 2. D06/D07: only the assigned staff doctor, only inside the window.
set local role authenticated;
select set_config('p5d.s2',:'s2',true);
do $$ declare u uuid; begin
 foreach u in array array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000008',
  'c1000000-0000-4000-8000-000000000009','b1000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',current_setting('p5d.s2')),'42501',u||' is not the assigned doctor');
  perform pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,4,''doctor_unable'',gen_random_uuid())',current_setting('p5d.s2')),'42501',u||' cannot interrupt');
 end loop;
end $$;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'s1'),'42501','before start_at - 60 min');

-- 3. D08: expired Q06 before start; the list still shows the visits with credential_ok=false.
reset role;
select pg_temp.expire_case('c1000000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'s2'),'42501','expired credential cannot start');
select pg_temp.assert_true((select count(*)=3 and bool_and(not (j->>'credential_ok')::boolean and not (j->>'can_act_now')::boolean)
 from public.list_my_doctor_visits() j),'expired doctor still lists own visits, flagged');
reset role;
select pg_temp.expire_case('c1000000-0000-4000-8000-000000000002',false);
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');

-- 4. D32: list_my_doctor_visits key set, ownership, paging and input checks.
select pg_temp.assert_true((select array_agg(j->>'id' order by (j->>'start_at')::timestamptz) from public.list_my_doctor_visits() j)
 =array[:'s3',:'s2',:'s1'],'W1 sees exactly their own visits in (start_at,id) order');
select pg_temp.assert_true((select bool_and(pg_temp.keys(j)=array['awaiting_code','can_act_now','can_close','credential_ok','end_at','id','pin_code',
 'provider_reference','public_ref','start_at','state','substate','version']) from public.list_my_doctor_visits() j),'list row key set is exact');
select pg_temp.assert_true((select bool_and((j->>'can_act_now')::boolean=(j->>'id'<>:'s1') and (j->>'credential_ok')::boolean and not (j->>'can_close')::boolean)
 from public.list_my_doctor_visits() j),'can_act_now follows the window; nothing to close yet');
select (j->>'start_at') as c_start, (j->>'id') as c_id from public.list_my_doctor_visits(1) j \gset
select pg_temp.assert_true((select array_agg(j->>'id') from public.list_my_doctor_visits(1,:'c_start'::timestamptz,:'c_id'::uuid) j)=array[:'s2'],'keyset page two');
select pg_temp.expect_state('select public.list_my_doctor_visits(51)','22023','limit 51 rejected');
select pg_temp.expect_state('select public.list_my_doctor_visits(0)','22023','limit 0 rejected');
select pg_temp.expect_state(format('select public.list_my_doctor_visits(5,%L,null)',now()),'22023','half cursor rejected');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)=0 from public.list_my_doctor_visits()),'the scheduler is not a doctor on these visits');
reset role;
update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select count(*)=0 from public.list_my_doctor_visits()),'offboarded doctor lists nothing (P5-13)');
reset role;
update public.organization_members set status='active' where profile_id='c1000000-0000-4000-8000-000000000002';
set local role authenticated;

-- 5. D33/D34: get_doctor_visit is the patient's alone.
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.get_doctor_visit(:'s2') as g2 \gset
select pg_temp.assert_true(pg_temp.keys(:'g2'::jsonb)=array['arrival_code_expires_at','arrival_fallback_expires_at','doctor','end_at','id','provider_name',
 'provider_reference','public_ref','reviews','start_at','state','substate','timeline','version'],'patient visit key set is exact');
select pg_temp.assert_true(pg_temp.keys((:'g2'::jsonb)->'doctor')=array['credential_verified','name'] and ((:'g2'::jsonb)#>>'{doctor,credential_verified}')::boolean
 and (:'g2'::jsonb)->>'substate'='scheduled' and (:'g2'::jsonb)->'reviews'='[]'::jsonb,'doctor block has name and credential status only');
select pg_temp.assert_true((select array_agg(e->>'reason') from jsonb_array_elements((:'g2'::jsonb)->'timeline') e)=array['requested','accepted','confirmed']
 and (select bool_and(pg_temp.keys(e)=array['occurred_at','reason']) from jsonb_array_elements((:'g2'::jsonb)->'timeline') e),'timeline has reason and time only');
select pg_temp.assert_true(position('c1000000-0000-4000-8000-000000000002' in :'g2')=0 and position('c6000000' in :'g2')=0
 and position('+91' in :'g2')=0 and position('Synthetic exact address' in :'g2')=0,'no actor, resource, phone or address in the patient view');
select set_config('p5d.s2',:'s2',true);
do $$ declare u uuid; begin
 foreach u in array array['c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000009']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.get_doctor_visit(%L)',current_setting('p5d.s2')),'P0002',u||' gets not_found');
 end loop;
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.get_doctor_visit(%L)',gen_random_uuid()),'P0002','unknown id gets the same not_found');
end $$;

-- 6. Full staff path on s2, completed early (D01, D02): access ends, the reservation is kept and
-- blocks an overlapping accept; availability edits wait for the upper bound (shared §11.3).
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.to_started(:'s2','c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select bool_and((j->>'can_close')::boolean) from public.list_my_doctor_visits() j where j->>'id'=:'s2'),'started visit can be closed');
select pg_temp.assert_true(public.advance_visit(:'s2','service_completed',8,gen_random_uuid())=9,'staff doctor completes');
select pg_temp.assert_true((select count(*)=0 from public.list_my_doctor_visits() j where j->>'id'=:'s2'),'completed visit leaves the list');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select array_agg(e->>'reason') from jsonb_array_elements(public.get_doctor_visit(:'s2')->'timeline') e)
 =array['requested','accepted','confirmed','en_route','arrived','arrival_verified','service_started','service_completed'],'patient timeline follows every milestone');
reset role;
select pg_temp.assert_true((select bool_and(a.status='ended') and bool_and(r.status='active') from public.booking_assignments a
 join public.resource_reservations r on r.assignment_id=a.id where a.booking_id=:'s2'),'assignment ended, reservation kept');
select pg_temp.p5_create('doctor',(select start_at from public.bookings where id=:'s2')) as overlap \gset
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000001''::uuid])',:'overlap'),'23P01','accept inside the kept reservation rejected (D02)');

-- 7. D09: Q06 lapses during the visit; completion still records, flagged for review.
set local role authenticated;
select pg_temp.to_started(:'s4','c1000000-0000-4000-8000-000000000003');
reset role;
select pg_temp.expire_case('c1000000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true((select not (j->>'can_act_now')::boolean and (j->>'can_close')::boolean and not (j->>'credential_ok')::boolean
 from public.list_my_doctor_visits() j where j->>'id'=:'s4'),'lapsed doctor sees the visit as closable only (P5-14)');
select pg_temp.assert_true(public.advance_visit(:'s4','service_completed',8,gen_random_uuid())=9,'completion through closeout');
reset role;
select pg_temp.assert_true((select array_agg(kind||':'||reason||':'||status) from public.booking_exceptions where booking_id=:'s4')
 =array['closed_while_ineligible:service_completed:open'],'one closed_while_ineligible exception');
select pg_temp.expire_case('c1000000-0000-4000-8000-000000000003',false);

-- 8. Assignment-ending replay after offboarding, credential expiry and gate suspension (§13.3).
set local role authenticated;
select gen_random_uuid() as k_ab \gset
select pg_temp.to_arrived(:'s5','c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(public.report_patient_absent(:'s5',6,:'k_ab')=7,'absence');
select pg_temp.expect_state(format('select public.get_assignment_contact(%L)',:'s5'),'P0002','contact ends with the absence (D11)');
reset role;
update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.assert_true(public.report_patient_absent(:'s5',6,:'k_ab')=7,'absence replay after membership revocation');
select pg_temp.expect_state(format('select public.report_patient_absent(%L,7,%L)',:'s5',:'k_ab'),'40001','same key, changed version conflicts');
reset role;
update public.organization_members set status='active' where profile_id='c1000000-0000-4000-8000-000000000003';
set local role authenticated;
select gen_random_uuid() as k_in \gset
select pg_temp.to_arrived(:'s3','c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.interrupt_doctor_visit(:'s3',6,'address_not_found',:'k_in')=7,'pre-start interruption');
reset role;
select pg_temp.expire_case('c1000000-0000-4000-8000-000000000002');
select pg_temp.set_gate('suspended');
set local role authenticated;
select pg_temp.assert_true(public.interrupt_doctor_visit(:'s3',6,'address_not_found',:'k_in')=7,'interruption replay after Q06 expiry and gate suspension');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,6,''doctor_unable'',%L)',:'s3',:'k_in'),'40001','same key, changed reason conflicts');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.expect_state(format('select public.interrupt_doctor_visit(%L,6,''address_not_found'',%L)',:'s3',:'k_in'),'42501','another actor with that key gets an ordinary, denied call');
reset role;
select pg_temp.expire_case('c1000000-0000-4000-8000-000000000002',false);
select pg_temp.set_gate('on');
select pg_temp.assert_true(pg_temp.events(:'s3')=7 and pg_temp.events(:'s5')=7,'replays wrote no events; s3 '||coalesce((select string_agg(aggregate_version||':'||reason,',' order by aggregate_version) from public.booking_events where booking_id=:'s3'),'-')||' s5 '||coalesce((select string_agg(aggregate_version||':'||reason,',' order by aggregate_version) from public.booking_events where booking_id=:'s5'),'-'));

-- 9. D19: doctor commands on a lab booking assigned to the same person.
select pg_temp.p5_book('lab',pg_temp.p5_at(4),array['c6000000-0000-4000-8000-000000000002']::uuid[]) as lab \gset
select pg_temp.p5_shift(:'lab',now()-interval '25 minutes');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_true(identity_private.is_assigned(:'lab','lab_collection'),'W2 is the live lab assignee');
set local role authenticated;
select pg_temp.expect_state(format('select public.advance_visit(%L,''en_route'',4,gen_random_uuid())',:'lab'),'42501','advance_visit refuses a lab booking');
select pg_temp.expect_state(format('select public.report_patient_absent(%L,4,gen_random_uuid())',:'lab'),'42501','absence refuses a lab booking');
select pg_temp.expect_state(format('select public.verify_arrival_code(%L,''123456'',4,gen_random_uuid())',:'lab'),'42501','verify refuses a lab booking');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.issue_arrival_code(%L,gen_random_uuid())',:'lab'),'55000','no arrival code for a lab booking');
select pg_temp.expect_state(format('select public.get_doctor_visit(%L)',:'lab'),'P0002','no doctor view of a lab booking');
reset role;

-- 10. D30: self-dealing. (a) the doctor is the patient; (b) the doctor requested the booking.
insert into public.patients(id,self_profile_id) values ('d2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002');
insert into public.consent_events(id,actor_profile_id,patient_id,purpose,policy_version,decision) values
 ('d2100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','self_patient_access','synthetic-v1','granted');
insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
 select 'd2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',s,'d2100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'
 from unnest(array['booking:read','booking:create','profile:read','profile:write']) s;
insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
 select 'b2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002',s,'b2100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001'
 from unnest(array['booking:read','booking:create']) s;
insert into public.patient_addresses(id,patient_id,line1,locality,pin_code,contact_name,phone) values
 ('d5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Synthetic doctor home','Synthetic','599991','Synthetic doctor','+919999999998');
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select public.create_booking_request('d2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',
 date_trunc('day',now())+interval '3 days 4 hours',gen_random_uuid()) as selfb \gset
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'selfb'),'42501','doctor cannot accept a visit to themself');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',
 pg_temp.p5_at(6),gen_random_uuid()) as reqb \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''c6000000-0000-4000-8000-000000000001''::uuid])',:'reqb'),'42501','scheduler cannot assign the requesting doctor');
select pg_temp.assert_true(public.accept_booking(:'reqb',2,array['c6000000-0000-4000-8000-000000000002'::uuid])=4,'another doctor may take the booking');
reset role;
select pg_temp.assert_true(pg_temp.state(:'selfb')='requested' and (select count(*)=0 from public.booking_assignments where booking_id=:'selfb'),'refused accept left nothing behind');

-- 11. D31: a doctor with an overdue, unclosed visit cannot be booked (shared reservation guard).
select pg_temp.p5_book('doctor',pg_temp.p5_at(5),array['c6000000-0000-4000-8000-000000000002']::uuid[]) as late \gset
select pg_temp.p5_shift(:'late',now()-interval '3 hours');
select pg_temp.p5_create('doctor',pg_temp.p5_at(7)) as next \gset
select pg_temp.expect_state(format('select pg_temp.p5_accept(%L,array[''c6000000-0000-4000-8000-000000000002''::uuid])',:'next'),'55000','overdue doctor is busy');

\echo 1..1
\echo ok 1 - p5d_staff_and_reads
rollback;
