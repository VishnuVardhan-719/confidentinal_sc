-- P5 lab 2/3 / Kiro / feat/P5-lab / base integ/all 51c7439.
-- Contract v1.0 S6.1 (substate is the assignee's last milestone, bookings.state is the
-- lifecycle authority), S7.1 (lab admission through its own command) over design S5.4.
-- Requires 20261117001700. Synthetic local/staging only.
-- Not built from the design: lab_order_required (D3) and lab_cancel_guard (D4). Contract
-- S7.1 refuses generic lab creates with use_category_command, and S9.4 blocks_cancel
-- (collection_started, absence_reported) plus cancel_booking's state rule cover D4.
begin;

do $$ begin
 if to_regprocedure('lab_private.assert_shared()') is null or to_regclass('public.lab_policy_versions') is null then
  raise exception using errcode='55000',message='lab_catalog_required'; end if;
 perform lab_private.assert_shared();
 -- E28: lab bookings made before the lab block have no order row; clear them with a synthetic reset first.
 if exists(select 1 from public.bookings where category='lab') then
  raise exception using errcode='55000',message='lab_bookings_exist'; end if;
end $$;

-- One order per lab booking; the policy buffers are snapshotted at create (D9).
-- absence_reported_by from the design is not created: OD-1 makes no-show ops-only, and the
-- shared absence exception records who opened it.
create table public.lab_orders (
 booking_id uuid primary key references public.bookings(id),
 policy_version_id uuid not null references public.lab_policy_versions(id),
 before_buffer_minutes integer not null check (before_buffer_minutes between 0 and 60),
 after_buffer_minutes integer not null check (after_buffer_minutes between 0 and 120),
 preparation_ack_at timestamptz,
 substate text not null default 'pending' check (substate in ('pending','scheduled','absence_reported',
  'collecting','collected','handed_over','collection_failed','handoff_failed')),
 assignment_id uuid,
 failure_code text check (failure_code in ('patient_declined','preparation_not_followed','sample_not_obtained',
  'technician_unable','sample_damaged','sample_lost','lab_not_receiving')),
 followup_closed_at timestamptz,
 followup_closed_by uuid references public.profiles(id),
 followup_code text check (followup_code in ('patient_contacted','new_booking_offered','escalated_to_platform')),
 version integer not null default 1 check (version>0),
 created_at timestamptz not null default now(),
 foreign key (assignment_id,booking_id) references public.booking_assignments(id,booking_id),
 check ((substate='pending')=(assignment_id is null)),
 check ((substate='collection_failed' and failure_code in ('patient_declined','preparation_not_followed','sample_not_obtained','technician_unable'))
  or (substate='handoff_failed' and failure_code in ('sample_damaged','sample_lost','technician_unable','lab_not_receiving'))
  or (substate not in ('collection_failed','handoff_failed') and failure_code is null)),
 check (num_nulls(followup_closed_at,followup_closed_by,followup_code) in (0,3)),
 check (followup_code is null or substate in ('absence_reported','collection_failed','handoff_failed'))
);

-- D1 single item per booking: a snapshot of the booking's price and the lab test.
create table public.lab_order_items (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.lab_orders(booking_id),
 service_id uuid not null references public.services(id),
 price_version_id uuid not null references public.service_price_versions(id),
 title_snapshot text not null check (char_length(btrim(title_snapshot)) between 1 and 160),
 quantity smallint not null default 1 check (quantity=1),
 unit_paise bigint not null check (unit_paise between 0 and 10000000000),
 line_paise bigint not null,
 sample_type text not null check (sample_type in ('venous_blood','capillary_blood','urine','stool','swab')),
 container_codes text[] not null check (cardinality(container_codes) between 1 and 6 and array_position(container_codes,null) is null
  and container_codes <@ array['edta','serum','fluoride','citrate','heparin','urine_cup','stool_cup','swab_tube']::text[]
  and lab_private.codes_unique(container_codes)),
 fasting_hours smallint not null check (fasting_hours between 0 and 16),
 preparation_code text not null check (preparation_code in ('none','fasting','first_morning_sample')),
 check (line_paise=unit_paise*quantity),
 check ((fasting_hours>0)=(preparation_code='fasting'))
);

-- Insert: a pending order for a requested lab booking. Update: only the lab substate machine,
-- the one assignment set at acceptance, the failure code and a one-time follow-up close.
-- No rule here depends on the booking state, so an ops close never conflicts (S6.1).
create function lab_private.guard_order() returns trigger language plpgsql security definer set search_path='' as $$
declare fixed text[]:=array['substate','assignment_id','failure_code','followup_closed_at','followup_closed_by','followup_code','version']; begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_lab_order'; end if;
 if TG_OP='INSERT' then
  if new.substate<>'pending' or new.version<>1 or new.assignment_id is not null or new.failure_code is not null
  or new.followup_closed_at is not null
  or not exists(select 1 from public.bookings b where b.id=new.booking_id and b.category='lab' and b.state='requested') then
   raise exception using errcode='55000',message='invalid_snapshot'; end if;
  return new;
 end if;
 if new.version<>old.version+1 then raise exception using errcode='40001',message='stale_version'; end if;
 if (to_jsonb(new)-fixed) is distinct from (to_jsonb(old)-fixed) then
  raise exception using errcode='55000',message='immutable_lab_order'; end if;
 if new.substate is distinct from old.substate and (old.substate,new.substate) not in
  (('pending','scheduled'),('scheduled','collecting'),('scheduled','absence_reported'),('collecting','collected'),
   ('collecting','collection_failed'),('collected','handed_over'),('collected','handoff_failed')) then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if new.assignment_id is distinct from old.assignment_id and not (old.assignment_id is null and new.substate='scheduled') then
  raise exception using errcode='55000',message='immutable_lab_order'; end if;
 if old.failure_code is not null and new.failure_code is distinct from old.failure_code then
  raise exception using errcode='55000',message='immutable_lab_order'; end if;
 if old.followup_closed_at is not null and (new.followup_closed_at,new.followup_closed_by,new.followup_code)
  is distinct from (old.followup_closed_at,old.followup_closed_by,old.followup_code) then
  raise exception using errcode='55000',message='immutable_lab_order'; end if;
 return new;
end $$;
create trigger lab_order_guard before insert or update or delete on public.lab_orders for each row execute function lab_private.guard_order();
create trigger lab_order_no_truncate before truncate on public.lab_orders for each statement execute function lab_private.immutable();

-- The item must copy the booking's server-derived snapshot; it never changes afterwards.
create function lab_private.guard_item() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP<>'INSERT' then raise exception using errcode='55000',message='immutable_snapshot'; end if;
 if not exists(select 1 from public.bookings b where b.id=new.booking_id and b.service_id=new.service_id
  and b.price_version_id=new.price_version_id and b.amount_paise=new.unit_paise) then
  raise exception using errcode='55000',message='invalid_snapshot'; end if;
 return new;
end $$;
create trigger lab_item_guard before insert or update or delete on public.lab_order_items for each row execute function lab_private.guard_item();
create trigger lab_item_no_truncate before truncate on public.lab_order_items for each statement execute function lab_private.immutable();

-- No API role reads or writes these tables; every read is a definer projection (001720).
-- Neither table joins the supabase_realtime publication.
do $$ declare t text; begin
 foreach t in array array['lab_orders','lab_order_items'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function lab_private.guard_order(),lab_private.guard_item() from public,anon,authenticated,service_role;
commit;
