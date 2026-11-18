# SureCure Visit frontend: resume here

Checkpoint written 2026-11-19, when the laptop was shut down. Read this first, then the per-branch handoff files listed below.

## What this is

The SureCure Visit frontend: Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4, Zod 4, Vitest, Playwright and axe, next-intl (en/te/hi). It is a real website, not a prototype. The spec is `docs/FRONTEND_MASTER.md`. Backend PRs #1 to #5 are **not merged**, so everything runs on the synthetic `fixture` adapter ("Synthetic data, not live"), selected with `FRONTEND_ADAPTER=fixture` and refused when `APP_ENV=production`. The `http` adapter follows `docs/API_CONTRACTS.md`.

## Rules that still apply

- Work only on feature branches off `develop`. Never commit to `develop` or `main`.
- Do not merge the backend PRs unless the user says "merge them".
- No secrets in code. Use `.env` (gitignored) or `~/.secrets/`.
- Money is in integer paise. Times are stored as UTC and shown in Asia/Kolkata.
- Booking, payment and clinical states are separate badges. No PHI in URLs or storage.
- Live payments are disabled. Providers set their own fees and manually accept or decline requests.
- There is no public admin signup. Six roles: patient, doctor, lab, ambulance, caretaker, admin.
- Fixture accounts live in `src/fixtures/identity/sessions.ts` (`@example.invalid`). Any password of 1 to 128 characters works. The fixture OTP is `246810`.

## Branch map (all pushed or to be pushed to origin)

| Branch | Worktree | Owner window | What it holds | Handoff file |
|---|---|---|---|---|
| `feat/fe2-a` | `fe2-a` | fe-a | UI foundation, i18n, public pages, header, route-link and a11y tests. Browser e2e passing: public 115, a11y 16, perf 4. | `.context/handoff-fe-a.md` |
| `feat/fe2-b` | `fe2-b` | fe-b | Auth pages, patient and provider onboarding, admin provider review and coverage, role guards, `getAccountSession`. e2e last run: 36 pass, 13 fail (mostly spec locators). | `.context/handoff-kiro-b.md` |
| `feat/fe2-c` | `fe2-c` | fe-q | Doctor discovery and the 22-step booking journey (`/patient/book`, request page, receipt), booking store, slots. | `.context/handoff-fe-q.md` (older: `handoff-t3j.md`) |
| `feat/fe2-d` | `fe2-d` | (retired) | Patient dashboard, doctor workspace, clinical draft and finalize flow. Doctor e2e un-fixme'd but **never run**. | `.context/handoff-t3k.md` |
| `feat/fe2-e` | `fe2-e` | (retired) | Operations workspaces (admin, ambulance, caretaker, lab, CMS). Merged fe-b guards. Real-guard adoption **not started**. | `.context/handoff-t3h.md` |
| `feat/fe2-p` | `fe2-p` | fe-p | Patient bookings list and detail, cancel flow. Tests green, Playwright 18/18 on port 3380. | `.context/handoff-t38.md` |
| `feat/fe2-integration` | `fe2-int` | fe-int | Merge target. fe-c, fe-d, fe-a and fe-e (5a6bcf8) are merged. fe-b 64b916f merged. fe-e 05ba88a, fe-a later commits and the rest are **still to merge**. | `.context/handoff-t34.md` (if present) |

Worktrees sit side by side under `C:\Users\Yashwanth\` (`fe2-a`, `fe2-b`, and so on). The repo is https://github.com/VishnuVardhan-719/confidentinal_sc.

## What to do next, in order

1. **Integration (highest priority).** In `fe2-int`: merge `feat/fe2-e`, the latest `feat/fe2-a` and `feat/fe2-b`, then `feat/fe2-c` and `feat/fe2-p`. Run `npx tsc --noEmit` after each merge. Keep both sides on conflicts in `docs/frontend/REQUESTS.md`. Then lint, vitest and `npm run build`.
2. **Adopt the real guards** in integration: `requireRole(role)` from `@/modules/auth/server`, the profile gate on the patient dashboard, `getAccountSession()` in the public header, and the real operations session in place of `getOperationsSession()` (fe-e handoff has the exact file list and mapping). Ops pages need active fixture accounts for lab, ambulance and caretaker (the current ones are pending or restricted).
3. **Run the browser e2e** on the integrated build, on its own port (for example 3320). Un-fixme the deferred specs and fix real app failures, not the tests. Spec files: `tests/e2e/{doctor-workspace,patient-workspace,admin-ops,ambulance,caretaker,lab,cms,doctor-search,directory,booking-wizard,patient-bookings}.spec.*`. fe-d's doctor workspace needs `.context/ws-serve.mjs` (ports 3370 to 3383).
4. **fe-b e2e failures** (13): mostly spec locators. Wrong role now redirects to its own landing, so assert the URL. See the list in `handoff-kiro-b.md`.
5. **fe-c booking journey:** finish verification (three unit failures earlier, then e2e for the happy path and the decline path, 390px and desktop, axe, keyboard-only path). `/patient/bookings*` belongs to fe-p. The wizard is at `/patient/book`.
6. **Doctor workspace** (fe-d): availability schedule, incoming booking requests with manual accept or decline, consultation draft to finalize, prescriptions and records, patient records and notifications. Then te/hi strings and axe.
7. **Phases R6 to R9:** other healthcare workflows (lab, ambulance, caretaker), Practo-level clinical expansion, design, language and usability review, final regression and handover.
8. **Reviews still owed:** CodeRabbit once each on fe-c, fe-b and integration (no secrets or PHI in the diff), then an adversarial review by a different model near the end.
9. **Docs:** update `docs/PROGRESS_REPORT.md`. te/hi translations are placeholders that need fluent review (`docs/frontend/REVIEW_NEEDED.md`). Public routes under `src/app/[locale]` are missing `loading.tsx`. The CSP and vitest config changes made by fe-a need review.

## Known issues and caveats

- te/hi strings are machine-written or English placeholders until reviewed.
- `fe2-p`: `node_modules` is a real directory copy (Turbopack refused the junction). Restore steps are in `handoff-t38.md`.
- `fe2-c` has an untracked `.playwright-mcp/` screenshots folder (not committed).
- The patient dashboard uses an interim login check until integration adopts `requireRole("patient")`.
- Progress numbers given in chat were estimates, not measurements. Last estimate: roughly 59% built and 15% verified overall.

## How to restart the agent setup

- Kiro CLI windows are launched through Herdr: `hc run --bg --name <name> --cwd C:/Users/Yashwanth/<worktree> kiro-cli chat --model claude-opus-5.5`. Wait about 30 seconds before the first `hc send`.
- Use five windows at most. One owner per worktree, no overlapping files, one port each (3320 integration, 3330 fe-a, 3310 fe-b, 3360 fe-c, 3370 to 3383 fe-d, 3350 fe-e, 3380 fe-p).
- Tell each window: read `PHASE4-common.md` (in `.claude-scratch-tasks`, not in the repo, so re-create from this README if missing), then its handoff file. Keep context under about 150k tokens (use /compact). Commit on its own branch, never push; the lead pushes feature branches only.
- Kiro credits are a shared pool (3,125 of 10,000 used at the last check this session). Watch the footer cost.
- Push command that works: `GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin <branch>`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
