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

## B01FIX resume checkpoint (2026-11-18)

- Current worktree: `C:/SURECUREVISIT/.worktrees/codex-integ-b01fix`, branch `integ/b01-fixes`, base `e8a71ed`, WIP `f8d5cf3` already on origin.
- Latest authority: `C:/tmp/scv_logs/codex_b01_resume2.txt`. Finish Q06/H1/H2/H3/M1/M3, make all existing suites 001-014 green, then commit/push this feature branch. This supersedes earlier no-commit/no-push instructions. Never start/stop Docker.
- Use only Stack A in `C:/SURECUREVISIT/.worktrees/kiro-integ-friend`, project `surecurevisit`, DB port `58422`. Acquire `C:/tmp/scv_logs/db.lock` as `codex-b01`; wait if younger than 15 minutes; release in finally. Copy only assigned migrations/tests to that worktree.
- WIP contains migrations 001000, 001100, 001200 and suites 010-014. Target worktree initially lacked 001200: it fixes the restrictive Storage INSERT guard and separates staff suspension capability. Confirm it actually applies on reset. Requires other agent's I02 migrations 00600-00660.
- Added local `supabase/tests/005_b01_booking.test.sql`: preserves the legacy suite but aligns future-booking detail/visit checks to H1, matching the existing 012 regression. No production SQL changes in this resume yet.
- Fresh lint exit 0; typecheck exit 0; unit tests 148 passed / 1 skipped; build exit 0. Independent static review found no concrete important bugs in migrations 001000-001200 or suites 010-014.
- First `db reset --local` failed with `HealthCheckTimeoutError` before application migrations. Docker temporarily returned HTTP 500, later recovered without lifecycle commands. Second reset applied ALL migrations through 001200, then exited 1 on Storage's final health check; Storage subsequently became healthy. Tests-only attempt exited 75 (`LOCK_BUSY`): `kiro-port` acquired the lock at 17:18:38 IST. Wait under the 15-minute protocol, confirm applied versions and run tests without another unnecessary reset. SQL success is NOT yet verified; do not commit or report DONE until verified. Details: `docs/handoffs/B01FIX_codex_2026-11-18.md`.
- Preserve pre-existing untracked `.context/run_stack_a.ps1` (it omits 001200). The new helper is session-only; commit the actual SQL test correction and task documentation, not unrelated files.
- 2026-11-18 19:41 IST Kiro takeover: pgTAP 001-005 and 010-014 PASS on Stack A (Files=10, Tests=10) with 000600-000670 and 001000-001200 applied. Committed and pushed on integ/b01-fixes.
