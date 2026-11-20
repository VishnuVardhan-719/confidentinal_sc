-- Synthetic rollback-only P5 ambulance fixtures. Include after _b01_fixture.inc and
-- _p5s_fixture.inc; never edits either. Authored, DB NOT EXECUTED.
-- Organisation A's ambulance provider (c3..03) gets an ambulance profile, two vehicles
-- registered, documented, submitted, ticket-read and approved through the public RPCs,
-- and W1/W2 (Q06-approved by _p5s) on its driver roster.
--  a1..01 R  global provider:document_read      a1..02 IO individual ambulance operator
--  a1..03 S3 staff of A, no Q06 case            a1..04 PX second patient (other addresses)
--  a1..05 D  disabled member of A, provider:verify
-- Resources: c6..01 W1 driver, c6..02 W2 driver, c6..03 V01 (patient_transfer, all three
-- requirements), c6..04 V02 (basic, seated); a6..01 org B vehicle; a6..02 org A vehicle
-- (unregistered); a6..03 IO vehicle; a6..04 IO person; a6..05 S3 person; a6..06 WB person.
--
-- Storage objects for vehicle documents are inserted as the fixture owner for brevity; the
-- authenticated upload path through the shared category hook (20261117001591) is exercised
-- in 051_amb_storage. Every other step uses the public RPCs.
reset role;
insert into auth.users(id,email) select ('a1000000-0000-4000-8000-00000000000'||n)::uuid,'p5a-'||n||'@example.invalid' from generate_series(1,5) n;
update public.profiles set display_name='Synthetic driver one' where id='c1000000-0000-4000-8000-000000000002';
update public.profiles set display_name='Synthetic driver two' where id='c1000000-0000-4000-8000-000000000003';
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('a1000000-0000-4000-8000-000000000001','provider:document_read','global','b1000000-0000-4000-8000-000000000004'),
 ('a1000000-0000-4000-8000-000000000002','provider:verify','global','b1000000-0000-4000-8000-000000000004'),
 ('a1000000-0000-4000-8000-000000000005','provider:verify','global','b1000000-0000-4000-8000-000000000004');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('c8000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','staff','active',now(),array['provider:read']),
 ('c8000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000005','staff','disabled',now(),array['provider:read']);
insert into public.ambulance_profiles(provider_id,fleet_types) values ('c3000000-0000-4000-8000-000000000003',array['basic','patient_transfer']);

-- Individual operator IO: approved, publishable, with a verified licence provider document.
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state) values
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','ambulance','active','approved');
insert into public.provider_profiles(provider_id,display_name) values ('a3000000-0000-4000-8000-000000000001','Synthetic P5A individual operator');
insert into public.ambulance_profiles(provider_id,fleet_types) values ('a3000000-0000-4000-8000-000000000001',array['basic']);
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at) values
 ('a3100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','vehicle_permit',
  'a3000000-0000-4000-8000-000000000001/a3100000-0000-4000-8000-000000000001.pdf','application/pdf','verified',now()+interval '1 year'),
 ('a3100000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','licence',
  'a3000000-0000-4000-8000-000000000001/a3100000-0000-4000-8000-000000000002.pdf','application/pdf','verified',now()+interval '1 year');
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where provider_id='a3000000-0000-4000-8000-000000000001';

insert into public.resources(id,kind,vehicle_key,owner_organization_id) values
 ('a6000000-0000-4000-8000-000000000001','vehicle','SYNP5AB1','c8000000-0000-4000-8000-000000000002'),
 ('a6000000-0000-4000-8000-000000000002','vehicle','SYNP5AA2','c8000000-0000-4000-8000-000000000001');
insert into public.resources(id,kind,vehicle_key,owner_profile_id) values
 ('a6000000-0000-4000-8000-000000000003','vehicle','SYNP5AI3','a1000000-0000-4000-8000-000000000002');
insert into public.resources(id,kind,person_profile_id) values
 ('a6000000-0000-4000-8000-000000000004','person','a1000000-0000-4000-8000-000000000002'),
 ('a6000000-0000-4000-8000-000000000005','person','a1000000-0000-4000-8000-000000000003'),
 ('a6000000-0000-4000-8000-000000000006','person','c1000000-0000-4000-8000-000000000008');
insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
 select p,r,d,'00:00','23:59',current_date-2,current_date+365 from generate_series(0,6) d,(values
  ('c3000000-0000-4000-8000-000000000003'::uuid,'a6000000-0000-4000-8000-000000000002'::uuid),
  ('c3000000-0000-4000-8000-000000000003'::uuid,'a6000000-0000-4000-8000-000000000005'::uuid),
  ('a3000000-0000-4000-8000-000000000001'::uuid,'a6000000-0000-4000-8000-000000000003'::uuid),
  ('a3000000-0000-4000-8000-000000000001'::uuid,'a6000000-0000-4000-8000-000000000004'::uuid)) pr(p,r);

-- A long service (above the 360 minute cap) and coverage for the destination tests:
-- 599993 expired coverage, 599994 current coverage. 599992 is never covered.
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values
 ('a4100000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000003','ambulance','c4000000-0000-4000-8000-000000000003','Synthetic P5A long transfer',400,'published');
insert into public.service_price_versions(id,service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from) values
 ('a4200000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000003',1,90000,'visit','synthetic-v1',now()-interval '1 day');
insert into public.pin_directory(pin_code,state,district,city,source_reference) values
 ('599993','Synthetic','Synthetic','Synthetic','P5A rollback-only'),('599994','Synthetic','Synthetic','Synthetic','P5A rollback-only');
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to) values
 ('c3000000-0000-4000-8000-000000000003','599993','c1000000-0000-4000-8000-000000000001','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '2 days',now()-interval '1 day'),
 ('c3000000-0000-4000-8000-000000000003','599994','c1000000-0000-4000-8000-000000000001','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
-- Patient addresses: a5..01 destination in 599991, a5..02 uncovered 599992, a5..03
-- expired-coverage 599993, a5..04 covered 599994; a5..05 belongs to the second patient.
insert into public.patients(id,self_profile_id) values ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004');
insert into public.patient_addresses(id,patient_id,line1,locality,pin_code,contact_name,phone) values
 ('a5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Synthetic destination line','Synthetic district hospital','599991','Synthetic ward desk','+919999999998'),
 ('a5000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','Synthetic uncovered line','Synthetic','599992','Synthetic patient','+919999999999'),
 ('a5000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001','Synthetic lapsed line','Synthetic','599993','Synthetic patient','+919999999999'),
 ('a5000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000001','Synthetic second line','Synthetic','599994','Synthetic patient','+919999999999'),
 ('a5000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000001','Synthetic other patient line','Synthetic','599991','Synthetic other','+919999999997');

-- Fleet through the public commands: register, four documents, submit, read tickets, approve.
do $$ declare v uuid; k text; d jsonb; ver integer; begin
 foreach v in array array['c6000000-0000-4000-8000-000000000003','c6000000-0000-4000-8000-000000000004']::uuid[] loop
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  ver:=public.register_ambulance_vehicle('c3000000-0000-4000-8000-000000000003',v,
   case when v='c6000000-0000-4000-8000-000000000003' then 'patient_transfer' else 'basic' end,
   case when v='c6000000-0000-4000-8000-000000000003' then array['seated','wheelchair','stretcher'] else array['seated'] end,0);
  foreach k in array ambulance_private.required_vehicle_kinds() loop
   d:=public.add_vehicle_document(v,k,'application/pdf',now()+interval '1 year',ver);
   ver:=(d->>'version')::integer;
   insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
  end loop;
  ver:=public.submit_vehicle_case(v,ver);
  perform pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
  perform public.authorize_vehicle_document_read(x.id,'admin_review') from public.vehicle_credential_documents x
   where x.vehicle_resource_id=v and x.status='pending';
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
  perform public.review_vehicle_case(v,'approved','Synthetic vehicle papers reviewed',ver);
 end loop;
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform public.set_ambulance_driver('c3000000-0000-4000-8000-000000000003','c6000000-0000-4000-8000-000000000001','active',0);
 perform public.set_ambulance_driver('c3000000-0000-4000-8000-000000000003','c6000000-0000-4000-8000-000000000002','active',0);
end $$;
select set_config('request.jwt.claims','',true);

-- Helpers. All run as the fixture owner; claims select the acting profile.
create function pg_temp.amb_provider() returns uuid language sql as $$ select 'c3000000-0000-4000-8000-000000000003'::uuid; $$;
create function pg_temp.amb_service() returns uuid language sql as $$ select 'c4100000-0000-4000-8000-000000000003'::uuid; $$;
-- Patient request through request_transport; pickup b5..01 (599991), destination a5..01 by default.
create function pg_temp.amb_request(p_start timestamptz,p_requirement text default 'seated',p_dest uuid default 'a5000000-0000-4000-8000-000000000001',
 p_key uuid default null) returns uuid language plpgsql as $$
begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 return public.request_transport('b2000000-0000-4000-8000-000000000001',pg_temp.amb_service(),'b5000000-0000-4000-8000-000000000001',
  p_dest,p_requirement,p_start,coalesce(p_key,gen_random_uuid()));
end $$;
-- Scheduler M accepts with a driver and a vehicle (W1 and V01 by default).
create function pg_temp.amb_accept(p_booking uuid,p_driver uuid default 'c6000000-0000-4000-8000-000000000001',
 p_vehicle uuid default 'c6000000-0000-4000-8000-000000000003',p_key uuid default null) returns integer language plpgsql as $$
begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 return public.accept_transport(p_booking,(select version from public.bookings where id=p_booking),p_driver,p_vehicle,coalesce(p_key,gen_random_uuid()));
end $$;
create function pg_temp.amb_trip(p_start timestamptz,p_driver uuid default 'c6000000-0000-4000-8000-000000000001',
 p_vehicle uuid default 'c6000000-0000-4000-8000-000000000003',p_requirement text default 'seated') returns uuid language plpgsql as $$
declare b uuid:=pg_temp.amb_request(p_start,p_requirement); begin perform pg_temp.amb_accept(b,p_driver,p_vehicle); return b; end $$;
-- Move an accepted trip so the driver can set off now (start 10 minutes ahead by default).
create function pg_temp.amb_live(p_booking uuid,p_start timestamptz default null) returns void language sql as $$
 select pg_temp.p5_shift(p_booking,coalesce(p_start,now()+interval '10 minutes')); $$;
-- A driver step at the current version with a fresh key.
create function pg_temp.amb_step(p_booking uuid,p_step text,p_actor uuid default 'c1000000-0000-4000-8000-000000000002',
 p_reason text default null,p_key uuid default null) returns jsonb language plpgsql as $$
begin
 perform pg_temp.as_user(p_actor);
 return public.advance_trip(p_booking,p_step,(select version from public.bookings where id=p_booking),coalesce(p_key,gen_random_uuid()),p_reason);
end $$;
create function pg_temp.amb_substate(p_booking uuid) returns text language sql as $$
 select b.state||'/'||t.substate from public.bookings b join public.transport_trips t on t.booking_id=b.id where b.id=p_booking; $$;
create function pg_temp.amb_events(p_booking uuid) returns integer language sql as $$
 select count(*)::integer from public.booking_events where booking_id=p_booking; $$;
-- Finish a trip and move it far into the past so its resources are free again.
create function pg_temp.amb_retire(p_booking uuid,p_hours integer) returns void language plpgsql as $$
begin perform pg_temp.p5_shift(p_booking,now()-p_hours*interval '1 hour'); end $$;
-- Temporarily lapse or restore one verified paper of a vehicle (guard bypassed as owner).
create function pg_temp.amb_lapse(p_vehicle uuid,p_lapsed boolean) returns void language plpgsql as $$
begin
 alter table public.vehicle_credential_documents disable trigger amb_document_guard;
 update public.vehicle_credential_documents set expires_at=case when p_lapsed then now()-interval '1 second' else now()+interval '1 year' end
  where vehicle_resource_id=p_vehicle and kind='insurance' and status='verified';
 alter table public.vehicle_credential_documents enable trigger amb_document_guard;
end $$;
