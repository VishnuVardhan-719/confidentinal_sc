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
