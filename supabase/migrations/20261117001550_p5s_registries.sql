-- P5 shared engine 1/5 / Kiro / feat/P5-shared-engine / base integ/all f549ad3.
-- Contract: docs/specs/P5_shared_engine_contract.md §3 (registries), §9 (event reasons),
-- §10.2 (database gates), §13 (keyed replay). Synthetic local/staging only.
-- All registry rows are written by migrations or a recorded owner SQL step (OD-6);
-- no API role holds any privilege on them.
begin;

-- Registry rows are append-only: codes are never renamed or deleted.
create function booking_private.registry_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='immutable_registry'; end $$;

-- §10.2 feature gates. Seeded off for every category (OD-5). OD-6: no RPC changes a gate.
create table booking_private.feature_gates (
 key text primary key check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
 state text not null default 'off' check (state in ('off','on','suspended')),
 version integer not null default 1 check (version>0),
 changed_at timestamptz not null default clock_timestamp()
);
create table booking_private.feature_gate_events (
 id uuid primary key default gen_random_uuid(),
 key text not null, from_state text, to_state text not null,
 version integer not null,
 changed_at timestamptz not null default clock_timestamp(),
 db_role text not null default current_user
);
-- Invoker trigger functions: current_user in the event default is the role that changed the gate.
create function booking_private.feature_gate_version() returns trigger language plpgsql set search_path='' as $$
begin
 if new.key is distinct from old.key then raise exception using errcode='55000',message='immutable_registry'; end if;
 new.version:=old.version+1; new.changed_at:=clock_timestamp();
 return new;
end $$;
create function booking_private.feature_gate_event() returns trigger language plpgsql set search_path='' as $$
begin
 insert into booking_private.feature_gate_events(key,from_state,to_state,version)
 values(new.key,case when TG_OP='UPDATE' then old.state end,new.state,new.version);
 return null;
end $$;
create trigger p5s_gate_version before update on booking_private.feature_gates for each row execute function booking_private.feature_gate_version();
create trigger p5s_gate_event after insert or update on booking_private.feature_gates for each row execute function booking_private.feature_gate_event();
create trigger p5s_gate_no_delete before delete on booking_private.feature_gates for each row execute function booking_private.registry_immutable();
create trigger p5s_gate_no_truncate before truncate on booking_private.feature_gates for each statement execute function booking_private.registry_immutable();
create trigger p5s_gate_events_immutable before update or delete on booking_private.feature_gate_events for each row execute function booking_private.immutable();
create trigger p5s_gate_events_no_truncate before truncate on booking_private.feature_gate_events for each statement execute function booking_private.immutable();
insert into booking_private.feature_gates(key) values ('doctor'),('lab'),('ambulance'),('caretaker');

-- §9 reason registry. Replaces the inline CHECK on booking_events.reason.
create table booking_private.reason_codes (
 code text primary key check (code ~ '^[a-z][a-z0-9_]{1,47}$')
);
create table booking_private.category_reasons (
 category text not null check (category in ('doctor','lab','ambulance','caretaker')),
 code text not null references booking_private.reason_codes(code),
 blocks_cancel boolean not null default false,
 primary key (category,code)
);
create trigger p5s_reason_codes_immutable before update or delete on booking_private.reason_codes for each row execute function booking_private.registry_immutable();
create trigger p5s_reason_codes_no_truncate before truncate on booking_private.reason_codes for each statement execute function booking_private.registry_immutable();
create trigger p5s_category_reasons_immutable before update or delete on booking_private.category_reasons for each row execute function booking_private.registry_immutable();
create trigger p5s_category_reasons_no_truncate before truncate on booking_private.category_reasons for each statement execute function booking_private.registry_immutable();

-- §9.3: the built 12, cross-category codes, ops codes.
insert into booking_private.reason_codes(code) values
 ('requested'),('accepted'),('confirmed'),('patient_request'),('provider_unavailable'),('unable_to_service'),('other'),
 ('en_route'),('arrived'),('service_started'),('service_completed'),('reassigned'),
 ('absence_reported'),('unsafe_conditions'),('ended_for_emergency'),
 ('no_show_confirmed'),('absence_disputed'),('ops_closeout'),('provider_did_not_attend');
-- §9.4 shared rows. reassigned stays a code with no category pair.
insert into booking_private.category_reasons(category,code,blocks_cancel)
 select c,r,false from unnest(array['doctor','lab','ambulance','caretaker']) c,
  unnest(array['requested','accepted','confirmed','patient_request','provider_unavailable','unable_to_service','other',
   'ops_closeout','provider_did_not_attend','unsafe_conditions']) r
 union all select c,r,false from unnest(array['doctor','lab','ambulance']) c,unnest(array['no_show_confirmed','absence_disputed']) r
 union all select c,r,true from unnest(array['doctor','ambulance']) c,unnest(array['en_route','arrived']) r
 union all select c,'service_started',true from unnest(array['doctor','caretaker']) c
 union all select c,'service_completed',false from unnest(array['doctor','caretaker']) c
 union all select c,'absence_reported',true from unnest(array['doctor','lab','ambulance']) c
 union all select c,'ended_for_emergency',false from unnest(array['doctor','ambulance','caretaker']) c;

do $$ declare con text; begin
 select c.conname into con from pg_constraint c where c.conrelid='public.booking_events'::regclass and c.contype='c'
  and pg_get_constraintdef(c.oid) like '%reason%';
 if con is null then raise exception 'booking_events reason check not found'; end if;
 execute format('alter table public.booking_events drop constraint %I',con);
end $$;
alter table public.booking_events add constraint booking_events_reason_fk foreign key (reason) references booking_private.reason_codes(code);

create function booking_private.event_reason_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from booking_private.category_reasons cr join public.bookings b on b.id=new.booking_id
  where cr.category=b.category and cr.code=new.reason) then
  raise exception using errcode='22023',message='invalid_reason'; end if;
 return new;
end $$;
create trigger p5s_event_reason before insert on public.booking_events for each row execute function booking_private.event_reason_guard();

-- §7.2 admission and assignee-close paths. Care flips generic_accept in its own block.
create table booking_private.category_paths (
 category text primary key check (category in ('doctor','lab','ambulance','caretaker')),
 generic_create boolean not null,
 generic_accept boolean not null,
 assignee_close text not null check (assignee_close in ('release','end_assignments'))
);
create trigger p5s_paths_no_delete before delete on booking_private.category_paths for each row execute function booking_private.registry_immutable();
create trigger p5s_paths_no_truncate before truncate on booking_private.category_paths for each statement execute function booking_private.registry_immutable();
insert into booking_private.category_paths values
 ('doctor',true,true,'end_assignments'),('caretaker',true,false,'release'),
 ('lab',false,false,'release'),('ambulance',false,false,'end_assignments');

-- §13 keyed replay. Nullable so built rows stay valid.
alter table public.idempotency_requests add column result_version integer check (result_version>0);

create function booking_private.request_hash(p_args jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_args::text,'UTF8')),'hex');
$$;
create function booking_private.replay(p_actor uuid,p_action text,p_request_key uuid,p_hash text,out result_id uuid,out result_version integer)
language plpgsql volatile security definer set search_path='' as $$
declare prior public.idempotency_requests; begin
 select * into prior from public.idempotency_requests where actor_profile_id=p_actor and action=p_action and request_key=p_request_key;
 if not found then return; end if;
 if prior.request_hash<>p_hash then raise exception using errcode='40001',message='idempotency_conflict'; end if;
 result_id:=prior.result_id; result_version:=prior.result_version;
end $$;
create function booking_private.record_request(p_actor uuid,p_action text,p_request_key uuid,p_hash text,p_result_id uuid,p_result_version integer)
returns void language sql volatile security definer set search_path='' as $$
 insert into public.idempotency_requests(actor_profile_id,action,request_key,request_hash,result_id,result_version)
 values(p_actor,p_action,p_request_key,p_hash,p_result_id,p_result_version);
$$;

-- §10.2 gate semantics. A missing key reads as off.
create function booking_private.gate_state(p_key text) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select state from booking_private.feature_gates where key=p_key),'off');
$$;
create function booking_private.require_gate(p_key text,p_phase text) returns void language plpgsql volatile security definer set search_path='' as $$
declare s text:=booking_private.gate_state(p_key); begin
 if p_phase='admission' then
  if s<>'on' then raise exception using errcode='55000',message='feature_unavailable'; end if;
 elsif p_phase='start' then
  if s='suspended' then raise exception using errcode='55000',message='feature_suspended'; end if;
 elsif p_phase is null or p_phase not in ('closeout','read','config') then
  raise exception using errcode='22023',message='invalid_input';
 end if;
end $$;

do $$ declare t text; begin
 foreach t in array array['feature_gates','feature_gate_events','reason_codes','category_reasons','category_paths'] loop
  execute format('alter table booking_private.%I enable row level security',t);
  execute format('revoke all on booking_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function booking_private.registry_immutable(),booking_private.feature_gate_version(),booking_private.feature_gate_event(),
 booking_private.event_reason_guard(),booking_private.request_hash(jsonb),booking_private.replay(uuid,text,uuid,text),
 booking_private.record_request(uuid,text,uuid,text,uuid,integer),booking_private.gate_state(text),booking_private.require_gate(text,text)
 from public,anon,authenticated,service_role;
commit;
