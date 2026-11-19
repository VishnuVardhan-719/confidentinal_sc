\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(); k uuid:=gen_random_uuid(); c uuid; v integer; begin
 c:=pg_temp.p01_report(b,10000,k); v:=pg_temp.p01_version(b);
 perform pg_temp.assert_true(public.report_collection(b,10000,'cash',null,k)=c,'same payload returns same id');
 perform pg_temp.assert_true(pg_temp.p01_version(b)=v,'replay no bump');
 perform pg_temp.expect_state(format('select public.report_collection(%L,9999,''cash'',null,%L)',b,k),'40001','key input mismatch');
 delete from public.idempotency_requests where actor_profile_id=auth.uid() and action='payment.collect' and request_key=k;
 perform pg_temp.assert_true(public.report_collection(b,10000,'cash',null,k)=c,'permanent collection key after replay cleanup');
 update public.organization_members set scopes=array['provider:read'] where profile_id=auth.uid();
 perform pg_temp.expect_state(format('select public.report_collection(%L,10000,''cash'',null,%L)',b,k),'42501','replay reauthorizes');
 perform pg_temp.assert_true((select count(*)=1 from public.payment_collections where payment_id=pg_temp.p01_payment(b)),'one collection after replay');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 077_p01_replay.test
rollback;
