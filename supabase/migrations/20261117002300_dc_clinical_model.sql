-- DC clinical core 1/2: model / Kiro / feat/DC-clinical-core / base integ/all bed2877.
-- DB NOT EXECUTED. Authored and desk-checked only; no Docker or database was available.
-- Design: docs/specs/DC_clinical_core_design.md (DC04 vitals and examination, DC06 assessment,
-- DC07 finalized record, DC08 structured prescription). Synthetic data only; Q09: nothing here
-- activates clinical use. Every write is behind the database gate doctor_clinical, seeded off.
-- This file:
--  * schema clinical_private, closed to every API role (service_role included);
--  * clinical_private.rules(): limits, enums and patterns, mirrored by src/lib/clinical/rules.ts;
--  * content validators (check_content, check_sign), vital warnings and the allergy name match;
--  * consultations (one mutable draft per doctor booking), clinical_records (immutable signed
--    versions; amendments are new rows), prescription_items (immutable typed rows of a record);
--  * guard triggers as the backstop for a definer bug; no RLS policy, so direct reads are denied.
-- Not here: commands, predicates and reads (20261117002310).
-- Guarantees hold for application roles; the table owner can still disable triggers.
begin;

do $$ declare o text; begin
 foreach o in array array['booking_private.gate_state(text)','booking_private.request_hash(jsonb)',
  'booking_private.replay(uuid,text,uuid,text)','booking_private.record_request(uuid,text,uuid,text,uuid,integer)',
  'booking_private.immutable()','booking_private.patient(uuid,text)','booking_private.resource_eligible(uuid,uuid)',
  'identity_private.require_actor()','identity_private.active_account()','providers_private.person_is_verified(uuid,uuid)',
  'public.provider_is_publishable(uuid)','doctor_private.assignee(uuid)'] loop
  if to_regprocedure(o) is null then raise exception 'DC clinical core requires function %',o; end if;
 end loop;
 foreach o in array array['booking_private.feature_gates','public.doctor_visits','public.booking_assignments','public.audit_events'] loop
  if to_regclass(o) is null then raise exception 'DC clinical core requires table %',o; end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.doctor_visits'::regclass and conname='doctor_visits_substate_check'
  and pg_get_constraintdef(oid) like '%service_started%' and pg_get_constraintdef(oid) like '%interrupted%') then
  raise exception 'DC clinical core requires the S01 doctor substates (20261117001610)'; end if;
end $$;

create schema clinical_private;
revoke all on schema clinical_private from public, anon, authenticated, service_role;

-- Design A7. Seeded off; OD-6: changed by a reviewed migration or a recorded owner SQL step.
insert into booking_private.feature_gates(key) values ('doctor_clinical') on conflict do nothing;

-- One source for every limit. PARITY: the JSON literal must equal CLINICAL_RULES.
create function clinical_private.rules() returns jsonb language sql immutable set search_path='' as $$
 select '{
  "vitals": {
   "temperature_c": {"min": 25, "max": 45, "decimals": 1, "code": "temperature", "warn_below": 35, "warn_from": 39.5},
   "temperature_f": {"min": 77, "max": 113, "decimals": 1, "code": "temperature", "warn_below": 95, "warn_from": 103.1},
   "systolic": {"min": 40, "max": 300, "decimals": 0, "code": "systolic", "warn_below": 90, "warn_from": 180},
   "diastolic": {"min": 20, "max": 200, "decimals": 0, "code": "diastolic", "warn_from": 120},
   "pulse_bpm": {"min": 20, "max": 250, "decimals": 0, "code": "pulse", "warn_below": 40, "warn_from": 131},
   "spo2_pct": {"min": 50, "max": 100, "decimals": 0, "code": "spo2", "warn_below": 92},
   "resp_rate": {"min": 4, "max": 70, "decimals": 0, "code": "resp_rate", "warn_below": 8, "warn_from": 31},
   "height_cm": {"min": 30, "max": 250, "decimals": 1},
   "weight_kg": {"min": 0.5, "max": 400, "decimals": 1}
  },
  "numbers": {
   "duration_days": {"min": 1, "max": 365, "decimals": 0},
   "quantity": {"min": 1, "max": 1000, "decimals": 0}
  },
  "text": {
   "chief_complaint": 500, "symptom_duration": 100, "findings": 4000, "summary": 2000, "diagnosis_label": 200, "list_item": 200,
   "substance": 100, "reaction": 200, "medication_name": 200, "strength": 100, "dose": 100, "instructions": 500, "override_reason": 300,
   "advice": 2000, "follow_up_note": 500, "test_name": 200, "test_reason": 300, "referral": 500, "red_flag_advice": 1000, "amendment_reason": 500
  },
  "lists": {"diagnoses": 10, "differentials": 10, "red_flags": 10, "allergies": 20, "prescription_items": 15, "tests": 10, "acknowledged_warnings": 10},
  "enums": {
   "temperature_unit": ["C", "F"],
   "assessment_certainty": ["provisional", "final", "undetermined"],
   "diagnosis_certainty": ["suspected", "probable", "confirmed"],
   "outcome": ["self_care", "follow_up", "tests_advised", "referred", "emergency_referral"],
   "allergy_status": ["none_known", "recorded", "not_assessed"],
   "prescription_status": ["none_indicated", "prescribed"],
   "form": ["tablet", "capsule", "syrup", "suspension", "injection", "ointment", "cream", "gel", "drops", "inhaler", "powder", "other"],
   "route": ["oral", "sublingual", "topical", "inhaled", "nasal", "ophthalmic", "otic", "intramuscular", "intravenous", "subcutaneous", "rectal", "other"],
   "frequency": ["once_daily", "twice_daily", "three_times_daily", "four_times_daily", "every_4_hours", "every_6_hours", "every_8_hours",
    "at_bedtime", "as_needed", "single_dose", "other"],
   "vital_warnings": ["temperature_low", "temperature_high", "systolic_low", "systolic_high", "diastolic_high", "pulse_low", "pulse_high",
    "spo2_low", "resp_rate_low", "resp_rate_high"]
  },
  "patterns": {
   "diagnosis_code": "^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$",
   "date": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
  }
 }'::jsonb; -- END PARITY
$$;

-- Validators. Each helper returns true for an absent value (SQL null) and false for any value of
-- the wrong JSON type, JSON null included. plpgsql IF keeps the evaluation order explicit.
create function clinical_private.need(p_ok boolean,p_message text default 'invalid_input') returns void
language plpgsql immutable set search_path='' as $$
begin if p_ok is not true then raise exception using errcode='22023',message=p_message; end if; end $$;

create function clinical_private.obj(v jsonb,allowed text[]) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if v is null then return true; end if;
 if jsonb_typeof(v)<>'object' then return false; end if;
 return not exists(select 1 from jsonb_object_keys(v) k where not k=any(allowed));
end $$;

create function clinical_private.txt(v jsonb,limit_key text) returns boolean language plpgsql immutable set search_path='' as $$
declare m integer:=(clinical_private.rules()->'text'->>limit_key)::integer; s text; begin
 if m is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if v is null then return true; end if;
 if jsonb_typeof(v)<>'string' then return false; end if;
 s:=v#>>'{}';
 return char_length(btrim(s))>=1 and char_length(s)<=m;
end $$;

create function clinical_private.one_of(v jsonb,enum_key text) returns boolean language plpgsql immutable set search_path='' as $$
declare e jsonb:=clinical_private.rules()->'enums'->enum_key; begin
 if e is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if v is null then return true; end if;
 if jsonb_typeof(v)<>'string' then return false; end if;
 return e ? (v#>>'{}');
end $$;

create function clinical_private.num(v jsonb,lim jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare n numeric; f numeric; begin
 if lim is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if v is null then return true; end if;
 if jsonb_typeof(v)<>'number' then return false; end if;
 n:=(v#>>'{}')::numeric; f:=power(10::numeric,(lim->>'decimals')::numeric);
 return n between (lim->>'min')::numeric and (lim->>'max')::numeric and n*f=trunc(n*f);
end $$;

create function clinical_private.list(v jsonb,list_key text) returns boolean language plpgsql immutable set search_path='' as $$
declare m integer:=(clinical_private.rules()->'lists'->>list_key)::integer; begin
 if m is null then raise exception using errcode='22023',message='invalid_input'; end if;
 if v is null then return true; end if;
 if jsonb_typeof(v)<>'array' then return false; end if;
 return jsonb_array_length(v)<=m;
end $$;

-- An array of non-empty strings within the list and text limits.
create function clinical_private.strings(v jsonb,list_key text,text_key text) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if not clinical_private.list(v,list_key) then return false; end if;
 if v is null then return true; end if;
 return not exists(select 1 from jsonb_array_elements(v) w where jsonb_typeof(w)<>'string' or not clinical_private.txt(w,text_key));
end $$;

create function clinical_private.date_ok(v jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare s text; d date; begin
 if v is null then return true; end if;
 if jsonb_typeof(v)<>'string' then return false; end if;
 s:=v#>>'{}';
 if s !~ (clinical_private.rules()->'patterns'->>'date') then return false; end if;
 begin d:=s::date; exception when others then return false; end;
 return to_char(d,'YYYY-MM-DD')=s;
end $$;

-- Structural check for drafts (p_final=false): known keys, JSON types, units, hard limits and
-- list sizes; any partial content passes. p_final=true adds the fields a signed record needs
-- (message clinical_incomplete). Values inside the hard limits are never changed.
create function clinical_private.check_content(c jsonb,p_final boolean) returns void language plpgsql stable set search_path='' as $$
declare r jsonb:=clinical_private.rules(); v jsonb; e jsonb; a jsonb; x jsonb; pr jsonb; pl jsonb; allergy_count integer; item_count integer; begin
 perform clinical_private.need(c is not null and p_final is not null);
 perform clinical_private.need(jsonb_typeof(c)='object' and octet_length(c::text)<=65536);
 perform clinical_private.need(clinical_private.obj(c,array['vitals','examination','assessment','allergies','prescription','plan']));
 v:=c->'vitals'; e:=c->'examination'; a:=c->'assessment'; x:=c->'allergies'; pr:=c->'prescription'; pl:=c->'plan';

 -- DC04 vitals: explicit units, hard limits, decimals; systolic and diastolic come together.
 perform clinical_private.need(clinical_private.obj(v,array['temperature','systolic','diastolic','pulse_bpm','spo2_pct','resp_rate',
  'height_cm','weight_kg','acknowledged_warnings']));
 if v is not null then
  if v ? 'temperature' then
   perform clinical_private.need(clinical_private.obj(v->'temperature',array['value','unit']) and jsonb_typeof(v->'temperature')='object');
   perform clinical_private.need((v->'temperature') ? 'value' and (v->'temperature') ? 'unit');
   perform clinical_private.need(clinical_private.one_of(v#>'{temperature,unit}','temperature_unit'));
   perform clinical_private.need(clinical_private.num(v#>'{temperature,value}',
    r->'vitals'->(case v#>>'{temperature,unit}' when 'F' then 'temperature_f' else 'temperature_c' end)));
  end if;
  perform clinical_private.need(clinical_private.num(v->'systolic',r#>'{vitals,systolic}') and clinical_private.num(v->'diastolic',r#>'{vitals,diastolic}')
   and clinical_private.num(v->'pulse_bpm',r#>'{vitals,pulse_bpm}') and clinical_private.num(v->'spo2_pct',r#>'{vitals,spo2_pct}')
   and clinical_private.num(v->'resp_rate',r#>'{vitals,resp_rate}') and clinical_private.num(v->'height_cm',r#>'{vitals,height_cm}')
   and clinical_private.num(v->'weight_kg',r#>'{vitals,weight_kg}'));
  perform clinical_private.need((v ? 'systolic')=(v ? 'diastolic'));
  if v ? 'systolic' then perform clinical_private.need((v->>'diastolic')::numeric<(v->>'systolic')::numeric); end if;
  perform clinical_private.need(clinical_private.list(v->'acknowledged_warnings','acknowledged_warnings'));
  if v ? 'acknowledged_warnings' then
   perform clinical_private.need(not exists(select 1 from jsonb_array_elements(v->'acknowledged_warnings') w where not clinical_private.one_of(w,'vital_warnings'))
    and (select count(distinct w)=count(*) from jsonb_array_elements(v->'acknowledged_warnings') w));
  end if;
 end if;

 perform clinical_private.need(clinical_private.obj(e,array['chief_complaint','symptom_duration','findings'])
  and clinical_private.txt(e->'chief_complaint','chief_complaint') and clinical_private.txt(e->'symptom_duration','symptom_duration')
  and clinical_private.txt(e->'findings','findings'));

 -- DC06: clinician-authored assessment; certainty is explicit and may be undetermined.
 perform clinical_private.need(clinical_private.obj(a,array['summary','certainty','diagnoses','differentials','red_flags','outcome'])
  and clinical_private.txt(a->'summary','summary') and clinical_private.one_of(a->'certainty','assessment_certainty')
  and clinical_private.one_of(a->'outcome','outcome') and clinical_private.list(a->'diagnoses','diagnoses'));
 perform clinical_private.need(clinical_private.strings(a->'differentials','differentials','list_item')
  and clinical_private.strings(a->'red_flags','red_flags','list_item'));
 if a ? 'diagnoses' then
  perform clinical_private.need(not exists(select 1 from jsonb_array_elements(a->'diagnoses') d where not (jsonb_typeof(d)='object'
   and clinical_private.obj(d,array['label','code','certainty']) and clinical_private.txt(d->'label','diagnosis_label')
   and clinical_private.one_of(d->'certainty','diagnosis_certainty')
   and (d->'code' is null or (jsonb_typeof(d->'code')='string' and (d->>'code') ~ (r->'patterns'->>'diagnosis_code'))))));
 end if;

 perform clinical_private.need(clinical_private.obj(x,array['status','items']) and clinical_private.one_of(x->'status','allergy_status')
  and clinical_private.list(x->'items','allergies'));
 if x ? 'items' then
  perform clinical_private.need(not exists(select 1 from jsonb_array_elements(x->'items') i where not (jsonb_typeof(i)='object'
   and clinical_private.obj(i,array['substance','reaction']) and clinical_private.txt(i->'substance','substance') and clinical_private.txt(i->'reaction','reaction'))));
 end if;

 -- DC08: typed medication fields; no medicine is required.
 perform clinical_private.need(clinical_private.obj(pr,array['status','items']) and clinical_private.one_of(pr->'status','prescription_status')
  and clinical_private.list(pr->'items','prescription_items'));
 if pr ? 'items' then
  perform clinical_private.need(not exists(select 1 from jsonb_array_elements(pr->'items') i where not (jsonb_typeof(i)='object'
   and clinical_private.obj(i,array['medication_name','form','strength','dose','route','frequency','duration_days','quantity','instructions','allergy_override_reason'])
   and clinical_private.txt(i->'medication_name','medication_name') and clinical_private.one_of(i->'form','form')
   and clinical_private.txt(i->'strength','strength') and clinical_private.txt(i->'dose','dose') and clinical_private.one_of(i->'route','route')
   and clinical_private.one_of(i->'frequency','frequency') and clinical_private.num(i->'duration_days',r#>'{numbers,duration_days}')
   and clinical_private.num(i->'quantity',r#>'{numbers,quantity}') and clinical_private.txt(i->'instructions','instructions')
   and clinical_private.txt(i->'allergy_override_reason','override_reason'))));
 end if;

 perform clinical_private.need(clinical_private.obj(pl,array['advice','follow_up_on','follow_up_note','tests','referral','red_flag_advice'])
  and clinical_private.txt(pl->'advice','advice') and clinical_private.date_ok(pl->'follow_up_on') and clinical_private.txt(pl->'follow_up_note','follow_up_note')
  and clinical_private.txt(pl->'referral','referral') and clinical_private.txt(pl->'red_flag_advice','red_flag_advice') and clinical_private.list(pl->'tests','tests'));
 if pl ? 'tests' then
  perform clinical_private.need(not exists(select 1 from jsonb_array_elements(pl->'tests') t where not (jsonb_typeof(t)='object'
   and clinical_private.obj(t,array['name','reason']) and clinical_private.txt(t->'name','test_name') and clinical_private.txt(t->'reason','test_reason'))));
 end if;

 if not p_final then return; end if;
 perform clinical_private.need(c#>'{examination,findings}' is not null and c#>'{assessment,summary}' is not null
  and c#>'{assessment,certainty}' is not null and c#>'{assessment,outcome}' is not null
  and c#>'{allergies,status}' is not null and c#>'{prescription,status}' is not null,'clinical_incomplete');
 allergy_count:=coalesce(jsonb_array_length(x->'items'),0);
 item_count:=coalesce(jsonb_array_length(pr->'items'),0);
 perform clinical_private.need(case when x->>'status'='recorded' then allergy_count>0 else allergy_count=0 end,'clinical_incomplete');
 perform clinical_private.need(case when pr->>'status'='prescribed' then item_count>0 else item_count=0 end,'clinical_incomplete');
 perform clinical_private.need(not (item_count>0 and x->>'status'='not_assessed'),'clinical_incomplete');
 perform clinical_private.need(a->>'certainty'<>'final' or coalesce(jsonb_array_length(a->'diagnoses'),0)>0,'clinical_incomplete');
 perform clinical_private.need(not exists(select 1 from jsonb_array_elements(coalesce(a->'diagnoses','[]'::jsonb)) d
  where d->'label' is null or d->'certainty' is null),'clinical_incomplete');
 perform clinical_private.need(not exists(select 1 from jsonb_array_elements(coalesce(x->'items','[]'::jsonb)) i where i->'substance' is null),'clinical_incomplete');
 perform clinical_private.need(not exists(select 1 from jsonb_array_elements(coalesce(pr->'items','[]'::jsonb)) i
  where i->'medication_name' is null or i->'form' is null or i->'dose' is null or i->'route' is null or i->'frequency' is null),'clinical_incomplete');
 perform clinical_private.need(not exists(select 1 from jsonb_array_elements(coalesce(pl->'tests','[]'::jsonb)) t where t->'name' is null),'clinical_incomplete');
end $$;

-- Warning codes for readings inside the hard limits but outside the warning limits. Loop order
-- is part of the contract (VITAL_WARNING_ORDER in src/lib/clinical/rules.ts).
create function clinical_private.vital_warnings(v jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare lim jsonb:=clinical_private.rules()->'vitals'; w text[]:='{}'; k text; val numeric; e jsonb; begin
 if v is null or jsonb_typeof(v)<>'object' then return w; end if;
 foreach k in array array['temperature','systolic','diastolic','pulse_bpm','spo2_pct','resp_rate'] loop
  if k='temperature' then
   if jsonb_typeof(v#>'{temperature,value}') is distinct from 'number' then continue; end if;
   val:=(v#>>'{temperature,value}')::numeric;
   e:=lim->(case when v#>>'{temperature,unit}'='F' then 'temperature_f' else 'temperature_c' end);
  else
   if jsonb_typeof(v->k) is distinct from 'number' then continue; end if;
   val:=(v->>k)::numeric; e:=lim->k;
  end if;
  if e ? 'warn_below' and val<(e->>'warn_below')::numeric then w:=w||((e->>'code')||'_low'); end if;
  if e ? 'warn_from' and val>=(e->>'warn_from')::numeric then w:=w||((e->>'code')||'_high'); end if;
 end loop;
 return w;
end $$;

-- 1-based prescription lines whose medication name and a recorded allergy substance contain
-- one another, case-insensitive, both at least 3 characters. Name match only (design DCQ-6).
create function clinical_private.allergy_conflicts(c jsonb) returns integer[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(s.n order by s.n),'{}'::integer[]) from (
  select distinct i.n::integer as n
  from jsonb_array_elements(case when jsonb_typeof(c#>'{prescription,items}')='array' then c#>'{prescription,items}' else '[]'::jsonb end) with ordinality i(item,n)
  cross join jsonb_array_elements(case when jsonb_typeof(c#>'{allergies,items}')='array' then c#>'{allergies,items}' else '[]'::jsonb end) al(a)
  where jsonb_typeof(i.item->'medication_name')='string' and jsonb_typeof(al.a->'substance')='string'
  and char_length(btrim(al.a->>'substance'))>=3 and char_length(btrim(i.item->>'medication_name'))>=3
  and (strpos(lower(i.item->>'medication_name'),lower(btrim(al.a->>'substance')))>0
   or strpos(lower(btrim(al.a->>'substance')),lower(btrim(i.item->>'medication_name')))>0)) s;
$$;

-- Everything a signature needs, in this order: complete content, acknowledged warnings, an
-- override reason on every allergy match, the clinician's attestations.
create function clinical_private.check_sign(c jsonb,p_authored boolean,p_allergies_reviewed boolean) returns void
language plpgsql stable set search_path='' as $$
begin
 perform clinical_private.check_content(c,true);
 perform clinical_private.need(clinical_private.vital_warnings(c->'vitals')
  <@ array(select jsonb_array_elements_text(coalesce(c#>'{vitals,acknowledged_warnings}','[]'::jsonb))),'warning_unacknowledged');
 perform clinical_private.need(not exists(select 1 from unnest(clinical_private.allergy_conflicts(c)) n
  where (c#>'{prescription,items}'->(n-1))->'allergy_override_reason' is null),'allergy_conflict');
 perform clinical_private.need(p_authored is true,'attestation_required');
 perform clinical_private.need(coalesce(jsonb_array_length(c#>'{prescription,items}'),0)=0 or p_allergies_reviewed is true,'attestation_required');
end $$;

-- DC04/DC05: one draft per doctor booking. Content changes only with version+1; after signing
-- only latest_record_id moves, to the record that supersedes the current one.
create table clinical_private.consultations (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.bookings(id),
 patient_id uuid not null references public.patients(id),
 provider_id uuid not null references public.providers(id),
 assignment_id uuid not null references public.booking_assignments(id),
 author_profile_id uuid not null references public.profiles(id),
 status text not null default 'draft' check (status in ('draft','signed')),
 version integer not null default 1 check (version between 1 and 5000),
 content jsonb not null check (jsonb_typeof(content)='object'),
 saved_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 latest_record_id uuid,
 check ((status='draft')=(latest_record_id is null))
);

-- DC07: signed versions. Insert only. supersedes_record_id is unique, so a chain never forks.
create table clinical_private.clinical_records (
 id uuid primary key,
 consultation_id uuid not null references clinical_private.consultations(id),
 booking_id uuid not null references public.bookings(id),
 patient_id uuid not null references public.patients(id),
 provider_id uuid not null references public.providers(id),
 root_record_id uuid not null references clinical_private.clinical_records(id),
 record_version integer not null check (record_version between 1 and 1000),
 kind text not null check (kind in ('original','amendment')),
 supersedes_record_id uuid unique references clinical_private.clinical_records(id),
 amendment_reason text check (amendment_reason is null or (char_length(btrim(amendment_reason))>=1 and char_length(amendment_reason)<=500)),
 signed_by uuid not null references public.profiles(id),
 signed_at timestamptz not null default clock_timestamp(),
 source_draft_version integer check (source_draft_version>0),
 content jsonb not null check (jsonb_typeof(content)='object'),
 content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
 unique (consultation_id,record_version),
 check ((kind='original')=(record_version=1)),
 check ((kind='original')=(supersedes_record_id is null)),
 check ((kind='original')=(amendment_reason is null)),
 check ((kind='original')=(source_draft_version is not null)),
 check ((kind='original')=(root_record_id=id))
);
create index dc_records_booking on clinical_private.clinical_records(booking_id,record_version);
create index dc_records_patient on clinical_private.clinical_records(patient_id);
alter table clinical_private.consultations add constraint consultations_latest_record_fk
 foreign key (latest_record_id) references clinical_private.clinical_records(id);

-- DC08: typed rows of a signed prescription, equal to the record's frozen content line by line.
create table clinical_private.prescription_items (
 record_id uuid not null references clinical_private.clinical_records(id),
 line_no integer not null check (line_no between 1 and 15),
 medication_name text not null check (char_length(btrim(medication_name))>=1 and char_length(medication_name)<=200),
 form text not null check ((clinical_private.rules()->'enums'->'form') ? form),
 strength text check (strength is null or (char_length(btrim(strength))>=1 and char_length(strength)<=100)),
 dose text not null check (char_length(btrim(dose))>=1 and char_length(dose)<=100),
 route text not null check ((clinical_private.rules()->'enums'->'route') ? route),
 frequency text not null check ((clinical_private.rules()->'enums'->'frequency') ? frequency),
 duration_days integer check (duration_days between 1 and 365),
 quantity integer check (quantity between 1 and 1000),
 instructions text check (instructions is null or (char_length(btrim(instructions))>=1 and char_length(instructions)<=500)),
 allergy_override_reason text check (allergy_override_reason is null or (char_length(btrim(allergy_override_reason))>=1 and char_length(allergy_override_reason)<=300)),
 primary key (record_id,line_no)
);

create function clinical_private.guard_consultation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception using errcode='55000',message='immutable_record'; end if;
 if TG_OP='INSERT' then
  if new.status<>'draft' or new.version<>1 or new.latest_record_id is not null or not exists(select 1 from public.bookings b
   join public.doctor_visits v on v.booking_id=b.id where b.id=new.booking_id and b.category='doctor' and b.patient_id=new.patient_id
   and b.provider_id=new.provider_id and v.assignment_id=new.assignment_id) then
   raise exception using errcode='55000',message='invalid_transition'; end if;
  return new;
 end if;
 if (new.id,new.booking_id,new.patient_id,new.provider_id,new.assignment_id,new.author_profile_id,new.created_at)
  is distinct from (old.id,old.booking_id,old.patient_id,old.provider_id,old.assignment_id,old.author_profile_id,old.created_at) then
  raise exception using errcode='55000',message='immutable_record'; end if;
 if old.status='draft' and new.status='draft' then
  if new.version<>old.version+1 or new.latest_record_id is not null then raise exception using errcode='55000',message='invalid_transition'; end if;
 elsif old.status='draft' and new.status='signed' then
  if new.version<>old.version or new.content is distinct from old.content or new.saved_at is distinct from old.saved_at
   or not exists(select 1 from clinical_private.clinical_records r where r.id=new.latest_record_id and r.consultation_id=new.id
    and r.record_version=1 and r.source_draft_version=old.version and r.content=old.content) then
   raise exception using errcode='55000',message='invalid_transition'; end if;
 elsif old.status='signed' and new.status='signed' then
  if new.version<>old.version or new.content is distinct from old.content or new.saved_at is distinct from old.saved_at
   or not exists(select 1 from clinical_private.clinical_records r where r.id=new.latest_record_id and r.consultation_id=new.id
    and r.supersedes_record_id=old.latest_record_id) then
   raise exception using errcode='55000',message='invalid_transition'; end if;
 else
  raise exception using errcode='55000',message='invalid_transition';
 end if;
 return new;
end $$;
create trigger dc_consultation_guard before insert or update or delete on clinical_private.consultations
 for each row execute function clinical_private.guard_consultation();
create trigger dc_consultation_no_truncate before truncate on clinical_private.consultations
 for each statement execute function booking_private.immutable();

-- The hash is always computed here, so a caller cannot store a hash for other content. An
-- original matches its consultation; an amendment continues its predecessor's chain.
create function clinical_private.guard_record() returns trigger language plpgsql security definer set search_path='' as $$
declare prior clinical_private.clinical_records; begin
 new.content_sha256:=encode(sha256(convert_to(new.content::text,'UTF8')),'hex');
 if new.kind='original' then
  if not exists(select 1 from clinical_private.consultations c where c.id=new.consultation_id and c.booking_id=new.booking_id
   and c.patient_id=new.patient_id and c.provider_id=new.provider_id and c.author_profile_id=new.signed_by and c.status='draft') then
   raise exception using errcode='55000',message='invalid_transition'; end if;
 else
  select * into prior from clinical_private.clinical_records where id=new.supersedes_record_id;
  if prior.id is null or prior.consultation_id<>new.consultation_id or prior.booking_id<>new.booking_id or prior.patient_id<>new.patient_id
   or prior.provider_id<>new.provider_id or prior.root_record_id<>new.root_record_id or prior.signed_by<>new.signed_by
   or new.record_version<>prior.record_version+1 then
   raise exception using errcode='55000',message='invalid_transition'; end if;
 end if;
 return new;
end $$;
create trigger dc_record_guard before insert on clinical_private.clinical_records
 for each row execute function clinical_private.guard_record();
create trigger dc_record_immutable before update or delete on clinical_private.clinical_records
 for each row execute function booking_private.immutable();
create trigger dc_record_no_truncate before truncate on clinical_private.clinical_records
 for each statement execute function booking_private.immutable();

create function clinical_private.guard_item() returns trigger language plpgsql security definer set search_path='' as $$
declare i jsonb; begin
 select r.content#>array['prescription','items',(new.line_no-1)::text] into i from clinical_private.clinical_records r where r.id=new.record_id;
 if i is null or jsonb_typeof(i)<>'object' or new.medication_name is distinct from i->>'medication_name' or new.form is distinct from i->>'form'
  or new.strength is distinct from i->>'strength' or new.dose is distinct from i->>'dose' or new.route is distinct from i->>'route'
  or new.frequency is distinct from i->>'frequency' or new.duration_days is distinct from (i->>'duration_days')::numeric::integer
  or new.quantity is distinct from (i->>'quantity')::numeric::integer or new.instructions is distinct from i->>'instructions'
  or new.allergy_override_reason is distinct from i->>'allergy_override_reason' then
  raise exception using errcode='55000',message='invalid_transition'; end if;
 return new;
end $$;
create trigger dc_item_guard before insert on clinical_private.prescription_items
 for each row execute function clinical_private.guard_item();
create trigger dc_item_immutable before update or delete on clinical_private.prescription_items
 for each row execute function booking_private.immutable();
create trigger dc_item_no_truncate before truncate on clinical_private.prescription_items
 for each statement execute function booking_private.immutable();

-- Deny by default: RLS on, no policy, no privilege for any API role (service_role included).
do $$ declare t text; begin
 foreach t in array array['consultations','clinical_records','prescription_items'] loop
  execute format('alter table clinical_private.%I enable row level security',t);
  execute format('revoke all on clinical_private.%I from public, anon, authenticated, service_role',t);
 end loop;
end $$;
revoke all on all functions in schema clinical_private from public, anon, authenticated, service_role;
commit;
