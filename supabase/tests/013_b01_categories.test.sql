\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
-- Rewritten for P5 admission paths (contract §7, R P5-16). Lab and ambulance never use the
-- generic create/accept/slots path, gate on or off. Caretaker uses generic create; generic
-- accept stays 55000 until the care block flips category_paths.generic_accept.

reset role;
create function pg_temp.category_provider(p_category text) returns uuid language plpgsql as $$
declare p uuid; ct uuid; s uuid; begin
 insert into public.providers(id,individual_owner_profile_id,category,status,verification_state)
  values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000002',p_category,'active','approved') returning id into p;
 insert into public.provider_profiles(provider_id,display_name) values(p,'Synthetic '||p_category);
 insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
  select d,p,'b1000000-0000-4000-8000-000000000002',providers_private.required_kind(p_category),p::text||'/'||d::text||'.pdf','application/pdf','verified',now()+interval '1 year'
  from (select gen_random_uuid() d) g;
 insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where provider_id=p;
 insert into public.service_catalog_types(id,code,category,name,unit) values(gen_random_uuid(),'b01_'||p_category,p_category,'Synthetic '||p_category,'visit') returning id into ct;
 insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values(gen_random_uuid(),p,p_category,ct,'Synthetic '||p_category,30,'published') returning id into s;
 insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
  values(s,ct,1,10000,'visit','synthetic-v1',now()-interval '1 day');
 insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to)
  values(p,'599991','b1000000-0000-4000-8000-000000000002','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
 insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
  select p,'b6000000-0000-4000-8000-000000000001',d,'00:00','23:59',current_date,current_date+365 from generate_series(0,6) d;
 return s;
end $$;
select pg_temp.category_provider('lab') as lab_service \gset
select pg_temp.category_provider('ambulance') as amb_service \gset
select pg_temp.category_provider('caretaker') as care_service \gset
select provider_id as lab_provider from public.services where id=:'lab_service' \gset
select provider_id as amb_provider from public.services where id=:'amb_service' \gset
select ((clock_timestamp() at time zone 'Asia/Kolkata')::date+2)::text as day \gset
-- Requested lab and ambulance bookings exist only through the shared core (category commands call it).
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select booking_private.create_request_core('b2000000-0000-4000-8000-000000000001',:'lab_service','b5000000-0000-4000-8000-000000000001',now()+interval '2 days',gen_random_uuid(),'lab.create','synthetic-hash-lab',interval '0',interval '90 days') as lab_booking \gset
select booking_private.create_request_core('b2000000-0000-4000-8000-000000000001',:'amb_service','b5000000-0000-4000-8000-000000000001',now()+interval '2 days 2 hours',gen_random_uuid(),'transport.create','synthetic-hash-amb',interval '0',interval '90 days') as amb_booking \gset
select set_config('p5.lab_service',:'lab_service',true),set_config('p5.amb_service',:'amb_service',true),
 set_config('p5.lab_provider',:'lab_provider',true),set_config('p5.amb_provider',:'amb_provider',true),
 set_config('p5.lab_booking',:'lab_booking',true),set_config('p5.amb_booking',:'amb_booking',true),set_config('p5.day',:'day',true);

do $$ declare g text; begin
 foreach g in array array['on','off'] loop
  update booking_private.feature_gates set state=g where key in ('lab','ambulance');
  perform set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
  set local role authenticated;
  perform pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,now()+interval ''3 days'',gen_random_uuid())',
   'b2000000-0000-4000-8000-000000000001',current_setting('p5.lab_service'),'b5000000-0000-4000-8000-000000000001'),'55000','generic lab create refused, gate '||g);
  perform pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,now()+interval ''3 days'',gen_random_uuid())',
   'b2000000-0000-4000-8000-000000000001',current_setting('p5.amb_service'),'b5000000-0000-4000-8000-000000000001'),'55000','generic ambulance create refused, gate '||g);
  perform pg_temp.assert_true((select count(*)=0 from public.list_slots(current_setting('p5.lab_provider')::uuid,current_setting('p5.lab_service')::uuid,current_setting('p5.day')::date)),'generic lab slots empty, gate '||g);
  perform pg_temp.assert_true((select count(*)=0 from public.list_slots(current_setting('p5.amb_provider')::uuid,current_setting('p5.amb_service')::uuid,current_setting('p5.day')::date)),'generic ambulance slots empty, gate '||g);
  perform set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
  perform pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',current_setting('p5.lab_booking')),'55000','generic lab accept refused, gate '||g);
  perform pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',current_setting('p5.amb_booking')),'55000','generic ambulance accept refused, gate '||g);
  reset role;
 end loop;
end $$;
-- Messages: the path refusal is use_category_command regardless of the gate.
do $$ declare m text; begin
 perform set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
 begin perform public.create_booking_request('b2000000-0000-4000-8000-000000000001',current_setting('p5.lab_service')::uuid,'b5000000-0000-4000-8000-000000000001',now()+interval '3 days',gen_random_uuid());
 exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='use_category_command','lab create message');
 perform set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
 m:=null;
 begin perform public.accept_booking(current_setting('p5.amb_booking')::uuid,2,array['b6000000-0000-4000-8000-000000000001'::uuid]);
 exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='use_category_command','ambulance accept message');
end $$;

-- Caretaker: generic create with the gate on; generic accept refused until care's block.
-- Fixed 10:00 IST slot: now()+N hours crossed IST midnight when CI ran near 14:00-18:30 UTC, and
-- the fixture schedule (00:00-23:59 per day) then refused it with 40001 schedule_changed.
update booking_private.feature_gates set state='on';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'care_service','b5000000-0000-4000-8000-000000000001',(:'day'||' 10:00 Asia/Kolkata')::timestamptz,gen_random_uuid()) as care_booking \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'care_booking'),'55000','caretaker acceptance deferred to the care block');
select pg_temp.assert_true(public.get_booking(:'care_booking')->>'state'='requested','caretaker remains requested');
select pg_temp.assert_true(public.get_booking(:'lab_booking')->>'state'='requested','lab remains requested');
select pg_temp.assert_true(public.get_booking(:'amb_booking')->>'state'='requested','ambulance remains requested');
reset role;
update booking_private.feature_gates set state='off' where key='caretaker';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,now()+interval ''3 days'',gen_random_uuid())','b2000000-0000-4000-8000-000000000001',:'care_service','b5000000-0000-4000-8000-000000000001'),'55000','caretaker create gated off');
reset role;
select pg_temp.assert_true((select count(*)=0 from public.booking_assignments),'no deferred assignments');
select pg_temp.assert_true((select count(*)=3 from public.bookings),'only the three requested bookings exist');
\echo 1..1
\echo ok 1 - b01_categories
rollback;
