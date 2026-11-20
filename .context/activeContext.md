# Active context (2026-11-19, FE v2 Phase 4)
Owner rejected the old demo frontend (preserved on wip/frontend-pause-2026-11-18). Fresh build per docs/FRONTEND_MASTER.md. Conventions: docs/frontend/CONVENTIONS.md.
Lead = Claude (commits/push, integration, review). Task files: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE4-common.md + PHASE4-E2.md.

## fe-e2 Phase 4 (feat/fe2-e, base 05ba88a, port 3350)
Task: merge feat/fe2-b (64b916f) -> replace getOperationsSession/interim guards with requireRole -> un-fixme e2e admin-ops/ambulance/caretaker/lab/cms -> role-isolation browser test -> axe on each workspace -> tsc/lint/vitest/build/playwright -> commit.
Progress:
- [ ] merge fe2-b

## fe-b (Kiro) PHASE4-E2, 2026-11-19
- 6e70397: real guards (requireOperationsSession/authorizeOperationsSession in src/modules/admin/session.ts), ops personas in src/fixtures/identity/operations.ts.
- Next: run ops e2e on 3350 (.context/run-e2e.ps1 uses root playwright.config.ts), role-isolation spec, axe.

- Ops specs un-fixme'd; signInAs wired (support/operations.ts, hard reload after sign-in). Discovery copies (serial removed) in tests/e2e/zz-discover (DO NOT COMMIT; delete at end). First discovery: 26 fail / 15 pass desktop, list in .context/ops-e2e-discovery-desktop.txt.

- PHASE4-E2 done (b77fb24, ea568c8, b49844c): 5 ops specs + new role-isolation.spec pass on desktop-1280 and mobile-390 (lab also with FEATURE_CLINICAL=true); fixture ops clock, lab 'scheduled' queue, recollection reference, public stories/FAQ read CMS. Open: pre-existing soft 404 on /stories/<unknown>. Details: .context/handoff-fe-b-e2.md. zz-discover deleted.

## fe-b PHASE4 follow-up (lead t4), 2026-11-19
- Steps 1-4 committed: 4d939f1 (stories 404 via proxy), a1da5e8 (.gitignore), 0813f7b (emergency spec), ff65066 (error boundaries). Step 5 a11y-sweep-e.spec.ts IN PROGRESS.


## TASK REPORT (fe-b, lead t4 follow-up), 2026-11-19, feat/fe2-e, not pushed
Commits: 4d939f1, a1da5e8, 0813f7b, ff65066, 0500117, e03fb45 (all with Co-Authored-By trailer).
1. Story 404 (4d939f1): with Cache Components a request-time notFound() runs after the streamed shell (HTTP 200), and `dynamicParams` is not allowed. src/proxy.ts now checks /{locale}/stories/<slug> against published content and rewrites unknown slugs to the prerendered catch-all not-found (404). The content fixture store moved to globalThis so the proxy and pages share it. Probe: /en|hi/stories/anything 404, /te/no-such-page 404, /en/stories/synthetic-story-one 200. public.spec desktop 51 pass, 1 skip (one cold-start failure on the first test in an earlier run; passed on rerun).
2. .gitignore (a1da5e8): coverage/ -> /coverage/. git check-ignore: route path no longer ignored, root coverage/ still ignored. fe2-e has no admin/coverage route files (they live on feat/fe2-b, force-added there), so nothing to add here.
3. Emergency (0813f7b): page already leads with a large tel:112 button; header/footer links keep /emergency. New tests/e2e/emergency-e.spec.ts asserts link targets, tel:112 button >=56px tall and fully on screen at 390 and 1280, and works without JS: 3/3.
4. Boundaries (ff65066): ops areas (admin, lab, ambulance, caretaker) already had loading+error. Added localized error.tsx with retry for (public) and (auth) (src/components/shared/public-route-error.tsx, errors.boundary en/te/hi). No loading.tsx for public pages on purpose: a group-level one broke the build (catch-all notFound inside Suspense) and stories/faq ones hid content without JavaScript (public.spec no-JS FAQ failed). Unit test locks this in (route-boundaries.test.ts).
5. a11y sweep (e03fb45): tests/e2e/a11y-sweep-e.spec.ts, 18 public/auth/404 pages + 49 ops/admin/CMS pages at 390 and 1280, axe serious/critical + no horizontal scroll: 14/14 tests pass. App fixes: record-list table wrapper min-w-0 (ambulance fleet/requests, admin audit overflowed at 1280), mobile cards stack label above value (390 overflow), 404 numeral contrast.
Steering (money): 0500117 replaces paise/100 + toFixed(2) in the lab catalogue editor with integer maths (paiseToRupeesString in components/admin/ops/format.ts; formatPaise passes the exact decimal string to the en-IN Intl formatter). No shared money helper exists on this branch, so the ops format module is the shared one here. Test money-format.test.ts.
Verification: tsc 0, eslint 0, vitest 705/705, build 0. Regression: mobile-390 lab 9+1skip, ambulance 9, caretaker 8, admin-ops 9, cms 6; desktop lab 9+1skip. Server on 3350 stopped.
Open: proxy story check queries content on every /stories/<slug> request (cheap in fixture; http adapter has no CMS contract yet so all story slugs 404 there, same as the page). te/hi strings still unreviewed.

## TASK R9-E: DONE (fe-b, resumed 2026-11-20)
- Source: 7d04148. In http mode (content backend gated), /stories and /stories/<slug> render "Stories are not available yet" with HTTP 200; the proxy 404s unknown slugs only in fixture mode. Unit tests: stories-gated.test.ts, loaders.test.ts. http-mode smoke (port 3351, before shutdown): /en/stories 200, /en and /te /stories/some-story 200 with the gated copy, /en/no-such-page 404, axe serious/critical none, no overflow at 390/1280.
- Regression on c99a4c7 (fixture build, port 3350, fresh server per spec):
  - tsc 0; eslint 0 errors, 1 warning in untracked scratch .context/probe-overflow.mjs (not source, not committed); vitest 48 files, 709/709; next build 0 (clean .next).
  - Playwright desktop-1280 / mobile-390: public 51+1 skip / 52; lab 9+1 skip / 9+1 skip; ambulance 9/9; caretaker 8/8; admin-ops 9/9; cms 6/6; role-isolation 9/9; emergency-e 3/3.
  - Lab with FEATURE_CLINICAL=true (server + Playwright): 9 passed, 1 skipped on both projects. Skips are by design (public: mobile-only test; lab: clinical on/off pair).
  - a11y-sweep-e (390 and 1280): 14/14 passed.
- Not run: auth, navigation, onboarding, profile, admin-verification specs (owned by other agents, outside the R9-E list). The http-mode story pages were not re-smoked after resume (no source change since).
- Open: http adapter has no CMS contract, so every story slug shows the gated page in http mode. te/hi strings still unreviewed. All servers stopped.

## TASK R9-E2: DONE (fe-b, 2026-11-20)
- Ran auth, navigation, onboarding, profile, admin-verification in fixture mode at 390/1280 (port 3350, fresh server per spec). Before: profile 1 failed (both sizes); the other four were almost entirely describe.fixme.
- Fixes (own files): profile/auth wrong-role assertions now expect the guard's redirect to the user's landing page; auth/navigation un-fixme'd, stale selectors fixed (route announcer alert, "patient" radio, Mobile tab label, two 112 links, hidden Activity duplicate); signup role choice kept across the Email/Mobile tabs (auth-flow.tsx); Sign out added to AreaShell top bar and OpsFrame (area-shell.tsx).
- Still fixme (named routes not built on fe2-e): auth 4 (anon redirects for /patient/dashboard, /doctor/onboarding, /admin/providers, /admin/coverage); navigation 3 (auth-page links -> /doctors, patient + doctor walks); onboarding 15 (wizards not built); admin-verification 10 (pages not built). REQUESTS.md R-E9E2-01..03.
- Results after fixes: auth 23 passed/4 skipped, navigation 5/3, profile 6/0, onboarding 0/15, admin-verification 0/10 at both sizes. Regression: public 51+1/52, lab 9+1, ambulance 9, caretaker 8, admin-ops 9, cms 6, role-isolation 9, emergency-e 3 (both sizes), a11y-sweep 14/14. tsc 0, eslint 0 errors (1 warning in untracked scratch), vitest 709/709, build 0.
- Greps: toFixed only in onboarding/coordinates.ts (lat/lng, not money); paise helpers integer-safe. No hard-coded UI copy found in src tsx/ts (heuristic greps); fixture adapter audit notes in modules/verification/fixture.ts are synthetic data.
## TASK R9-E3: DONE (fe-b, 2026-11-20)
- Docs: new docs/frontend/modules/{README.md, content.md, lab.md} (areas, patterns, rules, gates, tests, open items; claims checked against code). REQUESTS.md: appended a dated status index for all R-E*, R-FE01-3, R-FE03..07 and R-E9E2 entries (append-only; no earlier text edited).
- Regression (clean fixture build, port 3350, fresh server per spec), desktop-1280 / mobile-390: public 51+1 skip / 52; lab 9+1 / 9+1; lab with FEATURE_CLINICAL=true 9+1 / 9+1; ambulance 9/9; caretaker 8/8; admin-ops 9/9; cms 6/6; role-isolation 9/9; emergency-e 3/3; auth 23+4 skip / same; navigation 5+3 / same; profile 6/6; onboarding 0+15 skip; admin-verification 0+10 skip. a11y-sweep-e (390 and 1280) 14/14. tsc 0, eslint 0 errors (1 warning in untracked scratch), vitest 709/709, build 0. No failures, no code changes.
- Skips: onboarding and admin-verification still wait for unbuilt pages (stepped questionnaire, provider onboarding, /admin/providers, /admin/coverage). Un-fixme'd in R9-E2, they fail on the first test (serial mode).
## TASK R9-E4: DONE (fe-b, 2026-11-20)
- E2: paiseToRupeesString returns the em dash for non-safe-integers (format.ts); test in money-format.test.ts.
- Finding 4: hi ambulance.dashboard.daysLeft, lab.orders.testCount, auth.otp.attemptsLeft fixed; new tests/unit/i18n-hindi-plurals.test.ts (guard over all hi files, fe-a common.errorSummary.title exempt; render checks at 0/1/n). The guard flags exactly those 4 keys on the previous HEAD.
- R6-1: signup role radios disabled + fieldset aria-busy until hydration (src/components/auth/use-hydrated.ts); tests/e2e/hydration-race-e.spec.ts (3 tests; it failed on the old build at "toBeDisabled").
- Checks: tsc 0, eslint 0 errors, vitest 49 files 715/715, build 0. Playwright desktop-1280/mobile-390: hydration-race-e 3/3, auth 23+4 skip, navigation 5+3 skip, lab 9+1, ambulance 9 (both sizes); a11y-sweep-e 14/14.
## TASK R9-E5: DONE (fe-b, 2026-11-20)
- docs/frontend/I18N_GLOSSARY.md: canonical hi/te rendering for 19 terms (plus approve), measured on fe2-e and the committed integration messages (fec9da1, git archive, read-only); disagreements D-1..D-11 with key paths and owners; extra findings (fee, test). No message file changed.
- tests/unit/i18n-structural-parity.test.ts: every namespace from disk, en/te/hi same keys + same ICU arguments/tags (small ICU scanner). 68 tests pass on fe2-e, 92 on the integration export; on a broken copy it fails 3 of 3 planted errors.
- REQUESTS R-E9E5-01 per owner. tsc 0, eslint 0 errors, vitest 50 files 783/783.
- Scratch (untracked): .context/i18n-{discover,classify,details,labels,spelling}.mjs and their .txt outputs.
## TASK R9-E6: DONE (fe-b, 2026-11-20)
- Canonical money lib src/lib/money/index.ts: formatPaise / formatSignedPaise / paiseToDecimalString / isValidPaise (null for invalid; 2 decimals; en-IN grouping; Latin digits; integer split, exact Intl decimal string).
- Migrated fe-b call sites: ops/format.ts (formatPaiseOrDash), admin/ambulance/caretaker/lab views (13 calls), lab catalogue prefill, onboarding paiseToRupeesInput.
- Tests: tests/unit/money.test.ts (table), tests/unit/money-guard.test.ts (repo-wide; allowlists the exact 9 offender lines of fe-q/fe-a/fe-d on integration fec9da1; stale-entry check). Integration export: flags only fe-b's old code; with this change overlaid: 12/12 pass. A temporary comparison (deleted) showed canonical == lib/format == clinical output for en/te/hi, payments differs only by ".00".
- REQUESTS R-E9E6-01 (fe-q lib/format), -02 (fe-a payments, visible .00 change + 2 test updates), -03 (fe-d clinical), -04 (fe-p none).
- Checks: tsc 0, eslint 0 errors, vitest 52 files 858/858, build 0; e2e lab/ambulance/caretaker/admin-ops at 1280 and 390 pass (caretaker desktop touch-target check flaked once, passed on 2 reruns).