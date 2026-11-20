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

### R-FE-P-R9-2 (to fe-a) - modal language menu aria-hides a focusable page (axe aria-hidden-focus, serious)
- At 1280, with the `LocaleSwitcher` dropdown open (`src/components/shared/locale-switcher.tsx`), axe reports `aria-hidden-focus` on the shell's skip link, sidebar, top bar and main content. Radix `DropdownMenu` is modal by default and aria-hides everything outside the menu.
- fe-p's overlay sweep (`tests/e2e/a11y-sweep-p.spec.ts`, notifications and reminders, en/te/hi) checks that Tab and Shift+Tab stay inside the menu, and while that holds it accepts only this rule, only in the menu case.
- Suggested fix: `<DropdownMenu modal={false}>` in the locale switcher (the WAI-ARIA menu button pattern is non-modal). After that, the exception in the sweep can be removed. fe-p did not edit the component (fe-a scope).

### R-FE-P-R9-3 (to lead / fe-b) - sign-in return to the decision log
- Root cause: `AdminFrame` (admin layout, fe-e) redirected signed-out visitors itself with `next=/{locale}/admin/dashboard`, so every admin page returned to the dashboard. The layout now renders no shell when signed out and leaves the redirect to the page gate; a unit test checks every admin page is gated. fe-e please review. The lab/ambulance/caretaker frames were not checked for the same pattern.
- fe2-p now sends `next=/{locale}/admin/reviews/log` from the decision log: `AdminRouteGate` takes a fixed `subPath`, `adminPagePath` accepts plain lowercase segments only, and `loginRedirectPath` still reduces `next` to an internal locale-prefixed path with no query (tests/unit/modules-operations/admin-return-path.test.ts).
- fe2-p has no login page. The consumer that reads `next` after sign-in is fe-b's `auth-page.tsx` + `normalizeInternalPath` on feat/fe2-integration, which already rejects off-site and `/api` targets. The end-to-end landing (sign in, then arrive on the log) can only be checked after integration.
