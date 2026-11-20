-- P5 shared fix / Claude / integ/all. Category hook for the restrictive Storage guard.
-- Synthetic local/staging only. Authored, DB NOT EXECUTED.
--
-- i02_objects_guard (I02, Q06 001200, M1 001400) is restrictive, so a category block that
-- stores evidence objects (ambulance vehicle documents, 001810) is denied even with its own
-- permissive policies. Contract §1 rule 1 forbids a category migration from rebuilding the
-- shared policy, and a shared migration cannot name category functions that do not exist
-- yet. So the guard gains one registry-driven clause: a category registers its predicate
-- (bucket text, object_path text, writing boolean) -> boolean in its own migration, and the
-- guard admits an object when any registered predicate does. Existing clauses are unchanged.
begin;

do $$ begin
 if to_regprocedure('providers_private.object_access(text,text,boolean)') is null
 or to_regprocedure('providers_private.staff_document_upload(text)') is null
 or to_regprocedure('storage.operation()') is null
 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard') then
  raise exception 'P5 shared 001591: prerequisites (I02, Q06, M1 storage guard) missing';
 end if;
end $$;

create table providers_private.category_object_checks(
 checker regprocedure primary key,
 created_at timestamptz not null default now()
);
-- Append-only, like the reason registries: a category inserts its own row and never edits it.
create function providers_private.category_object_check_valid() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_proc p where p.oid=new.checker and p.prorettype='boolean'::regtype
  and p.pronargs=3 and p.proargtypes[0]='text'::regtype and p.proargtypes[1]='text'::regtype
  and p.proargtypes[2]='boolean'::regtype) then
  raise exception using errcode='22023',message='invalid_object_check';
 end if;
 return new;
end $$;
create trigger p5s_object_check_valid before insert on providers_private.category_object_checks
 for each row execute function providers_private.category_object_check_valid();
create trigger p5s_object_check_immutable before update or delete on providers_private.category_object_checks
 for each row execute function booking_private.immutable();
create trigger p5s_object_check_no_truncate before truncate on providers_private.category_object_checks
 for each statement execute function booking_private.immutable();

-- True when any registered category predicate admits the object. Each predicate keeps its
-- own rules (tickets, uploader, editable state); auth.uid() still reads the caller's claims.
create function providers_private.category_object_access(bucket text,object_path text,writing boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare fn text; ok boolean;
begin
 for fn in select format('%I.%I',n.nspname,p.proname) from providers_private.category_object_checks c
   join pg_proc p on p.oid=c.checker join pg_namespace n on n.oid=p.pronamespace order by c.checker::text loop
  execute format('select %s($1,$2,$3)',fn) into ok using bucket,object_path,writing;
  if ok then return true; end if;
 end loop;
 return false;
end $$;

revoke all on table providers_private.category_object_checks from public,anon,authenticated,service_role;
revoke all on function providers_private.category_object_check_valid() from public,anon,authenticated,service_role;
revoke all on function providers_private.category_object_access(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function providers_private.category_object_access(text,text,boolean) to authenticated;

-- Same expressions as 001400 (USING) and 001200 (WITH CHECK), plus the category clause.
alter policy i02_objects_guard on storage.objects
 using (providers_private.object_access(bucket_id,name,false)
  or (bucket_id='provider-verification' and coalesce(storage.operation(),'') = 'storage.object.upload'
   and providers_private.staff_document_upload(name))
  or providers_private.category_object_access(bucket_id,name,false))
 with check (providers_private.object_access(bucket_id,name,true)
  or (bucket_id='provider-verification' and providers_private.staff_document_upload(name))
  or providers_private.category_object_access(bucket_id,name,true));

commit;
