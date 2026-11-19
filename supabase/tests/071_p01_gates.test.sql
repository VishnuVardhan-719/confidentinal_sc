\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
select pg_temp.assert_true((select not pay_after_enabled and not paid_enabled from payments_private.settings),'migration gates closed');
select pg_temp.assert_true(not exists(select 1 from public.admin_capabilities where capability like 'finance:%'),'launch finance grants nobody');
-- Invoke every public RPC with typed NULLs: gate must precede actor and input checks.
do $$ declare f record; statement text; begin
 for f in select p.proname,p.proargtypes from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('report_collection','report_collection_exception','review_collection_intake','void_collection','reconcile_collection',
 'supersede_collection','dispute_payment','resolve_dispute','override_payment','get_payment_summary','get_collection_intake_status',
 'list_provider_payments','list_payment_queue','list_payment_exceptions') loop
  select 'select public.'||quote_ident(f.proname)||'('||string_agg('null::'||format_type(x,null),',')||')'
  into statement from unnest(f.proargtypes::oid[]) x;
  perform pg_temp.expect_state(statement,'55000','closed gate '||f.proname);
 end loop;
end $$;
set constraints all immediate;
\echo 1..1
\echo ok 1 - 071_p01_gates.test
rollback;
