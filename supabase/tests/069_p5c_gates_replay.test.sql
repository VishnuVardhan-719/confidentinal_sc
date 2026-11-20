\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- Gate phases for care (contract §10.1, §10.4) and keyed replay of care commands (§13.3).

create function pg_temp.msg(p_statement text) returns text language plpgsql as $$
declare m text; begin
 begin execute p_statement; exception when others then get stacked diagnostics m=message_text; return m; end;
 return 'ok';
end $$;
create function pg_temp.gate(p_state text) returns void language sql as $$ update booking_private.feature_gates set state=p_state where key='caretaker'; $$;

-- §10.4 matrix: admission only under on; start under on and off; closeout and reads always.
do $$ declare g text; b uuid; d integer:=1; m text; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 foreach g in array array['on','off','suspended'] loop
  d:=d+1;
  perform pg_temp.gate(g);
  m:=null;
  begin perform pg_temp.c_request(pg_temp.p5_service('caretaker'),pg_temp.p5_at(40+d));
  exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m is not distinct from case when g='on' then null else 'feature_unavailable' end,'admission under '||g||': '||coalesce(m,'allowed'));
  perform pg_temp.gate('on');
  b:=pg_temp.c_live(d,-interval '10 minutes');
  perform pg_temp.gate(g);
  perform pg_temp.as_user(w1);
  m:=pg_temp.msg(pg_temp.c_cmd('advance_care',b,'started'));
  perform pg_temp.assert_true(m=case when g='suspended' then 'feature_suspended' else 'ok' end,'start under '||g||': '||m);
  if g='suspended' then perform pg_temp.gate('on'); perform pg_temp.c_start(b); perform pg_temp.gate(g); end if;
  perform pg_temp.as_user(w1);
  perform pg_temp.assert_true(public.get_care_plan(b)->>'substate'='started' and public.get_booking(b)->>'state'='in_progress'
   and public.get_assignment_contact(b) ? 'contact','reads under '||g);
  if g='off' then perform pg_temp.c_interrupt(b,'other'); else perform pg_temp.c_end(b); end if;
  perform pg_temp.assert_true((select state in ('completed','interrupted') from public.bookings where id=b),'closeout under '||g);
  perform pg_temp.assert_true(pg_temp.c_attest(b,'confirmed')>0,'attestation under '||g);
  perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true(public.get_care_plan(b)->>'attestation'='confirmed','patient read under '||g);
  perform pg_temp.gate('on');
 end loop;
end $$;
-- The HTTP layer maps both gate refusals to 503 (src/lib/care/service.ts); the messages are fixed.
select pg_temp.c_live(6,-interval '10 minutes') as sus \gset
select pg_temp.gate('suspended');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(pg_temp.c_cmd('advance_care',:'sus','started'),'55000','suspended start is 55000');
select pg_temp.gate('on');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.cancel_booking(:'sus',pg_temp.c_v(:'sus'),'provider_unavailable');

-- §13.3 replay after every assignment-ending command (ended, interrupt_care).
do $$ declare step text; b uuid; k uuid; v integer; r integer; ev integer; d integer:=10; stmt text; w1 uuid:='c1000000-0000-4000-8000-000000000002';
 prov uuid:=pg_temp.p5_provider('caretaker'); begin
 foreach step in array array['ended','interrupt'] loop
  d:=d+1; k:=gen_random_uuid();
  b:=pg_temp.c_live(d,-interval '10 minutes');
  -- Start is keyed too: a retry of the same start returns the same version.
  perform pg_temp.as_user(w1);
  v:=pg_temp.c_v(b);
  r:=public.advance_care(b,'started',v,k);
  perform pg_temp.assert_true(public.advance_care(b,'started',v,k)=r,step||' start replay');
  k:=gen_random_uuid(); v:=r;
  stmt:=case when step='ended' then format('select public.advance_care(%L,''ended'',%s,%L)',b,v,k)
   else format('select public.interrupt_care(%L,''caregiver_unwell'',%s,%L)',b,v,k) end;
  execute stmt into r;
  select count(*) into ev from public.booking_events where booking_id=b;
  execute stmt into r;
  perform pg_temp.assert_true(r=v+1,step||' same key and arguments return the original version');
  perform pg_temp.assert_true((select count(*) from public.booking_events where booking_id=b)=ev,step||' replay wrote no event');
  perform pg_temp.expect_state(case when step='ended' then format('select public.advance_care(%L,''ended'',%s,%L)',b,v+1,k)
   else format('select public.interrupt_care(%L,''other'',%s,%L)',b,v,k) end,'40001',step||' same key, changed argument');
  -- Another actor with the same key is an ordinary call and fails authorization.
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
  perform pg_temp.expect_state(stmt,'42501',step||' another actor gets no replay');
  -- Retry after a later step and after the caregiver lost every live authority.
  perform pg_temp.c_attest(b,'confirmed');
  update public.organization_members set status='disabled' where profile_id=w1 and organization_id='c8000000-0000-4000-8000-000000000001';
  update public.staff_credential_documents set expires_at=now()-interval '1 second'
   where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
  perform pg_temp.gate('suspended');
  perform pg_temp.as_user(w1);
  execute stmt into r;
  perform pg_temp.assert_true(r=v+1,step||' replay after attestation, membership revoke, Q06 expiry and gate suspension');
  perform pg_temp.assert_true((select count(*)=1 from public.idempotency_requests where actor_profile_id=w1 and request_key=k
   and result_version=v+1 and result_id=(select id from public.booking_events where booking_id=b and aggregate_version=v+1)),step||' result id is the event');
  perform pg_temp.gate('on');
  update public.organization_members set status='active' where profile_id=w1;
  update public.staff_credential_documents set expires_at=now()+interval '1 year'
   where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
 end loop;
end $$;
select pg_temp.assert_true((select count(distinct action)=3 from public.idempotency_requests where action in ('p5.care.advance','p5.care.interrupt','p5.care.attest')),'care action names');
-- Inputs are checked before replay: a null key is refused, never replayed.
select pg_temp.c_live(14,-interval '10 minutes') as nk \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.expect_state(format('select public.advance_care(%L,''started'',%s,null)',:'nk',pg_temp.c_v(:'nk')),'22023','request key required');
\echo 1..1
\echo ok 1 - 069_p5c_gates_replay
rollback;
