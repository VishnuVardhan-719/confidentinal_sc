-- DC extras 4/5 / Kiro / feat/DC-extras / base integ/all bed2877.
-- Design §6: DC12 privacy-safe QR proof of visit. Synthetic local/staging only.
-- Authored, DB NOT EXECUTED.
--
-- The token is 32 random bytes in base64url (43 characters). Only sha256(token) is stored;
-- the plaintext is returned once to the issuing patient. The token holds no booking id,
-- patient id, OTP or health data. The QR encodes https://surecurevisit.in/proof#<token>, so the
-- token sits in the URL fragment, which browsers never send to a server; the page posts it to
-- POST /api/visit-proofs/verify. The guest check returns {valid:false} for every failure
-- (malformed, unknown, expired, revoked, booking no longer completed) and on success only
-- {valid, visit_date, service}. No audit row is written for the guest check (no actor).
begin;

do $$ declare obj text; begin
 foreach obj in array array['dcx_private.require_feature(text,text)','booking_private.patient(uuid,text)'] loop
  if to_regprocedure(obj) is null then raise exception 'DC extras 002430 preflight: missing %',obj; end if;
 end loop;
end $$;
-- gen_random_bytes(); Supabase ships pgcrypto in `extensions`. No-op when present.
create extension if not exists pgcrypto with schema extensions;

create table dcx_private.visit_proof_tokens (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete restrict,
 token_hash bytea not null unique check (octet_length(token_hash)=32),
 issued_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 issued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 revoked_by_profile_id uuid references public.profiles(id) on delete restrict,
 check (expires_at>issued_at and expires_at<=issued_at+interval '720 hours'),
 check ((revoked_at is null)=(revoked_by_profile_id is null))
);
create index dcx_proof_booking on dcx_private.visit_proof_tokens(booking_id,expires_at);
-- Only one change is ever allowed: revocation, once.
create function dcx_private.guard_proof() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_proof'; end if;
 if old.revoked_at is not null or new.revoked_at is null
 or (to_jsonb(new)-'revoked_at'-'revoked_by_profile_id') is distinct from (to_jsonb(old)-'revoked_at'-'revoked_by_profile_id') then
  raise exception using errcode='55000',message='immutable_proof'; end if;
 return new;
end $$;
create trigger dcx_proof_guard before update or delete on dcx_private.visit_proof_tokens for each row execute function dcx_private.guard_proof();
create trigger dcx_proof_no_truncate before truncate on dcx_private.visit_proof_tokens for each statement execute function booking_private.immutable();
alter table dcx_private.visit_proof_tokens enable row level security;
revoke all on dcx_private.visit_proof_tokens from public,anon,authenticated,service_role;

-- Patient with booking:create on a completed doctor visit. At most 3 live tokens per booking
-- (booking row lock serializes the count). A replay cannot return the plaintext again: it
-- returns token null and the route answers 409 proof_already_issued.
create function public.issue_visit_proof(p_booking_id uuid,p_ttl_hours integer,p_request_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior record; b public.bookings; raw bytea; token text;
 tid uuid; expires timestamptz; begin
 if p_booking_id is null or p_request_key is null or p_ttl_hours is null or p_ttl_hours not between 1 and 720 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_ttl_hours));
 select * into prior from booking_private.replay(actor,'dcx.proof.issue',p_request_key,h);
 if prior.result_id is not null then
  return jsonb_build_object('token_id',prior.result_id,'token',null,
   'expires_at',(select t.expires_at from dcx_private.visit_proof_tokens t where t.id=prior.result_id)); end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'doctor' or not booking_private.patient(b.patient_id,'booking:create') then
  raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_visit_proof','write');
 select * into b from public.bookings where id=p_booking_id for update;
 select * into prior from booking_private.replay(actor,'dcx.proof.issue',p_request_key,h);
 if prior.result_id is not null then
  return jsonb_build_object('token_id',prior.result_id,'token',null,
   'expires_at',(select t.expires_at from dcx_private.visit_proof_tokens t where t.id=prior.result_id)); end if;
 if not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_visit_proof','write');
 if b.state<>'completed' then raise exception using errcode='55000',message='invalid_transition'; end if;
 if (select count(*) from dcx_private.visit_proof_tokens t where t.booking_id=b.id and t.revoked_at is null and t.expires_at>clock_timestamp())>=3 then
  raise exception using errcode='53300',message='proof_limit'; end if;
 raw:=extensions.gen_random_bytes(32);
 token:=rtrim(translate(encode(raw,'base64'),'+/','-_'),'=');
 expires:=clock_timestamp()+p_ttl_hours*interval '1 hour';
 insert into dcx_private.visit_proof_tokens(booking_id,token_hash,issued_by_profile_id,expires_at)
  values(b.id,extensions.digest(convert_to(token,'UTF8'),'sha256'),actor,expires) returning id into tid;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'visit_proof.issued','booking',b.id);
 perform booking_private.record_request(actor,'dcx.proof.issue',p_request_key,h,tid,null);
 return jsonb_build_object('token_id',tid,'token',token,'expires_at',expires);
end $$;

-- Withdraw phase: never gated. Repeating a revocation returns the same row.
create function public.revoke_visit_proof(p_token_id uuid,p_request_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior record; t dcx_private.visit_proof_tokens; patient uuid; begin
 if p_token_id is null or p_request_key is null then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_token_id));
 select * into prior from booking_private.replay(actor,'dcx.proof.revoke',p_request_key,h);
 if prior.result_id is null then
  select b.patient_id into patient from dcx_private.visit_proof_tokens x join public.bookings b on b.id=x.booking_id where x.id=p_token_id;
  if patient is null or not booking_private.patient(patient,'booking:create') then raise exception using errcode='P0002',message='not_found'; end if;
  perform dcx_private.require_feature('doctor_visit_proof','withdraw');
  select * into t from dcx_private.visit_proof_tokens where id=p_token_id for update;
  if t.revoked_at is null then
   update dcx_private.visit_proof_tokens set revoked_at=clock_timestamp(),revoked_by_profile_id=actor where id=t.id;
   insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'visit_proof.revoked','booking',t.booking_id);
  end if;
  select * into prior from booking_private.replay(actor,'dcx.proof.revoke',p_request_key,h);
  if prior.result_id is null then perform booking_private.record_request(actor,'dcx.proof.revoke',p_request_key,h,t.id,null); end if;
 end if;
 select * into t from dcx_private.visit_proof_tokens where id=p_token_id;
 return jsonb_build_object('token_id',t.id,'revoked_at',t.revoked_at);
end $$;

create function public.list_visit_proofs(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; begin
 if p_booking_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 perform dcx_private.require_feature('doctor_visit_proof','read');
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'doctor' or not booking_private.patient(b.patient_id,'booking:read') then
  raise exception using errcode='P0002',message='not_found'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('token_id',t.id,'issued_at',t.issued_at,'expires_at',t.expires_at,'revoked_at',t.revoked_at,
   'status',case when t.revoked_at is not null then 'revoked' when t.expires_at<=clock_timestamp() then 'expired' else 'live' end)
   order by t.issued_at,t.id) from dcx_private.visit_proof_tokens t where t.booking_id=b.id),'[]'::jsonb);
end $$;

-- Guest check (anon and authenticated). Gate off raises feature_unavailable (route: 503).
create function public.verify_visit_proof(p_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; begin
 perform dcx_private.require_feature('doctor_visit_proof','read');
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('valid',false); end if;
 select bk.* into b from dcx_private.visit_proof_tokens t join public.bookings bk on bk.id=t.booking_id
  where t.token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256')
  and t.revoked_at is null and t.expires_at>clock_timestamp() and bk.category='doctor' and bk.state='completed';
 if b.id is null then return jsonb_build_object('valid',false); end if;
 return jsonb_build_object('valid',true,'visit_date',to_char((b.start_at at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD'),'service','doctor_home_visit');
end $$;

revoke all on all functions in schema dcx_private from public, anon, authenticated, service_role;
do $$ declare f text; begin
 foreach f in array array['public.issue_visit_proof(uuid,integer,uuid)','public.revoke_visit_proof(uuid,uuid)',
  'public.list_visit_proofs(uuid)','public.verify_visit_proof(text)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
grant execute on function public.verify_visit_proof(text) to anon;
notify pgrst, 'reload schema';
commit;
