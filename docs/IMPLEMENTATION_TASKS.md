# SureCure Visit — live implementation task ledger

**Status (2026-11-20):** Backend implemented on `main` (= `develop` = `integ/all`, `3a223e2`). Every migration and pgTAP suite 001-125 passes in CI, plus lint, typecheck, unit tests and build. Not done: the UI (U01), the concurrency race runners, staging/release (R02). Overview: `START_HERE.md`.  
**Human owner:** Project owner.  
**Orchestrator:** Claude Code.  
**Delegated agents:** Codex CLI, Kiro CLI.  
**Future human handover:** Friend, primarily pending frontend/UI work.

> Update continuously. Do not mark work done based on an agent's claim. Link commits, changed paths and actual test evidence. The project owner initially owns both frontend and backend; do not assign work to the friend before they join.

## Status definitions
- `DONE_VERIFIED`: implemented, reviewed and required tests executed successfully.
- `IMPLEMENTED_UNVERIFIED`: code exists but required verification is incomplete.
- `IN_PROGRESS`: active work with a named owner and branch.
- `PENDING`: ready to start; not yet in progress.
- `PENDING_HANDOVER`: independent work intentionally prepared for the friend or another developer.
- `BLOCKED`: cannot proceed due to a missing dependency, decision or access.
- `DEFERRED_BY_DESIGN`: deliberately excluded or feature-gated.

## Initial workstreams

| ID | Workstream | Initial human owner | Agent assignment | Priority | Status | Dependencies / exit evidence |
|---|---|---|---|---|---|---|
| R00 | Actual repository/archive/tool/model reconnaissance | Owner | Claude orchestrates; Codex/Kiro inspect isolated areas | P0 | DONE_VERIFIED | Git/worktree inventory, app-code check, CLI versions/models/effort/delegation, no secrets exposed |
| R01 | Source audit, conflict reconciliation and current scope baseline | Owner | Claude; Kiro independent review | P0 | IMPLEMENTED_UNVERIFIED (`docs/SOURCE_AUDIT_R01.md`, used as the scope baseline; no owner sign-off) | Complete v1.5 specs read; source hierarchy and client unknowns recorded |
| S00 | Canonical schema/ERD crosswalk before first migration | Owner approval | Codex drafts; Kiro independently challenges; Claude integrates | P0 | APPROVED_DEFAULTS (2026-11-17) | `docs/SCHEMA_RECONCILIATION.md` completed; owner-approved ERD, canonical table dictionary, RLS map and API mapping |
| F01 | Existing-app foundation inspection or Next.js foundation, strict TS, env validation, CI and tests | Owner | Claude/Codex/Kiro by isolated task | P0 | DONE_VERIFIED (2026-11-20) | CI `app` job passes lint/typecheck/test/build on `main`. Preserve existing app if present; one app/lockfile; lint/typecheck/test/build and clean commit |
| I01 | Auth, profiles, roles, organizations, memberships and RLS | Owner | Codex/Kiro by ticket | P0 | DONE_VERIFIED (2026-11-19) | Role escalation and cross-patient/cross-org denial tests. Suites 001, 002, 010, 014 pass on `integ/all` |
| I02 | Provider onboarding, private documents and admin verification | Owner | Codex/Kiro | P0 | DONE_VERIFIED (2026-11-19) | Only approved providers published; expiry/suspension tested. Suites 003, 016 and storage HTTP test pass on `integ/all` |
| C01 | Verified catalog, services, pricing, PIN coverage and public discovery | Owner | Claude/Kiro/Codex by ticket | P0 | DONE_VERIFIED (2026-11-19) | No fake coverage/listings; public/private separation. Suites 004, 015 pass on `integ/all` |
| B01 | Shared booking engine, price snapshot, accept/decline/cancel, events | Owner | Codex implementation/review if assigned | P0 | IMPLEMENTED_UNVERIFIED | Atomic acceptance, idempotency, concurrency and actor-scope tests. Built and suites 005, 011-013 pass; Q01 gap tests (`test/Q01-gaps`) merged into `integ/all`; full DB re-run by teammate (`npm run verify:db`). CI 2026-11-20 found `booking_private.patient` ignored its scope argument (column shadowed the parameter); fixed in migration 002210 |
| S01 | Doctor, lab, scheduled ambulance and caretaker workflows | Owner | Codex/Kiro by independent module | P1 | IMPLEMENTED_UNVERIFIED (2026-11-20: all suites pass in CI; race runners not run) | One database-backed tested journey per enabled category. Contract `docs/specs/P5_shared_engine_contract.md`; shared engine `feat/P5-shared-engine`; doctor `feat/S01-doctor-core`, lab `feat/P5-lab`, ambulance `feat/P5-ambulance` and care `feat/P5-care` merged into `integ/all` 2026-11-20 (SQL authored, DB NOT EXECUTED; handoffs `docs/handoffs/S01_doctor_kiro_2026-11-20.md`, `P5_lab_kiro_2026-11-20.md`, `P5_ambulance_kiro_2026-11-20.md`, `P5_care_kiro_2026-11-20.md`); shared review fixes `001591` (category Storage hook) and `001592` (`in_schedule` blackout); integration suite `090`; `p5_accept` skips the care guard for plan-less shared-suite caretaker bookings. Open care design gaps (care_scope_required rejection, post-suspension closeout) are listed in the care handoff. DB suites pass in CI on `integ/all` (2026-11-20); CI-forced fixes in 001720, 001591 (unapplied, fixed in place), 0022xx and `test(db): CI round N` commits. Remaining: the `tests/rls/run_*_concurrency.py` runners (`npm run verify:db`) |
| P01 | Pay-after records, payment test mode, webhooks and reconciliation | Owner | Codex | P1 | IMPLEMENTED_UNVERIFIED (P01a; race runner not run) / DEFERRED_BY_DESIGN (P01b, D-14) | P01a app and SQL authored; `feat/P01a-sql`, base `5f94c98`: 14 matching RPCs, suites 070–089, 9 race cases. Vitest 228 pass/2 skip, typecheck/lint and webpack build pass. Merged into `integ/all`; DB suites pass in CI on `integ/all` (2026-11-20) (002000 alias fix in place, unapplied). Race runner not yet run. D-14 A: P01b excluded. [SQL handoff](handoffs/P01a_sql_codex_2026-11-19.md) |
| U01 | Patient/provider/admin dashboards and responsive UI | Owner initially | Claude/Kiro/Codex by ticket | P1 | PENDING_HANDOVER | Real APIs; loading/error/empty states; mobile/keyboard tests. Unverified earlier work on `wip/U01a-onto-integ` (see `START_HERE.md` §2) |
| Q01 | Security, RLS, E2E, accessibility, performance and backup/restore | Owner | Codex/Kiro independent reviews | P0 | PENDING_HANDOVER (RLS/pgTAP + CI done; race runners, E2E, accessibility, performance, backup/restore not done) | Evidence recorded; no critical/high release blockers. Matrix `docs/specs/Q01_coverage_matrix.md`; gap tests `test/Q01-gaps`; CI `.github/workflows/ci.yml` (`docs/CI.md`) |
| H01 | Friend frontend handover package | Owner/Claude | Claude prepares; friend executes later | P2 | IMPLEMENTED_UNVERIFIED (`START_HERE.md`, `docs/HANDOFF_FRONTEND.md` incl. §11 route index, 2026-11-20; not yet tried by the friend) | Branch, setup, contracts, pending UI tickets, tests and next actions |
| N01 | Notifications: in-app inbox, outbox, gated channels | Owner | Kiro design; Codex implementation | P1 | IMPLEMENTED_UNVERIFIED — merged into `integ/all` 2026-11-20; DB suites pass in CI on `integ/all` (2026-11-20); race runner not yet run | Six migrations 002110-002160, suites 100-109, app adapters/dispatcher; static checks and category integration notes: `docs/handoffs/N01_codex_2026-11-20.md` |
| R02 | Staging, client acceptance, runbook and release decision | Owner | Claude coordinates | P0 | PENDING | Explicit client approval and all relevant release gates |

## Doctor consultation subtask ledger — all 14 requested capabilities

These items are individually tracked so none disappear inside a generic doctor-workflow ticket. The v1.5 detailed consultation spec/day plan request them for the November 23 target; the release-contract conflict is OPEN in `docs/DECISIONS.md`. Start with synthetic data and staging. A PENDING status does not waive the real-patient activation gates.

| Task | Capability | Human owner | Agent role | Priority | Status | Minimum evidence |
|---|---|---|---|---|---|---|
| DC01 | Assigned-doctor authorization | Owner | Codex implementation; Kiro challenge | P0 | IMPLEMENTED_UNVERIFIED (doctor core `feat/S01-doctor-core`, merged into `integ/all` 2026-11-20; suites 030-032 pass in CI; `run_p5d_concurrency.py` not run) | Unassigned/wrong doctor cannot read or mutate visit |
| DC02 | Arrival OTP | Owner | Codex implementation; Kiro security review | P0 | IMPLEMENTED_UNVERIFIED (doctor core `feat/S01-doctor-core`, merged into `integ/all` 2026-11-20; suites 030-032 pass in CI; `run_p5d_concurrency.py` not run) | One-use, booking/doctor-bound, expiring, hashed, rate-limited, replay tests |
| DC03 | Real-time patient progress | Owner | Kiro/Codex | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-extras` merged into `integ/all` 2026-11-20, migrations 002400-002450, suites 120-125 pass in CI; race runner `run_dc_extras_concurrency.py` not run; owner questions in `docs/handoffs/DC_extras_kiro_2026-11-20.md`) | Scoped minimal events; reconnect refetch; no clinical payload |
| DC04 | Vital signs and examination notes | Owner | Claude/Codex | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-clinical-core` merged into `integ/all` 2026-11-20, migrations 002300-002310, suites 110-114 pass in CI; race runner `run_dc_core_concurrency.py` not run; owner questions DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`) | Typed fields/units, validation and authorized draft storage |
| DC05 | Draft/autosave recovery | Owner | Codex/Kiro | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-clinical-core` merged into `integ/all` 2026-11-20, migrations 002300-002310, suites 110-114 pass in CI; race runner `run_dc_core_concurrency.py` not run; owner questions DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`) | Debounced save, version conflict, reconnect recovery, explicit save/error state |
| DC06 | Clinical assessment/diagnosis | Owner | Claude/Codex | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-clinical-core` merged into `integ/all` 2026-11-20, migrations 002300-002310, suites 110-114 pass in CI; race runner `run_dc_core_concurrency.py` not run; owner questions DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`) | Clinician-authored assessment; uncertainty preserved; no AI decision |
| DC07 | Finalized clinical record | Owner | Codex; independent Kiro review | P0 | IMPLEMENTED_UNVERIFIED (`feat/DC-clinical-core` merged into `integ/all` 2026-11-20, migrations 002300-002310, suites 110-114 pass in CI; race runner `run_dc_core_concurrency.py` not run; owner questions DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`) | Signed immutable version, authorship, timestamps and append-only amendment path |
| DC08 | Structured prescription | Owner | Claude/Codex | P0 | IMPLEMENTED_UNVERIFIED (`feat/DC-clinical-core` merged into `integ/all` 2026-11-20, migrations 002300-002310, suites 110-114 pass in CI; race runner `run_dc_core_concurrency.py` not run; owner questions DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`) | Structured medication fields, allergy checks, clinician approval and audit |
| DC09 | Patient consultation view | Owner | Claude/Kiro | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-clinical-core` merged into `integ/all` 2026-11-20, migrations 002300-002310, suites 110-114 pass in CI; race runner `run_dc_core_concurrency.py` not run; owner questions DCQ-1..8 in `docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`) | Linked patient-only access, private PDF/document access, negative RLS tests |
| DC10 | Independent payment collection status | Owner | Codex | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-extras` merged into `integ/all` 2026-11-20, migrations 002400-002450, suites 120-125 pass in CI; race runner `run_dc_extras_concurrency.py` not run; owner questions in `docs/handoffs/DC_extras_kiro_2026-11-20.md`) | Payment state independent of clinical completion; pay-after is not gateway-paid |
| DC11 | Health fact verification history | Owner | Codex/Kiro | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-extras` merged into `integ/all` 2026-11-20, migrations 002400-002450, suites 120-125 pass in CI; race runner `run_dc_extras_concurrency.py` not run; owner questions in `docs/handoffs/DC_extras_kiro_2026-11-20.md`) | Source, reviewer, evidence, timestamp/version and audit |
| DC12 | Privacy-safe QR proof of visit | Owner | Codex/Kiro | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-extras` merged into `integ/all` 2026-11-20, migrations 002400-002450, suites 120-125 pass in CI; race runner `run_dc_extras_concurrency.py` not run; owner questions in `docs/handoffs/DC_extras_kiro_2026-11-20.md`) | Scoped revocable expiring token; no OTP, raw patient ID or health data |
| DC13 | Consent-based optional photography | Owner | Claude/Codex | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-extras` merged into `integ/all` 2026-11-20, migrations 002400-002450, suites 120-125 pass in CI; race runner `run_dc_extras_concurrency.py` not run; owner questions in `docs/handoffs/DC_extras_kiro_2026-11-20.md`) | Purpose-specific consent, private object access, withdrawal and retention |
| DC14 | PDF report generation | Owner | Claude/Kiro | P1 | IMPLEMENTED_UNVERIFIED (`feat/DC-extras` merged into `integ/all` 2026-11-20, migrations 002400-002450, suites 120-125 pass in CI; race runner `run_dc_extras_concurrency.py` not run; owner questions in `docs/handoffs/DC_extras_kiro_2026-11-20.md`) | Versioned patient-specific PDF, authorized generation/download, no public bucket |

## Rules

- Owner initially directs both frontend and backend; do not assume friend is already working.
- Assign every agent an exclusive file scope and separate worktree.
- Do not assign two agents the same files concurrently.
- Record task IDs, branch, base commit, commits, changed files, dependencies, acceptance criteria, test evidence, blockers and next action.
- One designated migration author at a time; the owner approves the canonical design before the first migration.
- Keep future frontend tasks independently handoff-ready.
- Cut optional features before cutting security or test requirements.

## v2.3 pre-start decision and acceptance tasks (all pending)

| ID | Task | Owner | Status | Required evidence |
|---|---|---|---|---|
| D-POL | Approve mixed-payment, hybrid-cancellation, shared-support and coverage mechanics | Client/product + finance/operations | PENDING | Signed per-service policy matrix |
| D-WF | Resolve changed agent/editor workflow (Kiro addition, Antigravity removal, friend handover) | Project owner | RESOLVED 2026-11-17 (Claude + Codex + Kiro; see DECISIONS) | Dated explicit owner decision |
| D-CLIN | Define DC01–DC14 November 23 acceptance (staging vs public/clinical enablement) | Client + clinical lead | Order RESOLVED (core first); Nov 23 acceptance list OPEN | Item-level accepted/deferred list and clinical sign-off owner |
| D-PRIV | Approve health-data notices, retention, consent, minors and vendor roles | Client + legal/privacy reviewer | PENDING | Dated applicability matrix and approved forms |
| T-NEG | Execute end-to-end negative/security/availability tests per journey | Assigned engineering agent + reviewer | PENDING | `docs/TEST_EVIDENCE.md` references |

Use `docs/ACCEPTANCE_AND_TEST_MATRIX.md` for criteria. These entries are planning only, not evidence of work started.
