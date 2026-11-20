\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5l_fixture.inc
-- P5 lab release and resource-busy (contract S11.1, S11.5 (1)(5)(6), S12.1, S12.2; design D5,
-- E14). Lab releases on handoff, failures and absence; ops keeps reservations. Authored; DB NOT EXECUTED.

create function pg_temp.edit_rule(p_resource uuid) returns uuid language plpgsql as $$
declare r public.availability_rules; begin
 select * into r from public.availability_rules where provider_id=pg_temp.p5_provider('lab') and resource_id=p_resource order by weekday limit 1;
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 return public.set_booking_availability(r.provider_id,r.resource_id,r.weekday,r.local_start,r.local_end,r.effective_from,r.effective_to,r.version,r.id);
end $$;

select pg_temp.assert_true((select assignee_close='release' and not generic_create and not generic_accept from booking_private.category_paths where category='lab'),'lab paths: own create/accept, release (OD-7)');

-- Early handoff, failure and absence release the buffered reservation; edits are allowed at once.
do $$ declare b uuid; m text; w1 uuid:='c1000000-0000-4000-8000-000000000002'; begin
 b:=pg_temp.lab_collected();
 m:=null; begin perform pg_temp.edit_rule('c6000000-0000-4000-8000-000000000001'); exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='resource_in_use','rule edit refused while the sample is held');
 perform pg_temp.lab_step(b,w1,'handed_over');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='released' and pg_temp.lab_active(b)=0,'handoff releases');
 perform pg_temp.edit_rule('c6000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000001'),'not busy after normal completion');
 -- The freed after-buffer can be booked again: an accept overlapping the old period succeeds.
 perform pg_temp.p5_shift(b,pg_temp.p5_at(2));
 perform pg_temp.assert_true(pg_temp.lab_state(pg_temp.lab_book(pg_temp.p5_at(2,1),'c6000000-0000-4000-8000-000000000001'))='confirmed','released buffer is bookable');
 -- Direct reactivation of a released reservation is refused (S11.2).
 perform pg_temp.expect_state(format('update public.resource_reservations set status=''active'' where assignment_id in (select id from public.booking_assignments where booking_id=%L)',b),'55000','released reservation never reactivates');
 b:=pg_temp.lab_live();
 perform pg_temp.lab_step(b,w1,'start_collection');
 perform pg_temp.lab_step(b,w1,'collection_failed','technician_unable');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='released','collection failure releases');
 b:=pg_temp.lab_live();
 perform pg_temp.lab_step(b,w1,'report_absence');
 perform pg_temp.assert_true(pg_temp.lab_res(b)='released' and pg_temp.lab_state(b)='confirmed','absence releases while the booking stays confirmed');
end $$;

-- Ops close keeps the reservation until its upper bound (S12.1): overlapping accept 23P01,
-- rule edit resource_in_use; both allowed once the kept period is past.
do $$ declare b uuid; x uuid; m text; w2 uuid:='c6000000-0000-4000-8000-000000000002'; begin
 b:=pg_temp.lab_collected(w2);
 update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000003';
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
 perform public.ops_close_booking(b,pg_temp.lab_v(b),'interrupted','ops_closeout',gen_random_uuid());
 update public.organization_members set status='active' where profile_id='c1000000-0000-4000-8000-000000000003';
 perform pg_temp.assert_true(pg_temp.lab_res(b)='active' and pg_temp.lab_active(b)=0,'ops close keeps the reservation');
 perform pg_temp.assert_true(not booking_private.resource_busy(w2),'kept reservation without an active assignment is not busy');
 m:=null; begin perform pg_temp.edit_rule(w2); exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='resource_in_use','rule edit refused during the kept period');
 perform pg_temp.p5_shift(b,pg_temp.p5_at(4));
 x:=pg_temp.lab_create(pg_temp.p5_at(4,1));
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.accept_lab_booking(%L,%s,%L,gen_random_uuid())',x,pg_temp.lab_v(x),w2),'23P01','kept buffer blocks an overlapping accept');
 perform pg_temp.p5_shift(b,now()-interval '30 hours');
 perform pg_temp.edit_rule(w2);
 perform pg_temp.lab_accept(x,w2);
 perform pg_temp.assert_true(pg_temp.lab_state(x)='confirmed','accept and edit allowed once the kept period is past');
end $$;

-- Busy across categories (S11.5 (1)): overdue lab custody blocks a doctor accept and drops
-- the person from lab and generic slots; handoff clears it.
do $$ declare h1 uuid; h2 uuid; d uuid; m text; n integer; slot_day date:=(now() at time zone 'Asia/Kolkata')::date+6; begin
 h1:=pg_temp.lab_collected('c6000000-0000-4000-8000-000000000001',now()-interval '10 minutes',7);
 perform pg_temp.p5_shift(h1,now()-interval '3 hours');
 h2:=pg_temp.lab_collected('c6000000-0000-4000-8000-000000000002',now()-interval '10 minutes',7);
 perform pg_temp.p5_shift(h2,now()-interval '3 hours');
 perform pg_temp.assert_true(booking_private.resource_busy('c6000000-0000-4000-8000-000000000001') and booking_private.resource_busy('c6000000-0000-4000-8000-000000000002'),'both technicians busy');
 perform pg_temp.assert_true(booking_private.booking_overdue(h1),'overdue custody');
 d:=pg_temp.p5_create('doctor',pg_temp.p5_at(8));
 m:=null; begin perform pg_temp.p5_accept(d,array['c6000000-0000-4000-8000-000000000001']::uuid[]); exception when others then get stacked diagnostics m=message_text; end;
 perform pg_temp.assert_true(m='resource_busy','doctor accept refused for a technician holding overdue custody');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 select count(*) into n from public.list_lab_slots(pg_temp.p5_service('lab'),slot_day);
 perform pg_temp.assert_true(n=0,'lab slots exclude busy technicians');
 select count(*) into n from public.list_slots(pg_temp.p5_provider('doctor'),pg_temp.p5_service('doctor'),slot_day);
 perform pg_temp.assert_true(n=0,'generic doctor slots exclude the same busy people');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(exists(select 1 from public.list_lab_followups(pg_temp.p5_provider('lab'),50,null) x where x->>'kind'='custody_overdue' and (x->>'booking_id')::uuid=h1),'custody_overdue follow-up');
 perform pg_temp.lab_step(h1,'c1000000-0000-4000-8000-000000000002','handed_over');
 perform pg_temp.lab_step(h2,'c1000000-0000-4000-8000-000000000003','handed_over');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true((select count(*) from public.list_lab_slots(pg_temp.p5_service('lab'),slot_day))>0,'lab slots back after handoff');
 perform pg_temp.p5_accept(d,array['c6000000-0000-4000-8000-000000000001']::uuid[]);
 perform pg_temp.assert_true(pg_temp.lab_state(d)='confirmed','doctor accept allowed after handoff');
end $$;
\echo 1..1
\echo ok 1 - 048_lab_release
rollback;
