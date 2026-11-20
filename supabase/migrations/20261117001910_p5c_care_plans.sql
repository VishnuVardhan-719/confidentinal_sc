-- P5 care 2/3 / Kiro / feat/P5-care / base integ/all 51c7439.
-- Contract v1.0 §6.1 (substate is the assignee's last milestone, bookings.state is the
-- lifecycle authority), §7.1 (care's AFTER INSERT trigger snapshots the plan), §10.1
-- (admission gate in the request trigger), §15 Caretaker; design §4.2 and §5.2.
-- Requires 20261117001900 and the shared block. Synthetic local/staging only.
begin;

do $$ declare obj text; begin
 foreach obj in array array['care_private.valid_tasks(text[])','booking_private.require_gate(text,text)','booking_private.immutable()'] loop
  if to_regprocedure(obj) is null then raise exception 'P5 care preflight: missing %',obj; end if;
 end loop;
 foreach obj in array array['public.care_service_tasks','public.booking_assignments','public.bookings'] loop
  if to_regclass(obj) is null then raise exception 'P5 care preflight: missing %',obj; end if;
 end loop;
end $$;

-- One row per scoped caretaker booking. No address, contact, name, health or free text.
create table public.care_plans (
 booking_id uuid primary key references public.bookings(id),
 task_codes text[] not null check (care_private.valid_tasks(task_codes)),
 service_tasks_version integer not null check (service_tasks_version>0),
 assignment_id uuid,
 substate text not null default 'pending' check (substate in ('pending','assigned','started','ended')),
 started_at timestamptz,
 ended_at timestamptz,
 end_outcome text check (end_outcome in ('completed','interrupted')),
 interruption_reason text check (interruption_reason in ('patient_request_end','caregiver_unwell','unsafe_environment','ended_for_emergency','other')),
 attestation text check (attestation in ('confirmed','disputed')),
 attested_at timestamptz,
 version integer not null default 1 check (version>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key (assignment_id,booking_id) references public.booking_assignments(id,booking_id),
 check ((substate='pending')=(assignment_id is null)),
 check ((substate in ('started','ended'))=(started_at is not null)),
 check ((substate='ended')=(ended_at is not null)),
 check ((ended_at is not null)=(end_outcome is not null)),
 check ((interruption_reason is not null)=(end_outcome is not distinct from 'interrupted')),
 check (ended_at is null or ended_at>=started_at),
 check ((attestation is null)=(attested_at is null)),
 check (attestation is null or substate='ended')
);

-- Forward-only shape for API roles and service_role; the table owner can disable it.
create function care_private.guard_plan() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_care_plan'; end if;
 if new.booking_id is distinct from old.booking_id or new.task_codes is distinct from old.task_codes
 or new.service_tasks_version is distinct from old.service_tasks_version or new.created_at is distinct from old.created_at
 or (old.assignment_id is not null and new.assignment_id is distinct from old.assignment_id)
 or (old.started_at is not null and new.started_at is distinct from old.started_at)
 or (old.ended_at is not null and new.ended_at is distinct from old.ended_at)
 or (old.end_outcome is not null and new.end_outcome is distinct from old.end_outcome)
 or (old.interruption_reason is not null and new.interruption_reason is distinct from old.interruption_reason) then
  raise exception using errcode='55000',message='immutable_snapshot'; end if;
 if (new.substate is distinct from old.substate and (old.substate,new.substate) not in
  (('pending','assigned'),('assigned','started'),('started','ended')))
 or (old.attestation is not null and (new.attestation is distinct from old.attestation or new.attested_at is distinct from old.attested_at)) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if new.version<>old.version+1 then raise exception using errcode='40001',message='stale_version'; end if;
 return new;
end $$;
create trigger p5c_care_plan_guard before update or delete on public.care_plans for each row execute function care_private.guard_plan();
create trigger p5c_care_plan_no_truncate before truncate on public.care_plans for each statement execute function booking_private.immutable();

-- Every insert path into bookings for caretaker passes here. The admission gate and the
-- offer shape are enforced for every caretaker booking; the plan is snapshotted from the
-- service's task list. A service without a task list gets no plan, and acceptance
-- refuses such a booking with care_plan_missing (see 001920 and the handoff).
create function care_private.snapshot_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.care_service_tasks; price_unit text; begin
 perform booking_private.require_gate('caretaker','admission');
 select v.unit into price_unit from public.service_price_versions v where v.id=new.price_version_id;
 if price_unit is distinct from 'visit' then raise exception using errcode='55000',message='care_unit_unsupported'; end if;
 if new.end_at-new.start_at>interval '720 minutes' then raise exception using errcode='55000',message='care_duration_unsupported'; end if;
 select * into t from public.care_service_tasks where service_id=new.service_id for share;
 if not found then return null; end if;
 insert into public.care_plans(booking_id,task_codes,service_tasks_version) values(new.id,t.task_codes,t.version);
 if auth.uid() is not null then
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(auth.uid(),'care.plan_snapshotted','booking',new.id);
 end if;
 return null;
end $$;
create trigger p5c_care_plan_on_request after insert on public.bookings for each row
 when (new.category='caretaker') execute function care_private.snapshot_plan();

alter table public.care_plans enable row level security;
revoke all on public.care_plans from public,anon,authenticated,service_role;
revoke all on function care_private.guard_plan(),care_private.snapshot_plan() from public,anon,authenticated,service_role;
commit;
