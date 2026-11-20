# DC extras design: DC03, DC10, DC11, DC12, DC13, DC14

_Kiro · branch `feat/DC-extras` from `origin/integ/all` `bed2877` · 20 November 2026 · Owner review PENDING_

**DB NOT EXECUTED.** Every SQL object named here is authored and desk-checked only. Synthetic data only. No real-patient activation (Q09, D-PRIV open).

## 0. Inputs and constraints

- Acceptance: `docs/IMPLEMENTATION_TASKS.md` rows DC03, DC10-DC14 and the test lists in `docs/specs/Q01_coverage_matrix.md` §4.
- Built on: P5 shared engine `001550`-`001592` (gates, replay, `patient`, `lock_provider`, category Storage registry), doctor block `001610`-`001640` (`doctor_private.assignee`, `closeout`, `visit_member`, `get_doctor_visit`), P01a `002000` (payments).
- Numbering: migrations `20261117002400`-`002499`, suites `120`-`129`, runner `tests/rls/run_dc_extras_concurrency.py`.
- Private schema `dcx_private` (no API privileges). New public RPCs follow contract §1 and §13: definer, empty `search_path`, `require_actor()` first (except the guest proof check), keyed replay for every mutation, `revoke all` then `grant execute ... to authenticated`.
- New tables: RLS on, no policies, `revoke all from public, anon, authenticated, service_role`. Reads and writes go through RPCs. `service_role` gets no table privilege.
- No clinical payload or PII in events, outbox, audit rows, QR tokens or logs. New commands write `audit_events` (ids and action only). None writes `booking_events` or `notification_outbox`, so N01 receives nothing new.

## 1. Gates (all seeded `off`)

Rows in `booking_private.feature_gates`. One helper, `dcx_private.require_feature(key, mode)`:

| Mode | `on` | `suspended` | `off` |
|---|---|---|---|
| `write` (create, grant, register, issue, verify) | allowed | `55000 feature_suspended` | `55000 feature_unavailable` |
| `read` (projections, read tickets, proof check) | allowed | allowed | `55000 feature_unavailable` |
| `withdraw` (revoke proof, withdraw consent) | allowed | allowed | allowed |

Keys: `doctor_progress` (DC03), `doctor_visit_payment` (DC10), `doctor_fact_review` (DC11), `doctor_visit_proof` (DC12), `doctor_photos` (DC13). DC14 gets `doctor_reports` only when its DB part is built (§7). Routes map both gate messages to 503 `feature_unavailable`, like `careCommand`. No env flag: these are not admission routes (contract §10.1).

## 2. Shared predicates (`20261117002400_dcx_foundation.sql`)

| Predicate | Definition | Used by |
|---|---|---|
| `dcx_private.visit_patient(b, scope)` | doctor booking and `booking_private.patient(patient_id, scope)` | every patient path |
| `dcx_private.visit_doctor(b)` | active account; caller is the person on `doctor_visits.assignment_id`; that assignment is `active`, or `ended` with the booking `completed`/`interrupted`; caller is still the individual owner or an accepted active `provider:read` member of an active organization. Ignores the window and Q06, like `visit_member`, so it is for **reads only**. An offboarded doctor sees nothing. | DC03, DC10, DC13 reads |
| `dcx_private.in_visit_doctor(b)` | booking `in_progress`, substate `service_started`, `doctor_private.assignee(b) or doctor_private.closeout(b)`, **and** `providers_private.person_is_verified(provider, caller)`. A doctor whose credential lapsed may still close the visit (DC01) but may not verify facts or take photos. | DC11 verify, DC13 upload |

## 3. DC03 real-time patient progress

**Exists.** The doctor design (§8.5) chose a 20 s refetch of `GET /api/bookings/:id/visit` and no `supabase_realtime` publication. Outbox payloads are `{booking_id, event, version}` (B01 L215). `get_doctor_visit` returns milestones without actor ids or clinical data.

**Decision.** Refetch meets "reconnect refetch" and "no clinical payload". It does not give a scoped minimal event stream: every poll re-reads the full view (doctor name, credential check, exceptions), and nothing implements the polling rules. Realtime stays off (no publication change; owner can revisit with a private broadcast design).

**Add.**
- `public.get_visit_progress(p_booking_id uuid, p_after_version integer default 0) returns jsonb`: patient (`booking:read`) or `visit_doctor`; others `P0002`. Gate `doctor_progress` read. Returns `{booking_id, state, substate, version, terminal, events:[{version, reason, occurred_at}]}` with at most 50 events after `p_after_version`. Key allowlist only: no actor, address, contact, amount or clinical field.
- `src/lib/doctor-extras/progress-poll.ts`: framework-free poller. 20 s while visible and non-terminal; on error 40 s then 60 s cap; immediate refetch on focus, visibility and `online`; sends the last seen version so a reconnect fetches only missed events; stops at a terminal state.
- Route `GET /api/bookings/[id]/progress?afterVersion=n`.

**Tests.** Suite 121: patient and doctor read; other patient, outsider, scheduler `P0002`; key allowlist on the result and on `notification_outbox.payload`; `after_version` delta equals the tail of `booking_events`; gate off `55000`. No realtime publication contains `bookings`, `booking_events` or `doctor_visits`. Vitest: poller timing, backoff, resume and stop.

## 4. DC10 independent payment collection status

**Exists (P01a).** `public.payments` is a separate ledger with its own states and version. `p01_booking_state` only reacts to booking changes; nothing in the booking engine reads `payments`, so completion never waits on payment. `collection_path` is fixed to `direct_pay_after`, `paid_enabled=false`, and the browser has no route field that sets a payment state. `get_payment_summary` serves patient, collector, provider and finance, behind `pay_after`.

**Missing.** A doctor-visit-facing read that shows the two states side by side, works when pay-after is off, and states that pay-after is not gateway-paid.

**Add.** `public.get_visit_payment_status(p_booking_id uuid) returns jsonb`: patient or `visit_doctor`; gate `doctor_visit_payment` read. Returns `{booking_id, visit:{state, substate, version, completed}, payment_available, payment: null | {state, version, collection_path, gateway_paid:false, settled_directly, no_charge, review_pending}}`. No amounts (the patient has them in `get_booking`), no collector ids, no references. `payment` is null when `pay_after_enabled` is false; the visit block is always returned. Route `GET /api/bookings/[id]/visit-payment`.

**Tests.** Suite 121 with `_p01_fixture.inc`: complete a visit while payment is `due` (a)); report a collection and check booking state, version and events unchanged (b)); `gateway_paid` is false for a confirmed pay-after collection (c)); read works with `pay_after_enabled=false` and returns `payment:null`. Vitest: the route forwards only the booking id (d)).

## 5. DC11 health fact verification history (`002420`)

**Exists.** Nothing. No health-fact table on `integ/all`.

**Tables.**
- `public.health_facts(id, patient_id, kind, current_version, created_at, updated_at)`; `kind in ('allergy','condition','medication','procedure','other')`.
- `public.health_fact_versions(fact_id, version, kind, statement, source, recorded_by_profile_id, recorded_at)`, PK `(fact_id, version)`. `statement` 1-200 chars; `source = 'patient_reported'` in this block. Immutable.
- `public.health_fact_verifications(id, fact_id, fact_version, booking_id, provider_id, reviewer_profile_id, outcome, evidence_kind, evidence_ref, reviewed_at)`; FK `(fact_id, fact_version)`; `outcome in ('confirmed','not_confirmed')`; `evidence_kind in ('document_reviewed','clinical_examination','prior_clinical_record','medication_inspected')`; `evidence_ref` 1-80 chars matching `^[A-Za-z0-9._:/-]+$` (an identifier, never prose). Immutable.

**RPCs.**
- `record_health_fact(p_patient_id, p_kind, p_statement, p_request_key) returns jsonb {fact_id, version}`: patient with `profile:write`. Source `patient_reported`.
- `revise_health_fact(p_fact_id, p_statement, p_expected_version, p_request_key) returns integer`: same patient; appends version n+1. Old verifications stay on version n.
- `verify_health_fact(p_fact_id, p_fact_version, p_booking_id, p_outcome, p_evidence_kind, p_evidence_ref, p_request_key) returns uuid`: `in_visit_doctor(booking)`, booking patient equals fact patient, `p_fact_version = current_version` else `40001 stale_version`. Reviewer is `auth.uid()`. A patient never creates a verification, so "doctor verified" always means a credentialed clinician during a live visit, with evidence.
- `list_health_facts(p_patient_id, p_booking_id default null) returns jsonb`: patient with `profile:read`, or (with `p_booking_id` for this patient) `doctor_private.assignee` or `closeout`. Returns every version with source and time, and every verification with outcome, evidence kind/ref, time, reviewer display name and provider reference (no profile ids).
- Gate `doctor_fact_review`: writes `write`, list `read`. Audit `health_fact.recorded|revised|verified`.

**Tests (suite 122).** Version immutability and the old verification staying linked (a)); reviewer is the caller and evidence is required, patient and wrong doctor `42501`, lapsed Q06 `42501` (b)); UPDATE/DELETE/TRUNCATE on all three tables raise for the owner path and API roles have no privilege (c)); stale version `40001`; replay and `idempotency_conflict`.

## 6. DC12 privacy-safe QR proof of visit (`002430`)

**Table** `dcx_private.visit_proof_tokens(id, booking_id, token_hash bytea unique, issued_by_profile_id, issued_at, expires_at, revoked_at, revoked_by_profile_id)`. Only `revoked_*` may change, once. Not reachable by any API role.

**Token.** 32 random bytes (`extensions.gen_random_bytes`), base64url, 43 chars. Only `sha256(token)` is stored. The QR encodes `https://surecurevisit.in/proof#<token>`; the fragment never reaches a server log, and the page posts it to the check route. The token carries no booking id, patient id, OTP or health data.

**RPCs.**
- `issue_visit_proof(p_booking_id, p_ttl_hours, p_request_key) returns jsonb {token_id, token, expires_at}`: patient with `booking:create`; doctor booking `completed`; TTL 1-720 hours; at most 3 live tokens per booking (`53300 proof_limit`, booking row locked). The plaintext is returned once; a replay returns `token: null` and the route answers 409 `proof_already_issued` so the client revokes and reissues.
- `revoke_visit_proof(p_token_id, p_request_key) returns jsonb`: issuing patient's scope; repeat revocation returns the same row.
- `list_visit_proofs(p_booking_id) returns jsonb`: patient; ids, times, status. Never the token.
- `verify_visit_proof(p_token text) returns jsonb`: **anon and authenticated**. Gate `doctor_visit_proof` read. Returns `{valid:true, visit_date, service:'doctor_home_visit'}` (date in Asia/Kolkata) or `{valid:false}` for malformed, unknown, expired, revoked or no-longer-completed. No reason is given for invalid, so the check reveals nothing beyond validity.

**Tests (suite 123).** Hash only, no plaintext column (a)); expired (b)); revoked (c)); B1 token answers only for B1's date (d)); anon check returns exactly the allowed keys (e)); non-patient issuance `42501`; non-completed booking `55000`; cap `53300`; gate off. Runner R1: two concurrent issuances at 2 live tokens leave exactly 3.

## 7. DC13 consent-based optional photography (`002440`)

**Tables.**
- `public.visit_photo_consents(id, booking_id, patient_id, purpose, policy_version, status, granted_by_profile_id, granted_at, withdrawn_by_profile_id, withdrawn_at, version)`; `purpose in ('wound_documentation','skin_condition','mobility_assessment')`; one `granted` row per `(booking, purpose)`.
- `public.visit_photos(id, booking_id, consent_id, object_name unique, content_type, status, uploaded_by_profile_id, created_at, withdrawn_at, delete_after)`; `status in ('active','withdrawn')`; path `visit/<booking>/<photo>.(jpg|png)`.
- `dcx_private.photo_read_tickets` (60 s, append-only, copy of the ambulance model).
- Bucket `visit-evidence`: private, 5 MiB, `image/jpeg`, `image/png`.

**Storage.** `dcx_private.photo_object_access(bucket, path, writing)` is registered in `providers_private.category_object_checks` (shared `001591`), with two permissive policies, like `ambulance_private.vehicle_object_access`. Write (and upload read-back): the uploader of an `active` photo whose consent is `granted`, while `in_visit_doctor`. Read: a live ticket for the caller, photo `active`, consent `granted`, caller still patient or `visit_doctor`. Signing, update and delete stay banned by the I02 policies.

**RPCs.** `grant_photo_consent(p_booking_id, p_purpose, p_policy_version, p_request_key) returns uuid` (patient `booking:create`, booking `confirmed` or `in_progress`, gate write); `withdraw_photo_consent(p_consent_id, p_expected_version, p_request_key) returns integer` (patient, any gate state; photos move to `withdrawn` with `delete_after = clock_timestamp()`); `register_visit_photo(p_booking_id, p_consent_id, p_content_type, p_request_key) returns jsonb {photo_id, bucket, object_name}` (`in_visit_doctor`, consent granted for this booking, else `42501 consent_required`; at most 10 photos per booking `53300 photo_limit`); `authorize_visit_photo_read(p_photo_id) returns jsonb` (ticket, audited); `list_visit_photos(p_booking_id) returns jsonb` (patient or `visit_doctor`; consents and photo ids, purposes, status, times). Photos are never required for completion.

**Tests (suite 124).** Upload without consent `42501` (a)); after withdrawal the read predicate is false and `delete_after` is set (b)); other patient, other doctor, outsider read denied (c)); bucket is private (d)); predicate registered; API roles have no table privilege. Runner R2: withdrawal racing registration never leaves an `active` photo on a withdrawn consent.

**Not built.** The deletion worker that removes withdrawn objects: retention is D-PRIV and Storage deletion needs a reviewed service adapter. Read access ends at withdrawal.

## 8. DC14 PDF report generation

**Dependency.** The finalized record is DC07 on `feat/DC-clinical-core` ("Interface for DC-extras" in `docs/specs/DC_clinical_core_design.md`). Not pushed at design time. If it is pushed before DC14 is built, DC14 adds `002450` with `clinical_report_documents(record_id, record_version, sha256, object_name, ...)`, bucket `clinical-records` (private), and keyed `generate`/`authorize read` RPCs bound to that read RPC.

**Always built.** `src/lib/pdf/` (PDF 1.4 writer: Helvetica text objects, WinAnsi escaping, wrapping, pagination, correct xref) and `src/lib/doctor-extras/visit-report.ts` (typed `VisitReportInput` from a finalized record version → PDF bytes and SHA-256). Unit tests parse the header, xref offsets, trailer and `startxref`. No new dependency.

## 9. Routes (all `Cache-Control: private, no-store`; GETs call `await connection()`)

| Route | RPC |
|---|---|
| `GET /api/bookings/[id]/progress` | `get_visit_progress` |
| `GET /api/bookings/[id]/visit-payment` | `get_visit_payment_status` |
| `GET, POST /api/patient/[id]/health-facts` | `list_health_facts`, `record_health_fact` |
| `POST /api/health-facts/[id]/revise`, `/verify` | `revise_health_fact`, `verify_health_fact` |
| `GET, POST /api/bookings/[id]/visit-proofs` | `list_visit_proofs`, `issue_visit_proof` |
| `POST /api/visit-proofs/[id]/revoke` | `revoke_visit_proof` |
| `POST /api/visit-proofs/verify` (guest) | `verify_visit_proof` |
| `GET, POST /api/bookings/[id]/photo-consents` and `/photos` | `list_visit_photos`, `grant_photo_consent`, `register_visit_photo` |
| `POST /api/photo-consents/[id]/withdraw`, `/api/visit-photos/[id]/read-ticket` | `withdraw_photo_consent`, `authorize_visit_photo_read` |

Mutations need `Idempotency-Key`; bodies are `z.strictObject`. One service module `src/lib/doctor-extras/service.ts` with the shared status table; `src/lib/booking/service.ts` is not edited.

## 10. Open questions (owner)

1. DC03: keep refetch-only, or approve a private broadcast channel later?
2. DC11: should DC08 allergy checks read `health_facts`, or keep their own allergy list? Clinician-recorded facts are not in this block.
3. DC12: default TTL and max (proposed 7 days default, 30 days max), and whether a doctor (not only the patient) may issue a proof.
4. DC13: retention after withdrawal (proposed: immediate deletion eligibility), allowed purposes, photo cap.
5. DC14: who may download (patient only, or also the signing doctor), and whether Indic scripts are required in the PDF (the built writer uses Helvetica/WinAnsi only).
