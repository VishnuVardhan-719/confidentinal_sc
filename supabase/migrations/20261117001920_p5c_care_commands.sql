-- P5 care 3/3 / Kiro / feat/P5-care / base integ/all 51c7439.
-- Contract v1.0 §5.2 (assignee_finish for ended and interrupt_care), §7.2 (accept triggers,
-- then generic_accept flips on), §8.3 (assignee projections gated by is_assigned or
-- closeout_assignee), §9.4 (ended_for_emergency), §10.1 (start/closeout/read phases),
-- §13 (keyed replay), §15 Caretaker; design §6.3-§6.4. Requires 001900, 001910 and the
-- shared block. Synthetic local/staging only.
begin;

do $$ declare obj text; begin
 foreach obj in array array['booking_private.require_gate(text,text)','booking_private.request_hash(jsonb)',
  'booking_private.replay(uuid,text,uuid,text)','booking_private.record_request(uuid,text,uuid,text,uuid,integer)',
  'booking_private.transition(uuid,text,text,uuid)','booking_private.assignee_finish(uuid,text,text,uuid)',
  'booking_private.closeout_assignee(uuid)','booking_private.lock_provider(uuid)','booking_private.patient(uuid,text)',
  'booking_private.scheduler(uuid)','identity_private.is_assigned(uuid,text)','identity_private.active_account()',
  'identity_private.require_actor()','providers_private.person_is_verified(uuid,uuid)','care_private.valid_tasks(text[])'] loop
  if to_regprocedure(obj) is null then raise exception 'P5 care preflight: missing %',obj; end if;
 end loop;
 foreach obj in array array['booking_private.category_paths','booking_private.category_reasons','booking_private.reason_codes',
  'public.care_plans','public.care_service_tasks'] loop
  if to_regclass(obj) is null then raise exception 'P5 care preflight: missing %',obj; end if;
 end loop;
end $$;

-- §9.4: every caretaker pair is seeded by the shared block; restated here, never updated.
insert into booking_private.reason_codes(code) values ('service_started'),('service_completed'),('patient_request'),
 ('provider_unavailable'),('unable_to_service'),('ended_for_emergency'),('other') on conflict do nothing;
insert into booking_private.category_reasons(category,code,blocks_cancel) values ('caretaker','service_started',true),
 ('caretaker','service_completed',false),('caretaker','patient_request',false),('caretaker','provider_unavailable',false),
 ('caretaker','unable_to_service',false),('caretaker','ended_for_emergency',false),('caretaker','other',false) on conflict do nothing;

-- Accept hooks (contract §7.2, design §6.3). They run inside the generic accept_booking
-- after its resource validation and reservation inserts.
create function care_private.accept_check(p_booking public.bookings) returns void language plpgsql security definer set search_path='' as $$
declare plan public.care_plans; t public.care_service_tasks; a public.booking_assignments; self uuid; begin
 perform booking_private.require_gate('caretaker','admission');
 select * into plan from public.care_plans where booking_id=p_booking.id for update;
 if not found then raise exception using errcode='55000',message='care_plan_missing'; end if;
 if plan.substate<>'pending' then raise exception using errcode='55000',message='invalid_transition'; end if;
 select * into t from public.care_service_tasks where service_id=p_booking.service_id for share;
 if not found or t.version<>plan.service_tasks_version then raise exception using errcode='40001',message='offer_changed'; end if;
 select self_profile_id into self from public.patients where id=p_booking.patient_id;
 for a in select * from public.booking_assignments where booking_id=p_booking.id and status='active' and purpose='caretaker' loop
  -- resource_eligible already requires Q06 (contract §8.2); repeated so accept stays safe on its own.
  if not providers_private.person_is_verified(p_booking.provider_id,a.assigned_profile_id) then
   raise exception using errcode='42501',message='forbidden'; end if;
  if a.assigned_profile_id=p_booking.requester_profile_id or a.assigned_profile_id is not distinct from self then
   raise exception using errcode='42501',message='self_assignment'; end if;
 end loop;
end $$;
create function care_private.after_accept(p_booking_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare assignment uuid; begin
 select id into assignment from public.booking_assignments where booking_id=p_booking_id and status='active' and purpose='caretaker';
 if assignment is not null then
  update public.care_plans set assignment_id=assignment,substate='assigned',version=version+1,updated_at=clock_timestamp()
   where booking_id=p_booking_id and substate='pending';
 end if;
end $$;
-- Category guard, named *_booking_guard so shared suites can switch it off (integ/all 3a88e5a).
-- Fires after b01_booking_guard (alphabetical), so the shared authority check has passed.
create function care_private.guard_care_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.state='requested' and new.state='accepted' then perform care_private.accept_check(old);
 elsif old.state='accepted' and new.state='confirmed' then perform care_private.after_accept(old.id);
 end if;
 return new;
end $$;
create trigger p5c_care_booking_guard before update on public.bookings for each row
 when (old.category='caretaker' and new.state is distinct from old.state) execute function care_private.guard_care_booking();
-- Replaces design SH-1: the generic accept now serves caretaker bookings.
update booking_private.category_paths set generic_accept=true where category='caretaker';

-- The assigned caregiver: the live predicate (window, membership, Q06, publishable provider),
-- or for closeout steps the shared closeout predicate (contract §5.2).
create function care_private.is_caregiver(p_booking_id uuid,p_closeout boolean) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(identity_private.is_assigned(p_booking_id,'caretaker'),false)
  or (coalesce(p_closeout,false) and coalesce(booking_private.closeout_assignee(p_booking_id),false));
$$;

-- started: confirmed -> in_progress (gate phase start). ended: in_progress -> completed
-- through assignee_finish (closeout; release per category_paths). Action p5.care.advance.
create function public.advance_care(p_booking_id uuid,p_step text,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; plan public.care_plans; hash text; prior record;
 closeout boolean; result integer; event uuid; begin
 if p_booking_id is null or p_step is null or p_step not in ('started','ended') or p_expected_version is null or p_request_key is null then
  raise exception using errcode='22023',message='invalid_input'; end if;
 closeout:=p_step='ended';
 hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_step,p_expected_version));
 select * into prior from booking_private.replay(actor,'p5.care.advance',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'caretaker' or not care_private.is_caregiver(b.id,closeout) then
  raise exception using errcode='42501',message='forbidden'; end if;
 if not closeout then perform booking_private.require_gate('caretaker','start'); end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into plan from public.care_plans where booking_id=b.id for update;
 select * into prior from booking_private.replay(actor,'p5.care.advance',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not care_private.is_caregiver(b.id,closeout) then raise exception using errcode='42501',message='forbidden'; end if;
 if not closeout then perform booking_private.require_gate('caretaker','start'); end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if plan.booking_id is null then raise exception using errcode='55000',message='care_plan_missing'; end if;
 if not closeout then
  if b.state<>'confirmed' or plan.substate<>'assigned' then raise exception using errcode='55000',message='invalid_transition'; end if;
  if clock_timestamp()<b.start_at-interval '30 minutes' then raise exception using errcode='55000',message='care_too_early'; end if;
  if clock_timestamp()>=b.end_at then raise exception using errcode='55000',message='care_window_closed'; end if;
  result:=booking_private.transition(b.id,'in_progress','service_started',p_request_key);
  update public.care_plans set substate='started',started_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where booking_id=b.id;
 else
  if b.state<>'in_progress' or plan.substate<>'started' then raise exception using errcode='55000',message='invalid_transition'; end if;
  result:=booking_private.assignee_finish(b.id,'completed','service_completed',p_request_key);
  update public.care_plans set substate='ended',ended_at=clock_timestamp(),end_outcome='completed',version=version+1,updated_at=clock_timestamp() where booking_id=b.id;
 end if;
 select id into event from public.booking_events where booking_id=b.id and aggregate_version=result;
 perform booking_private.record_request(actor,'p5.care.advance',p_request_key,hash,event,result);
 return result;
end $$;

-- in_progress -> interrupted through assignee_finish (closeout). The precise reason stays in
-- care_plans and the care.interrupted audit row; the event carries the paired code (§9.4).
create function public.interrupt_care(p_booking_id uuid,p_reason text,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; plan public.care_plans; hash text; prior record;
 code text; result integer; event uuid; begin
 if p_booking_id is null or p_expected_version is null or p_request_key is null then
  raise exception using errcode='22023',message='invalid_input'; end if;
 code:=case p_reason when 'patient_request_end' then 'patient_request' when 'caregiver_unwell' then 'provider_unavailable'
  when 'unsafe_environment' then 'unable_to_service' when 'ended_for_emergency' then 'ended_for_emergency' when 'other' then 'other' end;
 if code is null then raise exception using errcode='22023',message='invalid_reason'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_reason,p_expected_version));
 select * into prior from booking_private.replay(actor,'p5.care.interrupt',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'caretaker' or not care_private.is_caregiver(b.id,true) then
  raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into plan from public.care_plans where booking_id=b.id for update;
 select * into prior from booking_private.replay(actor,'p5.care.interrupt',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not care_private.is_caregiver(b.id,true) then raise exception using errcode='42501',message='forbidden'; end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if plan.booking_id is null then raise exception using errcode='55000',message='care_plan_missing'; end if;
 if b.state<>'in_progress' or plan.substate<>'started' then raise exception using errcode='55000',message='invalid_transition'; end if;
 result:=booking_private.assignee_finish(b.id,'interrupted',code,p_request_key);
 update public.care_plans set substate='ended',ended_at=clock_timestamp(),end_outcome='interrupted',interruption_reason=p_reason,
  version=version+1,updated_at=clock_timestamp() where booking_id=b.id;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'care.interrupted','booking',b.id);
 select id into event from public.booking_events where booking_id=b.id and aggregate_version=result;
 perform booking_private.record_request(actor,'p5.care.interrupt',p_request_key,hash,event,result);
 return result;
end $$;

-- Patient statement after the session (closeout phase). p_expected_version is the plan
-- version; returns the new plan version. Never touches bookings, events or payments.
create function public.attest_care(p_booking_id uuid,p_decision text,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; plan public.care_plans; hash text; prior record; result integer; begin
 if p_booking_id is null or p_decision is null or p_decision not in ('confirmed','disputed') or p_expected_version is null or p_request_key is null then
  raise exception using errcode='22023',message='invalid_input'; end if;
 hash:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_decision,p_expected_version));
 select * into prior from booking_private.replay(actor,'p5.care.attest',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'caretaker' or not booking_private.patient(b.patient_id,'booking:create') then
  raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id for share;
 select * into plan from public.care_plans where booking_id=b.id for update;
 select * into prior from booking_private.replay(actor,'p5.care.attest',p_request_key,hash);
 if prior.result_version is not null then return prior.result_version; end if;
 if not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 if plan.booking_id is null then raise exception using errcode='55000',message='care_plan_missing'; end if;
 if plan.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.state not in ('completed','interrupted') or plan.substate<>'ended' or plan.attestation is not null
 or clock_timestamp()>=plan.ended_at+interval '7 days' then raise exception using errcode='55000',message='invalid_transition'; end if;
 update public.care_plans set attestation=p_decision,attested_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
  where booking_id=b.id returning version into result;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'care.attested','booking',b.id);
 perform booking_private.record_request(actor,'p5.care.attest',p_request_key,hash,b.id,result);
 return result;
end $$;

-- Read phase. Patient and scheduler: full plan and the {reason, occurred_at} timeline
-- (contract §8.5). Caregiver (live or closeout, §8.3): milestones only. No address, contact,
-- patient id, caregiver identity, provider UUID or amount for anyone. Writes no audit row.
create function public.get_care_plan(p_booking_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; plan public.care_plans; result jsonb; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id and category='caretaker';
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 select * into plan from public.care_plans where booking_id=b.id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 result:=jsonb_build_object('booking_id',b.id,'booking_version',b.version,'state',b.state,'plan_version',plan.version,
  'task_codes',to_jsonb(plan.task_codes),'substate',plan.substate,'started_at',plan.started_at,'ended_at',plan.ended_at);
 if booking_private.patient(b.patient_id,'booking:read') or booking_private.scheduler(b.provider_id) then
  return result||jsonb_build_object('end_outcome',plan.end_outcome,'interruption_reason',plan.interruption_reason,
   'attestation',plan.attestation,'attested_at',plan.attested_at,
   'timeline',coalesce((select jsonb_agg(jsonb_build_object('reason',e.reason,'occurred_at',e.occurred_at) order by e.aggregate_version)
    from public.booking_events e where e.booking_id=b.id),'[]'::jsonb));
 end if;
 if identity_private.is_assigned(b.id,'caretaker') or booking_private.closeout_assignee(b.id) then return result; end if;
 raise exception using errcode='P0002',message='not_found';
end $$;

revoke all on function care_private.accept_check(public.bookings),care_private.after_accept(uuid),care_private.guard_care_booking(),
 care_private.is_caregiver(uuid,boolean)
 from public,anon,authenticated,service_role;
do $$ declare f text; begin
 foreach f in array array['public.advance_care(uuid,text,integer,uuid)','public.interrupt_care(uuid,text,integer,uuid)',
  'public.attest_care(uuid,text,integer,uuid)','public.get_care_plan(uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
