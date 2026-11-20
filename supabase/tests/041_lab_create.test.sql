\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab create (design S12.1 021, S7.1; contract S7.1, S7.3, S13.1). Authored; DB NOT EXECUTED.
-- Lab policy: lead 120 min, horizon 30 days. Lab service: 30 minutes, 8 h fasting.

create function pg_temp.lab_try(p_start timestamptz,p_ack boolean,p_key uuid default gen_random_uuid(),p_patient uuid default 'b2000000-0000-4000-8000-000000000001',
 p_address uuid default 'b5000000-0000-4000-8000-000000000001') returns text language sql as $$
 select format('select public.create_lab_booking_request(%L,%L,%L,%L,%L,%L)',p_patient,pg_temp.p5_service('lab'),p_address,p_start,p_ack,p_key); $$;

do $$ declare b uuid; s uuid:=pg_temp.p5_service('lab'); st text; k uuid; i public.lab_order_items; o public.lab_orders; bk public.bookings; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 -- 1. Gate off and suspended: 55000 feature_unavailable; nothing written.
 foreach st in array array['off','suspended'] loop
  update booking_private.feature_gates set state=st where key='lab';
  perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(1),true),'55000','create with the gate '||st);
 end loop;
 update booking_private.feature_gates set state='on' where key='lab';
 perform pg_temp.assert_true(not exists(select 1 from public.bookings where category='lab'),'no lab booking written while the gate was closed');
 -- 2. Generic create refuses lab (contract S7.1), gate on or off.
 foreach st in array array['on','off'] loop
  update booking_private.feature_gates set state=st where key='lab';
  perform pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,%L,gen_random_uuid())','b2000000-0000-4000-8000-000000000001',s,'b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(1)),'55000','generic create refuses lab, gate '||st);
 end loop;
 update booking_private.feature_gates set state='on' where key='lab';
 -- 3. Happy path: booking, order, single item, one requested event.
 b:=pg_temp.lab_create(pg_temp.p5_at(1));
 select * into bk from public.bookings where id=b;
 select * into o from public.lab_orders where booking_id=b;
 select * into i from public.lab_order_items where booking_id=b;
 perform pg_temp.assert_true(bk.state='requested' and bk.category='lab' and bk.end_at=bk.start_at+interval '30 minutes','requested lab booking');
 perform pg_temp.assert_true(o.substate='pending' and o.policy_version_id='c7000000-0000-4000-8000-000000000001' and o.before_buffer_minutes=30
  and o.after_buffer_minutes=90 and o.preparation_ack_at is not null and o.assignment_id is null and o.version=1,'pending order with the policy snapshot and ack');
 perform pg_temp.assert_true(i.service_id=bk.service_id and i.price_version_id=bk.price_version_id and i.unit_paise=bk.amount_paise and i.line_paise=bk.amount_paise
  and i.quantity=1 and i.title_snapshot=(select title from public.services where id=s) and i.sample_type='venous_blood' and i.container_codes=array['edta','serum']
  and i.fasting_hours=8 and i.preparation_code='fasting','item copies the booking price and the lab test');
 perform pg_temp.assert_true((select count(*)=1 from public.lab_order_items where booking_id=b),'single item (D1)');
 perform pg_temp.assert_true((select array_agg(reason order by aggregate_version)=array['requested'] from public.booking_events where booking_id=b),'one requested event');
 perform pg_temp.assert_true((select count(*)=1 from public.idempotency_requests where action='lab.create' and result_id=b),'one lab.create replay row');
 perform pg_temp.expect_state(format('insert into public.lab_order_items(booking_id,service_id,price_version_id,title_snapshot,unit_paise,line_paise,sample_type,container_codes,fasting_hours,preparation_code) values (%L,%L,%L,''x'',%s,%s,''urine'',array[''urine_cup''],0,''none'')',b,s,bk.price_version_id,bk.amount_paise,bk.amount_paise),'23505','second item refused');
 perform pg_temp.expect_state(format('update public.lab_order_items set title_snapshot=''changed'' where booking_id=%L',b),'55000','item immutable');
 perform pg_temp.expect_state(format('delete from public.lab_orders where booking_id=%L',b),'55000','order never deleted');
 perform pg_temp.expect_state(format('update public.lab_orders set substate=''collecting'',version=version+1 where booking_id=%L',b),'55000','order cannot skip scheduled');
 perform pg_temp.expect_state(format('update public.lab_orders set before_buffer_minutes=0,version=version+1 where booking_id=%L',b),'55000','policy snapshot immutable');
 perform pg_temp.expect_state(format('insert into public.lab_orders(booking_id,policy_version_id,before_buffer_minutes,after_buffer_minutes) values (%L,''c7000000-0000-4000-8000-000000000001'',30,90)',
  pg_temp.p5_raw('doctor','requested',pg_temp.p5_at(9))),'55000','orders only for lab bookings');
 -- 4. Lead time and horizon (22023); no published lab policy (55000).
 perform pg_temp.expect_state(pg_temp.lab_try(clock_timestamp()+interval '119 minutes',true),'22023','inside the 120 minute lead');
 perform pg_temp.expect_state(pg_temp.lab_try(clock_timestamp()+interval '31 days',true),'22023','beyond the 30 day horizon');
 -- 5. Preparation acknowledgement: required for a fasting test.
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(2),false),'22023','fasting test without acknowledgement');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(2),null),'22023','fasting test with a null acknowledgement');
 -- 6. MR-08: an overlapping open lab request is refused; a non-overlapping one is accepted.
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(1,0.25),true),'55000','overlapping lab request');
 b:=pg_temp.lab_create(pg_temp.p5_at(1,0.5));
 perform pg_temp.assert_true(pg_temp.lab_state(b)='requested','adjacent half-open lab request accepted');
 -- MR-08 ignores requests whose end_at has passed. With a 30 minute test and a 120 minute
 -- lead such a request can never overlap a new one, so that branch has no observable case here.
end $$;

-- 7. Self-dealing (LAB-Q07): the patient's self profile is a member of the lab's organisation,
-- in any membership status, or the individual owner. Use the second patient Q.
insert into public.patient_addresses(id,patient_id,line1,locality,pin_code,contact_name,phone) values
 ('c9500000-0000-4000-8000-000000000002','c9200000-0000-4000-8000-000000000002','Synthetic Q address','Synthetic','599991','Synthetic Q','+919999999998');
do $$ declare st text; begin
 foreach st in array array['invited','disabled','active'] loop
  insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes,invite_expires_at) values
   ('c8000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002','staff',st,case when st='active' then now() end,'{}',case when st='invited' then now()+interval '14 days' end);
  perform pg_temp.as_user('c9000000-0000-4000-8000-000000000002');
  perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(4),true,gen_random_uuid(),'c9200000-0000-4000-8000-000000000002','c9500000-0000-4000-8000-000000000002'),'42501','self-dealing, '||st||' member');
  delete from public.organization_members where profile_id='c9000000-0000-4000-8000-000000000002';
 end loop;
 perform pg_temp.as_user('c9000000-0000-4000-8000-000000000002');
 perform pg_temp.assert_true(public.create_lab_booking_request('c9200000-0000-4000-8000-000000000002',pg_temp.p5_service('lab'),'c9500000-0000-4000-8000-000000000002',pg_temp.p5_at(4),true,gen_random_uuid()) is not null,'Q books once no membership row exists');
 -- Another patient's id or address: 42501.
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(5),true),'42501','another patient''s id');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(5),true,gen_random_uuid(),'c9200000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000001'),'42501','another patient''s address');
end $$;

-- 9. Replay precedes the gate and caps; a changed argument conflicts.
do $$ declare k uuid:=gen_random_uuid(); b uuid; n integer; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 b:=public.create_lab_booking_request('b2000000-0000-4000-8000-000000000001',pg_temp.p5_service('lab'),'b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(6),true,k);
 select count(*) into n from public.bookings where category='lab';
 update booking_private.feature_gates set state='off' where key='lab';
 perform pg_temp.assert_true(public.create_lab_booking_request('b2000000-0000-4000-8000-000000000001',pg_temp.p5_service('lab'),'b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(6),true,k)=b,'replay with the gate off returns the same id');
 update booking_private.feature_gates set state='on' where key='lab';
 perform pg_temp.assert_true((select count(*) from public.bookings where category='lab')=n,'replay wrote nothing');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(7),true,k),'40001','same key, other start');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(6),false,k),'40001','same key, other acknowledgement');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(6),true,null),'22023','request key required');
end $$;

-- 10. The built pending cap still applies through the lab path (53300 on the 11th requested).
do $$ declare d integer; n integer; begin
 select count(*) into n from public.bookings where patient_id='b2000000-0000-4000-8000-000000000001' and state='requested';
 for d in 8..(8+9-n) loop perform pg_temp.lab_create(pg_temp.p5_at(d)); end loop;
 perform pg_temp.assert_true((select count(*) from public.bookings where patient_id='b2000000-0000-4000-8000-000000000001' and state='requested')=10,'ten open requests');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(25),true),'53300','eleventh open request');
end $$;

-- 5b. A test that needs no preparation: false acknowledgement accepted, no ack time stored.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.set_lab_test(pg_temp.p5_service('lab'),'urine',array['urine_cup'],0,'none',1,gen_random_uuid());
select pg_temp.as_user('c9000000-0000-4000-8000-000000000002');
select public.create_lab_booking_request('c9200000-0000-4000-8000-000000000002',pg_temp.p5_service('lab'),'c9500000-0000-4000-8000-000000000002',pg_temp.p5_at(9),false,gen_random_uuid()) as noprep \gset
select pg_temp.assert_true((select preparation_ack_at is null from public.lab_orders where booking_id=:'noprep'),'no preparation: no acknowledgement stored');
select pg_temp.assert_true((select sample_type='urine' and preparation_code='none' from public.lab_order_items where booking_id=:'noprep'),'item snapshots the current test');

-- 8. home_collection false or missing in the approved snapshot, a service without lab_tests,
-- no published policy: refused. Last, because they change shared fixture rows.
do $$ begin
 perform pg_temp.as_user('c9000000-0000-4000-8000-000000000002');
 alter table public.providers disable trigger i02h_public_snapshot;
 update public.providers set published_profile=published_profile||'{"home_collection":false}' where id=pg_temp.p5_provider('lab');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(10),false,gen_random_uuid(),'c9200000-0000-4000-8000-000000000002','c9500000-0000-4000-8000-000000000002'),'42501','home_collection false');
 update public.providers set published_profile=published_profile-'home_collection' where id=pg_temp.p5_provider('lab');
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(10),false,gen_random_uuid(),'c9200000-0000-4000-8000-000000000002','c9500000-0000-4000-8000-000000000002'),'42501','home_collection missing');
 update public.providers set published_profile=published_profile||'{"home_collection":true}' where id=pg_temp.p5_provider('lab');
 alter table public.providers enable trigger i02h_public_snapshot;
 -- No published lab policy: the only published row becomes unreadable to the command.
 alter table public.lab_policy_versions disable trigger lab_policy_immutable;
 update public.lab_policy_versions set status='disabled' where version=1;
 perform pg_temp.expect_state(pg_temp.lab_try(pg_temp.p5_at(10),false,gen_random_uuid(),'c9200000-0000-4000-8000-000000000002','c9500000-0000-4000-8000-000000000002'),'55000','no published lab policy');
 update public.lab_policy_versions set status='published' where version=1;
 alter table public.lab_policy_versions enable trigger lab_policy_immutable;
 -- A published lab service without a lab test definition.
 insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status)
  values ('c7200000-0000-4000-8000-000000000009',pg_temp.p5_provider('lab'),'lab','c4000000-0000-4000-8000-000000000002','Synthetic lab no test',30,'published');
 insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
  values ('c7200000-0000-4000-8000-000000000009','c4000000-0000-4000-8000-000000000002',1,1000,'visit','synthetic-v1',now()-interval '1 day');
 perform pg_temp.expect_state(format('select public.create_lab_booking_request(%L,%L,%L,%L,true,gen_random_uuid())','c9200000-0000-4000-8000-000000000002',
  'c7200000-0000-4000-8000-000000000009','c9500000-0000-4000-8000-000000000002',pg_temp.p5_at(11)),'42501','service without lab_tests');
end $$;
\echo 1..1
\echo ok 1 - 041_lab_create
rollback;
