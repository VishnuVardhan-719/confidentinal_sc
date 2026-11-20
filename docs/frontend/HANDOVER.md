# Frontend handover: second frontend developer and backend connection

**Basis.** Everything here was read from `feat/fe2-integration` at `2954551` (the latest merge of branches a, c, d, e and p) and checked against the code, not only the docs. The backend facts come from read-only `git ls-tree`/`git show` of `origin/task/I01-auth-rls`, `I02-provider-onboarding`, `C01-catalog` and `B01-booking`. File paths are relative to the repo root.

**Rules that don't change.** Read `AGENTS.md`, `docs/FRONTEND_MASTER.md` and `docs/frontend/CONVENTIONS.md` first.
- Synthetic data only. No secrets in code or docs.
- Money is integer paise.
- Times are stored in UTC and shown in Asia/Kolkata.
- Booking, payment and clinical states are separate.
- No PHI in URLs, browser storage or logs.
- Live payments, emergency dispatch and clinical features stay off in production until approved.

## (a) Running the app: fixture mode vs http mode

### How the data adapter is chosen (`src/lib/api/mode.ts`)

- `getAdapterMode()` returns `"fixture"` only when `FRONTEND_ADAPTER=fixture`. **Anything else, including unset, is `"http"`.**
- Fixture mode is allowed only when all of these hold (`fixtureRefusal()`):
  - `VERCEL_ENV` is not `production`.
  - `APP_ENV` is one of `development`, `test`, `preview` or `staging` (`FIXTURE_APP_ENVS`).
  - If `APP_ENV` is unset, `NODE_ENV` must be `development` (`next dev`) or `test` (Vitest). A production server (`next start`) with `APP_ENV` missing or mistyped is refused.
- When refused, every fixture constructor throws `Synthetic fixtures are disabled here (...)` through `assertFixtureEnvironment()`. An injected env object can add a refusal but never lift one: the real `process.env` wins.
- `APP_ENV=production` also makes the site indexable (`isIndexable()` in `src/components/public/seo.ts`, used by `robots.ts` and `sitemap.ts`). Every other value gives `noindex` and an empty sitemap.

### Environment variables the frontend reads

This list comes from a scan of `src`. The Supabase keys in `.env.example` are read by the backend, not by `src`.

| Variable | Read in | Meaning |
|---|---|---|
| `FRONTEND_ADAPTER` | `src/lib/api/mode.ts` | `fixture` or anything else (= `http`) |
| `APP_ENV` | `mode.ts`, `components/public/seo.ts`, `fixtures/operations/guard.ts` | Fixture allowlist (above); `production` = indexable |
| `VERCEL_ENV` | `mode.ts` | `production` always refuses fixtures |
| `NODE_ENV` | `mode.ts`, `modules/auth/session-cookie.ts` | Fixture rule when `APP_ENV` is unset; cookie `Secure` flag |
| `APP_ORIGIN` | `lib/api/http.ts` (`serverApiOrigin`), `modules/auth/server.ts`, `modules/auth/actions.ts` | Absolute origin for **server-side** calls to `/api/*`. It is never derived from request headers. `http:` or `https:` only |
| `FEATURE_CLINICAL`, `FEATURE_LIVE_PAYMENTS`, `FEATURE_EMERGENCY_DISPATCH`, `FEATURE_PHARMACY`, `FEATURE_SUBSCRIPTIONS`, `FEATURE_GPS`, `FEATURE_AUTOMATED_PAYOUTS` | `src/lib/feature-flags/index.ts` (`isEnabled`) | A flag is on **only** when the value is exactly `"true"`. Server-side only |
| `FIXTURE_PROVIDER_RESPONSE_MS` | `fixtures/marketplace/booking-store.ts`, `modules/service-requests/fixture-engine.ts` | How long synthetic providers wait before answering |
| `FIXTURE_BOOKING_SCENARIO` | `modules/patient-dashboard/session.ts` | Patient dashboard scenario (e.g. `accepted`) |
| `FIXTURE_FAMILY_SCENARIO`, `FIXTURE_SAVED_SCENARIO`, `FIXTURE_REVIEWS_SCENARIO`, `FIXTURE_NOTIFICATION_SCENARIO` | family-members, saved-providers and reviews modules, `app/[locale]/patient/notifications/api.ts` | `empty` starts that synthetic store empty |
| `FIXTURE_NOW` | `modules/admin/clock.ts` | Fixed clock for operations fixtures |

### Commands

```bash
npm ci
# Fixture mode, development server (synthetic data, clinical on):
FRONTEND_ADAPTER=fixture APP_ENV=development FEATURE_CLINICAL=true npx next dev -p 3000
# Fixture mode, production build (what the e2e suites use):
FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true FIXTURE_BOOKING_SCENARIO=accepted FIXTURE_PROVIDER_RESPONSE_MS=1500 \
  npx next build && npx next start -p 3320
# HTTP mode (real adapters; /api must be served by the same deployment, see section f):
FRONTEND_ADAPTER=http APP_ENV=development APP_ORIGIN=http://localhost:3000 npx next dev -p 3000
```

On Windows PowerShell, set each variable first (`$env:FRONTEND_ADAPTER='fixture'`), then run the command.

**Fixture sign-in.** Use `/en/login` with a synthetic `@example.invalid` account (list in `docs/frontend/QA_CHECKLIST.md` section 0, source `src/fixtures/identity/`). Any password of 1 to 128 characters works, and the phone OTP is `246810`. The old `FIXTURE_PATIENT_SESSION` and `FIXTURE_DOCTOR_SESSION` switches were removed at integration: sessions come from real sign-in, and `src/modules/auth/fixture-actors.ts` maps a synthetic identity to a fixture actor.

## (b) Module map and owners

The owner is the branch that wrote most of the module (taken from commit history at `2954551`). Hand work over through the lead, ticket by ticket (AGENTS.md).

| Area | Modules (`src/modules/*`) | Main routes (`src/app/[locale]/...`) | Owner branch |
|---|---|---|---|
| Foundation, shared UI, i18n, public site | (shared: `src/components/ui`, `components/shared`, `components/public`, `src/i18n`, `src/lib`) | `(public)/*` landing, about, FAQ, legal, `/emergency`, `/memberships`, sitemap, robots | `feat/fe2-a` |
| Identity | `auth`, `onboarding`, `organizations`, `verification` | `(auth)/login`, `signup`, `recover`, `/patient/onboarding`, provider `*/onboarding`, `/admin/providers`, `/admin/coverage`, `/account/*` | `feat/fe2-b` (later fixes on `feat/fe2-e`) |
| Marketplace and booking | `providers`, `catalog`, `bookings`, `patient`, `payments`, `support`, `service-requests`, `lab-orders`, `care-requests`, `ambulance-requests` | `/doctors`, `/doctors/[id]`, `/lab-tests`, `/lab-tests/[id]`, `/patient/book/**`, `/patient/{lab-tests,caretakers,ambulance}/**` | `feat/fe2-c` |
| Doctor and clinical | `doctor`, `clinical`, `records`, `consultation-notes`, `prescription-drafts`, `proof-of-visit`, `doctor-reviews`, `patient-dashboard`, `notifications` (shared with c) | `/doctor/**`, `/verify/**`, `/patient/dashboard`, `/patient/records/**`, `/patient/notifications` | `feat/fe2-d` |
| Operations | `lab`, `ambulance`, `caretaker`, `admin`, `content`, `audit` | `/lab/**`, `/ambulance/**`, `/caretaker/**`, `/admin/**` (except reviews), `/stories/**`, CMS | `feat/fe2-e` |
| Patient account | `family-members`, `saved-providers`, `reviews`, `reminder-prefs` | `/patient/{family,saved,reviews,settings/reminders,bookings}/**`, `/admin/reviews/**` | `feat/fe2-p` |
| Integration glue | `auth/fixture-actors.ts`, `tests/unit/integration/real-guards.test.ts` | — | `feat/fe2-integration` |

Every module follows the same pattern: `api.ts` (types of the API), `http.ts` (real adapter), `fixture.ts` (synthetic, refused in production) and `index.ts` (picks the adapter by `getAdapterMode()`). Results are `ApiResult` (`src/lib/api/result.ts`). A contract that doesn't exist yet returns the stable error `gated`, and the UI shows a "not connected yet" notice (`GateNotice reason="contract_pending"` or the module's own notice). Per-module notes for the operations modules are in `docs/frontend/modules/`.

## (c) Gated features and the contract each waits for

### Feature flags (`src/lib/feature-flags`, all off unless `"true"`)

| Flag | Used in (code) | Effect when off |
|---|---|---|
| `clinical` (`FEATURE_CLINICAL`) | 13 files, through `isEnabled("clinical")` and `modules/clinical/gate.ts` (`clinicalGate`, `gateMethods`, `gateAll`): consultation editor, consultation notes, prescription drafts, doctor records, doctor reviews, patient records, proof check `/verify`, lab report release | Gate notice; clinical APIs return `gated` |
| `livePayments` | `components/admin/admin-views.tsx`, `modules/admin/loaders.ts` | Refund approval and online payment stay disabled; the booking journey is pay-after-visit only |
| `emergencyDispatch` | `(public)/emergency/page.tsx`, `components/ambulance/ambulance-views.tsx`, `modules/ambulance/emergency.ts` | "Does not dispatch emergency help"; 112 is always shown. `ambulance.spec.ts` checks dispatch stays unavailable even with the flag on |
| `subscriptions` | `(public)/memberships/page.tsx` | "Nothing to buy here" |
| `automatedPayouts` | `components/doctor/static-page.tsx` | Payout notice on doctor static pages |
| `pharmacy`, `gps` | Defined, **not used anywhere** in `src` | — |
| Recurring care (hard-coded) | `modules/caretaker/rules.ts` `RECURRING_CARE_GATE = { enabled: false }` | Recurring plans show a gate notice. Not a flag (REQUESTS R-E03 asks for one) |

### HTTP adapters: what is wired and what is gated

The **Backend** column says whether the route exists on the backend `task/*` branches (I01, I02, C01, B01; PRs not merged).

| Module | Wired to (http) | Backend | Gated (returns `gated`) | Contract request |
|---|---|---|---|---|
| `auth` | `/api/auth/{signup,login,refresh,logout,me}` | I01 ✔ | `resendOtp` (phone OTP) | R-FE03-01..03, R-FE04-02 (refresh in RSC), R-FE06-01 (password recovery) |
| `onboarding` | `/api/auth/patient`, `/api/onboarding/patient`, `/api/providers`, `/api/providers/:id`, `/documents`, `/submit` | I02 ✔ (providers); **`/api/onboarding/patient` is not on any branch** | `getPatientDraft`, `savePatientSection` | R-FE03-07..10, R-FE06-03, R-FE06-08 |
| `organizations` | `/api/auth/invitations`, `/api/organizations/:id/members/accept` | I01 ✔ | — | R-FE05-03 (invite details) |
| `verification` | `/api/admin/providers/:id/review`, `/api/providers/:id`, `/documents/:id/signed-url` | I02 ✔ (signed URL returns 503 by design) | `listReviewQueue`, `listCoverage`, `decideCoverage` | R-FE03-12, R-FE03-13, R-FE04-05 (C01 has `/api/catalog/admin/coverage` but it is not in API_CONTRACTS) |
| `providers` (public catalog) | `GET /api/catalog`, `GET /api/catalog/:id` (category + PIN required) | C01 ✔ | sorts other than `price_asc` | FE07/08 reconciliation (REQUESTS 2026-11-18) |
| `providers/doctor-api` (doctor search) | — | — | `search`, `suggest`, `get` | R-C2-1 (no speciality, language, gender, slots, rating or text search fields in C01) |
| `bookings` | `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/:id`, `POST /api/bookings/:id/{accept,decline,cancel}` | B01 ✔ | `timeline`, `reschedule` | Timeline projection (REQUESTS FE07/08). **B01 has `POST /api/bookings/:id/reschedule`, but the adapter is still gated** |
| `bookings/slots` | — | B01 has `GET /api/availability` | `list` | Shape not verified against the wizard. Wire after checking |
| `patient` | — | B01 has `POST /api/patient/addresses` (no GET) | `getOverview`, `listMembers`, `listAddresses`, `addAddress`, `getOffer` | R-C2-2 (profile completion, family grants, addresses list, offer and policy reads) |
| `payments` | — | — | `getSummary`, `recordCollection` | Payment summary and collection DTOs (REQUESTS FE07/08; R-E16 outstanding amount) |
| `support` | — | — | `list`, `get`, `create` | R-FE01-4, FE07/08 |
| `lab-orders`, `care-requests`, `ambulance-requests` | — | — | All methods (`createGatedServiceRequestsApi`) | REQUESTS 2026-11-19 PHASE-R6-C (providers by category and PIN, open times, create, read and cancel with version) |
| `lab-orders/directory` (public lab directory) | — | — | `list`, `get` | REQUESTS 2026-11-19 R10-C (`GET /api/labs`, `/api/labs/:id`) |
| `doctor` | `POST /api/bookings/:id/{accept,decline,en-route,arrive,start}` | B01 ✔ | `listRequests`, `listVisits`, `getVisit`, `listAcceptResources`, `getArrivalChallenge`, `resendArrivalCode`, `verifyArrival` | REQUESTS FE10-12 items 6 and 7 (doctor DTOs, arrival challenge). B01 has only a POST for resources, no list |
| `clinical` | `POST /api/consultations/:id/draft`, `/finalize`, `GET /api/consultations/:id` | **Not on any backend branch** (proposed in API_CONTRACTS only) | `getDraft`, `amend`, `requestPdfLink` | FE10-12 items 8, 9, 11; R-FE-D-29, R-FE-D-30 |
| `records` | `GET /api/consultations/:id`, `POST /api/bookings/:id/collection`, `POST /api/bookings/:id/proof` | **Not on any backend branch** | 13 methods (health facts, photos, my records list, PDF link, proof verify and revoke, collection read) | FE10-12 item 10; R-FE-D-33 (public proof check) |
| `consultation-notes`, `prescription-drafts` | — | — | All | R-FE-D-37, R-FE-D-38 |
| `proof-of-visit` | — | — | `check` | R-FE-D-33 |
| `doctor-reviews` | — | — | `listMine` | R-FE-D-39, R-FE-Q-R9C5-1 |
| `notifications` | — | — | `list`, `listMine`, `markRead` | R-FE-D-34 (`GET /api/me/notifications`) |
| `family-members` | — | — | All | R-FE-P-R7-1 |
| `saved-providers` | — | — | All | R-FE-P-R7-2 |
| `reviews` | — | — | All (patient submit, edit, withdraw; admin queue, decide, log) | R-FE-P-R7-3, R-FE-P-R8-1 |
| `reminder-prefs` | — | — | `get`, `update` | R-FE-P-R7-4 |
| `lab`, `ambulance`, `caretaker` | — | — | All, except ambulance `getEmergencyGuidance` (static) | R-E07 (S01 proposes the `/api/bookings/:id/{lab,trip,care}/...` commands) |
| `admin` | `POST /api/admin/providers/:id/review` | I02/C01 ✔ | Review queue and detail, coverage, booking search and exceptions, admins, payments and refunds | R-E04 (capabilities), R-E07, R-FE07-02 (MFA and grants in the session) |
| `content` (CMS, stories, FAQ) | — | — | All; stories show "not available yet" (HTTP 200, noindex) | R-E10, R-E14 (story consent) |
| `audit` | — | — | `listEvents` | R-E07 (I01 `audit_events` has no organization column) |

## (d) Tests

All tests use synthetic data only. The last integration gate (`docs/frontend/INTEGRATION_REPORT.md`) was `vitest run` 107 files / 1492 tests passed, and the integration smoke passed 102, failed 0.

| Command | What it covers |
|---|---|
| `npm run lint` | ESLint over the repo |
| `npm run typecheck` | `next typegen && tsc --noEmit` (typegen is needed for the `PageProps`/`RouteContext` types) |
| `npm test` (`vitest run`, config `vitest.config.mts`) | Unit and static tests in `tests/unit/**`: adapters and schemas per module (`modules-identity`, `modules-marketplace`, `modules-clinical`, `modules-operations`, `modules-patient`, `modules-services`, and one folder each for consultation-notes, prescription-drafts, proof-of-visit, doctor-reviews and notifications), jsdom component tests (`ui-*.test.ts`), message catalogue parity (`messages.test.ts`), feature flags and fixture production guard, sitemap and route links, and the static guards: `site-guards` (no hard-coded English, storage, console or personal query keys, no float money, private pages noindex, robots), `adversarial-guards` (fixture imports gated, paise maths, Hindi zero plurals, cancellation terms), `peer-guards` (review status sets, doctor review projection, `/verify` redirect headers), `integration/real-guards.test.ts` (every private page and action uses the real guard) |
| `npx playwright test` (root `playwright.config.ts`) | Browser e2e at 390 and 1280 (`mobile-390`, `desktop-1280`; workspace specs run in the `ws-*` projects in order). Without `PLAYWRIGHT_BASE_URL` it builds and starts the app itself on `E2E_PORT` (default 3200). Most specs need a fixture server and skip otherwise |
| `npx playwright test --config tests/e2e/integration.config.ts` | `integration-smoke.spec.ts` only, against a running build on 3320. It covers every area page (render, no overflow, axe), the real guards (signed-out, wrong role, cross-area) and mutation flows: booking request, accept and cancel; doctor decline and accept; ambulance decide; CMS publish. Start a fresh server for each run because it changes server memory |

**Spec groups.** Spec files are in `tests/e2e/`. The mode each needs is in each file's `test.skip`.
- **Public:** `public`, `public-nav`, `doctor-search`, `lab-directory`, `emergency-e`.
- **Identity:** `auth`, `onboarding`, `profile`, `navigation`, `role-isolation`.
- **Booking:** `booking-journey` (the 22 steps), `service-requests`, `patient-bookings`.
- **Doctor:** `doctor-workspace`, `doctor-consultation`, `doctor-reviews`, `proof-check`, `hydration-race`.
- **Operations:** `lab`, `ambulance`, `caretaker`, `admin-ops`, `admin-verification`, `cms`.
- **Patient account:** `patient-family`, `patient-saved`, `patient-reviews`, `patient-review-changes`, `patient-reminders`, `admin-review-moderation`.
- **a11y sweeps:** `a11y`, `a11y-sweep`, `a11y-sweep-c`, `a11y-sweep-e`, `a11y-sweep-p`.
- **Performance:** `perf` (`E2E_PERF=1`, mobile only).

**Mode switches.** `E2E_CLINICAL=off` gives a second pass with a server started without `FEATURE_CLINICAL`. `E2E_FEP_MODE=session|guest` and `E2E_FEP_CLINICAL=on|off` are for fe-p's specs. The cases still marked `fixme` are listed in `docs/frontend/QA_CHECKLIST.md` section 8.3. The manual script for every role is `docs/frontend/QA_CHECKLIST.md`.

## (e) Open decisions and known gaps

**Decisions needed (product, lead or clinical):**
- **te/hi strings:** every namespace is machine-written and unreviewed (`src/messages/REVIEW_NEEDED.md`, `docs/frontend/REVIEW_NEEDED.md`, REQUESTS R-FE-D-36). Clinical wording needs a fluent reviewer and a clinician. Review safety, legal and money wording first.
- **Proof-of-visit QR:** no approved QR library or server-rendered QR (R-FE-D-33). The proof card shows the code only.
- **Reviews flag:** doctor reviews sit behind the `clinical` flag (R-FE-D-39). Choose a separate flag or keep `clinical` (open in `docs/frontend/RESUME_HERE.md`).
- **Family members:** a limit of 10 per account (`MAX_FAMILY_MEMBERS`), and guardian consent or invites for adult members (R-FE-P-R7-1).
- **Saved providers:** a cap of 50 (`MAX_SAVED_PROVIDERS`), and whether a save button belongs on the directory and profile pages (R-FE-P-R7-2).
- **Reviews:** the edit and withdraw window, the review window after completion, the contact and link filter rule (R-FE-P-R7-3), and whether moderation decisions also go to `/admin/audit` (R-FE-P-R8-1).
- **Reminders:** defaults (SMS on, quiet hours 21:00 to 07:00 IST), whether safety and booking messages bypass quiet hours, and the WhatsApp/SMS opt-in wording (TRAI/DLT) (R-FE-P-R7-4).
- **Story publishing consent rule** (R-E14).
- **Symptom to speciality hints** (`SYMPTOMS` in `src/modules/providers/doctor-search.ts`) need clinical review (R-C2-7).
- **Clinical policy values,** all unapproved and fixture-only: OTP validity, attempts and resends, proof lifetime, signed-link lifetime, photo size, vital warning thresholds and the minimum fields to finalise (REQUESTS FE10-12 item 11).
- **Cancellation policy:** no approved terms exist. Fixture pages use a labelled 2-hour sample, and http mode shows terms as unavailable and refuses to cancel.
- **Others:** map vendor (R-C2-5), minors and guardian flow (R-FE03-15), admin MFA (R-FE03-16), the legal business name (unconfirmed, AGENTS.md), and the overlap between fe2-d and fe2-p notifications and records code (R-FE-D-34; leftovers listed in `docs/frontend/RESUME_HERE.md`).

**Known gaps (code):** the open items from the `docs/frontend/ADVERSARIAL_REVIEW.md` verdict table, re-checked at `2954551`.
- Hindi zero plurals are still wrong in `ambulance.dashboard.daysLeft`, `lab.orders.testCount` and `common.errorSummary.title` (R-FE-Q-R9C3-1). `auth.otp.attemptsLeft` is fixed.
- Doctor reviews: the schema lacks `withdrawn` (D1), and doctors see the exact submission date on unpublished reviews (D2).
- Payment pages show "₹800" while other pages show "₹800.00" (finding 3).
- `service-requests/request-controls.tsx` still hard-codes an approved policy at integration. The fix is on `feat/fe2-c` `6bd8e66`, not merged yet.
- Free-text `q` in the doctor search URL is partly mapped to taxonomy keys on `feat/fe2-c` (finding 5).
- Finding 2 (fixture guard) is **fixed** at integration by the allowlist above.
- Platform: `server-only` is not installed (R-FE04-04); an expired session can't be refreshed during a Server Component render (R-FE04-02); there is no shared HTTP client or status kit (R-E01, R-E02).
- Fixture limits: one synthetic patient, so the booking fixture doesn't check per-patient ownership (`docs/frontend/BOOKING_JOURNEY.md`), and the booking timeline is fixture-only.

## (f) Connect-to-backend checklist

Do these in order. Tick each only with evidence: a test run, the actual response shape, or a reviewed diff.

1. **Agree the route set with the backend owner.** The http client only calls same-origin paths matching `/api/[a-zA-Z0-9/_-]+` (`src/lib/api/http.ts`; `redirect: "error"`, `credentials: "same-origin"`, `cache: "no-store"`, 15 s timeout, idempotency key header). The backend routes must therefore be served by the same Next.js deployment (one modular monolith per AGENTS.md), meaning the `task/*` backend branches are merged into the app. **Merging backend PRs #1 to #5 needs the user's explicit approval.**
2. **Set the environment:**
   - `FRONTEND_ADAPTER=http` (or leave it unset).
   - `APP_ENV` = the real environment name (`production` only for production).
   - `APP_ORIGIN` = the deployment origin, needed for every server-side `/api` call.
   - Feature flags left off.
   - Supabase keys only in `.env`, never in code; the service-role key stays server-side.
3. **Check the routes the frontend already calls** against the merged backend, one at a time, comparing each response with the Zod schema in the module's `http.ts` or `types.ts`:
   - Auth (I01).
   - Providers, onboarding and admin review (I02).
   - Catalog (C01; decimal-string paise converted to integer paise).
   - Bookings create, list, detail and decisions, with `expectedVersion` and `Idempotency-Key` (B01).
   - Doctor commands (B01).
   
   A schema mismatch must fail closed (`unavailable`), never render partial data. Record any change in `docs/frontend/REQUESTS.md` (append-only).
4. **Wire the backend routes that exist but are still gated in the frontend:**
   - `POST /api/bookings/:id/reschedule` → `bookings.reschedule`.
   - `GET /api/availability` → `bookings/slots`.
   - `POST /api/patient/addresses` → `patient.addAddress` (there is no list route yet).
   - `GET/POST /api/catalog/admin/coverage` → `verification.listCoverage`/`decideCoverage` once it is added to `API_CONTRACTS.md`.
   
   Add unit tests per adapter with recorded synthetic responses.
5. **Do not enable the clinical adapters until their routes exist.** `clinical` and `records` already call `/api/consultations/*`, `/api/bookings/:id/collection` and `/api/bookings/:id/proof`, which **no backend branch implements**. Keep `FEATURE_CLINICAL` off until those routes and the clinical governance gate (AGENTS.md) are approved.
6. **For everything else in the gated table (section c),** agree the contract from the REQUESTS entry, implement the backend route with RLS and server-side authorization, then replace the `fail("gated")` method and add tests. Keep `gated` for anything without an agreed contract.
7. **Authorization stays on the server.** Pages and actions already call `requireRole`/`authorizeRole` (real guard, `tests/unit/integration/real-guards.test.ts`). The backend must still check owner, role, active membership, verification and assignment on every sensitive mutation, and enforce booking price snapshots, versions and resource overlap in the database (AGENTS.md). The UI never sends price, role, status or paid state as truth.
8. **Run the gates:**
   - `npm run lint`, `npm run typecheck` and `npm test` (all guards included).
   - Playwright in fixture mode (regression), plus the http-mode checks:
     - Signed-out private URLs go to `/{locale}/login?next=...`.
     - Pages without a contract show their gate notice.
     - Wired pages show real data from a synthetic backend dataset.
   - Never use real patient data.
9. **Before production:**
   - `APP_ENV=production` (fixtures refused, site indexable) and `VERCEL_ENV=production`.
   - Every feature flag off unless approved.
   - te/hi review done for safety, legal and money strings.
   - The open MEDIUM items in section (e) fixed.
   - `docs/RELEASE_CHECKLIST.md` gone through with the owner.
