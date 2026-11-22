# Integration report: feat/fe2-integration (PHASE-INT2, updated for INT3)

Run by fe-int2 on 2026-11-19 in worktree `fe2-int`. Synthetic fixture adapter only (`FRONTEND_ADAPTER=fixture`, `APP_ENV=test`); no real data, no secrets. Nothing was pushed.

## 1. Merges

Each branch tip was merged with `git merge --no-ff`, followed by `next typegen`, `tsc --noEmit`, `npm run lint` and `vitest run`. All gates passed after every merge.

| Branch | Tip | Merge commit | Vitest after merge |
|---|---|---|---|
| feat/fe2-a | 3c72d13 | ef13b79 | 77 files / 1211 tests |
| feat/fe2-b | b841051 | 1e69436 | 77 / 1211 |
| feat/fe2-c | e4a2635 | 00559ba | 78 / 1227 |
| feat/fe2-d | 26b8b1e | 31be862 | 80 / 1238 |
| feat/fe2-e | 57a103a | 8e9e524 | 82 / 1249 |
| feat/fe2-p | 4aa02f8 | a2c19ed | 83 / 1268 |

`.context/activeContext.md` and `docs/frontend/REQUESTS.md` were resolved by keeping both sides (`.context/union-resolve.mjs`). Message JSON was deep-merged from the git stages (`.context/json-merge.mjs`).

### Code conflicts resolved

- **account-actions.tsx (fe-a):** kept integration's `locale` hidden field and server-action form method, and took fe-a's icon-only desktop sign-out button.
- **notifications module (fe-d):** fe-c and fe-d had each written their own `src/modules/notifications/{api,fixture,http}.ts`, and the two have incompatible APIs. fe-c's files stay in place, because fe-c's tests and fe-p use them. fe-d's files moved to `patient-{api,fixture,http}.ts` behind the `index.ts` barrel, and their factories were renamed `createPatientNotifications*`.
- **PatientShell (fe-d, fe-p):** uses fe-d's shell (records and notifications nav, unread count, client message provider) plus the health-profile nav item. `fixtureActor` is optional.
- **Patient dashboard (fe-d, fe-p):** keeps `requireRole("patient")` and the fe-b profile gate, and adopts PatientShell and the recent-notifications panel.
- **Public stories and FAQ (fe-e):** fe-a's pages were written against the `content-source.ts` seam. That seam now re-exports `@/modules/content/public`, and fe-e's `stories-source.ts` was dropped. fe-e's per-request reads were kept: the `/stories` list and the FAQ's published answers render inside Suspense after `connection()`, and the FAQ static shell shows the built-in answers.
- **Patient records and notifications (fe-d, fe-p):** both branches built these routes, so each route got one owner:
  - Records (list, detail, error, loading) come from **fe-p**. The record ID never goes into the login URL, the response schema is re-parsed, and `rate_limited` offers a retry.
  - Notifications come from **fe-d**. Its fixture store is patient-scoped and persistent, and it also feeds the shell's unread count.
  - Leaf conflicts in `patient.json` take fe-p's strings under `bookings`, `booking` and `records`, and fe-d's strings under `notifications`.

## 2. Real guards (commit 1ff7572)

| Area | Pages | Server actions / per-operation checks |
|---|---|---|
| Patient | `requirePatientSession` -> `requireRole("patient")`. Signed out goes to `login?next`, incomplete onboarding goes to onboarding, a wrong role goes to its own landing page, and an unusable workspace renders `<AccessDenied/>`. | `getPatientSession` -> `authorizeRole("patient")`, never redirects |
| Doctor | `guardDoctorPage` -> `requireDoctorSession` -> `requireRole("doctor")` | `getDoctorSession` -> `authorizeRole("doctor")`. In http mode the bearer token is read from the session cookie. |
| Lab, ambulance, caretaker, admin | `requireOperationsSession` (requireRole), already on fe-e | `authorizeOperationsSession` (authorizeRole), already on fe-e |
| Public header | `getPublicAccount` -> `getAccountSession()`, already on fe-a | n/a |

- Fixture identities are mapped to the synthetic clinical world in `src/modules/auth/fixture-actors.ts`. A new synthetic account, `doctor.other@example.invalid` (`doctor_other`), replaces `FIXTURE_DOCTOR_SESSION=other`.
- The `FIXTURE_PATIENT_SESSION` and `FIXTURE_DOCTOR_SESSION` server switches are gone from `src/`.
- Tests are in `tests/unit/integration/real-guards.test.ts` (12 cases). They cover:
  - identity-to-actor mapping;
  - redirect and denial semantics;
  - guard call arguments, including that record detail pages pass the list path;
  - the header mapping;
  - a static audit that every role page uses a real guard and that no interim switch remains.

## 3. Build

`npm run build` exited 0 and generated 446 pages (316 s on the final run).

## 4. Browser smoke (Playwright + axe, port 3320)

Server: `.context/int2-serve.ps1` runs `next start --port 3320` with `FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true FIXTURE_BOOKING_SCENARIO=accepted`.
Spec: `tests/e2e/integration-smoke.spec.ts`. Config: `tests/e2e/integration.config.ts`.

Every route is checked in each viewport:
- HTTP status is below 400.
- The page stays on the requested path, so the guard did not bounce it.
- `main` and a visible `h1` are present.
- No error-boundary text appears.
- Horizontal overflow is at most 1 px.
- axe reports zero WCAG 2.0/2.1 A and AA violations.

Users sign in through the fixture login form with synthetic accounts.

| Area | Routes | 390 px | 1280 px |
|---|---|---|---|
| Public (en, te, hi) | `/en`, `/te`, `/hi`, `/en/doctors`, `/en/how-it-works`, `/en/faq`, `/en/stories`, `/en/emergency`, `/en/login`, `/en/signup` | 10/10 | 10/10 |
| Patient (patient.complete) | dashboard, bookings, book, records, notifications, family, lab-tests, profile, te dashboard | 9/9 | 9/9 |
| Doctor (doctor.active) | dashboard, requests, visits, availability, profile | 5/5 | 5/5 |
| Lab (ops.lab.manager) | dashboard, orders, collections | 3/3 | 3/3 |
| Ambulance (ops.ambulance.operator) | dashboard, requests, fleet | 3/3 | 3/3 |
| Caretaker (ops.care.manager) | dashboard, requests, shifts | 3/3 | 3/3 |
| Admin (ops.admin.lead) | dashboard, providers, bookings, cms | 4/4 | 4/4 |
| Real-guard behaviour | signed-out -> login?next; record ID kept out of login URL; patient -> doctor area lands on patient dashboard; doctor -> lab area lands on doctor dashboard; header shows the account's dashboard link | 5/5 | 5/5 |

**Final run: 84 passed, 0 failed (12.2 min).**

The first run found three problems:
- **`/en/ambulance/fleet` overflowed by 23 px at 1280 px.** This was a real defect: the ops `LoaderState` grid and the `RecordList` table wrapper lacked `min-w-0`, so the table widened the page instead of scrolling inside its container. Two class additions in `src/components/admin/ops/{states,record-list}.tsx` fixed it.
- **`/en/lab-tests` returned 404.** This is a known gap (see below), and the route was removed from the smoke list.
- **The 390 px header-account check failed.** The account links sit in the mobile menu sheet, so this was a test issue; the spec now opens the menu first.

## 5. Known gaps and limitations (honest)

- ~~`/en/lab-tests` is not built.~~ Built by fe2-c (R10-C) and merged in INT3; now in the smoke (section 6).
- ~~The per-branch e2e specs were not run in this phase.~~ Moved to real fixture sign-in and run in INT3 (section 6). Original note: These are `booking-journey`, `patient-bookings`, `patient-records`, `patient-workspace`, `service-requests` and `doctor-workspace`, along with `workspace-servers.ts`. They still start servers with the removed `FIXTURE_PATIENT_SESSION` / `FIXTURE_DOCTOR_SESSION` switches. They now need to sign in with `patient.complete@`, `doctor.active@` or `doctor.other@example.invalid`. The owners should update them; the spec files were not changed here.
- ~~The smoke is read-only.~~ INT3 added mutation flows with axe while each dialog is open (section 6).
- **Unused code left from the route-owner choice:**
  - fe-p's `patient/notifications/{api,actions}.ts` and `components/patient/notifications-inbox.tsx`;
  - fe-d's `myRecordPdfLinkAction` in `patient/actions.ts`.
  These are not bundled because nothing imports them. They can be deleted once both owners agree.
- **Patients in fixture mode:** every allowed patient maps to the single synthetic patient world (REQUESTS R-FE-D-26), so there is no fixture account for testing cross-patient isolation.
- **The landing-page stories block is prerendered at build time.** The `/stories` and FAQ published content are read per request.
- **te/hi strings remain machine-written** and need fluent review (`docs/frontend/REVIEW_NEEDED.md`).

## 6. INT3 (2026-11-20)

### 6.1 Re-merge of the latest local heads

| Branch | Tip | Merge commit | Conflicts and how they were resolved |
|---|---|---|---|
| feat/fe2-a | 3c72d13 | (already merged, ef13b79) | none |
| feat/fe2-c (first pass) | ebe3000 | 86da407 | guard codemod for new patient pages in 0e4ced8 |
| feat/fe2-d (first pass) | 9511e32 | 7ca3577 | none |
| feat/fe2-e (first pass) | 0813f7b | 82b454c | conflict markers left in `.context/activeContext.md`, cleaned in 23b0973 |
| feat/fe2-p (first pass) | 8f7ca31 | 23b0973 | guard codemod for reviews/saved/reminders in 02dc8bf |
| feat/fe2-b | 5ee66b5 | 1fa0ee1 | `.context` only (kept integration's) |
| feat/fe2-c | 5b92202 | 55bbf1c | `doctors/[id]/loading.tsx` keeps integration `PublicRouteLoading`; `public-header.tsx` takes fe2-c `xl:mr-2` (Telugu header overflow at 1280 px); `REQUESTS.md` keeps both |
| feat/fe2-d | f36ff67 | 9975081 | `playwright.config.ts` WORKSPACE_SPECS takes fe2-d's list (adds `hydration-race`, `a11y-sweep`); `REQUESTS.md` keeps both |
| feat/fe2-e | c99a4c7 | ed5e701 | stories list/detail keep fe2-a's `content-source` pages and add fe2-e's gated state (`gatedTitle` empty state, `StoriesUnavailable`, HTTP 200); `stories-source.ts` stays deleted and `stories-gated.test.ts` now tests `content-source`; 404 numeral takes fe2-e `text-muted` (contrast) |
| feat/fe2-p | 149a74b | cebd96c | see below |

fe2-p merge (cebd96c) details:
- `src/modules/admin/session.ts` keeps the integration real guards. fe-p's `FIXTURE_ADMIN_SESSION=moderator` server switch is dropped, because `tests/unit/integration/real-guards.test.ts` forbids `getOperationsSession` in `src`.
- `admin/reviews/actions.ts` now calls `authorizeOperationsSession("admin")` and still checks `review:moderate`. The synthetic admin lead (`fx-adm-super`, `ops.admin.lead@example.invalid`) holds `review:moderate`; no other fixture admin does. Capability labels were added in en/te/hi.
- Patient reviews: fe-p's edit/withdraw is merged onto the real patient guard. The new `reviews/[bookingId]/edit` page uses `requirePatientSession` + `AccessDenied`.
- Test updates after the merge: `a11y-static` counts the fe2-c lab directory h1 components; `invariants-c` scans code (not comments) for browser storage and accepts `requirePatientSession` on pages; `caretaker-admin-branches` expects 11 admin lead capabilities.
- `eslint.config.mjs` ignores `.context/**` (fe2-c committed `.cjs` audit helpers there).

All six branch heads are ancestors of HEAD (`git merge-base --is-ancestor`).

Gate after the last merge and the INT3 fixes: `tsc --noEmit` exit 0, `npm run lint` exit 0, `vitest run` **102 files / 1437 tests passed**.

### 6.2 Build

`FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true FIXTURE_BOOKING_SCENARIO=accepted npm run build` exited 0 and generated **525 pages**.

### 6.3 Integration smoke on the new build

`tests/e2e/integration-smoke.spec.ts` against a fresh `next start` on :3320 (`.context/int2-serve.ps1`, default `FIXTURE_PROVIDER_RESPONSE_MS` of 3 s).

New read-only routes: `/en/lab-tests`, `/en/patient/reviews`, `/en/doctor/reviews`, `/en/admin/reviews`.

New mutation flows. axe (WCAG 2.0/2.1 A and AA) runs while each dialog is open:

| Flow | Account | What is checked |
|---|---|---|
| Booking request + cancel | patient.complete | 7-step wizard to Synthetic doctor 1, axe on the review step. Sends the request, retrying on a taken slot. The booking id is in the path and the note is not in the URL. The synthetic doctor accepts and an `SCV-` reference appears. Cancel dialog: confirm stays disabled until a reason is chosen and the terms are acknowledged, axe runs with the dialog open, then the request is cancelled and axe runs again. |
| Provider accept/decline (doctor) | multi.role (assigned clinical-world doctor) | Decline dialog: submitting with no reason shows the error, axe runs with the dialog open, Escape closes it. Accept dialog: axe runs, the request is accepted and the page moves to `/doctor/visits/<id>`. There is only one pending synthetic request, so whichever project gets there second checks that it can no longer be answered. |
| Provider decline/accept (ambulance) | ops.ambulance.operator | 390 px declines the stale-quote request: the reason-required error shows, axe runs with the dialog open, then a reason is chosen and the "Declined" toast appears. 1280 px accepts the fresh request: axe runs on the vehicle/driver dialog, then "Accepted. The trip has been scheduled." appears. axe runs on the list afterwards. |
| CMS publish | ops.admin.lead | New FAQ (one slug per project): save draft, send to preview, open the publish dialog, run axe, publish. The revision history shows "published", and `/en/faq` shows the question with the safe Markdown `<strong>`. |

**Result: 100 passed, 0 failed (3.9 min), mobile-390 + desktop-1280.**

The first run had 4 failures, now fixed:
- **`/en/lab-tests`, axe `label-content-name-mismatch` (serious, 3 nodes) at both widths.** This was a real defect: the "View lab" card links had `aria-label="View Synthetic lab N"`, which does not contain the visible text (WCAG 2.5.3). Fix in `src/components/directory/lab-directory.tsx`: the visible "View lab" text plus a screen-reader-only `: {lab name}`. The now-unused `viewLabFor` key was removed (en/te/hi). This is an fe2-c file, so fe-q should port the fix back.
- **CMS publish, at both widths.** This was a test issue: FAQ answers sit in a closed `<details>`, so the spec now opens the question before checking the `<strong>`.

### 6.4 Per-branch e2e specs on real fixture sign-in (INT3 WIP 47b6574, build before the latest re-merge)

`tests/e2e/support/fixture-session.ts` and `workspace-servers.ts` replace the removed `FIXTURE_PATIENT_SESSION` / `FIXTURE_DOCTOR_SESSION` switches. Results at 390/1280:
- patient-bookings 10/10
- patient-records: 6 passed, 3 fixme (fe-p notifications page not served)
- booking-journey 5/5
- service-requests 13/13
- patient-workspace: 18 passed, 4 fixme/skip
- doctor-workspace: 32 passed, 1 skip
- doctor-consultation: 17 passed, 2 skip
- proof-check: 9 passed, 1 skip

**These specs were not rerun after the 2026-11-20 re-merge.**

### 6.5 Open items from INT3

- `tests/e2e/admin-review-moderation.spec.ts` (fe-p) still expects the dropped `FIXTURE_ADMIN_SESSION=moderator` server mode. It is skipped outside fe-p's own run mode, and fe-p should port it to the `ops.admin.lead` sign-in.
- New fe2-d specs `hydration-race` and `a11y-sweep`, and fe2-c's `a11y-sweep-c`, were merged but not run here.
- The mutation smoke changes server memory (doctor request, ambulance requests, CMS entries). Start a fresh server for every full smoke run.
- Commit message 86da407 wrongly says tsc was clean (fixed by 0e4ced8). Commit 82b454c contains conflict markers in `.context/activeContext.md` (cleaned in 23b0973). History was not rewritten.

### 6.6 Second re-merge (heads that moved during INT3) and the fe2-d fixture allowlist

The feature branches moved on while INT3 ran, so they were merged again:

| Branch | Tip | Merge commit | Notes |
|---|---|---|---|
| feat/fe2-c | 1a0db4f | b2fa938 | R9-C2..C5 adversarial review docs and guard tests; REQUESTS.md kept both |
| feat/fe2-d | 7c0065d | 27ed491 | `/lab-tests` in the sitemap; consultation editor a11y fixes |
| feat/fe2-e | 87bfb6b | 4484cf2 | Ops shell sign-out merged. `auth-flow.tsx` and the auth/navigation/onboarding/profile e2e specs keep the integration versions, because fe2-e's R9-E2 spec edits skip routes "not built on this branch" and all of those exist here. fe-b should re-check its sign-out-visibility assertions against the integrated app. |
| feat/fe2-p | 8dc301a | ab6bedb | Read-only moderation decision log (`/admin/reviews/log`, behind AdminRouteGate) |
| feat/fe2-d | 952c069 | 3e482d5 | Fixture allowlist guard (R-FE-D-42) |

Fixes on the integrated tree:
- **0aac1c5:** fe-q's new `adversarial-guards.test.ts` found 3 issues, now fixed:
  - `fixtureActorFor` now returns null outside fixture mode.
  - The patient dashboard no longer imports `DEFAULT_PATIENT_ACTOR`.
  - The Hindi `auth.otp.attemptsLeft` `one` branch now uses `#`, because Hindi `one` also covers 0.
- **3e482d5 and 8737d81 (fixture allowlist):**
  - `src/modules/auth/fixture-guard.ts` `assertFixtureAllowed` now calls the shared `assertFixtureEnvironment` from `src/lib/api/mode.ts`. The rule: APP_ENV development/test/preview/staging, or unset under next dev/vitest; `VERCEL_ENV=production` always refuses.
  - The patient dashboard uses `requirePatientSession` and takes `synthetic`/`fixtureActor` from it.
  - `fixture-production-guard.test.ts` was adapted to the integration APIs. It also asserts the auth fixture guard, and `wsEnv` is now clinical/gateOff.
  - Older "not allowed" message assertions also accept the new "fixtures are disabled" refusal.
  - `.context/int2-serve.ps1`, `.context/int3-run.ps1`, `workspace-servers.ts` (`wsEnv`) and the `integration.config.ts` start command already set `APP_ENV=test`.

Final gate on 8737d81:
- `tsc --noEmit` exit 0
- `npm run lint` exit 0
- `vitest run` **107 files / 1492 tests passed**
- `npm run build` exit 0, **529 pages**
- Integration smoke on a fresh :3320 server: **102 passed, 0 failed** (mobile-390 + desktop-1280). This adds `/en/admin/reviews/log`. The run took 18.4 min because the machine was loaded by other agents' servers.

The per-branch e2e specs in 6.4 and the new fe2-c/d/e specs were not rerun on this head.

### 6.7 INT4 (2026-11-20): merge of the newest heads, full rerun

**Merges.** Conflicts were resolved toward the owner's version. REQUESTS.md kept both sides; `.context` kept integration's.

| Branch | Tip | Merge commit | Conflicts |
|---|---|---|---|
| feat/fe2-c | 7e41856 | 9208e6a | `.context` only |
| feat/fe2-d | 0e09eef | 39ec1a4 | `phone-input.tsx` (shared control; both sides are fe-a's): integration's +91 `aria-describedby` and fe2-d's pre-hydration early-input ref (R-FE-D-41) are combined |
| feat/fe2-e | 0816fb5 | 000ac5e | docs only |
| feat/fe2-p | f977bc0 | 2954551 | `admin-frame.tsx` `AdminRouteGate`: fe-p's `adminPagePath(locale, route, subPath)` is passed into integration's real-guard `adminPrincipal(path)` |
| feat/fe2-p | b796bb2 | 109d01d | docs only |
| feat/fe2-e | 6cec6a0 | fec9da1 | `auth-flow.tsx` and `hi/auth.json` take fe-b's side (signup role radios disabled until hydrated; Hindi `=0` case) |

Branch heads that moved after these merges and are **not** in this run: c bdf0c54, d ff54236, e 8e3ccf6, p 7f9fd28.

**Gate on fec9da1:**
- `tsc --noEmit` exit 0.
- `npm run lint` exit 0.
- `vitest run`: **112 files (110 passed, 2 failed), 1545 tests (1540 passed, 5 failed)**.
- `tests/unit/peer-guards.test.ts`: **4/4 ran and passed, 0 skipped**. Its three `describe.skipIf` blocks (review statuses, doctor review projection, proof-code redirects) now find their files.
- `npm run build` exit 0, **529 pages**.

**The 5 unit failures are owner items.** They were not edited here.
- **Owner: fe-p.** `tests/unit/modules-operations/admin-return-path.test.ts` (1 test) and `tests/unit/modules-operations/provider-route-gates.test.ts` (4 tests). Both scan pages statically for `<AdminRouteGate>`, `<LabRouteGate>`, `<AmbulanceRouteGate>`, `<CaretakerRouteGate>` or `guardDoctorPage(...)`. The pages they flag are gated by fe-b's real guard `requireRole(<role>, { locale, path })`, which these scans do not recognize:
  - `admin/coverage/page.tsx`
  - `{lab,ambulance,caretaker,doctor}/onboarding/page.tsx`
- **Suggested fix (fe-p):** accept `requireRole(` with an own-path `path:` as a page gate. These are false positives on the integrated tree, not unguarded pages.

**Browser runs.** Each spec ran on a fresh `next start` on :3320 per viewport project, with `APP_ENV=test` and the fixture adapter. axe ran wherever the specs run it.

| Spec | 390 px | 1280 px | Notes |
|---|---|---|---|
| integration-smoke | 102 passed in total across both viewports (4.1 min) | (included) | 0 failed |
| a11y-sweep (fe2-d, ws projects) | 78/78 | 78/78 | |
| hydration-race-e (fe2-e) | 3/3 | 3/3 | |
| hydration-race (fe2-d, ws projects) | 2 passed, 3 failed | 2 passed, 3 failed | Owner: fe-a/fe2-d. The spec uses plain `test` without sign-in (written for fe2-d's per-actor `FIXTURE_DOCTOR_SESSION` servers). On integration the doctor pages (collection form, consultation notes, prescription draft) go to login, so the controls are not found. Needs `wsTest` / `storageFor(multi.role)`. |
| a11y-sweep-c (fe2-c) | 20 passed, 22 failed | 20 passed, 22 failed | Owner: fe-q. Every failure is a patient route (book, lab, care, ambulance, te/hi lists, status pages, form errors). The spec has no sign-in (it relied on `FIXTURE_PATIENT_SESSION`), so it lands on login. The public routes pass. Needs `patientTest` from `support/fixture-session.ts`. |
| onboarding (fe-b) | 6 passed, 1 failed, 2 skipped, 7 did not run (serial) | same | See the notes below this table. |
| admin-verification (fe-b) | 1 failed, 9 did not run (serial) | same | Signed in as verifier@, the first test fails axe `landmark-main-is-top-level` on `/en/admin/providers`, for the same reason as onboarding. The other 9 tests did not run because the describe is serial. |

Onboarding notes:
- **Failure (owner: fe-b), a real defect:** axe reports `landmark-main-is-top-level` on `/en/doctor/onboarding`. `OnboardingLayout` → `AccountFrame` renders a second `<main id="main-content">` inside the role shell's `<main id="main-content">`, so there is a nested main landmark and a duplicate id. This is the known R-FE07-04 item ("AccountFrame should drop under role shells").
- **Skipped (2 per viewport):** two `test.fixme` whose reasons are out of date on integration. "ordinary booking is blocked until the questionnaire is complete (booking page is fe-c)" and "pending review: setup dashboard and operational pages redirect (lab pages are fe-e)" both now have their pages, so fe-b can try enabling them.
- **Did not run (7 per viewport):** the describe is serial, so the tests after the failure did not run.

Not rerun in INT4: the per-branch specs from 6.4, `a11y-sweep-p`, and `admin-review-moderation`. The last one still expects fe-p's dropped `FIXTURE_ADMIN_SESSION` mode.

### 6.8 INT6 (2026-11-20, lead): fe-d R9-D9 and fe-p R9-P5/P6 merged

Merged into `feat/fe2-integration`: fe2-c cbd9b5f (R9-C14), fe2-d 2562920 (R9-D9), fe2-p f7a860c (R9-P6). The Kiro monthly limit was hit on all five agent windows, so the lead resolved the conflicts and fixed the cross-branch guards directly.

Conflicts and decisions:
- `src/components/public/finder.ts`: kept both `doctorSearchHref` (integration) and `finderRedirectPath` (fe-d).
- `src/app/[locale]/(public)/find/route.ts`: the doctor-search branch plus fe-d's relative `Location` 303 with `Cache-Control: no-store` (never uses the Host header).
- `patient/notifications/page.tsx`: kept the integration page (`guardPatientPage`, `getNotificationsApi`). fe-p's `_components/notifications-body` and its `inbox-states` tests are merged but the page does not use the body yet (overlap 4aa02f8, open decision R-INT6-01).
- `patient/settings/reminders/page.tsx`: fe-p's `ReminderBody` with the integration `requirePatientSession` + `AccessDenied`.

Guard tests reconciled with integrated pages (no weakening of what they protect):
- `seo-guard`: `privateMetadata()` counts as noindex; `/doctors` and `/lab-tests` own their metadata through `pageMetadata()`.
- `provider-route-gates`: the onboarding wizard is sign-in-only and intentionally not role-gated; dynamic guard-path segments compare by position.
- `admin-return-path`: pages that call `requireRole("admin", ...)` inline (coverage, providers) count as gated.
- `a11y-static`: finder labels gained `offline` and `invalidLink`.
- Real fix: the signup role group in `auth-flow.tsx` now renders `HydrationStatus` + `hydrationBusy` (it had `aria-busy` with no status text).

Results at 009d4b7: tsc 0 errors, eslint 0, vitest 125 files / 1815 tests passed, `next build` exit 0 (`FRONTEND_ADAPTER=fixture APP_ENV=test`). Smoke: see 6.9.

### 6.9 Final smoke, 2026-11-22 (lead, Claude only)

Build `verify11` (529 pages), fresh server per spec on :3320, fixture adapter.

- desktop-1280: onboarding 16, lab 9 (+1 skipped), caretaker 8, ambulance 9, keyboard-lists 4, public-a11y 74 (+3 skipped), a11y 19, a11y-sweep-e 14, a11y-sweep 78 passed. `a11y-sweep-c`: 22 failed, 20 passed (the spec signed in with the wrong fixture session; spec fixed to use `patientTest`, not rerun). `a11y-sweep-p` skipped (needs `E2E_FEP_MODE=session`).
- mobile-390 (Pixel 5 emulation): passed onboarding 16, lab 9, caretaker 8, ambulance 9, admin-ops 9, auth 28, cms 6, doctor-consultation 17, doctor-search 5, doctor-workspace 32, emergency-e 3, hydration-race 5 and -e 3, navigation 4, patient-workspace 18, profile 6, proof-check 9, public 52, public-nav 6, role-isolation 9, service-requests 13, booking-journey 5, patient-bookings 10, patient-records 6 (+clinical-off 2). Skipped for lack of session mode: patient-family, patient-reminders, patient-review-changes, patient-reviews, patient-saved.
- mobile failures found and fixed (reruns pending):
  1. `admin-verification` "Start review": the fixed mobile bottom bar covered the button near the screen edge and Playwright's scroll-if-needed did not move it. Root cause confirmed with an `elementFromPoint` probe (layout viewport 873 px, visible 844 px, button centre under the bar). Fix: `scroll-padding-bottom` while `[data-app-bottom-nav]` is present (WCAG 2.4.11 Focus Not Obscured).
  2. `lab-directory` and `public-directory-smoke`: stale spec link name; the accessible name is "View lab: Synthetic lab N" since 72d42cd (WCAG 2.5.3). Specs updated.
- New this session: `/ambulances`, `/ambulances/[id]`, `/caretakers`, `/caretakers/[id]` (en/te/hi), build after them: exit 0, 551 pages. Their unit test passes (30/30 with seo-guard, route-links, time-guard); their e2e spec `public-service-directories` has NOT been run.
- Still to run on the next session: items 2 to 8 of the list in `RESUME_HERE.md`.

### 6.10 Frontend verification complete, 2026-11-22 (lead, Claude only)

Build `verify11` plus the `aria-label` fixes on the public provider and lab cards (rebuilt, exit 0). Fresh fixture server per spec and per project on :3320.

- **Finding:** `FIXTURE_PATIENT_SESSION` was removed at integration (real fe-b sign-in). `a11y-sweep-p`, `patient-family`, `patient-saved`, `patient-reviews` and `patient-review-changes` still relied on it and had been running signed out (a login page also passes axe, so the old "passes" proved nothing). All five now use `patientTest` from `tests/e2e/support/fixture-session.ts`; `patient-reminders` already did.
- **Real a11y fix:** public provider and lab card links now carry `aria-label="<visible text>: <name>"`, so the accessible name starts with the visible text (WCAG 2.5.3). An `sr-only` span in an inline-flex link made Chrome insert a space before the colon.
- **Spec fixes:** `public-service-directories` (visible-only locators), `lab-directory` (a signed-out visitor is redirected to `/en/login?next=%2Fen%2Fpatient%2Flab-tests`; the guard keeps the area, not the query), `admin-verification` (landing can bounce dashboard to onboarding; the spec waits for the path to settle).
- **Results, both projects (desktop-1280 and mobile-390):** public-service-directories 14/14, lab-directory 3/3, admin-verification 10/10, public-directory-smoke 2/2, a11y-sweep-c 42/42, a11y-sweep-p 23/23 (clinical on and off), patient-family 6 (+1 off, guest 1), patient-reminders 7, patient-reviews 4 (+1 off, guest 1), patient-review-changes 4, patient-saved 4 (+1 off, guest 1). No failures.
- **Unit and static:** vitest 131 files, 1980 tests passed; `tsc --noEmit` exit 0 after `next typegen`; eslint clean on changed paths.
- **UX note (not fixed, product call):** the signed-out patient guard redirects to `/login?next=<area path>` and drops the query string, so a visitor who clicks "Request a visit" with a `providerId` loses the selection after signing in.
- **Pipeline lessons:** one project per `int3-run.ps1` call; session specs no longer need server env switches; kill servers by PID; `grep --line-buffered` when logging.
- **CodeRabbit:** 5 minor findings on the full diff (scripts exit status, config env doc, focus-ring check, copy-isolation unit test, time-guard formatter args), all fixed and rechecked.
