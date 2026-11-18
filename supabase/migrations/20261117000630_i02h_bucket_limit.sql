-- I02 hardening item 8 / Kiro / integ/friend-backend.
-- Approved OQ-6: verification files are capped at 5 MiB (O-I02:1096-1099). F created
-- the bucket at 10 MiB (F-2:269-270). Bucket stays private with the same MIME allowlist.
begin;
update storage.buckets
  set file_size_limit = 5242880, public = false,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png']
  where id = 'provider-verification';
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'provider-verification' and file_size_limit = 5242880 and not public) then
    raise exception using errcode = '55000', message = 'provider_verification_bucket_missing';
  end if;
end $$;
commit;
