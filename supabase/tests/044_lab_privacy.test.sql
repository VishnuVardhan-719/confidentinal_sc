\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab exposure (design S8, S12.1 024; contract S8.3-S8.6, S1.2). Authored; DB NOT EXECUTED.

-- Table and function privileges (P01 H2, R P5-20): no API role touches lab tables;
-- execute only as granted; RLS on; nothing in the realtime publication.
do $$ declare t text; r text; p text; f text; begin
 foreach t in array array['public.lab_tests','public.lab_policy_versions','public.lab_orders','public.lab_order_items'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=t::regclass),t||' RLS on');
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
    perform pg_temp.assert_true(not has_table_privilege(r,t,p),r||' has no '||p||' on '||t);
   end loop;
  end loop;
 end loop;
 foreach f in array array['public.set_lab_test(uuid,text,text[],integer,text,integer,uuid)','public.list_lab_slots(uuid,date)',
  'public.create_lab_booking_request(uuid,uuid,uuid,timestamptz,boolean,uuid)','public.accept_lab_booking(uuid,integer,uuid,uuid)',
  'public.advance_lab_order(uuid,text,integer,text,uuid)','public.lab_close_followup(uuid,text,uuid)','public.get_lab_order(uuid)',
  'public.list_lab_followups(uuid,integer,uuid)'] loop
  perform pg_temp.assert_true(has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('anon',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' authenticated only');
  perform pg_temp.assert_true((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=f::regprocedure),f||' definer, empty search_path');
 end loop;
 perform pg_temp.assert_true(has_function_privilege('anon','public.get_lab_test_public(uuid)','EXECUTE') and has_function_privilege('authenticated','public.get_lab_test_public(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.get_lab_test_public(uuid)','EXECUTE'),'public test read: anon and authenticated only');
 for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='lab_private' loop
  perform pg_temp.assert_true(not has_function_privilege('anon',f,'EXECUTE') and not has_function_privilege('authenticated',f,'EXECUTE')
   and not has_function_privilege('service_role',f,'EXECUTE'),f||' private');
 end loop;
 perform pg_temp.assert_true(not has_schema_privilege('authenticated','lab_private','USAGE') and not has_schema_privilege('anon','lab_private','USAGE'),'lab_private has no usage grant');
 perform pg_temp.assert_true(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
  and tablename in ('lab_tests','lab_policy_versions','lab_orders','lab_order_items','bookings')),'no lab table or bookings in realtime');
end $$;
set local role anon;
select pg_temp.expect_state('select public.create_lab_booking_request(null,null,null,null,null,null)','42501','anon cannot call create');
reset role;

-- A live booking: W1 assigned, started 10 minutes ago, still scheduled.
select pg_temp.lab_live('c6000000-0000-4000-8000-000000000001') as live \gset
do $$ declare b uuid:=(select booking_id from public.lab_orders where substate='scheduled' limit 1); j jsonb; x uuid; n integer;
 base text[]:=array['booking_id','end_at','fasting_hours','preparation_code','provider_reference','public_ref','start_at','state','substate']; begin
 -- Patient.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 j:=public.get_lab_order(b);
 perform pg_temp.assert_true(pg_temp.keys(j)=pg_temp.sorted(base||array['followup_status','line_paise','technician_name','timeline','title']),'patient lab order keys');
 perform pg_temp.assert_true(jsonb_typeof(j->'line_paise')='string' and j->>'line_paise'=(select amount_paise::text from public.bookings where id=b),'line_paise as a decimal string');
 perform pg_temp.assert_true((select bool_and(pg_temp.keys(e)=array['occurred_at','reason']) from jsonb_array_elements(j->'timeline') e)
  and (select array_agg(e->>'reason') from jsonb_array_elements(j->'timeline') e)=array['requested','accepted','confirmed'],'patient timeline without actor ids');
 perform pg_temp.assert_true(j->>'provider_reference' ~ '^SCV-LAB-[0-9]{6,19}$','provider reference, never the UUID');
 -- Scheduler: no address, phone or patient id from lab projections.
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 j:=public.get_lab_order(b);
 perform pg_temp.assert_true(pg_temp.keys(j)=pg_temp.sorted(base||array['container_codes','failure_code','followup_code','followup_status','resource_id','sample_type','technician_name','title']),'scheduler lab order keys');
 perform pg_temp.assert_true((j->>'resource_id')::uuid='c6000000-0000-4000-8000-000000000001','scheduler sees the assigned resource');
 -- Technician: no title, price, patient id, provider id.
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 j:=public.get_lab_order(b);
 perform pg_temp.assert_true(pg_temp.keys(j)=pg_temp.sorted(base||array['container_codes','quantity','sample_type']),'technician lab order keys');
 perform pg_temp.assert_true(not (j ?| array['title','line_paise','amount_paise','currency','patient_id','provider_id','address_snapshot','contact_snapshot']),'technician sees no title, amount or identity');
 -- Shared get_booking key sets for the lab booking (S8.3).
 perform pg_temp.assert_true(pg_temp.keys(public.get_booking(b))=array['category','end_at','id','pin_code','provider_reference','public_ref','start_at','state','version'],'technician get_booking: assignee set, no amount or service id');
 j:=public.get_assignment_contact(b);
 perform pg_temp.assert_true(pg_temp.keys(j)=array['address','booking_id','contact','public_ref'] and j->'address'->>'line1'='Synthetic exact address','technician reads contact through the shared RPC');
 perform pg_temp.assert_true((select count(*)=1 from public.audit_events where action='booking.contact_viewed' and target_id=b and actor_profile_id='c1000000-0000-4000-8000-000000000002'),'one audit row per contact read');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(not (public.get_booking(b) ?| array['address_snapshot','contact_snapshot','patient_id']),'scheduler get_booking has no address, contact or patient id (OD-4)');
 select count(*) into n from public.audit_events where action like 'booking.contact_viewed%' and target_id=b;
 perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002','scheduler has no contact read');
 perform pg_temp.assert_true((select count(*) from public.audit_events where action like 'booking.contact_viewed%' and target_id=b)=n,'denied contact read writes no audit row');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(public.get_booking(b) ?& array['address_snapshot','contact_snapshot','patient_id','amount_paise'],'patient keeps the full set');
 -- Anyone else: P0002 (other patient, other organisation, outsider, other technician, ops without exception).
 foreach x in array array['c9000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000007','c1000000-0000-4000-8000-000000000009',
  'c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000005','c9000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(x);
  perform pg_temp.expect_state(format('select public.get_lab_order(%L)',b),'P0002','no lab order for '||x);
 end loop;
 perform pg_temp.expect_state(format('select public.get_lab_order(%L)',gen_random_uuid()),'P0002','unknown booking');
 perform pg_temp.expect_state(format('select public.get_lab_order(%L)',pg_temp.p5_raw('doctor','confirmed',now())),'P0002','not a lab booking');
 -- Through the API role: grants allow the patient's read.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
end $$;
set local role authenticated;
select pg_temp.assert_true(public.get_lab_order(:'live') ? 'title','patient reads through the authenticated role');
select pg_temp.expect_state('select 1 from public.lab_orders','42501','authenticated cannot read lab_orders');
select pg_temp.expect_state('select 1 from public.lab_order_items','42501','authenticated cannot read lab_order_items');
reset role;

-- After handoff the technician's reads end; scan what the flow wrote for personal data.
do $$ declare b uuid:=(select booking_id from public.lab_orders where substate='scheduled' limit 1); w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 perform pg_temp.lab_step(b,w1,'start_collection');
 perform pg_temp.lab_step(b,w1,'collected');
 perform pg_temp.as_user(w1);
 perform pg_temp.assert_true(pg_temp.keys(public.get_lab_order(b)) @> array['sample_type'],'technician reads during custody');
 perform pg_temp.lab_step(b,w1,'handed_over');
 perform pg_temp.as_user(w1);
 perform pg_temp.expect_state(format('select public.get_lab_order(%L)',b),'P0002','technician lab order after handoff');
 perform pg_temp.expect_state(format('select public.get_booking(%L)',b),'P0002','technician booking after handoff');
 perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002','technician contact after handoff');
 perform pg_temp.assert_true(not exists(select 1 from public.notification_outbox where booking_id=b
  and (payload::text ilike '%Synthetic exact address%' or payload::text like '%+91%' or payload::text ilike '%Synthetic P5 lab%' or payload::text ilike '%edta%')),'outbox carries no address, phone, title or container text');
 perform pg_temp.assert_true(not exists(select 1 from public.audit_events where target_id=b and (action ilike '%Synthetic%' or action like '%+91%')),'audit rows carry codes only');
 perform pg_temp.assert_true(not exists(select 1 from public.booking_events where booking_id=b and reason not in
  ('requested','accepted','confirmed','collection_started','sample_collected','sample_handed_over')),'only lab codes on the lab path');
end $$;
\echo 1..1
\echo ok 1 - 044_lab_privacy
rollback;
