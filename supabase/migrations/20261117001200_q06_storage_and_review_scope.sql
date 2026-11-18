-- Q06 integration follow-up. Requires I02 hardening through 20261117000660.
-- Keep provider download tickets, immutable objects and the signing ban intact.
begin;

alter policy i02_objects_guard on storage.objects
 with check (providers_private.object_access(bucket_id,name,true)
  or (bucket_id='provider-verification' and providers_private.staff_document_upload(name)));

create or replace function public.review_staff_credential_case(p_case_id uuid,p_decision text,p_reason text,p_expected_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); c public.provider_verification_cases; org uuid; expiry timestamptz;
 needed text:=case when p_decision='suspended' then 'provider:suspend' else 'provider:verify' end;
begin
 select c0.* into c from public.provider_verification_cases c0 join public.providers p on p.id=c0.provider_id
 where c0.id=p_case_id and coalesce(identity_private.has_capability(needed,p.organization_id),false);
 if not found then raise exception using errcode='42501',message='forbidden'; end if;
 perform booking_private.lock_provider(c.provider_id);
 select * into c from public.provider_verification_cases where id=p_case_id for update;
 select organization_id into org from public.providers where id=c.provider_id;
 -- Keep capability revocation serialized with the decision, as in I02 review.
 perform 1 from public.admin_capabilities where profile_id=actor and capability=needed for share;
 if not coalesce(identity_private.has_capability(needed,org),false) or actor=c.subject_profile_id
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

create or replace function providers_private.staff_case_read(subject_case uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select identity_private.active_account() and exists(select 1 from public.provider_verification_cases c
 join public.providers p on p.id=c.provider_id where c.id=subject_case and
 (c.subject_profile_id=auth.uid() or providers_private.org_admin(p.organization_id,'provider:read')
 or providers_private.verifier(p.organization_id) or coalesce(identity_private.has_capability('provider:suspend',p.organization_id),false)));
$$;

commit;
