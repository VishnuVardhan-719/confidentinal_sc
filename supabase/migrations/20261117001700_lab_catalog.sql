-- P5 lab 1/3 / Kiro / feat/P5-lab / base integ/all 51c7439.
-- Contract docs/specs/P5_shared_engine_contract.md v1.0 (S1, S2.4, S9.4, S15 lab) over
-- docs/specs/P5_lab_flow_design.md S5.3: lab test definitions, lab policy, lab reason codes.
-- Requires the shared engine 20261117001550-001590. Synthetic local/staging only.
-- No seed: lab_policy_versions rows come from synthetic fixtures (LAB-Q04).
begin;

-- Preflight first. lab_private holds the lab helpers and has no grant to any API role.
create schema lab_private;
revoke all on schema lab_private from public,anon,authenticated,service_role;

-- Every shared object the lab block calls, by its exact shared signature. Each lab
-- migration runs this before anything else; suite 040 removes objects to prove it raises.
create function lab_private.assert_shared() returns void language plpgsql volatile security definer set search_path='' as $$
declare f text; t text; begin
 foreach f in array array[
  'booking_private.require_gate(text,text)','booking_private.gate_state(text)','booking_private.request_hash(jsonb)',
  'booking_private.replay(uuid,text,uuid,text)','booking_private.record_request(uuid,text,uuid,text,uuid,integer)',
  'booking_private.create_request_core(uuid,uuid,uuid,timestamptz,uuid,text,text,interval,interval)',
  'booking_private.transition(uuid,text,text,uuid)','booking_private.assignee_finish(uuid,text,text,uuid)',
  'booking_private.finish_assignments(uuid)','booking_private.open_exception(uuid,text,text)',
  'booking_private.closeout_assignee(uuid)','booking_private.resource_busy(uuid,uuid)','booking_private.booking_overdue(uuid)',
  'booking_private.person_purpose(text)','booking_private.resource_eligible(uuid,uuid)','booking_private.in_schedule(uuid,uuid,tstzrange)',
  'booking_private.lock_provider(uuid)','booking_private.scheduler(uuid)','booking_private.patient(uuid,text)',
  'booking_private.patient_for_requester(uuid,uuid)','booking_private.policy_immutable()',
  'identity_private.is_assigned(uuid,text)','identity_private.require_actor()','identity_private.active_account()',
  'identity_private.provider_publicly_bookable(uuid)','public.provider_is_publishable(uuid)','catalog_private.lock_manager(uuid)'] loop
  if to_regprocedure(f) is null then raise exception using errcode='55000',message='p5_shared_engine_required',detail=f; end if;
 end loop;
 foreach t in array array['booking_private.feature_gates','booking_private.reason_codes','booking_private.category_reasons',
  'booking_private.category_paths','booking_private.exception_kinds','public.booking_exceptions','public.idempotency_requests',
  'public.booking_transitions'] loop
  if to_regclass(t) is null then raise exception using errcode='55000',message='p5_shared_engine_required',detail=t; end if;
 end loop;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='idempotency_requests' and column_name='result_version')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='booking_transitions' and column_name='category') then
  raise exception using errcode='55000',message='p5_shared_engine_required',detail='result_version or transition category';
 end if;
 -- Rows the lab block relies on: its gate, its paths and the ops-only no-show edge (OD-1).
 if not exists(select 1 from booking_private.feature_gates where key='lab')
 or not exists(select 1 from booking_private.category_paths where category='lab' and not generic_create and not generic_accept and assignee_close='release')
 or not exists(select 1 from booking_private.exception_kinds where code='absence_reported')
 or not exists(select 1 from booking_private.category_reasons where category='lab' and code='absence_reported' and blocks_cancel) then
  raise exception using errcode='55000',message='p5_shared_engine_required',detail='lab registry rows';
 end if;
end $$;
select lab_private.assert_shared();

create function lab_private.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='immutable_lab_row'; end $$;
-- Used by CHECK constraints: an array without repeated codes.
create function lab_private.codes_unique(p_codes text[]) returns boolean language sql immutable set search_path='' as $$
 select cardinality(p_codes)=(select count(distinct x) from unnest(p_codes) x);
$$;

-- S5.3 one row per lab service. Written only through public.set_lab_test (001720).
create table public.lab_tests (
 service_id uuid primary key references public.services(id) on delete restrict,
 provider_id uuid not null references public.providers(id),
 sample_type text not null check (sample_type in ('venous_blood','capillary_blood','urine','stool','swab')),
 container_codes text[] not null check (cardinality(container_codes) between 1 and 6 and array_position(container_codes,null) is null
  and container_codes <@ array['edta','serum','fluoride','citrate','heparin','urine_cup','stool_cup','swab_tube']::text[]
  and lab_private.codes_unique(container_codes)),
 fasting_hours smallint not null default 0 check (fasting_hours between 0 and 16),
 preparation_code text not null default 'none' check (preparation_code in ('none','fasting','first_morning_sample')),
 version integer not null default 1 check (version>0),
 updated_at timestamptz not null default now(),
 check ((fasting_hours>0)=(preparation_code='fasting'))
);
create index lab_tests_provider on public.lab_tests(provider_id);

create function lab_private.guard_test() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_lab_row'; end if;
 if not exists(select 1 from public.services s where s.id=new.service_id and s.category='lab' and s.provider_id=new.provider_id) then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if TG_OP='INSERT' then
  if new.version<>1 then raise exception using errcode='40001',message='stale_version'; end if;
 elsif new.service_id is distinct from old.service_id or new.provider_id is distinct from old.provider_id then
  raise exception using errcode='55000',message='immutable_lab_row';
 elsif new.version<>old.version+1 then
  raise exception using errcode='40001',message='stale_version';
 end if;
 return new;
end $$;
create trigger lab_test_guard before insert or update or delete on public.lab_tests for each row execute function lab_private.guard_test();
create trigger lab_test_no_truncate before truncate on public.lab_tests for each statement execute function lab_private.immutable();

-- D9 lab lead time, horizon and asymmetric buffers. before <= 60 keeps the reservation's
-- lower bound inside the shared is_assigned window (start_at - 60 min).
create table public.lab_policy_versions (
 id uuid primary key default gen_random_uuid(),
 version integer not null unique check (version>0),
 lead_minutes integer not null check (lead_minutes between 0 and 1440),
 horizon_days integer not null check (horizon_days between 1 and 90),
 before_buffer_minutes integer not null check (before_buffer_minutes between 0 and 60),
 after_buffer_minutes integer not null check (after_buffer_minutes between 0 and 120),
 status text not null default 'draft' check (status in ('draft','published','disabled')),
 created_at timestamptz not null default now()
);
create trigger lab_policy_immutable before update or delete on public.lab_policy_versions for each row execute function booking_private.policy_immutable();
create trigger lab_policy_no_truncate before truncate on public.lab_policy_versions for each statement execute function lab_private.immutable();

-- S9.4 lab-owned codes; absence_reported, no_show_confirmed, absence_disputed and the
-- generic codes are seeded by the shared block. collection_started blocks cancellation.
insert into booking_private.reason_codes(code) values
 ('collection_started'),('sample_collected'),('sample_handed_over'),('collection_failed'),('handoff_failed')
 on conflict do nothing;
insert into booking_private.category_reasons(category,code,blocks_cancel) values
 ('lab','collection_started',true),('lab','sample_collected',false),('lab','sample_handed_over',false),
 ('lab','collection_failed',false),('lab','handoff_failed',false)
 on conflict do nothing;

do $$ declare t text; begin
 foreach t in array array['lab_tests','lab_policy_versions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function lab_private.assert_shared(),lab_private.immutable(),lab_private.codes_unique(text[]),lab_private.guard_test()
 from public,anon,authenticated,service_role;
commit;
