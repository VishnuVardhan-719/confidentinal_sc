# Agent Autonomy and Safety Boundaries

User has requested **high autonomy: everything allowed** for Claude Code CLI and Codex CLI work. This means unattended routine file editing, package installation, local tests/builds, branch commits, and designated scoped development migrations can be performed after explicit **START**, within assigned worktrees.

**No actual permissions are modified by this document.** Existing global CLI settings and workspace policies remain active until user changes them. Antigravity acts solely as an editor/inspector, not as a coding agent.

| Action | Policy after START |
|---|---|
| Read/edit own assigned repository files | Autonomous |
| Install vetted dependencies, run local lint/build/tests | Autonomous, dependency/license and lockfile review |
| Create feature branches and commits | Autonomous in assigned worktree; integration branch by integrator |
| Run synthetic-only dev/staging migrations | Autonomous within designated owner and tested migration process |
| Interact with developer-owned test services | Autonomous with limited credentials |
| Update shared API contracts | Coordinate with other agent and record change |
| Production schema changes | One integrator, backup/rollback, tests and recorded client release authorization |
| Domain DNS, live payment merchant, paid subscriptions | Client-controlled, coordinated production change and policy verification |
| Delete patient records, export private data, reveal credentials | Not justified by blanket autonomy; specific legal/data controller authorization and safety process |
| Emergency dispatch or medical prescriptions enabled publicly | Only when clinical, security and operational gates actually pass |

Before user says **START**: **planning only**. This ZIP does not install software, start CLIs, create cloud accounts, deploy an app or spend money.
