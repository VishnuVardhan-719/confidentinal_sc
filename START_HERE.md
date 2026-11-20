# SureCure Visit: start here

The entry point for anyone taking over the project (updated 2026-11-20 by Claude). Read this page first, then only the documents it points to for your task. Older entry files are kept in `docs/archive/`; where anything disagrees with this page, this page wins.

SureCure Visit is a home-healthcare booking platform (doctor visits, lab collection, scheduled ambulance, caretaker) built on Next.js 16 + Supabase (Postgres, RLS, Storage). The **backend is complete and tested in CI**; the **UI is not built yet**.

## 1. First-time setup

Tools: Node.js 22 (the CI version), npm, Git, **Docker Desktop** (runs local Supabase), Python 3 (database verification script). The Supabase CLI runs through `npx supabase`; nothing else to install.

```
git clone https://github.com/VishnuVardhan-719/confidentinal_sc.git
cd confidentinal_sc                 # default branch main
npm ci
npx supabase start                  # first run pulls the Docker images; ports are in supabase/config.toml
npx supabase db reset --local       # applies every migration in supabase/migrations
npx supabase status                 # prints the local API URL, anon key and service_role key
cp .env.example .env.local          # fill the three SUPABASE values from `supabase status`; leave feature flags empty (off)
npm run dev                         # http://localhost:3000
```

`.env.local` is gitignored. Never commit keys. Optional demo data: `supabase/seeds/local_demo.sql` (see `docs/CI.md`). Full frontend setup notes, ports and conventions: `docs/HANDOFF_FRONTEND.md` §2.

## 2. Branches

| Branch | What it is |
|---|---|
| `main` | **Start here.** The full backend, CI green. `develop` and `integ/all` point at the same commit (aligned 2026-11-20). Do not push to `main` directly: branch `task/<ID>-short-name` from `main` and open a pull request. |
| `wip/U01a-onto-integ` | Earlier UI work (app shell, components, auth pages, client API, e2e) merged onto an older backend, conflicts resolved, **never built or tested**. A starting point for the UI, not a finished one. |
| `feat/fe2-*`, `task/U0*`, `fix/U01a-*`, `wip/frontend-pause-2026-11-18` | The original UI attempts the WIP branch came from (fixture data, old API proposal). History; reuse only through `wip/U01a-onto-integ`. |
| Deleted branches | Merged or superseded branches were removed from GitHub on 2026-11-20. Names and commits are in `docs/ARCHIVED_BRANCHES.md`; any of them can be restored. |

## 3. Verify

App checks (no database needed), the same as the CI `app` job:

```
npm run lint
npm run typecheck
npm test
npm run build
```

Database checks (Docker running):

```
npx supabase start
npx supabase test db        # all pgTAP suites in supabase/tests
npm run verify:db           # reset + pgTAP + every tests/rls/run_*_concurrency.py race runner
```

`verify:db` keeps going after a failure and writes `.verify/SUMMARY.txt` plus one log per step; `--only <name>` runs one runner, `--skip-reset` skips the reset.

CI (`.github/workflows/ci.yml`, `docs/CI.md`) runs both the app checks and `supabase start` / `db reset` / `test db` on every push to `main`, `develop`, `integ/**`, `feat/**`, `fix/**` and on every pull request. A failing database step publishes its error lines as an annotation on the run page. On Windows inside a git worktree whose `node_modules` is a junction, use `npx next build --webpack`; a normal clone is unaffected.

## 4. Status

### Done (CI-verified 2026-11-20, run #65 on `main` `3a223e2`)

Every migration applies on a clean database and all pgTAP suites 001-125 pass; lint, typecheck, 799 unit tests and the production build pass.

| Area | What exists |
|---|---|
| Identity (I01) | Profiles, patients, consent, organizations, memberships, roles, audit, RLS |
| Provider onboarding (I02, Q06) | Private documents, staff credentials, admin verification, Storage policies |
| Catalog (C01) | Services, prices, PIN coverage, public discovery of approved providers only |
| Booking core (B01) | Requests, availability, accept/decline/cancel, events, idempotency |
| P5 shared engine | Category registry, reservations, ops queue, closeout, feature gates |
| Doctor (S01 + DC01-DC14) | Visits, arrival OTP, clinical drafts and autosave, signed records and amendments, prescriptions, patient view, progress, payment status, health facts, QR proof, consented photos, PDF report |
| Lab, ambulance, caretaker | Full scheduled workflows per category |
| Pay-after payments (P01a) | Collection reports, reconciliation, ledger, overrides |
| Notifications (N01) | In-app inbox, outbox, dispatcher; SMS/email/WhatsApp adapters log-only |
| API | 134 route files under `src/app/api` (index: `docs/HANDOFF_FRONTEND.md` §11) |
| CI | App job + database job with failure annotations |

Everything is behind database feature gates seeded **off**, with synthetic data only.

### Not done

| Item | Why / where |
|---|---|
| **UI** (U01): patient, provider, admin screens | Only a placeholder page. Start from `wip/U01a-onto-integ` or fresh; contracts in `docs/HANDOFF_FRONTEND.md` |
| Concurrency race runners (`tests/rls/run_*_concurrency.py`) | Written, never executed; CI does not run them. `npm run verify:db` on a Docker machine |
| Payment gateway (P01b), live payments | Deferred by decision D-14 |
| Real SMS/email/WhatsApp delivery | Adapters are log-only; blocked by the B01 `service_role` hardening (`docs/handoffs/N01_codex_2026-11-20.md`) |
| Caretaker gaps | Admission without a task list, closeout after suspension (`docs/handoffs/P5_care_kiro_2026-11-20.md`) |
| PDF in Hindi/Telugu | Writer draws Latin text only; needs an embedded font (`docs/handoffs/DC_extras_kiro_2026-11-20.md`) |
| Emergency dispatch, pharmacy, subscriptions, GPS, payouts | Out of scope for this release; flags stay off |
| Staging, runbook, release (R02) | Not started |

### To do next (in order)

1. Run `npm run verify:db` once on a Docker machine and record the result in `docs/TEST_EVIDENCE.md`; fix any race failure.
2. Build the UI (U01) against the real API routes, starting with the patient booking journey.
3. Get the owner's answers to `docs/OWNER_DECISIONS_PENDING.md` and the doctor clinical questions (DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`, five more in `DC_extras_kiro_2026-11-20.md`); a feature's gate stays off until its questions are answered.
4. Staging deployment and runbook (R02), then release gates in `docs/RELEASE_CHECKLIST.md`.

Task-by-task status: `docs/IMPLEMENTATION_TASKS.md`. Feature summary: `docs/FEATURE_STATUS.md`.

## 5. Where things are

| Need | Read |
|---|---|
| Task status (single source of truth) | `docs/IMPLEMENTATION_TASKS.md` |
| Decisions waiting on the owner, with the safe defaults in force | `docs/OWNER_DECISIONS_PENDING.md` |
| Frontend: setup, conventions, every API route | `docs/HANDOFF_FRONTEND.md` (§11 is the route index) |
| Shared booking rules all categories follow | `docs/specs/P5_shared_engine_contract.md` |
| Per-block detail: what was built, commands, known gaps | `docs/handoffs/*.md` (one per block) |
| Designs | `docs/specs/` (`P5_*_flow_design.md`, `P01_payments_design_v1.2.md`, `N01_notifications_design.md`, `DC_*_design.md`) |
| Test results | `docs/TEST_EVIDENCE.md` |
| Agent and repo rules | `AGENTS.md`, `CLAUDE.md` |
| Original client material and plans | `README.md` (master execution pack), `docs/source/` |

| Folder | Contents |
|---|---|
| `src/app/api` | Route handlers (thin: validate, call one RPC, map errors) |
| `src/lib` | Supabase clients, env, validation (Zod), per-block services |
| `supabase/migrations` | All SQL, append-only, applied in filename order |
| `supabase/tests` | pgTAP suites (`NNN_*.test.sql`) and fixtures (`_*.inc`) |
| `supabase/config.toml`, `supabase/seeds` | Local stack config and the opt-in demo seed |
| `tests/unit`, `tests/rls` | Vitest tests; Python race runners |
| `scripts` | `db_verify.py` (verify:db), `ci-annotate.sh` (CI), `add-agent-worktree.sh` |

Numbering: each block owns a migration range and a suite range (shared 001550-001599 / 020-029, doctor 0016xx / 030-039, lab 0017xx / 040-049, ambulance 0018xx / 050-059, care 0019xx / 060-069, P01a 002000 / 070-089, integration - / 090-099, N01 002110-002160 / 100-109, cross-block fixes 0022xx / -, DC core 0023xx / 110-119, DC extras 0024xx / 120-129). New work takes a new range.

## 6. Rules that bite

- Every category and channel is behind a database feature gate seeded **off**. Synthetic data only; no real patients, payments or messages.
- Secrets only in `.env.local` (gitignored) or a secret store. `.env.example` lists names only. The repository is public.
- Next.js 16 with `cacheComponents`: no `export const dynamic`; gated GET routes call `await connection()`.
- Migrations are append-only: never edit a merged migration, add a new one in your range.
- In `language sql` functions a column name wins over a parameter of the same name (`a.scope=scope` compared the column with itself; fixed in 002210). Prefix parameters `p_` or use `$1`.
- Every suite must end with `\echo 1..1` and `\echo ok 1 - <name>` before `rollback;`, or pg_prove reports "No plan found".
- Book test slots at a fixed IST time (`(:'day'||' 10:00 Asia/Kolkata')::timestamptz`), not `now()+interval 'N hours'`: fixture schedules run 00:00-23:59 IST, so a slot that crosses IST midnight fails only at certain times of day. Older suites still use `now()+N days`; if one fails only near 18:30 UTC, this is why.
- Do not claim something works without running its check and reading the output.
