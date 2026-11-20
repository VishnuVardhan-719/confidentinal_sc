\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(false); i uuid; n integer; begin
 -- Started doctor stuck after suspension: immutable scheduled end anchors intake.
 perform pg_temp.p01_suspend();
 perform pg_temp.assert_true(payments_private.collector_assignment_at(b,true,(select end_at+interval '72 hours' from public.bookings where id=b)) is null,'stuck visit scheduled upper bound exclusive');
 perform pg_temp.assert_true(payments_private.collector_assignment_at(b,true,(select end_at+interval '72 hours'-interval '1 microsecond' from public.bookings where id=b)) is not null,'stuck visit before bounded deadline');
 i:=public.report_collection_exception(b,10000,'cash',null,gen_random_uuid());
 perform pg_temp.assert_true((select report_deadline is null from public.payments where booking_id=b),'in-progress intake never creates terminal deadline');
 perform pg_temp.p01_finance();
 for n in 1..3 loop
  perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
  perform public.review_collection_intake(i,'dismiss','other',pg_temp.p01_version(b),gen_random_uuid());
  perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
  if n<3 then i:=public.report_collection_exception(b,10000,'cash',null,gen_random_uuid()); end if;
 end loop;
 perform pg_temp.expect_state(format('select public.report_collection_exception(%L,1,''cash'',null,gen_random_uuid())',b),'53300','three lifetime intakes');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
 perform pg_temp.expect_state(format('select public.report_collection_exception(%L,1,''cash'',null,gen_random_uuid())',b),'42501','unassigned intake denied');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 update public.profiles set status='disabled' where id=auth.uid();
 perform pg_temp.expect_state(format('select public.report_collection_exception(%L,1,''cash'',null,gen_random_uuid())',b),'42501','disabled reporter denied');
end $$;
-- Canonical provider-expiry fixture, distinct from suspension. No booking state,
-- assignment, event or report deadline is forged or guard disabled.
update public.providers set status='active' where id=pg_temp.p5_provider('doctor');
do $$ declare b uuid:=pg_temp.p01_book(true,'c1000000-0000-4000-8000-000000000003'); i uuid; begin
 update public.providers set verification_state='expired',status='inactive' where id=pg_temp.p5_provider('doctor');
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','expired provider ordinary report denied');
 i:=public.report_collection_exception(b,50001,'cash',null,gen_random_uuid());
 perform pg_temp.assert_true((select status='pending' from payments_private.collection_intakes where id=i),'expiry preserves historical claim');
 update public.providers set verification_state='approved',status='active' where id=pg_temp.p5_provider('doctor');
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'22023','reinstatement does not double reserve pending intake');
 perform pg_temp.assert_true((select status='pending' from payments_private.collection_intakes where id=i),'reinstatement never auto converts');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 089_p01_intake_boundaries.test
rollback;
