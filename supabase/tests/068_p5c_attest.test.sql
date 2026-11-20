\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p5c_fixture.inc
-- Patient attestation. Design §6.3 attest_care, T26; contract §10.1 (closeout phase), §13.

create function pg_temp.msg(p_statement text) returns text language plpgsql as $$
declare m text; begin
 begin execute p_statement; exception when others then get stacked diagnostics m=message_text; return m; end;
 return 'ok';
end $$;

select pg_temp.c_live(2,-interval '10 minutes') as b \gset
-- Before the end.
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('attest_care',:'b','confirmed'))='invalid_transition','before start');
select pg_temp.c_start(:'b');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('attest_care',:'b','confirmed'))='invalid_transition','during the session');
select pg_temp.c_end(:'b');
select version as booking_v,state as booking_state from public.bookings where id=:'b' \gset
-- Only the patient.
select set_config('p5c.b',:'b',true);
do $$ declare who uuid; b uuid:=current_setting('p5c.b')::uuid; begin
 foreach who in array array['c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000009']::uuid[] loop
  perform pg_temp.as_user(who);
  perform pg_temp.expect_state(pg_temp.c_cmd('attest_care',b,'confirmed'),'42501','attest by '||who);
 end loop;
end $$;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.attest_care(%L,''maybe'',%s,gen_random_uuid())',:'b',pg_temp.c_pv(:'b')),'22023','unknown decision');
select pg_temp.expect_state(format('select public.attest_care(%L,''confirmed'',%s,gen_random_uuid())',:'b',pg_temp.c_pv(:'b')-1),'40001','stale plan version');
-- A dispute is recorded only.
select pg_temp.c_pv(:'b') as pv \gset
select pg_temp.assert_true(public.attest_care(:'b','disputed',:pv,'f1000000-0000-4000-8000-000000000001')=:pv+1,'patient disputes');
select pg_temp.assert_true((select attestation='disputed' and attested_at is not null from public.care_plans where booking_id=:'b'),'dispute stored');
select pg_temp.assert_true((select version=:booking_v and state=:'booking_state' from public.bookings where id=:'b'),'booking state and version unchanged');
select pg_temp.assert_true(not exists(select 1 from public.booking_events where booking_id=:'b' and aggregate_version>:booking_v),'no booking event');
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'b' and action='care.attested' and actor_profile_id='b1000000-0000-4000-8000-000000000001'),'attestation audited');
-- Replay returns the original; a second statement is refused.
select pg_temp.assert_true(public.attest_care(:'b','disputed',:pv,'f1000000-0000-4000-8000-000000000001')=:pv+1,'replay');
select pg_temp.expect_state(format('select public.attest_care(%L,''confirmed'',%s,''f1000000-0000-4000-8000-000000000001'')',:'b',:pv),'40001','same key, changed decision');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('attest_care',:'b','confirmed'))='invalid_transition','second attestation');

-- Seven-day window from the reported end; interrupted sessions can be attested too.
select pg_temp.c_live(3,-interval '10 minutes') as late \gset
select pg_temp.c_start(:'late');
select pg_temp.c_interrupt(:'late','patient_request_end');
select pg_temp.c_shift_plan(:'late',-interval '8 days');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(pg_temp.msg(pg_temp.c_cmd('attest_care',:'late','confirmed'))='invalid_transition','after 7 days');
select pg_temp.c_shift_plan(:'late',interval '2 days');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(pg_temp.c_attest(:'late','confirmed')>0,'interrupted session attested inside the window');
-- Closeout phase: allowed under every gate state.
select pg_temp.c_live(4,-interval '10 minutes') as g \gset
select pg_temp.c_start(:'g');
select pg_temp.c_end(:'g');
update booking_private.feature_gates set state='suspended' where key='caretaker';
select pg_temp.assert_true(pg_temp.c_attest(:'g','confirmed')>0,'attest with the gate suspended');
update booking_private.feature_gates set state='on' where key='caretaker';
\echo 1..1
\echo ok 1 - 068_p5c_attest
rollback;
