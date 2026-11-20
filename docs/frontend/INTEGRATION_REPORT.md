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
