# Progress report (frontend, integration branch)

Branch `feat/fe2-integration`, rewritten 2026-11-22 at the shutdown checkpoint. All figures are measured against the synthetic fixture adapter; nothing here proves real backend behaviour. Percentages are the lead's estimates, evidence listed per phase. Resume instructions: `docs/frontend/RESUME_HERE.md`.

## Verification at checkpoint

| Check | Result |
|---|---|
| `next build` (fixture, clinical on) | exit 0, 551 static pages, TypeScript pass inside the build |
| Targeted unit tests (public-service-directories, seo-guard, route-links, time-guard) | 4 files, 30 tests passed |
| Full `vitest run` | 131 files, 1980 tests: 1976 passed, 4 failed (static h1 test for the new directory pages); fixed in tests/unit/a11y-static.test.ts and that file now passes 32/32. Full suite not rerun after the fix |
| ESLint on every file changed this session | clean (earlier run) |
| e2e desktop-1280 (previous build) | green except `a11y-sweep-c` (spec fixture fixed, rerun pending) |
| e2e mobile-390 (previous build) | green except `admin-verification` (code fix landed), `lab-directory` and `public-directory-smoke` (stale spec link name, fixed); not rerun |
| e2e for new ambulance/caretaker directories | written, NOT run |
| CodeRabbit | 0 findings on the diff before the new routes; final diff not reviewed yet |

## Phases (build = coded, test = passing e2e/unit)

```
1 Foundation + public site        build ██████████ 100%  test █████████░ 95%
2 Auth, onboarding, verification  build ██████████ 100%  test █████████░ 90%
3 Directories (doctors, labs, ambulances, caretakers)
                                  build ██████████ 100%  test ███████░░░ 70%
4 Patient workspace + booking     build ██████████ 100%  test ████████░░ 80%
5 Doctor workspace + clinical     build ██████████ 100%  test █████████░ 90%
6 Lab, ambulance, caretaker       build ██████████ 100%  test █████████░ 95%
7 Admin + CMS                     build ██████████ 100%  test ████████░░ 85%
8 Final QA, review, docs, push    ████░░░░░░ 40%
9 Backend connection (http)       ░░░░░░░░░░  0%   blocked on approval to merge backend PRs #1 to #5
```

| Phase | Left | Est. time | Est. Claude tokens |
|---|---|---|---|
| 1 | final rerun | 5 min | ~10k |
| 2 | confirm the admin "Start review" mobile fix | 25 min | ~60k |
| 3 | run the new directory e2e, triage, rerun lab specs | 35 min | ~120k |
| 4 | fe-p session specs (family, reminders, reviews, saved) and clinical-off variants | 45 min | ~150k |
| 5 | clinical-off variant | 10 min | ~20k |
| 6 | nothing known | 0 | 0 |
| 7 | same admin item as phase 2 | 20 min (overlaps) | ~50k |
| 8 | full unit/tsc/lint, CodeRabbit, docs, push | 50 min | ~200k |
| 9 | merge PRs, switch adapters, contract fixes | about half a day | ~400k+ |

Frontend (1 to 8): about 97% built, about 85% tested; about 2 to 2.5 h of work left. Token figures are rough guesses (plus or minus 50%). Kiro is no longer used, so its token use from here is zero.

## Known limitations

- Fixture-only coverage. Emergency dispatch, clinical activation, live payments, GPS/maps and photo hosting remain gated per `AGENTS.md`.
- Public ambulance and caretaker directories show synthetic data only and fail closed over http until a public read contract exists.
- Blocked on the user or backend: backend routes, product decisions (reviews flag, family limit, reminder defaults, R-INT6-01), te/hi human translation review, proof-of-visit QR dependency approval, final legal copy, approval to merge backend PRs #1 to #5.
