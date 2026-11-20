\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- Suspension needs provider:suspend (Q06 001200); the fixture verifier c1..04 holds only provider:verify.
insert into public.admin_capabilities(profile_id,capability,scope_key,granted_by)
values('c1000000-0000-4000-8000-000000000004','provider:suspend','global','b1000000-0000-4000-8000-000000000004');
-- Care closeout and ops escalation. Contract §5.3 (a)-(e) through the care commands, §6
-- (ops never writes the care substate), design T18 and T19/E7-E9 as changed by the contract.

create function pg_temp.msg(p_statement text) returns text language plpgsql as $$
declare m text; begin
 begin execute p_statement; exception when others then get stacked diagnostics m=message_text; return m; end;
 return 'ok';
end $$;
create function pg_temp.w1_case() returns uuid language sql as $$
 select id from public.provider_verification_cases where provider_id=pg_temp.p5_provider('caretaker') and subject_profile_id='c1000000-0000-4000-8000-000000000002'; $$;

-- (a) provider suspended, (b) Q06 evidence expired, (c) past end_at + 12 h: the caregiver
-- still closes (end, interrupt, end) and one closed_while_ineligible exception opens.
do $$ declare k text; b uuid; d integer:=1; w1 uuid:='c1000000-0000-4000-8000-000000000002'; prov uuid:=pg_temp.p5_provider('caretaker'); begin
 foreach k in array array['a','b','c'] loop
  d:=d+1;
  b:=pg_temp.c_live(d,-interval '10 minutes');
  perform pg_temp.c_start(b);
  if k='a' then update public.providers set status='suspended' where id=prov; end if;
  if k='b' then update public.staff_credential_documents set expires_at=now()-interval '1 second' where case_id=pg_temp.w1_case(); end if;
  if k='c' then perform pg_temp.p5_shift(b,now()-interval '20 hours'); end if;
  perform pg_temp.as_user(w1);
  perform pg_temp.assert_true(not identity_private.is_assigned(b,'caretaker') and booking_private.closeout_assignee(b),k||' closeout only');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
  perform pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',b,'ended'))='forbidden',k||' another member never closes');
  perform pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('interrupt_care',b,'other'))='forbidden',k||' another member never interrupts');
  if k='b' then perform pg_temp.c_interrupt(b,'caregiver_unwell'); else perform pg_temp.c_end(b); end if;
  perform pg_temp.assert_true((select state from public.bookings where id=b)=case when k='b' then 'interrupted' else 'completed' end,k||' closed by the caregiver');
  perform pg_temp.assert_true((select substate='ended' from public.care_plans where booking_id=b),k||' plan ended');
  perform pg_temp.assert_true((select count(*)=1 from public.booking_exceptions where booking_id=b and kind='closed_while_ineligible' and status='open' and opened_by_profile_id=w1),k||' one closed_while_ineligible');
  perform pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=b and status='active')
   and not exists(select 1 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=b and rr.status='active'),k||' released');
  -- Closeout reads: milestones only, never contact.
  perform pg_temp.as_user(w1);
  perform pg_temp.expect_state(format('select public.get_assignment_contact(%L)',b),'P0002',k||' no contact after close');
  update public.providers set status='active' where id=prov;
  update public.staff_credential_documents set expires_at=now()+interval '1 year' where case_id=pg_temp.w1_case();
 end loop;
end $$;

-- A start is not a closeout step: under (a) and (b) the caregiver cannot start.
select pg_temp.c_live(6,interval '10 minutes') as pre \gset
update public.providers set status='suspended' where id=pg_temp.p5_provider('caretaker');
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'pre','started'))='forbidden','no start with the provider suspended (E7)');
reset role;
update public.providers set status='active' where id=pg_temp.p5_provider('caretaker');
update public.staff_credential_documents set expires_at=now()-interval '1 second' where case_id=pg_temp.w1_case();
select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'pre','started'))='forbidden','no start with Q06 expired');
reset role;
update public.staff_credential_documents set expires_at=now()+interval '1 year' where case_id=pg_temp.w1_case();
-- The scheduler can still cancel a confirmed booking nobody may start.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select public.cancel_booking(:'pre',pg_temp.c_v(:'pre'),'provider_unavailable');

-- (d) membership disabled, (e) account disabled: the caregiver is refused; ops closes.
-- Ops never writes the care substate (contract §6.1); reservations stay (end_assignments).
do $$ declare k text; b uuid; d integer:=10; v integer; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 foreach k in array array['d','e'] loop
  d:=d+1;
  b:=pg_temp.c_live(d,-interval '10 minutes');
  perform pg_temp.c_start(b);
  if k='d' then update public.organization_members set status='disabled' where profile_id=w1 and organization_id='c8000000-0000-4000-8000-000000000001'; end if;
  if k='e' then update public.profiles set status='disabled' where id=w1; end if;
  perform pg_temp.as_user(w1);
  perform pg_temp.expect_state(pg_temp.c_cmd('advance_care',b,'ended'),'42501',k||' end refused');
  perform pg_temp.expect_state(pg_temp.c_cmd('interrupt_care',b,'other'),'42501',k||' interrupt refused');
  perform pg_temp.assert_true(not booking_private.closeout_possible(b) and booking_private.escalatable(b),k||' escalatable');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
  v:=public.ops_close_booking(b,pg_temp.c_v(b),'interrupted','ops_closeout',gen_random_uuid());
  perform pg_temp.assert_true((select state='interrupted' and version=v from public.bookings where id=b),k||' ops closes');
  perform pg_temp.assert_true((select substate='started' and ended_at is null and end_outcome is null from public.care_plans where booking_id=b),k||' care substate unchanged by ops');
  perform pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=b and status='active'),k||' assignments ended');
  perform pg_temp.assert_true(exists(select 1 from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=b and rr.status='active'),k||' reservation kept by ops');
  -- The patient view shows the lifecycle authority next to the last reported milestone.
  perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true((select j->>'state'='interrupted' and j->>'substate'='started' from (select public.get_care_plan(b) j) x),k||' patient sees both');
  perform pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('attest_care',b,'confirmed'))='invalid_transition',k||' no attestation of an ops-closed session');
  update public.organization_members set status='active' where profile_id=w1;
  update public.profiles set status='active' where id=w1;
  perform pg_temp.p5_shift(b,now()-(48+d)*interval '1 hour');
 end loop;
end $$;

-- T18: Q06 case suspended after acceptance: no start, no address or contact.
select pg_temp.c_live(15,interval '10 minutes','e6000000-0000-4000-8000-000000000004') as t18 \gset
select pg_temp.as_user('e1000000-0000-4000-8000-000000000004');
select pg_temp.assert_true(public.get_assignment_contact(:'t18') ? 'address','caregiver reads contact while verified');
select c.id as p2_case,c.version as p2_case_v from public.provider_verification_cases c where c.provider_id=pg_temp.p5_provider('caretaker') and c.subject_profile_id='e1000000-0000-4000-8000-000000000004' \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000004');
select public.review_staff_credential_case(:'p2_case','suspended','Synthetic suspension',:p2_case_v);
select pg_temp.as_user('e1000000-0000-4000-8000-000000000004');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('advance_care',:'t18','started'))='forbidden','suspended case cannot start');
select pg_temp.expect_state(format('select public.get_booking(%L)',:'t18'),'P0002','suspended case: get_booking hidden');
select pg_temp.expect_state(format('select public.get_assignment_contact(%L)',:'t18'),'P0002','suspended case: no contact');
select pg_temp.expect_state(format('select public.get_care_plan(%L)',:'t18'),'P0002','suspended case: no care plan');
\echo 1..1
\echo ok 1 - 066_p5c_closeout_ops
rollback;
