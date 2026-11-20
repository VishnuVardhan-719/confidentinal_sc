-- DC extras 6/6 / Kiro / feat/DC-extras / base integ/all bed2877.
-- Design §8: DC14 PDF report of a finalized clinical record. Synthetic local/staging only.
-- Authored, DB NOT EXECUTED.
--
-- REQUIRES feat/DC-clinical-core (migrations 0023xx) merged first: it binds to that block's
-- stable interface (docs/specs/DC_clinical_core_design.md §1): clinical_private.record_reader,
-- clinical_private.record_document and clinical_private.clinical_records. The preflight stops
-- here if they are missing.
--
-- No bucket and no stored PDF. The route POST /api/clinical-records/:id/report reads the
-- signed version through get_clinical_report_source (record_reader: linked patient or the
-- signer), renders it with the deterministic TypeScript writer (src/lib/pdf), records the
-- render here and streams the bytes with Cache-Control private, no-store. Every download is
-- authorized per request, so there is no URL to leak or expire. An amendment is a new record
-- id and version, so it renders a new PDF and never overwrites the old one.
-- clinical_report_renders is an append-only log (who rendered which record version with which
-- renderer, and the PDF hash the server computed). The authoritative content is the immutable
-- record and its content_sha256, which the PDF prints. Because the hash comes from the caller,
-- rows are deduplicated per (record, renderer, hash, caller) and capped at 20 per caller and
-- record; a wrong hash cannot change the record or block another reader.
begin;

do $$ declare obj text; begin
 foreach obj in array array['dcx_private.require_feature(text,text)','clinical_private.record_reader(uuid)','clinical_private.record_document(uuid)'] loop
  if to_regprocedure(obj) is null then raise exception 'DC extras 002450 preflight: missing % (merge feat/DC-clinical-core first)',obj; end if;
 end loop;
 if to_regclass('clinical_private.clinical_records') is null then
  raise exception 'DC extras 002450 preflight: missing clinical_private.clinical_records (merge feat/DC-clinical-core first)'; end if;
end $$;

insert into booking_private.feature_gates(key) values ('doctor_reports') on conflict do nothing;

create table public.clinical_report_renders (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references clinical_private.clinical_records(id) on delete restrict,
 record_version integer not null check (record_version>0),
 record_content_sha256 text not null check (record_content_sha256 ~ '^[0-9a-f]{64}$'),
 renderer_version text not null check (renderer_version ~ '^[a-z0-9.-]{1,32}$'),
 pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
 rendered_by_profile_id uuid not null references public.profiles(id) on delete restrict,
 rendered_at timestamptz not null default clock_timestamp(),
 unique (record_id,renderer_version,pdf_sha256,rendered_by_profile_id)
);
create trigger dcx_render_immutable before update or delete on public.clinical_report_renders for each row execute function booking_private.immutable();
create trigger dcx_render_no_truncate before truncate on public.clinical_report_renders for each statement execute function booking_private.immutable();
alter table public.clinical_report_renders enable row level security;
revoke all on public.clinical_report_renders from public,anon,authenticated,service_role;

-- Read phase: gate on or suspended, so a suspension never hides a signed record's report.
create function public.get_clinical_report_source(p_record_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); begin
 if p_record_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 perform dcx_private.require_feature('doctor_reports','read');
 if not coalesce(clinical_private.record_reader(p_record_id),false) then raise exception using errcode='P0002',message='not_found'; end if;
 insert into public.audit_events(actor_profile_id,action,target_type,target_id) values(actor,'clinical.report_generated','clinical_record',p_record_id);
 return clinical_private.record_document(p_record_id);
end $$;

create function public.record_clinical_report(p_record_id uuid,p_renderer_version text,p_pdf_sha256 text,p_request_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); h text; prior record; r clinical_private.clinical_records; rid uuid; begin
 if p_record_id is null or p_request_key is null or p_renderer_version is null or p_renderer_version !~ '^[a-z0-9.-]{1,32}$'
 or p_pdf_sha256 is null or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='invalid_input'; end if;
 h:=booking_private.request_hash(jsonb_build_array(p_record_id,p_renderer_version,p_pdf_sha256));
 select * into prior from booking_private.replay(actor,'dcx.report.record',p_request_key,h);
 if prior.result_id is null then
  if not coalesce(clinical_private.record_reader(p_record_id),false) then raise exception using errcode='P0002',message='not_found'; end if;
  perform dcx_private.require_feature('doctor_reports','read');
  select * into r from clinical_private.clinical_records where id=p_record_id for share;
  perform pg_advisory_xact_lock(hashtextextended('dcx.report:'||p_record_id::text||':'||actor::text,0));
  select * into prior from booking_private.replay(actor,'dcx.report.record',p_request_key,h);
 end if;
 if prior.result_id is not null then
  return (select jsonb_build_object('render_id',x.id,'record_version',x.record_version,'pdf_sha256',x.pdf_sha256,'rendered_at',x.rendered_at)
   from public.clinical_report_renders x where x.id=prior.result_id);
 end if;
 select id into rid from public.clinical_report_renders where record_id=r.id and renderer_version=p_renderer_version
  and pdf_sha256=p_pdf_sha256 and rendered_by_profile_id=actor;
 if rid is null then
  if (select count(*) from public.clinical_report_renders where record_id=r.id and rendered_by_profile_id=actor)>=20 then
   raise exception using errcode='53300',message='report_limit'; end if;
  insert into public.clinical_report_renders(record_id,record_version,record_content_sha256,renderer_version,pdf_sha256,rendered_by_profile_id)
   values(r.id,r.record_version,r.content_sha256,p_renderer_version,p_pdf_sha256,actor) returning id into rid;
 end if;
 perform booking_private.record_request(actor,'dcx.report.record',p_request_key,h,rid,r.record_version);
 return (select jsonb_build_object('render_id',x.id,'record_version',x.record_version,'pdf_sha256',x.pdf_sha256,'rendered_at',x.rendered_at)
  from public.clinical_report_renders x where x.id=rid);
end $$;

-- Not a blanket revoke on dcx_private: 002440 grants the Storage predicate to authenticated.
do $$ declare f text; begin
 foreach f in array array['public.get_clinical_report_source(uuid)','public.record_clinical_report(uuid,text,text,uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
