\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
\ir _p01_fixture.inc
do $$ declare b uuid:=pg_temp.p01_book(false); c uuid; v integer; begin
 perform pg_temp.as_user('c1000000-0000-4000-8000-000000000009');
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','unassigned denied');
 c:=pg_temp.p01_report(b); v:=pg_temp.p01_version(b);
 perform pg_temp.assert_true(payments_private.collector_assignment_at(b,false,(select start_at-interval '60 minutes 1 microsecond' from public.bookings where id=b)) is null,'pre-window collector denied');
 perform pg_temp.assert_true(payments_private.collector_assignment_at(b,false,(select end_at+interval '12 hours' from public.bookings where id=b)) is null,'in-progress upper bound exclusive');
 perform pg_temp.assert_true((select state='due' and confirmed_paise=0 from public.payments where booking_id=b),'report never means paid');
 update public.organization_members set scopes=array['provider:read'] where profile_id='c1000000-0000-4000-8000-000000000002';
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','collector grant required');
 update public.organization_members set scopes=scopes||array['finance:collect'] where profile_id='c1000000-0000-4000-8000-000000000002';
 update public.resources set status='disabled' where id='c6000000-0000-4000-8000-000000000001';
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','disabled resource');
 update public.resources set status='active' where id='c6000000-0000-4000-8000-000000000001';
 update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000002';
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','disabled membership');
 update public.organization_members set status='active' where profile_id='c1000000-0000-4000-8000-000000000002';
 update public.staff_credential_documents set status='superseded' where case_id in (select id from public.provider_verification_cases
 where provider_id=pg_temp.p5_provider('doctor') and subject_profile_id=auth.uid()) and status='verified';
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','Q06 current staff credential required');
 update public.staff_credential_documents set status='verified' where case_id in (select id from public.provider_verification_cases
 where provider_id=pg_temp.p5_provider('doctor') and subject_profile_id=auth.uid()) and status='superseded';
 update public.booking_assignments set assigned_profile_id='c1000000-0000-4000-8000-000000000003' where booking_id=b;
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','assignment identity mismatch');
 update public.booking_assignments set assigned_profile_id='c1000000-0000-4000-8000-000000000002',status='replaced',ended_at=clock_timestamp() where booking_id=b;
 perform pg_temp.expect_state(format('select public.report_collection(%L,1,''cash'',null,gen_random_uuid())',b),'42501','replaced assignment denied');
 perform pg_temp.assert_true(pg_temp.p01_version(b)=v,'denials write nothing');
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 073_p01_collectors.test
rollback;
