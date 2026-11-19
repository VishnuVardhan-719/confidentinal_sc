# Q01 security and test coverage matrix

Task Q01 (docs only). Agent: Kiro. Branch `docs/Q01-test-plan`, base `integ/all` @ `e7165fd`.
Date: 2026-11-18. No code, migration or test files changed. No DB, Docker or npm commands were run.

## 1. Method and evidence levels

Sources read: `docs/ACCEPTANCE_AND_TEST_MATRIX.md`, `docs/TEST_EVIDENCE.md`, `docs/RELEASE_CHECKLIST.md`,
`docs/IMPLEMENTATION_TASKS.md` (DC01-DC14 rows 45-58), `docs/CANONICAL_SCHEMA_DRAFT.md` (DC design rows 514-527),
every `supabase/tests/*.test.sql`, every file under `tests/`, `.github/workflows/ci.yml`, the migration file list
and `docs/handoffs/B01FIX_codex_2026-11-18.md`.

A "test name" below is the assertion label passed to `pg_temp.assert_true` / `pg_temp.expect_state`
(`supabase/tests/_tap_helpers.inc`), the Vitest `it(...)` title, or the `PASS:` line printed by a Python runner.
References are `file:line`.

| Level | Meaning |
|---|---|
| **COVERED** | An assertion exists that checks this exact behaviour. |
| **PARTIAL** | Related assertions exist, but a named case in the criterion is not asserted. |
| **NONE** | No assertion found. A spec is given in section 5 or 6. |
| **N/A-UNBUILT** | The feature has no schema/route on this base, so nothing can be tested yet. The spec is written against the design in `docs/CANONICAL_SCHEMA_DRAFT.md`. |

**Run status (UNVERIFIED on this base).** "COVERED" means the assertion exists in the file. It does not mean it passed on `e7165fd`:

- `docs/handoffs/B01FIX_codex_2026-11-18.md:7` records pgTAP suites 001-005 and 010-014 passing on "Stack A" with migrations through `20261117001200`. Migrations `001300`, `001400` and `001500` landed after that run.
- Suites `015_availability_reference.test.sql` and `016_review_findings.test.sql` have no recorded run in any doc I read.
- The last recorded unit run is 148 passed and 1 skipped (`B01FIX_codex_2026-11-18.md:27`), at an earlier commit. `node_modules` is absent in this worktree, so I did not re-run it.
- `docs/TEST_EVIDENCE.md` holds only the F01 entry. None of the runs above have been copied into it.
- `.github/workflows/ci.yml` runs lint, typecheck, `npm test` and build only. **No SQL/RLS suite and no concurrency runner runs in CI.**

## 2. Test asset inventory

| Asset | Assertions (approx.) | Scope | How run |
|---|---|---|---|
| `supabase/tests/001_i01_identity.test.sql` | 126 | profiles, patients, grants, orgs, memberships, invitations, admin caps, MFA, revocation, anon | `npx supabase test db`; also `tests/rls/run_i01_followups.py` |
| `supabase/tests/002_i01_followups.test.sql` | 36 | pagination bounds, invitation expiry/cap, promotion re-acceptance | same |
| `supabase/tests/003_i02_providers.test.sql` | 172 | provider onboarding, private evidence, read tickets, review, suspension, expiry sweep, audit | `supabase test db` |
| `supabase/tests/004_c01_catalog.test.sql` | 102 | services, paise prices, PIN coverage, public search projection, coverage review | `supabase test db` |
| `supabase/tests/005_b01_booking.test.sql` | 39 | booking create/accept/cancel/advance, RLS, ACL, snapshot immutability | `supabase test db`; `run_b01_concurrency.py` |
| `supabase/tests/010_q06_staff.test.sql` | 29 | staff credential cases, assigned-person scope, expiry/revocation | `supabase test db` |
| `supabase/tests/011_b01_fixes.test.sql` | 15 | service window, cancellation, request/address caps | `supabase test db` |
| `supabase/tests/012_b01_legacy.test.sql` | 39 | **Near-duplicate of 005.** `git diff --no-index` shows one changed line, the TAP echo label | `supabase test db` |
| `supabase/tests/013_b01_categories.test.sql` | 7 | lab/caretaker/ambulance acceptance deferred | `supabase test db` |
| `supabase/tests/014_q06_scope.test.sql` | 1 | verify capability cannot suspend staff | `supabase test db` |
| `supabase/tests/015_availability_reference.test.sql` | 18 | `list_slots` by public reference, ACL | `supabase test db` (no recorded run) |
| `supabase/tests/016_review_findings.test.sql` | 12 | pg_cron placement, service_role ledger writes, doc cap, provider UUID leak | `supabase test db` (no recorded run) |
| `tests/rls/run_b01_concurrency.py` | 4 PASS lines | real two-connection races on booking | manual, local Docker only |
| `tests/rls/run_i01_followups.py` | 2 race PASS lines | invitation races | manual, local Docker only |
| `tests/rls/test_i01_runner.py` | 5 | runner refuses non-local targets | `python -m unittest` |
| `tests/unit/*.test.ts` (13 files) | ~80 `it` | input validation and HTTP adapters with **mocked** RPC | `npm test` (CI) |
| `tests/unit/provider-storage-http.test.ts` | 1 | real Storage signing denial | opt-in `I02_STORAGE_HTTP=1`; skipped in CI |

No Playwright/E2E specs, no accessibility tests and no HTTP-against-live-DB route tests exist. `tests/rls/README.md:855` lists the HTTP-route gap as known.

## 3. Acceptance matrix coverage (`docs/ACCEPTANCE_AND_TEST_MATRIX.md` rows)

### 3.1 Public landing and content
- Positive (real copy, services, contact): **NONE**. `src/app/page.tsx` is the only page. No content exists to test.
- Negative (no fabricated testimonials/counts, no broken mobile links): **NONE**. Spec Q01-T40.

### 3.2 Account creation
| Criterion | Status | Evidence |
|---|---|---|
| OTP-verified signup | **N/A-UNBUILT** | No OTP code under `src/`. Auth is password based (`tests/unit/identity-http.test.ts:74` "password auth routes") |
| Health questions with None/Unknown | **N/A-UNBUILT** | No health/questionnaire table in `supabase/migrations/` |
| No public signup to admin | **COVERED** | `identity-http.test.ts:76` "never forwards signup role metadata"; `001:92` "draft org providers have no category workspace; forged admin metadata ignored"; `001:99` "self admin escalation denied"; `001:100` "admin capability mutation denied" |
| Throttling/resend abuse | **PARTIAL** | `identity-http.test.ts:83` "preserves Supabase auth rate limiting" and `identity.test.ts:57` only check that the Auth 429 is passed through. Nothing triggers a real limit. Spec Q01-T41 |
| No unneeded clinical data disclosure | **N/A-UNBUILT** | No clinical fields exist |

### 3.3 Provider onboarding
| Criterion | Status | Evidence |
|---|---|---|
| Document submission (individual/org) | **COVERED** | `003:99` "missing credential blocks submission", `003:102` "metadata without uploaded bytes blocks submission", `003:110` "owner upload with RETURNING read-back allowed", `003:122` "unreserved filename denied", `003:125` "object overwrite denied" |
| Review | **COVERED** | `003:134` "self review denied despite admin capability", `003:158` "aal1 admin denied", `003:189` "stale review denied", `003:191` "approved with valid evidence publishable", `003:193` "approval records exact document IDs", `003:255` "org owner self review denied" |
| Staff membership | **COVERED** | `010:20` "direct approval denied", `010:42` "self review denied", `010:44` "foreign case invisible", `010:45` "foreign scoped review denied", `010:47` "MFA required", `016:33-35` M3 service_role cannot forge/approve/delete |
| Suspension | **COVERED** | `003:207` "verify capability alone cannot suspend", `003:213` "suspended provider not publishable", `010:97` "suspended person denied", `014:13` "verify capability cannot suspend staff" |
| Unverified cannot publish | **COVERED** | `003:89` "unapproved provider has no published snapshot", `003:92` "draft not publishable", `003:259` "rejected provider not publishable" |
| Self-approved cannot publish | **COVERED** | `003:98` "direct self approval denied", `004:69` "owner self approval denied" (coverage) |
| Cross-org cannot publish | **COVERED** | `003:139` "cross org document read denied", `003:145` "cross org creation denied", `004:188` "organization member cannot approve own organization" |
| Expiry | **COVERED** | `003:201` "expired credential auto blocks publication", `003:384-392` expiry job group, `003:396` "expired provider not publishable", `003:448` "approval refused while uploaded evidence is expired" |
| Professional licence review documented | **PARTIAL** | The DB enforces a required kind (`providers_private.required_kind`). Human licence review is a process step, not a test |

### 3.4 Discover and request
| Criterion | Status | Evidence |
|---|---|---|
| PIN eligibility | **COVERED** | `004:92` "approved price and coverage visible", `004:93` "adjacent PIN never matched", `004:103-104` wildcard / leading-zero PIN denied, `005:68` "uncovered PIN denied" |
| Current price | **COVERED** | `004:95` "price filter exact", `004:173` "one current price", `005:60` "authoritative bigint price", `005:63` "direct price tampering denied" |
| Availability | **COVERED** | `015:25` "reference returns slots", `015:29` "slots stay advisory", `015:31` "another provider reference cannot read this service", `015:36` "date window enforced" |
| Patient selects provider | **COVERED** | `005:73` "foreign recipient denied", `booking.test.ts:8` "accepts only patient-controlled references and a UTC instant" |
| Unverified listing cannot be requested **via direct RPC** | **NONE** | Hiding is tested in the catalog (`004:128` "expired detail identical to unknown", `004:131` "disabled owner disappears", `004:177` "withdrawal immediately hides provider"). `create_booking_request` is never called against a hidden provider. Spec Q01-T05 |
| Suspended listing via direct RPC | **NONE** | Spec Q01-T05 |
| Out-of-area via direct RPC | **COVERED** | `005:68` "uncovered PIN denied", `005:69` "denied create left no row" |

### 3.5 Manual acceptance
| Criterion | Status | Evidence |
|---|---|---|
| Provider accepts; atomic reservation | **COVERED** | `005:81` "atomic confirmation", `005:74` "foreign accept denied", `005:79` "unaccepted assignment denied" |
| Simultaneous accept cannot double-book (different bookings, one resource) | **COVERED** | `run_b01_concurrency.py:106` "PASS: two accepts overlap; one commits, one 23P01; exactly one reservation"; `:110` adjacent half-open intervals |
| Accept/cancel race | **COVERED** | `run_b01_concurrency.py:117`, `:122` |
| Provider accepts **once** (same booking accepted twice / replayed) | **NONE** | Spec Q01-T02 |
| Decline | **NONE** | `decline_booking` appears only in the ACL/search_path loop at `005:51`. Spec Q01-T01 |
| Stale price requires patient consent | **N/A-UNBUILT** | No repricing or consent mechanism in migrations. The business rule is unspecified. Spec Q01-T07, BLOCKED on a decision |
| Lab/caretaker/ambulance acceptance disabled | **COVERED** | `013:23`, `013:43`, `013:63` "... acceptance deferred", `013:66` "no deferred assignments" |

### 3.6 Mixed pay-after records
**N/A-UNBUILT.** P01 owns payments (`tests/rls/README.md:830`, `:850`). No payment, webhook or invoice tables exist. Specs Q01-T30 to T32.

### 3.7 Doctor travel/OTP
| Criterion | Status | Evidence |
|---|---|---|
| Doctor assigned; en-route/arrived | **COVERED** | `005:91` "in-window assigned predicate", `005:93` "substate skip denied", `005:105` "complete state/substate trail", `011:16` "early advance denied", `011:31` "late advance denied" |
| Wrong doctor | **PARTIAL** | Expired or revoked staff are denied (`010:73` "expired clinician cannot advance", `010:80` "membership revocation ends assigned scope"). A different, valid, unassigned doctor calling `advance_visit` on a confirmed in-window booking is **not** tested. Spec Q01-T03 |
| One-use OTP, replay, guessed PIN, expiry | **N/A-UNBUILT** (DC02) | Migrations say "no arrival OTP" (`202611170005_b01_booking.sql:399`). `advance_visit(..,'arrived',..)` currently needs no patient proof. Spec DC02 |
| 112 emergency handling unaffected | **NONE** | No UI exists. Spec Q01-T42 |

### 3.8 14 consultation items: see section 4 (all **N/A-UNBUILT**).

### 3.9 Lab collection / reports
Booking acceptance is deferred (`013:23`, `013:24`), which proves a lab booking cannot reach `confirmed`. Collector assignment, result review and report release are **N/A-UNBUILT**. Spec Q01-T33.

### 3.10 Ambulance scheduled
`013:63` "ambulance acceptance deferred" and `013:64` "ambulance remains requested" are **COVERED**. Feature flag `emergencyDispatch` OFF is **COVERED** by `feature-flags.test.ts:5` "are all OFF by default". "Emergency claim/booking not possible" is **PARTIAL**: no assertion rejects an emergency service type at `create_booking_request`. Spec Q01-T34.

### 3.11 Caretaker
`013:43` and `013:44` are **COVERED** (acceptance deferred). Scope and qualification checks are **N/A-UNBUILT**. Spec Q01-T35.

### 3.12 Languages
`profiles.locale` exists (`202611170001_i01_identity.sql`). No i18n UI exists. **NONE**. Spec Q01-T43.

### 3.13 Support/cancellation
| Criterion | Status | Evidence |
|---|---|---|
| Cancellation without invented fee | **COVERED** | `011:10` "policy free patient cancellation", `011:34` "provider cancellation releases resources", `011:42` "confirmed booking cancels without policy", `010:86` "assigned non scheduler cancellation releases resources", `005:64` "stale cancellation" |
| Reschedule gated on policy | **COVERED** | `005:65` "reschedule policy absent" (55000) |
| Fee-policy snapshot | **N/A-UNBUILT** | No published `booking_policy_versions` rows. Spec Q01-T36 |
| Support tickets / escalation | **N/A-UNBUILT** | "ticket" in migrations means document read tickets only |
| Notifications carry no PII | **COVERED** | `005:107` "outbox contains no contact data" |

### 3.14 Live production
Fail closed on release flags: **COVERED** by `feature-flags.test.ts:5` and `:8`. Wrong-tenant denial: see section 6. Webhook retries, restore drill and alerting: **NONE / N/A-UNBUILT**.

### 3.15 Mandatory performance/UX conditions
Viewport widths, keyboard, screen reader, reduced motion, slow network, duplicate submit, reconnect/refetch and SEO noindex all have **NONE**. Duplicate submit is covered at the DB layer only: `005:61` "identical create replay", `005:62` "key payload mismatch". Spec Q01-T44.

### 3.16 `docs/RELEASE_CHECKLIST.md` Application items

| Checklist item | Status | Pointer |
|---|---|---|
| All primary role routes backed by server authorization and RLS | PARTIAL | RLS/ACL loops: `001:52-69`, `005:42-56`, `015:17-21`. Route-level tests are mocked only (`identity-http.test.ts`, `provider-http.test.ts`, `catalog-http.test.ts`, `availability-http.test.ts`). No booking route test exists. Q01-T10 |
| Staff org isolation and authorized patient-dependent access tested | PARTIAL / N/A | Org isolation: section 6.2. Dependent access: no grant RPC exists (only self grants via `create_self_patient`). Q01-T08 |
| Booking concurrency, idempotent acceptance, cancellation/exception paths | PARTIAL | Concurrency COVERED. Idempotent acceptance NONE (Q01-T02). Decline NONE (Q01-T01). Expiry worker unbuilt (`tests/rls/README.md:851`) |
| Patient health questionnaire Unknown/None | N/A-UNBUILT | â€” |
| Doctor arrival OTP expiry/replay/rate limit/wrong actor | N/A-UNBUILT | DC02 |
| Realtime progress secure; reconnect/refetch | N/A-UNBUILT | DC03 |
| Clinical autosave/sign/amendment | N/A-UNBUILT | DC05, DC07 |
| Prescription safety and privacy | N/A-UNBUILT | DC08 |
| PDF/QR/private documents; photo consent | PARTIAL | Provider documents COVERED (`003:118` "download without a read ticket denied", `003:182` "expired read ticket opens nothing", `003:229` "tickets issued only on authorized requests and live 60 s"). Signed-URL route fails closed (`provider-http.test.ts:84`). DC12-DC14 unbuilt |
| Pay-after ledger; no false paid state | N/A-UNBUILT | P01 |
| Security review with negative access tests | PARTIAL | This document; see section 7 |

## 4. DC01-DC14 doctor consultation items

Status for every item: **N/A-UNBUILT, no test.** The migrations contain no consultation, vitals, draft, prescription, visit-proof, visit-evidence or clinical-record table. The `clinical` flag is OFF (`src/lib/feature-flags/index.ts`). Each spec uses the design in `docs/CANONICAL_SCHEMA_DRAFT.md:514-527` and the evidence column in `docs/IMPLEMENTATION_TASKS.md:45-58`. Table and RPC names are design names and are **UNVERIFIED** until a migration exists.

Common fixture for all DC specs (reuse `supabase/tests/_b01_fixture.inc`): patient P1 (`b1..01`), assigned doctor D1 (`b1..02`), outsider O (`b1..03`), aal2 reviewer R (`b1..04`), org staff S (`b1..05`), plus a second patient P2 and a second verified doctor D2 (new). Booking B1 is confirmed for P1 with D1 and moved into the service window with the existing guard-disable clock shift (`005:86-89`).

| ID | Existing partial coverage | Test spec (setup â†’ actor â†’ action â†’ expected) |
|---|---|---|
| **DC01** assigned-doctor authorization (P0) | `booking_private.assigned()` is tested for booking scope (`005:82`, `005:91`, `005:98`, `010:66`, `010:72`, `010:80`, `011:14`, `011:29`) | (a) B1 in window â†’ D2 (verified, unassigned) â†’ read/write any consultation row or RPC for B1 â†’ 0 rows / 42501. (b) D1 after `service_completed` â†’ write draft â†’ 42501. (c) D1 with provider suspended mid-visit â†’ read â†’ 0 rows. (d) S with membership disabled â†’ read â†’ 0 rows. (e) P1 â†’ call clinician-only RPC â†’ 42501 |
| **DC02** arrival OTP (P0) | none | Setup: B1 `en_route`. (a) P1 issues challenge â†’ returns code once; DB stores only a keyed hash (assert the plaintext is absent from the table). (b) D1 verifies the correct code â†’ `arrived`. Replay of the same code â†’ rejected, state unchanged. (c) D2 submits P1's valid code for B1 â†’ 42501. (d) Code for booking B2 used on B1 â†’ rejected. (e) N wrong guesses â†’ locked at the configured limit; the next correct code is also rejected. (f) Code older than expiry â†’ rejected. (g) `advance_visit(B1,'arrived')` without a verified challenge â†’ 55000 (currently allowed: this test fails on today's code). (h) Two concurrent verifications of one code â†’ exactly one success (two-connection runner, like `run_b01_concurrency.py`) |
| **DC03** patient progress (P1) | `005:105` event trail; `005:107` outbox has no contact data | (a) P2 subscribes to or reads B1 events â†’ 0 rows. (b) Event payload contains no clinical or address field (JSON key allowlist assertion). (c) After a reconnect, a refetch of `get_booking` returns state equal to the last event. (d) Anon â†’ no channel access |
| **DC04** vitals/examination (P1) | none | (a) D1 saves vitals with units â†’ stored as typed values. (b) An implausible value (e.g. HR 400) is stored with a warning flag and the input is preserved. (c) A missing unit â†’ 22023. (d) D2, P2, O â†’ read/write â†’ 0 rows / 42501. (e) Direct table INSERT as authenticated â†’ 42501 |
| **DC05** autosave/draft recovery (P1) | version-check pattern exists elsewhere (`001:124` "stale membership version denied", `005:64`) | (a) D1 saves draft v1 â†’ v2. (b) A second save with expected v1 â†’ 40001 and v2 is unchanged. (c) The same idempotency key and payload â†’ same version returned. (d) P1 reads the draft â†’ 0 rows (drafts are never patient-visible). (e) D2 â†’ 42501 |
| **DC06** assessment/diagnosis (P1) | none | (a) D1 records an assessment with "uncertain" â†’ uncertainty is preserved on read. (b) The author must equal `auth.uid()`. An insert with another author â†’ 42501. (c) service_role cannot write the authored row (mirror `016:33`) |
| **DC07** finalized record (P0) | immutability pattern exists (`003:219-222`, `005:103` "events immutable even for owner") | (a) D1 signs draft v3 â†’ the record locks v3 exactly. A later draft edit does not change the record. (b) UPDATE/DELETE on the signed record as postgres/service_role â†’ blocked (55000/42501). (c) An amendment appends a new signed version and the original stays readable. (d) D2 or S without assignment â†’ sign â†’ 42501. (e) Signing twice â†’ second call rejected or returns the same record (idempotent) |
| **DC08** structured prescription (P0) | none | (a) An item without dose/frequency/route â†’ 22023. (b) A drug matching a recorded allergy â†’ blocked until an explicit override with reason. (c) Unsigned prescription â†’ invisible to P1. (d) D2 â†’ 42501. (e) The prescription is not auto-translated: the stored text equals the input. (f) Audit row per sign |
| **DC09** patient consultation view (P1) | `005:71` "foreign patient RLS", `005:72` "foreign detail hidden" | (a) P1 reads the released signed version â†’ visible. (b) P1 reads the draft â†’ 0 rows. (c) P2 reads P1's record â†’ 0 rows, and P0002 from the RPC. (d) A dependent grantee with `consultation:read` scope â†’ visible; with revoked grant â†’ hidden (mirror `001:312`). (e) Anon â†’ denied |
| **DC10** collection status independent (P1) | none (P01 unbuilt) | (a) Finalize record while payment = due â†’ succeeds. (b) Mark payment collected â†’ record unchanged. (c) A pay-after collection cannot set the gateway `paid` state. (d) The browser cannot set any payment field: no route field accepts it (unit test, mirror `catalog-http.test.ts:102`) |
| **DC11** health-fact review history (P1) | none | (a) A verification points to an immutable fact version. Editing the fact creates a new version and the old verification stays linked to the old version. (b) Reviewer = `auth.uid()` with an evidence reference required. (c) History rows are append-only |
| **DC12** QR proof of visit (P1) | none | (a) The token is stored hashed. Decoding the QR payload reveals no patient ID, name, OTP or health data. (b) An expired token â†’ invalid. (c) A revoked token â†’ invalid. (d) A token for B1 does not validate B2. (e) Anon verification returns only valid/invalid plus visit date |
| **DC13** optional photo consent (P1) | private bucket pattern (`001:74` "no public bucket exists", `003:31` "private bounded bucket") | (a) Upload without a purpose-specific consent â†’ 42501. (b) Consent withdrawn â†’ existing objects are no longer readable and a deletion is scheduled per retention. (c) P2, D2 â†’ object read denied. (d) No public bucket |
| **DC14** PDF report (P1) | read-ticket pattern (`003:120`, `003:182`, `003:229`) | (a) A PDF is generated only from a signed record version and stores its hash and version. (b) P1 download needs a per-request authorized short-lived URL; an expired URL fails. (c) P2/D2 â†’ no URL issued. (d) Regenerating after an amendment creates a new version without overwriting the old one. (e) Bucket `clinical-records` is private |

## 5. Specs for untested core behaviour (built code, missing test)

All specs below target code that exists on this base. They go in a new pgTAP suite (suggested `supabase/tests/017_q01_gaps.test.sql`) using `_b01_fixture.inc`, except where a runner is named. Expected SQLSTATEs are inferred from codes the existing suites assert for similar cases. **They are UNVERIFIED until the tests are run.**

| ID | Sev | Setup | Actor | Action | Expected |
|---|---|---|---|---|---|
| Q01-T01 | High | Booking `requested` (version 2) | D1 / P1 / O | `decline_booking(b,2,reason)` | D1: state `declined`, no reservation, one event and one audit. P1: 42501. O: 42501. Then D1 `accept_booking(b,3,â€¦)` â†’ rejected (terminal states never reopen). Stale version â†’ 40001 |
| Q01-T02 | High | Booking `requested` v2 | D1 twice, in two connections | `accept_booking(b,2,[r])` concurrently (add to `run_b01_concurrency.py`); then a sequential re-accept with v2 | Exactly one `confirmed`, one active reservation, one acceptance event. Loser gets 40001. The sequential replay gets 40001 and creates no new event |
| Q01-T03 | High | Confirmed B1 in window, D2 = second verified doctor provider with own resource | D2 | `advance_visit(B1,'en_route',4)`, `get_booking(B1)`, `cancel_booking(B1,4,â€¦)` | 42501, P0002, 42501. B1 is unchanged |
| Q01-T04 | High | Confirmed B1 in window | P1 | `advance_visit(B1,'arrived',â€¦)` | 42501 (the patient cannot self-mark arrival) |
| Q01-T05 | High | Service published, then provider set to `suspended` / evidence expired / service unpublished / coverage withdrawn | P1 | `create_booking_request(...)` with the internal service ID (direct RPC bypassing search) | Each case: 42501 or 55000, and no booking row is created |
| Q01-T06 | High | Confirmed B1, then the provider is suspended or the doctor's evidence expires before the window | D1 | `advance_visit(B1,'en_route',â€¦)`; read contact | 42501; no `address_snapshot`. Booking moves to the documented state (interrupted/needs-reassignment), or the test records that no such state exists |
| Q01-T07 | Med (BLOCKED) | Request created at price v1, provider publishes v2 before accept | D1 | `accept_booking` | Snapshot amount stays v1 (assertable today), **or** acceptance requires patient re-consent (needs a business decision). Write the snapshot half now |
| Q01-T08 | High (N/A) | Dependent patient P3 managed by P1 | P1 / P2 | read P3 profile/booking; create a booking for P3 | P1 allowed only with the scoped grant; P2 0 rows / 42501; a revoked grant hides immediately. Needs a grant RPC first |
| Q01-T09 | High | Org A provider with org A staff; org B manager with `schedule:manage` | org B manager | `upsert_booking_resource`, `set_booking_availability`, `add_booking_blackout` on the org A provider; `accept_booking` with an org B resource on an org A booking | 42501 for each; no row written |
| Q01-T10 | Med | Local Supabase, synthetic JWTs (pattern: `provider-storage-http.test.ts`) | P1, D1, O, anon | HTTP POST to `/api/bookings`, `/api/bookings/:id/accept`, `/decline`, `/cancel`, `/arrive` with injected `price`, `status`, `actor`, `paid` fields | 400 for unknown fields; 401 for anon; 403/404 for foreign actors; the DB row has the server-derived price |
| Q01-T11 | Med | Two providers, bookings for each | D1 | `list_bookings(providerId=D2 provider)`, `get_provider_queue(D2 provider)` | Empty result or 42501; never another provider's rows |
| Q01-T12 | Med | Booking `requested` past its expiry policy | system | `expire_requested_bookings` | **N/A-UNBUILT** (worker absent, `tests/rls/README.md:851`) |
| Q01-T13 | Low | â€” | CI | Add a job that runs `npx supabase test db` against a disposable local stack | All suites 001-016 run on every PR (an owner decision; changes `.github/workflows/ci.yml`) |

Specs for unbuilt journeys (for when the module exists):

| ID | Sev | Spec |
|---|---|---|
| Q01-T30 | Critical | Webhook with a bad signature â†’ 401, no state change. A valid signature with wrong amount or currency â†’ rejected and logged. The same event ID twice â†’ one ledger row |
| Q01-T31 | Critical | A cash/pay-after collection cannot be marked `paid` by any gateway webhook. A gateway `paid` cannot be set by an authenticated client |
| Q01-T32 | High | An invoice is generated only from a recorded collection. No invoice exists while issuer/tax rules are unapproved (flag OFF) |
| Q01-T33 | High | Lab collector role cannot release results. A report is released only after reviewer sign-off. Signed links are scoped to the patient and expire |
| Q01-T34 | High | With `emergencyDispatch` OFF, `create_booking_request` for any emergency-type service â†’ 55000. The UI always shows 112 |
| Q01-T35 | Med | A caregiver without the qualification cannot be assigned to a controlled-duty service |
| Q01-T36 | Med | With a published policy, cancellation stores the policy version and fee snapshot. Changing the policy later does not alter past bookings |
| Q01-T40 | Med | Playwright: every visible CTA resolves (no 404). No testimonial or provider-count element without a source record |
| Q01-T41 | Med | Signup/OTP resend: N requests within a window â†’ 429 from Auth. The adapter does not retry or reset the limit |
| Q01-T42 | Med | Playwright: the 112 link is visible on booking, visit and error pages in en/te/hi |
| Q01-T43 | Low | Locale persisted after reload. Medical strings render the stored source text and are not machine-translated |
| Q01-T44 | Low | Playwright at 360/768/1280 px, keyboard-only booking, axe scan, `prefers-reduced-motion`, double-click submit produces one booking, private routes return `noindex` |

## 6. Cross-cutting negative tests

### 6.1 Cross-patient
| Case | Status | Evidence / gap |
|---|---|---|
| Read another patient's profile, grants, consents | COVERED | `001:85` "cross-patient SELECT denied", `001:86` "cross-patient grants hidden", `001:87` "cross-patient consent hidden" |
| Read another patient's booking (table and RPC) | COVERED | `005:71` "foreign patient RLS", `005:72` "foreign detail hidden" |
| Create a booking for another patient | COVERED | `005:73` "foreign recipient denied" |
| Use another patient's address ID in `create_booking_request` | NONE | Spec: P2 passes P1's address ID â†’ 42501, no row |
| Expired / revoked patient grant | COVERED | `001:272` "expired patient access denied", `001:312` "revoked access immediately hides patient", `001:314` "onboarding retry never resurrects revoked grant" |
| Dependent / caregiver grantee | N/A-UNBUILT | Q01-T08 |
| Clinical records | N/A-UNBUILT | DC09 |

### 6.2 Cross-org / cross-provider
| Case | Status | Evidence / gap |
|---|---|---|
| Read another org, its members, invites | COVERED | `001:94` "cross-org SELECT denied", `001:95` "cross-org member SELECT denied", `001:109-110` cross-org RPC denied, `002:57-58` outsider cannot page |
| Another org's provider documents/objects | COVERED | `003:139` "cross org document read denied", `003:140` "cross org object read denied", `003:143` "wrong user cannot obtain a read ticket" |
| Another provider's services/coverage/prices | COVERED | `004:75-79` outsider cannot read/price/withdraw, `004:167` "wrong organization coverage capability denied", `015:31` |
| Another org's staff credential case | COVERED | `010:44` "foreign case invisible", `010:45` "foreign scoped review denied" |
| Org-scoped admin limited to its org | COVERED | `001:256` "org-scoped verifier is not global admin", `003:249` "wrong admin org scope denied", `003:437` "org-scoped audit grant reads no unscoped audit rows" |
| A **provider** (not a random user) reading or acting on another provider's booking | NONE | Existing tests use O, who is not a provider. Q01-T03, Q01-T11 |
| Cross-org scheduling resources | NONE | Q01-T09 |

### 6.3 Role escalation
| Case | Status | Evidence |
|---|---|---|
| Self-grant admin / provider / verification | COVERED | `001:99`, `001:101` "self provider escalation denied", `001:102` "self verification denied", `001:103` "self access grant denied" |
| Membership promotion / owner promotion / scope delegation | COVERED | `001:106` "raw membership promotion denied", `001:112` "owner promotion denied", `001:113` "cannot delegate beyond own scopes", `002:63` "staff to manager requires fresh acceptance", `001:194` "scope growth suspends old org access" |
| Capability separation (verify vs suspend vs document_read) | COVERED | `003:167`, `003:170-171`, `003:207`, `010:89`, `014:13` |
| MFA required for admin | COVERED | `001:245-246`, `003:158`, `004:82` "aal1 review denied", `004:84` "missing aal claim fails closed" |
| Future/expired/revoked admin grants | COVERED | `001:280`, `001:285`, `001:317`, `003:234`, `003:239`, `003:244`, `004:155-163` |
| service_role cannot forge ledgers | COVERED | `003:219-222` (audit/verification immutable even for privileged SQL), `016:33-35` |
| HTTP role injection | COVERED (mocked) | `identity-http.test.ts:49` "does not forward role injection to a privileged function", `provider-http.test.ts:22` "derives ownership in DB and rejects injected authority", `identity.test.ts:65` "uses verified Auth identity, not browser role claims" |
| Patient performing a provider transition | NONE | Q01-T04 |

### 6.4 Anonymous access
| Case | Status | Evidence |
|---|---|---|
| Anon on I01 tables and RPCs | COVERED | `001:322-326` unauthenticated profile/patient/org/RPC/helper denied, `001:55` "guest cannot execute profile RPC" |
| Anon pagination RPCs | COVERED | `002:120-122` |
| Anon provider data and objects | COVERED | `003:457` "guest eligibility boolean only", `003:458` "guest private metadata denied", `003:459` "guest object denied" |
| Anonymous Auth users (signed-in anonymous JWT) | COVERED | `003:406-410`, `015:41` "anonymous session denied" |
| Anon catalog: public projection only | COVERED | `004:48` "exact public column allowlist", `004:106` "guest direct table denied", `004:107` "guest cannot enumerate coverage queue" |
| Anon booking tables and RPCs | COVERED | `005:47` (no anon access, loop over 12 tables), `005:53` (no guest execution, loop over booking RPCs) |
| Anon HTTP | COVERED (mocked) | `identity-http.test.ts:44`, `:114`, `:138`, `identity-pagination.test.ts:42`, `provider-http.test.ts:17`, `catalog-http.test.ts:65` |
| Anon booking HTTP routes | NONE | Q01-T10 |

### 6.5 Replay / idempotency
| Case | Status | Evidence |
|---|---|---|
| Booking create replay; key reuse with a different payload | COVERED | `005:61` "identical create replay", `005:62` "key payload mismatch", `011:49` "idempotent retry at cap" |
| Org create replay | COVERED | `001:131` "same org request not duplicated", `001:132` "idempotency payload conflict" |
| Document reservation replay | COVERED | `003:60-72` (exact replay, every changed argument conflicts, superseded replay conflicts) |
| Service/coverage replay | COVERED | `004:55` "creation replay does not duplicate", `004:219` "renewal retry preserves idempotency", `004:231` |
| Invitation acceptance replay; stale acceptance reuse | COVERED | `001:188` "repeated acceptance rejected", `001:209` "owner cannot reuse stale acceptance" |
| Read-ticket replay / extension | COVERED | `003:182` "expired read ticket opens nothing", `003:230` "read tickets cannot be extended", `003:194` |
| Accept replay on the same booking | NONE | Q01-T02 |
| OTP replay | N/A-UNBUILT | DC02 |
| Webhook replay | N/A-UNBUILT | Q01-T30 |

### 6.6 Concurrency
| Case | Status | Evidence |
|---|---|---|
| Two accepts, one resource, overlapping slots | COVERED | `run_b01_concurrency.py:106` (23P01, exactly one reservation) |
| Adjacent half-open slots both accepted | COVERED | `run_b01_concurrency.py:110` |
| Cancel vs accept | COVERED | `run_b01_concurrency.py:117` |
| Cancel vs cancel | COVERED | `run_b01_concurrency.py:122` (one cancellation event) |
| Reciprocal invitations, no deadlock | COVERED | `run_i01_followups.py:116` |
| Final invite slot race | COVERED | `run_i01_followups.py:169` |
| Expiry sweep serialization | COVERED (lock presence only) | `003:455` "concurrent sweeps serialize on an advisory lock". This is a single-connection assertion, not a real race |
| Price publish race | COVERED (sequential stale version) | `004:174` "stale concurrent price version denied". Not a two-connection race |
| Same-booking double accept | NONE | Q01-T02 |
| Decline vs accept | NONE | Add to Q01-T01: race decline vs accept on one booking â†’ one terminal state |
| Request cap (10 pending) under concurrent creates | NONE | Spec: 11 parallel creates with distinct keys â†’ exactly 10 succeed (`011:48` tests it sequentially) |
| OTP concurrent verify | N/A-UNBUILT | DC02 (h) |

The concurrency runners only replay suites 001-005 (`run_b01_concurrency.py:150`). Suites 010-016 are not part of any runner and are not in CI.

## 7. Gaps by severity

**Critical** (blocks any release that enables the feature; feature unbuilt today):
1. DC02 arrival OTP. Today `advance_visit(...,'arrived',...)` needs no patient proof (`202611170005_b01_booking.sql:399`).
2. DC01, DC07 and DC08: no clinical authorization, immutable record or prescription tests (all unbuilt, all P0 in `docs/IMPLEMENTATION_TASKS.md`).
3. Payments: webhook signature, amount and dedup, plus "pay-after is never gateway paid" (Q01-T30, T31).

**High** (built code without a negative test; fix before staging UAT):
4. No SQL/RLS suite or concurrency runner in CI (`.github/workflows/ci.yml`). Every COVERED row above can regress unnoticed (Q01-T13).
5. `decline_booking` has no functional test (Q01-T01).
6. Same-booking double accept / accept replay (Q01-T02).
7. A valid but unassigned provider acting on someone else's booking (Q01-T03, T11), and a patient performing provider transitions (Q01-T04).
8. Direct-RPC booking of a suspended/expired/unpublished provider (Q01-T05) and suspension after acceptance (Q01-T06, also a known gap at `tests/rls/README.md:855`).
9. Cross-org scheduling resource injection (Q01-T09).
10. A patient using another patient's address ID (section 6.1).
11. Dependent/caregiver access: release checklist item with no grant mechanism (Q01-T08).

**Medium**:
12. No HTTP route tests against a live DB. Unit tests mock RPC (Q01-T10).
13. Stale price consent rule undefined (Q01-T07, BLOCKED on a decision).
14. Real throttling not exercised (Q01-T41). No E2E, CTA or 112 checks (Q01-T40, T42).
15. Run evidence is stale: 015/016 have no recorded run, unit tests were not re-run after `001300`-`001500`, and `docs/TEST_EVIDENCE.md` lacks every run after F01.

**Low**:
16. `012_b01_legacy.test.sql` duplicates `005_b01_booking.test.sql` (one line differs). This costs run time and leaves two places to edit.
17. Accessibility, i18n and SEO tests absent (Q01-T43, T44). The UI is not built yet.

## 8. Limitations
- Coverage was read from source. No suite was executed for this task, so every COVERED row is "assertion exists", not "passes on `e7165fd`".
- Assertion labels were extracted with a regex over the SQL files, then spot-checked against the source around `005:60-107`, `010:53-92`, `011:31-56`, `013` and `016`. Labels built inside `DO` loops (e.g. `t||' RLS'`) appear in the files as fragments.
- Expected SQLSTATEs in the specs follow the codes existing suites use for similar denials (42501, 40001, 55000, P0002, 22023, 23P01, 53300). Implementers must confirm them against the RPC code.
- DC table and RPC names come from the design draft, not from migrations.
