\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _dcx_fixture.inc
-- DC12 privacy-safe QR proof of visit. DB NOT EXECUTED.
-- B1, B2 completed visits of P1 b1..01 with D1 b1..02; B3 still in progress.

select pg_temp.dcx_started(3) as ids \gset
select set_config('dcx.b1',(:'ids'::uuid[])[1]::text,true), set_config('dcx.b2',(:'ids'::uuid[])[2]::text,true),
 set_config('dcx.b3',(:'ids'::uuid[])[3]::text,true);
select pg_temp.dcx_complete((:'ids'::uuid[])[1]);
select pg_temp.dcx_complete((:'ids'::uuid[])[2]);
-- Distinct dates for B1 and B2, so the check proves which booking a token belongs to.
reset role;
-- Read the new start first: p5_shift alters bookings, which a subquery in the same statement holds open.
select start_at-interval '3 days' as b2_start from public.bookings where id=current_setting('dcx.b2')::uuid \gset
select pg_temp.p5_shift(current_setting('dcx.b2')::uuid,:'b2_start');

do $$ declare b1 uuid:=current_setting('dcx.b1')::uuid; b2 uuid:=current_setting('dcx.b2')::uuid; b3 uuid:=current_setting('dcx.b3')::uuid;
 j jsonb; t1 text; t2 text; id1 uuid; k uuid:=gen_random_uuid(); u uuid; d1 text; d2 text; begin
 d1:=to_char(((select start_at from public.bookings where id=b1) at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD');
 d2:=to_char(((select start_at from public.bookings where id=b2) at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD');
 perform pg_temp.assert_true(d1<>d2,'fixture dates differ');
 -- Issuance: patient only, completed visit only.
 foreach u in array array['b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003','e9000000-0000-4000-8000-000000000001']::uuid[] loop
  perform pg_temp.as_user(u);
  perform pg_temp.expect_state(format('select public.issue_visit_proof(%L,24,gen_random_uuid())',b1),'42501',u||' cannot issue');
 end loop;
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.issue_visit_proof(%L,24,gen_random_uuid())',b3),'55000','visit not completed');
 perform pg_temp.expect_state(format('select public.issue_visit_proof(%L,721,gen_random_uuid())',b1),'22023','lifetime over 30 days');
 j:=public.issue_visit_proof(b1,24,k);
 t1:=j->>'token'; id1:=(j->>'token_id')::uuid;
 -- (a) Opaque token; only its hash is stored; replay never returns the plaintext again.
 perform pg_temp.assert_true(t1 ~ '^[A-Za-z0-9_-]{43}$','43-character base64url token');
 perform pg_temp.assert_true(position(replace(b1::text,'-','') in t1)=0 and position(b1::text in t1)=0,'token does not contain the booking id');
 perform pg_temp.assert_true((select token_hash=extensions.digest(convert_to(t1,'UTF8'),'sha256') from dcx_private.visit_proof_tokens where id=id1),'stored as sha256');
 perform pg_temp.assert_true(not exists(select 1 from dcx_private.visit_proof_tokens t where position(convert_to(t1,'UTF8') in t.token_hash)>0),'plaintext not stored');
 perform pg_temp.assert_true(exists(select 1 from public.audit_events where target_id=b1 and action='visit_proof.issued'
  and actor_profile_id='b1000000-0000-4000-8000-000000000001'),'issuance audited with ids only');
 j:=public.issue_visit_proof(b1,24,k);
 perform pg_temp.assert_true((j->>'token_id')::uuid=id1 and j->'token'='null'::jsonb,'replay returns the id without the token');
 perform pg_temp.expect_state(format('select public.issue_visit_proof(%L,48,%L)',b1,k),'40001','same key, other lifetime');
 t2:=public.issue_visit_proof(b2,24,gen_random_uuid())->>'token';

 -- (e) Guest check: exactly valid, visit_date, service.
 perform set_config('request.jwt.claims','',true);
 j:=public.verify_visit_proof(t1);
 perform pg_temp.assert_true(pg_temp.keys(j)=array['service','valid','visit_date'] and (j->>'valid')::boolean and j->>'visit_date'=d1
  and j->>'service'='doctor_home_visit','guest check returns only the allowed facts');
 -- (d) A token for B1 answers only B1's date; B2's token answers B2's.
 perform pg_temp.assert_true(public.verify_visit_proof(t2)->>'visit_date'=d2 and public.verify_visit_proof(t1)->>'visit_date'<>d2,'tokens are booking-bound');
 perform pg_temp.assert_true(public.verify_visit_proof(substr(t1,1,42)||case when right(t1,1)='A' then 'B' else 'A' end)=jsonb_build_object('valid',false),
  'a changed token is invalid');
 perform pg_temp.assert_true(public.verify_visit_proof('short')=jsonb_build_object('valid',false),'malformed token is invalid');
 perform pg_temp.assert_true(public.verify_visit_proof(null)=jsonb_build_object('valid',false),'null token is invalid');
 perform pg_temp.assert_true(public.verify_visit_proof(repeat('A',43))=jsonb_build_object('valid',false),'unknown token is invalid');

 -- (c) Revocation: patient only, idempotent, ungated, invalidates the token.
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
 perform pg_temp.expect_state(format('select public.revoke_visit_proof(%L,gen_random_uuid())',id1),'P0002','doctor cannot revoke');
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.set_gate('off','doctor_visit_proof');
 j:=public.revoke_visit_proof(id1,gen_random_uuid());
 perform pg_temp.assert_true(j->>'revoked_at' is not null,'revocation works with the gate off');
 perform pg_temp.assert_true(public.revoke_visit_proof(id1,gen_random_uuid())->>'revoked_at'=j->>'revoked_at','second revocation returns the same row');
 perform pg_temp.set_gate('on','doctor_visit_proof');
 perform pg_temp.assert_true(public.verify_visit_proof(t1)=jsonb_build_object('valid',false),'revoked token is invalid');
 perform pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.list_visit_proofs(b1)) x where x->>'token_id'=id1::text and x->>'status'='revoked'),'list shows revoked');
 perform pg_temp.assert_true(position(t1 in public.list_visit_proofs(b1)::text)=0,'list never shows a token');
 perform pg_temp.as_user('e9000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.list_visit_proofs(%L)',b1),'P0002','other patient cannot list');

 -- Cap: 3 live tokens per booking (B2 has one).
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform public.issue_visit_proof(b2,24,gen_random_uuid());
 perform public.issue_visit_proof(b2,24,gen_random_uuid());
 perform pg_temp.expect_state(format('select public.issue_visit_proof(%L,24,gen_random_uuid())',b2),'53300','fourth live token');
end $$;

-- (b) Expiry: a token past expires_at is invalid (owner-path time move, guard switched off).
reset role;
alter table dcx_private.visit_proof_tokens disable trigger dcx_proof_guard;
update dcx_private.visit_proof_tokens set issued_at=issued_at-interval '2 days',expires_at=expires_at-interval '2 days' where booking_id=current_setting('dcx.b2')::uuid;
alter table dcx_private.visit_proof_tokens enable trigger dcx_proof_guard;
select pg_temp.assert_true((select count(*)=0 from dcx_private.visit_proof_tokens where booking_id=current_setting('dcx.b2')::uuid and expires_at>clock_timestamp()),
 'all B2 tokens expired');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.issue_visit_proof(current_setting('dcx.b2')::uuid,24,gen_random_uuid())->>'token' is not null,'expired tokens free the cap');

-- Guards and gate.
reset role;
select pg_temp.expect_state($$update dcx_private.visit_proof_tokens set expires_at=expires_at+interval '1 day'$$,'55000','only revocation may change a token');
select pg_temp.expect_state($$delete from dcx_private.visit_proof_tokens$$,'55000','tokens not deletable');
select pg_temp.expect_state($$truncate dcx_private.visit_proof_tokens$$,'55000','tokens not truncatable');
select pg_temp.set_gate('off','doctor_visit_proof');
select pg_temp.expect_state($$select public.verify_visit_proof(repeat('A',43))$$,'55000','guest check closed when the gate is off');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.issue_visit_proof(%L,24,gen_random_uuid())',current_setting('dcx.b1')),'55000','issuance closed when off');
-- Real anon role: execute allowed for the check only.
select pg_temp.set_gate('on','doctor_visit_proof');
select set_config('request.jwt.claims','',true);
set local role anon;
select pg_temp.assert_true(public.verify_visit_proof(repeat('A',43))=jsonb_build_object('valid',false),'anon can run the guest check');
select pg_temp.expect_state($$select public.list_visit_proofs(gen_random_uuid())$$,'42501','anon cannot list');
reset role;

\echo 1..1
\echo ok 1 - 123_dcx_visit_proof
rollback;
