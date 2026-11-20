
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