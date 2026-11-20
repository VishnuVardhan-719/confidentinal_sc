\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §13 (P5-09): keyed replay bound to actor, action, key and the full
-- argument hash, checked before live authorization, gates and locks. The shared
-- assignment-ending commands are the ops commands; category commands reuse the helpers.

select pg_temp.assert_true(exists(select 1 from information_schema.columns where table_schema='public' and table_name='idempotency_requests' and column_name='result_version' and is_nullable='YES'),'result_version column, nullable');
select pg_temp.assert_true(booking_private.request_hash(jsonb_build_array('a',1))=encode(sha256(convert_to(jsonb_build_array('a',1)::text,'UTF8')),'hex'),'hash is the built create hash method');
do $$ declare f text; begin
 foreach f in array array['booking_private.request_hash(jsonb)','booking_private.replay(uuid,text,uuid,text)','booking_private.record_request(uuid,text,uuid,text,uuid,integer)','booking_private.create_request_core(uuid,uuid,uuid,timestamptz,uuid,text,text,interval,interval)'] loop
  perform pg_temp.assert_true(not has_function_privilege('authenticated',f,'EXECUTE') and not has_function_privilege('service_role',f,'EXECUTE'),f||' not granted');
 end loop;
end $$;
-- Helper semantics.
select pg_temp.assert_true((select result_id is null and result_version is null from booking_private.replay('c1000000-0000-4000-8000-000000000005','p5.test','e0000000-0000-4000-8000-000000000001','h')),'absent key replays nothing');
select booking_private.record_request('c1000000-0000-4000-8000-000000000005','p5.test','e0000000-0000-4000-8000-000000000001','h','e0000000-0000-4000-8000-000000000002',7);
select pg_temp.assert_true((select result_id='e0000000-0000-4000-8000-000000000002' and result_version=7 from booking_private.replay('c1000000-0000-4000-8000-000000000005','p5.test','e0000000-0000-4000-8000-000000000001','h')),'recorded result replays');
select pg_temp.expect_state('select booking_private.replay(''c1000000-0000-4000-8000-000000000005'',''p5.test'',''e0000000-0000-4000-8000-000000000001'',''other'')','40001','hash mismatch is idempotency_conflict');
select pg_temp.assert_true((select result_id is null from booking_private.replay('c1000000-0000-4000-8000-000000000006','p5.test','e0000000-0000-4000-8000-000000000001','h')),'keys are per actor');
select pg_temp.expect_state('select booking_private.record_request(''c1000000-0000-4000-8000-000000000005'',''p5.test'',''e0000000-0000-4000-8000-000000000001'',''h'',''e0000000-0000-4000-8000-000000000002'',8)','23505','one row per actor, action and key');

-- Ops close per category: retry after loss of every live authority returns the original.
insert into auth.users(id,email) select ('d2000000-0000-4000-8000-00000000000'||n)::uuid,'p5s-replay-'||n||'@example.invalid' from generate_series(1,4) n;
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by)
 select ('d2000000-0000-4000-8000-00000000000'||n)::uuid,'booking:incident','org:c8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000004' from generate_series(1,4) n;
do $$ declare c text; b uuid; k uuid; v integer; ev integer; i integer:=0; ops uuid; m text; begin
 foreach c in array array['doctor','lab','ambulance','caretaker'] loop
  i:=i+1; ops:=('d2000000-0000-4000-8000-00000000000'||i)::uuid; k:=gen_random_uuid();
  b:=pg_temp.p5_raw(c,'in_progress',now()-interval '20 hours','c1000000-0000-4000-8000-000000000002');
  perform pg_temp.as_user(ops);
  v:=public.ops_close_booking(b,2,'interrupted','ops_closeout',k);
  perform pg_temp.assert_true(v=3,c||' first close');
  select count(*) into ev from public.booking_events where booking_id=b;
  perform pg_temp.assert_true(public.ops_close_booking(b,2,'interrupted','ops_closeout',k)=3,c||' same key and arguments replay');
  perform pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''unsafe_conditions'',%L)',b,k),'40001',c||' changed argument conflicts');
  perform pg_temp.expect_state(format('select public.ops_close_booking(%L,3,''interrupted'',''ops_closeout'',%L)',b,k),'40001',c||' changed expected version conflicts');
  -- Lost authority: capability revoked, AAL dropped, gate suspended.
  update public.admin_capabilities set revoked_at=now() where profile_id=ops;
  update booking_private.feature_gates set state='suspended' where key=c;
  perform pg_temp.assert_true(public.ops_close_booking(b,2,'interrupted','ops_closeout',k)=3,c||' replay after capability revoke and gate suspension');
  perform set_config('request.jwt.claims',json_build_object('sub',ops)::text,true);
  perform pg_temp.assert_true(public.ops_close_booking(b,2,'interrupted','ops_closeout',k)=3,c||' replay without AAL2');
  update booking_private.feature_gates set state='on' where key=c;
  perform pg_temp.assert_true((select count(*) from public.booking_events where booking_id=b)=ev,c||' replays wrote no event');
  perform pg_temp.assert_true((select result_version=3 and result_id=(select id from public.booking_events where booking_id=b and aggregate_version=3)
   from public.idempotency_requests where actor_profile_id=ops and action='p5.ops.close' and request_key=k),c||' result id is the event, version recorded');
  -- Same key, another actor: an ordinary new call that fails authorization.
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
  perform pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',%L)',b,k),'42501',c||' another actor gets no replay');
  -- Another ops actor with the same key is a new call: the booking is already closed.
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000006');
  perform pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',%L)',b,k),'40001',c||' another ops actor sees the new version');
 end loop;
end $$;

-- Resolve, then a later step, then retry the resolve: the original version returns.
select pg_temp.p5_raw('lab','confirmed',now()+interval '1 day','c1000000-0000-4000-8000-000000000002') as later \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select booking_private.open_exception(:'later','eligibility_lapsed','other') as exc \gset
select booking_private.open_exception(:'later','absence_reported','absence_reported');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
select pg_temp.assert_true(public.ops_resolve_exception(:'exc',1,'resolved','e1000000-0000-4000-8000-000000000001')=2,'resolve');
select pg_temp.assert_true(public.ops_close_booking(:'later',2,'interrupted','absence_disputed',gen_random_uuid())=3,'later step closes the booking');
select pg_temp.assert_true(public.ops_resolve_exception(:'exc',1,'resolved','e1000000-0000-4000-8000-000000000001')=2,'retry after a later step returns the original');
select pg_temp.expect_state(format('select public.ops_resolve_exception(%L,2,''resolved'',''e1000000-0000-4000-8000-000000000001'')',:'exc'),'40001','resolve key with changed version conflicts');
select pg_temp.expect_state(format('select public.ops_resolve_exception(%L,2,''resolved'',gen_random_uuid())',:'exc'),'55000','new key on a resolved exception refused');
select pg_temp.expect_state(format('select public.ops_close_booking(%L,2,''interrupted'',''ops_closeout'',null)',:'later'),'22023','request key required');

-- Generic create: replay precedes the gate and the pending cap.
reset role;
select pg_temp.p5_service('doctor') as doc_service \gset
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'doc_service','b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(3),'e1000000-0000-4000-8000-000000000002') as created \gset
reset role;
update booking_private.feature_gates set state='off' where key='doctor';
set local role authenticated;
select pg_temp.assert_true(public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'doc_service','b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(3),'e1000000-0000-4000-8000-000000000002')=:'created'::uuid,'create replay with the gate off');
select pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,%L,%L)','b2000000-0000-4000-8000-000000000001',:'doc_service','b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(4),'e1000000-0000-4000-8000-000000000002'),'40001','create key with another start conflicts');
select pg_temp.expect_state(format('select public.create_booking_request(%L,%L,%L,%L,gen_random_uuid())','b2000000-0000-4000-8000-000000000001',:'doc_service','b5000000-0000-4000-8000-000000000001',pg_temp.p5_at(4)),'55000','new create with the gate off');
reset role;
\echo 1..1
\echo ok 1 - 026_p5s_replay
rollback;
