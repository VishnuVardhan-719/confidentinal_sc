\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab gate phases (contract S10.1, S10.4; design E16, E17). Authored; DB NOT EXECUTED.
-- admission (public test, slots, create, accept): only 'on'. start (start_collection): 'on'
-- and 'off', refused 'suspended'. closeout, reads and config: every state.

do $$ declare st text; i integer:=0; r uuid; a uuid; f uuid; n integer; e integer; tv integer; m text;
 w1 uuid:='c1000000-0000-4000-8000-000000000002'; w2 uuid:='c1000000-0000-4000-8000-000000000003'; begin
 foreach st in array array['off','on','suspended'] loop
  i:=i+1;
  update booking_private.feature_gates set state='on' where key='lab';
  r:=pg_temp.lab_create(pg_temp.p5_at(2+i));
  a:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000001');
  f:=pg_temp.lab_live('c6000000-0000-4000-8000-000000000002');
  perform pg_temp.lab_step(f,w2,'start_collection');
  select count(*) into e from booking_private.feature_gate_events where key='lab';
  update booking_private.feature_gates set state=st where key='lab';
  perform pg_temp.assert_true((select count(*) from booking_private.feature_gate_events where key='lab')=e+1
   and (select to_state from booking_private.feature_gate_events where key='lab' order by version desc limit 1)=st,st||' gate change writes one event');
  -- Admission.
  perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true((public.get_lab_test_public(pg_temp.p5_service('lab')) is not null)=(st='on'),st||' public test');
  select count(*) into n from public.list_lab_slots(pg_temp.p5_service('lab'),(now() at time zone 'Asia/Kolkata')::date+5);
  perform pg_temp.assert_true((n>0)=(st='on'),st||' slots: '||n);
  m:=null;
  begin perform pg_temp.lab_create(pg_temp.p5_at(10+i)); exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m is not distinct from case when st<>'on' then 'feature_unavailable' end,st||' create: '||coalesce(m,'allowed'));
  m:=null;
  begin perform pg_temp.lab_accept(r,'c6000000-0000-4000-8000-000000000001'); exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m is not distinct from case when st<>'on' then 'feature_unavailable' end,st||' accept: '||coalesce(m,'allowed'));
  -- Start.
  m:=null;
  begin perform pg_temp.lab_step(a,w1,'start_collection'); exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m is not distinct from case when st='suspended' then 'feature_suspended' end,st||' start: '||coalesce(m,'allowed'));
  -- Closeout steps, always allowed.
  if st='suspended' then
   perform pg_temp.lab_step(a,w1,'report_absence');
   perform pg_temp.assert_true(pg_temp.lab_sub(a)='absence_reported',st||' absence allowed');
   perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
   perform public.lab_close_followup(a,'patient_contacted',gen_random_uuid());
  else
   perform pg_temp.lab_step(a,w1,'collected');
   perform pg_temp.lab_step(a,w1,'handed_over');
   perform pg_temp.assert_true(pg_temp.lab_state(a)='completed',st||' collected and handoff allowed');
  end if;
  perform pg_temp.lab_step(f,w2,'collection_failed','sample_not_obtained');
  perform pg_temp.assert_true(pg_temp.lab_state(f)='interrupted',st||' failure allowed');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform public.lab_close_followup(f,'new_booking_offered',gen_random_uuid());
  -- Reads.
  perform pg_temp.assert_true(public.get_lab_order(f) is not null,st||' scheduler reads');
  perform pg_temp.assert_true((select count(*) from public.list_lab_followups(pg_temp.p5_provider('lab'),50,null))>=0,st||' follow-up queue reads');
  perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true(public.get_lab_order(a) is not null,st||' patient reads');
  -- Provider configuration.
  select version into tv from public.lab_tests where service_id=pg_temp.p5_service('lab');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
  perform pg_temp.assert_true(public.set_lab_test(pg_temp.p5_service('lab'),'venous_blood',array['edta','serum'],8,'fasting',tv,gen_random_uuid())=tv+1,st||' set_lab_test allowed');
  -- Cancel and decline are closeout too.
  perform public.decline_booking(r,pg_temp.lab_v(r),'provider_unavailable') from public.bookings where id=r and state='requested';
 end loop;
 update booking_private.feature_gates set state='on' where key='lab';
 perform pg_temp.assert_true(not has_table_privilege('authenticated','booking_private.feature_gates','SELECT')
  and not has_table_privilege('service_role','booking_private.feature_gates','UPDATE'),'no API role can read or change the gate');
end $$;
\echo 1..1
\echo ok 1 - 047_lab_gates
rollback;
