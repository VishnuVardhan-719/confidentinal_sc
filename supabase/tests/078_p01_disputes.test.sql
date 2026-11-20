\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(false); v integer; n integer; begin
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.dispute_payment(%L,''other'',%s,gen_random_uuid())',b,pg_temp.p01_version(b)),'55000','no delivery or claim');
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
 perform public.advance_visit(b,'service_completed',(select version from public.bookings where id=b));
 perform pg_temp.p01_finance();
 for n in 1..3 loop
  perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
  perform public.dispute_payment(b,'other',pg_temp.p01_version(b),gen_random_uuid());
  perform pg_temp.expect_state(format('select public.dispute_payment(%L,''other'',%s,gen_random_uuid())',b,pg_temp.p01_version(b)),'55000','one open dispute');
  perform pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
  perform public.resolve_dispute(pg_temp.p01_payment(b),'other',pg_temp.p01_version(b),gen_random_uuid());
 end loop;
 perform pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
 perform pg_temp.expect_state(format('select public.dispute_payment(%L,''other'',%s,gen_random_uuid())',b,pg_temp.p01_version(b)),'55000','three lifetime cap');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 078_p01_disputes.test
rollback;
