-- P5 doctor block: DC02 arrival code / Kiro / feat/S01-doctor-core / base integ/all f549ad3.
-- Sources: docs/specs/BOOKING_AND_CONSULTATION.md (arrival OTP steps 1-6),
-- docs/CANONICAL_SCHEMA_DRAFT.md (challenge storage), docs/SOURCE_AUDIT_R01.md MR-20 (limits),
-- shared contract §10 (gate phases) and §13 (replay).
-- The P5 design deferred DC02 to Phase 7 (DQ-07); this ticket's brief puts it in core.
-- Flow: doctor reports `arrived` -> the patient (only) asks for a code -> the doctor types
-- the code the patient reads out in person -> substate `arrival_verified` -> only then may
-- the doctor start the visit. Emergencies never wait for a code: interruption is allowed
-- from `arrived` and `arrival_verified` without one.
-- Storage: six digits, HMAC-SHA256 verifier with a per-database key and a per-challenge salt,
-- bound to booking + assignment + doctor. No plaintext is stored, logged, audited or sent to the
-- outbox. Limits (MR-20): valid 5 minutes, 5 wrong attempts per code, 3 regenerations per visit
-- (4 codes total), 60 s between codes. Constant-time comparison over the 32-byte digest.
-- Gate: every command here is the `start` phase (contract §10.1).
-- Replay (contract §13, review H3/M1), keyed per actor, before authorization, gates and caps:
--  * issue_arrival_code (action p5.doctor.issue_arrival): the code is derived, not stored. It is
--    HMAC(key, challenge id, salt) reduced without bias to six digits, so the same issuing actor
--    with the same key gets the same code back while that challenge is active and unexpired;
--    after that the replay answers 55000 arrival_code_ended. Nothing reversible is persisted:
--    the derivation needs the same protected key the verifier already depends on. A new key is
--    a regeneration and stays under the limits.
--  * verify_arrival_code (action p5.doctor.verify_arrival): a success records the event; a wrong
--    code records an immutable failure row with the attempts left, so a retried wrong code is
--    answered from the record and never counts twice, and the key cannot be reused with another
--    code (40001 idempotency_conflict).
-- Support-assisted fallback (BOOKING_AND_CONSULTATION step 6, CANONICAL_SCHEMA_DRAFT §6,
-- MR-20 "lockout escalates to support"). Two parties, neither of them the doctor:
--  1. an ops holder (shared booking_private.ops_actor: booking:incident at AAL2, independent of
--     the provider, patient, requester and every assignee) opens a coded fallback for a visit
--     in `arrived`, after talking to the patient on the registered channel;
--  2. the patient confirms in their own authenticated session within 10 minutes.
-- Only then does the visit move to arrival_verified, with event reason arrival_assisted so it
-- stays distinguishable from a code verification. Support alone, the patient alone (without
-- the code) and the doctor can never complete it. Two fallbacks per visit at most. Codes are
-- revoked when one opens. OWNER-DECISION (Q09): the procedure is not approved, so it sits
-- behind its own database gate `doctor_arrival_fallback`, seeded off.
begin;

insert into booking_private.feature_gates(key) values ('doctor_arrival_fallback') on conflict do nothing;

create table doctor_private.arrival_key (
 id integer primary key check (id=1),
 key bytea not null check (length(key)=32),
 created_at timestamptz not null default now()
);
insert into doctor_private.arrival_key(id,key) values (1,extensions.gen_random_bytes(32));
create trigger p5d_arrival_key_immutable before update or delete on doctor_private.arrival_key for each row execute function booking_private.immutable();
create trigger p5d_arrival_key_no_truncate before truncate on doctor_private.arrival_key for each statement execute function booking_private.immutable();

create table doctor_private.arrival_challenges (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 assignment_id uuid not null references public.booking_assignments(id),
 doctor_profile_id uuid not null references public.profiles(id),
 issued_to_profile_id uuid not null references public.profiles(id),
 salt bytea not null check (length(salt)=16),
 code_hmac bytea not null check (length(code_hmac)=32),
 issued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 attempts integer not null default 0 check (attempts between 0 and 5),
 status text not null default 'active' check (status in ('active','consumed','revoked','exhausted')),
 ended_at timestamptz,
 check (expires_at>issued_at and expires_at<=issued_at+interval '5 minutes'),
 check ((status='active')=(ended_at is null)),
 check (status<>'exhausted' or attempts=5),
 check (issued_to_profile_id<>doctor_profile_id)
);
create unique index p5d_challenge_active on doctor_private.arrival_challenges(booking_id) where status='active';
create index p5d_challenge_booking on doctor_private.arrival_challenges(booking_id,issued_at);

-- One row per wrong-code request key (M1). Insert-only.
create table doctor_private.verify_failures (
 id uuid primary key default gen_random_uuid(),
 challenge_id uuid not null references doctor_private.arrival_challenges(id),
 booking_id uuid not null references public.bookings(id),
 actor_profile_id uuid not null references public.profiles(id),
 attempts_remaining integer not null check (attempts_remaining between 0 and 4),
 created_at timestamptz not null default clock_timestamp()
);

create table doctor_private.arrival_fallbacks (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 assignment_id uuid not null references public.booking_assignments(id),
 doctor_profile_id uuid not null references public.profiles(id),
 reason text not null check (reason in ('code_lockout','code_unavailable')),
 opened_by_profile_id uuid not null references public.profiles(id),
 opened_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 status text not null default 'pending' check (status in ('pending','confirmed','revoked')),
 confirmed_by_profile_id uuid references public.profiles(id),
 ended_at timestamptz,
 check (expires_at>opened_at and expires_at<=opened_at+interval '10 minutes'),
 check ((status='pending' and ended_at is null and confirmed_by_profile_id is null)
  or (status='confirmed' and ended_at is not null and confirmed_by_profile_id is not null)
  or (status='revoked' and ended_at is not null and confirmed_by_profile_id is null)),
 check (opened_by_profile_id<>doctor_profile_id),
 check (confirmed_by_profile_id is null or (confirmed_by_profile_id<>opened_by_profile_id and confirmed_by_profile_id<>doctor_profile_id))
);
create unique index p5d_fallback_pending on doctor_private.arrival_fallbacks(booking_id) where status='pending';

alter table doctor_private.arrival_key enable row level security;
alter table doctor_private.arrival_challenges enable row level security;
alter table doctor_private.verify_failures enable row level security;
alter table doctor_private.arrival_fallbacks enable row level security;

create function doctor_private.guard_challenge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_challenge'; end if;
 if TG_OP='INSERT' then
  if new.status<>'active' or new.attempts<>0 then raise exception using errcode='55000',message='invalid_challenge'; end if;
  return new;
 end if;
 if old.status<>'active' or new.attempts not in (old.attempts,old.attempts+1)
 or (to_jsonb(new)-array['attempts','status','ended_at']) is distinct from (to_jsonb(old)-array['attempts','status','ended_at'])
 then raise exception using errcode='55000',message='immutable_challenge'; end if;
 return new;
end $$;
create trigger p5d_challenge_guard before insert or update or delete on doctor_private.arrival_challenges for each row execute function doctor_private.guard_challenge();
create trigger p5d_challenge_no_truncate before truncate on doctor_private.arrival_challenges for each statement execute function booking_private.immutable();
create trigger p5d_verify_failures_immutable before update or delete on doctor_private.verify_failures for each row execute function booking_private.immutable();
create trigger p5d_verify_failures_no_truncate before truncate on doctor_private.verify_failures for each statement execute function booking_private.immutable();

create function doctor_private.guard_fallback() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_fallback'; end if;
 if TG_OP='INSERT' then
  if new.status<>'pending' then raise exception using errcode='55000',message='invalid_fallback'; end if;
  return new;
 end if;
 if old.status<>'pending' or new.status not in ('confirmed','revoked')
 or (to_jsonb(new)-array['status','confirmed_by_profile_id','ended_at']) is distinct from (to_jsonb(old)-array['status','confirmed_by_profile_id','ended_at'])
 then raise exception using errcode='55000',message='immutable_fallback'; end if;
 return new;
end $$;
create trigger p5d_fallback_guard before insert or update or delete on doctor_private.arrival_fallbacks for each row execute function doctor_private.guard_fallback();
create trigger p5d_fallback_no_truncate before truncate on doctor_private.arrival_fallbacks for each statement execute function booking_private.immutable();

create function doctor_private.code_digest(salt bytea, booking uuid, assignment uuid, doctor uuid, code text) returns bytea
language sql stable security definer set search_path='' as $$
 select extensions.hmac(salt||convert_to(booking::text||':'||assignment::text||':'||doctor::text||':'||code,'UTF8'),
  (select k.key from doctor_private.arrival_key k where k.id=1),'sha256');
$$;

create function doctor_private.ct_equal(a bytea, b bytea) returns boolean language plpgsql immutable set search_path='' as $$
declare diff integer:=0; begin
 if a is null or b is null or length(a)<>length(b) then return false; end if;
 for i in 0..length(a)-1 loop diff:=diff|(get_byte(a,i) # get_byte(b,i)); end loop;
 return diff=0;
end $$;

-- Deterministic for one challenge (id + random salt) and the protected key. Each digest gives
-- eight 32-bit words; words >= 4294000000 (2^32 rounded down to a multiple of 10^6) are
-- rejected, so every six-digit code is equally likely.
create function doctor_private.derive_code(p_challenge uuid, p_salt bytea) returns text
language plpgsql stable security definer set search_path='' as $$
declare k bytea; d bytea; n bigint; i integer:=0; begin
 select key into k from doctor_private.arrival_key where id=1;
 loop
  d:=extensions.hmac(convert_to('p5d-arrival-code:'||p_challenge::text||':'||i::text||':','UTF8')||p_salt,k,'sha256');
  for j in 0..7 loop
   n:=(get_byte(d,4*j)::bigint<<24)|(get_byte(d,4*j+1)::bigint<<16)|(get_byte(d,4*j+2)::bigint<<8)|get_byte(d,4*j+3)::bigint;
   if n<4294000000 then return lpad((n%1000000)::text,6,'0'); end if;
  end loop;
  i:=i+1;
 end loop;
end $$;

-- Revokes live codes only (used when a new code or a fallback replaces them).
create function doctor_private.revoke_codes(booking uuid) returns void language sql security definer set search_path='' as $$
 update doctor_private.arrival_challenges set status='revoked',ended_at=clock_timestamp() where booking_id=booking and status='active';
$$;
-- Every step that verifies arrival, ends the visit or ends the doctor's access closes both
-- arrival paths. Assignment and reservation handling stays with the shared helpers (§12).
create function doctor_private.end_arrival(booking uuid) returns void language sql security definer set search_path='' as $$
 update doctor_private.arrival_challenges set status='revoked',ended_at=clock_timestamp() where booking_id=booking and status='active';
 update doctor_private.arrival_fallbacks set status='revoked',ended_at=clock_timestamp() where booking_id=booking and status='pending';
$$;

-- Patient only (never the assigned doctor, even with patient access). Returns the code; the
-- route shows it once with no-store headers.
create function public.issue_arrival_code(p_booking_id uuid, p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; rid uuid; b public.bookings; v public.doctor_visits;
 a public.booking_assignments; c doctor_private.arrival_challenges; cid uuid; salt bytea; expires timestamptz; begin
 if p_booking_id is null or p_request_key is null then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id));
 select r.result_id into rid from booking_private.replay(actor,'p5.doctor.issue_arrival',p_request_key,h) r;
 if rid is not null then
  select * into c from doctor_private.arrival_challenges where id=rid and issued_to_profile_id=actor;
  if not found or c.status<>'active' or c.expires_at<=clock_timestamp() then
   raise exception using errcode='55000',message='arrival_code_ended'; end if;
  return jsonb_build_object('code',doctor_private.derive_code(c.id,c.salt),'expires_at',c.expires_at);
 end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into v from public.doctor_visits where booking_id=b.id for update;
 select r.result_id into rid from booking_private.replay(actor,'p5.doctor.issue_arrival',p_request_key,h) r;
 if rid is not null then
  select * into c from doctor_private.arrival_challenges where id=rid and issued_to_profile_id=actor;
  if not found or c.status<>'active' or c.expires_at<=clock_timestamp() then
   raise exception using errcode='55000',message='arrival_code_ended'; end if;
  return jsonb_build_object('code',doctor_private.derive_code(c.id,c.salt),'expires_at',c.expires_at);
 end if;
 if not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 if b.category<>'doctor' or b.state<>'confirmed' or clock_timestamp()>=b.end_at+interval '12 hours' then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if v.booking_id is null or v.substate<>'arrived' then raise exception using errcode='55000',message='invalid_transition'; end if;
 select * into a from public.booking_assignments where id=v.assignment_id and booking_id=b.id and status='active' and purpose='doctor_visit';
 if not found or a.assigned_profile_id is null then raise exception using errcode='55000',message='invalid_transition'; end if;
 if a.assigned_profile_id=actor then raise exception using errcode='42501',message='forbidden'; end if;
 perform 1 from doctor_private.arrival_challenges where booking_id=b.id for update;
 if (select count(*) from doctor_private.arrival_challenges where booking_id=b.id)>=4 then
  raise exception using errcode='53300',message='arrival_code_limit'; end if;
 if exists(select 1 from doctor_private.arrival_challenges where booking_id=b.id and issued_at>clock_timestamp()-interval '60 seconds') then
  raise exception using errcode='53300',message='arrival_code_cooldown'; end if;
 perform doctor_private.revoke_codes(b.id);
 cid:=gen_random_uuid(); salt:=extensions.gen_random_bytes(16); expires:=clock_timestamp()+interval '5 minutes';
 insert into doctor_private.arrival_challenges(id,booking_id,assignment_id,doctor_profile_id,issued_to_profile_id,salt,code_hmac,expires_at)
 values(cid,b.id,a.id,a.assigned_profile_id,actor,salt,
  doctor_private.code_digest(salt,b.id,a.id,a.assigned_profile_id,doctor_private.derive_code(cid,salt)),expires);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.arrival_code_issued','booking',b.id);
 perform booking_private.record_request(actor,'p5.doctor.issue_arrival',p_request_key,h,cid,null);
 return jsonb_build_object('code',doctor_private.derive_code(cid,salt),'expires_at',expires);
end $$;

-- Replayed verification outcome for one recorded request (success: booking version; failure:
-- the stored attempts left).
create function doctor_private.verify_replayed(p_result_id uuid, p_result_version integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when p_result_version is not null then jsonb_build_object('verified',true,'version',p_result_version)
  else (select jsonb_build_object('verified',false,'attempts_remaining',f.attempts_remaining) from doctor_private.verify_failures f where f.id=p_result_id) end;
$$;

-- Assigned doctor only. Success moves arrived -> arrival_verified and returns the new
-- booking version. A wrong code returns verified=false with the attempts left.
create function public.verify_arrival_code(p_booking_id uuid, p_code text, p_expected_version integer, p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; rid uuid; rver integer; b public.bookings; v public.doctor_visits;
 c doctor_private.arrival_challenges; result integer; event uuid; failure uuid; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646
 or p_code is null or p_code !~ '^[0-9]{6}$' then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_code,p_expected_version));
 select r.result_id,r.result_version into rid,rver from booking_private.replay(actor,'p5.doctor.verify_arrival',p_request_key,h) r;
 if rid is not null then return doctor_private.verify_replayed(rid,rver); end if;
 if not doctor_private.assignee(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into v from public.doctor_visits where booking_id=b.id for update;
 select r.result_id,r.result_version into rid,rver from booking_private.replay(actor,'p5.doctor.verify_arrival',p_request_key,h) r;
 if rid is not null then return doctor_private.verify_replayed(rid,rver); end if;
 if not doctor_private.assignee(b.id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if v.booking_id is null or v.substate<>'arrived' then raise exception using errcode='55000',message='invalid_transition'; end if;
 select * into c from doctor_private.arrival_challenges where booking_id=b.id and status='active' for update;
 if not found or c.doctor_profile_id<>actor or c.assignment_id<>v.assignment_id then
  raise exception using errcode='55000',message='arrival_code_required'; end if;
 if c.expires_at<=clock_timestamp() then raise exception using errcode='55000',message='arrival_code_expired'; end if;
 if not doctor_private.ct_equal(doctor_private.code_digest(c.salt,b.id,c.assignment_id,actor,p_code),c.code_hmac) then
  update doctor_private.arrival_challenges set attempts=attempts+1,
   status=case when attempts+1>=5 then 'exhausted' else 'active' end,
   ended_at=case when attempts+1>=5 then clock_timestamp() end
   where id=c.id;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id)
   values(actor,case when c.attempts+1>=5 then 'booking.arrival_code_exhausted' else 'booking.arrival_code_failed' end,'booking',b.id);
  insert into doctor_private.verify_failures(challenge_id,booking_id,actor_profile_id,attempts_remaining)
   values(c.id,b.id,actor,5-(c.attempts+1)) returning id into failure;
  perform booking_private.record_request(actor,'p5.doctor.verify_arrival',p_request_key,h,failure,null);
  return jsonb_build_object('verified',false,'attempts_remaining',5-(c.attempts+1));
 end if;
 update doctor_private.arrival_challenges set status='consumed',ended_at=clock_timestamp() where id=c.id;
 perform doctor_private.end_arrival(b.id);
 result:=booking_private.transition(b.id,'confirmed','arrival_verified',p_request_key);
 update public.doctor_visits set substate='arrival_verified' where booking_id=b.id;
 select e.id into event from public.booking_events e where e.booking_id=b.id and e.aggregate_version=result;
 perform booking_private.record_request(actor,'p5.doctor.verify_arrival',p_request_key,h,event,result);
 return jsonb_build_object('verified',true,'version',result);
end $$;

-- Fallback step 1: an independent ops holder opens it (never the doctor, provider staff,
-- patient or requester; shared ops_actor). Returns the fallback id and its expiry.
create function public.open_arrival_fallback(p_booking_id uuid, p_expected_version integer, p_reason text, p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; rid uuid; b public.bookings; v public.doctor_visits;
 a public.booking_assignments; fid uuid; expires timestamptz; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 if p_reason is null or p_reason not in ('code_lockout','code_unavailable') then raise exception using errcode='22023',message='invalid_reason'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version,p_reason));
 select r.result_id into rid from booking_private.replay(actor,'p5.doctor.arrival_fallback_open',p_request_key,h) r;
 if rid is not null then return (select jsonb_build_object('id',f.id,'expires_at',f.expires_at) from doctor_private.arrival_fallbacks f where f.id=rid); end if;
 if not booking_private.ops_actor(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 if booking_private.gate_state('doctor_arrival_fallback')<>'on' then raise exception using errcode='55000',message='feature_unavailable'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into v from public.doctor_visits where booking_id=b.id for update;
 perform 1 from doctor_private.arrival_fallbacks where booking_id=b.id for update;
 perform 1 from public.admin_capabilities where profile_id=actor and capability='booking:incident' for share;
 select r.result_id into rid from booking_private.replay(actor,'p5.doctor.arrival_fallback_open',p_request_key,h) r;
 if rid is not null then return (select jsonb_build_object('id',f.id,'expires_at',f.expires_at) from doctor_private.arrival_fallbacks f where f.id=rid); end if;
 if not booking_private.ops_actor(b.id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 if booking_private.gate_state('doctor_arrival_fallback')<>'on' then raise exception using errcode='55000',message='feature_unavailable'; end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.category<>'doctor' or b.state<>'confirmed' or clock_timestamp()>=b.end_at+interval '12 hours'
 or v.booking_id is null or v.substate<>'arrived' then raise exception using errcode='55000',message='invalid_transition'; end if;
 select * into a from public.booking_assignments where id=v.assignment_id and booking_id=b.id and status='active' and purpose='doctor_visit';
 if not found or a.assigned_profile_id is null then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_reason='code_lockout' and not exists(select 1 from doctor_private.arrival_challenges where booking_id=b.id and status='exhausted')
 and (select count(*) from doctor_private.arrival_challenges where booking_id=b.id)<4 then
  raise exception using errcode='55000',message='not_locked_out'; end if;
 update doctor_private.arrival_fallbacks set status='revoked',ended_at=clock_timestamp()
  where booking_id=b.id and status='pending' and expires_at<=clock_timestamp();
 if exists(select 1 from doctor_private.arrival_fallbacks where booking_id=b.id and status='pending') then
  raise exception using errcode='55000',message='fallback_open'; end if;
 if (select count(*) from doctor_private.arrival_fallbacks where booking_id=b.id)>=2 then
  raise exception using errcode='53300',message='arrival_fallback_limit'; end if;
 perform doctor_private.revoke_codes(b.id);
 expires:=clock_timestamp()+interval '10 minutes';
 insert into doctor_private.arrival_fallbacks(booking_id,assignment_id,doctor_profile_id,reason,opened_by_profile_id,expires_at)
 values(b.id,a.id,a.assigned_profile_id,p_reason,actor,expires) returning id into fid;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.arrival_fallback_opened','booking',b.id);
 perform booking_private.record_request(actor,'p5.doctor.arrival_fallback_open',p_request_key,h,fid,null);
 return jsonb_build_object('id',fid,'expires_at',expires);
end $$;

-- Fallback step 2: the patient confirms in their own session. Moves the visit to
-- arrival_verified with reason arrival_assisted and returns the new booking version.
create function public.confirm_arrival_fallback(p_booking_id uuid, p_expected_version integer, p_request_key uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior integer; b public.bookings; v public.doctor_visits;
 f doctor_private.arrival_fallbacks; result integer; event uuid; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_expected_version));
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.arrival_fallback_confirm',p_request_key,h) r;
 if prior is not null then return prior; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 if booking_private.gate_state('doctor_arrival_fallback')<>'on' then raise exception using errcode='55000',message='feature_unavailable'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into v from public.doctor_visits where booking_id=b.id for update;
 select * into f from doctor_private.arrival_fallbacks where booking_id=b.id and status='pending' for update;
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.arrival_fallback_confirm',p_request_key,h) r;
 if prior is not null then return prior; end if;
 if not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 if booking_private.gate_state('doctor_arrival_fallback')<>'on' then raise exception using errcode='55000',message='feature_unavailable'; end if;
 if b.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if b.category<>'doctor' or b.state<>'confirmed' or v.booking_id is null or v.substate<>'arrived' then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 if f.id is null or f.expires_at<=clock_timestamp() then raise exception using errcode='55000',message='arrival_fallback_required'; end if;
 if actor=f.opened_by_profile_id or actor=f.doctor_profile_id then raise exception using errcode='42501',message='forbidden'; end if;
 if f.assignment_id<>v.assignment_id or not exists(select 1 from public.booking_assignments where id=f.assignment_id and status='active') then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 update doctor_private.arrival_fallbacks set status='confirmed',confirmed_by_profile_id=actor,ended_at=clock_timestamp() where id=f.id;
 perform doctor_private.end_arrival(b.id);
 result:=booking_private.transition(b.id,'confirmed','arrival_assisted',p_request_key);
 update public.doctor_visits set substate='arrival_verified' where booking_id=b.id;
 select e.id into event from public.booking_events e where e.booking_id=b.id and e.aggregate_version=result;
 perform booking_private.record_request(actor,'p5.doctor.arrival_fallback_confirm',p_request_key,h,event,result);
 return result;
end $$;

revoke all on all functions in schema doctor_private from public, anon, authenticated, service_role;
revoke all on all tables in schema doctor_private from public, anon, authenticated, service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.issue_arrival_code(uuid,uuid)','public.verify_arrival_code(uuid,text,integer,uuid)',
  'public.open_arrival_fallback(uuid,integer,text,uuid)','public.confirm_arrival_fallback(uuid,integer,uuid)']::regprocedure[] loop
  execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
commit;
