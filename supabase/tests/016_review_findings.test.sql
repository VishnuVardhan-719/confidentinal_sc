\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
-- M2: the hourly expiry job exists exactly once wherever pg_cron is installed.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform pg_temp.assert_true((select count(*)=1 from cron.job where jobname='i02h-expire-due-providers'
   and schedule='17 * * * *' and command='select public.expire_due_providers()'),'M2 expiry job scheduled once');
  perform pg_temp.assert_true(current_database()=coalesce(current_setting('cron.database_name',true),'postgres'),'M2 pg_cron only in cron database');
 end if;
end $$;
-- M3: service_role keeps read access but cannot write the Q06 ledgers/tables.
do $$ declare t text; p text; begin
 foreach t in array array['provider_verification_cases','staff_credential_documents','staff_credential_events'] loop
  perform pg_temp.assert_true(has_table_privilege('service_role','public.'||t,'SELECT'),'M3 '||t||' service_role read kept');
  foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'] loop
   perform pg_temp.assert_true(not has_table_privilege('service_role','public.'||t,p),'M3 '||t||' service_role '||p||' revoked');
  end loop;
 end loop;
end $$;
-- Q06 fixture: organization provider, staff member b1..05, case created by owner b1..02.
insert into public.organizations(id,name) values ('b8000000-0000-4000-8000-000000000001','Synthetic review findings organization');
insert into public.organization_members(organization_id,profile_id,membership_role,status,accepted_at,scopes) values
 ('b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','owner','active',now(),array['provider:read','provider:manage','evidence:manage','schedule:manage']),
 ('b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005','staff','active',now(),array['provider:read']);
update public.providers set individual_owner_profile_id=null,organization_id='b8000000-0000-4000-8000-000000000001' where id='b3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select public.add_staff_credential_case('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005') as staff_case \gset
reset role;
set local role service_role;
select pg_temp.expect_state(format('insert into public.staff_credential_events(case_id,actor_profile_id,to_state,reason,aggregate_version) values(%L,''b1000000-0000-4000-8000-000000000004'',''approved'',''forged'',99)',:'staff_case'),'42501','M3 service_role cannot forge staff events');
select pg_temp.expect_state(format('update public.provider_verification_cases set state=''approved'' where id=%L',:'staff_case'),'42501','M3 service_role cannot approve a case');
select pg_temp.expect_state(format('delete from public.staff_credential_documents where case_id=%L',:'staff_case'),'42501','M3 service_role cannot delete staff documents');
reset role;
-- M4: 50 superseded/rejected rows do not count toward the cap; 50 live rows do.
insert into public.staff_credential_documents(id,case_id,uploaded_by_profile_id,kind,object_name,content_type,status,expires_at)
 select g.id,:'staff_case',  'b1000000-0000-4000-8000-000000000005','registration','staff/'||:'staff_case'||'/'||g.id::text||'.pdf','application/pdf',
 case when g.n%2=0 then 'superseded' else 'rejected' end,now()+interval '1 year'
 from (select gen_random_uuid() id,n from generate_series(1,50) n) g;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000005","aal":"aal2"}',true);
select public.add_staff_credential_document(:'staff_case','application/pdf',now()+interval '1 year',1) as document \gset
select pg_temp.assert_true((:'document'::jsonb->>'version')::int=2,'M4 upload allowed after 50 dead documents');
reset role;
insert into public.staff_credential_documents(id,case_id,uploaded_by_profile_id,kind,object_name,content_type,status,expires_at)
 select g.id,:'staff_case','b1000000-0000-4000-8000-000000000005','registration','staff/'||:'staff_case'||'/'||g.id::text||'.pdf','application/pdf',
 'verified',now()+interval '1 year'
 from (select gen_random_uuid() id from generate_series(1,49)) g;
set local role authenticated;
select pg_temp.expect_state(format('select public.add_staff_credential_document(%L,''application/pdf'',now()+interval ''1 year'',2)',:'staff_case'),'53300','M4 cap still holds at 50 live documents');
reset role;
-- M7: get_booking exposes the public provider reference, never the provider UUID.
update public.providers set individual_owner_profile_id='b1000000-0000-4000-8000-000000000002',organization_id=null where id='b3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',date_trunc('day',now())+interval '2 days 4 hours',gen_random_uuid()) as booking \gset
select public.get_booking(:'booking') as patient_view \gset
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select public.get_booking(:'booking') as provider_view \gset
reset role;
select pg_temp.assert_true(not (:'patient_view'::jsonb ? 'provider_id') and not (:'provider_view'::jsonb ? 'provider_id'),'M7 provider UUID not returned');
select pg_temp.assert_true(:'patient_view'::jsonb->>'provider_reference'=(select public_reference from public.providers where id='b3000000-0000-4000-8000-000000000001')
 and :'provider_view'::jsonb->>'provider_reference'=(select public_reference from public.providers where id='b3000000-0000-4000-8000-000000000001'),'M7 public provider reference returned');
select pg_temp.assert_true(position('b3000000-0000-4000-8000-000000000001' in :'patient_view')=0,'M7 patient view has no provider UUID anywhere');
\echo 1..1
\echo ok 1 - review_findings
rollback;
