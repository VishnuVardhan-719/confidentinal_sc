-- P5 shared engine 3/5 / Kiro / feat/P5-shared-engine / base integ/all f549ad3.
-- Contract §6.3-§6.4 (exceptions, ops commands), §11 (resource-busy guard,
-- resource_in_use fix), §12 (assignment end/release). Requires 001550 and 001560.
-- Synthetic local/staging only. Lock order (§11.4): booking, provider (org first),
-- resources by id, category rows, booking_exceptions, capability row (for share).
begin;

-- §6.3 exception kinds; category blocks add kinds by insert only.
create table booking_private.exception_kinds (
 code text primary key check (code ~ '^[a-z][a-z0-9_]{1,47}$'),
 blocks_resources boolean not null,
 resolutions text[] not null check (cardinality(resolutions)>0 and array_position(resolutions,null) is null)
);
create trigger p5s_exception_kinds_immutable before update or delete on booking_private.exception_kinds for each row execute function booking_private.registry_immutable();
create trigger p5s_exception_kinds_no_truncate before truncate on booking_private.exception_kinds for each statement execute function booking_private.registry_immutable();
insert into booking_private.exception_kinds values
 ('absence_reported',false,array['no_show_confirmed','absence_disputed']),
 ('interrupted',false,array['resolved']),
 ('interrupted_after_pickup',true,array['resolved']),
 ('eligibility_lapsed',false,array['resolved']),
 ('closed_while_ineligible',false,array['resolved']);

create table public.booking_exceptions (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 kind text not null references booking_private.exception_kinds(code),
 reason text not null references booking_private.reason_codes(code),
 opened_by_profile_id uuid not null references public.profiles(id),
 opened_at timestamptz not null default clock_timestamp(),
 status text not null default 'open' check (status in ('open','resolved')),
 resolution text,
 resolved_by_profile_id uuid references public.profiles(id),
 resolved_at timestamptz,
 version integer not null default 1 check (version>0),
 check ((status='open' and resolution is null and resolved_by_profile_id is null and resolved_at is null)
  or (status='resolved' and resolution is not null and resolved_by_profile_id is not null and resolved_at is not null)),
 check (resolved_by_profile_id is null or resolved_by_profile_id<>opened_by_profile_id)
);
create unique index p5s_exception_open on public.booking_exceptions(booking_id,kind) where status='open';
create index p5s_exception_booking on public.booking_exceptions(booking_id);

create function booking_private.guard_exception() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_exception'; end if;
 if old.status<>'open' or new.status<>'resolved' or new.version<>old.version+1
 or (to_jsonb(new)-array['status','resolution','resolved_by_profile_id','resolved_at','version'])
  is distinct from (to_jsonb(old)-array['status','resolution','resolved_by_profile_id','resolved_at','version'])
 or not exists(select 1 from booking_private.exception_kinds k where k.code=old.kind and new.resolution=any(k.resolutions)) then
  raise exception using errcode='55000',message='immutable_exception'; end if;
 return new;
end $$;
create trigger p5s_exception_guard before update or delete on public.booking_exceptions for each row execute function booking_private.guard_exception();
create trigger p5s_exception_no_truncate before truncate on public.booking_exceptions for each statement execute function booking_private.immutable();

-- A caller opening a blocks_resources kind must already hold the booking's resource locks.
create function booking_private.open_exception(p_booking_id uuid,p_kind text,p_reason text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare result uuid; begin
 if exists(select 1 from public.booking_exceptions where booking_id=p_booking_id and kind=p_kind and status='open') then
  raise exception using errcode='55000',message='exception_open'; end if;
 insert into public.booking_exceptions(booking_id,kind,reason,opened_by_profile_id)
 values(p_booking_id,p_kind,p_reason,auth.uid()) returning id into result;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(auth.uid(),'booking.exception_opened','booking_exception',result);
 return result;
exception when unique_violation then
 raise exception using errcode='55000',message='exception_open';
end $$;

-- §12 the two lifecycle operations; release() is built and unchanged.
create function booking_private.end_assignments(p_booking_id uuid) returns void language sql volatile security definer set search_path='' as $$
 update public.booking_assignments set status='ended',ended_at=clock_timestamp() where booking_id=p_booking_id and status='active';
$$;
create function booking_private.finish_assignments(p_booking_id uuid) returns void language plpgsql volatile security definer set search_path='' as $$
declare how text; begin
 select cp.assignee_close into how from public.bookings b join booking_private.category_paths cp on cp.category=b.category where b.id=p_booking_id;
 if how='release' then perform booking_private.release(p_booking_id);
 elsif how='end_assignments' then perform booking_private.end_assignments(p_booking_id);
 else raise exception using errcode='P0002',message='not_found'; end if;
end $$;

-- §11.1 a resource is busy while it has unresolved work in any category for any provider.
create function booking_private.resource_busy(p_resource_id uuid,p_exclude_booking uuid default null) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.booking_assignments a join public.bookings b on b.id=a.booking_id
   join public.resource_reservations rr on rr.assignment_id=a.id
   where a.resource_id=p_resource_id and a.status='active' and b.id is distinct from p_exclude_booking
   and b.state in ('confirmed','in_progress') and clock_timestamp()>=upper(rr.occupied_period))
 or exists(select 1 from public.booking_exceptions e join booking_private.exception_kinds k on k.code=e.kind
   where e.status='open' and k.blocks_resources
   and exists(select 1 from public.booking_assignments a where a.booking_id=e.booking_id and a.resource_id=p_resource_id));
$$;
create function booking_private.booking_overdue(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.bookings b where b.id=p_booking_id and b.state in ('confirmed','in_progress')
  and clock_timestamp()>=coalesce((select max(upper(rr.occupied_period)) from public.resource_reservations rr
   join public.booking_assignments a on a.id=rr.assignment_id where a.booking_id=b.id),b.end_at));
$$;
-- §6.4 step 5: open exception, end_at + 12 h, or in-progress work nobody can close out.
create function booking_private.escalatable(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.bookings b where b.id=p_booking_id and b.state in ('confirmed','in_progress')
  and (exists(select 1 from public.booking_exceptions e where e.booking_id=b.id and e.status='open')
   or clock_timestamp()>=b.end_at+interval '12 hours'
   or (b.state='in_progress' and not booking_private.closeout_possible(b.id))));
$$;

-- §11.2 the guard is the authority for every acceptance path in every category.
create function booking_private.reservation_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_reservation'; end if;
 if TG_OP='UPDATE' then
  if old.status<>'active' or new.status<>'released' or (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
   raise exception using errcode='55000',message='immutable_reservation'; end if;
  return new;
 end if;
 if new.status is distinct from 'active' then raise exception using errcode='55000',message='invalid_reservation'; end if;
 perform 1 from public.resources where id=new.resource_id for update;
 if booking_private.resource_busy(new.resource_id,(select booking_id from public.booking_assignments where id=new.assignment_id)) then
  raise exception using errcode='55000',message='resource_busy'; end if;
 return new;
end $$;
create trigger p5s_reservation_guard before insert or update or delete on public.resource_reservations for each row execute function booking_private.reservation_guard();
create trigger p5s_reservation_no_truncate before truncate on public.resource_reservations for each statement execute function booking_private.immutable();

-- §11.3 past kept reservations no longer block edits. Latest bodies are 0005.
create or replace function public.upsert_booking_resource(p_provider_id uuid,p_kind text,p_person_profile_id uuid default null,p_vehicle_key text default null,p_expected_version integer default 0,p_resource_id uuid default null,p_status text default 'active')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.providers; r public.resources; result uuid; begin
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(p_provider_id);
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into p from public.providers where id=p_provider_id;
 if p_kind is null or p_kind not in ('person','vehicle') or p_status is null or p_status not in ('active','disabled')
 or p_expected_version is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if p_kind='person' and (p_person_profile_id is null or p_vehicle_key is not null or not exists(select 1 from public.profiles x where x.id=p_person_profile_id and x.status='active')
 or not (p.individual_owner_profile_id is not distinct from p_person_profile_id or exists(select 1 from public.organization_members m
 where m.organization_id=p.organization_id and m.profile_id=p_person_profile_id and m.status='active' and m.accepted_at is not null and 'provider:read'=any(m.scopes))))
 then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version=0 and p_resource_id is null then
  if p_kind='person' then
   -- Reuse a person's canonical global identity across organizations/categories.
   select id into result from public.resources where person_profile_id=p_person_profile_id;
   if result is not null then return result; end if;
  end if;
  insert into public.resources(kind,person_profile_id,vehicle_key,owner_organization_id,owner_profile_id,status)
  values(p_kind,p_person_profile_id,p_vehicle_key,case when p_kind='vehicle' then p.organization_id end,
   case when p_kind='vehicle' then p.individual_owner_profile_id end,p_status) returning id into result;
 else
  select * into r from public.resources where id=p_resource_id for update;
  if not found or not booking_private.resource_eligible(p_provider_id,r.id) or (r.kind='person' and r.person_profile_id<>actor)
  then raise exception using errcode='42501',message='forbidden'; end if;
  if r.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
  if r.kind is distinct from p_kind or r.person_profile_id is distinct from p_person_profile_id or r.vehicle_key is distinct from p_vehicle_key
  then raise exception using errcode='55000',message='immutable_resource'; end if;
  if p_status='disabled' and (exists(select 1 from public.resource_reservations where resource_id=r.id and status='active'
   and upper(occupied_period)>clock_timestamp()) or booking_private.resource_busy(r.id))
  then raise exception using errcode='40001',message='resource_in_use'; end if;
  update public.resources set status=p_status,version=version+1 where id=r.id returning id into result;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.resource_saved','resource',result);
 return result;
end $$;
create or replace function public.set_booking_availability(p_provider_id uuid,p_resource_id uuid,p_weekday integer,p_local_start time,p_local_end time,p_effective_from date,p_effective_to date,p_expected_version integer,p_rule_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); result uuid; begin
 if not booking_private.scheduler(p_provider_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(p_provider_id);
 perform 1 from public.resources where id=p_resource_id for update;
 if not booking_private.scheduler(p_provider_id) or not booking_private.resource_eligible(p_provider_id,p_resource_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version=0 and p_rule_id is null then
  insert into public.availability_rules(provider_id,resource_id,weekday,local_start,local_end,effective_from,effective_to)
   values(p_provider_id,p_resource_id,p_weekday,p_local_start,p_local_end,p_effective_from,p_effective_to) returning id into result;
 else
  perform 1 from public.availability_rules where id=p_rule_id and provider_id=p_provider_id and resource_id=p_resource_id for update;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  -- Do not rewrite availability under current or future reservations. Kept
  -- reservations whose upper bound has passed no longer freeze the rule.
  if exists(select 1 from public.resource_reservations where resource_id=p_resource_id and status='active'
   and upper(occupied_period)>clock_timestamp()) then raise exception using errcode='40001',message='resource_in_use'; end if;
  update public.availability_rules set weekday=p_weekday,local_start=p_local_start,local_end=p_local_end,effective_from=p_effective_from,effective_to=p_effective_to,version=version+1
   where id=p_rule_id and version=p_expected_version returning id into result;
  if not found then raise exception using errcode='40001',message='stale_version'; end if;
 end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.availability_saved','availability_rule',result);
 return result;
end $$;

-- §6.4 ops close. Replay precedes live authorization (§13.1).
create function public.ops_close_booking(p_booking_id uuid,p_expected_version integer,p_outcome text,p_reason text,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; hash text; prior record; result integer; e public.booking_exceptions;
 absence boolean; event uuid; begin
 if p_booking_id is null or p_expected_version is null or p_outcome is null or p_reason is null or p_request_key is null
 or p_outcome not in ('interrupted','no_show') then raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version,p_outcome,p_reason));
 select * into prior from booking_private.replay(actor,'p5.ops.close',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not booking_private.ops_actor(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 perform 1 from public.booking_exceptions where booking_id=b.id and status='open' order by id for update;
 perform 1 from public.admin_capabilities where profile_id=actor and capability='booking:incident' for share;
 select * into prior from booking_private.replay(actor,'p5.ops.close',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not booking_private.ops_actor(b.id) then raise exception using errcode='42501',message='forbidden'; end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.state not in ('confirmed','in_progress') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if not booking_private.escalatable(b.id) then raise exception using errcode='55000',message='not_escalatable'; end if;
 absence:=exists(select 1 from public.booking_exceptions where booking_id=b.id and kind='absence_reported' and status='open');
 if (p_outcome='no_show' and (b.state<>'confirmed' or not absence or p_reason<>'no_show_confirmed'))
 or (p_outcome='interrupted' and (p_reason not in ('ops_closeout','provider_did_not_attend','unsafe_conditions','absence_disputed')
  or (p_reason='absence_disputed' and not absence))) then
  raise exception using errcode='22023',message='invalid_reason'; end if;
 result:=booking_private.transition(b.id,p_outcome,p_reason,p_request_key);
 perform booking_private.end_assignments(b.id);
 for e in select * from public.booking_exceptions where booking_id=b.id and status='open' order by id loop
  update public.booking_exceptions set status='resolved',
   resolution=case when e.kind='absence_reported' then case when p_outcome='no_show' then 'no_show_confirmed' else 'absence_disputed' end else 'resolved' end,
   resolved_by_profile_id=actor,resolved_at=clock_timestamp(),version=version+1 where id=e.id;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.exception_resolved','booking_exception',e.id);
 end loop;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.ops_closed','booking',b.id);
 select id into event from public.booking_events where booking_id=b.id and aggregate_version=result;
 perform booking_private.record_request(actor,'p5.ops.close',p_request_key,hash,event,result);
 return result;
end $$;

-- Exceptions that need no booking change. absence_reported resolves only through ops_close_booking.
create function public.ops_resolve_exception(p_exception_id uuid,p_expected_version integer,p_resolution text,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); e public.booking_exceptions; hash text; prior record; result integer; prov uuid; begin
 if p_exception_id is null or p_expected_version is null or p_resolution is null or p_request_key is null then
  raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_exception_id,p_expected_version,p_resolution));
 select * into prior from booking_private.replay(actor,'p5.ops.resolve',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into e from public.booking_exceptions where id=p_exception_id;
 if not found or not booking_private.ops_actor(e.booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 -- Lock order (?11.4): booking, organisation then provider (serialises with membership
 -- changes, which take the organisation row first), resources of a blocking kind,
 -- the exception, then the capability row. Replay and ops_actor are rechecked after.
 select provider_id into prov from public.bookings where id=e.booking_id for update;
 perform booking_private.lock_provider(prov);
 if exists(select 1 from booking_private.exception_kinds k where k.code=e.kind and k.blocks_resources) then
  perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=e.booking_id) order by id for update;
 end if;
 select * into e from public.booking_exceptions where id=p_exception_id for update;
 perform 1 from public.admin_capabilities where profile_id=actor and capability='booking:incident' for share;
 select * into prior from booking_private.replay(actor,'p5.ops.resolve',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not booking_private.ops_actor(e.booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if e.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if e.status<>'open' or e.kind='absence_reported' or not exists(select 1 from booking_private.exception_kinds k where k.code=e.kind and p_resolution=any(k.resolutions)) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 update public.booking_exceptions set status='resolved',resolution=p_resolution,resolved_by_profile_id=actor,resolved_at=clock_timestamp(),version=version+1
  where id=e.id returning version into result;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.exception_resolved','booking_exception',e.id);
 perform booking_private.record_request(actor,'p5.ops.resolve',p_request_key,hash,e.id,result);
 return result;
end $$;

-- Ops queue: ids, times, states and exception metadata only. Writes no audit row.
create function public.list_booking_exceptions(p_limit integer default 20,p_after_booking uuid default null) returns setof jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid_input'; end if;
 return query select jsonb_build_object('booking_id',b.id,'public_ref',b.public_ref,
  'provider_reference',(select p.public_reference from public.providers p where p.id=b.provider_id),
  'category',b.category,'start_at',b.start_at,'end_at',b.end_at,'state',b.state,'version',b.version,
  'last_reason',(select ev.reason from public.booking_events ev where ev.booking_id=b.id order by ev.aggregate_version desc limit 1),
  'overdue',booking_private.booking_overdue(b.id),'escalatable',booking_private.escalatable(b.id),
  'exceptions',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'reason',e.reason,'opened_at',e.opened_at,'version',e.version) order by e.opened_at,e.id)
   from public.booking_exceptions e where e.booking_id=b.id and e.status='open'),'[]'::jsonb))
 from public.bookings b
 where (p_after_booking is null or b.id>p_after_booking)
 and (b.state in ('confirmed','in_progress') or exists(select 1 from public.booking_exceptions e where e.booking_id=b.id and e.status='open'))
 and booking_private.ops_actor(b.id)
 and (exists(select 1 from public.booking_exceptions e where e.booking_id=b.id and e.status='open')
  or booking_private.booking_overdue(b.id) or booking_private.escalatable(b.id))
 order by b.id limit p_limit;
end $$;

alter table booking_private.exception_kinds enable row level security;
revoke all on booking_private.exception_kinds from public,anon,authenticated,service_role;
alter table public.booking_exceptions enable row level security;
revoke all on public.booking_exceptions from public,anon,authenticated,service_role;
revoke all on function booking_private.guard_exception(),booking_private.open_exception(uuid,text,text),booking_private.end_assignments(uuid),
 booking_private.finish_assignments(uuid),booking_private.resource_busy(uuid,uuid),booking_private.booking_overdue(uuid),
 booking_private.escalatable(uuid),booking_private.reservation_guard()
 from public,anon,authenticated,service_role;
do $$ declare f text; begin
 foreach f in array array['public.upsert_booking_resource(uuid,text,uuid,text,integer,uuid,text)',
  'public.set_booking_availability(uuid,uuid,integer,time,time,date,date,integer,uuid)',
  'public.ops_close_booking(uuid,integer,text,text,uuid)','public.ops_resolve_exception(uuid,integer,text,uuid)',
  'public.list_booking_exceptions(integer,uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
commit;
