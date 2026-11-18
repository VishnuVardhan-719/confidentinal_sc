-- Q06 / Codex / integ/b01-fixes / base e8a71ed. Friend's I01/I02/C01/B01 schema.
-- Organization approval never verifies the person performing a doctor visit.
-- Staff evidence has its own lifecycle; it cannot satisfy organization evidence.
begin;

create table public.provider_verification_cases (
 id uuid primary key default gen_random_uuid(),
 provider_id uuid not null references public.providers(id),
 subject_profile_id uuid not null references public.profiles(id),
 state text not null default 'draft' check(state in ('draft','submitted','approved','rejected','suspended')),
 verified_until timestamptz,
 decided_by_profile_id uuid references public.profiles(id),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider_id,subject_profile_id),
 check(state<>'approved' or (verified_until is not null and isfinite(verified_until) and decided_by_profile_id is not null)),
 check(decided_by_profile_id is distinct from subject_profile_id)
);
create table public.staff_credential_documents (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.provider_verification_cases(id),
 uploaded_by_profile_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('registration','licence','vehicle_permit','background_check')),
 bucket_id text not null default 'provider-verification' check(bucket_id='provider-verification'),
 object_name text not null unique,
 content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png')),
 status text not null default 'pending' check(status in ('pending','verified','rejected','superseded')),
 expires_at timestamptz not null check(isfinite(expires_at)),
 created_at timestamptz not null default now(),
 check(object_name='staff/'||case_id::text||'/'||id::text||case content_type
  when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end)
);
create index q06_staff_documents_case on public.staff_credential_documents(case_id);
create table public.staff_credential_events (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.provider_verification_cases(id),
 actor_profile_id uuid not null references public.profiles(id),
 to_state text not null check(to_state in ('draft','submitted','approved','rejected','suspended')),
 reason text not null check(char_length(btrim(reason)) between 1 and 500),
 aggregate_version integer not null check(aggregate_version>0),
 occurred_at timestamptz not null default now(), unique(case_id,aggregate_version)
);
create trigger q06_events_immutable before update or delete on public.staff_credential_events
 for each row execute function booking_private.immutable();
create trigger q06_events_no_truncate before truncate on public.staff_credential_events
 for each statement execute function booking_private.immutable();

create function providers_private.staff_member(provider uuid,subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.providers p join public.organizations o on o.id=p.organization_id
 join public.organization_members m on m.organization_id=o.id
 join public.profiles a on a.id=m.profile_id where p.id=provider and m.profile_id=subject
 and o.status='active' and a.status='active' and m.status='active' and m.accepted_at is not null
 and 'provider:read'=any(m.scopes));
$$;
create function providers_private.staff_case_editor(provider uuid,subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and providers_private.staff_member(provider,subject)
 and (subject=auth.uid() or exists(select 1 from public.providers p where p.id=provider
 and providers_private.org_admin(p.organization_id,'evidence:manage')));
$$;
create function providers_private.staff_evidence_ready(subject_case uuid,verified_only boolean) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.provider_verification_cases c join public.providers p on p.id=c.provider_id
 join public.staff_credential_documents d on d.case_id=c.id
 join storage.objects o on o.bucket_id=d.bucket_id and o.name=d.object_name
 where c.id=subject_case and d.kind=providers_private.required_kind(p.category)
 and d.status=case when verified_only then 'verified' else 'pending' end and d.expires_at>clock_timestamp())
 and not exists(select 1 from public.staff_credential_documents d where d.case_id=subject_case
 and d.status=case when verified_only then 'verified' else 'pending' end
 and (d.expires_at<=clock_timestamp() or not exists(select 1 from storage.objects o where o.bucket_id=d.bucket_id and o.name=d.object_name)));
$$;
create function providers_private.person_is_verified(p_provider_id uuid,p_profile_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select public.provider_is_publishable(p_provider_id)
 and exists(select 1 from public.profiles where id=p_profile_id and status='active')
 and exists(select 1 from public.providers p where p.id=p_provider_id and
 (p.individual_owner_profile_id=p_profile_id or
 (providers_private.staff_member(p.id,p_profile_id) and exists(select 1 from public.provider_verification_cases c
 where c.provider_id=p.id and c.subject_profile_id=p_profile_id and c.state='approved'
 and c.verified_until>clock_timestamp() and providers_private.staff_evidence_ready(c.id,true)))));
$$;

create function providers_private.staff_event(subject_case uuid,reason_code text,message text default null) returns void
language sql security definer set search_path='' as $$
 insert into public.staff_credential_events(case_id,actor_profile_id,to_state,reason,aggregate_version)
 select id,auth.uid(),state,coalesce(message,reason_code),version from public.provider_verification_cases where id=subject_case;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id)
 values(auth.uid(),'provider.staff_credential_'||reason_code,'provider_verification_case',subject_case);
$$;

create function public.add_staff_credential_case(p_provider_id uuid,p_profile_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); p public.providers; result uuid; begin
 if not exists(select 1 from public.providers x where x.id=p_provider_id
 and providers_private.org_admin(x.organization_id,'provider:manage')) then
  raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(p_provider_id);
 select * into p from public.providers where id=p_provider_id;
 if not providers_private.org_admin(p.organization_id,'provider:manage')
 or not providers_private.staff_member(p.id,p_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 select id into result from public.provider_verification_cases where provider_id=p.id and subject_profile_id=p_profile_id;
 if result is not null then return result; end if;
 insert into public.provider_verification_cases(provider_id,subject_profile_id) values(p.id,p_profile_id) returning id into result;
 perform providers_private.staff_event(result,'created');
 return result;
end $$;

create function public.add_staff_credential_document(p_case_id uuid,p_content_type text,p_expires_at timestamptz,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); c public.provider_verification_cases; d public.staff_credential_documents;
 doc uuid:=gen_random_uuid(); category text; begin
 select * into c from public.provider_verification_cases where id=p_case_id;
 if not found or not providers_private.staff_case_editor(c.provider_id,c.subject_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(c.provider_id);
 select * into c from public.provider_verification_cases where id=p_case_id for update;
 if not providers_private.staff_case_editor(c.provider_id,c.subject_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or c.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if c.state not in ('draft','rejected') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_content_type is null or p_content_type not in ('application/pdf','image/jpeg','image/png') or p_expires_at is null
 or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '5 years'
 then raise exception using errcode='22023',message='invalid_input'; end if;
 if (select count(*) from public.staff_credential_documents where case_id=c.id)>=50 then raise exception using errcode='53300',message='document_limit'; end if;
 select p.category into category from public.providers p where p.id=c.provider_id;
 update public.staff_credential_documents set status='superseded' where case_id=c.id and status='pending';
 insert into public.staff_credential_documents(id,case_id,uploaded_by_profile_id,kind,object_name,content_type,expires_at)
 values(doc,c.id,actor,providers_private.required_kind(category),'staff/'||c.id::text||'/'||doc::text||case p_content_type
 when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_content_type,p_expires_at) returning * into d;
 update public.provider_verification_cases set version=version+1,updated_at=clock_timestamp() where id=c.id;
 perform providers_private.staff_event(c.id,'document_added');
 return jsonb_build_object('id',d.id,'bucket_id',d.bucket_id,'object_name',d.object_name,'version',c.version+1);
end $$;

create function public.submit_staff_credential_case(p_case_id uuid,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); c public.provider_verification_cases; begin
 select * into c from public.provider_verification_cases where id=p_case_id;
 if not found or not providers_private.staff_case_editor(c.provider_id,c.subject_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(c.provider_id);
 select * into c from public.provider_verification_cases where id=p_case_id for update;
 if not providers_private.staff_case_editor(c.provider_id,c.subject_profile_id) then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or c.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if c.state not in ('draft','rejected') then raise exception using errcode='55000',message='invalid_transition'; end if;
 if not providers_private.staff_evidence_ready(c.id,false) then raise exception using errcode='55000',message='credentials_required'; end if;
 update public.provider_verification_cases set state='submitted',version=version+1,updated_at=clock_timestamp() where id=c.id;
 perform providers_private.staff_event(c.id,'submitted');
 return c.version+1;
end $$;

create function public.review_staff_credential_case(p_case_id uuid,p_decision text,p_reason text,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); c public.provider_verification_cases; org uuid; expiry timestamptz; begin
 select c0.* into c from public.provider_verification_cases c0 join public.providers p on p.id=c0.provider_id
 where c0.id=p_case_id and providers_private.verifier(p.organization_id);
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(c.provider_id);
 select * into c from public.provider_verification_cases where id=p_case_id for update;
 select organization_id into org from public.providers where id=c.provider_id;
 if not providers_private.verifier(org) or actor=c.subject_profile_id
 or exists(select 1 from public.organization_members where organization_id=org and profile_id=actor)
 or exists(select 1 from public.staff_credential_documents where case_id=c.id and uploaded_by_profile_id=actor)
 then raise exception using errcode='42501',message='forbidden'; end if;
 if p_expected_version is null or c.version<>p_expected_version then raise exception using errcode='40001',message='stale_version'; end if;
 if p_decision is null or p_decision not in ('approved','rejected','suspended') or p_reason is null
 or char_length(btrim(p_reason)) not between 1 and 500 then raise exception using errcode='22023',message='invalid_input'; end if;
 if not ((c.state='submitted' and p_decision in ('approved','rejected')) or (c.state='approved' and p_decision='suspended'))
 then raise exception using errcode='55000',message='invalid_transition'; end if;
 if p_decision='approved' then
  if not providers_private.staff_member(c.provider_id,c.subject_profile_id) or not providers_private.staff_evidence_ready(c.id,false)
  then raise exception using errcode='55000',message='credentials_required'; end if;
  select min(expires_at) into expiry from public.staff_credential_documents where case_id=c.id and status='pending';
  update public.staff_credential_documents set status='verified' where case_id=c.id and status='pending';
 elsif p_decision='rejected' then
  update public.staff_credential_documents set status='rejected' where case_id=c.id and status='pending';
 end if;
 update public.provider_verification_cases set state=p_decision,verified_until=case when p_decision='approved' then expiry else verified_until end,
 decided_by_profile_id=actor,version=version+1,updated_at=clock_timestamp() where id=c.id;
 perform providers_private.staff_event(c.id,p_decision,p_reason);
 return c.version+1;
end $$;

create function providers_private.staff_case_read(subject_case uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.provider_verification_cases c
 join public.providers p on p.id=c.provider_id where c.id=subject_case and
 (c.subject_profile_id=auth.uid() or providers_private.org_admin(p.organization_id,'provider:read') or providers_private.verifier(p.organization_id)));
$$;
create function providers_private.staff_document_upload(object_path text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.staff_credential_documents d join public.provider_verification_cases c on c.id=d.case_id
 where d.object_name=object_path and d.status='pending' and d.uploaded_by_profile_id=auth.uid()
 and c.state in ('draft','rejected') and d.expires_at>clock_timestamp()
 and providers_private.staff_case_editor(c.provider_id,c.subject_profile_id));
$$;

alter table public.provider_verification_cases enable row level security;
alter table public.staff_credential_documents enable row level security;
alter table public.staff_credential_events enable row level security;
revoke all on public.provider_verification_cases,public.staff_credential_documents,public.staff_credential_events from public,anon,authenticated;
grant select on public.provider_verification_cases,public.staff_credential_events to authenticated;
grant select(id,case_id,kind,content_type,status,expires_at,created_at) on public.staff_credential_documents to authenticated;
create policy q06_cases_read on public.provider_verification_cases for select to authenticated using(providers_private.staff_case_read(id));
create policy q06_documents_read on public.staff_credential_documents for select to authenticated using(providers_private.staff_case_read(case_id));
create policy q06_events_read on public.staff_credential_events for select to authenticated using(providers_private.staff_case_read(case_id));
create policy q06_staff_upload on storage.objects for insert to authenticated
 with check(bucket_id='provider-verification' and providers_private.staff_document_upload(name));
-- No staff evidence SELECT/UPDATE/DELETE policy or signed URLs are enabled here.

revoke all on function providers_private.staff_member(uuid,uuid),providers_private.staff_case_editor(uuid,uuid),
 providers_private.staff_evidence_ready(uuid,boolean),providers_private.person_is_verified(uuid,uuid),
 providers_private.staff_event(uuid,text,text),providers_private.staff_case_read(uuid),providers_private.staff_document_upload(text)
 from public,anon,authenticated;
grant execute on function providers_private.staff_case_read(uuid),providers_private.staff_document_upload(text) to authenticated;
revoke all on function public.add_staff_credential_case(uuid,uuid),public.add_staff_credential_document(uuid,text,timestamptz,integer),
 public.submit_staff_credential_case(uuid,integer),public.review_staff_credential_case(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.add_staff_credential_case(uuid,uuid),public.add_staff_credential_document(uuid,text,timestamptz,integer),
 public.submit_staff_credential_case(uuid,integer),public.review_staff_credential_case(uuid,text,text,integer) to authenticated;
commit;
