\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab closeout and ops through the real lab commands (contract S5.3, S6.1, S6.4, S6.5;
-- design E15, LAB-Q13). Authored; DB NOT EXECUTED.
-- W1 holds a collected sample. (a) provider suspended, (b) Q06 case expired, (c) past
-- end_at + 12 h: the handoff succeeds through closeout and opens one closed_while_ineligible
-- exception. (d) membership disabled, (e) account disabled: 42501, and ops closes instead.

do $$ declare k text; b uuid; v integer; prov uuid:=pg_temp.p5_provider('lab'); i integer:=0; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 foreach k in array array['a','b','c'] loop
  i:=i+1;
  b:=pg_temp.lab_collected();
  perform pg_temp.p5_shift(b,case when k='c' then now()-(20+i*3)*interval '1 hour' else now()-(i*3)*interval '1 hour' end);
  if k='a' then update public.providers set status='suspended' where id=prov; end if;
  if k='b' then update public.staff_credential_documents set expires_at=now()-interval '1 second'
   where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1); end if;
  perform pg_temp.as_user(w1);
  perform pg_temp.assert_true(not identity_private.is_assigned(b,'lab_collection') and booking_private.closeout_assignee(b),k||' closeout only');
  perform pg_temp.assert_true(pg_temp.keys(public.get_lab_order(b)) @> array['sample_type'],k||' closeout assignee still reads the order (S8.3)');
  perform pg_temp.expect_state(pg_temp.step_sql(b,'collected'),'42501',k||' non-terminal step needs the live predicate');
  -- A different member of the same provider never closes.
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000003');
  perform pg_temp.expect_state(pg_temp.step_sql(b,'handed_over'),'42501',k||' other member cannot hand over');
  v:=pg_temp.lab_step(b,w1,'handed_over');
  perform pg_temp.assert_true(pg_temp.lab_state(b)='completed' and pg_temp.lab_sub(b)='handed_over',k||' closed by the assignee');
  perform pg_temp.assert_true((select count(*)=1 from public.booking_exceptions where booking_id=b and kind='closed_while_ineligible' and status='open'
   and reason='sample_handed_over' and opened_by_profile_id=w1),k||' one closed_while_ineligible');
  perform pg_temp.assert_true(pg_temp.lab_res(b)='released' and pg_temp.lab_active(b)=0,k||' lab closeout releases');
  update public.providers set status='active' where id=prov;
  update public.staff_credential_documents set expires_at=now()+interval '1 year'
   where case_id=(select id from public.provider_verification_cases where provider_id=prov and subject_profile_id=w1);
 end loop;
 -- Collection failure through closeout as well (provider suspended mid-collection).
 b:=pg_temp.lab_live();
 perform pg_temp.lab_step(b,w1,'start_collection');
 perform pg_temp.p5_shift(b,now()-interval '13 hours');
 update public.providers set status='suspended' where id=prov;
 perform pg_temp.lab_step(b,w1,'collection_failed','technician_unable');
 perform pg_temp.assert_true(pg_temp.lab_state(b)='interrupted' and (select count(*)=1 from public.booking_exceptions where booking_id=b and kind='closed_while_ineligible'),'collection failure via closeout');
 update public.providers set status='active' where id=prov;
end $$;

do $$ declare k text; b uuid; v integer; i integer:=0; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 foreach k in array array['d','e'] loop
  i:=i+1;
  b:=pg_temp.lab_collected();
  perform pg_temp.p5_shift(b,now()-(30+i*3)*interval '1 hour');
  if k='d' then update public.organization_members set status='disabled' where profile_id=w1; end if;
  if k='e' then update public.profiles set status='disabled' where id=w1; end if;
  perform pg_temp.as_user(w1);
  perform pg_temp.expect_state(pg_temp.step_sql(b,'handed_over'),'42501',k||' assignee refused');
  perform pg_temp.assert_true(not booking_private.closeout_possible(b) and booking_private.escalatable(b),k||' escalatable');
  -- Ops closes: interrupted, assignments end, reservations kept, lab substate unchanged.
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
  v:=public.ops_close_booking(b,pg_temp.lab_v(b),'interrupted','ops_closeout',gen_random_uuid());
  perform pg_temp.assert_true(pg_temp.lab_state(b)='interrupted' and pg_temp.lab_sub(b)='collected',k||' ops close; substate stays the last milestone');
  perform pg_temp.assert_true(pg_temp.lab_active(b)=0 and pg_temp.lab_res(b)='active',k||' ops ends assignments and keeps reservations');
  perform pg_temp.assert_true((select reason from public.booking_events where booking_id=b order by aggregate_version desc limit 1)='ops_closeout',k||' ops_closeout event');
  update public.organization_members set status='active' where profile_id=w1;
  update public.profiles set status='active' where id=w1;
  -- The ops-closed order is not custody_overdue any more; ops cannot write a lab step.
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true(not exists(select 1 from public.list_lab_followups(pg_temp.p5_provider('lab'),50,null) x where (x->>'booking_id')::uuid=b),k||' not in the follow-up queue');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
  perform pg_temp.expect_state(pg_temp.step_sql(b,'handed_over'),'42501',k||' ops has no lab step');
 end loop;
end $$;

-- Ops on lab: not escalatable before a trigger; after an absence exception both outcomes;
-- ops never completes; the absence_disputed path resolves the exception.
do $$ declare b uuid; v integer; w2 uuid:='c1000000-0000-4000-8000-000000000003'; begin
 b:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000002');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
 perform pg_temp.expect_state(format('select public.ops_close_booking(%L,%s,''interrupted'',''ops_closeout'',gen_random_uuid())',b,pg_temp.lab_v(b)),'55000','not escalatable before a trigger');
 perform pg_temp.lab_step(b,w2,'report_absence');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
 perform pg_temp.expect_state(format('select public.ops_close_booking(%L,%s,''completed'',''ops_closeout'',gen_random_uuid())',b,pg_temp.lab_v(b)),'22023','ops never completes');
 perform pg_temp.expect_state(format('select public.ops_close_booking(%L,%s,''no_show'',''ops_closeout'',gen_random_uuid())',b,pg_temp.lab_v(b)),'22023','no-show needs no_show_confirmed');
 v:=public.ops_close_booking(b,pg_temp.lab_v(b),'interrupted','absence_disputed',gen_random_uuid());
 perform pg_temp.assert_true(pg_temp.lab_state(b)='interrupted' and pg_temp.lab_sub(b)='absence_reported'
  and (select resolution='absence_disputed' from public.booking_exceptions where booking_id=b and kind='absence_reported'),'disputed absence closes as interrupted');
 -- The patient sees the outcome through the lab projection.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true((select array_agg(e.v->>'reason' order by e.n) from jsonb_array_elements(public.get_lab_order(b)->'timeline') with ordinality e(v,n))
  =array['requested','accepted','confirmed','absence_reported','absence_disputed'],'patient timeline shows the ops outcome');
end $$;
\echo 1..1
\echo ok 1 - 045_lab_closeout_ops
rollback;
