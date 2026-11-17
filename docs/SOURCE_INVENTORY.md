# Source inventory and verification record

**Pack version:** 2.2  
**Audit date:** 17 November 2026

## Original uploads inspected

1. `SureCureVisit.zip` — outer archive containing a nested v1.5 source kit plus standalone README/day-plan files. Preserved byte-for-byte as `docs/source/SureCureVisit_Outer_Upload_v1.5_wrapper_original.zip`.
2. `SureCureVisit (1).zip` — the 20-entry v1.3 dual-agent engineering kit. Preserved byte-for-byte as `docs/source/SureCureVisit_v1.3_original_dual_agent_kit.zip`.
3. `SureCureVisit_Blueprint_Kit_v1.1.zip` — the four-entry v1.1 blueprint kit. Preserved byte-for-byte as `docs/source/v1.1_original/SureCureVisit_Blueprint_Kit_v1.1_original.zip`.
4. `SureCureVisit_Master_Blueprint_v1.1.md` — separately uploaded blueprint, preserved as `docs/source/SureCureVisit_Master_Blueprint_v1.1.md`.
5. The v2.0 master README and execution-pack files — preserved as historical artifacts under `docs/source/v2.0_original/`.

## Recovered v1.5 archive — verified

The nested archive `SureCureVisit/SureCureVisit.zip` was extracted and inspected. It contains **44 ZIP entries**, including **31 Markdown files** (20 under `docs/`; the total also includes root instruction/index files and four `SKILL.md` files). Its detailed product and engineering specifications were present; they were initially overlooked and have now been recovered.

The exact original nested v1.5 ZIP is preserved at:

- `docs/source/SureCureVisit_v1.5_original_kit.zip`
- The exact outer upload wrapper is also preserved at `docs/source/SureCureVisit_Outer_Upload_v1.5_wrapper_original.zip`

Readable extracted source documents are preserved under `docs/specs/`, including:

- `PRODUCT_REQUIREMENTS.md`
- `SYSTEM_ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `ROLE_ONBOARDING_AND_PERMISSIONS.md`
- `BOOKING_AND_CONSULTATION.md`
- `TECH_STACK_AND_SUBSCRIPTIONS.md`
- `AI_WHATSAPP_AND_CLOUD.md`
- `DESIGN_ANIMATION_I18N.md`
- `EXISTING_SITE_AND_MIGRATION.md`
- `CLIENT_HANDOVER_AND_OPERATIONS.md`
- `RISKS_OPEN_DECISIONS.md`
- `DAY_BY_DAY_PLAN.md`
- `FILE_INDEX.md`
- `MASTER_BLUEPRINT_V1_5_ORIGINAL.md` (the v1.5 consolidation notice plus inherited technical blueprint)
- Original v1.5 README, decisions, API contracts, release checklist, permissions, toolkit, agent coordination, task list and design reference (clearly labelled as original source copies).

The v1.5 README and day-by-day plan are also preserved as standalone originals in `docs/source/`. The v1.3 kit is preserved at `docs/source/SureCureVisit_v1.3_original_dual_agent_kit.zip`; superseded v1.3 blueprint/API/worktree files are archived under `docs/source/v1.3_original/` and `docs/source/`. The v1.1 ZIP and standalone blueprint are both preserved. The user's previously supplied v2.0 README and execution ZIP are preserved under `docs/source/v2.0_original/` so the version history can be audited.

## What the supplied archives do NOT contain

The inspected nested v1.5 kit is a specification, documentation, skills and scripts pack. It does **not** contain a runnable application source tree, `package.json`, a package-manager lockfile, executed Supabase migrations or an existing deployed application. This does not prove that no application exists elsewhere. Claude must inspect the actual working directory and the separately uploaded project archive/repository during Phase 0 before scaffolding or changing anything.

No production credentials, database access, DNS access, merchant account, provider verification evidence or client legal approvals were supplied in the inspected specification kit. Do not infer that these resources exist or are authorized.

## Current workflow decisions (supersede historical kit instructions)

- Claude Code is the orchestrator controlled directly by the project owner.
- Codex CLI and Kiro CLI are delegated engineering agents; actual invocation/delegation support must be verified.
- The owner initially handles both frontend and backend work.
- The friend joins later, primarily taking pending frontend/UI tasks from a documented handover.
- Antigravity and AI Dev Kit are not in the active workflow.
- One shared Git repository; isolated branches/worktrees for concurrent agent tasks.
- Heavy instructions live in root `README.md` and repository docs. Chat is only for short resume instructions, decisions and reports.

## Historical conflicts and precedence

- The v1.5 and v1.3 source documents contain older planning-only/start-gate and agent-ownership language. The owner later explicitly authorized development and changed the workflow. Current root `README.md`, `CLAUDE.md`, `AGENTS.md` and current decision files govern.
- The old v1.3 worktree script assumes permanent `claude-ui`/`codex-backend` assignments. It is preserved only as a legacy source; do not execute it. Use `scripts/add-agent-worktree.sh` only after inspecting it and confirming the repository/branch state.
- The original day-by-day schedule is a dated planning artifact. Rebaseline it against the real execution date; do not treat expired dates as future commitments.
- The v1.1/v1.3 and v1.5 schema models differ in naming and grouping. Reconcile them in `docs/SCHEMA_RECONCILIATION.md` before writing the first migration.

## Integrity

`docs/source/SHA256SUMS.md` records SHA-256 hashes and byte sizes for the preserved source ZIPs and standalone originals. The v1.5 nested ZIP, v1.3 kit, v1.1 kit/standalone blueprint, and v2.0 artifacts were checked against their uploaded originals and found byte-identical before final packaging.

## Verification limitation

This verification confirms the supplied documentation pack and its archives. It is not a verification of an application, client website, production database, credentials, legal compliance, payment settlement, security posture or deployed service. Those require access and direct evidence during project execution.
