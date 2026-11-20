# SureCure Visit: start here

This is the entry point for anyone picking up the project (updated 2026-11-20 by Claude). Read this page first, then only the documents it points to for your task. Older entry files (`README_START.md`, `docs/HANDOVER.md`, `docs/FRIEND_START_PROMPT.md`) are historical; where they disagree with this page, this page wins.

## 1. Branches

| Branch | What it is |
|---|---|
| `integ/all` | **The working branch.** All backend work is merged here: identity, onboarding, catalog, booking core, the P5 shared engine, doctor, lab, ambulance and caretaker workflows, pay-after payments (P01a), notifications (N01), doctor clinical DC03-DC14. No UI yet. Branch new work from here. |
| `develop`, `main` | Behind `integ/all` (develop by 120+ commits). Merging `integ/all` into `develop` is an owner decision (`docs/OWNER_DECISIONS_PENDING.md` R-2). Do not push to either without the owner. |
| `feat/*` already merged | `feat/P5-shared-engine`, `feat/P5-shared-api`, `feat/S01-doctor-core`, `feat/P5-lab`, `feat/P5-ambulance`, `feat/P5-care`, `feat/P01a-sql`, `feat/N01-notifications`, `feat/DC-clinical-core`, `feat/DC-extras`, `test/Q01-gaps`, `chore/R6-seed`. Kept for history; do not build on them. |
| `feat/fe2-*`, `task/U0*`, `fix/U01a-*`, `wip/frontend-pause-2026-11-18` | Earlier unreviewed UI work, based on `develop` with fixture data and the old API proposal. Ask the owner before reusing it. |
| `wip/B01-fix-round1`, `wip/Q01a-rls-runner`, `docs/backend-*`, `docs/handoff-2026-11-18` | Superseded (B01 fixes landed via `integ/b01-fixes`; the RLS runner is replaced by `npm run verify:db`). History only. |

## 2. Verify

App checks (no database needed):

```
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

On Windows inside a git worktree whose `node_modules` is a junction, Turbopack cannot resolve `next`; use `npx next build --webpack` there. A normal clone is unaffected.

Database checks (needs Docker and the Supabase CLI):

```
npx supabase start
npm run verify:db        # = python scripts/db_verify.py
```

`verify:db` runs `supabase db reset --local`, `supabase test db` and every `tests/rls/run_*.py` concurrency runner, keeps going after a failure, and writes `.verify/SUMMARY.txt` plus one log per step. Send the owner `SUMMARY.txt` and the logs of failed steps. `python scripts/db_verify.py --only p5c` runs one runner; `--skip-reset` skips the reset.

CI (`.github/workflows/ci.yml`, `docs/CI.md`) runs the app checks and `supabase start` / `db reset` / `test db` on every push to `integ/**` and `feat/**`. When a database step fails, its last 40 output lines appear as an error annotation on the run page.

**Database status (2026-11-20):** CI on `integ/all` applies every migration and runs every pgTAP suite (001-125); all green from run #58 (commit `77971f2`); check the latest run on the Actions tab before relying on newer commits. Handoffs still say "DB NOT EXECUTED" because their authors had no database; CI is the execution record, and the fixes it forced are in the 0022xx migrations and the `test(db): CI round N` commits. Not run in CI yet: the `tests/rls/run_*_concurrency.py` race runners. Run them with `npm run verify:db` on a Docker machine.

## 3. Where things are

| Need | Read |
|---|---|
| Task status (single source of truth) | `docs/IMPLEMENTATION_TASKS.md` |
| Decisions waiting on the owner, with the safe defaults in force | `docs/OWNER_DECISIONS_PENDING.md` |
| Frontend: setup, conventions, every API route | `docs/HANDOFF_FRONTEND.md` (section 11 is the full route index) |
| Shared booking rules all categories follow | `docs/specs/P5_shared_engine_contract.md` |
| Per-block detail: what was built, commands, known conflicts | `docs/handoffs/*.md` (one per block) |
| Designs | `docs/specs/P5_*_flow_design.md`, `P01_payments_design_v1.2.md`, `N01_notifications_design.md`, `DC_*_design.md` |
| Agent and repo rules | `AGENTS.md`, `CLAUDE.md` |
| CI | `docs/CI.md` |

Numbering: each block owns a migration range and a suite range (shared 001550-001599 / 020-029, doctor 0016xx / 030-039, lab 0017xx / 040-049, ambulance 0018xx / 050-059, care 0019xx / 060-069, P01a 002000 / 070-089, integration - / 090-099, N01 002110-002160 / 100-109, cross-block integration fixes 0022xx / -, DC core 0023xx / 110-119, DC extras 0024xx / 120-129). New work takes a new range.

## 4. What is left

Read the ledger for the current state; at the time of writing:

1. **Concurrency runners** (`npm run verify:db` on a Docker machine): the pgTAP suites pass in CI, the race runners have not run anywhere.
2. **Doctor clinical owner questions**: DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md` and five in `DC_extras_kiro_2026-11-20.md` (consent model, allergy matching, vital thresholds, photo retention, Indic PDF fonts). Their gates stay off until answered.
3. **UI** (U01): patient, provider and admin screens. Nothing exists yet beyond a placeholder page.
4. **Owner decisions** that gate release: ops escalation owner (OD-2), payment confirmation (D-1, D-13), privacy (D-PRIV), clinical scope (D-CLIN), repo visibility (R-1), merge to `develop` (R-2).
5. Release work: staging, runbook (R02).

Known gaps carried by the handoffs: caretaker admission without a task list and closeout after suspension (`docs/handoffs/P5_care_kiro_2026-11-20.md`); the B01 `service_role` write hardening that blocks external notification channels (`docs/handoffs/N01_codex_2026-11-20.md`); the payment gateway (P01b) is deferred.

## 5. Rules that bite

- Every category and channel is behind a database feature gate seeded **off**. Synthetic data only; no real patients, payments or messages.
- Secrets only in `.env.local` (gitignored) or a secret store. `.env.example` lists names only.
- Next.js 16 with `cacheComponents`: no `export const dynamic`; gated GET routes call `await connection()`.
- Migrations are append-only: never edit a merged migration, add a new one in your range.
- In `language sql` functions a column name wins over a parameter of the same name (`a.scope=scope` compared the column with itself; fixed in 002210). Prefix parameters `p_` or use `$1`.
- Every suite must end with `\echo 1..1` and `\echo ok 1 - <name>` before `rollback;`, or pg_prove reports "No plan found".
- Do not claim something works without running its check and reading the output.
