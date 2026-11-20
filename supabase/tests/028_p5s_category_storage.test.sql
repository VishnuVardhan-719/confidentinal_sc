\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
-- P5 shared fix 001591: categories register a Storage predicate; the restrictive
-- i02_objects_guard admits an object when any registered predicate does.

-- The guard keeps its I02/Q06/M1 clauses and gains the category clause on both sides.
select pg_temp.assert_true((select qual like '%object_access(bucket_id, name, false)%' and qual like '%staff_document_upload(name)%'
 and qual like '%category_object_access(bucket_id, name, false)%' from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard'),'guard USING keeps old clauses plus category clause');
select pg_temp.assert_true((select with_check like '%object_access(bucket_id, name, true)%' and with_check like '%staff_document_upload(name)%'
 and with_check like '%category_object_access(bucket_id, name, true)%' from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard'),'guard WITH CHECK keeps old clauses plus category clause');
select pg_temp.assert_true((select permissive='RESTRICTIVE' from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard'),'guard stays restrictive');

-- Privileges: only the predicate is callable, and only by authenticated.
select pg_temp.assert_true(not has_table_privilege('authenticated','providers_private.category_object_checks','select,insert'),'registry hidden from authenticated');
select pg_temp.assert_true(not has_table_privilege('service_role','providers_private.category_object_checks','insert'),'registry closed to service_role');
select pg_temp.assert_true(has_function_privilege('authenticated','providers_private.category_object_access(text,text,boolean)','execute'),'authenticated may evaluate');
select pg_temp.assert_true(not has_function_privilege('anon','providers_private.category_object_access(text,text,boolean)','execute'),'anon may not');

-- Scratch predicates (rolled back): one admits 'x/<anything>' reads only, one has a wrong signature.
create schema t028;
create function t028.allow(b text,o text,w boolean) returns boolean language sql as $$ select b='provider-verification' and o like 'x/%' and not w $$;
create function t028.bad(b text,o text) returns boolean language sql as $$ select true $$;
create function t028.notbool(b text,o text,w boolean) returns integer language sql as $$ select 1 $$;

select pg_temp.assert_true(not providers_private.category_object_access('provider-verification','x/1.pdf',false),'unregistered names are denied');

select pg_temp.expect_state('insert into providers_private.category_object_checks(checker) values (''t028.bad(text,text)'')','22023','wrong arity refused');
select pg_temp.expect_state('insert into providers_private.category_object_checks(checker) values (''t028.notbool(text,text,boolean)'')','22023','non-boolean refused');
insert into providers_private.category_object_checks(checker) values ('t028.allow(text,text,boolean)');
select pg_temp.assert_true(providers_private.category_object_access('provider-verification','x/1.pdf',false),'registered predicate admits its read');
select pg_temp.assert_true(not providers_private.category_object_access('provider-verification','x/1.pdf',true),'and decides writes itself');
select pg_temp.assert_true(not providers_private.category_object_access('provider-verification','y/1.pdf',false),'other names stay denied');
select pg_temp.assert_true(not providers_private.category_object_access('other-bucket','x/1.pdf',false),'other buckets stay denied');

select pg_temp.expect_state('update providers_private.category_object_checks set created_at=now()','55000','registry rows immutable');
select pg_temp.expect_state('delete from providers_private.category_object_checks','55000','registry rows not deletable');

\echo 1..1
\echo ok 1 - 028_p5s_category_storage
rollback;
