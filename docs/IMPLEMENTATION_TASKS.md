# SureCure Visit — live implementation task ledger

**Pack status:** Documentation and execution workflow prepared and verified; application implementation has not been verified as started.  
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
| R01 | Source audit, conflict reconciliation and current scope baseline | Owner | Claude; Kiro independent review | P0 | PENDING | Complete v1.5 specs read; source hierarchy and client unknowns recorded |
| S00 | Canonical schema/ERD crosswalk before first migration | Owner approval | Codex drafts; Kiro independently challenges; Claude integrates | P0 | APPROVED_DEFAULTS (2026-11-17) | `docs/SCHEMA_RECONCILIATION.md` completed; owner-approved ERD, canonical table dictionary, RLS map and API mapping |
| F01 | Existing-app foundation inspection or Next.js foundation, strict TS, env validation, CI and tests | Owner | Claude/Codex/Kiro by isolated task | P0 | PENDING | Preserve existing app if present; one app/lockfile; lint/typecheck/test/build and clean commit |
| I01 | Auth, profiles, roles, organizations, memberships and RLS | Owner | Codex/Kiro by ticket | P0 | PENDING | Role escalation and cross-patient/cross-org denial tests |
| I02 | Provider onboarding, private documents and admin verification | Owner | Codex/Kiro | P0 | PENDING | Only approved providers published; expiry/suspension tested |
| C01 | Verified catalog, services, pricing, PIN coverage and public discovery | Owner | Claude/Kiro/Codex by ticket | P0 | PENDING | No fake coverage/listings; public/private separation |
| B01 | Shared booking engine, price snapshot, accept/decline/cancel, events | Owner | Codex implementation/review if assigned | P0 | PENDING | Atomic acceptance, idempotency, concurrency and actor-scope tests |
| S01 | Doctor, lab, scheduled ambulance and caretaker workflows | Owner | Codex/Kiro by independent module | P1 | PENDING | One database-backed tested journey per enabled category |
| P01 | Pay-after records, payment test mode, webhooks and reconciliation | Owner | Codex implementation/review if assigned | P1 | PENDING | Payment separate from booking; signature/dedupe tests |
| U01 | Patient/provider/admin dashboards and responsive UI | Owner initially | Claude/Kiro/Codex by ticket | P1 | PENDING | Real APIs; loading/error/empty states; mobile/keyboard tests |
| Q01 | Security, RLS, E2E, accessibility, performance and backup/restore | Owner | Codex/Kiro independent reviews | P0 | PENDING | Evidence recorded; no critical/high release blockers |
| H01 | Friend frontend handover package | Owner/Claude | Claude prepares; friend executes later | P2 | PENDING | Branch, setup, contracts, pending UI tickets, tests and next actions |
| R02 | Staging, client acceptance, runbook and release decision | Owner | Claude coordinates | P0 | PENDING | Explicit client approval and all relevant release gates |

## Doctor consultation subtask ledger — all 14 requested capabilities

These items are individually tracked so none disappear inside a generic doctor-workflow ticket. The v1.5 detailed consultation spec/day plan request them for the November 23 target; the release-contract conflict is OPEN in `docs/DECISIONS.md`. Start with synthetic data and staging. A PENDING status does not waive the real-patient activation gates.

| Task | Capability | Human owner | Agent role | Priority | Status | Minimum evidence |
|---|---|---|---|---|---|---|
| DC01 | Assigned-doctor authorization | Owner | Codex implementation; Kiro challenge | P0 | PENDING | Unassigned/wrong doctor cannot read or mutate visit |
| DC02 | Arrival OTP | Owner | Codex implementation; Kiro security review | P0 | PENDING | One-use, booking/doctor-bound, expiring, hashed, rate-limited, replay tests |
| DC03 | Real-time patient progress | Owner | Kiro/Codex | P1 | PENDING | Scoped minimal events; reconnect refetch; no clinical payload |
| DC04 | Vital signs and examination notes | Owner | Claude/Codex | P1 | PENDING | Typed fields/units, validation and authorized draft storage |
| DC05 | Draft/autosave recovery | Owner | Codex/Kiro | P1 | PENDING | Debounced save, version conflict, reconnect recovery, explicit save/error state |
| DC06 | Clinical assessment/diagnosis | Owner | Claude/Codex | P1 | PENDING | Clinician-authored assessment; uncertainty preserved; no AI decision |
| DC07 | Finalized clinical record | Owner | Codex; independent Kiro review | P0 | PENDING | Signed immutable version, authorship, timestamps and append-only amendment path |
| DC08 | Structured prescription | Owner | Claude/Codex | P0 | PENDING | Structured medication fields, allergy checks, clinician approval and audit |
| DC09 | Patient consultation view | Owner | Claude/Kiro | P1 | PENDING | Linked patient-only access, private PDF/document access, negative RLS tests |
| DC10 | Independent payment collection status | Owner | Codex | P1 | PENDING | Payment state independent of clinical completion; pay-after is not gateway-paid |
| DC11 | Health fact verification history | Owner | Codex/Kiro | P1 | PENDING | Source, reviewer, evidence, timestamp/version and audit |
| DC12 | Privacy-safe QR proof of visit | Owner | Codex/Kiro | P1 | PENDING | Scoped revocable expiring token; no OTP, raw patient ID or health data |
| DC13 | Consent-based optional photography | Owner | Claude/Codex | P1 | PENDING | Purpose-specific consent, private object access, withdrawal and retention |
| DC14 | PDF report generation | Owner | Claude/Kiro | P1 | PENDING | Versioned patient-specific PDF, authorized generation/download, no public bucket |

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
| D-WF | Resolve changed agent/editor workflow (Kiro addition, Antigravity removal, friend handover) | Project owner | PENDING | Dated explicit owner decision |
| D-CLIN | Define DC01–DC14 November 23 acceptance (staging vs public/clinical enablement) | Client + clinical lead | PENDING | Item-level accepted/deferred list and clinical sign-off owner |
| D-PRIV | Approve health-data notices, retention, consent, minors and vendor roles | Client + legal/privacy reviewer | PENDING | Dated applicability matrix and approved forms |
| T-NEG | Execute end-to-end negative/security/availability tests per journey | Assigned engineering agent + reviewer | PENDING | `docs/TEST_EVIDENCE.md` references |

Use `docs/ACCEPTANCE_AND_TEST_MATRIX.md` for criteria. These entries are planning only, not evidence of work started.
