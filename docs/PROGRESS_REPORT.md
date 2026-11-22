# Progress report (frontend, integration branch)

Branch `feat/fe2-integration`, rewritten 2026-11-22 at the shutdown checkpoint. All figures are measured against the synthetic fixture adapter; nothing here proves real backend behaviour. Percentages are the lead's estimates, evidence listed per phase. Resume instructions: `docs/frontend/RESUME_HERE.md`.

## Verification at final frontend head

| Check | Result |
|---|---|
| `next build` (fixture, clinical on) | exit 0, 551 static pages |
| Full `vitest run` | 131 files, 1980 tests passed |
| `tsc --noEmit` (after `next typegen`) | exit 0 |
| ESLint on changed paths | clean |
| e2e desktop-1280 and mobile-390 | all specs green, including the patient session specs (now truly signed in), clinical-off and guest variants; details in `docs/frontend/INTEGRATION_REPORT.md` 6.10 |
| CodeRabbit (`--base-commit 77ff974`, full integration diff) | 5 minor findings, all fixed: pipeline scripts now return failure, config doc exports env for `next start`, focus-ring test rejects invisible shadows, unit copy-isolation test captures the name first, time-guard inspects the formatter's own arguments (with self-checks). Rechecked: unit 18/18 for the two touched tests, keyboard-lists e2e 4/4 on both projects |

## Phases (build = coded, test = passing e2e/unit)

```
1 Foundation + public site        build ██████████ 100%  test ██████████ 100%
2 Auth, onboarding, verification  build ██████████ 100%  test ██████████ 100%
3 Directories (doctors, labs, ambulances, caretakers)
                                  build ██████████ 100%  test ██████████ 100%
4 Patient workspace + booking     build ██████████ 100%  test ██████████ 100%
5 Doctor workspace + clinical     build ██████████ 100%  test ██████████ 100%
6 Lab, ambulance, caretaker       build ██████████ 100%  test ██████████ 100%
7 Admin + CMS                     build ██████████ 100%  test ██████████ 100%
8 Final QA, review, docs, push    ██████████ 100% (after the push of the final head)
9 Backend (build, not connect)    ░░░░░░░░░░  0%   starts only when the owner says "start backend"
10 Merge + connect (http adapter) ░░░░░░░░░░  0%   only after the backend is complete
```

Frontend (phases 1 to 8) is complete against the synthetic fixture adapter. Next: the owner reviews and sends change requests; Claude implements them; then the owner says "start backend".

## Known limitations

- Fixture-only coverage. Emergency dispatch, clinical activation, live payments, GPS/maps and photo hosting remain gated per `AGENTS.md`.
- Public ambulance and caretaker directories show synthetic data only and fail closed over http until a public read contract exists.
- Blocked on the user or backend: backend routes, product decisions (reviews flag, family limit, reminder defaults, R-INT6-01), te/hi human translation review, proof-of-visit QR dependency approval, final legal copy, approval to merge backend PRs #1 to #5.
