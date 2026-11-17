# Claude Code CLI + Codex CLI Collaboration Policy

**Planning only.** Coding begins only after project owner says **START**. Antigravity is **editor only**, never used as a third AI agent. One integrated repository with separate worktrees after first foundation commit.

## Team assignment

| Responsibility | Primary | Peer reviewer |
|---|---|---|
| Full UX, 3 languages, marketing pages, branded design, Three/Anime | Claude Code CLI | Codex CLI |
| Patient and doctor UI, consultation forms and status | Claude Code CLI | Codex CLI |
| Supabase schema/RLS/transactions/OTP, auth, booking state machine | Codex CLI | Claude Code CLI |
| Payments/webhooks, realtime and secure file/API implementation | Codex CLI | Claude Code CLI |
| Test automation and security negative cases | Codex CLI | Claude Code CLI |
| Accessibility, screenshot/browser/UX testing | Claude Code CLI | Codex CLI |
| Contracts, merge, production migration and releases | **Single designated integrator with client approval** | Other CLI cross-review |

## Rules

- Before parallel work: one clean Next.js foundation, lockfile, architecture choice, typed API contracts and initial schema ownership.
- Keep separate Git worktrees/branches (e.g. UI and backend); each CLI reads root `CLAUDE.md` / `AGENTS.md` and same latest authoritative docs.
- **Codex is sole owner for migrations**, unless explicitly handing off. Claude never invents a parallel schema; updates agreed types after contract change.
- UI and API communication comes from typed contract. No fake server success, no hardcoded demo verified patients/doctors as production listings.
- Each feature task: spec → test plan → change → lint/typecheck/test/build → negative authorization tests when relevant → peer review → merge by integrator → staging replay.
- No overlapping edits to root config, lockfiles, migration file, same component. Claim ownership in tracking doc; one agent handles shared dependency/version changes.
- Both CLIs may perform local development actions/autonomous package installation as requested, but no unsafe paid production actions, patient export or irreversible changes without release safeguards.
- Permission to work does not certify safety; production deploy only after operational and technical gates. Don't rely on automatic agent-to-agent chat: communicate via commits/contracts/review notes.

## Handoff template (for future execution, not prompt)

Task ID; owned files; changed API/schema; tests run with actual pass/fail output; known failures; security review status; branch/commit ID; migration prerequisites; next dependency and needed reviewer. Report 'implemented' separately from 'verified' and 'production enabled'.

## Workflow phases

1. **Foundation integrator** scaffolds one app and first commit (not yet started).
2. Worktree isolation and agreed task slicing.
3. In parallel: Claude owns UI, Codex owns schema/services; both use versioned shared contracts.
4. One integrator merges tested slices, not two independent main-branch pushes.
5. Staging integration and formal release checklist; deploy live only after client approval.
