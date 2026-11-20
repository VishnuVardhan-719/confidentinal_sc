# DC clinical core design (DC04-DC09)

_Kiro · 20 November 2026 · branch `feat/DC-clinical-core` from `integ/all` at `bed2877` · Owner review PENDING · **DB NOT EXECUTED**_

Scope: DC04 vitals and examination, DC05 draft/autosave recovery, DC06 assessment, DC07 finalized record, DC08 structured prescription, DC09 patient consultation view. Built on the S01 doctor block (`20261117001610`-`001640`) and the P5 shared contract. Synthetic data only. Everything sits behind a new database gate `doctor_clinical`, seeded `off` (Q09: no clinical activation).

## 1. Interface for DC-extras (stable)

DC13 (photos) and DC14 (PDF) read the finalized record only through these. Names, arguments and keys below do not change without a coordinator note.

| Object | Contract |
|---|---|
| `public.get_clinical_record(p_record_id uuid) returns jsonb` | Caller must be the linked patient (`booking_private.patient(patient_id,'booking:read')`) or the signer while still an active owner/member of the provider. Anyone else: `P0002 not_found`. Writes one `audit_events` row `clinical.record_viewed` (no content). Returns the document below. |
| `public.list_clinical_records(p_booking_id uuid) returns jsonb` | Same readers. `{"booking_id", "records": [{"record_id","record_version","kind","signed_at","supersedes_record_id","is_latest"}]}` ordered by version. No content. |
| `clinical_private.record_reader(p_record_id uuid) returns boolean` | The read predicate above, for DC-extras SQL (signed-URL issuance, PDF generation). Private: callable from other definer functions only. |
| `clinical_private.record_document(p_record_id uuid) returns jsonb` | The document, no authorization and no audit. For DC-extras definer SQL after it has checked `record_reader`. |
| `clinical_private.latest_record_id(p_booking_id uuid) returns uuid` | Latest signed version for a booking, or null. |
| `clinical_private.clinical_records` | Immutable table. Stable columns: `id, consultation_id, booking_id, patient_id, provider_id, root_record_id, record_version, kind, supersedes_record_id, amendment_reason, signed_by, signed_at, source_draft_version, content, content_sha256`. |

Document shape (`record_document`, `get_clinical_record`):

```json
{
  "record_id": "uuid", "booking_id": "uuid", "booking_ref": "text",
  "record_version": 1, "kind": "original | amendment",
  "supersedes_record_id": "uuid | null", "amendment_reason": "text | null", "is_latest": true,
  "signed_at": "timestamptz", "signer": { "name": "text" },
  "provider": { "reference": "text", "name": "text" },
  "patient": { "name": "text" },
  "visit": { "start_at": "timestamptz", "end_at": "timestamptz" },
  "content": { "vitals": {}, "examination": {}, "assessment": {}, "allergies": {}, "prescription": {}, "plan": {} },
  "vital_warnings": ["text"],
  "content_sha256": "64 hex chars, sha256 of content::text"
}
```

No phone, address, patient id, amount or OTP is in the document.

## 2. Tables (schema `clinical_private`, closed to every API role)

| Table | Purpose | Mutability |
|---|---|---|
| `consultations` | One per doctor booking: `booking_id` unique, `patient_id`, `provider_id`, `assignment_id`, `author_profile_id`, `status` (`draft`, `signed`), `version` (draft version), `content` jsonb, `saved_at`, `latest_record_id`. | Draft content changes only with `version+1`. After `signed`, only `latest_record_id` may move to a record that supersedes the current one. No delete or truncate. Guard trigger is the backstop for a definer bug. |
| `clinical_records` | Signed version: frozen `content`, signer, `signed_at`, `record_version`, `kind`, `supersedes_record_id` (unique, so the chain cannot fork), `amendment_reason`, `source_draft_version`, `content_sha256` (set by trigger). | Insert only; update, delete, truncate raise `55000 immutable_event` (`booking_private.immutable()`). |
| `prescription_items` | Typed rows of the signed prescription: `medication_name, form, strength, dose, route, frequency, duration_days, quantity, instructions, allergy_override_reason`, PK `(record_id, line_no)`. Written in the signing transaction from the same frozen content. | Insert only, immutable. |

Amendments are new `clinical_records` rows (`kind='amendment'`); there is no separate amendment table. Draft revisions are not kept: the draft row holds the latest saved version.

RLS enabled on all three with no policy; `revoke all` from `public, anon, authenticated, service_role`; schema usage revoked. `service_role` has no read or write.

## 3. Content (DC04, DC06, DC08)

One JSON document, validated twice: Zod at the route (`src/lib/validation/clinical.ts`) and `clinical_private.check_content(content, final)` in the database. Limits, enums and patterns live in one jsonb, `clinical_private.rules()`, mirrored by `CLINICAL_RULES` in `src/lib/clinical/rules.ts`; a Vitest parity test compares them.

- `vitals`: `temperature {value, unit C|F}`, `systolic`, `diastolic`, `pulse_bpm`, `spo2_pct`, `resp_rate`, `height_cm`, `weight_kg`, `acknowledged_warnings[]`. Values outside the hard range are rejected (`22023`). Values inside the hard range but outside the warning range are stored as entered and produce warning codes (`temperature_high`, `spo2_low`, ...). Signing requires every current warning to be acknowledged. Values are never corrected.
- `examination`: `chief_complaint`, `symptom_duration`, `findings`.
- `assessment`: `summary`, `certainty` (`provisional`, `final`, `undetermined`), `diagnoses[] {label, code?, certainty suspected|probable|confirmed}`, `differentials[]`, `red_flags[]`, `outcome`. A record can be signed with `undetermined` and no diagnosis. No AI field exists and no route accepts machine output; the signer attests authorship.
- `allergies`: `status` (`none_known`, `recorded`, `not_assessed`), `items[] {substance, reaction?}`.
- `prescription`: `status` (`none_indicated`, `prescribed`), `items[]` with the typed medication fields. No medicine is required.
- `plan`: `advice`, `follow_up_on` (date), `follow_up_note`, `tests[] {name, reason?}`, `referral`, `red_flag_advice`.

Drafts accept any partial content that is structurally valid. Signing additionally requires (`22023`, message in brackets): findings, summary, certainty, outcome, allergy status, prescription status, consistent item lists [`clinical_incomplete`]; acknowledged warnings [`warning_unacknowledged`]; an override reason on every item whose name matches a recorded allergy substance [`allergy_conflict`]; `p_authored_confirmed=true`, and `p_allergies_reviewed=true` when items exist; no prescription when allergies are `not_assessed` [`attestation_required` / `clinical_incomplete`].

The allergy check is a case-insensitive substring match between medication names and recorded substances. It is not a drug-class or interaction check.

## 4. States

```
(no consultation) --save v0--> draft(v1) --save vN--> draft(vN+1) --sign vN--> signed(record v1) --amend--> signed(record v2) ...
```

Visit gating (S01 substates):
- In-visit author: `doctor_visits.substate='service_started'` and `doctor_private.assignee(booking)` (DC01).
- Post-visit author: substate `service_completed`, booking `completed`, the visit's own assignment now `ended`, same person, before `end_at + 12 h` (the DC01 window end), provider publishable, resource eligible, Q06 verified. This is DC01 minus the active-assignment test, which completion ends.
- Interrupted, absent or ops-closed visits: no author, so the draft stays private and frozen.
- Amender: signer of the latest record, active account, still owner or active `provider:read` member, Q06 verified, before root `signed_at + 30 days`.

Clinical state never changes booking state, and booking completion never requires a signed record. Payment state is not read.

## 5. RPCs

All `security definer`, `search_path=''`, `identity_private.require_actor()` first, execute granted to `authenticated` only. Order per contract §13.1: shape checks, request hash, keyed replay, authorization, gate, locks (booking `for update`, `lock_provider`, consultation `for update`), replay again, recheck, version, mutation, `record_request`.

| RPC | Returns | Action key |
|---|---|---|
| `save_clinical_draft(p_booking_id uuid, p_expected_version integer, p_content jsonb, p_request_key uuid)` | new draft version (`0` creates) | `clinical.draft` |
| `get_clinical_draft(p_booking_id uuid)` | `{booking_id, status none|draft|signed, version, content, saved_at, record_id, vital_warnings, allergy_conflicts}`; author only, else `P0002` | read |
| `sign_clinical_record(p_booking_id uuid, p_expected_version integer, p_authored_confirmed boolean, p_allergies_reviewed boolean, p_request_key uuid)` | record id | `clinical.sign` |
| `amend_clinical_record(p_record_id uuid, p_content jsonb, p_reason text, p_authored_confirmed boolean, p_allergies_reviewed boolean, p_request_key uuid)` | new record id | `clinical.amend` |
| `get_clinical_record`, `list_clinical_records` | §1 | read |

Audit rows (`audit_events`, ids only): `clinical.draft_created`, `clinical.record_signed`, `clinical.prescription_signed`, `clinical.record_amended`, `clinical.record_viewed`. Autosaves are not audited individually; the replay row and draft version record them. No `booking_events`, outbox, notification or log line carries clinical content; no clinical command writes `booking_events` at all.

## 6. Errors

Contract codes plus clinical messages. Route mapping in `src/lib/clinical/service.ts`.

| SQLSTATE / message | HTTP body |
|---|---|
| `42501 forbidden` | 403 `forbidden` |
| `P0002 not_found` | 404 `not_found` |
| `40001 stale_version` | 409 `stale_version` (passed through for DC05) |
| `40001 idempotency_conflict` | 409 `conflict` |
| `55000 draft_signed`, `55000 record_superseded` | 409 with that code |
| `55000 feature_unavailable`/`feature_suspended` | 503 `feature_unavailable` |
| `22023 clinical_incomplete`, `warning_unacknowledged`, `allergy_conflict`, `attestation_required` | 422 with that code |
| `22023 invalid_input` | 422 `invalid_input` |
| `53300 draft_save_limit` (5000 saves) | 429 `rate_limited` |

## 7. Gate

`booking_private.feature_gates` row `doctor_clinical`, seeded `off`. Every clinical write requires `on`; `off` raises `feature_unavailable`, `suspended` raises `feature_suspended`. Reads are never gated (contract §10.1), so a suspension cannot hide a signed record from its patient. No env flag (contract: doctor has none). Changing the gate follows OD-6.

## 8. Routes

All handlers `await connection()` first; no `export const dynamic`. Commands require `Idempotency-Key`. Bodies are strict Zod objects.

| Route | RPC |
|---|---|
| `GET /api/bookings/:id/consultation/draft` | `get_clinical_draft` |
| `PUT /api/bookings/:id/consultation/draft` `{expectedVersion, content}` | `save_clinical_draft` |
| `POST /api/bookings/:id/consultation/sign` `{expectedVersion, authoredConfirmed, allergiesReviewed}` | `sign_clinical_record` |
| `GET /api/bookings/:id/consultation/records` | `list_clinical_records` |
| `GET /api/clinical-records/:id` | `get_clinical_record` |
| `POST /api/clinical-records/:id/amend` `{content, reason, authoredConfirmed, allergiesReviewed}` | `amend_clinical_record` |

DC05 client side: `src/lib/clinical/autosave.ts`, a framework-free controller: debounced save (1.5 s), explicit `flush()`, states `idle | unsaved | saving | saved | error | conflict`, retry of a failed save with the same idempotency key (a lost response replays), `stale_version` moves to `conflict` and loads the server copy for an explicit `keepMine`/`takeServer` choice, `reconnect()` retries pending work. Memory only; no localStorage.

## 9. Tests

- SQL (DB NOT EXECUTED): `110_dc_structure` (catalog, grants, RLS, gate seed, rules), `111_dc_draft` (DC01 actors, validation, versions, replay, gate, substates, post-visit window, no booking events), `112_dc_sign` (required fields, warnings, allergy, attestation, immutability, items, hash, replay), `113_dc_amend` (chain, superseded, actors, window), `114_dc_patient_view` (patient-only reads, negative actors, audit, no draft leak). Fixture `_dc_fixture.inc` over `_p5d_fixture.inc`.
- Concurrency: `tests/rls/run_dc_core_concurrency.py`: two saves on one version, sign vs save, two amendments, one sign key twice.
- Vitest: `tests/unit/clinical.test.ts` (rules parity with SQL, validation, warnings, allergy match), `tests/unit/clinical-http.test.ts` (routes, keys, errors), `tests/unit/clinical-autosave.test.ts`.

## 10. Open owner questions (safe defaults applied)

| ID | Question | Default |
|---|---|---|
| DCQ-1 | Clinical consent before drafting (canonical "approved consent"). No consent model exists. | Not modelled; gate stays off until decided. |
| DCQ-2 | Vital hard and warning thresholds. | Values in `rules()`; need clinical sign-off. |
| DCQ-3 | Post-visit signing window. | `end_at + 12 h`, same doctor, still verified. |
| DCQ-4 | Amendment window and authority (handover to another clinician). | Signer only, 30 days from first signature. |
| DCQ-5 | Guardian or family access to records. | Self patient only (`booking:read` self grant). |
| DCQ-6 | Allergy checking beyond name match (drug classes, interactions). | Name match plus clinician attestation. |
| DCQ-7 | Notify patient when a record is signed. | No notification (N01 source not added). |
| DCQ-8 | Draft encryption at rest beyond platform storage encryption. | Not added. |
