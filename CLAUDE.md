# SureCure Visit — Claude Code project instructions

**Primary authority:** Read the complete root `README.md` before substantial work or at every new session. It is the master execution prompt and supersedes older role assignments in this kit.

## Current operating model
- Claude Code is the lead orchestrator and integration coordinator.
- Codex CLI and Kiro CLI are delegated engineering agents, controlled/coordinated by Claude through supported mechanisms.
- The project owner is the human controller of Claude and final decision-maker.
- The owner initially owns BOTH frontend and backend development direction/work.
- A second human developer joins later, primarily taking pending frontend/UI work through a documented handover.
- Antigravity and AI Dev Kit are removed from the active workflow.

## Mandatory session start
1. Read `README.md`, `AGENTS.md`, current task ledger, decisions, session log and handover.
2. Inspect Git status/branches/commits and preserve all existing work.
3. Verify actual Claude/Codex/Kiro CLI versions, supported model and effort settings, permissions and delegation mechanisms. For Fable 5.2, verify Claude Code v2.1.321 or later. Follow root README and `docs/MODEL_SELECTION.md`; never invent unavailable models/settings or use xhigh/max mechanically.
4. Read source inventory and relevant product/architecture specifications.
5. Report verified status briefly, then continue the highest-value unblocked task. Do not restart completed work or spend the session only planning.

## Core engineering constraints
- Next.js App Router, strict TypeScript, Tailwind, customized shadcn/ui, Zod, Supabase PostgreSQL/Auth/private Storage, SQL migrations/generated types, Vitest, Playwright and GitHub CI.
- Single modular monolith. No unapproved framework/vendor substitutions.
- Six roles: patient, doctor, lab, ambulance, caretaker, admin. Organization staff memberships are scoped.
- RLS and server-side authorization, deny by default. No self-granted roles or browser service-role keys.
- Synthetic data only. Never expose patient data, secrets or credentials to any AI agent or logs.
- Patient chooses provider; provider sets price and manually accepts. Integer paise, UTC timestamps, immutable price snapshots, idempotent requests, atomic state transitions, resource overlap prevention and separate booking/payment states.
- Live payments, emergency dispatch, clinical records/prescriptions, pharmacy, subscriptions, GPS and payouts stay disabled until their gates pass.
- No fake listings, credentials, reviews, availability, prices, coverage, payment success or emergency ETA.

## Agent execution
Claude assigns precise task IDs, branches/base commits, file ownership, dependencies, contracts, acceptance criteria and tests to Codex/Kiro. Use separate worktrees for concurrent agents. Never allow overlapping edits to the same files/worktree. Verify actual diffs, commits and test output; agent summaries are not proof. If native delegation is unavailable, use supported CLI processes or report the limitation honestly.

## Integration and permissions
Routine local coding, tests and feature-branch commits may proceed autonomously within project scope. Never force-push, destructively reset/clean user work, expose secrets, migrate real patient data, enable live charges, alter production/DNS or deploy production without the approvals and gates in `README.md` and `docs/PERMISSIONS.md`. The owner remains final approver for material decisions and sensitive operations.

## Required continuity
Keep `docs/IMPLEMENTATION_TASKS.md`, `docs/FEATURE_STATUS.md`, `START_HERE.md`, `docs/SESSION_LOG.md`, `docs/TEST_EVIDENCE.md`, `docs/DECISIONS.md` and `docs/RISKS_AND_BLOCKERS.md` current. Never end a substantial session with important state only in chat.
