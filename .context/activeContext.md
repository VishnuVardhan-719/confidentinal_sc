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

## FE10-12-data (Kiro D, worktree fe2-d, branch feat/fe2-d) - in progress
Phase 1 data layer: src/modules/{doctor,clinical,records}, src/fixtures/clinical, tests/unit/modules-clinical. B01 inspected: lowercase states, visit substates scheduled/en_route/arrived/service_started/service_completed, no OTP/verify-arrival, no clinical routes. Log mismatches in docs/frontend/REQUESTS.md (append only). No commit.
FE10-12-data DONE (uncommitted): 32 files in owned paths + docs/frontend/REQUESTS.md (created, append-only, 14 entries). lint/typecheck clean, npm test 66/66 pass (61 new). Ran npm ci (lockfile only) because worktree had no node_modules. Next: lead review + phase 2 UI.
Phase 2 (in progress, waiting for fe2-a UI merge): pre-UI logic done - clinical/editor.ts, conflict.ts, autosave.ts (+use-draft-autosave hook), finalize-flow.ts, loaders.ts; doctor/routing.ts, loaders.ts, decline + listAcceptResources. CR-fixes-D: all 5 valid and fixed with tests. 107 tests green, lint/typecheck clean. Pages not started (need src/components/ui, i18n).
2026-11-18: +view-models.test.ts (19), DC11 correctHealthFact (+2 tests), e2e skeleton tests/e2e/doctor-workspace.spec.cts (skipped; rename .ts after fe2-a). 128 tests green. REQUESTS 19-24 appended. Still waiting for fe2-a UI merge to build pages.
2026-11-18: XREVIEW-d.md written (cross-review of fe2-c/fe2-e, verified). E2E spec fleshed out as test.fixme (tests/e2e/doctor-workspace.spec.cts). XREVIEW-b D1-D8 all fixed: bearer token + redirect:error, ApiContext per request + appOrigin, deny-by-default fixture actor, production guard in fixture constructors, interim guard aligned, tolerant doctor DTO schemas, Retry-After HTTP-date, bounded amendment text. 145 tests green. REQUESTS 25-28.

# Active context (2026-11-18, FE v2 restart)
Owner rejected the old demo frontend (preserved on wip/frontend-pause-2026-11-18). Fresh build from develop per docs/FRONTEND_MASTER.md. Conventions: docs/frontend/CONVENTIONS.md.
Team (herdr terminals): t2d fe-a Kiro (worktree fe2-a, feat/fe2-a: FE01+FE02 foundation+public), t2f fe-b Kiro (fe2-b: identity/onboarding data layer), t2g fe-c Codex (fe2-c: marketplace data layer). Lead = Claude (commits, integration, review). Task files: C:/Users/Yashwanth/.claude-scratch-tasks/FE-{A,B,C}.md. Approval loop: .claude-scratch-approve.sh t2d t2f t2g.
Base commit 3174196 (feat/fe2-a). Backend PRs #1-#5 unmerged; adapters: http (real contracts) + fixture (labelled, blocked when APP_ENV=production).
Phase 2 (after A merged): auth/onboarding UI (B), directory/booking/patient dash (C), doctor/lab/ambulance/caretaker/admin dashboards, clinical editor, payments/support, i18n/a11y/e2e, adversarial review.
2026-11-18 PHASE2 pages in progress (fe2-a merged 926ed90). Built: doctor layout (AppShell+provider), guard (interim session FIXTURE_DOCTOR_SESSION=assigned|other in fixture mode; http=unauth), actions.ts, dashboard, requests(+detail accept/decline), visits(+detail travel/OTP/collection/proof), consultation editor (5 steps, autosave, conflict, sign), facts/photo panels, records/[id] (signed view, PDF, amendment), static pages. en doctor/clinical.json written; te/hi delegated. Next: messages test, te/hi, build, browser check, e2e.
2026-11-18 (fe-d replacement owner): XREVIEW-c P1/P2/P2 fixed (finalize-flow isOurAmendment + first-signing check + consultationId binding; draft-machine reconnect keeps terminal block/budget, retry_requested action, keep_local needs reviewedEditSeq + server version floor; autosave saveNow dispatches retry_requested). CR-fixes-D verified already in code. hi/clinical.json written (275 keys); te/hi unit labels localised. New tests: xreview-c-fixes (16), messages (16), ui-helpers (9). lint/typecheck/build clean, npm test 343/343. REQUESTS R-FE-D-29/30, REVIEW_NEEDED rows. Open: e2e spec still .cts test.fixme (not run, RAM/credit limits); patient dashboard (from fe-c2) NOT started, waiting for go-ahead.
2026-11-18 (fe-d): patient dashboard built (/[locale]/patient/dashboard, modules/patient-dashboard, patient.json en/te/hi, fe2-c modules vendored byte-identical, REQUESTS R-FE-D-31). CodeRabbit 0f4b8da fixes 1-7 done + coderabbit-0f4b8da.test.ts. Browser e2e deferred (R-FE-D-32). lint/typecheck/build clean, 363/363 tests. Committed on feat/fe2-d at orchestrator request.

# activeContext (fe-a on fe2-d, PHASE4-D3)

- Lint fix in tests/e2e/doctor-workspace.spec.ts done (fixture param `use` -> `provide`; axe call in dashboard test). eslint + tsc clean.
- Next: run doctor e2e ws-desktop-1280 against servers from .context/ws-serve.mjs (E2E_PORT=3379), fix failures.
- Then: patient-workspace.spec.ts, patient records/notifications, doctor availability schedule, te/hi, axe, commit.


- 68bfa44: doctor-workspace e2e 64/64 (ws-desktop-1280 + ws-mobile-390). Restart servers between runs (fixture world is mutated): Start-Process pwsh .context/restart-ws.ps1 [-NoBuild] then poll .context/restart.log for 'servers up'.
- Next: patient records/notifications + patient-workspace.spec.ts, doctor availability schedule.

- PHASE4-D3 DONE: doctor+patient workspace e2e 110/110, lint/tsc/vitest(374)/build green. Handoff: .context/handoff-fe-a.md. Open: overlap with feat/fe2-p 4aa02f8 (patient records/notifications).

- PHASE R7-D (C:/Users/Yashwanth/.claude-scratch-tasks/PHASE-R7-D.md): task 1 DONE d1a06f4 (public /verify proof check). All ws e2e 130/130. Next: task 2 consultation notes (doctor/consultations/[bookingId]).

## TASK REPORT - PHASE R7-D (fe-a, worktree fe2-d, branch feat/fe2-d; never pushed)
Status: tasks 1-4 DONE.
- T1 d1a06f4 public proof-of-visit check `/[locale]/verify`, `/verify/[code]` (src/modules/proof-of-visit). R-FE-D-33.
- T2 b50d67a consultation notes `/doctor/consultations/[bookingId]` (src/modules/consultation-notes): completed bookings only, draft -> sign-off, no autosave. R-FE-D-37.
- T3 9511e32 prescription drafts `/doctor/consultations/[bookingId]/prescription` (src/modules/prescription-drafts): template-only, "Draft - not issued", no issue action. R-FE-D-38.
- T4 835b02a doctor reviews `/doctor/reviews` (src/modules/doctor-reviews): read-only, moderation badges, rating/text only when published. R-FE-D-39.
All fixture-only behind FEATURE_CLINICAL (off unless "true"); http adapters return fail("gated"); fixture refused in production.
Evidence (final run): Playwright ws-desktop-1280 + ws-mobile-390, all workspace specs: 182 passed / 0 failed. tsc exit 0; npm run lint exit 0; vitest 26 files / 437 tests passed; npm run build passes.
Shared edits: src/i18n/messages.ts + global.d.ts (namespaces verify, consultationNotes, prescriptionDrafts, doctorReviews), playwright.config.ts WORKSPACE_SPECS, doctor layout (client namespaces + Reviews nav), shared visit page (post-visit link), proof card (check link).
Open: QR still not drawn (no approved library); reviews gated behind the clinical flag per the task file though not clinical; te/hi strings machine-written (REQUESTS R-FE-D-36..39); overlap with feat/fe2-p 4aa02f8 (patient records/notifications) still awaits a lead decision; tests hardened for load/time flakiness (redirect timeouts, IST-midnight count, hydration wait, sticky-bar poll).

## PAUSED STATE (R8-D, fe-a on fe2-d, branch feat/fe2-d; never pushed)
Done (committed):
- Step 1 82d151c: fixture "today" visits anchored to the IST day (onIstDayOf) + shared world rolls timestamps when the IST day changes (rollWorld); unit tests tests/unit/modules-clinical/world-days.test.ts; doctor dashboard e2e back to strict count 2.
- Step 2 34cf3aa: tests/e2e/hydration-race.spec.ts (holds JS chunks) reproduced the bug (3/3 controlled forms lost pre-hydration input); fix = src/components/clinical/use-hydrated.ts gating own controlled forms; /verify form now posts to route handler /[locale]/verify/check (HTTP 303, works without JS). Findings + proposed shared-control patch: docs/frontend/REQUESTS.md R-FE-D-40. 28/28 passed after the fix.
Half-done (WIP commit, step 3 a11y sweep):
- tests/e2e/a11y-sweep.spec.ts: every doctor route + /verify routes, en/te/hi, 390 + 1280, axe + one h1 + no overflow + no raw keys, plus denied and gate-off states.
- Fixes from the sweep: consultation editor page now renders PageHeader (h1); step rail nav min-w-0 and ol `relative` (sr-only status spans caused ~350px horizontal overflow at 390px); DC02 lock test waits for the input to be enabled (inputs disabled until hydration).
- Last full run before the fixes: 338 passed / 6 failed (those 6 are what the fixes address). The rerun after the fixes was interrupted by shutdown, so they are NOT verified yet. Also still to check: the "mobile 360px sticky actions" test failed once on mobile after the h1 header was added. Verify it passes now; if not, the header may push the field under the sticky toolbar (fix in the test's scroll or the layout).
Next steps:
1. Restart servers with a build: `Start-Process pwsh -ArgumentList '-NoProfile','-File','C:/Users/Yashwanth/fe2-d/.context/restart-ws.ps1' -WindowStyle Hidden -RedirectStandardOutput .context/restart.log`, then poll .context/restart.log for "servers up" (do not pipe the script; it hangs the tool shell).
2. `$env:E2E_PORT='3379'; npx playwright test --project=ws-desktop-1280 --project=ws-mobile-390 --workers=2 --reporter=line` (restart servers before each full run; the fixture world is mutated).
3. Fix any remaining sweep failures in own files; commit step 3 ("feat(r8-d3): a11y sweep ...").
4. Step 4: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`, full e2e; then a TASK REPORT listing commits 82d151c, 34cf3aa, the step 3 commit, and the step 4 results.
5. Stop servers on 3370-3383/3379 when done.
