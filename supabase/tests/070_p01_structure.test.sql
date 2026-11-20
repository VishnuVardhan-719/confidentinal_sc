\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
-- Structural suite intentionally needs no domain fixture.
select pg_temp.assert_true(to_regclass('public.payments') is not null,'P01 schema exists');
do $$ declare t record; r text; privilege text; begin
 for t in select c.oid,n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and (n.nspname in ('payments_private','payments_worker') or
 (n.nspname='public' and c.relname in ('payments','payment_collections','payment_events','payment_transitions','payment_exceptions'))) loop
  perform pg_temp.assert_true(t.relrowsecurity,'RLS '||t.relname);
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    perform pg_temp.assert_true(not has_table_privilege(r,t.oid,privilege),r||' denied '||privilege||' '||t.relname);
   end loop;
  end loop;
 end loop;
 for t in select p.oid,p.proname,p.proconfig,n.nspname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('payments_private','payments_worker') loop
  perform pg_temp.assert_true(t.proconfig @> array['search_path=""'] and t.prosecdef,'definer with empty search path '||t.proname);
  if t.nspname='payments_private' and t.proname not in ('patient_reader','finance_reader','collector_reader') then
   perform pg_temp.assert_true(not has_function_privilege('authenticated',t.oid,'EXECUTE'),'private execution denied '||t.proname);
  end if;
  perform pg_temp.assert_true(not has_function_privilege('anon',t.oid,'EXECUTE'),'anon execution denied');
  if t.nspname='payments_worker' then
   perform pg_temp.assert_true(has_function_privilege('service_role',t.oid,'EXECUTE') and not has_function_privilege('authenticated',t.oid,'EXECUTE'),'worker exclusive');
  else perform pg_temp.assert_true(not has_function_privilege('service_role',t.oid,'EXECUTE'),'service cannot execute private helper'); end if;
 end loop;
end $$;
select pg_temp.assert_true(not exists(select 1 from information_schema.columns where table_schema in ('payments_private','payments_worker')
 and column_name ~ '(card|pan|cvv|cvc|vpa|email|phone|token|raw_body)'),'no prohibited private fields');
select pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('payment_gateway_attempts','payment_gateway_payments','gateway_webhook_events')),'D-14 A: no P01b objects');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 070_p01_structure.test
rollback;
