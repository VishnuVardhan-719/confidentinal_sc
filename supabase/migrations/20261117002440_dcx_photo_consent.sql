-- DC extras 5/6 / Kiro / feat/DC-extras / base integ/all bed2877.
-- Design §7: DC13 consent-based optional photography. Synthetic local/staging only.
-- Authored, DB NOT EXECUTED.
--
-- Order of operations: the patient grants a purpose-specific consent for one doctor booking;
-- the assigned, currently verified doctor registers a photo row during the started visit and
-- uploads the object to the private bucket `visit-evidence` at the registered name; the
-- patient or the visit's doctor reads it with a 60-second ticket. Withdrawal is never gated:
-- it marks the consent and every photo under it `withdrawn` with delete_after set, and the
-- Storage predicate stops admitting reads in the same transaction. Photos are never required
-- to complete a visit or a record. The object deletion worker is not built (retention is
-- D-PRIV; Storage deletion needs a reviewed service adapter).
-- Storage: the shared restrictive guard admits these objects through the registry
-- providers_private.category_object_checks (shared 001591), as ambulance 001810 does. Signing,
-- UPDATE and DELETE stay banned by i02_no_signing, i02_objects_no_update, i02_objects_no_delete.
begin;

do $$ declare obj text; begin
 foreach obj in array array['dcx_private.require_feature(text,text)','dcx_private.in_visit_doctor(uuid)','dcx_private.visit_doctor(uuid)',
  'dcx_private.visit_patient(uuid,text)','booking_private.patient(uuid,text)','storage.operation()',
  'providers_private.category_object_access(text,text,boolean)'] loop
  if to_regprocedure(obj) is null then raise exception 'DC extras 002440 preflight: missing %',obj; end if;
 end loop;
 if to_regclass('providers_private.category_object_checks') is null
 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='i02_objects_guard') then
  raise exception 'DC extras 002440 preflight: shared 001591 category storage hook missing';
 end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('visit-evidence','visit-evidence',false,5242880,array['image/jpeg','image/png']);

create table public.visit_photo_consents (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict,
 purpose text not null check (purpose in ('wound_documentation','skin_condition','mobility_assessment')),
 policy_version text not null check (char_length(btrim(policy_version)) between 1 and 80),
 status text not null default 'granted' check (status in ('granted','withdrawn')),
 granted_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 granted_at timestamptz not null default clock_timestamp(),
 withdrawn_by_profile_id uuid references public.profiles(id) on delete restrict,
 withdrawn_at timestamptz,
 version integer not null default 1 check (version>0),
 check ((status='granted')=(withdrawn_at is null and withdrawn_by_profile_id is null))
);
create unique index dcx_one_granted_consent on public.visit_photo_consents(booking_id,purpose) where status='granted';
create table public.visit_photos (
 id uuid primary key,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 consent_id uuid not null references public.visit_photo_consents(id) on delete restrict,
 object_name text not null unique check (object_name ~ '^visit/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'),
 content_type text not null check (content_type in ('image/jpeg','image/png')),
 status text not null default 'active' check (status in ('active','withdrawn')),
 uploaded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 withdrawn_at timestamptz,
 delete_after timestamptz,
 check ((status='active')=(withdrawn_at is null and delete_after is null)),
 check (object_name='visit/'||booking_id::text||'/'||id::text||case content_type when 'image/png' then '.png' else '.jpg' end)
);
create index dcx_photos_booking on public.visit_photos(booking_id,created_at);
create index dcx_photos_consent on public.visit_photos(consent_id);
create table dcx_private.photo_read_tickets (
 id uuid primary key default gen_random_uuid(),
 photo_id uuid not null references public.visit_photos(id) on delete restrict,
 grantee_profile_id uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null,
 expires_at timestamptz not null,
 check (expires_at=created_at+interval '60 seconds')
);
create index dcx_photo_tickets_lookup on dcx_private.photo_read_tickets(photo_id,grantee_profile_id,expires_at);

-- Guards (backstop for a definer bug): only granted -> withdrawn, once.
create function dcx_private.guard_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_consent'; end if;
 if old.status<>'granted' or new.status<>'withdrawn' or new.version<>old.version+1
 or (to_jsonb(new)-'status'-'withdrawn_at'-'withdrawn_by_profile_id'-'version') is distinct from (to_jsonb(old)-'status'-'withdrawn_at'-'withdrawn_by_profile_id'-'version') then
  raise exception using errcode='55000',message='immutable_consent'; end if;
 return new;
end $$;
create trigger dcx_consent_guard before update or delete on public.visit_photo_consents for each row execute function dcx_private.guard_consent();
create trigger dcx_consent_no_truncate before truncate on public.visit_photo_consents for each statement execute function booking_private.immutable();
create function dcx_private.guard_photo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_photo'; end if;
 if old.status<>'active' or new.status<>'withdrawn'
 or (to_jsonb(new)-'status'-'withdrawn_at'-'delete_after') is distinct from (to_jsonb(old)-'status'-'withdrawn_at'-'delete_after') then
  raise exception using errcode='55000',message='immutable_photo'; end if;
 return new;
end $$;
create trigger dcx_photo_guard before update or delete on public.visit_photos for each row execute function dcx_private.guard_photo();
create trigger dcx_photo_no_truncate before truncate on public.visit_photos for each statement execute function booking_private.immutable();
create trigger dcx_photo_tickets_immutable before update or delete on dcx_private.photo_read_tickets for each row execute function booking_private.immutable();
create trigger dcx_photo_tickets_no_truncate before truncate on dcx_private.photo_read_tickets for each statement execute function booking_private.immutable();

do $$ declare t text; begin
 foreach t in array array['public.visit_photo_consents','public.visit_photos','dcx_private.photo_read_tickets'] loop
  execute format('alter table %s enable row level security',t);
  execute format('revoke all on %s from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- Patient (booking:create) of a confirmed or in-progress doctor booking. A second grant for
-- the same purpose while one is granted returns the existing consent.
create function public.grant_photo_consent(p_booking_id uuid,p_purpose text,p_policy_version text,p_request_key uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); pv text:=btrim(p_policy_version); h text; prior record; b public.bookings; cid uuid; begin
 if p_booking_id is null or p_request_key is null or p_purpose is null
 or p_purpose not in ('wound_documentation','skin_condition','mobility_assessment') or pv is null or char_length(pv) not between 1 and 80 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_purpose,pv));
 select * into prior from booking_private.replay(actor,'dcx.photo.consent',p_request_key,h);
 if prior.result_id is not null then return prior.result_id; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'doctor' or not booking_private.patient(b.patient_id,'booking:create') then
  raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_photos','write');
 select * into b from public.bookings where id=p_booking_id for update;
 select * into prior from booking_private.replay(actor,'dcx.photo.consent',p_request_key,h);
 if prior.result_id is not null then return prior.result_id; end if;
 if not booking_private.patient(b.patient_id,'booking:create') then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_photos','write');
 if b.state not in ('confirmed','in_progress') then raise exception using errcode='55000',message='invalid_transition'; end if;
 select id into cid from public.visit_photo_consents where booking_id=b.id and purpose=p_purpose and status='granted';
 if cid is null then
  insert into public.visit_photo_consents(booking_id,patient_id,purpose,policy_version,granted_by_profile_id)
   values(b.id,b.patient_id,p_purpose,pv,actor) returning id into cid;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'visit_photo.consent_granted','visit_photo_consent',cid);
 end if;
 perform booking_private.record_request(actor,'dcx.photo.consent',p_request_key,h,cid,1);
 return cid;
end $$;

-- Never gated. p_expected_version is the consent version; returns the new version.
create function public.withdraw_photo_consent(p_consent_id uuid,p_expected_version integer,p_request_key uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior record; c public.visit_photo_consents; begin
 if p_consent_id is null or p_request_key is null or p_expected_version is null or p_expected_version not between 1 and 2147483646 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_consent_id,p_expected_version));
 select * into prior from booking_private.replay(actor,'dcx.photo.withdraw',p_request_key,h);
 if prior.result_version is not null then return prior.result_version; end if;
 select * into c from public.visit_photo_consents where id=p_consent_id;
 if not found or not booking_private.patient(c.patient_id,'booking:create') then raise exception using errcode='P0002',message='not_found'; end if;
 perform dcx_private.require_feature('doctor_photos','withdraw');
 perform 1 from public.bookings where id=c.booking_id for update;
 select * into c from public.visit_photo_consents where id=p_consent_id for update;
 select * into prior from booking_private.replay(actor,'dcx.photo.withdraw',p_request_key,h);
 if prior.result_version is not null then return prior.result_version; end if;
 if c.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if c.status<>'granted' then raise exception using errcode='55000',message='invalid_transition'; end if;
 update public.visit_photo_consents set status='withdrawn',withdrawn_at=clock_timestamp(),withdrawn_by_profile_id=actor,version=version+1 where id=c.id;
 update public.visit_photos set status='withdrawn',withdrawn_at=clock_timestamp(),delete_after=clock_timestamp() where consent_id=c.id and status='active';
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'visit_photo.consent_withdrawn','visit_photo_consent',c.id);
 perform booking_private.record_request(actor,'dcx.photo.withdraw',p_request_key,h,c.id,c.version+1);
 return c.version+1;
end $$;

-- The started visit's verified doctor, under a granted consent of this booking. Lock order:
-- booking (update), consent (share); withdrawal takes the same booking lock first.
create function public.register_visit_photo(p_booking_id uuid,p_consent_id uuid,p_content_type text,p_request_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior record; b public.bookings; c public.visit_photo_consents;
 pid uuid; name text; begin
 if p_booking_id is null or p_consent_id is null or p_request_key is null or p_content_type is null
 or p_content_type not in ('image/jpeg','image/png') then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_booking_id,p_consent_id,p_content_type));
 select * into prior from booking_private.replay(actor,'dcx.photo.register',p_request_key,h);
 if prior.result_id is not null then
  return (select jsonb_build_object('photo_id',p.id,'bucket','visit-evidence','object_name',p.object_name) from public.visit_photos p where p.id=prior.result_id);
 end if;
 if not dcx_private.in_visit_doctor(p_booking_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_photos','write');
 select * into b from public.bookings where id=p_booking_id for update;
 select * into c from public.visit_photo_consents where id=p_consent_id for share;
 select * into prior from booking_private.replay(actor,'dcx.photo.register',p_request_key,h);
 if prior.result_id is not null then
  return (select jsonb_build_object('photo_id',p.id,'bucket','visit-evidence','object_name',p.object_name) from public.visit_photos p where p.id=prior.result_id);
 end if;
 if not dcx_private.in_visit_doctor(b.id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform dcx_private.require_feature('doctor_photos','write');
 if c.id is null or c.booking_id<>b.id or c.status<>'granted' then raise exception using errcode='42501',message='consent_required'; end if;
 if (select count(*) from public.visit_photos where booking_id=b.id)>=10 then raise exception using errcode='53300',message='photo_limit'; end if;
 pid:=gen_random_uuid();
 name:='visit/'||b.id::text||'/'||pid::text||case p_content_type when 'image/png' then '.png' else '.jpg' end;
 insert into public.visit_photos(id,booking_id,consent_id,object_name,content_type,uploaded_by_profile_id)
  values(pid,b.id,c.id,name,p_content_type,actor);
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'visit_photo.registered','visit_photo',pid);
 perform booking_private.record_request(actor,'dcx.photo.register',p_request_key,h,pid,null);
 return jsonb_build_object('photo_id',pid,'bucket','visit-evidence','object_name',name);
end $$;

-- 60-second read ticket, audited. Patient or the visit's doctor, active photo, granted consent.
create function public.authorize_visit_photo_read(p_photo_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.visit_photos; at_time timestamptz:=clock_timestamp(); begin
 if p_photo_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 perform dcx_private.require_feature('doctor_photos','read');
 select ph.* into p from public.visit_photos ph join public.visit_photo_consents c on c.id=ph.consent_id
  where ph.id=p_photo_id and ph.status='active' and c.status='granted';
 if p.id is null or not (dcx_private.visit_patient(p.booking_id,'booking:read') or dcx_private.visit_doctor(p.booking_id)) then
  raise exception using errcode='P0002',message='not_found'; end if;
 insert into dcx_private.photo_read_tickets(photo_id,grantee_profile_id,created_at,expires_at) values(p.id,actor,at_time,at_time+interval '60 seconds');
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'visit_photo.read_authorized','visit_photo',p.id);
 return jsonb_build_object('bucket','visit-evidence','object_name',p.object_name,'expires_at',at_time+interval '60 seconds');
end $$;

create function public.list_visit_photos(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if p_booking_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 perform dcx_private.require_feature('doctor_photos','read');
 if not (dcx_private.visit_patient(p_booking_id,'booking:read') or dcx_private.visit_doctor(p_booking_id)) then
  raise exception using errcode='P0002',message='not_found'; end if;
 return jsonb_build_object('booking_id',p_booking_id,
  'consents',coalesce((select jsonb_agg(jsonb_build_object('consent_id',c.id,'purpose',c.purpose,'status',c.status,'version',c.version,
    'granted_at',c.granted_at,'withdrawn_at',c.withdrawn_at) order by c.granted_at,c.id) from public.visit_photo_consents c where c.booking_id=p_booking_id),'[]'::jsonb),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('photo_id',p.id,'consent_id',p.consent_id,'content_type',p.content_type,'status',p.status,
    'created_at',p.created_at,'withdrawn_at',p.withdrawn_at) order by p.created_at,p.id) from public.visit_photos p where p.booking_id=p_booking_id),'[]'::jsonb));
end $$;

-- Storage predicate (registered below). Writing, and the M1 upload read-back: the uploader of
-- an active photo under a granted consent, while still the started visit's verified doctor.
-- Reading: a live ticket of the caller, active photo, granted consent, caller still patient
-- or visit doctor at read time.
create function dcx_private.photo_object_access(p_bucket text,p_object_path text,p_writing boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_bucket='visit-evidence' and exists(select 1 from public.visit_photos ph
  join public.visit_photo_consents c on c.id=ph.consent_id
  where ph.object_name=p_object_path and ph.status='active' and c.status='granted' and (
   ((p_writing or coalesce(storage.operation(),'')='storage.object.upload')
     and ph.uploaded_by_profile_id=auth.uid() and dcx_private.in_visit_doctor(ph.booking_id))
   or (not p_writing and exists(select 1 from dcx_private.photo_read_tickets t where t.photo_id=ph.id
     and t.grantee_profile_id=auth.uid() and t.expires_at>now())
     and (dcx_private.visit_patient(ph.booking_id,'booking:read') or dcx_private.visit_doctor(ph.booking_id))))),false);
$$;
insert into providers_private.category_object_checks(checker) values ('dcx_private.photo_object_access(text,text,boolean)');

revoke all on all functions in schema dcx_private from public, anon, authenticated, service_role;
-- The permissive policies run as the caller, so only the predicate is executable.
grant usage on schema dcx_private to authenticated;
grant execute on function dcx_private.photo_object_access(text,text,boolean) to authenticated;
create policy dcx_photo_objects_insert on storage.objects for insert to authenticated
 with check (dcx_private.photo_object_access(bucket_id,name,true));
create policy dcx_photo_objects_read on storage.objects for select to authenticated
 using (dcx_private.photo_object_access(bucket_id,name,false));

do $$ declare f text; begin
 foreach f in array array['public.grant_photo_consent(uuid,text,text,uuid)','public.withdraw_photo_consent(uuid,integer,uuid)',
  'public.register_visit_photo(uuid,uuid,text,uuid)','public.authorize_visit_photo_read(uuid)','public.list_visit_photos(uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
