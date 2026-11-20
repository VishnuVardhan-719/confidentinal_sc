# Frontend change requests (append-only)

Agents append entries here for changes outside their owned paths or for missing/unclear contracts. Do not edit or delete other entries.

---

## FE10-12-data (Kiro D, feat/fe2-d, base 3174196) - 2026-11-18

Source compared: `origin/task/B01-booking` @ e8a71ed (read-only inspection, not merged).

### Booking state mismatches (B01 vs docs/specs/BOOKING_AND_CONSULTATION.md + FRONTEND_MASTER section 9/11)
1. **Case and names.** B01 `bookings.state` is lowercase: `draft, requested, accepted, confirmed, in_progress, completed, declined, expired, cancelled, no_show, interrupted`. Spec uses uppercase and `IN_PROGRESS` vs `IN_CONSULTATION`. Frontend `src/modules/doctor/types.ts` follows B01 lowercase.
2. **Doctor visit overlay is a substate, not booking states.** B01 has `substate in (scheduled, en_route, arrived, service_started, service_completed)` while booking stays `confirmed`/`in_progress`. Spec lists `EN_ROUTE, ARRIVED, ARRIVAL_VERIFIED, IN_CONSULTATION` as lifecycle states. Frontend models a `phase` using B01 substate names.
3. **`ARRIVAL_VERIFIED` missing in B01.** No substate, no OTP challenge table, no `POST /api/bookings/:id/verify-arrival`. B01 `/arrive` only advances substate; it does not start a challenge. B01 `/start` (`service_started`) does not require arrival verification, so the server does not enforce "OTP before consultation". Frontend adds `arrival_verified` as a proposed phase. Backend request: add challenge + verify route + substate, and make `/start` require it.
4. **Error codes.** B01 returns `{ error: { code } }` with `invalid_input`, `booking_unavailable`, `identity_unavailable` (not the frontend `validation`/`unavailable`). Frontend maps by HTTP status via `codeFromStatus`, so this works, but the body code names should be aligned or documented.
5. **Responses carry only `{ version }`.** Commands (`accept, en-route, arrive, start`) return just the new version. Frontend refetches; fine, but a doctor-view DTO is needed to refetch (see 6).

### Missing/unclear contracts (http adapter returns `fail("gated")` until agreed)
6. **Doctor views:** no doctor-scoped DTO for request list (minimal pre-accept fields), assigned visit list, or visit detail. `GET /api/bookings` and `GET /api/bookings/:id` return raw RPC rows of unspecified shape. Needed: `DoctorRequestView` / `AssignedVisitView` shapes in `src/modules/doctor/types.ts`.
7. **Arrival challenge:** need read (`GET` challenge state: expiry, attempts left, resends left, resend-available-at; never the code), resend, and verify (`{ challengeId, code }` -> verified / rejected with reason `invalid_code|expired|replayed|attempts_exhausted`; wrong doctor -> 403).
8. **Clinical:** `GET` draft route missing (needed for conflict recovery); response shapes for `POST /draft` (`{ version, savedAt }`), `POST /finalize` (signed consultation) and `GET /consultations/:id` (draft vs final discriminated by `status`) are frontend proposals in `src/modules/clinical/types.ts`. No amendment route exists in API_CONTRACTS at all (`POST /api/consultations/:id/amend` proposed).
9. **PDF:** `GET /api/consultations/:id/pdf` is described as file delivery. Frontend needs a link-issuing DTO `{ consultationId, version, url, expiresAt }` (or confirmation that the route streams the file with auth and the UI should link to it directly).
10. **Records/patient:** no patient record list endpoint (final-only), no health-fact list/confirm endpoints, no proof revoke or public verify endpoint, no photo consent / upload-URL / view-link endpoints. `POST /bookings/:id/collection` and `POST /bookings/:id/proof` response shapes are frontend proposals in `src/modules/records/types.ts` / `http.ts`.
11. **Clinical policy values not approved:** OTP validity (5 min), attempts (5), resends (3) and resend cooldown (30 s); proof lifetime (24 h); signed link lifetime (300 s); photo max size (10 MB); vital warning thresholds (none shipped; `VitalWarningRule[]` must come from approved clinical governance config); required-field minimum for finalization (`missingForFinalize`). All are fixture/proposed values only.

### Shared code requests
12. `src/modules/clinical/http-util.ts` is a private fetch wrapper (no-store, same-origin, Idempotency-Key, status->code mapping, zod-validated responses). Replace with the shared client in `src/lib/api/**` when its owner publishes one.
13. `StatusTone`/`StatusDescriptor` live in `src/modules/clinical/status-core.ts`. If a shared status/tone type is added under `src/lib` or `src/components/shared`, these maps should switch to it.
14. Message keys referenced by status maps (`doctor.*`, `clinical.*`, `payment.collection.*`, `common.status.unknown`) need entries in `src/messages/{en,te,hi}` by the i18n owner (phase 2 UI ticket).

## FE10-12 phase 2 pre-UI logic (Kiro D, feat/fe2-d) - 2026-11-18
15. **Auth guard.** `src/modules/auth` (requireRole) is not on this branch yet. `src/modules/doctor/routing.ts` holds pure guard decision logic (`decideDoctorAccess`, `loginRedirect` with doctor-path-only `next`). The doctor layout will call `requireRole` once fe2-b auth is merged; please confirm its result shape (unauthenticated / forbidden / restricted).
16. **Backend (B01):** need `GET` list of the doctor's own bookable resources so Accept can send `resourceIds` (B01 only has `POST /api/provider/booking/resources`). `DoctorApi.listAcceptResources` returns `gated` over http until then.
17. **Backend (B01):** decline reasons. The frontend offers doctors `provider_unavailable | unable_to_service | other` (B01 `reasonSchema`); `patient_request` is not offered to doctors. Confirm whether "other" needs a free-text note.
18. **Shared UI (fe2-a):** the consultation editor needs a step rail/stepper, sticky mobile action bar, conflict review dialog (side-by-side changed steps) and a DraftStatus live-region badge. Will compose locally in `src/components/clinical/**` if not provided.

## FE10-12 DC01-DC14 gap review (Kiro D, feat/fe2-d) - 2026-11-18
19. **DC11 correction route:** added `RecordsApi.correctHealthFact` (attributed new version with mandatory reason + evidence; prior value kept). No contract exists: http returns `gated`. Backend: please add `POST /api/bookings/:id/health-facts/:factId/correct` or equivalent.
20. **DC02/DC03 patient side:** the patient arrival view (doctor identity/photo, code shown only after ARRIVED, "check doctor in person, do not share" copy) and patient timeline belong to the patient area, not doctor routes. Owner of `src/app/[locale]/patient/**` should reuse `src/modules/doctor/timeline.ts` (`timelineReducer`) and `status.ts` maps. Needs a patient-scoped challenge DTO that includes the code for the patient only.
21. **DC02 support-assisted fallback** (two-party, audited, doctor cannot self-approve) is a staff/backend flow: not modelled in the doctor module.
22. **DC09 family grants:** fixture denies everyone except the record's own patient. Family/guardian grant model and contract are needed before any shared-record view.
23. **Dashboard verification banner:** needs the provider verification status from the verification module (fe2-b). `loadDoctorDashboard` will take it as an extra injected dependency once that API is on this branch.
24. **E2E:** `tests/e2e/doctor-workspace.spec.cts` is a skipped skeleton. It uses `.cts` so typecheck stays green until fe2-a adds `@playwright/test`; rename to `.spec.ts` after that merge. Needs a fixture sign-in helper from the auth owner.
25. **E2E fixture reset:** the doctor e2e specs mutate the process-wide synthetic world (`sharedClinicalWorld`). A dev/fixture-only reset hook (e.g. a route that exists only when `FRONTEND_ADAPTER=fixture` and `APP_ENV!=production`, owned by the lead/foundation) would make suites independent. Until then specs run serially per booking.

## XREVIEW-b D1-D8 follow-ups (Kiro D, feat/fe2-d) - 2026-11-18
26. **fe2-b auth:** the doctor/clinical/records getters now take `ApiContext { http: { baseUrl, getAccessToken }, fixtureActor }` per request (`src/modules/clinical/context.ts`). Need from fe2-b after merge: a server helper that returns the bearer token from the httpOnly session cookie, and a mapping from the fixture session (`FIXTURE_SESSIONS[scenario].identity.userId`) to `FixtureActor` (doctor -> `FIXTURE_IDS.doctorAssigned`, patient -> `FIXTURE_IDS.patientA`). Unmapped/no session = `NO_ACTOR` (deny all).
27. **Ops:** `APP_ORIGIN` env var (bare https origin) is required for server-side http adapters (`appOrigin()` throws if missing/invalid). Add to `.env.example` (lead owns it).
28. **X1 status tones (fe2-a):** doctor/clinical/records maps use `progress`; fe2-a `StatusBadge` has `brand` and no `progress`. Proposal: fe2-a adds `progress` (clock icon); otherwise pages map `progress` -> `info`. Not changed here (not D1-D8; needs the fe2-a owner).


## 2026-11-18 — FE07/08-data / Codex C — backend contract reconciliation

Inspected read-only: origin/task/B01-booking e8a71ede046ec88cde71cf243adc54b1e64460ac and origin/task/C01-catalog 373251fd40d596a66767bdef934b71e8f69558a7, relative to origin/develop, using diff --stat and git show. No merge, fetch, migration or branch change performed.

- Public directory is GET /api/catalog and /api/catalog/:providerId with required category + PIN, not /api/providers (private onboarding). Implemented allowlisted snake_case-to-view-model mapping; decimal-string paise validated then converted within backend ceiling 10,000,000,000. No private address/contact, invented public provider ID, availability guarantee or verification badge. Please reconcile API_CONTRACTS.md/FRONTEND_MASTER.md routes centrally.
- C01 supports ascending-price cursor pagination only; price_desc is representable in public filter schema but HTTP returns gated until backend supports it. Specialty/language/distance/review/availability filtering has no verified contract. Public provider reference and detailed credentials/profile content are absent from the inspected public projection; do not fabricate them.
- B01 create accepts ONLY patientId, serviceId, addressId, startAt plus UUID Idempotency-Key and returns {id}; list returns {items}; detail {booking}; accept/decline/cancel return {version}. Adapters use these actual shapes, never submit browser price/role/status. Creation transitions draft to requested (version 2), acceptance transitions accepted then confirmed (two version increments). Resources are required for acceptance (one person; ambulance person + vehicle). Refetch on conflict; no blind retries or optimistic booking status.
- Missing: approved policy/price review and consent acknowledgment contract, expected offer version at create, category-specific booking details, selection of multiple lab service lines, approved online-payment selection. The eight-step wizard schemas represent these needs; HTTP create does NOT claim to integrate the complete wizard. Backend must preserve price/policy reapproval before real transactional UI activation.
- B01 doctor substates scheduled/en_route/arrived/service_started/service_completed are operational. They do not prove ARRIVAL_VERIFIED, IN_CONSULTATION, final clinical records, or payment state. These remain separate types. Arrival verification and clinical flows remain gated.
- Missing backend authorized-action grants: permittedActions requires explicit serverAllowedActions plus matching role/state; absent grants disable all. The current B01 projection has no grants; no UI should derive authorization from an account role alone. Need scoped grants incorporating assignment, org membership, verification and policy checks.
- Missing verified booking timeline endpoint; BookingsApi.timeline HTTP returns gated, fixture supplies minimal events. Please supply approved minimal event projection and pagination/version contract.
- Missing verified payment summary/provider collection, support list/detail/create DTO and ownership, and in-app notification list/mark-read endpoints. Proposed docs alone do not establish implemented contracts; corresponding HTTP adapters return gated without network calls. Collection schema models provider cash/direct-UPI claims only, no card data or local paid transition. Need approved reconciliation, ownership, finance/policy gates, and idempotency semantics before replacing gated adapters.
- Future locale owner: add/review keys booking.status.*, booking.action.*, payment.status.* when Phase 2 UI consumes the status maps. No translations or UI files changed in this task.

Lead action: integrate reviewed data layer, update shared task/status/evidence ledgers from src/modules/catalog/FE07-08-HANDOFF.md, assign backend contract deltas, then authorize Phase 2 UI. Fixture-only coverage is not real integration/RLS/concurrency proof.


## 2026-11-18 — Phase 2 C non-UI integration boundaries

- Owner instructed non-UI work first until fe2-a foundation merge notification. Wizard/controllers/view-models/request-scoped loaders are implemented; route pages and binding to real patient guard remain pending that notification. No fake authorization fallback or new speculative API route was added.
- Submission prepare callback deliberately gates without the missing server offer/policy/consent acknowledgment contract noted above. Later denials after unknown POST outcomes do not authorize a fresh key/intent; reconciliation retains the original key/body or known booking ID.
- B01 list is a cursor page, not a complete upcoming-bookings query. Patient loader exposes explicit page completeness and withholds global nextVisit if truncated or cursor-scoped. Backend should supply a bounded upcoming/next-visit query or a reviewed ordering/filter contract before dashboard can claim a complete next visit without fetching all pages.
- Lead can transfer non-UI verification evidence and file map from the Phase 2 section of src/modules/catalog/FE07-08-HANDOFF.md into shared task/status ledgers. Remaining Phase 1 backend capability gaps and UI integration gates still apply.

# Frontend requests and contract mismatches (append-only)

Agents append dated sections below. Do not edit or delete other sections.

---

## 2026-11-18 · FE13-17-data (Kiro E, branch feat/fe2-e) · lab, ambulance, caretaker, admin, CMS, audit data layer

Names checked read-only against `origin/task/C01-catalog` (I01/I02/C01 migrations, routes, validation), `origin/task/B01-booking` (booking states) and `origin/task/S01-design` (`docs/S01_DESIGN.md`). Nothing was merged.

### R-E01 Shared HTTP client (owner: src/lib/api)
- `src/modules/admin/http-util.ts` is a private fetch wrapper (status-to-`ApiErrorCode` mapping, Zod response parsing, `no-store`, `redirect: "error"`, `Idempotency-Key`). Replace it with a shared client in `src/lib/api` once one exists.
- Backend error envelope on C01 is `{ error: { code } }` with codes such as `invalid_input`, `invalid_transition`, `credentials_required`, `identity_unavailable`, `catalog_unavailable`. These do not match `ApiErrorCode` (`validation`, `unavailable`, ...). The wrapper maps by HTTP status only and never shows server text. Request: agree one code vocabulary, or a documented mapping, in `docs/API_CONTRACTS.md`.

### R-E02 Shared status kit (owner: src/lib)
- `StatusTone` / `StatusDescriptor` / `describe()` are duplicated in the six `status.ts` files of these modules, because there is no shared location in my owned paths. Request: a shared `src/lib/status` helper; the modules will switch to it.

### R-E03 Feature flags (owner: src/lib/feature-flags)
- S01 defines `FEATURE_LAB`, `FEATURE_SCHEDULED_TRANSPORT`, `FEATURE_CARE` (all OFF). They are not in `FEATURE_FLAGS`. Request: add `lab`, `scheduledTransport`, `care`.
- Advanced recurring care plans have no flag. The caretaker module hard-codes the gate OFF (`RECURRING_CARE_GATE`). Request: add a `recurringCare` flag (default OFF) if the owner wants it switchable.
- Lab report review/release is gated on `isEnabled("clinical")` (release matrix: "Clinical records, prescriptions, lab report release"). S01 puts report upload/review/release in P2. Confirm `clinical` is the right gate, or add `labReports`.

### R-E04 Admin capabilities (owner: backend I01)
- I01 `admin_capabilities.capability` allows only `provider:verify`, `coverage:verify`, `security:audit`, `membership:admin`.
- The frontend model also defines proposed `booking:operate`, `payment:read`, `refund:approve`, `support:operate`, `settings:read`, `content:edit`, `content:publish` (FE spec section 15). No real principal holds them yet, so those areas render denied. Request: backend migration and contract for these, or replacement names.
- I01 RPCs only accept `scope_key = 'global'`. The frontend supports organization-scoped grants (`{ kind: "organization", organizationId }`) for audit; the backend needs an equivalent before org-scoped admins exist.

### R-E05 Provider verification states
- I01 defines `verification_state in ('draft','submitted','verified','rejected','expired','suspended')`; I02 replaces it with `('draft','submitted','under_review','approved','rejected','suspended')`. The frontend uses the I02 set. `verified` and `expired` map to "unknown", not approved.
- The FE spec lists "changes required", "active" and "expired" states, plus a "request changes" decision. I02 has none of these (decisions: `under_review`, `approved`, `rejected`, `suspended`). Request: decide whether "request changes" and expiry are states or derived flags.

### R-E06 Money format
- C01 returns `amount_paise` as a decimal string (`amount_paise::text`, `paiseSchema` string). Frontend view models use integer paise (`number`). `paiseFromServer()` in `admin/http-util.ts` converts and rejects values that are not safe integers. Confirm that the maximum (10,000,000,000 paise) stays within `Number.MAX_SAFE_INTEGER`; it does today.
- C01 `service_price_versions.unit` allows `visit|test|trip|hour|day`. Caretaker pricing per FE spec 14 needs `week` and `month`. The frontend marks those rates `periodSupportedByBackend: false`. Request: owner policy and a C01 unit change, or drop week/month.

### R-E07 Endpoints with no documented contract (http adapters return `gated`)
Documented and wired: `POST /api/admin/providers/:id/review` (body `{ decision, reason, expectedVersion }`, response `{ provider: { id, verification_state, version, ... } }` per C01). The C01 handler does not read `Idempotency-Key`; the frontend sends it anyway.

Not documented, so `fail("gated")`:
- Lab: branches, catalog, staff, order queues, order detail, assigned collections, collection commands (S01 proposes `POST /api/bookings/:id/lab/{start-collection,collected,handoff,collection-failed,handoff-failed}`), recollection request, report list/review/release.
- Ambulance: fleet, crew, request queue/detail, trip queue/detail, driver trip view, trip commands (S01 proposes `POST /api/bookings/:id/trip/{en-route,arrived,picked-up,destination-reached,interrupt}`).
- Caretaker: services/rates, staff, requests, assignments, care commands (S01 proposes `POST /api/bookings/:id/care/{start,end,interrupt}`), shifts, check-in/out, absence, replacement. Recurring plans stay gated by policy.
- Admin: provider review queue and detail (`GET`), document signed URL (I02 has `/api/providers/:id/documents/:documentId/signed-url` but it is not in API_CONTRACTS), coverage queue/review/history (C01 has `GET /api/catalog/admin/coverage` and `POST /api/catalog/admin/coverage/:id/review`; request adding them to API_CONTRACTS so they can be wired), booking ops search, admin invites/scope/suspend, payments, refunds, support queue.
- CMS: admin content CRUD/workflow and the public stories/FAQ read model.
- Audit: event list. I01 `audit_events` has no organization column; org-scoped audit reading needs one (or a join rule).

### R-E08 State-name differences (frontend follows backend/S01)
- Lab: FE spec actions "accepted/arrived/collected/failed/recollect" map to S01 substates `scheduled → collecting → collected → processing_handoff`, failures `collection_failed`, `handoff_failed`. Recollection is a new booking (S01), never a reset. Turnaround claims are stored but not shown (`turnaroundDisplayApproved: false`, S01-Q05).
- Ambulance: FE spec "reached/completed" is S01 `destination_reached` (booking state `completed`). `cancelled` and `no_show` are shared booking states; `no_show` only through support review, never a driver button.
- Caretaker: S01 substates `assigned/started/ended/care_interrupted`. Shift attendance (`scheduled/checked_in/checked_out/absent/replaced`) is a frontend view model; `care_shifts` is deferred in the schema, so the shape needs backend agreement.
- Payment status uses lowercase snake_case (`not_initiated`, `due`, `processing`, `paid`, `partially_paid`, `disputed`, `refunded`) to match the canonical schema; FE spec section 16 writes them in upper case.
- Lab staff roles `manager/collector/reviewer` are not I01 membership roles (`owner/manager/staff/billing`). Request: the scope names the backend will use for collector and reviewer.

### R-E09 Messages (owner: i18n)
- Status label keys are defined in each module's `status.ts` (`lab.status.*`, `ambulance.status.*`, `ambulance.vehicleType.*`, `ambulance.emergency.call112`, `caretaker.status.*`, `caretaker.task.*`, `caretaker.rate.*`, `admin.status.*`, `admin.priority.*`, `admin.settings.*`, `admin.cms.status.*`, `admin.audit.*`). They need en/te/hi entries. Lab completion copy must never say "report ready" (S01-Q08), and no ambulance string may contain minutes or an ETA (S01 A13).

---

## 2026-11-18 · FE13-17 Phase 2 logic (Kiro E, branch feat/fe2-e) · guards, workspaces, loaders, CMS editor

### R-E10 Public stories/FAQ helper (for the public-site owner)
- Import from server components only: `import { getPublishedStories, getPublishedStory, getPublishedFaq } from "@/modules/content/public"`.
- Signatures: `getPublishedStories(locale)`, `getPublishedStory(slug, locale)`, `getPublishedFaq(locale)`. Each returns `{ status: "ok", data, fixture } | { status: "empty", fixture } | { status: "not_found" } | { status: "unavailable" }`.
- Only published snapshots are returned. `fixture: true` means synthetic data, so render `<FixtureNotice/>`. While there is no CMS contract, lists return `empty` and a story detail returns `not_found`, so public pages show their empty or not-found state and never invented copy.
- `servedLocale` differs from the requested locale only on an explicit fallback to `en`; show a "shown in English" note in that case.
- Bodies are structured rich-text nodes (`paragraph`, `heading` 2/3, `list`, text with bold/italic, `link`). Render them with React elements and never as HTML.

### R-E11 Auth guard integration (owner: src/modules/auth)
- Route layouts in the lab, ambulance, caretaker and admin areas will call `requireRole` and then the pure decisions in `src/modules/{lab,ambulance,caretaker}/routes.ts` and `src/modules/admin/routes.ts`.
- They need these session fields from the auth module:
  - `profileId`
  - `memberships: WorkspaceMembership[]`: `membershipId, profileId, providerId, organizationId, area ("lab"|"ambulance"|"caretaker"), displayName, membershipRole ("owner"|"manager"|"staff"|"billing"), status, scopes, resourceId`
  - for admins, an `AdminPrincipal`: `profileId, status, mfaVerified` (server-asserted), `grants[]`
- Request: expose these from the server session, or a mapper, so `GuardSession` and `AdminPrincipal` are not built from client data.
- Workspace selection is stored in the cookie `scv_ws_<area>`. The value is a workspace key such as `lab:<providerId>` (no personal or health data). The server must re-validate the membership on every request.
- Login redirect: `loginRedirectPath(locale, path)` only keeps locale-prefixed internal paths and drops query strings. If auth already has an equivalent helper, the area layouts will use that one instead.

### R-E12 Placement of shared operations helpers
- Workspace/org-switcher logic (`src/modules/admin/workspace.ts`), loader results, metrics and guard decisions (`src/modules/admin/access.ts`) currently live in the admin module (FE spec section 15 covers organization management). An `organizations` module or `src/lib` may be a better home. Moving them is a mechanical import change.

### R-E13 Booking status map (owner: bookings module)
- Admin booking ops (`BookingOpsVM.bookingState`) passes the raw shared booking state through, so that the page renders it with the bookings module's canonical status map. This avoids a second map for the same state machine. Request: export `describeBookingState` (or equivalent) from the bookings module.

# Frontend requests (append-only)

Requests for changes outside an agent's owned paths, and contract mismatches found while building against the backend. Append new entries at the end; never edit or delete earlier ones.

---

## FE03-data (Kiro B, `feat/fe2-b`, base `3174196`), 2026-11-18

Backend inspected read-only: `origin/task/I01-auth-rls` @ `1efbab0`, `origin/task/I02-provider-onboarding` @ `34811b8`. Rule applied in the HTTP adapters: call an endpoint only if it is in `docs/API_CONTRACTS.md` or implemented on I01/I02; otherwise the method exists and returns `fail("gated")`.

### Contract mismatches

| ID | Area | Frontend spec | Backend in flight | Frontend handling | Needs |
|---|---|---|---|---|---|
| R-FE03-01 | Signup/login method | FRONTEND_MASTER s8: phone + OTP, resend countdown and throttle from server | I01: email + password only (`/api/auth/signup`, `/api/auth/login`); no OTP endpoints | `signupSchema`/`loginSchema` support both; `phone_otp`, `verifyOtp`, `resendOtp` return `gated` over HTTP | Backend/owner decision on auth method; if OTP: start/verify/resend contract returning `challengeId, maskedDestination, status, expiresAt, resendAvailableAt, resendsRemaining, attemptsRemaining, serverNow` (shape in `src/modules/auth/schemas.ts` `otpChallengeSchema`) |
| R-FE03-02 | Token transport | No tokens in browser storage (CONVENTIONS, s19) | I01 login/refresh return `accessToken`/`refreshToken` in JSON; API routes accept bearer only (`requestClient`) | `AuthApi.login/refresh` marked SERVER-ONLY; HTTP adapter takes an injected `getAccessToken()` | `src/lib/auth` owner: httpOnly Secure SameSite cookie session (or BFF) that converts cookie to bearer server-side |
| R-FE03-03 | Session view | Identity with workspaces, incomplete/restricted states, memberships | `GET /api/auth/me` returns `profile` + `roles[]` only. I02 `identity_roles()` lists a provider category only when approved + active + publishable, so draft/submitted/suspended providers are invisible; patient returned for every active account with no questionnaire status | Patient workspace mapped to `unknown`, which `canAccessRoute` treats like incomplete (fails closed: setup pages only). Unknown role strings dropped | `/api/auth/me` (or new endpoint) returning `workspaces[]`: `{ role, state, providerId?, providerStatus?, membership? }` including non-active providers and patient onboarding completion |
| R-FE03-04 | Provider status enum | draft, submitted, under_review, changes_required, approved, active, suspended, expired | I02 `verification_state`: draft, submitted, under_review, approved, rejected, suspended; `status`: active, inactive, suspended. I02 migration folds legacy `expired` into `suspended` | Frontend enum = task list + `rejected` (needed for the reject decision). `active` derived only from approved + status active. Unknown values -> `unknown` (never active) | Backend: add `changes_required` and a distinct `expired` (credential expiry), or owner confirms they are dropped |
| R-FE03-05 | Admin review decision | approve, reject, changes_required, suspend + reason | I02 `review_provider` decisions: under_review, approved, rejected, suspended; approve only from under_review | Decisions mapped approve->approved, reject->rejected, suspend->suspended; `changes_required` returns `gated`; `startReview()` sends `under_review` | Backend: `changes_required` transition (back to editable) with reason |
| R-FE03-06 | Membership roles | Spec: owner, manager, doctor, technician, driver, caregiver, billing | I01: owner, manager, staff, billing | Frontend uses I01 values (`src/modules/organizations/types.ts`) | Owner confirms whether staff sub-roles are needed |
| R-FE03-07 | Provider onboarding routes | API_CONTRACTS: `POST /api/onboarding/provider` | I02: `POST /api/providers`, `GET/PATCH /api/providers/:id`, `POST /api/providers/:id/submit`, `POST /api/providers/:id/documents` | Frontend uses the I02 routes | Docs owner: update `docs/API_CONTRACTS.md` to the I02 routes (or backend aliases the contract route) |
| R-FE03-08 | Category onboarding data | s8 fields: doctor registration/fee/PINs/radius/start/hours/photo; lab org/branches/catalog/coverage/staff; ambulance operator/fleet/crew/pricing; caretaker skills/coverage/pricing | I02 persists only `provider_profiles(display_name, description)` and document metadata | Full Zod section schemas exist (`src/modules/onboarding/provider.ts`); `saveProviderSection` persists only `listing` and returns `gated` for every other section | Backend contract(s) for category profile sections, server-saved partial drafts and versioning; public photo asset upload contract (`photoAssetId`) |
| R-FE03-09 | Required evidence | s8 also lists ID evidence for doctors/caregivers | I02 `required_kind`: doctor registration, lab licence, ambulance vehicle_permit, caretaker background_check | Frontend requires exactly the I02 kind per category; other kinds optional | Owner/verification lead confirms evidence list per category |
| R-FE03-10 | Patient questionnaire | `POST /api/onboarding/patient`, no request schema in API_CONTRACTS | Not implemented. I01 has `POST /api/auth/patient {policyVersion, consent:true}` (self patient + consent) | `submitPatientQuestionnaire` POSTs `patientQuestionnaireSchema` (sections with `state: known/none/unknown`); `createSelfPatient` uses the I01 route; draft read/save return `gated` | Backend agrees the body shape (proposal in `src/modules/onboarding/patient.ts`) and adds draft GET + per-section save with `expectedVersion` |
| R-FE03-11 | Error specificity | Map stable codes to actionable messages | I02 `databaseError` collapses `credentials_required`, `provider_profile_required`, `document_limit`, `invalid_transition` into `invalid_input` | UI can only say "invalid" on submit/review failures | Backend: return the specific stable `error.code` (and field) for these cases |
| R-FE03-12 | Review queue | s15 queue with filters | No list endpoint for verifiers | `listReviewQueue` returns `gated` | `GET /api/admin/providers?state=&category=` with pagination |
| R-FE03-13 | Private document viewer | Signed URL per issuance, short expiry | I02 `signed-url` route deliberately returns 503 `provider_signed_urls_unavailable` | Mapped to `gated`; fixture also returns `gated` (no fake URLs) | Reviewed signer that enforces lifetime |
| R-FE03-14 | Activation flags | "Record which sections are required for activation" | Not defined server-side | `requiredForActivation` flags in `PROVIDER_STEPS`/`PATIENT_STEPS` are frontend proposals; lab `staff` is optional | Owner/backend confirm per category |
| R-FE03-15 | Minors | Minor flows need governance approval | No minor/guardian flow | Personal step rejects age < 18 (`minor_flow_not_approved`) | Governance decision (canonical schema Q01) |
| R-FE03-16 | Admin MFA | Invite + MFA sign-in | Admin role only appears with `aal2`; no MFA challenge contract | Not modelled in `LoginOutcome` | Backend MFA step-up contract |

### Requests outside owned paths

- R-FE03-17 `src/messages/{en,te,hi}/onboarding.json` (i18n owner): add keys `onboarding.providerStatus.{draft,submitted,under_review,changes_required,approved,active,rejected,suspended,expired,unknown}` and step labels `onboarding.{patient,doctor,lab,ambulance,caretaker}.steps.<stepId>` as listed in `src/modules/onboarding/{patient,provider}.ts`; validation codes used in `fields` (e.g. `otp_invalid`, `otp_expired`, `pin_invalid`, `required_document_missing`, `clinical_task_requires_nursing_credential`, `minor_flow_not_approved`, `hours_overlap`) need `errors` namespace keys.
- R-FE03-18 `src/lib/auth` (owner TBD): server-side `getAccessToken()` from the cookie session, passed to `getAuthApi/getOnboardingApi/getVerificationApi({ http: { getAccessToken, baseUrl } })`.

---

## FE04-FE06 groundwork (Kiro B, `feat/fe2-b`, on `e4715d1`), 2026-11-18

| ID | Area | Finding | Frontend handling | Needs |
|---|---|---|---|---|
| R-FE04-01 | Env | Server-side calls to our own `/api/*` need an absolute origin. Deriving it from the `Host` header would let a forged header send the user's bearer token elsewhere | `src/modules/auth/server.ts` reads `APP_ORIGIN` (http/https only). If unset, HTTP-mode server calls fail as `unavailable` | Env owner: add `APP_ORIGIN=` (name only) to `.env.example` and deployment config |
| R-FE04-02 | Session refresh | Server Components cannot set cookies, so an expired access token cannot be refreshed during render | Expired session -> login with `reason=session_expired` (refresh cookie still present). `AuthApi.refresh` exists for a refresher | Owner of `src/proxy.ts` (or route handler): refresh using the `scv_rt` cookie and rewrite `scv_at` before render |
| R-FE04-03 | My providers | No endpoint lists the caller's own providers (draft/submitted ones are hidden from `/api/auth/me`, R-FE03-03) | Onboarding loader uses the workspace `providerId`, else a validated `?provider=<uuid>` lookup key returned by create (API authorizes the read; category re-checked) | Backend: `GET /api/providers?mine=true` or include non-active providers in the session workspaces |
| R-FE04-04 | `server-only` | `server-only` is not installed; Vitest cannot resolve it | Server modules (`auth/server.ts`, `*/actions.ts`) import `next/headers`, which already fails in client bundles | Package owner: optionally add `server-only` + a Vitest alias |
| R-FE04-05 | Coverage admin | No coverage list/decision contract (canonical `provider_service_areas`) | `VerificationApi.listCoverage/decideCoverage`; HTTP returns `gated`, fixture is synthetic | Backend: `GET /api/admin/coverage?category=&state=&pin=` and `POST /api/admin/coverage/:id/decision {decision, reason, expectedVersion}` |
| R-FE04-06 | i18n keys | New keys used by flow states: `auth.errors.{invalidCredentials,accountRestricted,accountExists,rateLimited,methodUnavailable,otpInvalid,otpExpired,checkFields,sessionExpired}`, `onboarding.errors.{checkFields,draftConflict,saveUnavailable}`, `admin.review.errors.{checkFields,staleVersion,unavailable,confirmRequired}`, `common.roles.*`, `common.workspaceState.*`, `errors.<ApiErrorCode>`, `errors.fields.<code>` | Returned as keys only | Added with the pages after the fe2-a i18n foundation is merged (my namespaces) or by the i18n owner (shared namespaces) |

---

## FE05 e2e scaffolding and spec-gap review (Kiro B, `feat/fe2-b`, on `4120d8f`), 2026-11-18

| ID | Area | Finding | Frontend handling | Needs |
|---|---|---|---|---|
| R-FE05-01 | Playwright | `@playwright/test` and `@axe-core/playwright` are not installed on this branch (they arrive with `feat/fe2-a`). `tsconfig` includes `**/*.ts`, so specs importing them would fail typecheck | `tests/e2e/*.ts` carry a TEMPORARY `// @ts-nocheck` (with an eslint-disable for that rule only). All suites are `test.describe.fixme` until pages exist | After the fe2-a merge: remove the two header lines from each `tests/e2e/*.ts` file and run `npx playwright test --config tests/e2e/playwright.config.ts` |
| R-FE05-02 | Playwright config | No repo-level `playwright.config.ts` exists | Area config in `tests/e2e/playwright.config.ts` (fixture adapter, port 3100, serial, artifacts in OS temp dir) | Package/CI owner: decide on a root config, or keep per-area configs |
| R-FE05-03 | Invitations | I01 `list_organization_invites` returns `organization_id, scopes, version` only; there is no organization name or role to show the invitee | `OrganizationsApi.listInvitations` shows scopes only; unknown scope strings are dropped | Backend: include organization display name and `membership_role` in the invitation list |


# Frontend cross-workstream requests (append-only)

Add new entries at the bottom. Do not edit or delete other agents' entries; reply with a new entry.

---

## R-FE01-1 (from Kiro A, FE01/FE02, feat/fe2-a) — routes linked from public pages, owned by other workstreams
Public pages link to these routes. They return the localized 404 until phase 2 builds them. The e2e link check (`tests/e2e/public.spec.ts`) skips only these prefixes.

| Route (under `/{locale}`) | Linked from | Expected owner |
|---|---|---|
| `/login` | header "Sign in" (desktop + mobile menu) | auth (FE03) |
| `/signup` | header "Sign up" | auth (FE03) |
| `/signup?role=patient` | /become-a-provider "Create a patient account" | auth (FE03) |
| `/signup?role=doctor`, `?role=lab`, `?role=ambulance`, `?role=caretaker` | landing "Offer your services" list, /become-a-provider | auth (FE03) |
| `/doctors?pin=NNNNNN` | finder, header Services menu, footer, landing doctor section | directory (FE07) |
| `/lab-tests?pin=NNNNNN` | same as above | directory (FE07) |
| `/ambulances?pin=NNNNNN` | same as above | directory (FE07) |
| `/caretakers?pin=NNNNNN` | same as above | directory (FE07) |

Contract the finder relies on: `?pin=` is a 6-digit shape-validated PIN (first digit 1-9, ASCII digits). The directory must still validate it server-side and show "no verified providers for this PIN" honestly.

## R-FE01-2 (from Kiro A) — files touched outside the listed owned paths
Necessary for FE01; please review in the diff:
- `next.config.ts`: wrapped with `createNextIntlPlugin("./src/i18n/request.ts")` (next-intl needs it). No other change.
- `src/proxy.ts`: the locale routing proxy (Next 16 name for middleware). Only next-intl locale redirects, no auth logic. Auth workstream must compose with it rather than add a second proxy file.
- `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/icon.svg` (replaces the create-next-app `favicon.ico`).
- `src/app/layout.tsx` and `src/app/page.tsx` were deleted: the root layout is now `src/app/[locale]/layout.tsx` (required by `next/root-params`, which next-intl 4.15 uses). Do not re-add a pass-through `src/app/layout.tsx`; it would become the root layout and break locale resolution.
- `package.json`: added script `test:e2e` (`playwright test`).

## R-FE01-3 (from Kiro A) — content/CMS module needed for stories
`/stories` and `/stories/[slug]` read from `src/components/public/stories-source.ts`, which returns no content (no CMS or approved content exists). Request: a `src/modules/content` API (http + fixture adapters) returning only approved, published, consented stories per locale. Swap the two functions in `stories-source.ts` to call it. Fixture stories must never render on a public production page.

## R-FE01-4 (from Kiro A) — support/contact endpoint
`/contact` has no form, because there is no approved support endpoint or staffed channel and a form that goes nowhere would be a fake CTA. When `support` exposes a public contact endpoint (with anti-abuse and no health-detail fields), add the form to `/contact`, and publish the approved phone/email/WhatsApp in `public.contact`.

## R-FE01-5 (from Kiro A) — notes for other workstreams using shared components
- Strings: add keys to `src/messages/en/<namespace>.json` first, then real te/hi translations; `tests/unit/ui-messages.test.ts` fails on missing keys, empty values, changed ICU placeholders or English copied into te/hi. Namespace files for every role already exist (empty `{}`).
- Only `common`, `errors`, `accessibility` are sent to the browser. Client components needing other namespaces should receive translated strings as props from a server parent (see `ServiceFinder`, `FaqSearch`).
- `AppShell` takes `nav: ShellNavItem[]` with already-localized labels and an icon key; `count` must be server-derived. Put role pages inside it from your role layout.
- Status badges: keep one canonical map per state machine in `src/modules/<name>/status.ts` and resolve through `resolveStatus` from `src/components/shared/status.ts` so unknown statuses render neutral.
- Import `Link`/`useRouter`/`usePathname` from `@/i18n/navigation`, not from `next/link` or `next/navigation`.

## 2026-11-18 - USER-REQ-1 B/C/D / Kiro fe-c2 (feat/fe2-c) - doctor search, LocationPicker, booking gate
- **R-C2-1 (backend, catalog/C01): doctor search contract.** `/doctors` needs a public search endpoint with: text query (doctor/clinic name), city/PIN, speciality, language, gender, consultation mode, max fee (paise), availability window (today/tomorrow/week, IST), minimum experience, include-fully-booked, sort (`availability`, `nearest` from a POST-body origin, `fee_asc`) and page/total. Per result: provider/service IDs, display name, https photo URL or null, specialities (taxonomy slugs), degrees, experience years, languages, gender, modes, server-aggregated rating `{average,count}` or null, fee paise + unit, open-slot count, next slot UTC, clinic name, locality/city/PIN, distance km. Plus a suggestions endpoint (doctor and clinic names). Until then `createDoctorSearchHttpApi` returns `gated` and the page says search is not connected. Shape: `src/modules/providers/doctor-search.ts`.
- **R-C2-2 (backend, profile owner fe-b): profile completion + family grants + addresses + offer/policy reads.** The booking gate counts the server's required items (`{key, required, done}` per member, keys in `src/modules/patient/schemas.ts`). The owner said "13 required"; the fixture assumes name, email, verified mobile, DOB, gender, address, city, state, PIN, pinned location, allergies, medical history, current medicines. **Owner to confirm the exact 13.** Also needed: members with `canBook`/`canViewRecords`, address list, and a server price/policy offer for a schedule. HTTP adapters are `gated` (`src/modules/patient/api.ts`).
- **R-C2-3 (fe-b): profile form anchors.** Missing-item links go to `/patient/profile#field-<key>` and `/patient/health-profile#field-<key>` (`profileItemHref`). Please give the matching form controls those IDs. Inline editing of missing items in booking step 1 needs fe-b's save API.
- **R-C2-4 (fe-a): placement and export.** Put `DoctorSearchBar` (`src/components/directory/doctor-search-bar.tsx`) on the landing page, wrapped in `BookingIntl` or with the `booking` namespace supplied, and export `LocationPicker` (`src/components/booking/location-picker.tsx`) from shared if wanted. Both are client components that need `booking.search.*` / `booking.location.*`. Deviation from R-FE01-5: doctor pages use a nested `NextIntlClientProvider` (`BookingIntl`) that ships the `booking` namespace to the browser instead of passing strings as props; reason: the combobox/filters/picker need many ICU strings. Lead to accept or ask for props.
- **R-C2-5 (owner/lead): map provider and photo domain.** "Show on map" and map pin adjustment are gated notices: no approved map vendor (sending coordinates to a third party needs approval). Doctor photos render as initials until an approved image host/`next/image` domain exists.
- **R-C2-6 (lead): patient guard.** `src/modules/auth` (requireRole) is not on this branch; patient routes stay unbuilt/fail-closed until fe2-b merges.
- **R-C2-7 (clinical review):** symptom to speciality hints (`SYMPTOMS` in doctor-search.ts) need clinical review before launch.

## R-FE-D-29 (from fe-d owner) - server intent id for sign/amend recovery (XREVIEW-c P1)
Amendment/finalize responses can be lost. The frontend now accepts a readback as success only if the CURRENT signed version is an amendment of the submitted base, with the same reason, reasonText and exactly the submitted content (finalize: first signing only, same consultationId); otherwise it shows conflict/review. That is still inference. Request: the clinical contract echoes the Idempotency-Key (or a server mutation id) on each signed version/amendment record, so recovery can bind the result to this intent and signer exactly. Until then a byte-identical amendment from another clinician would be indistinguishable (attribution still shows the server signer).

## R-FE-D-30 (from fe-d owner) - autosave terminal failures (XREVIEW-c P2)
Reconnect no longer lifts forbidden/unauthenticated/validation/gated autosave blocks or refills the retry budget. Only an explicit "Try saving again" (draft machine `retry_requested`) clears it. Backend note: the draft PUT must still re-check authorization on every write.

## R-INT-1 (from fe-int, feat/fe2-integration) - browser e2e deferred
User rule (2026-11-18): no Playwright/chrome-headless-shell or any browser e2e run on this machine. All browser e2e specs under `tests/e2e` (`*.spec.ts`, `*.spec.mjs`, `*.spec.cts`) are DEFERRED, not run, and not claimed as evidence. Verification on the integration branch relies on lint, typecheck, unit tests (vitest) and build only. Earlier per-branch e2e results (for example fe2-c doctor-search 9 pass) are historical and were not re-run here. Lead to schedule browser e2e on a machine or CI runner where it is allowed.

---

## 2026-11-18 · Kiro A (fe2-a) · phase 2 + USER-REQ-1 A

### R-FE01-6 (to fe-b, auth) — session for the public header, sign-out, return path
`src/components/shared/session-seam.ts` `getPublicAccount()` returns `null` until wired. Please provide from `@/modules/auth/server`: the signed-in account's display name (optional), its authorized workspaces (role + dashboard or onboarding href) and a POST sign-out route that clears the httpOnly cookies and redirects to `/{locale}`. Then replace the seam body. The header Sign in link sends `?next=<public path>` (built by `safeReturnPath`: internal, no query/hash). The login page must still validate `next` server-side.

### R-FE01-7 (to fe-c2, providers/search) — doctor search URL and suggestions
- Landing hero search navigates to `/{locale}/doctors?q=<text>&pin=<6 digits>` or `&city=<text, max 60>`; no JS goes through `/{locale}/find?search=doctors&q=&location=` (303 to the same URL). Please honour `q`, `pin`, `city` on the results page.
- Suggestions: `src/components/public/search-suggest.ts` (server action) returns `gated`. On integration call the providers module and return `SuggestionGroup[]` with groups `specialities | symptoms | doctors | clinics`, localized labels, locale-less hrefs, published verified providers only. No suggest endpoint exists in API_CONTRACTS; this needs a backend contract (not invented here).
- The shared `LocationPicker` (USER-REQ-1 C) should be added to the `@/components/shared` barrel when it lands; fe2-a will review the export.

### R-FE01-8 (to all) — shared kit changes that affect consumers
- Status tones now include `progress`; module maps can keep `{ labelKey, tone }` and render via `KeyedStatusBadge` / `toStatusDescriptor`. Full `labelKey`s must exist in en messages: `tests/unit/messages.test.ts` scans `labelKey: "..."` literals. Payment status keys (`payment.status.*`) were added to match fe2-c's map; please send any other namespace keys you need (booking, clinical, ...) so fe2-a can add en/te/hi.
- `GateNotice` accepts `reason="contract_pending"` for gates without a feature flag.
- `normalizeIndianMobile` no longer truncates; over-long input fails `isValidIndianMobile`.

### R-FE01-9 (to lead) — config files touched outside listed paths
- `vitest.config.mts`: `server.deps.inline: ["next-intl"]` (lets jsdom tests render components using the locale `Link`) and `testTimeout: 20000`.
- `next.config.ts`: security headers + CSP (`script-src 'self' 'unsafe-inline'`, no third-party origins; Supabase origin from `NEXT_PUBLIC_SUPABASE_URL` in `connect-src`), `poweredByHeader: false`. Approved vendors (Razorpay, Maps) must be added explicitly when their gates open.

### R-FE01-10 (to lead) — runtime 404 shell (known limitation)
For URLs not prerendered (unknown `/{locale}/...` and story slugs), Next 16 + Cache Components streams an error shell (`<html id="__next_error__">`, status 404) that the client replaces with the localized not-found page. Without JS that shell has no `lang`, title or text. The documented fix for a dynamic root layout is the experimental `app/global-not-found.tsx` (`experimental.globalNotFound`), which needs a decision because it is experimental and must resolve the locale without root params. The first request for a new story slug also returns 200 (noindex) before later requests return 404.

### R-FE01-11 (to lead / ex-fe-c2 code on feat/fe2-c) — doctor search integration and a script bug
- Landing hero placement for R-C2-4 is ready: `src/app/[locale]/(public)/page.tsx` renders fe2-a's `DoctorSearch` today and carries the exact swap to `<BookingIntl><DoctorSearchBar idPrefix="hero" /></BookingIntl>` after the merge. Header primary nav now has "Find doctors" -> `/doctors` (desktop + mobile), alongside the Services menu and footer links.
- Bug on feat/fe2-c `src/modules/providers/doctor-search.ts`: `querySchema` and `citySchema` use `\p{L}` without `\p{M}`, so most Telugu/Hindi words (vowel signs are combining marks) fail validation and the results page rejects the URL. Add `\p{M}` to both character classes (`cleanSearchText` in `doctor-search-bar.tsx` too). fe2-a's `doctorSearchHref` already keeps combining marks and otherwise mirrors the schema.

### R-FE01-12 (to lead) — browser e2e deferred by user rule
Per the owner's instruction, Playwright/browser e2e is not run from this worktree any more. These specs are written but DEFERRED (not verified in their final form): `tests/e2e/public.spec.ts`, `tests/e2e/public-nav.spec.ts` (nav walk, signed-out header, hero doctor search, no-JS search), `tests/e2e/a11y.spec.ts` (axe at 360/768/1024/1440 x en/te/hi, 200%/400% zoom reflow, keyboard focus, security headers), `tests/e2e/perf.spec.ts` (lab metrics, gated by `E2E_PERF=1`). The last partial run before the rule (on a stale server, then a single-worker run stopped by the orchestrator) showed failures that were being fixed: 360px header overflow (fixed: compact "112" emergency label), Telugu story-page overflow (fixed: buttons and headings wrap), axe on the runtime 404 error shell (see R-FE01-10). Run them once on the integration branch with `--workers=1` before release; `NAV_WALK_STRICT=1` there.
Last measured lab numbers (mobile 390, 1.6 Mbps / 150 ms RTT / 4x CPU, run alone): `/en` FCP=LCP 1.3 s, CLS 0.000, JS 201 KB compressed; `/te` 2.0 s, CLS 0.007; `/en/faq` 0.9 s; `/en/emergency` 1.0 s. These are lab indicators, not Lighthouse or real-user numbers (Lighthouse was not installed and was not added).

## R-FE-D-31 (from fe-d owner) - patient dashboard built in fe2-d (FE-C2 handover)
- `/[locale]/patient/dashboard` (page/loading/error) + `src/modules/patient-dashboard/{loader,session}.ts` + messages `patient.json` (en/te/hi).
- Byte-identical copies from feat/fe2-c@0331c6b so fe2-d builds: `src/modules/{bookings,patient,payments,catalog,providers}/*` (import closure only), `src/lib/api/{fixture,http}.ts`, `src/lib/format/index.ts`, `src/fixtures/marketplace/{bookings,doctors,patient,payments,providers}.ts`, `src/messages/*/booking.json`. On merge take fe2-c's version of every one of these; fe2-d made no edits to them.
- Interim patient session: http mode = unauthenticated -> login; fixture mode needs server env FIXTURE_PATIENT_SESSION=self. Replace with fe2-b requireRole("patient").
- The fe2-c bookings fixture seeds nothing by default; server env FIXTURE_BOOKING_SCENARIO (e.g. accepted) selects a synthetic booking in fixture mode.
- Missing routes linked from the dashboard: `/patient/bookings`, `/patient/bookings/[id]`, `/patient/profile`, `/patient/health-profile` (owners: fe-c / fe-b).
- `payment.status.*` keys are referenced by fe2-c `payments/status.ts` but `payment.json` is empty; dashboard uses its own `patient.dashboard.payment.*` labels.
- Clinical badge matches patient records by booking reference; it shows "Clinical records are off" while FEATURE_CLINICAL is off. A per-booking clinical-status field in the booking DTO would be better.

## R-FE-D-32 (from fe-d owner) - browser e2e deferred
Per user rule, no Playwright/browser runs from agents. `tests/e2e/doctor-workspace.spec.cts` stays `test.fixme` and the patient dashboard has no e2e spec yet; both are deferred to a run the owner starts. Evidence for fe2-d is lint, typecheck, unit tests and build only.


---

## 2026-11-18 · FE13-17 cross-review fixes (Kiro E, branch feat/fe2-e) · XREVIEW-d E1-E11

### R-E14 Story publish consent gate (NEEDS PRODUCT CONFIRMATION)
- Rule implemented (FE spec section 15, "publisher role and consent evidence"): a CMS story can be published only when its working copy has a `consentEvidenceId`, or when the editor ticks the explicit attestation `noIdentifiablePerson: true` ("this story shows no identifiable person").
- FAQ entries and pages are not gated.
- Enforcement points:
  - `publishConsentDenial` / `contentActionDenial` in `src/modules/content/rules.ts`. Publish fails closed when the working copy is not supplied.
  - `availableContentActions` hides Publish when the gate fails, and `publishBlockedKey` returns `admin.cms.publishBlocked.consentRequired`.
  - The fixture adapter returns `validation` with `fields.consent = "required"`.
- New schema field: `noIdentifiablePerson: boolean` on story/page drafts (default `false`).
- Backend request: add the same check to the CMS publish command. Please confirm the policy: the attestation option, which content kinds are gated, and what consent evidence must reference (consent record ID, retention).

### R-E15 Driver "current trip" window (backend must enforce)
- The driver view shows exactly one current trip with pickup/destination, plus a bare count of later assignments (no references, places or times).
- A trip is current while it is under way (`en_route`/`arrived`/`picked_up`), or from `DRIVER_VIEW_LEAD_MINUTES` (proposed: 120) before its window starts. Unparseable windows fail closed.
- Milestones outside the window are denied (`outside_window`).
- `AmbulanceApi.listDriverTrips()` is replaced by `getDriverQueue(): { current, laterCount }`.
- Backend request: apply the same window server-side for driver reads and the S01 trip commands. Confirm the lead time.

### R-E16 Payment DTO: server-supplied outstanding amount
- `PaymentRecordView` now expects `outstandingPaise` from the server.
- The UI no longer derives or clamps it. Instead it sets `reconciliationMismatch` when collected exceeds due, when any value is negative or not an integer, or when outstanding is not equal to due minus collected.
- Backend request: include `outstanding_paise` in the payment read contract when it is defined.

---

## 2026-11-18 · FE13-17 pages (Kiro E, branch feat/fe2-e)

### R-E17 Session port for private areas (owner: src/modules/auth)
- `src/modules/admin/session.ts#getOperationsSession()` is the single place the lab, ambulance, caretaker and admin areas get identity from. Until the auth module is merged it returns no session, so every private page redirects to `/{locale}/login?next=...`. There are no demo accounts or role cookies.
- To integrate, map auth `getServerSession()` to `GuardSession` and `AdminPrincipal` (fields in R-E11). Pages, loaders and server actions do not need to change.
- Fixture-mode visual and e2e checks of these pages are blocked until then. The view components are covered by jsdom tests that use fixture loaders.

### R-E18 Shared component gaps (owner: fe2-a shared)
- No shared `AccessDenied`, record-list/table-with-mobile-cards, metric tile or confirm-with-select component exists. Local versions are in `src/components/admin/ops/*`. Request shared ones if other areas need them.
- Admin booking ops shows the raw booking state until the bookings module exports its status map (R-E13).
- Lab, ambulance and caretaker billing and support pages, and caretaker availability, render a "not connected" notice. There is no contract for them yet.
- Browser e2e for these areas is deferred by user rule: `tests/e2e/{lab,ambulance,caretaker,admin-ops,cms}.spec.ts` stay `test.describe.fixme` and are not run. Verification uses lint, typecheck, unit/jsdom tests and build only.

## R-FE06 (from Kiro B) - identity, profile and navigation follow-ups
- **R-FE06-01 password recovery contract.** `/recover` says reset is unavailable. Needs a recovery request + reset endpoint with throttling and a non-enumerating response.
- **R-FE06-02 server-issued policy versions.** Terms/consent versions are drafts in `src/modules/auth/policy.ts` (`TERMS_DRAFT_VERSION`, `PATIENT_CONSENT_DRAFT_VERSION`). Server should issue and record accepted versions.
- **R-FE06-03 patient profile backend fields.** Draft GET/save must carry `personal.gender`, `personal.email`, `personal.landmark`, `personal.location` (lat/lng/accuracy), `measurements` (heightCm int 30-250, weightKg 1-300, 1 dp), and server-set `account.phoneVerified`. Profile photo upload contract is also missing (UI shows "not available yet").
- **R-FE06-04 patient AppShell layout.** `/patient/profile` and `/patient/health-profile` live in `src/app/[locale]/patient/(intake)/` with a minimal `AccountFrame`; move them into the patient AppShell when the patient layout exists.
- **R-FE06-05 fe-a shared chrome.** PublicHeader should render `SessionLinks` (`src/components/auth/session-links.tsx`: Sign in / My workspace / Sign out). Shared LocationPicker and an approved maps vendor are needed for a map pin; `LocationField` is the local stand-in.
- **R-FE06-06 dead link `/en/doctors`.** Public chrome (`src/components/public/routes.ts`) and `ROLE_NAV.patient.findCare` link to `/doctors`, which 404s. e2e `navigation.spec.ts` "auth pages link to each other" is `test.fixme` until the route ships.
- **R-FE06-07 `/patient/onboarding` not built yet.** "My workspace" for an incomplete patient goes there (404 today). PHASE2-B wizard is pending; e2e "signed-in chrome" is `test.fixme` until then.
- **R-FE06-08 booking must enforce the profile gate server-side.** `requireCompleteProfile()` / `authorizeCompleteProfile()` in `src/modules/onboarding/profile-gate-server.ts` (pure logic in `profile-gate.ts`) is a UX gate for booking pages/actions. Booking create must also reject incomplete profiles in the backend.
- **R-FE06-09 browser e2e deferred (user rule: no Playwright/browser runs on this machine).** Identity specs in `tests/e2e/` (`auth`, `onboarding`, `admin-verification`, `profile`, `navigation`) are not run here. Last real run before the rule: `profile.spec.ts` 6/6 passed (desktop-1280); `navigation.spec.ts` 2 passed, 2 `fixme` (R-FE06-06/07). The mobile-360 project was never run. CI or a machine with headroom must run them.

## R-FE07 (from Kiro B, PHASE3-B) - role guards, account session, migration targets

### R-FE07-01 `getAccountSession()` for the public header and operations workspaces
- **Import:** `import { getAccountSession, type AccountSession } from "@/modules/auth/server";` (server-only; call inside `<Suspense>`, it reads cookies). Pure mapping for tests: `accountSessionView(lookup, locale)` in `@/modules/auth/account-session`.
- **Signature:** `getAccountSession(locale?: Locale): Promise<AccountSession>`. Locale defaults to the request locale (next-intl). One session lookup per request is shared with `requireRole` (React `cache`). Never redirects.
- **Shape (no user IDs, email, phone, provider IDs, membership details or tokens):**
  ```ts
  type AccountSession =
    | { kind: "anonymous" }
    | { kind: "unavailable" }   // lookup failed: render the signed-out header
    | { kind: "restricted" }    // disabled account: offer sign out only
    | { kind: "signed_in";
        displayName: string;    // trimmed, max 60 chars
        role: Role | null;      // null when the user holds more than one role
        roles: Role[];          // stable order: patient, doctor, lab, ambulance, caretaker, admin
        dashboardHref: string;  // "My workspace": role dashboard, onboarding, or /workspace/select
        workspaces: { role: Role; href: string }[]; // per-role entry links; non-active admin omitted
      };
  ```
- **fe-a (`src/components/shared/session-seam.ts` `getPublicAccount`):** return `null` unless `kind === "signed_in"`; else `{ displayName, workspaces, signOutAction }`. Sign-out is the server action `logoutAction` (`@/modules/auth/actions`), not a URL; render `<SignOutButton/>` (`@/components/auth/sign-out-button`) or use `logoutAction` as the form `action`. `PublicAccount.signOutAction: string` should change to accept the action.
- **Guards (all six roles):** `requireRole(role, { locale?, path? })` from `@/modules/auth/server`. Signed out -> `/{locale}/login?next=<safe path inside that role root>` (`&reason=session_expired` when a session cookie had existed). Wrong role (no workspace of that role) -> the user's own landing page (`/{locale}/{role}/dashboard`, onboarding, or `/workspace/select` for multi-role). Existing but unusable workspace (non-active admin) or disabled account -> `{ kind: "denied" }`, render `<AccessDenied/>`. Server actions use `authorizeRole` (never redirects). There is no public admin signup (`SIGNUP_ROLES` excludes admin).
- **Patient booking:** `requireCompleteProfile()` / `authorizeCompleteProfile()` (`@/modules/onboarding/profile-gate-server`) now send incomplete profiles to `/{locale}/patient/onboarding`, which forwards to the 13-item health profile form until the questionnaire wizard ships. This also fixes the R-FE06-07 404.

### R-FE07-02 operations need more than the non-PHI view
`getOperationsSession()` (fe-e) wants `profileId`, memberships with scopes/resourceId, and an `AdminPrincipal` with server-asserted MFA and grants. `getAccountSession()` deliberately has none of these. Use `requireRole(role)` -> `access.identity` / `access.workspaces` (role, state, providerId, membership view) for workspace selection. MFA status and admin grants are not in the I01 session contract: backend request needed.

### R-FE07-03 interim guards to migrate (do not edit from fe2-b; owners migrate at integration)
| Branch | File | Interim check | Replace with |
|---|---|---|---|
| fe2-d (also on fe2-p, fe2-integration) | `src/modules/doctor/routing.ts` | `GuardResult` / `decideDoctorAccess` / `loginRedirect` mirror of requireRole (XREVIEW-b D4) | `requireRole("doctor")` in the doctor layout; delete the mirror |
| fe2-d (also fe2-p, fe2-integration) | `src/modules/doctor/session.ts` | fixture-session mapping; http mode has no session | `requireRole("doctor")` + `getRequestApis()` |
| fe2-d (also fe2-p, fe2-integration) | `src/modules/patient-dashboard/session.ts` | http mode treats every request as signed out (R-FE-D-31) | `requireRole("patient")`; booking: `requireCompleteProfile()` |
| fe2-e (also fe2-p, fe2-integration) | `src/modules/admin/session.ts` | `getOperationsSession()` returns `{ guard: null, admin: null }` (R-E11/R-E17) | `requireRole(area)` -> identity/workspaces; MFA/grants per R-FE07-02 |
| fe2-e (also fe2-p, fe2-integration) | `src/modules/admin/access.ts` | pure lab/ambulance/caretaker/admin decisions expecting a session from requireRole | keep; feed it `requireRole(...)` output |
| fe2-a (also fe2-p, fe2-integration) | `src/components/shared/session-seam.ts` | `getPublicAccount()` returns `null` (R-FE01-6) | `getAccountSession()` per R-FE07-01 |
| fe2-c (also fe2-p, fe2-integration) | `src/modules/catalog/FE07-08-HANDOFF.md` | private loaders not yet bound to a request-scoped guard | `requireRole("patient")` / `authorizeRole` |

### R-FE01-13 (to lead) — PHASE3-A gaps in src/app (outside fe-a's edit scope)
- Add `src/app/[locale]/(public)/stories/[slug]/loading.tsx` with `export { PublicPageLoading as default } from "@/components/public/page-loading";` (the only public route rendered at request time; the others are prerendered).
- `stories/[slug]/page.tsx` "unavailable" branch renders no `<h1>`; wrap it in `<PublicPageIntro title={t("unavailableTitle")}>` or call `notFound()` and add a key, then update `tests/unit/a11y-static.test.ts`.
- Route-link check (`tests/unit/route-links.test.ts`): 0 dead links; 73 pending routes owned by fe2-b (login/signup), fe2-c (doctors, lab-tests, ambulances, caretakers, patient), fe2-d (doctor) and fe2-e (lab, ambulance, caretaker, admin). Remove entries from its `PENDING` map as each branch merges.

### R-FE01-14 (to lead) — browser e2e un-deferred and passing on feat/fe2-a
R-FE01-12 is resolved: with the ban lifted, all fe2-a browser specs ran against `next start` (port 3330, --workers=1):
`public.spec.ts` + `public-nav.spec.ts` 115 passed / 1 skipped (mobile-only test on desktop); `a11y.spec.ts` 16 passed / 16 skipped (runs once on the desktop project; covers 360/768/1024/1440 x en/te/hi, 200%/400% zoom, keyboard focus, headers); `perf.spec.ts` (E2E_PERF=1, mobile-390) 4 passed. Fix made during the run: Telugu/Hindi header overflowed by 12px at 1280 -> emergency link and language trigger are compact between xl and 2xl, account buttons stay on one line.
### R-FE07-04 routes other workstreams own, skipped or fixme'd in identity e2e (Kiro B, PHASE4)
- Not on feat/fe2-b, so identity e2e skips them: role dashboards and bookings (/{role}/dashboard, /patient/bookings*), /lab/orders, /doctors, /lab-tests (public chrome links to it; 404 on this branch). Re-run 
avigation.spec.ts role walk and the two onboarding.spec.ts fixme tests on the integration branch.
- AccountFrame should drop under role shells once the role layouts exist (one header per page).
- Identity specs mutate shared fixture memory, so run each spec file against a freshly started server (admin-verification approves the lab that onboarding.spec expects under review).
## 2026-11-19 - PHASE4-C3 booking journey (fe-q, feat/fe2-c)
Contracts the patient booking journey uses that B01 / `docs/API_CONTRACTS.md` do not define. The HTTP adapter returns `gated` for each until agreed.
- `visitReason` on create booking: optional free text, max 240 characters, visible only to the booked doctor. The HTTP create strips it today.
- Reschedule: `POST /bookings/{id}/reschedule { version, startAt }`, returns the new version; status goes back to REQUESTED so the doctor accepts again; `conflict` on stale version or overlapping slot.
- Open slots: `GET /providers/{providerId}/services/{serviceId}/slots` for the next 5 IST days, excluding slots that overlap active bookings of that provider.
- Add patient address: `POST /patient/addresses { label, locality, city, pin }` returning the new id and the address list.
- Cancel reason: the cancellation dialog reasons (`schedule_change`, `no_longer_needed`, `chose_other_provider`, `other`) need a mapping to `decisionReasonSchema`; the fixture always sends `patient_request`.
## R-FE-D-32 update (fe-d3, 2026-11-19) - browser e2e now run
The restriction was lifted. `tests/e2e/doctor-workspace.spec.ts` (un-fixme'd) and the new `tests/e2e/patient-workspace.spec.ts` run in Chromium on the ws-desktop-1280 and ws-mobile-390 projects (ports 3370-3383): 110 passed, 0 failed (see .context/handoff-fe-a.md on feat/fe2-d).

## R-FE-D-33 (fe-d3) - proof-of-visit QR and public check page
No QR library is approved and there is no public verification route, so the proof card shows the proof code, expiry and an honest "QR display and the public check page are not connected yet" line. Needed: lead approval of a QR dependency (or server-rendered QR image) and a public `/verify/[token]` page backed by `RecordsApi.verifyProof` that shows no PHI.

## R-FE-D-34 (fe-d3) - patient notifications contract
`docs/API_CONTRACTS.md` has no notifications endpoint. `src/modules/notifications` holds kind + IDs + in-app path only (text comes from localized templates, so no PHI or free text can travel). Fixture adapter is synthetic; http adapter returns `gated` and the page says "not connected yet". Suggested contract: `GET /api/me/notifications` (newest first, `{ id, kind, createdAt, readAt, bookingReference, href }`), `POST /api/me/notifications/read` `{ ids }`.
**Overlap:** feat/fe2-p 4aa02f8 also built `/patient/records*`, `/patient/notifications` and `src/modules/notifications` with a different API. Lead must pick one before integration.

## R-FE-D-35 (fe-d3) - doctor weekly hours
`/doctor/availability` now shows a read-only 7-day IST schedule built from `listVisits` (accepted/confirmed/in-progress only) and the pending request count. Editing weekly hours needs a backend contract (e.g. `GET/PUT /api/providers/me/availability` with versioned weekly windows and exceptions).

## R-FE-D-36 (fe-d3) - te/hi strings to review
Machine-written te/hi for: `patient.records.*`, `patient.notifications.*`, `patient.dashboard.notifications.*`, `patient.dashboard.actions.records*`, `patient.shell.nav.records|notifications`, `doctor.pages.availability.*`, `doctor.common.offlineSince`, `clinical.vitals.incompleteTitle`. Unchanged te/hi for edited en copy: `doctor.common.notFound`, `clinical.gate.consultation`, `clinical.collection.recorded`, `clinical.record.notFound`, `common.gate.features.clinical` (en now "Clinical record keeping").
## 2026-11-19 R7-P patient account features (fe-p, branch feat/fe2-p)

### R-FE-P-R7-1 Family members contract (owner: backend)
No endpoint in docs/API_CONTRACTS.md. The http adapter (`src/modules/family-members/http.ts`) returns `gated`. Proposed:
- `GET /api/patient/family-members` -> `{ items: FamilyMember[] }`
- `GET /api/patient/family-members/:id`
- `POST /api/patient/family-members` (Idempotency-Key header) body `{ displayName, relation, dateOfBirth }`
- `PATCH /api/patient/family-members/:id` body `{ ...fields, expectedVersion }`; `409` on a version mismatch
- `DELETE /api/patient/family-members/:id?expectedVersion=n`
- FamilyMember: `{ id uuid, displayName <=80, relation spouse|child|parent|sibling|grandparent|other, dateOfBirth YYYY-MM-DD, version, updatedAt }`. `422` returns `fields: { displayName|relation|dateOfBirth: name_required|name_too_long|name_invalid|relation_required|dob_required|dob_invalid|dob_future|dob_too_old }`.
- Owner-only (RLS). A non-owned id returns 404, the same as an unknown one.
- Needs product confirmation: the limit of 10 per account (`MAX_FAMILY_MEMBERS`), and guardian consent or invite flows for adult members (FRONTEND_MASTER "consent/invite or guardian flow"). The UI stores name, relation and DOB only, with no health data.

### R-FE-P-R7-NAV Patient nav links (owner: fe2-d patient shell)
fe-p must not edit `PatientShell` or the dashboard nav. Please add these links:
- `/patient/family` (icon `users`, label: new `patient.shell.nav.family` key, "Family")
- `/patient/saved`, `/patient/reviews` and `/patient/settings/reminders`: these pages are coming in R7-P.

## 2026-11-19 - PHASE-R6-C patient lab, caretaker and ambulance requests (fe-q, feat/fe2-c)
`docs/API_CONTRACTS.md` has only the generic `POST /api/bookings` flow. These patient flows need contracts; until then their HTTP adapters (`src/modules/{lab-orders,care-requests,ambulance-requests}/http.ts`) validate input and return `gated`.
- Providers by category and PIN with catalogue: lab tests (name, specimen, preparation, price, report time, collection fee), caretaker (kind, languages, non-clinical tasks, hourly rate, min/max hours), ambulance operator (vehicle types with fixed scheduled-transfer fare).
- Open times per provider (lab collection windows, care shift starts, transfer pickups), excluding overlaps.
- Create: lab order with several test lines; care shift with tasks and hours; scheduled transfer with pickup address, drop-off (kind, optional name, locality, city, PIN), mobility, vehicle, companion and a `notEmergency` confirmation. The server derives the price snapshot in paise; the client sends `expectedTotalPaise` only to detect a change (409 when it differs). Idempotency key required.
- Read one / list own requests with separate booking state, payment state (pay after service) and record state (lab report released only by a reviewer; caretaker and ambulance have no clinical record).
- Patient cancel with version check (`expectedVersion`), free until 2 hours before the start (synthetic, not an approved policy).
- Ambulance: emergency dispatch stays a separate, disabled module. No ETA, tracking or distance quote until an approved contract exists.

## R-FE-D-33 update (fe-a, PHASE R7-D task 1) - public proof check built
`/[locale]/verify` (code entry, plain GET form, works without JS) and `/[locale]/verify/[code]` (valid / expired / withdrawn / unknown) over `src/modules/proof-of-visit`. Shows only the IST visit date, "Doctor home visit" and the doctor display name; malformed and unknown codes look the same; canonical lowercase URL; `noindex` and `referrer: no-referrer`. Behind FEATURE_CLINICAL; the http adapter returns `gated` because there is no public verification endpoint in docs/API_CONTRACTS.md (suggested: `GET /api/proofs/:code` returning exactly `{ status, serviceDate?, serviceCategory?, providerDisplayName? }`, rate limited). The doctor proof card links to the check page. Still open: drawing a QR (no approved library). New namespace `verify` (te/hi machine-written, need review); shared edits: `src/i18n/messages.ts`, `src/i18n/global.d.ts`, `playwright.config.ts` WORKSPACE_SPECS.

## R-FE-D-37 (fe-a, R7-D task 2) - consultation notes contract
`/[locale]/doctor/consultations/[bookingId]` + `src/modules/consultation-notes`: assigned doctor, completed bookings only, draft -> sign-off (summary + advice required, attestation), optimistic `expectedVersion`, read-only after sign-off, no autosave and no browser storage. Fixture only behind FEATURE_CLINICAL; http adapter returns `gated`. Suggested contract: `GET /api/bookings/:id/consultation-notes`, `PUT .../consultation-notes` `{ expectedVersion, sections }`, `POST .../consultation-notes/sign-off` `{ expectedVersion, attest: true }` (409 on stale/signed/not-completed). New namespace `consultationNotes` (te/hi machine-written, need review). Also: visit page "After the visit" link (completed bookings).
Test notes: two doctor-workspace tests hardened (IST-midnight boundary on fixture-relative times; wait for hydration before changing a controlled select). The second points at a real slow-device risk: a select changed before hydration is reset by React (worth a look in fe2-a form controls).

## R-FE-D-38 (fe-a, R7-D task 3) - prescription drafts contract
`/[locale]/doctor/consultations/[bookingId]/prescription` + `src/modules/prescription-drafts`: template-only (typed medicine name, no drug database or suggestions; fixed form / schedule / instruction templates; 1-90 days; max 10 lines), completed bookings only, `expectedVersion`, discard with confirmation, no autosave or browser storage. Status is always `draft`; there is no issue/send action and the page says "Draft - not issued ... not a valid prescription". Fixture only behind FEATURE_CLINICAL; http `gated`. Issuing needs owner approval (clinical production + legal e-prescription rules) and a backend contract. New namespace `prescriptionDrafts` (te/hi machine-written, need clinical-language review).
### R-FE-P-R7-2 Saved providers contract (owner: backend)
No endpoint exists. The http adapter (`src/modules/saved-providers/http.ts`) returns `gated`. Proposed:
- `GET /api/patient/saved-providers` -> `{ items: { providerId, savedAt }[] }`
- `PUT /api/patient/saved-providers/:providerId` (Idempotency-Key header): idempotent save. Returns 404 for an unknown or unlisted provider.
- `DELETE /api/patient/saved-providers/:providerId`: idempotent remove.
- Only ids are stored. The page reads names, specialities and fees from the public doctor directory on every visit, so suspended or unlisted doctors show as "no longer listed".
- Needs product confirmation: the cap of 50 per account (`MAX_SAVED_PROVIDERS`), and whether a save button belongs on the doctor directory and profile pages (owned by fe2-c; not edited here).

### R-FE-P-R7-3 Patient reviews contract (owner: backend + admin moderation)
No endpoint exists. The http adapter (`src/modules/reviews/http.ts`) returns `gated`. Proposed:
- `GET /api/patient/reviews/visits` -> `{ items: { bookingId, bookingReference, category, providerDisplayName, bookingState, completedAt, review | null }[] }`
- `GET /api/patient/reviews/visits/:bookingId`
- `POST /api/patient/reviews` (Idempotency-Key header) body `{ bookingId, rating 1..5, text 10..1000 }`. Returns `201` with `status: "pending_moderation"`. Errors:
  - `403`: booking not completed or not owned
  - `409`: already reviewed
  - `422`: `fields: rating_required | text_too_short | text_too_long | text_contact`
- The server must enforce completion, ownership and one review per booking. It also needs moderation before publishing (admin queue, not built), and a published rating aggregate for `doctorResultSchema.rating`.
- Needs product confirmation: whether patients may edit or withdraw a pending review (not offered), the review window after completion (none enforced), and the contact/link filter rule.

### R-FE-P-R7-4 Reminder preferences contract (owner: backend + notifications)
No endpoint exists. The http adapter (`src/modules/reminder-prefs/http.ts`) returns `gated`. Proposed:
- `GET /api/patient/reminder-preferences` -> `{ channels: { sms, whatsapp, email }, quietHours: { enabled, start "HH:MM", end "HH:MM" }, version, updatedAt }`. Quiet hours are IST wall-clock times and may span midnight; end is exclusive.
- `PUT /api/patient/reminder-preferences` body `{ channels, quietHours, expectedVersion }`. Errors:
  - `409`: version mismatch
  - `422`: `fields: { quietStart|quietEnd: quiet_start_invalid|quiet_end_invalid|quiet_same }`
- The sender (outbox) must apply these preferences server-side. `inQuietHours()` in `src/modules/reminder-prefs/status.ts` documents the intended rule.
- Needs product confirmation:
  - the defaults: SMS on, quiet hours 21:00-07:00 IST
  - whether safety and critical booking messages bypass quiet hours (the UI says only visit reminders are affected)
  - the WhatsApp/SMS consent and opt-in wording (TRAI/DLT)
## 2026-11-19 - PHASE R10-C public lab directory (fe-q, feat/fe2-c)
`src/modules/lab` (fe-e) is the member-scoped lab operations API; there is no public, signed-out read of labs and their tests. `/[locale]/lab-tests` and `/[locale]/lab-tests/[id]` use the synthetic lab-orders fixture (`src/modules/lab-orders/directory.ts`); the HTTP adapter returns `gated` until these exist:
- `GET /api/labs?test=&city=` -> `{ items: LabListing[], cities: string[] }`. Published, verified, active labs only. `LabListing` = `{ id, name, area: { locality, city, pins[] }, collectionOptions: ("home" | "walk_in")[], collectionFeePaise, tests: [{ id, name, specimen, preparation, pricePaise, reportHours }] }`. Integer paise; no staff, phone or street address.
- `GET /api/labs/:id` -> `LabListing`, 404 for unknown, unpublished or suspended labs.
- `test` is a case-insensitive name match (2 to 60 characters); `city` is an exact city match.

## R-FE-D-39 (fe-a, R7-D task 4) - doctor reviews view
`/[locale]/doctor/reviews` + `src/modules/doctor-reviews` (own fixture; statuses and limits aligned with feat/fe2-p `src/modules/reviews`: pending_moderation | published | rejected, rating 1-5, text <= 1000). Read-only; filter links (`?status=`); summary over published reviews only. Privacy: no patient name, booking reference or exact date (visit month only), and rating/text are returned ONLY for moderation-published reviews (projection in the adapter; schema rejects text on unpublished). Behind FEATURE_CLINICAL per PHASE-R7-D (reviews are not clinical; lead may move this to its own flag), http `gated`. Suggested contract: `GET /api/providers/me/reviews` returning the projected shape. Doctor nav gains "Reviews". New namespace `doctorReviews` (te/hi need review).

## R-FE-D-40 (fe-a, R8-D step 2) - input before hydration is silently lost (reproduced)
**Repro:** `tests/e2e/hydration-race.spec.ts` serves the HTML but holds every `/_next/static/chunks/*.js` until released (a very slow phone, deterministically), types/chooses, then lets React hydrate.
**Findings (before the fix, 3 of 3 controlled forms failed):**
- React 19 keeps the DOM value the person typed or chose, but component state keeps its initial value (`""`). The screen shows "Cash" / "800" / the typed note while state is empty.
- Collection form: "Record collection" then reported "Choose a method" and "Enter an amount" next to fields that visibly held them; the next render reset the select to the placeholder. Consultation notes: the typed text showed, but the status said "Not saved yet" and Save would have saved an empty note. Prescription draft: "Enter the name of medicine 1" with the name visible.
- Uncontrolled forms (`defaultValue`, plain HTML submit) are not affected.
- Separate finding: `redirect()` from a page inside a Suspense boundary (any route with `loading.tsx`) is streamed as `<meta http-equiv="refresh" content="1;url=...">` plus a script. Chrome only acts on it after the load event, so with JS still loading the GET form for `/verify` never moved on. Fixed for /verify with a route handler (`/[locale]/verify/check`, HTTP 303), which works with no JavaScript.
**Fix applied in fe-d's own files:** `src/components/clinical/use-hydrated.ts` (`useSyncExternalStore`, false in server HTML and during hydration) disables controlled inputs until hydration in the collection form, arrival-code form, consultation editor, health-facts and photo-consent panels, consultation notes and prescription drafts. After the fix the spec passes at 390px and 1280px.
**Proposed patch for shared controls (not applied; owner fe2-a `src/components/ui/input.tsx`, plus controlled forms in fe2-b auth/onboarding, fe2-c booking wizard, fe2-e ops):**
```tsx
// src/lib/use-hydrated.ts  (move fe-d's hook here)
export const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);

// src/components/ui/input.tsx ("use client"): protect controlled inputs only; uncontrolled/no-JS forms unchanged.
export function Input({ disabled, ...props }: ComponentPropsWithRef<"input">) {
  const hydrated = useHydrated();
  const lock = props.value !== undefined && !hydrated;
  return <input {...props} disabled={disabled || lock} aria-disabled={lock || undefined} /* existing classes */ />;
}
// Same for Textarea, and add a shared <Select> wrapper (native <select> elements are used directly today).
```
Alternative where a form must work before hydration: make it uncontrolled (`defaultValue` + `FormData` on submit), like the /verify form. Avoid `redirect()` for no-JS GET forms under `loading.tsx`; use a route handler.

## 2026-11-19 R8-P2 review edit/withdraw and moderation (fe-p, feat/fe2-p)

### R-FE-P-R7-3 (amended) Patient review edit and withdraw
- `PATCH /api/patient/reviews/:bookingId` body `{ rating, text, expectedVersion }`. The review returns to `pending_moderation` with `rejectionReason: null`. Errors: `409` on a version mismatch or a withdrawn review; `422` uses the same field codes as create.
- `POST /api/patient/reviews/:bookingId/withdraw` body `{ expectedVersion }`. Sets `withdrawn`, which is final; the booking cannot be reviewed again.
- Review DTO gains `rejectionReason (personal_info|not_about_service|offensive|spam|null)` and `version`.

### R-FE-P-R8-1 Review moderation contract and capability (owner: backend + admin)
- New proposed capability `review:moderate` (added to `PROPOSED_ADMIN_CAPABILITIES`) and admin route `/admin/reviews`.
- `GET /api/admin/reviews?status=pending_moderation|published|rejected` -> items `{ reviewId, bookingReference, category, providerDisplayName, rating, text, status, submittedAt, rejectionReason, version }`. Items carry no patient identity.
- `POST /api/admin/reviews/:reviewId/decision` body `{ decision: "publish" } | { decision: "reject", reason }` plus `expectedVersion`. Only `pending_moderation` reviews can be decided; anything else returns `409`. Every decision needs an audit entry.
- Fixture-only moderator (needs lead review): `src/modules/admin/session.ts` returns a synthetic admin holding only `review:moderate`. It applies when `FIXTURE_ADMIN_SESSION=moderator` (server env) is set in fixture mode, and is refused in production. Remove it when the auth module is adopted.
- The http adapters (`createReviewModerationHttpApi`, patient edit/withdraw) return `gated`.
- R9-P decision log (`/admin/reviews/log`, same `review:moderate` gate, read-only, no undo). Needs `GET /api/admin/reviews/decisions` -> entries `{ entryId, bookingReference, category, providerDisplayName, outcome: "published"|"rejected", reason, decidedAt, decidedBySelf }`, newest first. The server records the decider and computes `decidedBySelf` against the caller; it never returns the moderator id, the patient identity or the review text. A decision with no attributable decider must be refused. `listDecisions()` over http returns `gated`.
- Open question for lead: should moderation decisions also appear in the global `/admin/audit` stream (`security:audit`)? The fixture keeps them in a separate log only.

### R-FE-P-R9-1 (to lead / fe-a) - shared public-nav hero search spec is out of date after the R-C2-4 swap
- `tests/e2e/public-nav.spec.ts:81` and `:93` (4 failures, both projects) wait for fe-a's `DoctorSearch` labels ("City or PIN code" textbox, "Doctor, speciality or symptom" combobox; hi "शहर या पिन कोड", searchbox, "डॉक्टर खोजें"). Since f18d7cb (integration) the landing page renders fe-c's `DoctorSearchBar idPrefix="hero"`, whose fields are "Search doctors, specialities or symptoms" (combobox) and "City" (textbox), with a "Search" button and a separate "PIN code" finder below.
- This is a spec/markup mismatch, not a regression from fe2-a's header fix or from fe-p. fe-p did not edit the spec (fe-a's file) or the landing page (integration). Fix: update the two tests to the DoctorSearchBar labels and URL contract (`/doctors?q=&city=|pin=`), or decide which component the hero keeps.
### R-FE01-13 (to lead) — PHASE3-A gaps in src/app (outside fe-a's edit scope)
- Add `src/app/[locale]/(public)/stories/[slug]/loading.tsx` with `export { PublicPageLoading as default } from "@/components/public/page-loading";` (the only public route rendered at request time; the others are prerendered).
- `stories/[slug]/page.tsx` "unavailable" branch renders no `<h1>`; wrap it in `<PublicPageIntro title={t("unavailableTitle")}>` or call `notFound()` and add a key, then update `tests/unit/a11y-static.test.ts`.
- Route-link check (`tests/unit/route-links.test.ts`): 0 dead links; 73 pending routes owned by fe2-b (login/signup), fe2-c (doctors, lab-tests, ambulances, caretakers, patient), fe2-d (doctor) and fe2-e (lab, ambulance, caretaker, admin). Remove entries from its `PENDING` map as each branch merges.

### R-FE01-14 (to lead) — browser e2e un-deferred and passing on feat/fe2-a
R-FE01-12 is resolved: with the ban lifted, all fe2-a browser specs ran against `next start` (port 3330, --workers=1):
`public.spec.ts` + `public-nav.spec.ts` 115 passed / 1 skipped (mobile-only test on desktop); `a11y.spec.ts` 16 passed / 16 skipped (runs once on the desktop project; covers 360/768/1024/1440 x en/te/hi, 200%/400% zoom, keyboard focus, headers); `perf.spec.ts` (E2E_PERF=1, mobile-390) 4 passed. Fix made during the run: Telugu/Hindi header overflowed by 12px at 1280 -> emergency link and language trigger are compact between xl and 2xl, account buttons stay on one line.
## 2026-11-20 - R9-C3 Hindi plural for zero, patch proposal (fe-q, feat/fe2-c)
**R-FE-Q-R9C3-1.** CLDR puts 0 in the Hindi `one` category (`new Intl.PluralRules("hi").select(0) === "one"`). These Hindi messages hard-code "1" in `one` and have no `=0`, so a count of 0 renders as "1". `tests/unit/adversarial-guards.test.ts` now fails on any new case; these three are exempt (`HI_PLURAL_EXEMPT`) until their owners apply the patch, then the exemption line must be deleted.

| Owner | File | Key | Now | Proposed |
|---|---|---|---|---|
| fe-e | `src/messages/hi/ambulance.json` | `dashboard.daysLeft` | `{count, plural, one {1 दिन बाकी} other {# दिन बाकी}}` | `{count, plural, =0 {आज समाप्त} one {# दिन बाकी} other {# दिन बाकी}}` |
| fe-e | `src/messages/hi/lab.json` | `orders.testCount` | `{count, plural, one {1 जाँच} other {# जाँचें}}` | `{count, plural, one {# जाँच} other {# जाँचें}}` |
| fe-a | `src/messages/hi/common.json` | `errorSummary.title` | `{count, plural, one {आगे बढ़ने के लिए 1 समस्या ठीक करें} other {...}}` | `one {आगे बढ़ने के लिए # समस्या ठीक करें}` (other unchanged) |

The ambulance case matters most: `src/modules/ambulance/view-models.ts` emits `daysLeft: 0` for a licence that expires today. "आज समाप्त" ("expires today") needs native review (REVIEW_NEEDED). On fe2-int the same defect also exists in `hi/auth.json` `otp.attemptsLeft` (fe-b): proposed `{count, plural, =0 {कोई प्रयास बाकी नहीं} one {# प्रयास बाकी} other {# प्रयास बाकी}}`.

**R-FE-Q-R9C3-2 (integration note).** The same test forbids fixture value imports in `src/app/**` and `src/components/**` (finding 1 came from one). On fe2-int, `src/app/[locale]/patient/dashboard/page.tsx:20` (fe-d) imports `DEFAULT_PATIENT_ACTOR` from `@/fixtures/clinical/world` behind `isFixtureAdapter()`. Proposal: read the actor from `getPatientSession().fixtureActor` (`src/modules/patient-dashboard/session.ts` already imports it behind `assertFixtureAllowed`). Otherwise add the file to `UI_ALLOWED` in the test with that reason when merging.
## 2026-11-20 - R9-C5 doctor reviews vs patient review statuses (fe-q review of feat/fe2-d)
**R-FE-Q-R9C5-1 (fe-d, fe-p, backend).** `src/modules/reviews/types.ts` (fe-p) has `withdrawn`; `src/modules/doctor-reviews/types.ts:10` (fe-d) does not, and its strict list schema fails on any unknown status, so one withdrawn review makes `/doctor/reviews` "unavailable".
- Proposed contract: the doctor feed (`GET` provider reviews, not yet in API_CONTRACTS) never returns `withdrawn` rows; withdrawn is final and hidden from everyone but the patient.
- Proposed client patch (fe-d): in the fixture projection and before `doctorReviewListSchema`, drop rows whose status is `withdrawn`; keep the strict schema for the rest.
- Proposed UI change (fe-d, privacy): for `pending_moderation` and `rejected`, show counts only, not per-review cards with the exact submission date (`src/app/[locale]/doctor/reviews/page.tsx:100-133`), so a doctor cannot tie an unmoderated or rejected review to a recent home visit.
- Guard: `tests/unit/peer-guards.test.ts` lists `withdrawn` in `DOCTOR_OMITS`; remove it there only if the doctor view starts showing withdrawn reviews deliberately.

## 2026-11-20 R9-E2 identity e2e run (fe-b, branch feat/fe2-e)

Context: `auth`, `navigation`, `onboarding`, `profile` and `admin-verification` were run in fixture mode at 390 and 1280. Blocks that were `describe.fixme` were un-fixme'd where their pages now exist. Tests that still reach routes not built on this branch are `test.fixme` and name the route. Nothing outside fe2-e owned files was edited.

### R-E9E2-01 admin dashboard links to unbuilt review pages (for the lead to assign)
- The admin overview tiles "Providers waiting for review" and "Coverage proposals" link to `/{locale}/admin/providers` and `/{locale}/admin/coverage`, which return the localized 404 on fe2-e. The FE06 pages are not built yet. The verification logic exists in `src/modules/verification` with the fixture adapter, and `tests/e2e/admin-verification.spec.ts` is written but `describe.fixme`.
- Interim: `navigation.spec.ts` skips these two hrefs in the verifier walk (`NOT_BUILT_HREFS`). Once the pages exist, remove the set and the `describe.fixme` in `admin-verification.spec.ts`.
- Request: assign FE06 `/admin/providers` (queue and detail) and `/admin/coverage`. Until then, choose whether the tiles stay as dead links or render without a link.

### R-E9E2-02 lift fixmes at integration (fe-int2, fe2-int)
Routes built on other branches, but not on fe2-e: `/patient/dashboard`, `/patient/bookings` (fe2-d), `/doctor/*` (fe2-d), `/doctors` (fe2-a, R-FE06-06). After merging, apply this patch on `feat/fe2-integration` and rerun the suites:
```diff
--- tests/e2e/auth.spec.ts
-  const NOT_BUILT = new Set(["/en/patient/dashboard", "/en/doctor/onboarding", "/en/admin/providers", "/en/admin/coverage"]);
+  const NOT_BUILT = new Set(["/en/doctor/onboarding", "/en/admin/providers", "/en/admin/coverage"]); // keep the rows that are still unbuilt
--- tests/e2e/navigation.spec.ts
   const BLOCKED: Record<string, string> = {
-    [ACCOUNTS.patientComplete]: "...",
-    [ACCOUNTS.doctorActive]: "...",
   };
-  // fixme: shared public chrome links /en/doctors ... R-FE06-06.
-  test.fixme("auth pages link to each other and to legal drafts", ...
+  test("auth pages link to each other and to legal drafts", ...
```
The sign-out test in `auth.spec.ts` now signs out from `/en/account/security` instead of the patient dashboard, and the expired-session test uses `/en/patient/profile` instead of `/en/patient/bookings`. Both keep their original intent, so no revert is needed.

### R-E9E2-03 CONVENTIONS wording for form errors (owner: docs/frontend/CONVENTIONS.md)
`CONVENTIONS.md` line 20 says "error summary, focus first invalid". The shared `ErrorSummary` (`src/components/shared/error-summary.tsx`) focuses the summary itself, so screen readers announce it, and each item links to and focuses its field. That is the GOV.UK pattern. The e2e test now asserts this behaviour. Proposed wording: "error summary takes focus; each item links to and focuses its field". Alternatively, change `ErrorSummary` if focus should move straight to the field (owner fe-a).

### Fixed in fe2-e (no action needed)
- Signup: the chosen role was lost when switching between the Email and Mobile tabs. Each tab had its own uncontrolled radio group. It is now one controlled value (`auth-flow.tsx`).
- Operations workspaces (lab, ambulance, caretaker, admin) had no Sign out control. It is now in the top bar of `AreaShell` and in `OpsFrame` (the denied and choose-organization frames), at every width.
## R-FE-D-41 (fe-a, R8-D6) - shared form controls lose input typed before hydration (reproduced in one shared form; others ruled out or probable)
**Repro:** `tests/e2e/hydration-race.spec.ts` "shared controls" (JS chunks held back, same harness as R-FE-D-40). Home page `ServiceFinder` (`src/components/public/service-finder.tsx`, owner fe2-a): PIN `500001` typed and "Lab tests" chosen before hydration are visibly CLEARED when React hydrates (state `""` wins), then Find shows "Enter your 6-digit PIN code" and "Choose a service". Fails at 390 and 1280. Marked `test.fail()` so the suite stays green; delete that line once fixed (the test then has to pass).
**Shared controls checked:**
| Control | Result |
|---|---|
| `src/components/ui/input.tsx` `Input`/`Textarea` | Pass-through `<input>`/`<textarea>`. Affected only when used controlled (`value=`) without a hydration gate; uncontrolled use is safe (proof check passes with no JS). |
| `ServiceFinder` (controlled `value`/`checked`) | **Reproduced** (above). |
| `FaqSearch` | Ruled out: the search box is hidden until hydrated (`enhanced`). |
| `PhoneInput`, `OtpInput` (`src/components/shared`) | Controlled by design (`value` + `onValueChange`). Not used by any page on feat/fe2-d, so not run here. On fe2-int `auth-flow.tsx:232` uses `PhoneInput` controlled: **probably affected**, needs the same harness on fe2-int. |
| Radix `Select`/`Checkbox`/`RadioGroup` (`src/components/ui`) | Ruled out by structure: they render `<button>`s with state in React only, so a click before hydration changes nothing on screen (unresponsive, but no hidden mismatch). On this branch they are used only in fe-d forms, which are already hydration-gated (R-FE-D-40), so not browser-tested here. |
**Proposed fix for ServiceFinder (not applied; fe2-a owns it):** keep it a progressive GET form, but make the fields uncontrolled so React never overwrites what the person entered:
```tsx
// pin: drop value/onChange state; normalise in place.
<input name="pin" defaultValue="" onInput={(e) => { e.currentTarget.value = normalizePin(e.currentTarget.value); clearPinError(); }} ... />
// radios: drop checked={...}; keep onChange only to clear the error.
<input type="radio" name="service" value={s.key} onChange={clearServiceError} ... />
// submit: read what is on screen.
function onSubmit(e) { e.preventDefault(); const fd = new FormData(e.currentTarget);
  const result = validateFinder({ pin: normalizePin(String(fd.get("pin") ?? "")), service: String(fd.get("service") ?? "") as ServiceKey | "" }); ... }
```
The same pattern (or R-FE-D-40's `useHydrated` gate) applies to `PhoneInput`/`OtpInput` users.

## R-FE-D-42 (fe-a, R8-D6) - fixture production guard is now an allowlist (ADVERSARIAL_REVIEW finding 2); integration notes
- `src/lib/api/mode.ts`: `fixtureRefusal()` / `assertFixtureEnvironment()`. Fixtures are allowed only when `APP_ENV` is `development`, `test`, `preview` or `staging`, or when `APP_ENV` is unset under `next dev`/vitest (`NODE_ENV` development/test). `VERCEL_ENV=production` always refuses. The real process env is authoritative; an injected env can add a refusal, never lift one. `getAdapterMode`, `assertFixtureMode` (`src/lib/api/fixture.ts`) and `assertFixtureAllowed` (`src/fixtures/clinical/world.ts`) all use it. Tests: `tests/unit/fixture-production-guard.test.ts`.
- **Lead decision:** `staging` is on the allowlist because fe2-c/e/p/int e2e specs document `APP_ENV=staging` with fixtures. The review proposed development/test/preview only; remove `staging` if staging must never serve synthetic data, and update those specs.
- **Breaking for e2e:** `next start` runs with `NODE_ENV=production`, so a fixture server with `APP_ENV` unset is now refused (checked: `/en/doctor/dashboard` logs "Synthetic fixtures are disabled here (APP_ENV is not set)" and renders no fixture data). fe2-d's `wsEnv()` now sets `APP_ENV=test`. Integration (`.context/int2-serve.ps1`, `tests/e2e/integration.config.ts`) and any other fixture server must set `APP_ENV` too.
- **fe2-int merge:** `src/modules/auth/fixture-guard.ts` (fe-b) still checks only `APP_ENV === "production"`. Patch: `export function assertFixtureAllowed(env = process.env) { assertFixtureEnvironment(env); }` (import from `@/lib/api/mode`).
- **R-FE-Q-R9C3-2:** on feat/fe2-d the patient dashboard already takes the actor from `getPatientSession().fixtureActor` and imports nothing from `@/fixtures`; `tests/unit/no-fixture-imports-d.test.ts` now fails on any fixture value import in `src/app` or `src/components`. The `DEFAULT_PATIENT_ACTOR` import at fe2-int `page.tsx:20` came from the merge resolution. Patch for fe2-int: replace `requireRole(...)` + `DEFAULT_PATIENT_ACTOR` with `const s = await requirePatientSession(locale, path); if (s.status === "denied") return <AccessDenied reason={s.reason} />; const fixtureActor = s.fixtureActor ?? undefined; const synthetic = s.synthetic;` (`requirePatientSession` is in fe2-int `src/modules/patient-dashboard/session.ts`), and pass `authorizePatient: authorizerFor()`.
