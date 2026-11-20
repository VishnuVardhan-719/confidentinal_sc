-- Include _tap_helpers, _b01_fixture, _p5s_fixture, then this file, in a transaction.
-- Synthetic only. P5 fixture supplies credentialed org doctors through actual Q06 RPCs.
reset role;
insert into auth.users(id,email) values
 ('d1000000-0000-4000-8000-000000000001','p01-finance-one@example.invalid'),
 ('d1000000-0000-4000-8000-000000000002','p01-finance-two@example.invalid'),
 ('d1000000-0000-4000-8000-000000000003','p01-override@example.invalid');
-- Deliberately no finance grants: individual tests opt in, rolled back with the suite.
update public.organization_members set scopes=scopes||array['finance:collect']
 where organization_id='c8000000-0000-4000-8000-000000000001'
 and profile_id in ('c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003');
update public.organization_members set scopes=scopes||array['finance:read']
 where organization_id='c8000000-0000-4000-8000-000000000001'
 and profile_id='c1000000-0000-4000-8000-000000000001';
update payments_private.settings set pay_after_enabled=true;
create function pg_temp.p01_finance() returns void language sql as $$
 insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by) values
 ('d1000000-0000-4000-8000-000000000001','finance:reconcile','global','b1000000-0000-4000-8000-000000000004'),
 ('d1000000-0000-4000-8000-000000000002','finance:reconcile','global','b1000000-0000-4000-8000-000000000004'),
 ('d1000000-0000-4000-8000-000000000003','finance:override','global','b1000000-0000-4000-8000-000000000004'); $$;
-- Each booking is real request/accept/start within the access window. Suites with
-- two bookings use distinct people to respect retained P5 closeout buffers.
create function pg_temp.p01_book(p_finish boolean default true,p_person uuid default 'c1000000-0000-4000-8000-000000000002') returns uuid language plpgsql as $$
declare b uuid; v integer; start_time timestamptz; resource uuid; code text; begin
 start_time:=clock_timestamp()+interval '1 minute';
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 b:=public.create_booking_request('b2000000-0000-4000-8000-000000000001',pg_temp.p5_service('doctor'),
  'b5000000-0000-4000-8000-000000000001',start_time,gen_random_uuid());
 select id into resource from public.resources where kind='person' and person_profile_id=p_person;
 perform pg_temp.p5_accept(b,array[resource]);
 perform pg_temp.as_user(p_person);
 select version into v from public.bookings where id=b;
 v:=public.advance_visit(b,'en_route',v,gen_random_uuid());
 v:=public.advance_visit(b,'arrived',v,gen_random_uuid());
 -- Doctor block DC02: the patient issues the arrival code, the doctor verifies it, then starts.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 code:=public.issue_arrival_code(b,gen_random_uuid())->>'code';
 perform pg_temp.as_user(p_person);
 v:=(public.verify_arrival_code(b,code,v,gen_random_uuid())->>'version')::integer;
 v:=public.advance_visit(b,'service_started',v,gen_random_uuid());
 if p_finish then perform public.advance_visit(b,'service_completed',v,gen_random_uuid()); end if;
 return b;
end $$;
create function pg_temp.p01_report(b uuid,a bigint default 10000,k uuid default gen_random_uuid()) returns uuid language plpgsql as $$
begin perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 return public.report_collection(b,a,'cash',null,k); end $$;
create function pg_temp.p01_version(b uuid) returns integer language sql as $$ select version from public.payments where booking_id=b; $$;
create function pg_temp.p01_payment(b uuid) returns uuid language sql as $$ select id from public.payments where booking_id=b; $$;
create function pg_temp.p01_suspend() returns void language sql as $$
 update public.providers set status='suspended' where id=pg_temp.p5_provider('doctor'); $$;
