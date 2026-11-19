-- P5 doctor block: DC02 arrival code / Kiro / feat/S01-doctor-core / base integ/all f549ad3.
-- Sources: docs/specs/BOOKING_AND_CONSULTATION.md (arrival OTP steps 1-6),
-- docs/CANONICAL_SCHEMA_DRAFT.md (challenge storage), docs/SOURCE_AUDIT_R01.md MR-20 (limits),
-- shared contract §10 (gate phases) and §13 (replay).
-- The P5 design deferred DC02 to Phase 7 (DQ-07); this ticket's brief puts it in core.
-- Flow: doctor reports `arrived` -> the patient (only) asks for a code -> the doctor types
-- the code the patient reads out in person -> substate `arrival_verified` -> only then may
-- the doctor start the visit. Emergencies never wait for a code: interruption is allowed
-- from `arrived` and `arrival_verified` without one.
-- Storage: six random digits (unbiased), HMAC-SHA256 with a per-database key and a
-- per-challenge salt, bound to booking + assignment + doctor; no plaintext is stored,
-- logged, audited or sent to the outbox. Limits (MR-20): valid 5 minutes, 5 wrong
-- attempts per code, 3 regenerations per visit (4 codes total), 60 s between codes.
-- Comparison is constant time over the 32-byte digest. Wrong codes are counted and
-- audited by returning a result instead of raising, so the count is not rolled back.
-- Gate: both commands are the `start` phase (contract §10.1): allowed while the doctor gate
-- is on or off for accepted work, refused while suspended.
-- Replay: verify_arrival_code is keyed (contract §13, action p5.doctor.verify_arrival); only a
-- successful verification is recorded, so a retried wrong code counts again. issue_arrival_code
-- is deliberately not keyed: a replay could not return the code (no plaintext is kept), and a
-- retry is a new code under the 60 s cooldown.
-- Not built: the support-assisted two-party fallback (needs an approved procedure).
begin;

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
 check (status<>'exhausted' or attempts=5)
);
create unique index p5d_challenge_active on doctor_private.arrival_challenges(booking_id) where status='active';
create index p5d_challenge_booking on doctor_private.arrival_challenges(booking_id,issued_at);
alter table doctor_private.arrival_key enable row level security;
alter table doctor_private.arrival_challenges enable row level security;

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

-- 2^32 rounded down to a multiple of 10^6; rejection keeps all codes equally likely.
create function doctor_private.random_code() returns text language plpgsql volatile set search_path='' as $$
declare n bigint; begin
 loop
  n:=('x'||lpad(encode(extensions.gen_random_bytes(4),'hex'),16,'0'))::bit(64)::bigint;
  exit when n<4294000000;
 end loop;
 return lpad((n%1000000)::text,6,'0');
end $$;

-- Every doctor step that ends the visit or the doctor's access revokes a live code. Assignment
-- and reservation handling is the shared finish_assignments/assignee_finish (contract §12).
create function doctor_private.revoke_codes(booking uuid) returns void language sql security definer set search_path='' as $$
 update doctor_private.arrival_challenges set status='revoked',ended_at=clock_timestamp() where booking_id=booking and status='active';
$$;

-- Patient only. Returns the plaintext code once; the caller shows it to the patient.
create function public.issue_arrival_code(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; v public.doctor_visits; a public.booking_assignments;
 code text; salt bytea; expires timestamptz; begin
 if p_booking_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 select * into b from public.bookings where id=p_booking_id for update;
 if not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 if b.category<>'doctor' or b.state<>'confirmed' or clock_timestamp()>=b.end_at+interval '12 hours' then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 select * into v from public.doctor_visits where booking_id=b.id for update;
 if not found or v.substate<>'arrived' then raise exception using errcode='55000',message='invalid_transition'; end if;
 select * into a from public.booking_assignments where id=v.assignment_id and booking_id=b.id and status='active' and purpose='doctor_visit';
 if not found or a.assigned_profile_id is null then raise exception using errcode='55000',message='invalid_transition'; end if;
 perform 1 from doctor_private.arrival_challenges where booking_id=b.id for update;
 if (select count(*) from doctor_private.arrival_challenges where booking_id=b.id)>=4 then
  raise exception using errcode='53300',message='arrival_code_limit'; end if;
 if exists(select 1 from doctor_private.arrival_challenges where booking_id=b.id and issued_at>clock_timestamp()-interval '60 seconds') then
  raise exception using errcode='53300',message='arrival_code_cooldown'; end if;
 perform doctor_private.revoke_codes(b.id);
 code:=doctor_private.random_code(); salt:=extensions.gen_random_bytes(16); expires:=clock_timestamp()+interval '5 minutes';
 insert into doctor_private.arrival_challenges(booking_id,assignment_id,doctor_profile_id,issued_to_profile_id,salt,code_hmac,expires_at)
 values(b.id,a.id,a.assigned_profile_id,actor,salt,doctor_private.code_digest(salt,b.id,a.id,a.assigned_profile_id,code),expires);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'booking.arrival_code_issued','booking',b.id);
 return jsonb_build_object('code',code,'expires_at',expires);
end $$;

-- Assigned doctor only. Success moves arrived -> arrival_verified and returns the new
-- booking version. A wrong code returns verified=false with the attempts left.
create function public.verify_arrival_code(p_booking_id uuid, p_code text, p_expected_version integer, p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior integer; b public.bookings; v public.doctor_visits;
 c doctor_private.arrival_challenges; result integer; event uuid; begin
 if p_booking_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646
 or p_code is null or p_code !~ '^[0-9]{6}$' then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_code,p_expected_version));
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.verify_arrival',p_request_key,h) r;
 if prior is not null then return jsonb_build_object('verified',true,'version',prior); end if;
 if not doctor_private.assignee(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.require_gate('doctor','start');
 select * into b from public.bookings where id=p_booking_id for update;
 perform booking_private.lock_provider(b.provider_id);
 perform 1 from public.resources where id in(select resource_id from public.booking_assignments where booking_id=b.id and status='active') order by id for update;
 select * into v from public.doctor_visits where booking_id=b.id for update;
 select r.result_version into prior from booking_private.replay(actor,'p5.doctor.verify_arrival',p_request_key,h) r;
 if prior is not null then return jsonb_build_object('verified',true,'version',prior); end if;
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
  return jsonb_build_object('verified',false,'attempts_remaining',5-(c.attempts+1));
 end if;
 update doctor_private.arrival_challenges set status='consumed',ended_at=clock_timestamp() where id=c.id;
 result:=booking_private.transition(b.id,'confirmed','arrival_verified',p_request_key);
 update public.doctor_visits set substate='arrival_verified' where booking_id=b.id;
 select e.id into event from public.booking_events e where e.booking_id=b.id and e.aggregate_version=result;
 perform booking_private.record_request(actor,'p5.doctor.verify_arrival',p_request_key,h,event,result);
 return jsonb_build_object('verified',true,'version',result);
end $$;

revoke all on all functions in schema doctor_private from public, anon, authenticated, service_role;
revoke all on all tables in schema doctor_private from public, anon, authenticated, service_role;
revoke all on function public.issue_arrival_code(uuid) from public, anon, authenticated, service_role;
revoke all on function public.verify_arrival_code(uuid,text,integer,uuid) from public, anon, authenticated, service_role;
grant execute on function public.issue_arrival_code(uuid) to authenticated;
grant execute on function public.verify_arrival_code(uuid,text,integer,uuid) to authenticated;
commit;
