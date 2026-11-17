# Active SureCure Visit context

Master execution pack: v2.3 (setup done 2026-11-17; no app code; waiting for explicit start). Root `README.md` is the only master execution prompt. Heavy instructions remain in README/docs, not chat.

Claude Code is the lead orchestrator and the only AI CLI directly controlled by the project owner. Claude coordinates Codex CLI and Kiro CLI through verified supported mechanisms. Antigravity and AI Dev Kit are removed. The owner initially directs both frontend and backend; the friend joins later for pending frontend/UI work.

At resume: verify the actual app/repository and Git state; read `docs/MODEL_SELECTION.md`, task ledger, feature status, session log, decisions and handover; inspect source archives/specs; complete schema reconciliation before migrations. Do not assume work is complete without commits/tests. Never record secrets or patient data here.

## Resume point (2026-11-17, end of setup session)
Main repo `C:\SURECUREVISIT` (main, develop). Worktrees (siblings in C:\):
- `SureCureVisit-claude-F01` task/F01-foundation: Next.js foundation, lint/typecheck/test/build pass, UNCOMMITTED, unreviewed.
- `SureCureVisit-codex-S00` task/S00-erd-draft: Codex drafting docs/SCHEMA_RECONCILIATION.md + docs/CANONICAL_SCHEMA_DRAFT.md. Prompt: TASK_S00.md (git-excluded). Run by owner in a visible Codex tab.
- `SureCureVisit-kiro-R01` task/R01-source-audit: Kiro writing docs/SOURCE_AUDIT_R01.md. Prompt: TASK_R01.md. Run by owner in a visible Kiro tab.
Next: check each worktree (`git status`, `git diff`), review output, Kiro challenges the S00 draft, owner approves ERD, then migrations (I01). Supabase deferred: use local Supabase CLI later (not installed).
Owner rules: no commit/push unless asked (initial commit was approved). Codex headless `exec` was blocked; use visible tabs. Kiro login account should be checked.

## Latest I01 worktree handoff (2026-11-17)

- This worktree: `C:\SURECUREVISIT\.worktrees\codex-task-I01-auth-rls`, branch `task/I01-auth-rls`, HEAD/base `d532f09b6f8d091a1843485f11ab3cd3ec3b549e`; changes uncommitted. This entry supersedes the older setup-only resume point for I01.
- Existing identity/org migration and empty synthetic seed verified with `npx supabase db reset` (exit 0) against local `surecure-visit`, `127.0.0.1:54322`. Stack was already running and must remain running; Kiro owns config/setup.
- Fixed four pgTAP assertions by moving modifying CTEs to the top level. `npx supabase test db` now exits 0: 1 file, 96 assertions, `Result: PASS`. No migration rewrite. No app build per owner instruction.
- Evidence: `docs/TEST_EVIDENCE.md`; continuity: `docs/SESSION_LOG.md`; I01 ledger status awaits independent Claude review/integration. No secrets or real data used; no commit/push performed.
- Next: Claude reviews actual SQL/diffs and recorded results, coordinates integration, then assigns I02. Do not restart I01 implementation or infer production/browser/Storage verification from these DB tests.
