# Active SureCure Visit context

## Coordinator checkpoint (2026-11-20, Claude)

- **Handover (latest):** `main` = `develop` = `integ/all`; CI #65 green on `main`. Friend starts at `START_HERE.md` (setup, status, next steps). Superseded entry docs in `docs/archive/`; deleted branches in `docs/ARCHIVED_BRANCHES.md`; unverified UI merge on `wip/U01a-onto-integ`. Merge to `develop` (R-2) is done; the line below about waiting is history.
- `integ/all` HEAD `8590f23` (pushed). CI run #58 on `77971f2`: migrations apply, pgTAP 001-125 all pass. Doctor clinical DC03-DC14 (`feat/DC-clinical-core`, `feat/DC-extras`) merged; static gate after merge: typegen, tsc, eslint exit 0, Vitest 799 pass/2 skip, `next build --webpack` exit 0.
- CI-forced fixes: 001720 lab CASE, 001591 oidvector index, 002000 alias (all three unapplied before, fixed in place); 002200 coverage review reads; 002210 B01 `patient()` scope check (was `a.scope=a.scope`); test fixtures in `test(db): CI round 1-5` commits.
- Left: `tests/rls/run_*_concurrency.py` runners (not in CI), owner questions (DC handoffs, OWNER_DECISIONS_PENDING), UI U01. Merge `integ/all` -> `develop` waits for the owner (R-2).
- Read CI without login: run page `main` text shows the error annotation from `scripts/ci-annotate.sh`.

## N01 checkpoint (2026-11-20)

- Delivery gate: implementation/docs through `175b3f4b4aa03826f0a3fb0330bfd096b9038da4` are committed locally. Automatic approval review rejected the requested push because origin ownership/trust and exact-destination authorization were not established. Sanitized local config identifies `https://github.com/VishnuVardhan-719/confidentinal_sc`, branch `feat/N01-notifications`; no embedded URL credential. GitHub CLI unavailable, no ownership claim made. No push occurred. Obtain explicit approval for this exact destination before retrying; do not bypass the rejection. Later documentation-only commit records this gate; use current HEAD for final SHA.

- Authority: `C:/tmp/scv_logs/codex_n01.txt`; worktree `codex-n01`, branch `feat/N01-notifications`, base `integ/all` `51c7439`. Feature-branch commit/push explicitly authorized. No Docker/Supabase command, DB operation, install, `.env` access, activation, deployment, model/effort change or shared-branch push.
- Authored six migrations `002110–002160`, fixture/suites100–109, four-case concurrency runner, user routes/service/strict validation and log-only dispatcher/templates. All SQL: **authored, DB NOT EXECUTED**. Notification gates OFF; category codes guarded; owner-only reseed after category merges. C01 proposal ledger bridge and audit-bound withdrawal normalization reconcile actual built functions with the design.
- Static evidence: full Vitest278 passed/2 pre-existing skipped; N01 39 tests/5 files; Next typegen, standalone tsc and full ESLint exit0; Webpack production build exit0, all six N01 paths dynamic. Exact teammate commands are recorded in task evidence/handoff. Python syntax/TOC filter/help/no-execute guard checked without loading DB helpers.
- Read-only SQL/app reviews corrected audience parity, expansion lock order, shared-template test oracles, collapse fixture ordering, duplicate staff fixture, managed-schema runner restore and dispatcher lease batch timing. No migration/test execution or UI acceptance claimed.
- Handoff: `docs/handoffs/N01_codex_2026-11-20.md`. N01 stays IN_PROGRESS pending DB/RLS/races/category integration/UI. Shared suite023's four-category registry assertions need coordinator scoping after N01 adds its own keys; original suite untouched. Use final branch HEAD/remote ref for commit SHA.

## P01a SQL checkpoint (2026-11-19)

- Authority: `C:/tmp/scv_logs/codex_p01a_sql.txt`; branch `feat/P01a-sql`, base `integ/all` `5f94c98`. Commit/push authorized only to this branch. No .env access, installation, DB/Docker operation, other-worktree edit, merge or activation.
- Authored migration `20261117002000_p01a_payments.sql`, suites 070–089, `_p01_fixture.inc`, and `tests/rls/run_p01_concurrency.py` (9 cases). Exact 14 app RPC signatures preserved; no app change. P01a only; no gateway/webhook/test-mode objects. Finance grants nobody; pay-after and paid gates OFF.
- Shared SQL 001550–001590 and fixture read-only from `kiro-shared`; not copied here. Preflight requires shared objects. Claude has NOT said “shared merged”; no SQL/RLS/race execution. Future runner requires explicit flags, local target validation and common 30-minute DB lock, then scratch-only replay.
- Decisions: preserve seven shared capabilities + two finance; retain private fail-closed settings because shared read/closeout gates differ; permit collector self-void only; permit finance disputed-claim confirmation; closed review/resolution reasons reuse app list; exception cursor uses raised_at; missing terminal backfill event blocks; doctor-only until category final provenance. Private typed-time primitives support deterministic boundary tests while API callers can never supply time.
- Evidence: Vitest exit 0 (228 passed/2 skipped, 15 files passed/2 skipped); tsc exit 0; targeted and full ESLint exit 0; webpack production build exit 0. Default Turbopack build fails to resolve Next through existing node_modules junction. Structural checks match all signatures and 20 suite TAP/include contracts; Python parsing/help/no-execution guard pass. Final commits recorded by branch HEAD and final response.
- Independent review corrected OFF-gate direct SELECT leakage, unbounded worker history, monitoring-role barrier, overlapping zero-price fixture, credential isolation and premature immediate constraints. All suites now force deferred checks only at their final success boundary. P01 remains IN_PROGRESS until DB acceptance; see `docs/handoffs/P01a_sql_codex_2026-11-19.md`.

## P01a application checkpoint (2026-11-19)

- Current task authority: `C:/tmp/scv_logs/codex_p01app.txt`, narrowed by the owner's later scope correction relayed from Claude: ONLY P01a section 7/12 application adapters. D-14 option A applies. P01b webhook/order/checkout/HMAC/gateway reconciliation, paymentsTestMode and Razorpay env entries are excluded. No such code was implemented.
- Worktree `C:/SURECUREVISIT/.worktrees/codex-p01app`, branch `feat/P01-app-layer`, base `integ/all` at `f549ad3`. Commit/push explicitly authorized only for this feature branch. No migration, DB/Docker command, installation, other-worktree edit or release operation.
- Implemented default-off `payAfter` / `FEATURE_PAY_AFTER`, strict Zod inputs for all 14 P01a RPCs, typed service with scoped/sanitized errors and string paise, and 14 bearer-session route adapters. Authoritative authorization, atomic balances, versions, paid gate and durable idempotency await SQL.
- Verification: route type generation exit 0; standalone tsc exit 0; changed-file ESLint exit 0; full Vitest 228 passed/1 skipped (75 P01a tests). Fresh read-only review: no Critical/Important findings; deferred Minor is non-money response-shape validation after SQL contracts finalize. Default Turbopack build failed on the dependency junction; Webpack failed on denied existing Geist font downloads. Build remains unverified. Vitest must use `npx.cmd --no-install vitest run --configLoader runner --cache=false` to avoid junction cache writes. Do not install dependencies.
- Implementation/handoff is prepared for the explicitly authorized feature-branch commit/push; use branch HEAD and remote ref for its final SHA. Integration, SQL and release are not authorized by this task.
- Exact RPC names/arguments, provisional return types/enums/cursors, API bodies, scope limits and evidence: `docs/handoffs/P01a_app_codex_2026-11-19.md`. Overall P01 remains IN_PROGRESS because SQL/RLS/worker scheduling/activation are pending; shared contract reserves `20261117002000..002099`, suites `070..089` and controls SQL authoring order.


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


## P01 design v1.2 checkpoint (2026-11-19)

- Authority: `C:/tmp/scv_logs/codex_p01.txt`; docs only, with explicit commit/push authorization for `task/P01-design-v1.2` only. Base `integ/all` at `e7165fda4221127bcd2b59aefc1fde8a9cfcf15e`.
- Deliverable: `docs/specs/P01_payments_design_v1.2.md`, revised from `origin/task/P01-design:docs/P01_DESIGN.md` at `a1c32fb80a74e1a8961e546089c943cc92928088`. Read review_P01.md and merged migrations 001000 through 001500; no missing-friend-migration blocker remains.
- L10 closed in design: private bounded historical-report intake, no ordinary collector authorization bypass, immutable provenance, durable finance exception and disputed hold even when Q04 grants nobody finance rights. Includes suspension/expiry preventing an in-progress doctor visit from completing. No paid/gateway effect.
- L11 closed in design: public doctor RPC coverage separated from guard-preserving owner fixtures for no-show/interruption and deferred expiry/non-doctor paths; no DB test execution or four-category acceptance claimed. I1 closed in design: future evidence requires actor/object/purpose-bound 60-second tickets and per-read authorization audit; no signed URLs; existing staff-download restrictions preserved.
- Exclusive future P01 migration block 20261117002000..20261117002999; P01a 002000, separately approved P01b 002100. No migration created or run. D-14 remains OPEN; recommend P01a first/P01b deferred, with alternatives and consequences recorded in the design. Q03/Q04/live gates remain unchanged.
- Verification: document contract checks passed (12 checks: structure/version/base/source paths/review closures/reserved block/stale assumptions/owner options/test paths/late-report hold/evidence rules/payment separation). Reviewed text diff against v1.1 and corrected formatting. Staged whitespace check passed. Required `npm run build` was attempted and failed before compilation: no node_modules, `next` not recognized. No dependency installation, DB/Docker command, application code, secret handling or other worktree edit.
- Handoff: implementation remains PENDING; this is a design deliverable only. Claude should review the design and assign P01a on the merged backend; D-14 is a separate owner decision. Commit/push verification is reported by the task's final Git SHA; this checkpoint deliberately does not embed its own commit hash.
