\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
-- P5 shared fix 001592: a blackout blocks only the periods it overlaps.

create function pg_temp.slot(p_days integer,p_hour integer) returns tstzrange language sql as $$
 select tstzrange(((current_date+p_days)::timestamp+p_hour*interval '1 hour') at time zone 'Asia/Kolkata',
  ((current_date+p_days)::timestamp+p_hour*interval '1 hour'+interval '30 minutes') at time zone 'Asia/Kolkata','[)'); $$;
create function pg_temp.ok(p tstzrange) returns boolean language sql as $$
 select booking_private.in_schedule('b3000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001',p); $$;

select pg_temp.assert_true(pg_temp.ok(pg_temp.slot(2,10)),'free slot is in schedule');
insert into public.availability_exceptions(provider_id,resource_id,period,reason)
 values('b3000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001',pg_temp.slot(5,10),'unavailable');
select pg_temp.assert_true(pg_temp.ok(pg_temp.slot(2,10)),'a blackout on another day leaves this slot open');
select pg_temp.assert_true(pg_temp.ok(pg_temp.slot(5,12)),'a blackout earlier the same day leaves later slots open');
select pg_temp.assert_true(not pg_temp.ok(pg_temp.slot(5,10)),'the blacked-out slot is closed');
select pg_temp.assert_true(not pg_temp.ok(tstzrange(lower(pg_temp.slot(5,10))+interval '15 minutes',upper(pg_temp.slot(5,10))+interval '15 minutes','[)')),'a partly overlapping slot is closed');
select pg_temp.assert_true(pg_temp.ok(tstzrange(upper(pg_temp.slot(5,10)),upper(pg_temp.slot(5,10))+interval '30 minutes','[)')),'the slot starting at the blackout end is open');
select pg_temp.assert_true(not pg_temp.ok(pg_temp.slot(400,10)),'outside the rule window stays closed');

\echo 1..1
\echo ok 1 - 029_p5s_in_schedule
rollback;
