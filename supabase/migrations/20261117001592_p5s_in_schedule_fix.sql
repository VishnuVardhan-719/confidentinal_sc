-- P5 shared fix / Claude / integ/all. booking_private.in_schedule blackout check (lab review).
-- Synthetic local/staging only. Authored, DB NOT EXECUTED.
--
-- B01 (202611170005) compared `e.period && period` inside a subquery over
-- availability_exceptions e. In a SQL function a column name wins over a parameter name, so
-- the bare `period` was e.period: the test was always true and one blackout row made the
-- resource unschedulable for every period. The parameter is now qualified; the rest of the
-- body is unchanged (availability_rules has no column named period, provider or resource).
-- CREATE OR REPLACE keeps the owner and grants.
begin;

create or replace function booking_private.in_schedule(provider uuid,resource uuid,period tstzrange) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.availability_rules a where a.provider_id=in_schedule.provider and a.resource_id=in_schedule.resource
 and (lower(in_schedule.period) at time zone a.timezone)::date between a.effective_from and a.effective_to
 and extract(dow from lower(in_schedule.period) at time zone a.timezone)=a.weekday
 and in_schedule.period <@ tstzrange(((lower(in_schedule.period) at time zone a.timezone)::date+a.local_start) at time zone a.timezone,
 ((lower(in_schedule.period) at time zone a.timezone)::date+a.local_end) at time zone a.timezone,'[)'))
 and not exists(select 1 from public.availability_exceptions e where e.resource_id=in_schedule.resource and e.period && in_schedule.period);
$$;

commit;
