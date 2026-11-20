\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- get_care_plan projection. Design §6.4, T23; contract §8.3 (assignee rows gated by is_assigned
-- or closeout_assignee; no address, locality, contact, patient_id, amounts), §8.5 (timeline).

create function pg_temp.plan_as(p_booking uuid,p_actor uuid) returns jsonb language plpgsql as $$
begin perform pg_temp.as_user(p_actor); return public.get_care_plan(p_booking); end $$;
create function pg_temp.hidden(p_booking uuid,p_actor uuid,p_label text) returns void language plpgsql as $$
begin perform pg_temp.as_user(p_actor); perform pg_temp.expect_state(format('select public.get_care_plan(%L)',p_booking),'P0002',p_label); end $$;
create function pg_temp.clean(j jsonb) returns boolean language sql as $$
 select j::text !~ '(Synthetic exact address|9999999999|b2000000-0000-4000-8000-000000000001|c3000000-0000-4000-8000-000000000004|c1000000-0000-4000-8000-000000000002|c6000000-0000-4000-8000-000000000001|amount|line1|locality|phone|patient_id)'; $$;
select array['booking_id','booking_version','state','plan_version','task_codes','substate','started_at','ended_at'] as base \gset
select set_config('p5c.base',:'base',true);
select set_config('p5c.full',(:'base'::text[]||array['end_outcome','interruption_reason','attestation','attested_at','timeline'])::text,true);

select pg_temp.c_live(2,interval '10 minutes') as b \gset
select set_config('p5c.b',:'b',true);
do $$ declare b uuid:=current_setting('p5c.b')::uuid; base text[]:=current_setting('p5c.base')::text[]; full_keys text[]:=current_setting('p5c.full')::text[]; j jsonb; who uuid; begin
 -- Confirmed, inside the window.
 foreach who in array array['b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001']::uuid[] loop
  j:=pg_temp.plan_as(b,who);
  perform pg_temp.assert_true(pg_temp.keys(j)=pg_temp.sorted(full_keys) and pg_temp.clean(j),'full key set for '||who);
  perform pg_temp.assert_true(j->>'substate'='assigned' and j->>'state'='confirmed' and j->'task_codes'=to_jsonb(array['companionship','mobility_support']),'values for '||who);
  perform pg_temp.assert_true((select bool_and(pg_temp.keys(e)=array['occurred_at','reason']) from jsonb_array_elements(j->'timeline') e)
   and (select array_agg(e->>'reason') from jsonb_array_elements(j->'timeline') e)=array['requested','accepted','confirmed'],'timeline without actors for '||who);
 end loop;
 j:=pg_temp.plan_as(b,'c1000000-0000-4000-8000-000000000002');
 perform pg_temp.assert_true(pg_temp.keys(j)=pg_temp.sorted(base) and pg_temp.clean(j),'caregiver key set');
 foreach who in array array['e1000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000003',
  'e1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000007']::uuid[] loop
  perform pg_temp.hidden(b,who,'hidden from '||who);
 end loop;
 -- Window: before start_at - 60 min the caregiver sees nothing.
 perform pg_temp.p5_shift(b,now()+interval '2 hours');
 perform pg_temp.hidden(b,'c1000000-0000-4000-8000-000000000002','caregiver before the window');
 perform pg_temp.p5_shift(b,now()-interval '10 minutes');
 perform pg_temp.c_start(b);
 -- In progress past end_at + 12 h: closeout viewer, milestones only.
 perform pg_temp.p5_shift(b,now()-interval '20 hours');
 j:=pg_temp.plan_as(b,'c1000000-0000-4000-8000-000000000002');
 perform pg_temp.assert_true(pg_temp.keys(j)=pg_temp.sorted(base) and j->>'substate'='started','closeout caregiver key set');
 perform pg_temp.c_end(b);
 perform pg_temp.hidden(b,'c1000000-0000-4000-8000-000000000002','caregiver after the end');
 j:=pg_temp.plan_as(b,'b1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(j->>'end_outcome'='completed' and j->>'state'='completed' and j->'ended_at' is not null
  and jsonb_array_length(j->'timeline')=5 and pg_temp.clean(j),'patient sees the reported end');
 j:=pg_temp.plan_as(b,'c1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(j->>'end_outcome'='completed','scheduler sees the reported end');
end $$;
-- Other categories and inactive accounts.
select pg_temp.p5_create('doctor',pg_temp.p5_at(3)) as doc \gset
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.get_care_plan(%L)',:'doc'),'P0002','doctor booking has no care plan');
select pg_temp.expect_state(format('select public.get_care_plan(%L)',gen_random_uuid()),'P0002','unknown booking');
select set_config('request.jwt.claims','',true);
select pg_temp.expect_state(format('select public.get_care_plan(%L)',:'b'),'42501','no session');
-- Reads write no audit row.
select pg_temp.assert_true(not exists(select 1 from public.audit_events where target_id=:'b' and action like 'care.%' and action<>'care.plan_snapshotted'),'reads are not audited');
\echo 1..1
\echo ok 1 - 067_p5c_reads
rollback;
