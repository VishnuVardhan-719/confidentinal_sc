-- Synthetic rollback-only P5 shared-engine fixtures. Include after _b01_fixture.inc.
-- One organisation (A) owns a doctor, lab, ambulance and caretaker provider. Workers W1
-- and W2 are staff of A and pass Q06 for all four through the public case, upload,
-- submit and review path; no staff evidence row is seeded directly (contract §8.2).
--  c1..01 M  owner/scheduler of A          c1..06 OG ops, global booking:incident
--  c1..02 W1 staff of A (all four)         c1..07 MB owner of organisation B
--  c1..03 W2 staff of A (all four)         c1..08 WB staff of organisation B
--  c1..04 V  global provider:verify        c1..09 X  outsider, no relationship
--  c1..05 O  ops, booking:incident org:A
reset role;
insert into auth.users(id,email) select ('c1000000-0000-4000-8000-00000000000'||n)::uuid,'p5s-'||n||'@example.invalid' from generate_series(1,9) n;
insert into public.organizations(id,name) values
 ('c8000000-0000-4000-8000-000000000001','Synthetic P5 organisation A'),('c8000000-0000-4000-8000-000000000002','Synthetic P5 organisation B');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('c8000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','owner','active',now(),array['provider:read','provider:manage','evidence:manage','schedule:manage']),
 ('c8000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','staff','active',now(),array['provider:read']),
 ('c8000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','staff','active',now(),array['provider:read']),
 ('c8000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000007','owner','active',now(),array['provider:read','provider:manage','evidence:manage','schedule:manage']),
 ('c8000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000008','staff','active',now(),array['provider:read']);
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('c1000000-0000-4000-8000-000000000004','provider:verify','global','b1000000-0000-4000-8000-000000000004'),
 ('c1000000-0000-4000-8000-000000000005','booking:incident','org:c8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000004'),
 ('c1000000-0000-4000-8000-000000000006','booking:incident','global','b1000000-0000-4000-8000-000000000004');
insert into public.providers(id,organization_id,category,status,verification_state)
 select ('c3000000-0000-4000-8000-00000000000'||n)::uuid,'c8000000-0000-4000-8000-000000000001',c,'active','approved'
 from unnest(array['doctor','lab','ambulance','caretaker']) with ordinality x(c,n);
insert into public.provider_profiles(provider_id,display_name) select id,'Synthetic P5 '||category from public.providers where organization_id='c8000000-0000-4000-8000-000000000001';
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
 select d,id,'c1000000-0000-4000-8000-000000000001',providers_private.required_kind(category),id::text||'/'||d::text||'.pdf','application/pdf','verified',now()+interval '1 year'
 from (select gen_random_uuid() d,p.id,p.category from public.providers p where p.organization_id='c8000000-0000-4000-8000-000000000001') x;
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where provider_id in
 (select id from public.providers where organization_id='c8000000-0000-4000-8000-000000000001');
insert into public.service_catalog_types(id,code,category,name,unit)
 select ('c4000000-0000-4000-8000-00000000000'||n)::uuid,'p5s_'||c,c,'Synthetic P5 '||c,'visit' from unnest(array['doctor','lab','ambulance','caretaker']) with ordinality x(c,n);
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status)
 select ('c4100000-0000-4000-8000-00000000000'||n)::uuid,('c3000000-0000-4000-8000-00000000000'||n)::uuid,c,('c4000000-0000-4000-8000-00000000000'||n)::uuid,'Synthetic P5 '||c,30,'published'
 from unnest(array['doctor','lab','ambulance','caretaker']) with ordinality x(c,n);
insert into public.service_price_versions(id,service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
 select ('c4200000-0000-4000-8000-00000000000'||n)::uuid,('c4100000-0000-4000-8000-00000000000'||n)::uuid,('c4000000-0000-4000-8000-00000000000'||n)::uuid,1,50000+n,'visit','synthetic-v1',now()-interval '1 day'
 from generate_series(1,4) n;
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to)
 select ('c3000000-0000-4000-8000-00000000000'||n)::uuid,'599991','c1000000-0000-4000-8000-000000000001','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months'
 from generate_series(1,4) n;
insert into public.resources(id,kind,person_profile_id) values
 ('c6000000-0000-4000-8000-000000000001','person','c1000000-0000-4000-8000-000000000002'),
 ('c6000000-0000-4000-8000-000000000002','person','c1000000-0000-4000-8000-000000000003');
insert into public.resources(id,kind,vehicle_key,owner_organization_id) values
 ('c6000000-0000-4000-8000-000000000003','vehicle','SYNP5V01','c8000000-0000-4000-8000-000000000001'),
 ('c6000000-0000-4000-8000-000000000004','vehicle','SYNP5V02','c8000000-0000-4000-8000-000000000001');
insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
 select p,r,d,'00:00','23:59',current_date-2,current_date+365 from generate_series(0,6) d,
 (select ('c3000000-0000-4000-8000-00000000000'||n)::uuid p,unnest(array['c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000002']::uuid[]) r from generate_series(1,4) n
  union all select 'c3000000-0000-4000-8000-000000000003'::uuid,unnest(array['c6000000-0000-4000-8000-000000000003','c6000000-0000-4000-8000-000000000004']::uuid[])) pr;

-- Q06 through the public RPCs and the authenticated Storage upload policy.
do $$ declare pr uuid; subj uuid; c uuid; d jsonb; begin
 foreach pr in array array['c3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000004']::uuid[] loop
  foreach subj in array array['c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003']::uuid[] loop
   set local role authenticated;
   perform set_config('request.jwt.claims',json_build_object('sub','c1000000-0000-4000-8000-000000000001')::text,true);
   c:=public.add_staff_credential_case(pr,subj);
   perform set_config('request.jwt.claims',json_build_object('sub',subj,'aal','aal2')::text,true);
   d:=public.add_staff_credential_document(c,'application/pdf',now()+interval '1 year',1);
   perform set_config('storage.operation','storage.object.upload',true);
   insert into storage.objects(bucket_id,name) values(d->>'bucket_id',d->>'object_name');
   perform set_config('storage.operation','',true);
   perform public.submit_staff_credential_case(c,2);
   perform set_config('request.jwt.claims',json_build_object('sub','c1000000-0000-4000-8000-000000000004','aal','aal2')::text,true);
   perform public.review_staff_credential_case(c,'approved','Synthetic review',3);
   reset role;
  end loop;
 end loop;
end $$;
select set_config('request.jwt.claims','',true);
update booking_private.feature_gates set state='on';

-- Helpers. All run as the fixture owner; claims select the acting profile.
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claims',json_build_object('sub',p,'aal','aal2')::text,true); $$;
create function pg_temp.p5_provider(p_category text) returns uuid language sql as $$
 select id from public.providers where organization_id='c8000000-0000-4000-8000-000000000001' and category=p_category; $$;
create function pg_temp.p5_service(p_category text) returns uuid language sql as $$
 select id from public.services where provider_id=pg_temp.p5_provider(p_category); $$;
-- Create a requested booking through the shared core as the patient (any category).
create function pg_temp.p5_create(p_category text,p_start timestamptz) returns uuid language plpgsql as $$
declare k uuid:=gen_random_uuid(); begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 return booking_private.create_request_core('b2000000-0000-4000-8000-000000000001',pg_temp.p5_service(p_category),'b5000000-0000-4000-8000-000000000001',
  p_start,k,'p5s.test.create',booking_private.request_hash(to_jsonb(k::text)),interval '0',interval '90 days');
end $$;
-- Accept as scheduler M through the generic accept, standing in for a category accept
-- command: generic_accept is switched on for the call only. The reservation guard applies.
create function pg_temp.p5_accept(p_booking uuid,p_resources uuid[]) returns integer language plpgsql as $$
declare cat text; prior boolean; v integer; result integer; begin
 select category,version into cat,v from public.bookings where id=p_booking;
 select generic_accept into prior from booking_private.category_paths where category=cat;
 update booking_private.category_paths set generic_accept=true where category=cat;
 -- Shared suites accept caretaker bookings without a care plan, which the care guard
 -- refuses; it is switched off for caretaker only (031, 048, 056 need the other guards).
 if cat='caretaker' then perform pg_temp.p5_category_guards(false); end if;
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 result:=public.accept_booking(p_booking,v,p_resources);
 if cat='caretaker' then perform pg_temp.p5_category_guards(true); end if;
 update booking_private.category_paths set generic_accept=prior where category=cat;
 return result;
end $$;
create function pg_temp.p5_book(p_category text,p_start timestamptz,p_resources uuid[]) returns uuid language plpgsql as $$
declare b uuid:=pg_temp.p5_create(p_category,p_start); begin perform pg_temp.p5_accept(b,p_resources); return b; end $$;
-- Fixture clock shift: booking, assignments and reservations move together.
create function pg_temp.p5_shift(p_booking uuid,p_start timestamptz) returns void language plpgsql as $$
declare delta interval; begin
 select p_start-start_at into delta from public.bookings where id=p_booking;
 alter table public.bookings disable trigger b01_booking_guard;
 alter table public.resource_reservations disable trigger p5s_reservation_guard;
 update public.bookings set start_at=start_at+delta,end_at=end_at+delta where id=p_booking;
 update public.booking_assignments set period=tstzrange(lower(period)+delta,upper(period)+delta,'[)') where booking_id=p_booking;
 update public.resource_reservations set occupied_period=tstzrange(lower(occupied_period)+delta,upper(occupied_period)+delta,'[)')
  where assignment_id in(select id from public.booking_assignments where booking_id=p_booking);
 alter table public.resource_reservations enable trigger p5s_reservation_guard;
 alter table public.bookings enable trigger b01_booking_guard;
end $$;
-- Category blocks add their own guards on public.bookings (named *_booking_guard, e.g.
-- p5d_doctor_booking_guard). Shared suites drive every category through the shared engine only,
-- so these helpers switch the category guards off; each category suite tests its own guard.
create function pg_temp.p5_category_guards(p_on boolean) returns void language plpgsql as $$
declare t text; begin
 for t in select tgname from pg_trigger where tgrelid='public.bookings'::regclass and not tgisinternal
  and tgname like '%\_booking\_guard' and tgname<>'b01_booking_guard' loop
  execute format('alter table public.bookings %s trigger %I',case when p_on then 'enable' else 'disable' end,t);
 end loop;
end $$;
-- A state change through transition() as p_actor; the shared guard decides.
create function pg_temp.p5_step(p_booking uuid,p_actor uuid,p_state text,p_reason text) returns integer language plpgsql as $$
declare v integer; begin
 perform pg_temp.p5_category_guards(false);
 perform pg_temp.as_user(p_actor); v:=booking_private.transition(p_booking,p_state,p_reason);
 perform pg_temp.p5_category_guards(true);
 return v;
end $$;
-- Raw booking in any state with an optional person assignment (no reservation), for guard tests.
create function pg_temp.p5_raw(p_category text,p_state text,p_start timestamptz,p_assignee uuid default null,p_purpose text default null,p_service uuid default null) returns uuid language plpgsql as $$
declare b uuid; begin
 insert into public.bookings(requester_profile_id,patient_id,provider_id,category,service_id,price_version_id,amount_paise,currency,terms_version,address_snapshot,contact_snapshot,start_at,end_at)
 select 'b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',s.provider_id,s.category,s.id,v.id,v.amount_paise,v.currency,v.terms_version,
  jsonb_build_object('line1','Synthetic exact address','locality','Synthetic','pin_code','599991'),jsonb_build_object('name','Synthetic patient','phone','+919999999999'),
  p_start,p_start+interval '30 minutes'
 from public.services s join public.service_price_versions v on v.service_id=s.id where s.id=coalesce(p_service,pg_temp.p5_service(p_category)) returning id into b;
 if p_state<>'draft' then
  alter table public.bookings disable trigger b01_booking_guard;
  perform pg_temp.p5_category_guards(false);
  update public.bookings set state=p_state,version=version+1 where id=b;
  perform pg_temp.p5_category_guards(true);
  alter table public.bookings enable trigger b01_booking_guard;
 end if;
 if p_assignee is not null then
  insert into public.booking_assignments(booking_id,resource_id,purpose,assigned_profile_id,period)
  select b,r.id,coalesce(p_purpose,booking_private.person_purpose(p_category)),p_assignee,tstzrange(p_start,p_start+interval '30 minutes','[)')
  from public.resources r where r.person_profile_id=p_assignee;
 end if;
 return b;
end $$;
-- 10:00 IST on day +p_days plus p_hours: keeps accepted periods inside the 00:00-23:59 rules.
create function pg_temp.p5_at(p_days integer,p_hours numeric default 0) returns timestamptz language sql as $$
 select ((((now() at time zone 'Asia/Kolkata')::date+p_days)::timestamp+interval '10 hours'+p_hours*interval '1 hour') at time zone 'Asia/Kolkata'); $$;
create function pg_temp.keys(j jsonb) returns text[] language sql as $$ select array_agg(k order by k) from jsonb_object_keys(j) k; $$;
create function pg_temp.sorted(a text[]) returns text[] language sql as $$ select array_agg(x order by x) from unnest(a) x; $$;
