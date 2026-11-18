# Handoff fe-d3 (t3k) - PHASE4-D3, worktree C:/Users/Yashwanth/fe2-d, branch feat/fe2-d

Task file: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE4-D3.md (+ PHASE4-common.md).

## DONE (committed before this session)
- 9b341f5 patient dashboard, XREVIEW-c + CodeRabbit fixes, hi clinical strings
- 0f4b8da doctor workspace, clinical draft/finalize flow, te/hi strings

## IN PROGRESS (this session, committed as the wip commit on top of 9b341f5)
- `npm run build` passes on 9b341f5 (verified 2026-11-19 00:13).
- `tests/e2e/doctor-workspace.spec.cts` renamed to `.ts`; every `test.fixme` flipped to `test`.
  Sign-in helper replaced by a server fixture: `page` -> assigned-doctor server; `as("other"|"anon"|"gateOff")`
  opens a page on the matching server. Signing test (DC07 sign -> read-only) moved to the end of the file
  because it makes the active consultation read-only. Added `expectNoAxeViolations` helper (not yet called).
- New `tests/e2e/workspace-servers.ts`: ports and server env per actor. Base port 3370 (E2E_WS_PORT).
  desktop: assigned 3370, other 3371, anon 3372, gateOff 3373. mobile: 3380-3383.
  All FRONTEND_ADAPTER=fixture, FIXTURE_BOOKING_SCENARIO=accepted; assigned/gateOff also FIXTURE_PATIENT_SESSION=self;
  gateOff has no FEATURE_CLINICAL.
- `playwright.config.ts` (shared file, edited on purpose): public projects ignore workspace specs; new projects
  `ws-desktop-1280` and `ws-mobile-390` (fullyParallel false) match `(doctor|patient)-workspace.spec.ts`;
  webServer is now an array (public build+start first, then 8 `next start` workspace servers with env).
- `.context/ws-serve.mjs`: local helper to start the 8 workspace servers (+ public on E2E_PORT) on the current build.

## NOT YET RUN
- The doctor e2e spec has NOT been executed yet. No pass/fail counts exist. Typecheck/lint not run after the edits.

## REMAINS
1. Run: build once, then
   `$env:E2E_PORT='3379'; node --experimental-strip-types .context/ws-serve.mjs` (background), then
   `$env:E2E_PORT='3379'; npx playwright test tests/e2e/doctor-workspace.spec.ts --project=ws-desktop-1280`
   (reuseExistingServer picks up the running servers). Fix real app failures, not the tests.
   Then `--project=ws-mobile-390`. Stop servers afterwards (kill the node processes on ports 3370-3383, 3379).
2. Create `tests/e2e/patient-workspace.spec.ts` (it does not exist; the task named it `.mjs`): dashboard, records,
   notifications, 390px + desktop, axe, no PHI in URL/storage.
3. Gaps vs docs/FRONTEND_MASTER.md sections 10-11:
   - Patient `/patient/records`, `/patient/records/[id]` (RecordsApi listMyRecords/getMyRecord/requestMyRecordPdfLink exist).
   - Patient `/patient/notifications`: no module/contract exists. Plan: notifications module with fixture adapter
     (synthetic, no PHI) and http adapter returning unavailable until a backend contract exists; log in docs/frontend/REQUESTS.md.
   - Dashboard "recent notifications" section; shared patient shell component (nav Home/Bookings/Records/Account).
     Do NOT create /patient/bookings* (fe-p) or /patient/profile, /patient/health-profile (fe-b).
   - Doctor availability page is a static notice. Plan: read-only schedule (upcoming visits grouped by IST day from
     listVisits) plus honest "weekly hours editing awaits backend contract" notice; REQUESTS entry.
4. te/hi strings for all new keys (placeholders OK, list in docs/frontend/REVIEW_NEEDED.md); axe clean; 390px/desktop.
5. lint, typecheck, `npm test`, build, e2e; update .context/activeContext.md; commit on feat/fe2-d with
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push.

## Known issues
- Patient and doctor workspace spec files may run in parallel workers against the same server; patient tests must
  tolerate doctor mutations (e.g. a new signed record after DC07).
- Patient dashboard page source shows a mojibake character between reference and price in BookingCard
  (`�`, likely a broken `·`); check the rendered page.
- Interim sessions are server env vars; replace with fe2-b requireRole once merged (REQUESTS #15, #26, R-FE-D-31).
