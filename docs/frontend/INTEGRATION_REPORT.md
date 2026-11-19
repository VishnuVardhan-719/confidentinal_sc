# Integration report: feat/fe2-integration (PHASE-INT2)

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

- **`/en/lab-tests` (public lab directory) is not built.** It is pending on fe2-c and allow-listed in `route-links.test.ts`, so any public link to it is a 404.
- **The per-branch e2e specs were not run in this phase.** These are `booking-journey`, `patient-bookings`, `patient-records`, `patient-workspace`, `service-requests` and `doctor-workspace`, along with `workspace-servers.ts`. They still start servers with the removed `FIXTURE_PATIENT_SESSION` / `FIXTURE_DOCTOR_SESSION` switches. They now need to sign in with `patient.complete@`, `doctor.active@` or `doctor.other@example.invalid`. The owners should update them; the spec files were not changed here.
- **The smoke is read-only.** It covers no mutation flows (booking, accept/decline, cancel, CMS publish). axe ran on the initial page state only, with no dialogs open.
- **Unused code left from the route-owner choice:**
  - fe-p's `patient/notifications/{api,actions}.ts` and `components/patient/notifications-inbox.tsx`;
  - fe-d's `myRecordPdfLinkAction` in `patient/actions.ts`.
  These are not bundled because nothing imports them. They can be deleted once both owners agree.
- **Patients in fixture mode:** every allowed patient maps to the single synthetic patient world (REQUESTS R-FE-D-26), so there is no fixture account for testing cross-patient isolation.
- **The landing-page stories block is prerendered at build time.** The `/stories` and FAQ published content are read per request.
- **te/hi strings remain machine-written** and need fluent review (`docs/frontend/REVIEW_NEEDED.md`).
