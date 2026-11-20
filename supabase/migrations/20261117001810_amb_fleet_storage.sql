-- P5 ambulance 2/3 / Kiro / feat/P5-ambulance / base integ/all 51c7439.
-- Design §3.3 file 001810 and §5.4: Storage access for vehicle evidence objects
-- (bucket provider-verification, names 'vehicle/<resource>/<document>.<ext>').
-- Synthetic local/staging only. Authored, DB NOT EXECUTED.
--
-- CONTRACT CONFLICT (recorded in docs/handoffs/P5_ambulance_kiro_2026-11-20.md):
-- the design rebuilds the shared restrictive policy i02_objects_guard here. Contract §1
-- rule 1 forbids a category migration from replacing a policy defined outside its own
-- range, and the lab/care/doctor blocks may need the same guard, so a category rebuild
-- from "the expression current at authoring time" would drop the others' clauses (the
-- P01 H1 failure). This file therefore only ADDS: one predicate and two permissive
-- policies. Until a shared fix (20261117001591-001599) appends
--   or ambulance_private.vehicle_object_access(bucket_id,name,<false|true>)
-- to i02_objects_guard USING / WITH CHECK, the restrictive guard still denies every
-- vehicle object to anon and authenticated, which fails closed: no vehicle bytes can be
-- uploaded or read through Storage, so no vehicle case can be submitted outside fixtures.
begin;

do $$ begin
 if to_regprocedure('storage.operation()') is null
 or to_regclass('public.vehicle_credential_documents') is null
 or to_regclass('ambulance_private.vehicle_document_read_tickets') is null
 or to_regprocedure('ambulance_private.vehicle_document_read_allowed(uuid,text)') is null
 or to_regprocedure('ambulance_private.evidence_editor(uuid)') is null
 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard') then
  raise exception 'P5 ambulance 001810: prerequisites (001800, I02 storage guard) missing';
 end if;
end $$;

-- Writing (INSERT) and the upload read-back (M1, 001400): the uploader of a pending
-- document of a draft/rejected vehicle case who is still an evidence editor.
-- Reading: only with a live 60 s ticket whose rule still holds at read time.
create function ambulance_private.vehicle_object_access(p_bucket text,p_object_path text,p_writing boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_bucket='provider-verification' and exists(select 1 from public.vehicle_credential_documents d
  join public.ambulance_vehicles v on v.resource_id=d.vehicle_resource_id
  where d.bucket_id=p_bucket and d.object_name=p_object_path and (
   (not p_writing and exists(select 1 from ambulance_private.vehicle_document_read_tickets t
     where t.document_id=d.id and t.object_name=d.object_name and t.grantee_profile_id=auth.uid() and t.expires_at>now()
     and ambulance_private.vehicle_document_read_allowed(d.id,t.purpose)))
   or ((p_writing or coalesce(storage.operation(),'')='storage.object.upload')
     and d.uploaded_by_profile_id=auth.uid() and d.status='pending' and v.case_state in ('draft','rejected')
     and ambulance_private.evidence_editor(v.provider_id)))),false);
$$;

-- Policies are evaluated as the calling role, so the predicate (only) is executable by
-- authenticated; its definer body reads the private tables.
grant usage on schema ambulance_private to authenticated;
revoke all on function ambulance_private.vehicle_object_access(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function ambulance_private.vehicle_object_access(text,text,boolean) to authenticated;

-- Additive permissive policies. Inert until the shared guard admits vehicle objects.
create policy amb_vehicle_objects_insert on storage.objects for insert to authenticated
 with check (ambulance_private.vehicle_object_access(bucket_id,name,true));
create policy amb_vehicle_objects_read on storage.objects for select to authenticated
 using (ambulance_private.vehicle_object_access(bucket_id,name,false));
commit;
