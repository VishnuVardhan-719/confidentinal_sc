# I02 design: provider onboarding, private documents, admin verification

Status: design only (phase 1). No SQL written. Author: Kiro. Branch `task/I02-provider-onboarding`, base `develop`.
Inputs: `CANONICAL_SCHEMA_DRAFT.md` (sections 2-5, 8, 9), `PERMISSIONS.md`, `specs/ROLE_ONBOARDING_AND_PERMISSIONS.md`, `SOURCE_AUDIT_R01.md` (MR-22, MR-23), `DECISIONS.md`, and the I01 migration `20261117000100_i01_identity_organizations.sql` (read only).

## 0. Scope, files and blockers

| Item | Value |
|---|---|
| Migration | `supabase/migrations/20261117000200_i02_provider_onboarding.sql` (next after I01 `...000100`) |
| Tests | `supabase/tests/002_provider_onboarding.test.sql` (pgTAP, same style as `001_identity_rls.test.sql`: synthetic `auth.users`, `set local role authenticated`, JWT claims via `set_config`) |
| In scope | providers, 4 category extension tables, verification cases + events, document metadata, private bucket + storage RLS, review/suspend/expire commands, public directory view, audit |
| Out of scope (C01) | `provider_locations`, `provider_service_areas` (PIN coverage), services, prices, discovery search. Out of scope (B01/S01) | resources, assignments, bookings, auto-cancel on suspension (MR-22) |
| Blocker | The I02 worktree has no `supabase/` directory. I01 must be merged into `develop` (or the worktree rebased onto it) before I implement. I will not copy I01 files. |
| Defaults kept | Q03: no tax, GST, bank, payout or invoice fields. Q05: nothing is ever deleted, no retention period is encoded, synthetic data only, all FKs `RESTRICT`. Q06: one provider per owner+category, org brand approval never substitutes for staff licence. Q09: no clinical signatory or clinical-record fields. |

"Listed" and "bookable" differ. I02 only decides **verified and listed**. Bookable additionally needs PIN coverage and a published service (C01), and for clinicians an individually verified assignee (B01 via `private.person_is_verified`, section 9).

## 1. Reuse from I01

Reused unchanged: `private.is_active_account()`, `private.has_org_scope(org,scope)`, `private.has_admin_capability(cap,org)` (requires `aal2`, unexpired, unrevoked; a capability with `organization_id is null` is global), `private.touch_version()`, `audit_events` (append-only), the revoke-then-grant pattern, `set search_path = ''` on every definer function, errcodes `42501` (denied) and `40001` (version conflict).

Not reused: `private.audit_access_change()`. Its column allowlist does not cover provider columns and it derives the boundary only from `organization_id`. I02 adds `private.audit_provider_change()` with its own allowlist, writing to the same `audit_events` table.

Change list for Codex is in section 11.

## 2. Tables

All: `id uuid pk default gen_random_uuid()`, RLS enabled, `revoke all ... from public, anon, authenticated` first, then the explicit grants listed. Mutable tables carry `created_at, updated_at, version` plus I01's `touch_version` trigger. All FKs `on delete restrict`.

### 2.1 `providers`

| Column | Type / constraint |
|---|---|
| `category` | text not null check in (`doctor`,`lab`,`ambulance`,`caretaker`) |
| `individual_owner_profile_id` | uuid null, FK `profiles` |
| `organization_id` | uuid null, FK `organizations` |
| `public_reference` | text not null unique, e.g. `SCV-DOC-000001` (stored without `#`, MR-23). Prefix map DOC/LAB/AMB/CARE. |
| `display_name` | text not null check `char_length(btrim(x)) between 1 and 160` |
| `verification_state` | text not null default `draft`, check in the 6 states. Mirror of the provider-level case (2.3). Written only by section 6 commands. |
| `published_profile` | jsonb null. Frozen public snapshot copied from the approved case. |
| `published_at`, `verified_until` | timestamptz null |

Constraints:
- `check ((individual_owner_profile_id is null) <> (organization_id is null))` (exactly one owner).
- `check (category <> 'lab' or organization_id is not null)`. Labs are organizations only (ROP field catalogue). Ambulance individual is allowed pending OQ-2.
- `unique (id, category)` (target of composite FKs from extensions and, later, services/bookings).
- Partial unique `(individual_owner_profile_id, category) where individual_owner_profile_id is not null` and `(organization_id, category) where organization_id is not null`. This is the one-provider-per-owner+category rule.
- `check ((verification_state='approved') = (published_profile is not null and published_at is not null and verified_until is not null))`.
- Immutability trigger: `id, category, individual_owner_profile_id, organization_id, public_reference` cannot change (raise `42501`).
- `private.provider_reference_counters(prefix text pk, last_value bigint not null)`. Allocation: `update ... set last_value=last_value+1 returning` (row lock, no `MAX+1`, gaps allowed, never reused).
- Index: `(verification_state, category)`, `(organization_id)`.

Grants to `authenticated`: `select`; `update(display_name)` only. No insert/delete.

### 2.2 Category extensions (`doctor_profiles`, `lab_profiles`, `ambulance_profiles`, `caretaker_profiles`)

Each: `provider_id uuid not null unique`, `category text not null default '<cat>' check (category='<cat>')`, composite FK `(provider_id, category) -> providers(id, category)`. This makes "exactly one matching extension" a schema fact, not a trigger. The row is created together with the provider by `create_provider`, so every provider always has its extension. Field completeness is checked at submit time (section 6), so columns are nullable. Lengths: free text <= 500, bio <= 1000, arrays <= 10 items.

| Table | Public (goes into snapshot) | Private (never in snapshot) |
|---|---|---|
| `doctor_profiles` | `specialty`, `qualification`, `languages text[]`, `years_experience smallint 0..70`, `bio` | `registration_council`, `registration_number`, `private_phone` |
| `lab_profiles` | `accreditation_label`, `home_collection boolean`, `bio` | `legal_registration_number`, `management_contact` |
| `ambulance_profiles` | `fleet_types text[]` (subset of `basic`,`patient_transfer`), `bio` | `permit_number`, `dispatcher_contact` |
| `caretaker_profiles` | `skills text[]`, `languages text[]`, `bio` | `private_phone` |

`ambulance_profiles.scheduled_only boolean not null default true check (scheduled_only)`: emergency dispatch stays disabled by construction.

Grants: `select`; `update` on the listed columns only. Photos need a public bucket and are not in I02 (OQ-7).

### 2.3 `provider_verification_cases`

One live case per (provider, subject). `subject_profile_id null` is the provider-level case (individual owner, or the organization as a business). A non-null subject is a staff credential case for an org clinician/driver/caregiver/technician (Q06).

| Column | Notes |
|---|---|
| `provider_id` | FK, not null |
| `subject_profile_id` | FK profiles, null for provider-level. For staff cases must be an active `organization_members` row with role matching category (`doctor`->`doctor`, `ambulance`->`driver`, `caretaker`->`caregiver`, `lab`->`technician`); checked in the creating RPC and again by `person_is_verified`. |
| `state` | text not null default `draft`, check in `draft,submitted,approved,rejected,suspended,expired` |
| `submitted_at`, `submitted_provider_version`, `submitted_profile jsonb` | snapshot built at submit from the allowlisted public columns |
| `decided_at`, `decided_by_profile_id`, `reason_code`, `message` | `reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'`, `message` <= 500 chars and provider-visible |
| `verified_until`, `suspended_at` | timestamptz |

Constraints: `unique nulls not distinct (provider_id, subject_profile_id)`. `check (state<>'approved' or (verified_until is not null and decided_by_profile_id is not null))`. `check (state not in ('rejected','suspended') or reason_code is not null)`. `check (decided_by_profile_id is null or decided_by_profile_id is distinct from subject_profile_id)`. Trigger: after a provider-level case changes, the same function updates `providers.verification_state/published_*` in the same transaction. A deferred constraint trigger asserts the mirror matches. Grants: `select` only.

### 2.4 `provider_document_types` (reference data, read-only)

`code text pk`, `category`, `scope` (`provider`|`staff`), `required boolean`, `requires_expiry boolean`. Seed rows are **placeholders** that the owner/verification lead must confirm (OQ-1); they are configuration, not legal advice:

| Category | Provider-level | Staff-level |
|---|---|---|
| doctor | `government_id`*, `medical_registration`*, `qualification_certificate`* | n/a for individual; for org: `government_id`*, `medical_registration`* per clinician |
| lab | `business_registration`*, `lab_accreditation`, `signatory_id`* | `government_id`* per technician (optional until assigned) |
| ambulance | `operator_permit`*, `government_id`* | `driver_licence`*, `government_id`* per driver; `vehicle_registration` belongs to the later vehicle resource task |
| caretaker | `government_id`*, `training_certificate` | `government_id`* per caregiver |

(*) = required to submit. Grants: `select` to `authenticated`.

### 2.5 `provider_documents` (metadata only; files live in Storage)

| Column | Notes |
|---|---|
| `provider_id` FK, `subject_profile_id` FK null | null = provider-level evidence |
| `document_type` | FK `provider_document_types(code)`; type's category and scope must equal the provider's category and the row's subject presence (composite check through a trigger) |
| `bucket` | text not null default `provider-verification` check equals that value |
| `object_path` | text not null **unique**, `= provider_id::text || '/' || id::text` (check). Opaque UUIDs, no filename, no PII. |
| `status` | text check in `reserved,uploaded,accepted,rejected,replaced,withdrawn`, default `reserved` |
| `mime_type` | check in `application/pdf,image/jpeg,image/png` |
| `size_bytes` | int check `between 1 and 5242880` (engineering default, OQ-6) |
| `sha256` | text null, check `~ '^[0-9a-f]{64}$'`, set on confirm |
| `label` | text <= 80, human label chosen by uploader (not a filename) |
| `issued_on`, `expires_on` | date; `expires_on > issued_on`; `expires_on` not null when the type `requires_expiry` |
| `uploaded_by_profile_id` | FK, default `auth.uid()` |
| `replaces_document_id` | FK self, null |
| `reviewed_by_profile_id`, `reviewed_at`, `review_reason_code`, `review_message` | |
| `idempotency_key uuid` | `unique (provider_id, idempotency_key)` |

Rules: a stored file is never overwritten or deleted. Replacement = new row, old row becomes `replaced`. Withdrawal sets `withdrawn` and keeps the object (retention is Q05). Column grants: `select` on all columns **except** `object_path` and `sha256`. No insert/update/delete.

### 2.6 `provider_verification_events` (append-only)

`case_id`, `provider_id`, `event_type` in (`created`,`submitted`,`approved`,`rejected`,`suspended`,`reinstated`,`expired`,`document_reviewed`,`document_accessed`), `from_state`, `to_state`, `actor_profile_id` (null = system), `actor_kind` in (`owner`,`org_member`,`subject`,`admin`,`system`), `document_id null`, `reason_code`, `message`, `idempotency_key uuid null`, `request_hash text null`, `created_at`. `unique (case_id, idempotency_key) where idempotency_key is not null`. Immutable: reuse the I01 pattern (`before update or delete` trigger, `before truncate` trigger, `revoke insert,update,delete,truncate from service_role`). Grants: `select` only.

### 2.7 `provider_document_access_grants` (60-second read tickets)

`document_id`, `object_path`, `grantee_profile_id`, `purpose_code` (check in `owner_view`,`admin_review`), `created_at`, `expires_at` (`check expires_at = created_at + interval '60 seconds'`). No grants to any API role, no policies; read only through the definer helper `private.has_document_grant(path)`.

### 2.8 Audit

Triggers `after insert or update or delete` -> `private.audit_provider_change()` on `providers`, the four extensions (state/shape only), `provider_verification_cases`, `provider_documents`. Allowlist: `provider_id, category, organization_id, individual_owner_profile_id, subject_profile_id, state, verification_state, status, verified_until, document_type, reason_code, decided_by_profile_id, reviewed_by_profile_id, expires_on`. Never: file path, hash, label, message text, registration or permit numbers, phones, JWT. `organization_id` boundary comes from the provider (null for individuals; read by global `audit:read` only). Read-access to documents is audited by `document_accessed` events (2.6); each of those is also inserted into `audit_events` by the same function with `action='INSERT'`, `target_table='provider_verification_events'`.

## 3. State machine (case state; mirrored on `providers.verification_state` for the provider-level case)

All transitions go through RPCs (section 6) that lock `providers` then the case row `for update`, check `expected_version`, append a `provider_verification_events` row, and commit atomically. Any transition not listed raises `42501` (`transition denied`).

| From | To | Actor | Preconditions |
|---|---|---|---|
| (none) | draft | owner / org member with `provider:manage` (subject self for staff case; org manager creates the staff case) | `create_provider` / `add_staff_credential_case` |
| draft | submitted | owner, org `provider:manage`, or the subject (staff case) | extension fields complete; every required document type has an `uploaded` or `accepted`, unexpired document; snapshot built |
| submitted | approved | admin with `provider:review` | every required document `accepted`; no document expires before `verified_until`; `verified_until <= now()+365 days` (OQ-3); reviewer is not owner, not subject, not a member of the provider's organization |
| submitted | rejected | admin with `provider:review` | `reason_code` and `message` required |
| rejected | submitted | owner / manager / subject | same as draft->submitted |
| approved | suspended | admin with `provider:suspend` | `reason_code` required; takes effect on the public view immediately |
| suspended | approved | admin with `provider:suspend` | reviewer rules as above; `verified_until` still in the future; required documents still unexpired |
| approved | expired | system (`expire_due_verifications`, service role only) or lazily by any command that touches the case | `verified_until <= now()` or an accepted required document has expired |
| suspended | expired | system | `verified_until <= now()` |
| expired | submitted | owner / manager / subject | renewal; new documents allowed |
| approved | submitted | owner / manager / subject | profile or document update. Provider is **unpublished while under review** (safe default, OQ-4) |

Never allowed: draft->approved/rejected/suspended/expired, submitted->draft/suspended/expired, rejected->approved, expired->approved, any state->draft after first submit, any transition by a non-listed actor. Approving needs a human admin; no worker or owner can approve.

Editing: owner may edit content columns in `draft, rejected, expired, approved` and not in `submitted` or `suspended`. An edit never changes `published_profile`; only an approval copies `cases.submitted_profile` to `providers.published_profile`.

Provider-visible effects: `suspended`, `expired`, `rejected` and `submitted-from-approved` clear `published_*` in the same transaction, so the directory drops them immediately. Existing bookings (MR-22) are B01's job; I02 exposes the events and `provider_is_verified`.

## 4. Private Storage

Bucket `provider-verification` created in the migration: `public=false`, `file_size_limit=5242880`, `allowed_mime_types={application/pdf,image/jpeg,image/png}`. No other bucket in I02.

Path: `<provider_id>/<document_id>` (both UUIDs generated server-side by `register_provider_document`; no filename, no extension, no PII). Authorization always joins `provider_documents`, never the path prefix.

Flow:
1. `register_provider_document(...)` authorizes the caller and inserts a `reserved` row; returns bucket and path.
2. Browser uploads with the user session (`upsert:false`).
3. `confirm_provider_document(document_id, sha256)` (definer) checks `storage.objects` has that bucket+name with matching size and `metadata->>'mimetype'`, then sets `uploaded`. A `reserved` row older than 1 hour can no longer be uploaded or confirmed.
4. Reads need a ticket: `authorize_provider_document_access(...)` inserts a 60-second `provider_document_access_grants` row and a `document_accessed` event; the caller then calls `createSignedUrl(path, 60)` with its own JWT, which passes only because of the ticket. The audit trail is therefore unavoidable and no service-role key is needed. Signed URLs already issued stay valid up to 60 s after revocation (Q11 default; a proxy is needed for instant revoke).

`storage.objects` policies (all `to authenticated`; none for `anon`):

| Op | Policy |
|---|---|
| INSERT | `bucket_id='provider-verification'` and a `provider_documents` row exists with `object_path=name`, `status='reserved'`, `uploaded_by_profile_id=auth.uid()`, `created_at > now()-interval '1 hour'`, and `private.is_active_account()` |
| SELECT | `bucket_id='provider-verification' and private.has_document_grant(name)` (unexpired ticket for `auth.uid()`) |
| UPDATE, DELETE | none (blocks overwrite, upsert and delete by API roles; replacement uses a new path) |

Malware scanning: no scanner vendor is approved. Default: MIME and size limits, `application/pdf` and images only, verifiers open files via download (no inline render), and `uploaded` documents are not visible to anyone except admins with `provider:document_read` until reviewed (OQ-5). Quarantine state: a verifier can mark `rejected` with `FILE_UNSAFE`.

## 5. Admin capabilities

| Capability | Allows | Does not allow |
|---|---|---|
| `provider:review` | read queue (cases, document metadata, provider rows), `review_provider_document`, `decide_provider_verification` | open any file; suspend |
| `provider:document_read` | `authorize_provider_document_access` with purpose `admin_review` | decide; change anything |
| `provider:suspend` | `suspend_provider`, `reinstate_provider`, read provider rows | decide initial submissions; open files |

All require `aal2` (inherited). `organization_id` on the capability scopes it to providers owned by that org; `null` is global and is required for individually owned providers. Self-approval is blocked in the RPC: reviewer must not be `individual_owner_profile_id`, the case subject, any `organization_members` row (any status) of the provider's org, or `uploaded_by_profile_id` of any document under review. Bootstrap of the first verifier is the I01 out-of-band `admin_capabilities` insert; I02 adds no seed or self-service path.

## 6. RPCs

All `security definer`, `set search_path = ''`, `revoke all ... from public, anon, authenticated`, then `grant execute ... to authenticated` (only `expire_due_verifications` goes to `service_role`). All first call `private.is_active_account()`; all lock `providers` (then case, then documents) `for update` in that order; org-owned calls also `perform ... from organizations where status='active' for share` and re-verify the caller's membership row `for share`, like I01. Denials use `42501` with generic messages so target existence is not revealed. Idempotent commands take `p_idempotency_key uuid`: same key and same argument hash returns the stored result; same key with different arguments raises `23505`; stale `p_expected_version` raises `40001`.

| RPC | Returns | Caller |
|---|---|---|
| `create_provider(p_category text, p_organization_id uuid, p_display_name text)` | provider id | Active account. Org: `has_org_scope(org,'provider:manage')`. `p_organization_id null` = individual, category must allow individual. Creates provider, extension, provider-level case in `draft`, reference, `created` event. Naturally idempotent: a repeat for the same owner+category returns the existing id without modification. |
| `add_staff_credential_case(p_provider_id uuid, p_profile_id uuid)` | case id | Org `provider:manage`; target is an active member with the matching role; provider is org-owned. |
| `register_provider_document(p_provider_id uuid, p_subject_profile_id uuid, p_document_type text, p_mime_type text, p_size_bytes integer, p_label text, p_issued_on date, p_expires_on date, p_idempotency_key uuid)` | `(document_id uuid, bucket text, object_path text)` | Provider-level: owner or `provider:manage`. Staff-level: only the subject themselves (managers cannot upload or read a person's ID; OQ-8). Case must not be `submitted` or `suspended`. |
| `confirm_provider_document(p_document_id uuid, p_sha256 text)` | void | The uploader only; object must exist in `storage.objects` with matching size and MIME. |
| `withdraw_provider_document(p_document_id uuid, p_expected_version integer)` | void | Uploader/owner; not while the case is `submitted`. |
| `submit_provider_verification(p_case_id uuid, p_expected_provider_version integer, p_idempotency_key uuid)` | new case version | See section 3. Builds `submitted_profile` from the per-category public allowlist. |
| `review_provider_document(p_document_id uuid, p_decision text, p_reason_code text, p_message text, p_expected_version integer)` | new version | `provider:review`; document `uploaded`, case `submitted`; `p_decision` in `accepted`,`rejected`. |
| `decide_provider_verification(p_case_id uuid, p_decision text, p_reason_code text, p_message text, p_verified_until timestamptz, p_expected_version integer, p_idempotency_key uuid)` | new version | `provider:review`; `p_decision` in `approved`,`rejected`. |
| `suspend_provider(p_case_id uuid, p_reason_code text, p_message text, p_expected_version integer, p_idempotency_key uuid)` | new version | `provider:suspend`. |
| `reinstate_provider(p_case_id uuid, p_message text, p_expected_version integer, p_idempotency_key uuid)` | new version | `provider:suspend`. |
| `authorize_provider_document_access(p_document_id uuid, p_purpose text)` | `(bucket text, object_path text)` | Owner/uploader (`owner_view`; staff docs: subject only) or `provider:document_read` (`admin_review`; only for `uploaded`/`accepted` docs of a `submitted` case or an `approved`/`suspended` provider). Writes ticket + event. |
| `expire_due_verifications()` | count | `service_role` only (a server job; scheduler choice is OQ-9). Also unpublishes via the same transition code. |

Direct table writes by clients are limited to the draft content columns in 2.1 and 2.2 (RLS + column grants). Everything touching state, documents or publication is RPC-only.

Internal helpers (`private`, definer, `set search_path=''`):
- `can_read_provider(provider_id)`, `can_edit_provider(provider_id)` (used by policies, granted to `authenticated`),
- `has_document_grant(path)` (used by storage policy, granted to `authenticated`),
- `provider_is_verified(provider_id)`: state `approved`, `verified_until > now()`, provider-level case approved, owner/org active. Not granted to API roles.
- `person_is_verified(provider_id, profile_id)`: provider-level verified **and** (individual owner = profile with no staff case required, **or** an approved, unexpired staff case for that profile **and** an active matching `organization_members` row). Not granted to API roles; for B01/S01 definer functions (section 9).
- `build_public_snapshot(provider_id)`, `transition_case(...)` (single place that mutates case state and the provider mirror).

## 7. Public directory view

`public.provider_directory` (owner-invoker view, `security_barrier`, so it is the only anon-readable projection; `grant select to anon, authenticated`; no grant on base tables to `anon`):

Columns: `public_reference`, `category`, `display_name`, the typed public fields extracted from `published_profile` (`specialty`, `qualification`, `languages`, `years_experience`, `skills`, `fleet_types`, `home_collection`, `accreditation_label`, `bio`; null where not applicable), `published_at`.

Filter: `verification_state='approved' and published_profile is not null and verified_until > now()` **and** (owner profile `status='active'` or organization `status='active'`). The expiry is rechecked on every read, so a late worker cannot leave an expired provider visible. Never exposed: `id`, owner/org ids, `verified_until`, documents, contact fields, registration numbers, anything outside the snapshot allowlist. Lookup key is `public_reference`; C01 joins coverage and services through a definer-owned view/function that uses `provider_is_verified`.

## 8. RLS policies per table

`R` = authenticated select, `W` = authenticated direct write. Unlisted = denied. `anon` has no table grants at all.

| Table | Policy | Predicate |
|---|---|---|
| `providers` | R `providers_read` | `private.can_read_provider(id)`: individual owner is caller; or `has_org_scope(org,'provider:read')`; or `has_admin_capability('provider:review' or 'provider:suspend', organization_id)` |
| | W `providers_update_content` (update, column `display_name`) | owner or `has_org_scope(org,'provider:manage')`, state in `draft,rejected,expired,approved` |
| extensions (x4) | R `*_read` | `can_read_provider(provider_id)` |
| | W `*_update_content` | `can_edit_provider(provider_id)` (same as the providers update rule) |
| `provider_verification_cases` | R `cases_read` | `can_read_provider(provider_id)` or `subject_profile_id=auth.uid()`; staff cases are not readable by managers beyond state through `provider:read`, they contain no private columns |
| `provider_documents` | R `documents_read` | provider-level: owner or `has_org_scope(org,'provider:manage')` or admin `provider:review`. Staff-level: `subject_profile_id=auth.uid()` or admin `provider:review`. Never other org members. |
| `provider_verification_events` | R `events_read` | `can_read_provider(provider_id)` or subject of the case or admin `provider:review` |
| `provider_document_types` | R | `true` for authenticated |
| `provider_document_access_grants` | none | no grants, no policies |
| `audit_events` | I01 `audit_scoped_read` | unchanged |
| `storage.objects` | see section 4 | |
| `public.provider_directory` | view | anon + authenticated select, filter in 7 |

No INSERT/DELETE policy exists on any I02 table. Helpers are definer and pinned to `auth.uid()`, so policies never recurse through RLS.

## 9. Contract for later tasks

B01 and S01 must call `private.person_is_verified(provider_id, assignee_profile_id)` inside their definer accept/assign commands and `private.provider_is_verified(provider_id)` on every acceptance. Only an individually verified clinician can be assigned (Q06). Org brand approval alone returns false. B01 owns auto-cancel/notice on suspension or expiry (MR-22) and consumes `provider_verification_events`.

## 10. pgTAP negative tests (`002_provider_onboarding.test.sql`)

Synthetic actors: patient A/B, individual doctor D1, D2, org O1 owner/manager/member-without-scope/disabled member, org O2 owner, verifier V (`provider:review`, aal2), reader R (`provider:document_read`), suspender S (`provider:suspend`), V-aal1, V-expired, V-org2-scoped, anon.

| Group | Cases (each asserts `42501`/`40001`/`23505` or zero rows) |
|---|---|
| Structure | RLS enabled on all I02 tables; no `anon` privilege on any I02 table or function (scan `pg_proc`/`information_schema`); view column list equals the allowlist exactly |
| Anon | select providers/cases/documents/events denied; every RPC denied; storage insert/select denied; directory returns only published rows |
| Patient / no provider | cannot create a provider in an org they do not belong to; cannot see D1's rows; cannot call any admin RPC; signup metadata `role:admin` grants nothing |
| Cross-provider | D1 cannot read/update/submit D2; D1 cannot register, confirm, withdraw or read D2's documents; O1 manager cannot touch O2 provider; O1 member without `provider:manage` cannot edit, upload or submit; disabled member and revoked scope denied immediately; second provider for same owner+category -> `23505`; lab as individual -> check violation; XOR violation; extension of wrong category rejected; `public_reference`/owner/category immutable |
| Mass assignment | owner cannot update `verification_state`, `published_profile`, `verified_until`, `category`, `organization_id`, case `state`, document `status`; cannot insert/delete into any I02 table directly |
| Non-admin / capability | owner calls `decide_provider_verification` -> `42501`; `provider:review` only cannot suspend; `provider:suspend` only cannot approve or open files; `provider:document_read` only cannot decide; aal1 verifier denied; expired/revoked capability denied; org-scoped capability cannot act on another org or on an individual provider; verifier who owns the provider, is the staff subject, is an org member, or uploaded a document cannot approve (self-approval) |
| State skipping | draft->approved, draft->rejected, submitted->draft, rejected->approved, expired->approved, approved->draft all rejected; submit with missing required document, expired document, or unconfirmed (`reserved`) document rejected; approve with a non-`accepted` document; `verified_until` beyond a document expiry or beyond 365 days; reject/suspend without reason; stale `expected_version` -> `40001`; idempotent replay returns the same result with one event; same key with different args -> `23505`; edit while `submitted`/`suspended` denied; edit after submit does not change the snapshot or the published profile |
| Unverified clinician assignment | `person_is_verified` and `provider_is_verified` are false for draft, submitted, rejected, suspended, expired providers; org doctor with no staff case; staff case approved but org provider suspended; staff case suspended or expired; staff case approved but membership disabled; verified doctor checked against a caretaker provider; org brand approved + unverified staff = false; both functions not executable by `authenticated`/`anon` |
| Document access | direct storage select by owner, verifier, anon, other provider denied without a ticket; guessed path denied; ticket for a different user, a different document or past `expires_at` denied; ticket issuance writes a `document_accessed` event and an `audit_events` row; verifier without `provider:document_read` cannot get a ticket; org manager cannot get a ticket for a staff document; upload by non-uploader, to a path without a `reserved` row, after 1 hour, into another bucket, over 5 MiB or with a disallowed MIME denied; upsert/overwrite and delete denied; confirm with mismatched size/MIME or missing object denied; `object_path` and `sha256` not selectable by `authenticated` |
| Expiry / suspension | suspend removes provider from the directory in the same transaction; reinstate with an expired document denied; `verified_until` in the past hides the provider from the view even before the worker runs; `expire_due_verifications` denied to `authenticated`, works for `service_role`, is idempotent, and unpublishes; disabled profile or disabled org hides the provider; renewal path expired->submitted->approved republishes only the new snapshot |
| Directory | draft/submitted/rejected/suspended/expired invisible; snapshot contains no private key (registration, permit, phone, legal number); view has no `id`, owner or org columns |
| Audit | each transition and document review writes `audit_events` and `provider_verification_events`; events and audit cannot be updated, deleted or truncated (including by `service_role`); audit rows contain none of the excluded fields |
| Replay | the migration applies on a clean DB after I01; second `supabase db reset` is clean |

Concurrency (two sessions) is not expressible in one pgTAP transaction. I will add a small script-driven check for two simultaneous decisions on one case (one wins, one gets `40001`) and two simultaneous `create_provider` calls (one row), reported separately from pgTAP.

## 11. Changes needed to I01 objects (for Codex)

I02 will make these in its own forward migration unless Codex prefers to fold them into I01 before merge. Please confirm which.

1. `admin_capabilities.capability` CHECK: add `provider:review`, `provider:document_read`, `provider:suspend`. Please give the constraint an explicit name (auto name is assumed `admin_capabilities_capability_check`).
2. `organization_members.scopes` CHECK: add `provider:read`, `provider:manage`. The table has two CHECKs touching `scopes`; please name this one explicitly. `set_organization_member` needs no change (it already requires `p_scopes <@ actor.scopes`).
3. `public.create_organization`: owner's initial scopes must include `provider:read` and `provider:manage`. An owner cannot self-grant through `set_organization_member` (`p_profile_id=auth.uid()` is denied). Existing owner rows need a one-time backfill. Both go in the I02 migration if I01 is already merged.
4. No change needed to `audit_events` (its `action` check stays INSERT/UPDATE/DELETE) or `private.audit_access_change`. I02 uses its own audit function.
5. Ordering: I01 migration and tests must be on `develop` before I02 starts. Please confirm the final filename stays `20261117000100_...`; if it changes I will renumber.
6. FYI for I01 tests: `has_admin_capability(cap, null)` only matches **global** capabilities. I02 relies on that for individually owned providers.

## 12. Open questions for the owner

Q03, Q05, Q06 and Q09 stay at their approved safe defaults (section 0). They are not reopened.

| ID | Question | Default used until answered |
|---|---|---|
| OQ-1 | Which document types are mandatory per category, and per staff role? Which registry/council fields may be shown publicly? Verification lead to confirm. | Placeholder rows in 2.4; registration numbers stay private and out of the snapshot |
| OQ-2 | May an ambulance operator be an individual, or organizations only? | Allowed |
| OQ-3 | Maximum verification validity period and re-verification cycle. | <= 365 days, approver sets exact date, capped by earliest document expiry |
| OQ-4 | Should an approved provider stay listed while a profile update is re-reviewed? | No. Listing is withdrawn during review (safe, but causes visible downtime) |
| OQ-5 | Is a malware scanning service approved? None is. | MIME/size limits, download-only review, `FILE_UNSAFE` rejection |
| OQ-6 | File size limit and accepted formats. | 5 MiB; PDF, JPEG, PNG |
| OQ-7 | Provider profile photos (needs a public bucket and consent rules). | Not in I02 |
| OQ-8 | Staff personal documents: subject uploads, or may org managers upload on their behalf? | Subject only; managers see status, never files |
| OQ-9 | Scheduler for `expire_due_verifications` (no scheduler vendor approved). | Expiry is enforced lazily in the view and commands; the job runs from a server-side cron once one is approved |
| OQ-10 | Two-person approval for doctors/ambulance? Who are the first verifiers and who grants their capabilities? | Single reviewer plus separate document-read capability; bootstrap out of band (I01) |
| OQ-11 | Effect on existing bookings when a provider is suspended or expires (MR-22, Q10). | Out of I02; B01 consumes events, no auto-cancel here |

## 13. Implementation order (next phase)

1. Confirm section 11 with Codex and get I01 onto `develop`.
2. Write migration in one transaction: constraint updates, tables, triggers, helpers, RPCs, bucket, storage policies, view, grants; then the test file. Tests first for transitions and denials (TDD), run `supabase db reset` + `supabase test db`.
3. Review actual `pg_policies`, grants and ACLs output; record migration notes, limitations and test output in `docs/TEST_EVIDENCE.md`.

## 14. Implementation notes (phase 2, 2026-11-17)

Implemented in `supabase/migrations/20261117000200_i02_provider_onboarding.sql`. Differences from sections 2-8:

1. `submit_provider_verification(p_case_id, p_expected_version, p_idempotency_key)`: the version is the provider version for the provider-level case and the case version for a staff case, because a staff subject cannot read the provider row.
2. `withdraw_provider_document` is allowed only while the case is `draft`, `rejected` or `expired`. Withdrawing from an approved provider would leave it listed without its evidence.
3. `provider_document_types` gained `owner_kind` (`individual`, `organization`, `any`). Codes are category-prefixed. Organization registration types (`doc_org_registration`, `amb_org_registration`, `care_org_registration`) were added. All rows remain OQ-1 placeholders.
4. No lazy expiry inside commands. Instead, the directory, `provider_is_verified`, `person_is_verified` and `reinstate_provider` all check `verified_until > now()`. `expire_due_verifications` moves the state.
5. `reinstate_provider` checks the case's `verified_until`, which approval already capped at the earliest required-document expiry. It does not re-scan documents.
6. Confirming a new upload marks an earlier `uploaded` document of the same type `replaced`. Accepted documents stay until re-review.
7. A staff case can be approved before the provider-level case. Neither `provider_is_verified` nor `person_is_verified` is true until both are approved.
8. Storage's own `protect_objects_delete` trigger also blocks direct `storage.objects` deletes. There are no update or delete policies either way.
9. `public.provider_directory` is an owner-rights (`security_barrier`) view by design. The Supabase advisor will flag it as a security-definer view. Base tables have no `anon` grants.
10. Verifier conflict also covers any membership (any status) in the provider's organization and any uploader of the case's documents.