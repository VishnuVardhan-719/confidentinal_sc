-- Review findings M2/M3/M4/M7 / Kiro / fix/review-findings / base origin/integ/all a7c14a1.
-- Source: C:\tmp\scv_logs\review_coderabbit.md. Forward migration; earlier files unchanged.
--  M2. pg_cron can only be created in the database named by cron.database_name. The
--      extension and the hourly expiry job are (re)asserted only in that database;
--      any other database gets a notice. 000670 still runs the unguarded statements,
--      so a full replay into a side database fails at 000670 until that file changes.
--  M3. service_role loses write/trigger/references on the Q06 ledgers and tables, as
--      000610 did for audit_events/provider_verification_events. Only postgres-owned
--      definer commands write them. SELECT is kept.
--  M4. The staff document cap counts only live (pending/verified) documents, matching
--      add_provider_document (000650). Superseded/rejected rows no longer block a case.
--  M7. get_booking returns the public provider_reference instead of the provider UUID.
begin;

-- M2
do $$ begin
  if current_database() = coalesce(current_setting('cron.database_name', true), 'postgres') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('i02h-expire-due-providers', '17 * * * *', 'select public.expire_due_providers()');
  else
    raise notice 'pg_cron job not scheduled in database %', current_database();
  end if;
end $$;

-- M3
revoke insert, update, delete, truncate, trigger, references
  on public.staff_credential_events, public.provider_verification_cases, public.staff_credential_documents
  from service_role;

-- M4. Same signature as 001000; CREATE OR REPLACE keeps its grants. Only the cap changed.
create or replace function public.add_staff_credential_document(p_case_id uuid,p_content_type text,p_expires_at timestamptz,p_expected_version integer)
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
 if (select count(*) from public.staff_credential_documents where case_id=c.id and status in ('pending','verified'))>=50
 then raise exception using errcode='53300',message='document_limit'; end if;
 select p.category into category from public.providers p where p.id=c.provider_id;
 update public.staff_credential_documents set status='superseded' where case_id=c.id and status='pending';
 insert into public.staff_credential_documents(id,case_id,uploaded_by_profile_id,kind,object_name,content_type,expires_at)
 values(doc,c.id,actor,providers_private.required_kind(category),'staff/'||c.id::text||'/'||doc::text||case p_content_type
 when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,p_content_type,p_expires_at) returning * into d;
 update public.provider_verification_cases set version=version+1,updated_at=clock_timestamp() where id=c.id;
 perform providers_private.staff_event(c.id,'document_added');
 return jsonb_build_object('id',d.id,'bucket_id',d.bucket_id,'object_name',d.object_name,'version',c.version+1);
end $$;

-- M7. Same signature as 001100; CREATE OR REPLACE keeps its grants. Only the provider key changed.
create or replace function public.get_booking(p_booking_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b public.bookings; result jsonb; patient boolean; details boolean; begin
 if not identity_private.active_account() then raise exception using errcode='42501',message='forbidden'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 patient:=booking_private.patient(b.patient_id,'booking:read');
 if not patient and not booking_private.scheduler(b.provider_id) and not (identity_private.is_assigned(b.id,'doctor_visit')
 or identity_private.is_assigned(b.id,'lab_collection') or identity_private.is_assigned(b.id,'caretaker') or identity_private.is_assigned(b.id,'driver'))
 then raise exception using errcode='P0002',message='not_found'; end if;
 result:=jsonb_build_object('id',b.id,'public_ref',b.public_ref,
 'provider_reference',(select p.public_reference from public.providers p where p.id=b.provider_id),'category',b.category,'service_id',b.service_id,
 'pin_code',b.address_snapshot->>'pin_code','start_at',b.start_at,'end_at',b.end_at,'state',b.state,'version',b.version,
 'amount_paise',b.amount_paise::text,'currency',b.currency,'terms_version',b.terms_version,'policy_version_id',b.policy_version_id);
 details:=patient or (b.state in ('confirmed','in_progress') and public.provider_is_publishable(b.provider_id)
 and clock_timestamp()>=b.start_at-interval '60 minutes' and clock_timestamp()<b.end_at+interval '12 hours'
 and (booking_private.scheduler(b.provider_id) or identity_private.is_assigned(b.id,'doctor_visit') or identity_private.is_assigned(b.id,'lab_collection')
 or identity_private.is_assigned(b.id,'caretaker') or identity_private.is_assigned(b.id,'driver')));
 if details then result:=result||jsonb_build_object('patient_id',b.patient_id,'address_snapshot',b.address_snapshot,'contact_snapshot',b.contact_snapshot); end if;
 if b.category='doctor' then result:=result||jsonb_build_object('substate',(select substate from public.doctor_visits where booking_id=b.id)); end if;
 return result;
end $$;

notify pgrst, 'reload schema';
commit;
