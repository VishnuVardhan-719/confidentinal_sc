-- P5 care 1/3 / Kiro / feat/P5-care / base integ/all 51c7439.
-- Contract docs/specs/P5_shared_engine_contract.md v1.0 (§1, §10, §13, §15 Caretaker) over
-- docs/specs/P5_care_flow_design.md §4.1 and §6.2. Requires the shared block 001550-001590.
-- A closed nonclinical task list per caretaker service, set by the provider (gate phase
-- config) and read publicly. No care_private.gate: the shared feature_gates row
-- 'caretaker' is the gate (contract §10.1, OD-5 seeds it off). Synthetic local/staging only.
begin;

-- Preflight: every shared object this file calls, by its exact signature.
do $$ declare obj text; begin
 foreach obj in array array['booking_private.require_gate(text,text)','booking_private.gate_state(text)',
  'booking_private.request_hash(jsonb)','booking_private.replay(uuid,text,uuid,text)',
  'booking_private.record_request(uuid,text,uuid,text,uuid,integer)','booking_private.immutable()',
  'catalog_private.lock_manager(uuid)','identity_private.require_actor()','identity_private.provider_publicly_bookable(uuid)'] loop
  if to_regprocedure(obj) is null then raise exception 'P5 care preflight: missing %',obj; end if;
 end loop;
 if to_regclass('booking_private.feature_gates') is null then raise exception 'P5 care preflight: missing booking_private.feature_gates'; end if;
 if not exists(select 1 from pg_attribute where attrelid='public.idempotency_requests'::regclass
  and attname='result_version' and not attisdropped) then raise exception 'P5 care preflight: missing replay result_version'; end if;
end $$;
do $$ begin
 if not exists(select 1 from booking_private.feature_gates where key='caretaker') then
  raise exception 'P5 care preflight: missing caretaker gate'; end if;
end $$;

create schema care_private authorization postgres;
revoke all on schema care_private from public,anon,authenticated,service_role;

-- Closed nonclinical list (design §4.1). Mirrored by CARE_TASKS in src/lib/validation/care.ts.
-- Adding a code is a migration plus an owner decision (Q-CARE-01).
create function care_private.valid_tasks(p text[]) returns boolean language sql immutable set search_path='' as $$
 select case when p is null or array_ndims(p) is distinct from 1 then false
  else cardinality(p) between 1 and 6 and array_position(p,null) is null
   and cardinality(p)=(select count(distinct x) from unnest(p) x)
   and p<@array['companionship','mobility_support','personal_care_support','meal_support','light_household','escort_walk']::text[] end;
$$;

create table public.care_service_tasks (
 service_id uuid primary key references public.services(id) on delete restrict,
 task_codes text[] not null check (care_private.valid_tasks(task_codes)),
 version integer not null default 1 check (version>0),
 updated_at timestamptz not null default clock_timestamp()
);
-- The version is the offer identity that care plans snapshot; it only moves forward.
create function care_private.guard_service_tasks() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' or new.service_id is distinct from old.service_id then
  raise exception using errcode='55000',message='immutable_care_scope'; end if;
 if new.version<>old.version+1 then raise exception using errcode='40001',message='stale_version'; end if;
 return new;
end $$;
create trigger p5c_service_tasks_guard before update or delete on public.care_service_tasks for each row execute function care_private.guard_service_tasks();
create trigger p5c_service_tasks_no_truncate before truncate on public.care_service_tasks for each statement execute function booking_private.immutable();

-- Provider configuration (contract §10.1 phase config; §13 keyed replay, action p5.care.set_tasks).
-- p_expected_version 0 creates the list. Lock order: provider (lock_manager), service, list.
create function public.set_care_service_tasks(p_service_id uuid,p_task_codes text[],p_expected_version integer,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); s public.services; price_unit text; hash text; prior record; result integer; begin
 if p_service_id is null or p_expected_version is null or p_expected_version<0 or p_request_key is null
 or not care_private.valid_tasks(p_task_codes) then raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_service_id,p_task_codes,p_expected_version));
 select * into prior from booking_private.replay(actor,'p5.care.set_tasks',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into s from public.services where id=p_service_id;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('caretaker','config');
 -- Owner or provider:manage; refuses suspended providers; locks organisation then provider.
 perform catalog_private.lock_manager(s.provider_id);
 select * into s from public.services where id=p_service_id for update;
 select * into prior from booking_private.replay(actor,'p5.care.set_tasks',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if s.category<>'caretaker' then raise exception using errcode='22023',message='invalid_input'; end if;
 select v.unit into price_unit from public.service_price_versions v where v.service_id=s.id
  and v.effective_from<=clock_timestamp() and (v.effective_to is null or v.effective_to>clock_timestamp());
 if price_unit is distinct from 'visit' or s.duration_minutes>720 then
  raise exception using errcode='22023',message='care_offer_unsupported'; end if;
 if p_expected_version=0 then
  insert into public.care_service_tasks(service_id,task_codes) values(s.id,p_task_codes)
   on conflict (service_id) do nothing returning version into result;
 else
  update public.care_service_tasks set task_codes=p_task_codes,version=version+1,updated_at=clock_timestamp()
   where service_id=s.id and version=p_expected_version returning version into result;
 end if;
 if result is null then raise exception using errcode='40001',message='stale_version'; end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'care.service_tasks_set','service',s.id);
 perform booking_private.record_request(actor,'p5.care.set_tasks',p_request_key,hash,s.id,result);
 return result;
end $$;

-- Public task read for a bookable caretaker service. bookable is the admission view:
-- gate on and an offer the request trigger accepts (contract §10.1 admission reads).
create function public.get_care_service_tasks(p_service_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s public.services; t public.care_service_tasks; price_unit text; begin
 select * into s from public.services where id=p_service_id and status='published' and category='caretaker';
 if not found or not identity_private.provider_publicly_bookable(s.provider_id) then
  raise exception using errcode='P0002',message='not_found'; end if;
 select * into t from public.care_service_tasks where service_id=s.id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 select v.unit into price_unit from public.service_price_versions v where v.service_id=s.id
  and v.effective_from<=clock_timestamp() and (v.effective_to is null or v.effective_to>clock_timestamp());
 return jsonb_build_object('service_id',s.id,'task_codes',to_jsonb(t.task_codes),'version',t.version,
  'bookable',booking_private.gate_state('caretaker')='on' and price_unit is not distinct from 'visit' and s.duration_minutes<=720);
end $$;

alter table public.care_service_tasks enable row level security;
revoke all on public.care_service_tasks from public,anon,authenticated,service_role;
revoke all on function care_private.valid_tasks(text[]),care_private.guard_service_tasks() from public,anon,authenticated,service_role;
revoke all on function public.set_care_service_tasks(uuid,text[],integer,uuid),public.get_care_service_tasks(uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_care_service_tasks(uuid,text[],integer,uuid) to authenticated;
grant execute on function public.get_care_service_tasks(uuid) to anon,authenticated;
commit;
