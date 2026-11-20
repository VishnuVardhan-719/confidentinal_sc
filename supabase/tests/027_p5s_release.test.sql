\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §12 (P5-15) and §11.3: release() frees the buffered reservation,
-- end_assignments() keeps it until its upper bound. Per category_paths: doctor and
-- ambulance keep it after an assignee finish, lab and care release; ops always keeps it.

select pg_temp.assert_true((select array_agg(category||':'||assignee_close order by category) from booking_private.category_paths)
 =array['ambulance:end_assignments','caretaker:release','doctor:end_assignments','lab:release'],'assignee close per category (OD-7)');
-- A published policy with a 30 minute buffer on both sides.
insert into public.booking_policy_versions(version,terms_text_ref,buffer_minutes,status) values (1,'synthetic-p5s-terms',30,'published');

create function pg_temp.res_for(p_category text) returns uuid[] language sql as $$
 select case when p_category='ambulance' then array['c6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000003']::uuid[]
  else array['c6000000-0000-4000-8000-000000000001']::uuid[] end; $$;
create function pg_temp.res_status(p_booking uuid) returns text language sql as $$
 select string_agg(distinct rr.status,',') from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=p_booking; $$;
create function pg_temp.edit_rule(p_category text) returns uuid language plpgsql as $$
declare r public.availability_rules; begin
 select * into r from public.availability_rules where provider_id=pg_temp.p5_provider(p_category) and resource_id='c6000000-0000-4000-8000-000000000001' order by weekday limit 1;
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
 return public.set_booking_availability(r.provider_id,r.resource_id,r.weekday,r.local_start,r.local_end,r.effective_from,r.effective_to,r.version,r.id);
end $$;

do $$ declare c text; b uuid; b2 uuid; keep boolean; i integer:=0; m text; t2 timestamptz; w1 uuid:='c1000000-0000-4000-8000-000000000002';
 fin text; begin
 foreach c in array array['doctor','lab','ambulance','caretaker'] loop
  i:=i+1; keep:=c in ('doctor','ambulance');
  fin:=case when c in ('doctor','caretaker') then 'service_completed' else 'other' end;
  -- Early completion: the visit started 10 minutes ago and its buffer runs past now.
  b:=pg_temp.p5_book(c,pg_temp.p5_at(2,2*i),pg_temp.res_for(c));
  perform pg_temp.assert_true((select bool_and(upper(rr.occupied_period)-lower(rr.occupied_period)=interval '90 minutes') from public.resource_reservations rr join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=b),c||' occupied period includes both buffers');
  perform pg_temp.p5_shift(b,now()-interval '10 minutes');
  perform pg_temp.p5_step(b,w1,'in_progress',case when c in ('doctor','caretaker') then 'service_started' else 'other' end);
  perform pg_temp.as_user(w1);
  perform booking_private.assignee_finish(b,'completed',fin,gen_random_uuid());
  perform pg_temp.assert_true((select count(*)=0 from public.booking_assignments where booking_id=b and status='active'),c||' completion ends assignments');
  perform pg_temp.assert_true(pg_temp.res_status(b)=case when keep then 'active' else 'released' end,c||' completion reservation '||pg_temp.res_status(b));
  -- Availability edit: refused during a retained period, allowed once it is past.
  m:=null; begin perform pg_temp.edit_rule(c); exception when others then get stacked diagnostics m=message_text; end;
  perform pg_temp.assert_true(m is not distinct from case when keep then 'resource_in_use' end,c||' rule edit during the retained period: '||coalesce(m,'allowed'));
  if keep then
   -- A second booking overlapping only the kept after-buffer is refused at accept.
   t2:=pg_temp.p5_at(10,2*i);
   b2:=pg_temp.p5_create(c,t2);
   perform pg_temp.p5_shift(b,t2-interval '60 minutes');
   perform pg_temp.expect_state(format('select pg_temp.p5_accept(%L,%L::uuid[])',b2,pg_temp.res_for(c)),'23P01',c||' kept after-buffer blocks an overlapping accept');
   perform pg_temp.p5_shift(b,now()-(10*i+3)*interval '1 hour');
   perform pg_temp.edit_rule(c);
   perform pg_temp.p5_accept(b2,pg_temp.res_for(c));
   perform pg_temp.assert_true((select state from public.bookings where id=b2)='confirmed',c||' accept allowed once the kept period moved');
   perform pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
   perform public.cancel_booking(b2,(select version from public.bookings where id=b2),'provider_unavailable');
   perform pg_temp.assert_true(pg_temp.res_status(b2)='released',c||' cancellation releases');
  else
   perform pg_temp.p5_shift(b,now()-(10*i+3)*interval '1 hour');
  end if;
  -- Early interruption follows the same table.
  b:=pg_temp.p5_book(c,pg_temp.p5_at(3,2*i),pg_temp.res_for(c));
  perform pg_temp.p5_shift(b,now()-interval '10 minutes');
  perform pg_temp.p5_step(b,w1,'in_progress',case when c in ('doctor','caretaker') then 'service_started' else 'other' end);
  perform pg_temp.as_user(w1);
  perform booking_private.assignee_finish(b,'interrupted','unsafe_conditions',gen_random_uuid());
  perform pg_temp.assert_true(pg_temp.res_status(b)=case when keep then 'active' else 'released' end,c||' interruption reservation');
  perform pg_temp.p5_shift(b,now()-(10*i+6)*interval '1 hour');
  -- Ops close keeps reservations in every category.
  b:=pg_temp.p5_book(c,pg_temp.p5_at(4,2*i),pg_temp.res_for(c));
  perform pg_temp.p5_shift(b,now()-(10*i+40)*interval '1 hour');
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000005');
  perform public.ops_close_booking(b,(select version from public.bookings where id=b),'interrupted','ops_closeout',gen_random_uuid());
  perform pg_temp.assert_true(pg_temp.res_status(b)='active' and (select count(*)=0 from public.booking_assignments where booking_id=b and status='active'),c||' ops close keeps reservations, ends assignments');
  -- Past kept reservations do not freeze availability edits or resource disabling.
  perform pg_temp.edit_rule(c);
 end loop;
end $$;
-- A resource with only past kept reservations may be disabled; a busy one may not.
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not booking_private.resource_busy('c6000000-0000-4000-8000-000000000003'),'vehicle not busy');
select version as v_version from public.resources where id='c6000000-0000-4000-8000-000000000003' \gset
select public.upsert_booking_resource(pg_temp.p5_provider('ambulance'),'vehicle',null,'SYNP5V01',:v_version,'c6000000-0000-4000-8000-000000000003','disabled');
select pg_temp.assert_true((select status from public.resources where id='c6000000-0000-4000-8000-000000000003')='disabled','vehicle with past kept reservations disabled');
select pg_temp.p5_book('ambulance',pg_temp.p5_at(12),array['c6000000-0000-4000-8000-000000000002'::uuid,'c6000000-0000-4000-8000-000000000004'::uuid]) as future \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select version as v4 from public.resources where id='c6000000-0000-4000-8000-000000000004' \gset
select pg_temp.expect_state(format('select public.upsert_booking_resource(%L,''vehicle'',null,''SYNP5V02'',%s,''c6000000-0000-4000-8000-000000000004'',''disabled'')',pg_temp.p5_provider('ambulance'),:v4),'40001','vehicle with a future reservation cannot be disabled');
\echo 1..1
\echo ok 1 - 027_p5s_release
rollback;
