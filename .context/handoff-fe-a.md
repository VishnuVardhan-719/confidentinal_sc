# Handoff fe-a (Kiro A) — shutdown checkpoint

## DONE (feat/fe2-a, all committed, never pushed)
- 857b005 UI foundation (i18n en/te/hi, tokens, ui + shared components) and public pages
- 8decfb4 account-aware header, landing doctor search, role nav, CSP, perf/a11y specs
- a77802e CodeRabbit minors on 8decfb4
- a382cf4 PHASE3-A route-link + static a11y unit tests, mobile-first hero/search/footer polish
- 9027669 compact header at xl for te/hi (no overflow); browser e2e un-deferred and passing:
  public + public-nav 115 passed / 1 skipped, a11y 16 passed / 16 skipped (desktop-only by design),
  perf (E2E_PERF=1, mobile-390) 4 passed. Unit: 10 files green. tsc + lint clean. Build 71/71.

## IN PROGRESS
- PHASE4-D3 (worktree C:/Users/Yashwanth/fe2-d, branch feat/fe2-d, HEAD d0dd130). Only started:
  read the brief + .context/handoff-t3k.md, ran typecheck (clean) and lint. No files changed in fe2-d.

## REMAINING (PHASE4-D3)
1. Fix lint in fe2-d `tests/e2e/doctor-workspace.spec.ts`: lines 22 and 25 call Playwright fixture `use`
   inside functions named `baseURL`/`as`, which trips react-hooks/rules-of-hooks (2 errors); rename the
   fixture parameter (e.g. `provide`) or disable that rule for tests/e2e in eslint config. Line 34
   `expectNoAxeViolations` unused: call it in the page tests.
2. Then follow fe2-d/.context/handoff-t3k.md "REMAINS": build, start workspace servers
   (`$env:E2E_PORT='3379'; node --experimental-strip-types .context/ws-serve.mjs`, ports 3370-3383),
   run `npx playwright test tests/e2e/doctor-workspace.spec.ts --project=ws-desktop-1280 --workers=1`,
   then ws-mobile-390; create patient-workspace.spec.ts; patient records/notifications pages; doctor
   availability schedule; te/hi strings; commit on feat/fe2-d.

## Commands / ports
- fe2-a: `npm run build` then `npx next start -p 3330`; `PLAYWRIGHT_BASE_URL=http://localhost:3330 npx playwright test --workers=1`.
  Perf only with `E2E_PERF=1 --project=mobile-390`. Stop only the `next start -p 3330` process afterwards.
- fe2-d: ports 3370-3383 (+3379 public) per handoff-t3k.md.
- Message merge helper used for en/te/hi patches: %TEMP%/scv-shots/merge.cjs (not in repo).

## Known issues / open requests
- docs/frontend/REQUESTS.md R-FE01-6..14: auth session seam (fe-b), suggest endpoint + Telugu/Hindi
  \p{M} bug in fe2-c doctor-search schema, runtime 404 error shell without JS (global-not-found decision),
  stories/[slug] loading.tsx + h1 in "unavailable" branch (src/app, lead), 73 pending routes owned by
  other branches (tests/unit/route-links.test.ts PENDING map).
- When restarting `next start` after a rebuild, make sure the old process on the port is gone
  (a stale server serves 500s for new chunk names).
# Handoff fe-a - PHASE4-D3 on worktree C:/Users/Yashwanth/fe2-d (branch feat/fe2-d)

## DONE (all committed on feat/fe2-d, never pushed)
- 30ab629 wip checkpoint; 68bfa44 doctor e2e green; 26b8b1e patient records/notifications + schedule; 638c0e5 patient e2e + REQUESTS 33-36; final commit = this handoff + DC02 timeout.
- Lint fixed in tests/e2e/doctor-workspace.spec.ts (fixture param `use` -> `provide`; axe helper now called).
- Doctor e2e run in Chromium and fixed. App fixes (real failures):
  - Vitals: leaving the step with a half-entered reading (temperature without unit, one BP side) silently dropped it. Now blocked with an alert linking to the field (`clinical.vitals.incompleteTitle`).
  - Sign with missing details now moves focus to the "Complete these before signing" summary.
  - Visit page: separate payment badge ("Payment: Due") next to booking/visit badges; collection result is a `role=status` "Collection recorded: ...".
  - DC03: new `FreshnessStatus` (always "Last updated", explicit offline notice, refetch on reconnect; no fake "live").
  - Arrival code lock no longer shows "Too many attempts" twice.
  - Copy: not-found states start with "Not found."; clinical gate reads "Clinical features are not enabled yet"; gate title grammar ("Clinical record keeping is not available yet").
  - Shared `Field` (src/components/shared/field.tsx, fe-a's component, edited here): space before "(optional)" so accessible names read "Temperature (optional)". Same fix is worth porting to feat/fe2-a.
- Spec fixes where the spec was wrong, not the app: step rail uses buttons, confirm buttons repeat the verb ("Decline request", "Remove medicines"), facts need the evidence attestation checkbox, conflict is an inline alert, prescribing needs "Prescribe medicines" first, `page.clock.install()` for PDF expiry, locators scoped to `main`/regions (Next streaming briefly duplicates nodes; the app offline banner is also a status), QR not faked (R-FE-D-33).
- New: `/patient/records`, `/patient/records/[id]` (signed only, PDF of signed version), `/patient/notifications` (mark all read), `src/modules/notifications` (fixture + http "gated"), `src/components/patient/{patient-shell,guard,notification-list,mark-read-button}`, dashboard recent notifications + records quick action, `/doctor/availability` read-only 7-day IST schedule (`src/modules/doctor/schedule.ts`). te/hi for all new keys (parity script: 0 missing).
- New tests: tests/e2e/patient-workspace.spec.ts, tests/unit/notifications/notifications.test.ts (8), tests/unit/modules-clinical/schedule.test.ts (3).

## Evidence
- `npx playwright test tests/e2e/patient-workspace.spec.ts tests/e2e/doctor-workspace.spec.ts --project=ws-desktop-1280 --project=ws-mobile-390 --workers=2` -> 110 passed (5.8m).
- eslint . exit 0; tsc --noEmit exit 0; vitest 22 files / 374 tests passed; `npm run build` passes.

## OPEN / for the lead
- **Overlap:** feat/fe2-p 4aa02f8 also built `/patient/records*`, `/patient/notifications`, `src/modules/notifications` and `src/components/patient/patient-shell.tsx` with a different API. Integration will conflict; pick one (REQUESTS R-FE-D-34).
- No `docs/frontend/REVIEW_NEEDED.md` on this branch; te/hi review list is in REQUESTS R-FE-D-36 to avoid an add/add conflict.
- Patient/doctor sessions are still interim server env vars (REQUESTS #15, #26, R-FE-D-31).
- The "mojibake" in the old handoff was a false alarm: the source has U+00B7 "·"; PowerShell displayed it wrongly.

## How to run (ports 3370-3383 + 3379)
- `Start-Process pwsh -ArgumentList '-NoProfile','-File','.context/restart-ws.ps1'` (add `-NoBuild` to only restart), poll `.context/restart.log` for `servers up`. Do not pipe/redirect the script from the tool shell (it inherits handles and hangs). Restart between runs: the fixture world is mutated by the specs.
- Then `$env:E2E_PORT='3379'; npx playwright test <specs> --project=ws-desktop-1280 --project=ws-mobile-390 --workers=2`.
- Local helpers (untracked): .context/{restart-ws.ps1,peek.mjs,dup.mjs,addkey.mjs,merge-msgs.mjs,patch-*.json}.
