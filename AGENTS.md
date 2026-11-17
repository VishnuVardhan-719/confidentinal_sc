# SureCure Visit — shared engineering agent contract

**Read root `README.md` first.** It is the master project prompt and controls product execution, model/effort selection, phase order, agent governance and release gates. Read `docs/MODEL_SELECTION.md` before changing any model/effort setting. This file is a concise shared contract for Claude, Codex and Kiro.

## Current roles
- Claude Code: lead orchestrator, task assigner, reviewer and integration coordinator.
- Codex CLI: delegated engineering agent for implementation, tests, database/security work and independent review.
- Kiro CLI: delegated engineering agent for specs, architecture, implementation, tests and review using actually available Ultra-tier capabilities.
- Project owner: human controller of Claude and final decision-maker; initially directs and performs both frontend and backend work.
- Friend: later human contributor, expected to take pending frontend/UI tasks through explicit handover.
- Antigravity and AI Dev Kit: not in active workflow.

Do not follow obsolete instructions assigning Claude permanently to UI and Codex permanently to backend. Claude orchestrates all agents. Task ownership is assigned ticket by ticket.

## Product/stack invariants
SureCure Visit is a real Indian healthcare marketplace at `surecurevisit.in`; legal business name is unconfirmed. Six roles: patient, doctor, lab, ambulance, caretaker and admin. Individual providers and organizations have scoped memberships. Patient selects provider; provider sets prices and manually accepts. Only verified providers with actual service coverage may be publicly bookable.

Approved direction: Next.js App Router, strict TypeScript, Tailwind/custom shadcn/ui, Zod, Supabase PostgreSQL/Auth/private Storage, SQL migrations/generated types, Vitest, Playwright, GitHub CI and Vercel subject to client ownership/approval. One modular monolith. No unapproved stack changes or vendors.

## Security and business invariants
- Synthetic data only; no real patient records in prompts, agent sessions, fixtures or logs. Never print or commit secrets.
- RLS on all exposed tables and storage; deny by default. Enforce authorization server-side and in DB. No self-granted admin roles or client-side service-role key.
- Verify owner, role, active org membership, provider verification and assignment on every sensitive mutation.
- Private clinical/verification files only; authorize each signed URL issuance; short expiry.
- Booking price is server-derived and snapshotted in integer paise. Use UTC, idempotency, atomic transitions, version checks and DB-level resource overlap prevention.
- Booking and payment states are separate. Never trust browser price, role, status or paid state.
- Payment webhooks require signature/amount/currency verification and deduplication. Pay-after is distinct from gateway payment.
- Emergency dispatch, clinical records, live payments, GPS, pharmacy, subscriptions, recurring billing and payouts remain disabled until explicit gates pass.
- No fake providers, reviews, credentials, coverage, payment success or emergency ETAs.

## Task isolation and integration
Every task requires ID, agent, branch/base commit, exclusive file scope, dependencies, contract, acceptance criteria and tests. Use separate worktrees for concurrent coding. No overlapping file edits, no simultaneous migration authors, no shared mutable dev DB. Never edit another agent's worktree. Review actual diffs and test output. No force push, destructive reset or blind conflict resolution.

Claude coordinates integration. Agents commit only their assigned feature branches. Merge only after review and tests. `main` remains stable. One person controls shared migrations and release operations.

## Completion evidence
A task is not done because an agent says so or a UI renders. Require actual lint/typecheck/unit/integration/E2E/RLS tests as applicable, changed-file review, migration notes, security implications and honest limitations. Update the task ledger and handoff docs.
