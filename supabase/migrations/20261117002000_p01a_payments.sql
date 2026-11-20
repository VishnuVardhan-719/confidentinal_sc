-- P01a / Codex / feat/P01a-sql / base integ/all 5f94c98.
-- Depends on the unmerged P5 shared block 001550..001590. No P01b objects.
-- All gates OFF, finance capabilities granted to nobody, no scheduler.
begin;
do $$ declare obj text; begin
 foreach obj in array array['booking_private.request_hash(jsonb)','booking_private.replay(uuid,text,uuid,text)',
 'booking_private.record_request(uuid,text,uuid,text,uuid,integer)','booking_private.person_purpose(text)',
 'booking_private.assignee_finish(uuid,text,text,uuid)','booking_private.finish_assignments(uuid)',
 'booking_private.end_assignments(uuid)','booking_private.closeout_assignee(uuid)',
 'booking_private.create_request_core(uuid,uuid,uuid,timestamp with time zone,uuid,text,text,interval,interval)'] loop
  if to_regprocedure(obj) is null then raise exception 'P01a shared preflight: missing %',obj; end if;
 end loop;
 foreach obj in array array['booking_private.feature_gates','booking_private.category_paths','public.booking_exceptions',
 'public.doctor_visits','public.booking_assignments'] loop
  if to_regclass(obj) is null then raise exception 'P01a shared preflight: missing %',obj; end if;
 end loop;
 if not exists(select 1 from pg_attribute where attrelid='public.idempotency_requests'::regclass
  and attname='result_version' and not attisdropped) then raise exception 'P01a shared preflight: missing replay version'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.admin_capabilities'::regclass
  and conname='admin_capabilities_capability_check' and pg_get_constraintdef(oid) like '%booking:incident%')
 then raise exception 'P01a shared preflight: missing booking:incident'; end if;
end $$;

create schema payments_private authorization postgres;
create schema payments_worker authorization postgres;
revoke all on schema payments_private,payments_worker from public,anon,authenticated,service_role;

-- Shared gate read/closeout semantics allow reads while OFF. P01 requires *all*
-- reads and writes unavailable while OFF, so retain its separately audited settings.
create table payments_private.settings (
 id boolean primary key default true check(id), pay_after_enabled boolean not null default false,
 paid_enabled boolean not null default false,
 report_window_hours integer not null default 72 check(report_window_hours between 1 and 720),
 patient_dispute_cap integer not null default 3 check(patient_dispute_cap between 1 and 10),
 stale_reported_hours integer not null default 48 check(stale_reported_hours between 1 and 720),
 stale_due_days integer not null default 7 check(stale_due_days between 1 and 365)
);
create table payments_private.settings_events (
 id uuid primary key default gen_random_uuid(),changed_by_role text not null default current_user,
 old_row jsonb not null,new_row jsonb not null,changed_at timestamptz not null default clock_timestamp()
);
insert into payments_private.settings default values;
-- A private keyset cursor makes each bounded manual pass fair across all bookings.
create table payments_private.worker_cursor (id boolean primary key default true check(id),after_booking_id uuid,after_collection_id uuid,
 phase text not null default 'bookings' check(phase in ('bookings','collections')));
insert into payments_private.worker_cursor default values;

alter table public.admin_capabilities drop constraint admin_capabilities_capability_check;
alter table public.admin_capabilities add constraint admin_capabilities_capability_check check(capability in
 ('provider:verify','provider:document_read','provider:suspend','coverage:verify','security:audit','membership:admin',
 'booking:incident','finance:reconcile','finance:override'));
-- Identify the original unnamed scope-list CHECK, preserving the separate NULL check.
do $$ declare c record; found_list boolean:=false; begin
 for c in select conname from pg_constraint where conrelid='public.organization_members'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%scopes%<@%' loop
  execute format('alter table public.organization_members drop constraint %I',c.conname); found_list:=true;
 end loop;
 if not found_list then raise exception 'P01a preflight: organization scope CHECK missing'; end if;
end $$;
alter table public.organization_members add constraint p01_members_scope_check check(scopes <@ array
 ['org:read','org:edit','members:read','provider:read','provider:manage','evidence:manage','schedule:manage','finance:read','finance:collect']::text[]);

create table public.payments (
 id uuid primary key default gen_random_uuid(),booking_id uuid not null unique references public.bookings(id) on delete restrict,
 amount_paise bigint not null check(amount_paise>=0),currency text not null default 'INR' check(currency='INR'),
 collection_path text not null default 'direct_pay_after' check(collection_path='direct_pay_after'),
 state text not null default 'not_initiated' check(state in ('not_initiated','due','partially_paid','paid','disputed','voided')),
 confirmed_paise bigint not null default 0 check(confirmed_paise between 0 and amount_paise),
 version integer not null default 1 check(version>0),report_deadline timestamptz check(isfinite(report_deadline)),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table public.payment_transitions (
 from_state text not null,to_state text not null,actor_kind text not null check(actor_kind in ('system','patient','finance','admin_override')),
 primary key(from_state,to_state,actor_kind)
);
insert into public.payment_transitions values
 ('not_initiated','due','system'),('not_initiated','voided','system'),('due','voided','system'),
 ('due','partially_paid','finance'),('due','paid','finance'),('partially_paid','paid','finance');
insert into public.payment_transitions select f,'disputed',k from unnest(array['due','partially_paid','paid']) f,
 unnest(array['patient','finance','system','admin_override']) k;
insert into public.payment_transitions select 'disputed',t,k from unnest(array['due','partially_paid','paid']) t,
 unnest(array['finance','admin_override']) k;

create table payments_private.collection_intakes (
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.payments(id) on delete restrict,
 assignment_id uuid not null references public.booking_assignments(id) on delete restrict,
 reported_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 amount_paise bigint not null check(amount_paise between 1 and 999999999999999),method text not null check(method in ('cash','upi_direct')),
 reference text,reason_code text not null default 'provider_unavailable' check(reason_code='provider_unavailable'),
 request_key uuid not null,reported_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending' check(status in ('pending','converted','dismissed')),
 reviewed_by_profile_id uuid references public.profiles(id) on delete restrict,reviewed_at timestamptz,
 review_reason_code text check(review_reason_code in ('amount_mismatch','not_received','duplicate','wrong_payee','correction','other')),
 unique(payment_id,reported_by_profile_id,request_key),
 check((method='cash' and reference is null) or (method='upi_direct' and reference is not null and reference ~ '^[0-9]{12}$')),
 check((status='pending' and reviewed_by_profile_id is null and reviewed_at is null and review_reason_code is null)
 or (status<>'pending' and reviewed_by_profile_id is not null and reviewed_at is not null and review_reason_code is not null)),
 check(reviewed_by_profile_id is distinct from reported_by_profile_id)
);
create unique index p01_one_pending_intake on payments_private.collection_intakes(payment_id,reported_by_profile_id) where status='pending';
create table public.payment_collections (
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.payments(id) on delete restrict,
 collector_profile_id uuid not null references public.profiles(id) on delete restrict,
 reported_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 amount_paise bigint not null check(amount_paise between 1 and 999999999999999),method text not null check(method in ('cash','upi_direct')),
 reference text,reference_norm text generated always as (reference) stored,
 status text not null default 'reported' check(status in ('reported','confirmed','disputed','voided','superseded')),
 request_key uuid not null,source_intake_id uuid unique references payments_private.collection_intakes(id) on delete restrict,
 superseded_by uuid references public.payment_collections(id) on delete restrict deferrable initially deferred,
 reason_code text check(reason_code in ('amount_mismatch','not_received','duplicate','wrong_payee','correction','other')),
 reported_at timestamptz not null default clock_timestamp(),reconciled_by uuid references public.profiles(id) on delete restrict,
 reconciled_at timestamptz,unique(payment_id,request_key),
 check((method='cash' and reference is null) or (method='upi_direct' and reference is not null and reference ~ '^[0-9]{12}$')),
 check(status='reported' or (reconciled_by is not null and reconciled_at is not null and reason_code is not null)),
 -- Section 7 explicitly allows a collector to void their own reported claim.
 -- Self-review remains forbidden for confirmation/dispute/supersession.
 check(reconciled_by is null or (reconciled_by is distinct from collector_profile_id and reconciled_by is distinct from reported_by_profile_id)
  or (status='voided' and reconciled_by=collector_profile_id)),
 check((status='superseded')=(superseded_by is not null)),check(superseded_by is distinct from id)
);
create index p01_collection_status on public.payment_collections(payment_id,status);
create index p01_upi_reference on public.payment_collections(method,reference_norm) where method='upi_direct';
create index p01_collection_queue on public.payment_collections(reported_at,id) where status in ('reported','disputed');
create table public.payment_events (
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.payments(id) on delete restrict,
 collection_id uuid references public.payment_collections(id) on delete restrict,
 actor_profile_id uuid references public.profiles(id) on delete restrict,
 capability text not null check(capability in ('collector','historical_reporter','finance','admin_override','system','patient')),
 event_type text not null check(event_type in ('obligation.created','obligation.due','obligation.held','obligation.voided',
 'collection.reported','collection.confirmed','collection.disputed','collection.voided','collection.superseded',
 'payment.disputed','payment.resolved','payment.override','exception.raised','intake.reported','intake.converted','intake.dismissed')),
 from_state text,to_state text,payment_version integer not null check(payment_version>0),reason_code text not null,
 request_key uuid,occurred_at timestamptz not null default clock_timestamp(),
 check((capability='system')=(actor_profile_id is null))
);
create unique index p01_event_once on public.payment_events(payment_id,payment_version,event_type) where event_type<>'exception.raised';
create table public.payment_exceptions (
 id uuid primary key default gen_random_uuid(),payment_id uuid references public.payments(id) on delete restrict,
 kind text not null check(kind in ('stale_due','stale_reported','cancel_with_collections','duplicate_upi_reference','late_collection_report')),
 source_id uuid,status text not null default 'open' check(status in ('open','acknowledged','closed')),
 dedupe_key text not null unique,raised_at timestamptz not null default clock_timestamp(),closed_at timestamptz,
 closed_by uuid references public.profiles(id) on delete restrict,
 check((status='closed')=(closed_at is not null)),check(status<>'closed' or closed_by is not null)
);
create index p01_exception_queue on public.payment_exceptions(raised_at,id);

create function payments_private.immutable() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='55000',message='immutable_payment_record'; end $$;
-- Capture the invoking SQL role explicitly rather than this definer's current_user.
create function payments_private.settings_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into payments_private.settings_events(changed_by_role,old_row,new_row)
 values(coalesce(nullif(current_setting('role',true),'none'),session_user),to_jsonb(old),to_jsonb(new)); return new; end $$;
create trigger p01_settings_event after update on payments_private.settings for each row execute function payments_private.settings_changed();
create trigger p01_settings_no_delete before delete on payments_private.settings for each row execute function payments_private.immutable();
create trigger p01_settings_no_truncate before truncate on payments_private.settings for each statement execute function payments_private.immutable();

create function payments_private.validate_claim(a bigint,m text,r text) returns void language plpgsql security definer set search_path='' as $$
declare digits text; i integer; total integer:=0; v integer; begin
 if a is null or a<1 or a>999999999999999 or m is null or m not in ('cash','upi_direct') then
  raise exception using errcode='22023',message='invalid_input'; end if;
 digits:=regexp_replace(coalesce(r,''),'[^0-9]','','g');
 if length(digits) between 13 and 19 then
  for i in 1..length(digits) loop
   v:=substr(digits,length(digits)-i+1,1)::integer;
   if i%2=0 then v:=v*2; if v>9 then v:=v-9; end if; end if;
   total:=total+v;
  end loop;
  if total%10=0 then raise exception using errcode='22023',message='invalid_reference'; end if;
 end if;
 if (m='cash' and r is not null) or (m='upi_direct' and (r is null or r !~ '^[0-9]{12}$')) then
  raise exception using errcode='22023',message='invalid_reference'; end if;
end $$;
create function payments_private.guard_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin perform payments_private.validate_claim(new.amount_paise,new.method,new.reference); return new; end $$;
create trigger p01_collection_reference before insert or update on public.payment_collections for each row execute function payments_private.guard_reference();
create trigger p01_intake_reference before insert or update on payments_private.collection_intakes for each row execute function payments_private.guard_reference();

create function payments_private.guard_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare total numeric; begin
 if TG_OP='INSERT' then
  if new.state<>'not_initiated' or new.version<>1 or new.confirmed_paise<>0 or new.report_deadline is not null
   or not exists(select 1 from public.bookings b where b.id=new.booking_id and b.amount_paise=new.amount_paise and b.currency=new.currency)
  then raise exception using errcode='23514',message='invalid_snapshot'; end if;
 else
  if (to_jsonb(new)-array['state','confirmed_paise','version','report_deadline','updated_at']) is distinct from
   (to_jsonb(old)-array['state','confirmed_paise','version','report_deadline','updated_at'])
   or (old.report_deadline is not null and new.report_deadline is distinct from old.report_deadline)
  then raise exception using errcode='55000',message='immutable_snapshot'; end if;
  if new.version<>old.version+1 then raise exception using errcode='40001',message='stale_version'; end if;
  if new.report_deadline is distinct from old.report_deadline and not exists(select 1 from public.bookings b where b.id=new.booking_id and b.state in ('completed','interrupted')
   and (new.report_deadline=(select e.occurred_at from public.booking_events e where e.booking_id=b.id and e.aggregate_version=b.version and e.to_state=b.state)
     +(select report_window_hours from payments_private.settings)*interval '1 hour'
    or (pg_trigger_depth()>1 and new.report_deadline=transaction_timestamp()+(select report_window_hours from payments_private.settings)*interval '1 hour')))
  then raise exception using errcode='55000',message='invalid_deadline'; end if;
  if new.state is distinct from old.state and not exists(select 1 from public.payment_transitions t where t.from_state=old.state and t.to_state=new.state)
  then raise exception using errcode='55000',message='invalid_transition'; end if;
  if old.state='disputed' and new.state<>'disputed' and exists(select 1 from payments_private.collection_intakes i where i.payment_id=new.id and i.status='pending')
  then raise exception using errcode='55000',message='review_pending'; end if;
 end if;
 select coalesce(sum(c.amount_paise),0) into total from public.payment_collections c where c.payment_id=new.id and c.status='confirmed';
 if total<>new.confirmed_paise then raise exception using errcode='23514',message='confirmed_mismatch'; end if;
 if new.state in ('paid','partially_paid') and not (select paid_enabled from payments_private.settings) then
  raise exception using errcode='55000',message='paid_disabled'; end if;
 if (new.state='paid' and (new.amount_paise=0 or new.confirmed_paise<>new.amount_paise)) or
  (new.state='partially_paid' and not (new.confirmed_paise>0 and new.confirmed_paise<new.amount_paise))
 then raise exception using errcode='23514',message='invalid_paid_state'; end if;
 return new;
end $$;
create trigger p01_payment_guard before insert or update on public.payments for each row execute function payments_private.guard_payment();
create trigger p01_payment_no_delete before delete on public.payments for each row execute function payments_private.immutable();
create trigger p01_payment_no_truncate before truncate on public.payments for each statement execute function payments_private.immutable();

create function payments_private.guard_collection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.status<>'reported' or new.reconciled_by is not null or new.reconciled_at is not null or new.superseded_by is not null then
   raise exception using errcode='55000',message='invalid_collection'; end if;
 else
  if (to_jsonb(new)-array['status','superseded_by','reason_code','reconciled_by','reconciled_at','reference_norm']) is distinct from
    (to_jsonb(old)-array['status','superseded_by','reason_code','reconciled_by','reconciled_at','reference_norm']) then
   raise exception using errcode='55000',message='immutable_collection'; end if;
  if not ((old.status='reported' and new.status in ('confirmed','disputed','voided')) or
    (old.status='disputed' and new.status in ('confirmed','voided')) or (old.status='confirmed' and new.status='superseded')) then
   raise exception using errcode='55000',message='invalid_transition'; end if;
 end if;
 return new;
end $$;
create trigger p01_collection_guard before insert or update on public.payment_collections for each row execute function payments_private.guard_collection();
create function payments_private.guard_intake() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.status<>'pending' then raise exception using errcode='55000',message='invalid_intake'; end if;
 else
  if (to_jsonb(new)-array['status','reviewed_by_profile_id','reviewed_at','review_reason_code']) is distinct from
   (to_jsonb(old)-array['status','reviewed_by_profile_id','reviewed_at','review_reason_code']) then
   raise exception using errcode='55000',message='immutable_intake'; end if;
  if old.status<>'pending' or new.status not in ('converted','dismissed') then raise exception using errcode='55000',message='invalid_transition'; end if;
 end if; return new;
end $$;
create trigger p01_intake_guard before insert or update on payments_private.collection_intakes for each row execute function payments_private.guard_intake();

-- Both sides must agree at transaction end; also enforce reservations/provenance.
create function payments_private.check_payment_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid; p public.payments; total numeric; reserved numeric; begin
 if TG_TABLE_NAME='payments' then pid:=new.id; else pid:=new.payment_id; end if;
 select * into p from public.payments where id=pid for update;
 select coalesce(sum(amount_paise) filter(where status='confirmed'),0),coalesce(sum(amount_paise) filter(where status in ('reported','disputed','confirmed')),0)
 into total,reserved from public.payment_collections where payment_id=pid;
 if total<>p.confirmed_paise then raise exception using errcode='23514',message='confirmed_mismatch'; end if;
 reserved:=reserved+coalesce((select sum(amount_paise) from payments_private.collection_intakes where payment_id=pid and status='pending'),0);
 if reserved>p.amount_paise then raise exception using errcode='23514',message='over_collection'; end if;
 if p.state<>'disputed' and exists(select 1 from payments_private.collection_intakes where payment_id=pid and status='pending') then
  raise exception using errcode='23514',message='review_pending'; end if;
 if exists(select 1 from public.payment_collections c where c.payment_id=pid and c.source_intake_id is not null and not exists(
  select 1 from payments_private.collection_intakes i where i.id=c.source_intake_id and i.payment_id=c.payment_id and i.status='converted'
  and i.reported_by_profile_id=c.collector_profile_id and i.reviewed_by_profile_id=c.reported_by_profile_id
  and i.amount_paise=c.amount_paise and i.method=c.method and i.reference is not distinct from c.reference))
 or exists(select 1 from public.payment_collections c where c.payment_id=pid and c.reported_by_profile_id<>c.collector_profile_id and c.source_intake_id is null
  and not exists(select 1 from public.payment_collections prev where prev.payment_id=c.payment_id and prev.superseded_by=c.id
   and prev.status='superseded' and prev.collector_profile_id=c.collector_profile_id and prev.reconciled_by=c.reported_by_profile_id))
 or exists(select 1 from payments_private.collection_intakes i where i.payment_id=pid and i.status='converted'
  and not exists(select 1 from public.payment_collections c where c.source_intake_id=i.id))
 or exists(select 1 from public.payment_collections prev where prev.payment_id=pid and prev.status='superseded' and not exists(
  select 1 from public.payment_collections replacement where replacement.id=prev.superseded_by and replacement.payment_id=prev.payment_id
  and replacement.collector_profile_id=prev.collector_profile_id and replacement.reported_by_profile_id=prev.reconciled_by))
 then raise exception using errcode='23514',message='invalid_provenance'; end if;
 return null;
end $$;
create constraint trigger p01_payment_integrity after insert or update on public.payments deferrable initially deferred for each row execute function payments_private.check_payment_integrity();
create constraint trigger p01_collection_integrity after insert or update on public.payment_collections deferrable initially deferred for each row execute function payments_private.check_payment_integrity();
create constraint trigger p01_intake_integrity after insert or update on payments_private.collection_intakes deferrable initially deferred for each row execute function payments_private.check_payment_integrity();

create function payments_private.require_gate(p_gate text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_gate is distinct from 'pay_after' or not coalesce((select pay_after_enabled from payments_private.settings),false)
 then raise exception using errcode='55000',message='feature_unavailable'; end if;
end $$;
create function payments_private.require_reason(r text) returns void language plpgsql security definer set search_path='' as $$
begin if r is null or r not in ('amount_mismatch','not_received','duplicate','wrong_payee','correction','other')
 then raise exception using errcode='22023',message='invalid_reason'; end if; end $$;
create function payments_private.require_version(actual integer,expected integer) returns void language plpgsql security definer set search_path='' as $$
begin if expected is null or expected<1 or expected<>actual then raise exception using errcode='40001',message='stale_version'; end if; end $$;
create function payments_private.request_lock(a uuid,op text,k uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if k is null then raise exception using errcode='22023',message='invalid_input'; end if;
 -- Serialize the same actor/action/key even when different targets are submitted.
 perform pg_advisory_xact_lock(hashtextextended('p01.request:'||a::text||':'||op||':'||k::text,0));
end $$;
create function payments_private.lock_payment(b uuid) returns public.payments language plpgsql security definer set search_path='' as $$
declare p public.payments; begin
 perform 1 from public.bookings where id=b for update;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 select * into p from public.payments where booking_id=b for update;
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 return p;
end $$;
create function payments_private.finance_actor(b uuid,cap text,c uuid default null,recorder uuid default null) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and coalesce(identity_private.has_capability(cap,null),false)
 and exists(select 1 from public.bookings bk join public.providers p on p.id=bk.provider_id join public.patients pt on pt.id=bk.patient_id
 where bk.id=b and p.individual_owner_profile_id is distinct from auth.uid()
 and c is distinct from auth.uid() and recorder is distinct from auth.uid()
 and pt.self_profile_id is distinct from auth.uid() and bk.requester_profile_id is distinct from auth.uid()
 and not exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.profile_id=auth.uid())
 -- Any patient-access relationship is a conflict, including revoked/expired grants.
 and not exists(select 1 from public.patient_access a where a.patient_id=bk.patient_id and a.grantee_profile_id=auth.uid()));
$$;
create function payments_private.provider_reader(pr uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.providers p where p.id=pr
 and (p.individual_owner_profile_id=auth.uid() or identity_private.org_scope(p.organization_id,'finance:read')));
$$;
-- Deliberately doctor-only until category engines supply an equivalent immutable
-- final-assignee link. P5 end_assignments/release both preserve doctor_visits.
create function payments_private.collector_assignment_at(bid uuid,historical boolean,at_time timestamptz) returns uuid
language sql volatile security definer set search_path='' as $$
 select a.id from public.bookings b join public.payments p on p.booking_id=b.id
 join public.booking_assignments a on a.booking_id=b.id join public.resources r on r.id=a.resource_id
 join public.providers pr on pr.id=b.provider_id join public.doctor_visits dv on dv.booking_id=b.id and dv.assignment_id=a.id
 where b.id=bid and b.category='doctor' and identity_private.active_account()
 and r.kind='person' and r.person_profile_id=auth.uid() and a.assigned_profile_id=auth.uid()
 and a.purpose=booking_private.person_purpose(b.category)
 and ((a.status='active' and a.ended_at is null) or (b.state in ('completed','interrupted') and a.status='ended' and a.ended_at is not null))
 and (case when historical then
  not public.provider_is_publishable(b.provider_id) and
  ((b.state in ('completed','interrupted') and at_time<p.report_deadline
    and exists(select 1 from public.booking_events e where e.booking_id=b.id and e.to_state='in_progress'))
   or (b.state='in_progress' and dv.substate='service_started' and at_time<b.end_at+
      (select report_window_hours from payments_private.settings)*interval '1 hour'
    and exists(select 1 from public.booking_events e where e.booking_id=b.id and e.to_state='in_progress')))
 else
  public.provider_is_publishable(b.provider_id) and booking_private.resource_eligible(b.provider_id,r.id)
  and providers_private.person_is_verified(b.provider_id,auth.uid())
  and (pr.individual_owner_profile_id=auth.uid() or identity_private.org_scope(pr.organization_id,'finance:collect'))
  and ((b.state='in_progress' and a.status='active' and at_time>=b.start_at-interval '60 minutes'
       and at_time<b.end_at+interval '12 hours')
    or (b.state in ('completed','interrupted') and at_time<p.report_deadline
       and exists(select 1 from public.booking_events e where e.booking_id=b.id and e.to_state='in_progress')))
 end) order by a.id limit 1;
$$;
-- Capture the database clock once per authorization decision. No caller-facing
-- function accepts a time or assignment identity; the typed primitive stays private.
create function payments_private.collector_assignment(bid uuid,historical boolean default false) returns uuid
language sql volatile security definer set search_path='' as $$
 select payments_private.collector_assignment_at(bid,historical,clock_timestamp());
$$;
create function payments_private.is_collector(b uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select payments_private.collector_assignment(b,false) is not null;
$$;
create function payments_private.remaining(p uuid,exclude_collection uuid default null,exclude_intake uuid default null) returns numeric
language sql volatile security definer set search_path='' as $$
 select pay.amount_paise-coalesce((select sum(c.amount_paise) from public.payment_collections c where c.payment_id=pay.id
 and c.status in ('reported','disputed','confirmed') and c.id is distinct from exclude_collection),0)
 -coalesce((select sum(i.amount_paise) from payments_private.collection_intakes i where i.payment_id=pay.id and i.status='pending'
 and i.id is distinct from exclude_intake),0) from public.payments pay where pay.id=p;
$$;
create function payments_private.derived(p uuid) returns text language sql volatile security definer set search_path='' as $$
 select case when not s.paid_enabled or coalesce(sum(c.amount_paise),0)=0 then 'due'
 when sum(c.amount_paise)=pay.amount_paise then 'paid' else 'partially_paid' end
 from public.payments pay cross join payments_private.settings s left join public.payment_collections c on c.payment_id=pay.id and c.status='confirmed'
 where pay.id=p group by pay.id,s.paid_enabled;
$$;
create function payments_private.bump(p uuid,target text default null,kind text default null) returns public.payments
language plpgsql security definer set search_path='' as $$
declare prior public.payments; result public.payments; begin
 select * into prior from public.payments where id=p for update;
 if target is distinct from prior.state and target is not null and not exists(select 1 from public.payment_transitions t
 where t.from_state=prior.state and t.to_state=target and t.actor_kind=kind) then raise exception using errcode='55000',message='invalid_transition'; end if;
 update public.payments set confirmed_paise=(select coalesce(sum(amount_paise),0) from public.payment_collections where payment_id=p and status='confirmed'),
 state=coalesce(target,state),version=version+1,updated_at=clock_timestamp() where id=p returning * into result;
 return result;
end $$;
create function payments_private.event(p uuid,c uuid,cap text,etype text,reason text,k uuid,prior text default null) returns void
language sql security definer set search_path='' as $$
 insert into public.payment_events(payment_id,collection_id,actor_profile_id,capability,event_type,from_state,to_state,payment_version,reason_code,request_key)
 select id,c,case when cap='system' then null else auth.uid() end,cap,etype,prior,state,version,reason,k from public.payments where id=p;
$$;
create function payments_private.audit(action_name text,target_kind text,target uuid) returns void language sql security definer set search_path='' as $$
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(auth.uid(),action_name,target_kind,target);
$$;
create function payments_private.raise_exception(p uuid,kind_name text,source uuid,key_text text) returns void
language plpgsql security definer set search_path='' as $$
declare inserted uuid; begin
 insert into public.payment_exceptions(payment_id,kind,source_id,dedupe_key) values(p,kind_name,source,key_text)
 on conflict(dedupe_key) do nothing returning id into inserted;
 if inserted is not null then perform payments_private.event(p,null,'system','exception.raised',kind_name,null); end if;
end $$;
create function payments_private.flag_duplicate(c uuid) returns void language plpgsql security definer set search_path='' as $$
declare claim public.payment_collections; begin
 select * into claim from public.payment_collections where id=c;
 if claim.method='upi_direct' and exists(select 1 from public.payment_collections other where other.method='upi_direct'
 and other.reference_norm=claim.reference_norm and other.payment_id<>claim.payment_id) then
  perform payments_private.raise_exception(claim.payment_id,'duplicate_upi_reference',claim.id,'duplicate_upi_reference:'||claim.id::text);
 end if;
end $$;

create function payments_private.booking_obligation() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.payments; target text; etype text; deadline timestamptz; claims boolean; begin
 if TG_OP='INSERT' then
  insert into public.payments(booking_id,amount_paise,currency) values(new.id,new.amount_paise,new.currency)
   on conflict(booking_id) do nothing returning * into p;
  if p.id is not null then perform payments_private.event(p.id,null,'system','obligation.created','booking_created',null); end if;
  return new;
 end if;
 if new.state is not distinct from old.state then return new; end if;
 select * into p from public.payments where booking_id=new.id for update;
 target:=p.state;
 if new.state='confirmed' and p.state='not_initiated' then target:='due'; etype:='obligation.due';
 elsif new.state in ('declined','expired','cancelled','no_show') then
  claims:=exists(select 1 from public.payment_collections where payment_id=p.id and status in ('reported','disputed','confirmed'))
   or exists(select 1 from payments_private.collection_intakes where payment_id=p.id and status='pending');
  if claims then target:='disputed'; etype:='obligation.held';
  elsif p.state in ('not_initiated','due') then target:='voided'; etype:='obligation.voided'; end if;
 elsif new.state in ('completed','interrupted') then
  deadline:=transaction_timestamp()+(select report_window_hours from payments_private.settings)*interval '1 hour'; etype:='obligation.held';
 end if;
 if etype is not null then
  if target<>p.state and not exists(select 1 from public.payment_transitions where from_state=p.state and to_state=target and actor_kind='system')
  then raise exception using errcode='55000',message='invalid_transition'; end if;
  update public.payments set state=target,report_deadline=coalesce(report_deadline,deadline),version=version+1,updated_at=clock_timestamp() where id=p.id;
  perform payments_private.event(p.id,null,'system',etype,'booking_'||new.state,null,p.state);
  if claims then perform payments_private.raise_exception(p.id,'cancel_with_collections',new.id,'cancel_with_collections:'||p.id::text); end if;
 end if;
 return new;
end $$;
create trigger p01_booking_insert after insert on public.bookings for each row execute function payments_private.booking_obligation();
create trigger p01_booking_state after update of state on public.bookings for each row execute function payments_private.booking_obligation();

-- Backfill only from immutable booking snapshots and the *matching* terminal event.
-- Missing terminal evidence stops review instead of inventing a new report window.
do $$ declare b public.bookings; p public.payments; anchor timestamptz; begin
 for b in select * from public.bookings order by id for update loop
  insert into public.payments(booking_id,amount_paise,currency) values(b.id,b.amount_paise,b.currency)
   on conflict(booking_id) do nothing returning * into p;
  if p.id is null then continue; end if;
  perform payments_private.event(p.id,null,'system','obligation.created','backfill',null);
  if b.state in ('confirmed','in_progress','completed','interrupted') then
   p:=payments_private.bump(p.id,'due','system'); perform payments_private.event(p.id,null,'system','obligation.due','backfill',null,'not_initiated');
   if b.state in ('completed','interrupted') then
    select occurred_at into anchor from public.booking_events where booking_id=b.id and aggregate_version=b.version and to_state=b.state;
    if anchor is null then raise exception 'P01a backfill: terminal booking % lacks matching event',b.id; end if;
    update public.payments set report_deadline=anchor+(select report_window_hours from payments_private.settings)*interval '1 hour',version=version+1 where id=p.id;
    perform payments_private.event(p.id,null,'system','obligation.held','backfill',null,'due');
   end if;
  elsif b.state in ('declined','expired','cancelled','no_show') then
   p:=payments_private.bump(p.id,'voided','system'); perform payments_private.event(p.id,null,'system','obligation.voided','backfill',null,'not_initiated');
  end if;
 end loop;
end $$;

create function public.report_collection(p_booking_id uuid,p_amount_paise bigint,p_method text,p_reference text,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; prior record; h text; result uuid; c public.payment_collections; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.collect',p_request_key);
 p:=payments_private.lock_payment(p_booking_id);
 if not payments_private.is_collector(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.validate_claim(p_amount_paise,p_method,p_reference);
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_amount_paise,p_method,p_reference));
 select * into prior from booking_private.replay(actor,'payment.collect',p_request_key,h);
 if prior.result_id is not null then return prior.result_id; end if;
 select * into c from public.payment_collections where payment_id=p.id and request_key=p_request_key;
 if found then
  if c.collector_profile_id<>actor or c.reported_by_profile_id<>actor or c.amount_paise<>p_amount_paise or c.method<>p_method or c.reference is distinct from p_reference then
   raise exception using errcode='40001',message='idempotency_conflict'; end if;
  return c.id;
 end if;
 if p.state not in ('due','partially_paid','disputed') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_amount_paise>payments_private.remaining(p.id) then raise exception using errcode='22023',message='over_collection'; end if;
 if p_method='upi_direct' then perform pg_advisory_xact_lock(hashtextextended('p01.utr:'||p_reference,0)); end if;
 insert into public.payment_collections(payment_id,collector_profile_id,reported_by_profile_id,amount_paise,method,reference,request_key)
 values(p.id,actor,actor,p_amount_paise,p_method,p_reference,p_request_key) returning id into result;
 p:=payments_private.bump(p.id);
 perform payments_private.event(p.id,result,'collector','collection.reported','reported',p_request_key,p.state);
 perform payments_private.audit('payment.collect','payment_collection',result);
 perform payments_private.flag_duplicate(result);
 perform booking_private.record_request(actor,'payment.collect',p_request_key,h,result,p.version);
 return result;
end $$;

create function public.report_collection_exception(p_booking_id uuid,p_amount_paise bigint,p_method text,p_reference text,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; prior record; h text; result uuid; assignment uuid; i payments_private.collection_intakes; old_state text; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.intake_report',p_request_key);
 p:=payments_private.lock_payment(p_booking_id); assignment:=payments_private.collector_assignment(p_booking_id,true);
 if assignment is null then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.validate_claim(p_amount_paise,p_method,p_reference);
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_amount_paise,p_method,p_reference));
 select * into prior from booking_private.replay(actor,'payment.intake_report',p_request_key,h);
 if prior.result_id is not null then return prior.result_id; end if;
 select * into i from payments_private.collection_intakes where payment_id=p.id and reported_by_profile_id=actor and request_key=p_request_key;
 if found then
  if i.amount_paise<>p_amount_paise or i.method<>p_method or i.reference is distinct from p_reference then
   raise exception using errcode='40001',message='idempotency_conflict'; end if;
  return i.id;
 end if;
 if p.state not in ('due','partially_paid','disputed') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if exists(select 1 from payments_private.collection_intakes where payment_id=p.id and reported_by_profile_id=actor and status='pending')
 or (select count(*) from payments_private.collection_intakes where payment_id=p.id and reported_by_profile_id=actor)>=3
 then raise exception using errcode='53300',message='intake_limit'; end if;
 if p_amount_paise>payments_private.remaining(p.id) then raise exception using errcode='22023',message='over_collection'; end if;
 insert into payments_private.collection_intakes(payment_id,assignment_id,reported_by_profile_id,amount_paise,method,reference,request_key)
 values(p.id,assignment,actor,p_amount_paise,p_method,p_reference,p_request_key) returning id into result;
 old_state:=p.state; p:=payments_private.bump(p.id,'disputed','system');
 perform payments_private.event(p.id,null,'historical_reporter','intake.reported','provider_unavailable',p_request_key,old_state);
 perform payments_private.audit('payment.intake_report','payment_collection_intake',result);
 perform payments_private.raise_exception(p.id,'late_collection_report',result,'late_collection_report:'||result::text);
 perform booking_private.record_request(actor,'payment.intake_report',p_request_key,h,result,p.version);
 return result;
end $$;

create function public.review_collection_intake(p_intake_id uuid,p_decision text,p_reason_code text,p_expected_payment_version integer,p_request_key uuid)
returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; i payments_private.collection_intakes; bid uuid; prior record; h text; claim uuid; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.intake_review',p_request_key);
 select pay.booking_id into bid from public.payments pay join payments_private.collection_intakes intake on intake.payment_id=pay.id where intake.id=p_intake_id;
 p:=payments_private.lock_payment(bid);
 select * into i from payments_private.collection_intakes where id=p_intake_id for update;
 if not found or not payments_private.finance_actor(bid,'finance:reconcile',i.reported_by_profile_id,i.reported_by_profile_id)
 then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_reason(p_reason_code);
 if p_decision is null or p_decision not in ('convert','dismiss') then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_intake_id,p_decision,p_reason_code,p_expected_payment_version));
 select * into prior from booking_private.replay(actor,'payment.intake_review',p_request_key,h);
 if prior.result_id is not null then return; end if;
 perform payments_private.require_version(p.version,p_expected_payment_version);
 if i.status<>'pending' then raise exception using errcode='55000',message='invalid_transition'; end if;
 update payments_private.collection_intakes set status=case p_decision when 'convert' then 'converted' else 'dismissed' end,
 reviewed_by_profile_id=actor,reviewed_at=clock_timestamp(),review_reason_code=p_reason_code where id=i.id;
 if p_decision='convert' then
  if i.method='upi_direct' then perform pg_advisory_xact_lock(hashtextextended('p01.utr:'||i.reference,0)); end if;
  insert into public.payment_collections(payment_id,collector_profile_id,reported_by_profile_id,amount_paise,method,reference,request_key,source_intake_id)
  values(p.id,i.reported_by_profile_id,actor,i.amount_paise,i.method,i.reference,p_request_key,i.id) returning id into claim;
  perform payments_private.flag_duplicate(claim);
 end if;
 update public.payment_exceptions set status='closed',closed_at=clock_timestamp(),closed_by=actor where kind='late_collection_report' and source_id=i.id and status<>'closed';
 p:=payments_private.bump(p.id);
 perform payments_private.event(p.id,claim,'finance','intake.'||case p_decision when 'convert' then 'converted' else 'dismissed' end,p_reason_code,p_request_key,p.state);
 perform payments_private.audit('payment.intake_review','payment_collection_intake',i.id);
 perform booking_private.record_request(actor,'payment.intake_review',p_request_key,h,i.id,p.version);
end $$;

create function public.void_collection(p_collection_id uuid,p_expected_payment_version integer,p_reason_code text,p_request_key uuid)
returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; c public.payment_collections; bid uuid; prior record; h text; own_claim boolean; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.collection_void',p_request_key);
 select pay.booking_id into bid from public.payments pay join public.payment_collections col on col.payment_id=pay.id where col.id=p_collection_id;
 p:=payments_private.lock_payment(bid);
 select * into c from public.payment_collections where id=p_collection_id for update;
 own_claim:=c.collector_profile_id=actor and payments_private.is_collector(bid);
 if not found or not (coalesce(own_claim,false) or payments_private.finance_actor(bid,'finance:reconcile',c.collector_profile_id,c.reported_by_profile_id))
 then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_reason(p_reason_code);
 h:=booking_private.request_hash(jsonb_build_array(p_collection_id,p_expected_payment_version,p_reason_code));
 select * into prior from booking_private.replay(actor,'payment.collection_void',p_request_key,h);
 if prior.result_id is not null then return; end if;
 perform payments_private.require_version(p.version,p_expected_payment_version);
 if c.status not in ('reported','disputed') or (own_claim and c.status<>'reported') then raise exception using errcode='55000',message='invalid_transition'; end if;
 update public.payment_collections set status='voided',reason_code=p_reason_code,reconciled_by=actor,reconciled_at=clock_timestamp() where id=c.id;
 p:=payments_private.bump(p.id);
 perform payments_private.event(p.id,c.id,case when own_claim then 'collector' else 'finance' end,'collection.voided',p_reason_code,p_request_key,p.state);
 perform payments_private.audit('payment.collection_void','payment_collection',c.id);
 perform booking_private.record_request(actor,'payment.collection_void',p_request_key,h,c.id,p.version);
end $$;

create function public.reconcile_collection(p_collection_id uuid,p_decision text,p_reason_code text,p_expected_payment_version integer,p_request_key uuid)
returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; c public.payment_collections; bid uuid; prior record; h text; target text; old_state text; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.reconcile',p_request_key);
 select pay.booking_id into bid from public.payments pay join public.payment_collections col on col.payment_id=pay.id where col.id=p_collection_id;
 p:=payments_private.lock_payment(bid);
 select * into c from public.payment_collections where id=p_collection_id for update;
 if not found or not payments_private.finance_actor(bid,'finance:reconcile',c.collector_profile_id,c.reported_by_profile_id)
 then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_reason(p_reason_code);
 if p_decision is null or p_decision not in ('confirm','dispute') then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_collection_id,p_decision,p_reason_code,p_expected_payment_version));
 select * into prior from booking_private.replay(actor,'payment.reconcile',p_request_key,h);
 if prior.result_id is not null then return; end if;
 perform payments_private.require_version(p.version,p_expected_payment_version);
 -- Section 5.2 permits disputed -> confirmed; this is its finance command.
 if not (c.status='reported' or (c.status='disputed' and p_decision='confirm')) then raise exception using errcode='55000',message='invalid_transition'; end if;
 update public.payment_collections set status=case p_decision when 'confirm' then 'confirmed' else 'disputed' end,
 reason_code=p_reason_code,reconciled_by=actor,reconciled_at=clock_timestamp() where id=c.id;
 old_state:=p.state;
 target:=case when p.state='disputed' or p_decision='dispute' then 'disputed' else payments_private.derived(p.id) end;
 p:=payments_private.bump(p.id,target,'finance');
 perform payments_private.event(p.id,c.id,'finance','collection.'||case p_decision when 'confirm' then 'confirmed' else 'disputed' end,p_reason_code,p_request_key,old_state);
 perform payments_private.audit('payment.reconcile.'||p_decision,'payment_collection',c.id);
 perform booking_private.record_request(actor,'payment.reconcile',p_request_key,h,c.id,p.version);
end $$;

create function public.supersede_collection(p_collection_id uuid,p_amount_paise bigint,p_method text,p_reference text,p_reason_code text,p_expected_payment_version integer,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; c public.payment_collections; bid uuid; prior record; h text; result uuid:=gen_random_uuid(); old_state text; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.supersede',p_request_key);
 select pay.booking_id into bid from public.payments pay join public.payment_collections col on col.payment_id=pay.id where col.id=p_collection_id;
 p:=payments_private.lock_payment(bid);
 select * into c from public.payment_collections where id=p_collection_id for update;
 if not found or not payments_private.finance_actor(bid,'finance:reconcile',c.collector_profile_id,c.reported_by_profile_id)
 then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_reason(p_reason_code); perform payments_private.validate_claim(p_amount_paise,p_method,p_reference);
 h:=booking_private.request_hash(jsonb_build_array(p_collection_id,p_amount_paise,p_method,p_reference,p_reason_code,p_expected_payment_version));
 select * into prior from booking_private.replay(actor,'payment.supersede',p_request_key,h);
 if prior.result_id is not null then return prior.result_id; end if;
 perform payments_private.require_version(p.version,p_expected_payment_version);
 if c.status<>'confirmed' then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_amount_paise>payments_private.remaining(p.id,c.id) then raise exception using errcode='22023',message='over_collection'; end if;
 if p_method='upi_direct' then perform pg_advisory_xact_lock(hashtextextended('p01.utr:'||p_reference,0)); end if;
 update public.payment_collections set status='superseded',superseded_by=result,reason_code=p_reason_code,reconciled_by=actor,reconciled_at=clock_timestamp() where id=c.id;
 insert into public.payment_collections(id,payment_id,collector_profile_id,reported_by_profile_id,amount_paise,method,reference,request_key)
 values(result,p.id,c.collector_profile_id,actor,p_amount_paise,p_method,p_reference,p_request_key);
 old_state:=p.state; p:=payments_private.bump(p.id,'disputed','finance');
 perform payments_private.event(p.id,c.id,'finance','collection.superseded',p_reason_code,p_request_key,old_state);
 perform payments_private.audit('payment.supersede','payment_collection',c.id);
 perform payments_private.flag_duplicate(result);
 perform booking_private.record_request(actor,'payment.supersede',p_request_key,h,result,p.version);
 return result;
end $$;

create function public.dispute_payment(p_booking_id uuid,p_reason_code text,p_expected_payment_version integer,p_request_key uuid)
returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; b public.bookings; prior record; h text; patient boolean; old_state text; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.dispute',p_request_key);
 p:=payments_private.lock_payment(p_booking_id); select * into b from public.bookings where id=p_booking_id;
 patient:=booking_private.patient(b.patient_id,'booking:read');
 if not (coalesce(patient,false) or payments_private.finance_actor(b.id,'finance:reconcile')) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_reason_code is null or p_reason_code not in ('not_received_service','amount_wrong','already_paid','not_paid_but_claimed','other')
 then raise exception using errcode='22023',message='invalid_reason'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_reason_code,p_expected_payment_version));
 select * into prior from booking_private.replay(actor,'payment.dispute',p_request_key,h);
 if prior.result_id is not null then return; end if;
 perform payments_private.require_version(p.version,p_expected_payment_version);
 if patient and (p.state='disputed' or (select count(*) from public.payment_events where payment_id=p.id and event_type='payment.disputed' and capability='patient')
  >=(select patient_dispute_cap from payments_private.settings)) then raise exception using errcode='55000',message='dispute_limit'; end if;
 if p.state not in ('due','partially_paid','paid') or (p.state='due' and b.state not in ('completed','interrupted')
  and not exists(select 1 from public.payment_collections where payment_id=p.id)) then raise exception using errcode='55000',message='invalid_transition'; end if;
 old_state:=p.state; p:=payments_private.bump(p.id,'disputed',case when patient then 'patient' else 'finance' end);
 perform payments_private.event(p.id,null,case when patient then 'patient' else 'finance' end,'payment.disputed',p_reason_code,p_request_key,old_state);
 perform payments_private.audit('payment.dispute','payment',p.id);
 perform booking_private.record_request(actor,'payment.dispute',p_request_key,h,p.id,p.version);
end $$;

create function public.resolve_dispute(p_payment_id uuid,p_resolution_code text,p_expected_payment_version integer,p_request_key uuid)
returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; bid uuid; prior record; h text; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.resolve',p_request_key);
 select booking_id into bid from public.payments where id=p_payment_id;
 p:=payments_private.lock_payment(bid);
 if not payments_private.finance_actor(bid,'finance:reconcile') then raise exception using errcode='42501',message='forbidden'; end if;
 if exists(select 1 from public.payment_collections where payment_id=p.id and (collector_profile_id=actor or reported_by_profile_id=actor))
 then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_reason(p_resolution_code);
 h:=booking_private.request_hash(jsonb_build_array(p_payment_id,p_resolution_code,p_expected_payment_version));
 select * into prior from booking_private.replay(actor,'payment.resolve',p_request_key,h);
 if prior.result_id is not null then return; end if;
 perform payments_private.require_version(p.version,p_expected_payment_version);
 if p.state<>'disputed' or exists(select 1 from payments_private.collection_intakes where payment_id=p.id and status='pending')
 or exists(select 1 from public.payment_collections where payment_id=p.id and status in ('reported','disputed'))
 then raise exception using errcode='55000',message='review_pending'; end if;
 p:=payments_private.bump(p.id,payments_private.derived(p.id),'finance');
 perform payments_private.event(p.id,null,'finance','payment.resolved',p_resolution_code,p_request_key,'disputed');
 perform payments_private.audit('payment.resolve','payment',p.id);
 perform booking_private.record_request(actor,'payment.resolve',p_request_key,h,p.id,p.version);
end $$;

create function public.override_payment(p_payment_id uuid,p_target_state text,p_reason_code text,p_expected_payment_version integer,p_request_key uuid)
returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; bid uuid; prior record; h text; old_state text; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 perform payments_private.request_lock(actor,'payment.override',p_request_key);
 select booking_id into bid from public.payments where id=p_payment_id; p:=payments_private.lock_payment(bid);
 if not payments_private.finance_actor(bid,'finance:override') or exists(select 1 from public.payment_collections where payment_id=p.id
 and (collector_profile_id=actor or reported_by_profile_id=actor)) then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_reason(p_reason_code);
 if p_target_state is null or p_target_state not in ('due','partially_paid','paid','disputed') then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_payment_id,p_target_state,p_reason_code,p_expected_payment_version));
 select * into prior from booking_private.replay(actor,'payment.override',p_request_key,h);
 if prior.result_id is not null then return; end if;
 perform payments_private.require_version(p.version,p_expected_payment_version);
 if p.state='voided' or p.state=p_target_state then raise exception using errcode='55000',message='invalid_transition'; end if;
 old_state:=p.state; p:=payments_private.bump(p.id,p_target_state,'admin_override');
 perform payments_private.event(p.id,null,'admin_override','payment.override',p_reason_code,p_request_key,old_state);
 perform payments_private.audit('payment.override','payment',p.id);
 perform booking_private.record_request(actor,'payment.override',p_request_key,h,p.id,p.version);
end $$;

create function payments_private.summary(p uuid,view_kind text) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('state',pay.state,'amountPaise',pay.amount_paise::text,'confirmedPaise',pay.confirmed_paise::text,
 'currency',pay.currency,'version',pay.version,'noCharge',pay.amount_paise=0,'reviewPending',
 exists(select 1 from payments_private.collection_intakes where payment_id=pay.id and status='pending'))
 ||case when view_kind='patient' then '{}'::jsonb else jsonb_build_object('claims',coalesce((select jsonb_agg(
 jsonb_build_object('id',c.id,'amountPaise',c.amount_paise::text,'method',c.method,'status',c.status,'reportedAt',c.reported_at,
 'recordedByFinance',c.reported_by_profile_id<>c.collector_profile_id)
 ||case when view_kind in ('finance','collector') then jsonb_build_object('reference',c.reference) else '{}'::jsonb end
 ||case when view_kind='finance' then jsonb_build_object('collector_profile_id',c.collector_profile_id) else '{}'::jsonb end order by c.reported_at,c.id)
 from public.payment_collections c where c.payment_id=pay.id and (view_kind<>'collector' or c.collector_profile_id=auth.uid())),'[]'::jsonb)) end
 from public.payments pay where pay.id=p;
$$;
create function payments_private.finance_reader() returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce((select pay_after_enabled from payments_private.settings),false) and identity_private.active_account() and (coalesce(identity_private.has_capability('finance:reconcile',null),false)
 or coalesce(identity_private.has_capability('finance:override',null),false));
$$;
create function payments_private.patient_reader(b uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce((select pay_after_enabled from payments_private.settings),false) and exists(select 1 from public.bookings where id=b and booking_private.patient(patient_id,'booking:read'));
$$;
create function payments_private.collector_reader(p uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce((select pay_after_enabled from payments_private.settings),false) and exists(select 1 from public.payments where id=p and payments_private.is_collector(booking_id));
$$;
create function public.get_payment_summary(p_booking_id uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; p public.payments; b public.bookings; projection text; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 select * into p from public.payments where booking_id=b.id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 projection:=case when payments_private.finance_reader() then 'finance'
 when booking_private.patient(b.patient_id,'booking:read') then 'patient'
 when payments_private.is_collector(b.id) then 'collector'
 when payments_private.provider_reader(b.provider_id) then 'provider' end;
 if projection is null then raise exception using errcode='P0002',message='not_found'; end if;
 return payments_private.summary(p.id,projection);
end $$;
create function public.get_collection_intake_status(p_intake_id uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; result jsonb; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 select jsonb_build_object('id',id,'status',status,'reportedAt',reported_at) into result from payments_private.collection_intakes
 where id=p_intake_id and reported_by_profile_id=actor;
 if result is null then raise exception using errcode='P0002',message='not_found'; end if; return result;
end $$;
create function public.list_provider_payments(p_provider_id uuid,p_limit integer,p_after_id uuid) returns setof jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 if not payments_private.provider_reader(p_provider_id) then raise exception using errcode='P0002',message='not_found'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='invalid_input'; end if;
 return query select payments_private.summary(p.id,'provider')||jsonb_build_object('public_ref',b.public_ref)
 from public.payments p join public.bookings b on b.id=p.booking_id where b.provider_id=p_provider_id
 and (p_after_id is null or p.id>p_after_id) order by p.id limit p_limit;
end $$;
create function payments_private.require_page(l integer,t timestamptz,i uuid) returns void language plpgsql security definer set search_path='' as $$
begin if l is null or l not between 1 and 100 or (t is null)<>(i is null) or (t is not null and not isfinite(t))
 then raise exception using errcode='22023',message='invalid_input'; end if; end $$;
create function public.list_payment_queue(p_limit integer,p_after_reported_at timestamptz,p_after_id uuid) returns setof jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 if not identity_private.has_capability('finance:reconcile',null) then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_page(p_limit,p_after_reported_at,p_after_id);
 return query select jsonb_build_object('public_ref',b.public_ref,'public_reference',pr.public_reference,'payment_id',p.id,'collection_id',c.id,
 'amountPaise',c.amount_paise::text,'method',c.method,'reportedAt',c.reported_at,'ageSeconds',floor(extract(epoch from clock_timestamp()-c.reported_at)),
 'exceptionKinds',coalesce((select jsonb_agg(distinct e.kind) from public.payment_exceptions e where e.payment_id=p.id and e.status<>'closed'),'[]'::jsonb))
 from public.payment_collections c join public.payments p on p.id=c.payment_id join public.bookings b on b.id=p.booking_id
 join public.providers pr on pr.id=b.provider_id where c.status in ('reported','disputed')
 and (p_after_id is null or (c.reported_at,c.id)>(p_after_reported_at,p_after_id)) order by c.reported_at,c.id limit p_limit;
end $$;
create function public.list_payment_exceptions(p_limit integer,p_after_reported_at timestamptz,p_after_id uuid) returns setof jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid; begin
 perform payments_private.require_gate('pay_after'); actor:=identity_private.require_actor();
 if not identity_private.has_capability('finance:reconcile',null) then raise exception using errcode='42501',message='forbidden'; end if;
 perform payments_private.require_page(p_limit,p_after_reported_at,p_after_id);
 -- Exceptions use raised_at as reportedAt and as the paired finance cursor.
 return query select jsonb_build_object('id',e.id,'public_ref',b.public_ref,'public_reference',pr.public_reference,'payment_id',p.id,
 'kind',e.kind,'status',e.status,'reportedAt',e.raised_at)
 ||case when e.kind='late_collection_report' then jsonb_build_object('intake_id',i.id,'amountPaise',i.amount_paise::text,
 'method',i.method,'reference',i.reference,'reporter_profile_id',i.reported_by_profile_id,'submittedAt',i.reported_at,'reviewStatus',i.status) else '{}'::jsonb end
 from public.payment_exceptions e join public.payments p on p.id=e.payment_id join public.bookings b on b.id=p.booking_id
 join public.providers pr on pr.id=b.provider_id left join payments_private.collection_intakes i on e.kind='late_collection_report' and i.id=e.source_id
 where (p_after_id is null or (e.raised_at,e.id)>(p_after_reported_at,p_after_id)) order by e.raised_at,e.id limit p_limit;
end $$;

-- E-1: private schema, direct approved DB transport only; not a public RPC.
-- E-2: manual invocation, no cron or route is installed in this SQL ticket.
create function payments_private.reconcile_pay_after_at(p_limit integer,at_time timestamptz) returns integer
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare cursor_id uuid; collection_cursor uuid; scan_phase text; bid uuid; cid uuid; b public.bookings; p public.payments; c public.payment_collections; anchor timestamptz; processed integer:=0; begin
 perform payments_private.require_gate('pay_after');
 if p_limit is null or p_limit not between 1 and 200 or at_time is null or not isfinite(at_time) then raise exception using errcode='22023',message='invalid_input'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('p01.worker.pay_after',0)) then return 0; end if;
 select after_booking_id,after_collection_id,phase into cursor_id,collection_cursor,scan_phase from payments_private.worker_cursor where id;
 if scan_phase='bookings' then
 for bid in select bk.id from public.bookings bk join public.payments pay on pay.booking_id=bk.id
 where cursor_id is null or bk.id>cursor_id order by bk.id limit p_limit for update of bk skip locked loop
  select * into b from public.bookings where id=bid;
  select * into p from public.payments where booking_id=bid for update;
  if b.state='interrupted' and p.state='due' and p.report_deadline<at_time
   and not exists(select 1 from public.payment_collections where payment_id=p.id and status in ('reported','disputed','confirmed'))
   and not exists(select 1 from payments_private.collection_intakes where payment_id=p.id and status='pending') then
   p:=payments_private.bump(p.id,'voided','system');
   perform payments_private.event(p.id,null,'system','obligation.voided','interrupted_window_closed',null,'due');
  end if;
  if b.state='completed' and p.state='due' and p.amount_paise>0 then
   select occurred_at into anchor from public.booking_events where booking_id=b.id and to_state='completed' and aggregate_version=b.version;
   if anchor<at_time-(select stale_due_days from payments_private.settings)*interval '1 day' then
    perform payments_private.raise_exception(p.id,'stale_due',p.id,'stale_due:'||p.id::text); end if;
  end if;
  if b.state in ('declined','expired','cancelled','no_show') and exists(select 1 from public.payment_collections where payment_id=p.id and status in ('reported','disputed','confirmed')) then
   perform payments_private.raise_exception(p.id,'cancel_with_collections',b.id,'cancel_with_collections:'||p.id::text); end if;
  processed:=processed+1; cursor_id:=bid;
 end loop;
 update payments_private.worker_cursor set after_booking_id=case when processed=0 then null else cursor_id end,phase='collections' where id;
 else
  -- Separate keyset pass: a payment can have arbitrarily many voided/superseded
  -- claims, so never loop over its entire history while holding its row lock.
  for cid in select id from public.payment_collections where collection_cursor is null or id>collection_cursor order by id limit p_limit loop
   select pay.booking_id into bid from public.payments pay join public.payment_collections col on col.payment_id=pay.id where col.id=cid;
   perform 1 from public.bookings where id=bid for update skip locked;
   if found then
    select * into p from public.payments where booking_id=bid for update;
    select * into c from public.payment_collections where id=cid;
    if c.status='reported' and c.reported_at<at_time-(select stale_reported_hours from payments_private.settings)*interval '1 hour' then
     perform payments_private.raise_exception(p.id,'stale_reported',c.id,'stale_reported:'||c.id::text); end if;
    perform payments_private.flag_duplicate(c.id);
   end if;
   processed:=processed+1; collection_cursor:=cid;
  end loop;
  update payments_private.worker_cursor set after_collection_id=case when processed=0 then null else collection_cursor end,phase='bookings' where id;
 end if;
 return processed;
end $$;
create function payments_worker.reconcile_pay_after(p_limit integer) returns integer
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
begin
 perform payments_private.require_gate('pay_after');
 return payments_private.reconcile_pay_after_at(p_limit,clock_timestamp());
end $$;

-- Append-only objects are immutable even in owner-context DML. Collection/intake
-- status updates use their narrow guards; DELETE/TRUNCATE always fail.
do $$ declare relation text; begin
 foreach relation in array array['public.payment_events','public.payment_transitions','payments_private.settings_events'] loop
  execute format('create trigger p01_immutable before update or delete on %s for each row execute function payments_private.immutable()',relation);
  execute format('create trigger p01_no_truncate before truncate on %s for each statement execute function payments_private.immutable()',relation);
 end loop;
 foreach relation in array array['public.payment_collections','payments_private.collection_intakes'] loop
  execute format('create trigger p01_no_delete before delete on %s for each row execute function payments_private.immutable()',relation);
  execute format('create trigger p01_no_truncate before truncate on %s for each statement execute function payments_private.immutable()',relation);
 end loop;
 foreach relation in array array['public.payments','public.payment_transitions','public.payment_collections','public.payment_events',
 'public.payment_exceptions','payments_private.settings','payments_private.settings_events','payments_private.collection_intakes','payments_private.worker_cursor'] loop
  execute format('alter table %s enable row level security',relation);
  execute format('revoke all on %s from public,anon,authenticated,service_role',relation);
 end loop;
end $$;
-- Policy predicates are the only private functions callable by authenticated.
-- Stored policy OIDs require EXECUTE, not parser access to the private schema.
revoke all on all functions in schema payments_private,payments_worker from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('payments_private','payments_worker') loop execute format('alter function %s owner to postgres',f); end loop;
end $$;
grant execute on function payments_private.patient_reader(uuid),payments_private.finance_reader(),payments_private.collector_reader(uuid) to authenticated;
grant usage on schema payments_worker to service_role;
grant execute on function payments_worker.reconcile_pay_after(integer) to service_role;
grant select on public.payments,public.payment_collections,public.payment_events to authenticated;
create policy p01_payment_read on public.payments for select to authenticated using
 (identity_private.active_account() and (payments_private.patient_reader(booking_id) or payments_private.finance_reader()));
create policy p01_collection_read on public.payment_collections for select to authenticated using
 (identity_private.active_account() and (payments_private.finance_reader() or
 (collector_profile_id=auth.uid() and reported_by_profile_id=auth.uid() and
 payments_private.collector_reader(payment_id))));
create policy p01_event_read on public.payment_events for select to authenticated using(payments_private.finance_reader());
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('report_collection','report_collection_exception','review_collection_intake','void_collection','reconcile_collection',
 'supersede_collection','dispute_payment','resolve_dispute','override_payment','get_payment_summary','get_collection_intake_status',
 'list_provider_payments','list_payment_queue','list_payment_exceptions') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
  execute format('alter function %s owner to postgres',f);
 end loop;
end $$;
commit;
