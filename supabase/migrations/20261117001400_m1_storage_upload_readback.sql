-- M1 / Kiro (kiro-m1) / fix/storage-upload-readback / base origin/integ/all a7c14a1. Forward migration.
-- Review: C:\tmp\scv_logs\review_coderabbit.md, finding M1.
-- Storage writes some uploads with INSERT ... RETURNING *: the upsert probe of storage-api
-- v1.96.0 (INSERT ... ON CONFLICT DO UPDATE ... RETURNING *) and older Storage releases
-- for every upload. The returned row must pass the SELECT USING of every policy, including
-- the restrictive i02_objects_guard. Since 000660 a read needs a live ticket, and no ticket
-- is issued until the bytes exist, so provider owners got 42501 on those writes. Q06 staff
-- uploads (001000/001200) had no read branch at all. The plain INSERT that v1.96.0 uses
-- for a default upload (upsert=false) was never affected.
-- Fix: the uploader may read back the row only while Storage runs the upload operation
-- ('storage.object.upload', set by Storage per request) and only for their own pending,
-- still-writable reservation: exactly the rows they may insert. Downloads and every
-- other operation stay ticket-only for owners; reviewer reads stay ticket-only;
-- staff evidence still has no download path. Other upload protocols (TUS, S3) are not
-- opened and keep failing closed.
begin;

-- Same body as 000660 except the write branch also answers the upload read-back.
create or replace function providers_private.object_access(bucket text,object_path text,writing boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(bucket='provider-verification' and exists (
    select 1 from public.provider_documents d join public.providers p on p.id=d.provider_id
    where d.bucket_id=bucket and d.object_name=object_path and (
      (not writing and exists (select 1 from providers_private.document_read_tickets t
        where t.document_id = d.id and t.object_name = d.object_name and t.grantee_profile_id = auth.uid()
          and t.expires_at > now() and providers_private.document_read_allowed(d.id, t.purpose))) or
      ((writing or coalesce(storage.operation(),'') = 'storage.object.upload')
        and d.owner_profile_id=auth.uid() and d.status='pending' and providers_private.owner_editable(p.verification_state)
        and providers_private.access(p.id,'manage')
        and (p.organization_id is null or providers_private.org_admin(p.organization_id,'evidence:manage')))
    )
  ), false);
$$;

-- Q06: the same read-back for the staff uploader. WITH CHECK (001200) is unchanged.
alter policy i02_objects_guard on storage.objects
  using (providers_private.object_access(bucket_id,name,false)
    or (bucket_id='provider-verification' and coalesce(storage.operation(),'') = 'storage.object.upload'
      and providers_private.staff_document_upload(name)));
create policy q06_staff_upload_readback on storage.objects for select to authenticated
  using (bucket_id='provider-verification' and coalesce(storage.operation(),'') = 'storage.object.upload'
    and providers_private.staff_document_upload(name));

commit;
