# Human-controlled multi-agent coordination

## Authority and ownership
The project owner is the sole human controller of Claude and final decision-maker. Claude Code is the lead orchestrator. Codex CLI and Kiro CLI are delegated agents. The owner initially starts/directs both frontend and backend. A second human developer joins later, primarily to take pending frontend/UI work. Antigravity and AI Dev Kit are removed from the active workflow.

Claude must inspect actual CLI versions, supported models/effort, hooks and delegation methods. It may use native delegation only if available; otherwise Claude should invoke the supported Codex/Kiro CLI processes in isolated worktrees. Ask the owner only when authentication or tool permissions require human action. Never pretend an agent ran or completed a task.

## Task assignment
Each ticket must include: task ID, objective, priority, assigned agent, branch/base commit, exclusive allowed paths, forbidden paths, dependencies, source docs, API/DB contract version, acceptance criteria, tests and handoff format.

The owner initially owns the product implementation across frontend and backend. Claude may delegate implementation tasks to Codex/Kiro. The future friend is not assigned work until they join. Keep frontend tasks independently handoff-ready.

## Isolation
One repository. `main` is stable; `develop` is integration; `feature/*` branches are isolated. Use separate worktrees for concurrent agents. Never share a mutable working directory or allow overlapping edits. One migration author at a time. Shared API/schema changes must be reviewed and communicated before dependent UI integration. Do not run shared staging migrations or resets concurrently.

## Agent handoff template

```text
TASK ID:
AGENT:
BRANCH:
BASE COMMIT:
COMMIT(S):
OWNED PATHS:
FILES CHANGED:
IMPLEMENTED:
NOT IMPLEMENTED:
API/DB CONTRACT CHANGES:
TEST COMMANDS:
ACTUAL TEST RESULTS:
SECURITY/PRIVACY NOTES:
BLOCKERS:
NEXT ACTION:
```

## Integration protocol
Agent works in its worktree → commits feature branch → Claude inspects diff and test evidence → independent review for high-risk code → merge to `develop` → full relevant CI/RLS/E2E → update task ledger and test evidence. Only authorized integrator merges `main` and controls releases. Never force-push, reset/clean user work or blindly resolve conflicts.

## Human communication
Claude reports meaningful completed work, verified tests, blockers, material decisions and next tasks to the owner. Routine local coding need not be interrupted for approval. Ask for approval for legal/business decisions, paid services, real data, destructive changes, production/DNS/payment actions and feature activation behind safety gates.
