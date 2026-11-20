\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
-- Authored, DB NOT EXECUTED. No domain fixture: verify fresh OFF seeds.
select pg_temp.assert_true((select count(*)=4 from booking_private.feature_gates where key like 'notify_%' and state='off'),'four N01 gates seeded off');
do $$ declare t record; r text; privilege text; f record; allowed boolean; begin
 for t in select c.oid,n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and (n.nspname='notify_private' or (n.nspname='public' and c.relname in ('notifications','notification_preferences'))) loop
  perform pg_temp.assert_true(t.relrowsecurity,'RLS '||t.relname);
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    allowed:=r='authenticated' and t.nspname='public' and privilege='SELECT';
    perform pg_temp.assert_true(has_table_privilege(r,t.oid,privilege)=allowed,r||' '||privilege||' '||t.relname);
   end loop;
  end loop;
 end loop;
 for f in select p.oid,p.proname,p.prosecdef,p.proconfig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('notify_private','notify_worker') or (n.nspname='public' and p.proname in ('mark_notifications_read','mark_all_notifications_read','set_notification_preference','list_notification_failures')) loop
  perform pg_temp.assert_true(f.prosecdef and f.proconfig @> array['search_path=""'],'definer and empty search path '||f.proname);
  foreach r in array array['anon','authenticated','service_role'] loop
   allowed:=(f.nspname='public' and r='authenticated') or (f.nspname='notify_worker' and f.proname in ('claim','complete') and r='service_role');
   perform pg_temp.assert_true(has_function_privilege(r,f.oid,'EXECUTE')=allowed,'execute '||r||' '||f.proname);
  end loop;
 end loop;
 perform pg_temp.assert_true(has_schema_privilege('service_role','notify_worker','USAGE'),'worker usage');
 perform pg_temp.assert_true(not has_schema_privilege('authenticated','notify_worker','USAGE') and not has_schema_privilege('service_role','notify_private','USAGE'),'private schema isolation');
end $$;
\ir _n01_fixture.inc
select pg_temp.n01_event('doctor','confirmed','accepted','confirmed') as ev \gset
select notify_worker.expand(500);
do $$ declare k text; n public.notifications; begin
 select * into strict n from public.notifications where recipient_profile_id='b1000000-0000-4000-8000-000000000001';
 foreach k in array array['name','address','phone','service_id'] loop
  perform pg_temp.expect_state(format('insert into public.notifications(recipient_profile_id,event_id,rule_id,template_key,template_version,priority,params) values(%L,%L,%L,%L,1,''routine'',%L::jsonb)',
   n.recipient_profile_id,n.event_id,n.rule_id,'bad.'||k,jsonb_build_object(k,'Synthetic sensitive value')),'23514','PII key '||k);
 end loop;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 100_n01_schema_grants
rollback;
