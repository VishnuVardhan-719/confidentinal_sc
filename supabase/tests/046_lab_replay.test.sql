\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab keyed replay (contract S13.1, S13.3; design E13, E25, E26). Authored; DB NOT EXECUTED.
-- Every assignment-ending lab step: same key and arguments returns the original version and
-- writes nothing; a changed argument is 40001; another actor gets an ordinary call that
-- fails authorization; after membership revoke, Q06 expiry or gate suspension it still replays.

create function pg_temp.adv(p_booking uuid,p_step text,p_version integer,p_failure text,p_key uuid) returns integer language sql as $$
 select public.advance_lab_order(p_booking,p_step,p_version,p_failure,p_key); $$;

do $$ declare st text; b uuid; v integer; v0 integer; k uuid; ev integer; i integer:=0; fail text; w1 uuid:='c1000000-0000-4000-8000-000000000002';
 prov uuid:=pg_temp.p5_provider('lab'); begin
 foreach st in array array['report_absence','handed_over','collection_failed','handoff_failed'] loop
  i:=i+1;
  b:=pg_temp.lab_live();
  if st<>'report_absence' then perform pg_temp.lab_step(b,w1,'start_collection'); end if;
  if st in ('handed_over','handoff_failed') then perform pg_temp.lab_step(b,w1,'collected'); end if;
  fail:=case st when 'collection_failed' then 'sample_not_obtained' when 'handoff_failed' then 'lab_not_receiving' end;
  k:=gen_random_uuid(); v0:=pg_temp.lab_v(b);
  perform pg_temp.as_user(w1);
  v:=pg_temp.adv(b,st,v0,fail,k);
  perform pg_temp.assert_true(v=v0+1,st||' first call');
  select count(*) into ev from public.booking_events where booking_id=b;
  perform pg_temp.assert_true(pg_temp.adv(b,st,v0,fail,k)=v,st||' same key and arguments replay');
  perform pg_temp.expect_state(format('select pg_temp.adv(%L,%L,%s,%L,%L)',b,st,v0+1,fail,k),'40001',st||' changed version conflicts');
  if fail is not null then
   perform pg_temp.expect_state(format('select pg_temp.adv(%L,%L,%s,%L,%L)',b,st,v0,'technician_unable',k),'40001',st||' changed failure code conflicts');
  end if;
  perform pg_temp.assert_true((select result_version=v and result_id=(select id from public.booking_events where booking_id=b and aggregate_version=v)
   from public.idempotency_requests where actor_profile_id=w1 and action='p5.lab.advance' and request_key=k),st||' replay row: event and version');
  -- Lost authority: membership disabled, Q06 expired, gate suspended. Replay still returns.
  update public.organization_members set status='disabled' where profile_id=w1;
  update public.staff_credential_documents set expires_at=now()-interval '1 second'
   where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
  update booking_private.feature_gates set state='suspended' where key='lab';
  perform pg_temp.as_user(w1);
  perform pg_temp.assert_true(pg_temp.adv(b,st,v0,fail,k)=v,st||' replay after losing every live authority');
  update public.organization_members set status='active' where profile_id=w1;
  update public.staff_credential_documents set expires_at=now()+interval '1 year'
   where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
  update booking_private.feature_gates set state='on' where key='lab';
  perform pg_temp.assert_true((select count(*) from public.booking_events where booking_id=b)=ev,st||' replays wrote no event');
  -- The same key by another actor is a new call; the outsider is not the assignee.
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
  perform pg_temp.expect_state(format('select pg_temp.adv(%L,%L,%s,%L,%L)',b,st,v0,fail,k),'42501',st||' another actor gets no replay');
  -- Without a key match, the same request is stale or unauthorised, never a second event.
  perform pg_temp.as_user(w1);
  perform pg_temp.expect_state(format('select pg_temp.adv(%L,%L,%s,%L,%L)',b,st,v0,fail,gen_random_uuid()),'42501',st||' new key after the assignment ended');
 end loop;
end $$;

-- Retry after a later step returns the original version (start replayed after collected).
do $$ declare b uuid; k uuid:=gen_random_uuid(); v integer; v0 integer; w2 uuid:='c1000000-0000-4000-8000-000000000003'; begin
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000002');
 v0:=pg_temp.lab_v(b);
 perform pg_temp.as_user(w2);
 v:=pg_temp.adv(b,'start_collection',v0,null,k);
 perform pg_temp.lab_step(b,w2,'collected');
 perform pg_temp.as_user(w2);
 perform pg_temp.assert_true(pg_temp.adv(b,'start_collection',v0,null,k)=v,'start replay after a later step');
 perform pg_temp.expect_state(format('select pg_temp.adv(%L,''collected'',%s,null,%L)',b,v0,k),'40001','one key reused for another step conflicts');
 perform pg_temp.lab_step(b,w2,'handed_over');
end $$;

-- Follow-up close and accept replay; accept replay after the gate turns off.
do $$ declare b uuid; k uuid:=gen_random_uuid(); c jsonb; v integer; x uuid; begin
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000002');
 perform pg_temp.lab_step(b,'c1000000-0000-4000-8000-000000000003','report_absence');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 c:=public.lab_close_followup(b,'new_booking_offered',k);
 perform pg_temp.assert_true(public.lab_close_followup(b,'new_booking_offered',k)=c,'follow-up replay');
 perform pg_temp.expect_state(format('select public.lab_close_followup(%L,''patient_contacted'',%L)',b,k),'40001','follow-up key with another code');
 x:=pg_temp.lab_create(pg_temp.p5_at(2));
 k:=gen_random_uuid();
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 v:=public.accept_lab_booking(x,2,'c6000000-0000-4000-8000-000000000002',k);
 update booking_private.feature_gates set state='off' where key='lab';
 perform pg_temp.assert_true(public.accept_lab_booking(x,2,'c6000000-0000-4000-8000-000000000002',k)=v,'accept replay with the gate off');
 update booking_private.feature_gates set state='on' where key='lab';
 perform pg_temp.assert_true((select count(*)=1 from public.booking_assignments where booking_id=x),'accept replay wrote no second assignment');
end $$;
\echo 1..1
\echo ok 1 - 046_lab_replay
rollback;
