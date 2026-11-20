-- Synthetic rollback-only P5 care fixtures. Include after _b01_fixture.inc and _p5s_fixture.inc.
-- Care provider A is pg_temp.p5_provider('caretaker') (organisation A; W1 c1..02 and W2 c1..03
-- verified through the public Q06 path); its only service c41..04 (30 min, visit) gets a task
-- list here. Organisation B (owner MB c1..07) gets caretaker provider e3..01, where W1 is also
-- verified staff. Extra services live on B so pg_temp.p5_service('caretaker') stays unique.
--  e1..01 CM manager of A (provider:manage, provider:read), not a scheduler
--  e1..02 CS staff of A with schedule:manage only
--  e1..03 CU staff of A (provider:read), no Q06 case        resource e6..03
--  e1..04 P2 second patient, also verified care staff of A   resource e6..04
-- Services on B: e41..01 240 min visit (tasks), e41..03 hourly (tasks inserted by the owner),
-- e41..04 721 min (tasks inserted by the owner), e41..05 visit without a task list.
reset role;
insert into auth.users(id,email) select ('e1000000-0000-4000-8000-00000000000'||n)::uuid,'p5c-'||n||'@example.invalid' from generate_series(1,4) n;
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('c8000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','manager','active',now(),array['provider:read','provider:manage']),
 ('c8000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','staff','active',now(),array['schedule:manage']),
 ('c8000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','staff','active',now(),array['provider:read']),
 ('c8000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','staff','active',now(),array['provider:read']),
 ('c8000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','staff','active',now(),array['provider:read']);
-- P2 is a patient with self access and an address in the covered PIN.
insert into public.patients(id,self_profile_id) values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004');
insert into public.consent_events(id,actor_profile_id,patient_id,purpose,policy_version,decision) values
 ('e2100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000001','self_patient_access','synthetic-v1','granted');
insert into public.patient_access(patient_id,grantee_profile_id,scope,consent_event_id,granted_by)
 select 'e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',s,'e2100000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004'
 from unnest(array['booking:read','booking:create','profile:read','profile:write']) s;
insert into public.patient_addresses(id,patient_id,line1,locality,pin_code,contact_name,phone) values
 ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Synthetic exact address two','Synthetic','599991','Synthetic patient two','+919999999998');
-- Organisation B caretaker provider.
insert into public.providers(id,organization_id,category,status,verification_state) values
 ('e3000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000002','caretaker','active','approved');
insert into public.provider_profiles(provider_id,display_name) values ('e3000000-0000-4000-8000-000000000001','Synthetic P5 care B');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at) values
 ('e3100000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000007','background_check',
  'e3000000-0000-4000-8000-000000000001/e3100000-0000-4000-8000-000000000001.pdf','application/pdf','verified',now()+interval '1 year');
insert into storage.objects(bucket_id,name) values ('provider-verification','e3000000-0000-4000-8000-000000000001/e3100000-0000-4000-8000-000000000001.pdf');
insert into public.service_catalog_types(id,code,category,name,unit) values
 ('e4000000-0000-4000-8000-000000000001','p5c_hourly','caretaker','Synthetic hourly care','hour');
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values
 ('e4100000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','caretaker','c4000000-0000-4000-8000-000000000004','Synthetic care B',240,'published'),
 ('e4100000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000001','caretaker','e4000000-0000-4000-8000-000000000001','Synthetic hourly care',240,'published'),
 ('e4100000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000001','caretaker','c4000000-0000-4000-8000-000000000004','Synthetic long care',721,'published'),
 ('e4100000-0000-4000-8000-000000000005','e3000000-0000-4000-8000-000000000001','caretaker','c4000000-0000-4000-8000-000000000004','Synthetic unscoped care',240,'published');
insert into public.service_price_versions(id,service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from) values
 ('e4200000-0000-4000-8000-000000000001','e4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000004',1,60001,'visit','synthetic-v1',now()-interval '1 day'),
 ('e4200000-0000-4000-8000-000000000003','e4100000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000001',1,30003,'hour','synthetic-v1',now()-interval '1 day'),
 ('e4200000-0000-4000-8000-000000000004','e4100000-0000-4000-8000-000000000004','c4000000-0000-4000-8000-000000000004',1,60004,'visit','synthetic-v1',now()-interval '1 day'),
 ('e4200000-0000-4000-8000-000000000005','e4100000-0000-4000-8000-000000000005','c4000000-0000-4000-8000-000000000004',1,60005,'visit','synthetic-v1',now()-interval '1 day');
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to) values
 ('e3000000-0000-4000-8000-000000000001','599991','c1000000-0000-4000-8000-000000000007','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
insert into public.resources(id,kind,person_profile_id) values
 ('e6000000-0000-4000-8000-000000000003','person','e1000000-0000-4000-8000-000000000003'),
 ('e6000000-0000-4000-8000-000000000004','person','e1000000-0000-4000-8000-000000000004');
insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
 select v.p,v.r,d,'00:00','23:59',current_date-2,current_date+365 from generate_series(0,6) d,
 (values ('c3000000-0000-4000-8000-000000000004'::uuid,'e6000000-0000-4000-8000-000000000004'::uuid),
  ('e3000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001')) v(p,r);

-- Q06 through the public case, upload, submit and independent review path (contract §8.2).
do $$ declare x record; c uuid; d jsonb; begin
 for x in select * from (values
  ('c3000000-0000-4000-8000-000000000004'::uuid,'e1000000-0000-4000-8000-000000000004'::uuid,'c1000000-0000-4000-8000-000000000001'::uuid),
  ('e3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000007')) v(pr,subj,own) loop
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',x.own)::text,true);
  c:=public.add_staff_credential_case(x.pr,x.subj);
  perform set_config('request.jwt.claims',json_build_object('sub',x.subj,'aal','aal2')::text,true);
  d:=public.add_staff_credential_document(c,'application/pdf',now()+interval '1 year',1);
  perform set_config('storage.operation','storage.object.upload',true);
  insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
  perform set_config('storage.operation','',true);
  perform public.submit_staff_credential_case(c,2);
  perform set_config('request.jwt.claims',json_build_object('sub','c1000000-0000-4000-8000-000000000004','aal','aal2')::text,true);
  perform public.review_staff_credential_case(c,'approved','Synthetic review',3);
  reset role;
 end loop;
end $$;

-- Task lists: the public setter for supported offers; the owner seeds the two unsupported
-- offers directly so the request trigger's own unit and duration checks can be exercised.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.set_care_service_tasks('c4100000-0000-4000-8000-000000000004',array['companionship','mobility_support'],0,gen_random_uuid());
select pg_temp.as_user('c1000000-0000-4000-8000-000000000007');
select public.set_care_service_tasks('e4100000-0000-4000-8000-000000000001',array['companionship'],0,gen_random_uuid());
insert into public.care_service_tasks(service_id,task_codes) values
 ('e4100000-0000-4000-8000-000000000003',array['companionship']),('e4100000-0000-4000-8000-000000000004',array['companionship']);
select set_config('request.jwt.claims','',true);

-- Helpers. All run as the fixture owner; claims select the acting profile.
create function pg_temp.c_v(p_booking uuid) returns integer language sql as $$ select version from public.bookings where id=p_booking; $$;
create function pg_temp.c_pv(p_booking uuid) returns integer language sql as $$ select version from public.care_plans where booking_id=p_booking; $$;
create function pg_temp.c_plan(p_booking uuid) returns public.care_plans language sql as $$ select * from public.care_plans where booking_id=p_booking; $$;
-- Requested booking through the public generic create as the patient's self profile.
create function pg_temp.c_request(p_service uuid,p_start timestamptz,p_patient uuid default 'b2000000-0000-4000-8000-000000000001') returns uuid language plpgsql as $$
declare who uuid; addr uuid; begin
 select self_profile_id into who from public.patients where id=p_patient;
 select id into addr from public.patient_addresses where patient_id=p_patient order by id limit 1;
 perform pg_temp.as_user(who);
 return public.create_booking_request(p_patient,p_service,addr,p_start,gen_random_uuid());
end $$;
-- Generic accept as the provider's owner/scheduler (M for A, MB for B) with one caregiver.
create function pg_temp.c_accept(p_booking uuid,p_resource uuid) returns integer language plpgsql as $$
begin
 perform pg_temp.as_user(case when (select provider_id from public.bookings where id=p_booking)='e3000000-0000-4000-8000-000000000001'
  then 'c1000000-0000-4000-8000-000000000007'::uuid else 'c1000000-0000-4000-8000-000000000001'::uuid end);
 return public.accept_booking(p_booking,pg_temp.c_v(p_booking),array[p_resource]);
end $$;
create function pg_temp.c_book(p_start timestamptz,p_resource uuid default 'c6000000-0000-4000-8000-000000000001',
 p_service uuid default 'c4100000-0000-4000-8000-000000000004',p_patient uuid default 'b2000000-0000-4000-8000-000000000001') returns uuid language plpgsql as $$
declare b uuid:=pg_temp.c_request(p_service,p_start,p_patient); begin perform pg_temp.c_accept(b,p_resource); return b; end $$;
-- Confirmed booking for W1 on A whose start is p_offset from now (shifted after acceptance).
create function pg_temp.c_live(p_day integer,p_offset interval,p_resource uuid default 'c6000000-0000-4000-8000-000000000001') returns uuid language plpgsql as $$
declare b uuid:=pg_temp.c_book(pg_temp.p5_at(p_day),p_resource); begin perform pg_temp.p5_shift(b,now()+p_offset); return b; end $$;
-- Care commands as p_actor with a fresh key at the current booking (or plan) version.
create function pg_temp.c_start(p_booking uuid,p_actor uuid default 'c1000000-0000-4000-8000-000000000002') returns integer language plpgsql as $$
begin perform pg_temp.as_user(p_actor); return public.advance_care(p_booking,'started',pg_temp.c_v(p_booking),gen_random_uuid()); end $$;
create function pg_temp.c_end(p_booking uuid,p_actor uuid default 'c1000000-0000-4000-8000-000000000002') returns integer language plpgsql as $$
begin perform pg_temp.as_user(p_actor); return public.advance_care(p_booking,'ended',pg_temp.c_v(p_booking),gen_random_uuid()); end $$;
create function pg_temp.c_interrupt(p_booking uuid,p_reason text,p_actor uuid default 'c1000000-0000-4000-8000-000000000002') returns integer language plpgsql as $$
begin perform pg_temp.as_user(p_actor); return public.interrupt_care(p_booking,p_reason,pg_temp.c_v(p_booking),gen_random_uuid()); end $$;
create function pg_temp.c_attest(p_booking uuid,p_decision text,p_actor uuid default 'b1000000-0000-4000-8000-000000000001') returns integer language plpgsql as $$
begin perform pg_temp.as_user(p_actor); return public.attest_care(p_booking,p_decision,pg_temp.c_pv(p_booking),gen_random_uuid()); end $$;
-- Statement text for expect_state with the current version baked in.
create function pg_temp.c_cmd(p_fn text,p_booking uuid,p_arg text) returns text language sql as $$
 select format('select public.%s(%L,%L,%s,gen_random_uuid())',p_fn,p_booking,p_arg,
  case when p_fn='attest_care' then pg_temp.c_pv(p_booking) else pg_temp.c_v(p_booking) end); $$;
-- Shift plan times for the attestation window (owner context; the plan guard is off for the shift only).
create function pg_temp.c_shift_plan(p_booking uuid,p_delta interval) returns void language plpgsql as $$
begin
 alter table public.care_plans disable trigger p5c_care_plan_guard;
 update public.care_plans set started_at=started_at+p_delta,ended_at=ended_at+p_delta where booking_id=p_booking;
 alter table public.care_plans enable trigger p5c_care_plan_guard;
end $$;
