# fe-q (continuing fe-c3 PHASE4-C3) - 2026-11-19T00:36:45
- Owner of task now: fe-q. State source: .context/handoff-t3j.md. WIP commit 7550c76 (booking-store).
- Plan: data layer (store wiring, addAddress, reschedule, slots, visitReason) -> journey.ts server factory -> routes /patient/book, /patient/book/[id], /receipt -> strings -> e2e booking-journey.spec.ts -> lint/typecheck/test/build -> browser run port 3360 -> commit.

# Active SureCure Visit context

## E2E specs / branch tests / component needs — 2026-11-18
- Owner explicitly requested pending Playwright specs under tests/e2e, uncovered booking/provider unit branches, docs/frontend/COMPONENTS.md needs for fe-a; no commit/push. Root package/config remains foundation-owned.
- Read FRONTEND_MASTER sections5/7/9/10/19/20, existing unit discovery and task route list. No Playwright package/config or COMPONENTS ledger present in current branch. Added .spec.mjs browser specs plus fixture-test helper and activation README; all cases test.fixme declarations pending routes/scenario/auth foundation. node --check passed initial files. Runner/browsers absent, so no browser execution claim.
- Browser specs: four-category directories/profiles, PIN/mobile Apply-Cancel-Clear/URL restoration, widths360/390/768/1280 and locales; eight-step category wizard, duplicate/uncertain submit, reapproval/conflict, profile/family/offline gates; patient navigation, booking/payment/clinical separation, cancellation, incomplete pagination, private record gates, notifications/support, guest/wrong-role/workspace/logout/privacy, 112 without JS.
- Harness requires local fixture app APP_ENV=test/FRONTEND_ADAPTER=fixture, externally seeded matching scenario and actual synthetic auth storage state; it does not seed data or bypass guards. Tests remain fixme until these dependencies and proposed selectors are real. No fake declarations/dependency shims or speculative fixture API.
- Added provider-branches.test.ts (22), booking-branches.test.ts (28), booking-loader-branches.test.ts (10): 60 new cases pass targeted. No application changes. Cover validation before network, input/response scope, clear/dispose late work, active HTTP abort, review mismatches, exception/uncertainty preparation/readback, authorized loader failures/pagination/payment/timeline validation and terminal grouping. No coverage percentage claimed (coverage provider absent).
- Created COMPONENTS.md with 13 prioritized needs for fe-a, typed state/ownership boundaries, design/a11y/i18n/selector/guard contracts and exact runner dependencies. Applied design-taste-frontend guidance to needs.
- Checkpoint: full suite14 files/175 tests pass; final typecheck exit0. ESLint mistook Playwright fixture callback named use for React19 use hook; renamed callback to provide (no behavior change), final lint exit0 with zero warnings/errors, including the observation-contract changes. Current HEAD owner-integrated 2e4eee2 includes earlier Phase2/CodeRabbit changes; this task diff remains tests/COMPONENTS/context only. Read-only review found duplicate/reconnect UI-only assertions insufficient to prove call counts. Added required external appObserver fixture contract (begin/settle/dispose), exact create/key/body/persisted-count assertions and delayed-completion draining; no fake probe/endpoint. Observer producer remains a documented activation dependency. Targeted re-review found no remaining important issues (read-only, no independent test runs). Handoff/evidence saved in tests/e2e/README.md. Final typecheck and all four node --check commands exit0; final lint exit0 with zero warnings/errors. All requested checks green. Browser specs remain fixme and were not run (Playwright package/config/pages/harness pending). Phase2 page implementation still awaiting owner foundation-merged message.

## CodeRabbit Phase 1 follow-up — 2026-11-18
- Read owner scratch CR-fixes-C.md and receiving-code-review skill. All 13 findings valid: eight runtime bugs reproduced in focused failing tests; five existing assertions strengthened. No commit/push or out-of-workspace edits.
- Fixed HTTP-date and bounded delta-seconds Retry-After (past dates clamp zero; invalid hints omitted); cancel unread HTTP error bodies without waiting on open stream/cancellation promise, preserving safe error if cancellation rejects.
- Resource/lab uniqueness compares UUID identity case-insensitively. Booking fixture get/timeline/decision lookup canonicalizes UUID; payment fixture summary/claim shares one canonical booking key/body. Provider HTTP get binds explicit ID without spread override. Notification rollback captures exact detached caller snapshot before schema strips UI fields.
- Strengthened notification readback success/item/time assertions, gated zero-fetch spy before construction, exact create request count, complete IST clock AM/24h match, known-status labels distinct from unknown fallback.
- Verification: full suite 11 files/115 tests passed; final typecheck exit0 after explicitly typing the provider fetch mock; lint exit0, zero warnings/errors; diff --check exit0. Handoff appended with all 13 dispositions. Independent targeted read-only follow-up: all 13 requested findings addressed, no remaining important issue; reviewer did not run tests. Kept existing opaque idempotency-key equality outside these requested fixes. Phase2 UI still pending foundation merge message.

## Active Phase 2 C — 2026-11-18
- Owner confirmed Phase 1 committed as 84d36cf on feat/fe2-c. Latest assignment: read PHASE2-common.md and PHASE2-C.md in owner scratch tasks; both read. No commit/push, package/global CSS/shared UI edits.
- Latest owner direction overrides common task's foundation-ready assumption: start non-UI now; wait for owner's message that fe2-a UI/shared/i18n foundation is merged before building pages. Actual src/components/ui, src/i18n, auth/requireRole absent at start. Current working diff only saved context from Phase 1.
- Owned Phase 2: category public routes (doctors/lab-tests/ambulances/caretakers), patient routes except onboarding; components directory/booking/patient; existing owned modules and tests. Pages later require translations, guards, responsive/browser/E2E evidence.
- Implementation plan: (1) validated in-memory wizard reducer with eight-step gating, downstream invalidation, lock during unresolved submit, IST schedule conversion; (2) directory URL/filter draft/card/profile models and cancel-superseded controller; (3) stable-intent submission controller with double-click dedupe, same-key retry after uncertain outcomes, known-ID refetch and offer-change review; (4) request-scoped public/private loaders with injected real authorization/API boundaries; (5) unit/contract tests, actual lint/typecheck/test/build, independent review. No speculative API endpoints; known backend policy/grant gaps stay fail-closed.
- APIs remain Phase 1 createXApi factories, ApiResult return types. Server loaders must receive request-scoped APIs/authorization; no server singleton of private data, no cached private data, no PHI in URL/storage/logging. New POST outcome cannot be inferred from booking list heuristics.

### Phase 2 non-UI checkpoint
- Implemented eight-step transient wizard reducer; downstream invalidation, review consistency, revision checks, explicit IST-to-UTC scheduling, locked uncertainty and changed-offer reconciliation. No storage/URL persistence of private drafts.
- Submit controller: same-promise double-click dedupe, one UUID key/body per intent, no automatic retries, unknown-outcome retries preserve key/body, known-ID retries GET only, later denial cannot erase prior uncertainty, full snapshot matching before receipt, disposal on session changes. Missing verified offer/policy prepare callback gates before POST.
- Directory public URL/draft/card models, category-bound allowlist validation, cancel-superseded external store with stable frozen snapshots; abort signal passed through existing ProvidersApi HTTP/fixture adapters.
- Added public scoped directory/profile loaders and private request-scoped booking loaders requiring an injected real patient authorization function per call. Payment/timeline remain separate gated panels; allowlisted summaries bound to booking IDs. Patient list explicitly paginated; next visit withheld unless first page proves complete.
- Test-first regressions reproduced before fixes; final full suite 10 files/106 tests passed. Final typecheck exit0; production build exit0, existing static routes generated. Final lint exit0, zero warnings/errors. Handoff and append-only REQUESTS updated with integration boundaries.
- Independent read-only marketplace_review found payment-projection/ownership and truncated-next-visit issues. Both fixed with regressions; targeted re-review found no remaining important issues. No reviewer edits/test execution.
- Still awaiting owner message that fe2-a UI/shared/i18n/auth foundation is merged. No route pages/components, global CSS, package/lock changes or git commits/pushes. Existing task/contract gaps stay gated.

## Active delegated task — 2026-11-18 FE07/08-data
- Codex C; current worktree only, branch feat/fe2-c, base 3174196adf512a4fde8011ca699a66f9b3fcf99e. No commits/pushes.
- Assignment read from C:/Users/Yashwanth/.claude-scratch-tasks/FE-C.md. Phase 1 pure TypeScript data layer only; no UI, routes, package changes or other agents' modules.
- Owned: new src/lib/api files (never change result.ts/mode.ts), src/lib/format, modules providers/bookings/payments/support/notifications/catalog, fixtures/marketplace, tests/unit/modules-marketplace. REQUESTS.md append-only exception for contract mismatches.
- Read README, AGENTS, frontend conventions/master relevant sections, API/business/booking/schema docs, coordination handoff. Existing ApiResult and adapter mode must be reused.
- Inspected read-only backend branch stats and files: C01 public catalog GET /api/catalog and /api/catalog/:providerId require category/PIN, return snake_case service rows with decimal-string paise; /api/providers is private onboarding. B01 create returns {id}, decisions {version}; list {items}, detail {booking}; optimistic expectedVersion and resourceIds required. No timeline/support/notification/payment read routes verified yet.
- Plan: transport/format/schema foundations + failing unit tests; providers/catalog wire projection and fixtures; booking wizard/state/actions/adapters; minimal payment/support/notification adapters; run lint/typecheck/test; review and handoff. All unapproved HTTP capabilities fail gated rather than speculative requests.
- Implementation: transport/format/catalog/provider/booking/payment/support/notification modules and synthetic fixtures created. First test run failed on missing imports; initial 31 passed. Added contract regressions: six reproduced failures fixed (URL traversal; actual production override; four-category fixture mapping/versioning). Current marketplace suite: 59 passed. Typecheck passed twice. Historical checkpoint only; final verification is below.
- Backend refs: B01 e8a71ede046ec88cde71cf243adc54b1e64460ac, C01 373251fd40d596a66767bdef934b71e8f69558a7. REQUESTS.md appended with route/policy/details/grants/timeline/payment/support/inbox contract deltas. HTTP gaps explicitly gated.
- Final verification: lint exit0, zero warnings/errors; typecheck exit0; npm test exit0, 6 files/74 tests passed (69 marketplace tests). Independent read-only review marketplace_review (gpt-6.1-sol/high): no critical/important issues, no edits, tests not independently rerun. Deferred minor: preseeded accepted/declined/cancelled fixture version metadata still version2; fix before Phase 2 scenario UI tests.
- Handoff saved in owned path src/modules/catalog/FE07-08-HANDOFF.md using coordination template; REQUESTS.md records all integration gates. No UI, routes, backend, dependency manifest/lock or protected API base files changed. No commits/pushes. Lead transfers evidence to shared ledgers after review.
- Additional author regressions fixed and passed: safe-integer paise fractional precision; invalid UTC calendar date; operational completion independent of clinical activation; full cursor-component validation. Scope audit 40 TS files/1059 lines, no unsafe type suppressions; protected-path diff empty.
- Environment: Bash is WSL and requires escalation. Use /mnt/c paths for file reads, Windows Git /mnt/c/Program Files/Git/cmd/git.exe. node is Windows node.exe; npm command is node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js'. npm ci --ignore-scripts --no-audit --no-fund installed 400 locked packages; no manifest/lock edits. Large apply_patch calls slow; use Python heredoc with no raw backticks (outer shell expands them). All writes remain current directory.


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

## Cross-review and route inventory — 2026-11-18
- Active owner request: read-only review fe2-b identity and fe2-d clinical vs FRONTEND_MASTER/API_CONTRACTS; write exact scratch XREVIEW-c.md; draft docs/frontend/ROUTES.md. No commit/push. Current HEAD 4c95a00.
- Requested fe2-b/src/modules/identity absent; actual identity code is auth/onboarding/organizations/verification. Sibling files are read-only. Current C app only root scaffold, no locale/private pages.
- Investigating reconnect authorization retry, stale keep-local conflict review, amendment recovery identity/content and missing session refresh. Reproduction probes will run from current directory, never sibling worktrees.
- Completed: four findings (amendment-content/intent recovery P1; reconnect retry authorization P2; stale keep-local review P2; missing refresh flow P2). Three clinical source probes reproduced; identity source-search backed. Exact requested scratch report written/byte-verified. ROUTES.md has 121 unique catalogue routes + six root aliases, locale/role/org/resource/feature gates, and readiness promotion rules. All pages pending rather than falsely FIXTURE-ready.
- Validation: typecheck exit0; Vitest14files/175tests pass; probe ESM conversion fixes lint require-import violations; final lint rerun completed exit0, zero warnings/errors. Sibling source untouched. No commits/pushes.

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

## Kiro fe-c2 (BRIEF-C2 + USER-REQ-1 B/C/D) - 2026-11-18
- Replaced Codex. Cross-review C1-C5 verified already done in 8625eec (cross-review-fixes.test.ts 26 pass). Baseline lint/typecheck/test green (358).
- Owner steering: USER-REQ-1 B (doctor search), C (LocationPicker), D (booking gate) BEFORE BRIEF-C2 pages.
- Done (data layer): http.ts baseUrl + serverApiOrigin(APP_ORIGIN); providers/doctor-search.ts (taxonomy, URL schema, origin schema, results/suggestions); providers/doctor-api.ts (fixture search/suggest/get, http gated); fixtures/marketplace/doctors.ts (6 synthetic doctors); fixtures providers syntheticBookable; patient module (schemas/api/fixture/readiness: server-required items gate, n of N); tests doctor-search.test.ts. Marketplace tests 222 pass.
- Next: UI components src/components/directory (search combobox, filters, sort chips, list/map toggle w/ map gated, doctor card), src/components/booking/location-picker.tsx, readiness banner, /doctors route, strings in booking.json en/te/hi, REQUESTS/COMPONENTS updates.
- Patient guard: src/modules/auth absent on this branch; patient routes need seam requirePatient (fail closed) until fe2-b merge.
- 2026-11-18 checkpoint (USER-REQ-1 B/C/D done, BRIEF-C2 pages next): /doctors (search, filters, sort, map gated, near-me via server action) + /doctors/[id]; LocationPicker; ProfileReadiness + PatientGate (not yet mounted: /patient/bookings/new waits on auth guard). booking.json en/te/hi. REQUESTS R-C2-1..7, COMPONENTS, REVIEW_NEEDED appended. lint 0, typecheck 0, vitest 21 files/396 pass, build ok, e2e doctor-search.spec.ts 9 pass/3 skip (fixture, --workers=1 against next start :3201). Known: Next logs "new Date() while prerendering" during background revalidation of /doctors (SSR still correct); parallel e2e timed out on local server. .playwright-mcp/ (screenshots, untracked, not gitignored) left for lead to delete.
- Next: BRIEF-C2 pages for lab-tests/ambulances/caretakers directories, booking wizard (mount PatientGate + LocationPicker), patient workspace.

2026-11-18 PHASE2 pages in progress (fe2-a merged 926ed90). Built: doctor layout (AppShell+provider), guard (interim session FIXTURE_DOCTOR_SESSION=assigned|other in fixture mode; http=unauth), actions.ts, dashboard, requests(+detail accept/decline), visits(+detail travel/OTP/collection/proof), consultation editor (5 steps, autosave, conflict, sign), facts/photo panels, records/[id] (signed view, PDF, amendment), static pages. en doctor/clinical.json written; te/hi delegated. Next: messages test, te/hi, build, browser check, e2e.
2026-11-18 (fe-d replacement owner): XREVIEW-c P1/P2/P2 fixed (finalize-flow isOurAmendment + first-signing check + consultationId binding; draft-machine reconnect keeps terminal block/budget, retry_requested action, keep_local needs reviewedEditSeq + server version floor; autosave saveNow dispatches retry_requested). CR-fixes-D verified already in code. hi/clinical.json written (275 keys); te/hi unit labels localised. New tests: xreview-c-fixes (16), messages (16), ui-helpers (9). lint/typecheck/build clean, npm test 343/343. REQUESTS R-FE-D-29/30, REVIEW_NEEDED rows. Open: e2e spec still .cts test.fixme (not run, RAM/credit limits); patient dashboard (from fe-c2) NOT started, waiting for go-ahead.

## fe-int (feat/fe2-integration) - 2026-11-18
- Merged feat/fe2-d (0f4b8da) into fe2-c base 0331c6b; conflicts in activeContext/REQUESTS resolved keeping both sides; no message JSON conflicts. npm ci done. typecheck exit0. lint/vitest deferred by orchestrator (RAM). Browser e2e banned by user rule (REQUESTS R-INT-1). docs/PROGRESS_REPORT.md created. Next: merge feat/fe2-a, b, e when told.
- Merged feat/fe2-a 8decfb4 (conflicts COMPONENTS/REQUESTS/REVIEW_NEEDED kept both sides; JSON parses). Landing hero swapped to DoctorSearchBar+BookingIntl. typecheck exit0. lint/vitest still deferred; no browsers. Next: fe2-b, fe2-e when told.
- At f18d7cb: lint exit0, vitest 35 files/617 pass, build exit0 (138 pages). No integration fixes needed.

2026-11-18 (fe-d): patient dashboard built (/[locale]/patient/dashboard, modules/patient-dashboard, patient.json en/te/hi, fe2-c modules vendored byte-identical, REQUESTS R-FE-D-31). CodeRabbit 0f4b8da fixes 1-7 done + coderabbit-0f4b8da.test.ts. Browser e2e deferred (R-FE-D-32). lint/typecheck/build clean, 363/363 tests. Committed on feat/fe2-d at orchestrator request.
- Merged fe2-d 9b341f5 (00de692) and fe2-e 5a6bcf8 (2276679); conflicts in activeContext/REQUESTS/REVIEW_NEEDED kept both sides; message JSON parses, 0 duplicate keys. At 2276679: typecheck/lint exit0, vitest 58 files/929 pass, build exit0 (326 pages). No integration fixes needed. Pending: fe2-b.

## Active PHASE4-C3 (Kiro fe-c3) - 2026-11-19
- Task: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE4-common.md + PHASE4-C3.md. Doctor discovery + 22-step booking journey verified in browser (Playwright, port 3360). Commit on feat/fe2-c, never push. Don't touch src/app/[locale]/patient/bookings* (fe-p).
- Fast-forwarded feat/fe2-c 0331c6b -> feat/fe2-integration 1ac677e (ancestor, no conflicts) to get patient session (modules/patient-dashboard/session.ts), payments components, CSP.
- Plan: wizard route /patient/book (8 steps) + request page /patient/book/[id] (pending/accepted/declined, payment pay-after, confirm ref, cancel, reschedule, request receipt). Process-wide synthetic store src/fixtures/marketplace/booking-store.ts (globalThis); synthetic doctor 2 declines, others accept after FIXTURE_PROVIDER_RESPONSE_MS. Slots fixture API; patient addAddress; createBooking optional visitReason; BookingsApi.reschedule (http gated).
- E2E env: FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PATIENT_SESSION=self, PLAYWRIGHT_BASE_URL=http://localhost:3360.

## fe-q PHASE4-C3 session 2
- vitest 939/939, lint 0, build 0. Server 3360 started by me (pid in .context/server-3360.pid).
- Writing tests/e2e/booking-journey.spec.ts; fixed duplicate 'Step n of 7' in wizard.
- Servers still alive (mine, fe2-c): 3360 = node 18224 (parent chain 5328, started 17:32), 3361 = node 24188 (20:09). Netstat in this sandbox does not show listeners. Lead said do not kill by PID, so rebuilds go to a new port (3362).

## fe-q PHASE-R6-C (started after badedf0)
Plan: shared core src/modules/service-requests/{core,store,fixture-api,http-api}.ts; modules lab-orders, care-requests, ambulance-requests ({types,schemas,status,api,http,fixture,index}.ts) built on it.
Routes src/app/[locale]/patient/{lab-tests,caretakers,ambulance}/{page,request/page,requests/[id]/page,actions}.tsx.
UI src/components/service-requests/*. New i18n namespace "services" (edits messages.ts + global.d.ts, 2 lines each).
Synthetic: one declining provider per category; FIXTURE_PROVIDER_RESPONSE_MS delay; pay after service; ambulance = scheduled non-emergency only + 112 notice.
Server: port 3362 (old 3360/3361 servers of mine still alive, not killed per lead).
Order: lab -> caretakers -> ambulance; commit per sub-task.
- R6-C progress: lab data dff8a05, lab UI+e2e e4a2635 (10/10 e2e on dev server 3363). Next: caretakers, then ambulance. Dev server 3363 (mine, next dev).
- Prod server for R6-C now on 3364 (3362 stale, 3363 dev wedged; none killed per lead rule).
- R6-C DONE_VERIFIED at 5e40cda (see handoff-fe-q.md).

## TASK REPORT: PHASE R8-C (fe-q, feat/fe2-c) - DONE_VERIFIED
Scope: /patient/book/** (doctor booking), /patient/lab-tests/**, /patient/caretakers/**, /patient/ambulance/** and their components/modules.
1. Loading and error states (c6644a2): error.tsx in all 12 owned segments via ServiceRouteError (no raw error, digest only, Try again + Back to list, 112 link first on ambulance; heading takes focus). loading.tsx added where missing (book/[id], book/[id]/receipt). Per-tree layout.tsx gives the boundaries the `services` messages. New keys services.errorPage.* en/te/hi.
2. State audit (3860df9): every empty, error and gated state now has a next action (LinkAction): directory gated -> dashboard, directory error -> Try again + dashboard, request/status/receipt errors -> back/retry, no covered address / no open times / slots error -> Find another provider, doctor wizard empty times -> Back to doctors.
3. a11y sweep (9606c5b): tests/e2e/a11y-sweep-c.spec.ts, 22 tests x 390/1280: 20 static route states (incl. te/hi), 3 created status pages, 3 form error states. axe wcag2a/aa/21aa no serious/critical, no horizontal scroll, first Tab stop visible ring and on screen. Unit: route-error.test.ts (2).
4. Fixes: the sweep found no a11y violations. The full regression found 3 test-only timing races (page answered before first render, slot taken by another test, slow profile load), fixed in the specs (this commit).
Verification: tsc 0; lint 0; vitest 63 files 968/968; next build 0; Playwright on 3362 (--workers=2): a11y-sweep-c + service-requests + booking-journey + doctor-search = 89 passed, 3 skipped (HTTP-only/mobile-only), 0 failed.
Open: te/hi errorPage strings need native review (REVIEW_NEEDED `services`). Public /doctors pages not in this sweep (not in the listed trees).

## TASK REPORT: PHASE R9-C (fe-q, feat/fe2-c) - DONE_VERIFIED
1. Sweep extended (2de15c5): a11y-sweep-c.spec.ts now covers /doctors directory (default, speciality, sorted full list, type-ahead open, mobile filter sheet), profiles (bookable, fully booked, unknown) and te/hi directory and profile pages, plus storage-empty and query-key checks on every page. Finding fixed: Telugu public header overflowed by 12 px at 1280 (src/components/shared/public-header.tsx, fe-a file, logo margin xl:mr-6 -> xl:mr-2). Added error.tsx/loading.tsx for /doctors and /doctors/[id].
2. Adversarial audit (aa0966f): docs/frontend/AUDIT_C.md. FIXED: service-request get/list/cancel had no owner check (now only self/permitted family; test). FIXED: caretaker form offered start times a longer shift could not fit (hours now first, slots filtered by length; test). BLOCKED: requireRole not on this branch (fe2-b); interim server getPatientSession() enforced by a static test. OPEN: B01 booking DTO has no owner field (backend RLS must scope). PASS with tests: no browser storage, public-only query keys, integer paise + Indian format, UTC/IST, separate badges, no live payment calls, ambulance 112 banner and no dispatch. Note for fe-e: lab-views.tsx pricePaise/100 toFixed(2) in catalogue editor.
3. Hard-coded strings (this commit): scan of fe-c .tsx found no JSX text or literal aria-label/title/placeholder/alt; added a static guard test so new ones fail CI. Price-line labels in stored snapshots are data fallbacks shown through message keys.
Verification: tsc 0; lint 0; vitest 64 files 983/983; next build 0; Playwright on 3362 only (--workers=2): a11y-sweep-c + service-requests + booking-journey = 102 passed, 0 failed (doctor-search 6/6 earlier in this phase).

## fe-q PHASE R10-C
- Step 1: doctor-search.spec.ts on 3362 (build of b339b2c): 9 passed, 3 skipped (2 HTTP-adapter-only, 1 mobile-only on desktop), 0 failed.
- Step 2 plan: public /lab-tests list + /lab-tests/[id] from lab-orders fixture (src/modules/lab is fe-e's member-scoped ops API, no public read); proposed GET /api/labs in REQUESTS.md.

## TASK REPORT: PHASE R10-C (fe-q, feat/fe2-c) - DONE_VERIFIED
1. doctor-search e2e (23067e9): 9 passed, 3 skipped (2 HTTP-adapter-only, 1 mobile-only), 0 failed.
2. Public lab directory (d254385): /[locale]/lab-tests (GET filter by test name and city, lab cards with matching tests and prices, collection badges, empty/invalid/gated/error states with next actions) and /[locale]/lab-tests/[id] (tests with sample, preparation, report time and price; home/walk-in collection and fee; manual-acceptance note; "Request tests" to /patient/lab-tests/request; not-found state). Prices integer paise via formatPaise (en-IN grouping). FixtureNotice ("Synthetic data, not live"). pageMetadata canonical + hreflang; detail noindex. loading.tsx/error.tsx/layout.tsx per segment. Strings services.labDirectory en/te/hi.
   Data: src/modules/lab is fe-e's member-scoped ops API with no public read, so it was not touched; the directory reads the lab-orders synthetic labs (src/modules/lab-orders/directory.ts, mine; added collectionOptions). HTTP adapter gated; GET /api/labs and /api/labs/:id proposed in docs/frontend/REQUESTS.md.
   Tests: unit lab-directory.test.ts (5); e2e lab-directory.spec.ts (search/filter/detail/request link, canonical/hreflang/noindex, keyboard); a11y sweep +9 lab routes (incl. te/hi).
3. Verification: lint 0; tsc 0; vitest 65 files 988/988; next build 0; Playwright on 3362 only (--workers=2): doctor-search + lab-directory + a11y-sweep-c + service-requests + booking-journey = 135 passed, 3 skipped, 0 failed.
Open: sitemap.xml (fe-a) does not list /lab-tests yet; te/hi labDirectory strings need native review.

## TASK REPORT: R9-C2 adversarial review of fe2-int (fe-q, feat/fe2-c) - DONE
- Final doc docs/frontend/ADVERSARIAL_REVIEW.md against fe2-int b8e6215 (src identical to 02dc8bf). Read-only; no fe2-int edits; no servers started.
- Findings: 1 HIGH (synthetic cancellation policy "approved" in http mode, patient/book/[id]/page.tsx:20,127,130), 3 MEDIUM (fixture guard only checks APP_ENV; four paise formatters; hi plural `one` hard-codes 1 so 0 shows "1 day/attempt left"), 3 LOW (free-text q in URL, lab-views toFixed fixed on fe2-e c99a4c7 not merged, verify code in path).
- Clean: storage/logs, URL params, server-action guards, fixture imports, e2e support, i18n key parity, hard-coded strings (0).
- Next: HIGH fix is mine (fe-q owns /patient/book) - do it when lead assigns; MEDIUM 2 -> fe-a, 4 -> namespace owners.
## TASK REPORT: R9-C3 (fe-q, feat/fe2-c)
- Finding 1 fixed (journeyApis cancellationTerms; book/[id] page fails closed in http mode). tests/unit/adversarial-guards.test.ts (13): journey terms, fixture-import gating, paise toFixed and /100, hi plural zero, te/hi plural parity. Red run before fix/exemptions: 6 failed as expected. Exemptions: lab-views.tsx (fe-e, fixed on fe2-e), hi ambulance/lab (fe-e), hi common (fe-a) -> REQUESTS R-FE-Q-R9C3-1/2.
- Lint was red at HEAD from my .context/*.cjs audit scripts; added eslint-disable headers.

## TASK REPORT: R9-C4 (fe-q, feat/fe2-c)
- e2e on own prod build port 3365 (fixture): booking-journey 10/10, a11y-sweep-c --grep book 12/12, 390+1280, axe clean; no expectation changes. Server 3365 left running (pid in .context/server-3365.pid; started detached because tool background processes die).
- Review appended to ADVERSARIAL_REVIEW.md: fe2-e 0813f7b..9fc525c (E1 LOW soft-404 gated stories, E2 LOW paiseToRupeesString no int guard, E3 carried hi plurals); fe2-p 8f7ca31..8dc301a (P1 MEDIUM FIXTURE_ADMIN_SESSION moderator for every request + int conflict, P2 LOW no pagination, P3 LOW action args unvalidated).

## TASK REPORT: R9-C5 (fe-q, feat/fe2-c)
- Stopped own server 3365 (pid 27192, cmd "node node_modules/next/dist/bin/next start -p 3365", port listener verified). No servers of mine running now.
- Reviewed fe2-d b8e6215...f36ff67: D1 MEDIUM doctor-reviews lacks `withdrawn` -> page fails; D2 MEDIUM pending/rejected cards with exact date (re-identification); D3 LOW verify/check absolute redirect from Host; D4 LOW a11y disabled-until-hydrated with no status. REQUESTS R-FE-Q-R9C5-1.
- tests/unit/peer-guards.test.ts (4; 3 skip locally until files integrate). Proven vs export of fe2-d + fe2-p reviews: 4/4 pass; broken copies 3 fail. tsc 0, lint 0, vitest 67 files 1002 passed + 3 skipped.

## TASK REPORT: R9-C6 (fe-q, feat/fe2-c)
- Re-reviewed heads fe2-d 7c0065d, fe2-p 8dc301a, fe2-e 87bfb6b (read-only, .context/rev-audit.cjs). 0 hard-coded strings, 0 storage/console, no personal query keys, noindex gaps only on redirect-only pages; fe2-p carries old lab-views toFixed. New: R6-1 LOW signup RadioGroup controlled pre-hydration (fe2-e auth-flow.tsx:62,128); R6-2 LOW no area-layout noindex default. fe2-d 7c0065d closes the /lab-tests sitemap item.
- tests/unit/site-guards.test.ts (9): repo-wide strings, storage/console, personal query keys, money toFixed, private noindex, robots segments. Proven: 9/9 on fe2-c and the three head exports; broken copy 6 fail. tsc 0, lint 0, vitest 68 files 1011 passed + 3 skipped. No servers started.

## TASK REPORT: R9-C7 (fe-q, feat/fe2-c)
- Integration head ab6bedb (merges c 1a0db4f, d 7c0065d, e 87bfb6b, p 8dc301a). Clean export in .context/guard-int (deleted). site-guards 9/9, peer-guards 4/4 (none skipped), adversarial-guards 3 known fails -> recorded (dashboard UI_ALLOWED, fixture-actors GATED_BY_CALLER + importer check, hi auth.otp.attemptsLeft exempt) -> 27/27.
- docs/frontend/QA_CHECKLIST.md: setup, accounts, per-page checks C1-C12, patient 22 steps + flows + keyboard, doctor, lab, ambulance, caretaker, admin, gated routes (flags, contract-pending), e2e fixme list, known defects.
- tsc 0, lint 0, vitest 68 files 1012 passed + 3 skipped. No servers started.

## TASK REPORT: R9-C8 (fe-q, feat/fe2-c)
- Final pass on integration ab6bedb (incl. INT3 72d42cd). Full export (deleted; node_modules via junction, removed safely). fe-c guards 27/27. Integration's own vitest: 1457 pass, 3 fail (its old adversarial-guards from 1a0db4f; fixed by fb7465a) -> F8-3.
- gate-audit: 72/72 area pages gated; 92 actions, 83 gated, 9 public by design. http-mode build on 3366 (stopped, pid+cmd verified): private URLs -> login with safe next; public no-contract pages honest notices; storage 0; te/hi localized. i18n 22 namespaces parity clean except 4 hi zero plurals.
- Fixed F8-1 (doctor profile gated/error h1, mine). Final verdict table: 23 findings, 0 HIGH open; 6 MEDIUM open (2,3,4,D1,D2,F8-3).

## TASK REPORT: R9-C9 (fe-q, feat/fe2-c)
- Fixed 1b (service-request cancel policy from cancellationTermsFor; real -> unavailable), F8-2 (GateNotice contract_pending in 4 directory files; lab gated action "Find a doctor"), 5 partial (structuredSearchFor: exact symptom/speciality label -> taxonomy key; rest stays q, documented).
- tests/unit/modules-services/r9c9-fixes.test.ts 11 (red on pre-fix: 10 fail). e2e fixture build on 3367 (stopped): doctor-search+service-requests+lab-directory 41 pass, 3 skip (twice; first run exit 1 unexplained). tsc 0, lint 0, vitest 69 files 1023 + 3 skipped.

## TASK REPORT: R9-C10 (fe-q, feat/fe2-c)
- docs/frontend/HANDOVER.md from feat/fe2-integration 2954551 (export deleted) + read-only backend task branches I01/I02/C01/B01: mode rules, env vars (scan of src), module map/owners, flags + per-module wired/gated table with backend route existence, tests, open decisions, connect checklist. Script .context/adapter-map.cjs.
- Notable facts: clinical/records adapters call /api/consultations/*, /collection, /proof that no backend branch implements; B01 has reschedule, availability, patient/addresses POST but frontend adapters still gated; pharmacy/gps flags unused.

## TASK REPORT: R9-C11 (fe-q, feat/fe2-c)
- Executed HANDOVER.md on fe2-c: npm ci (scratch copy), lint, typecheck, test, guards, fixture dev 3361, fixture prod 3362, http dev 3363, Playwright self-start 3364, unset-APP_ENV start 3365; integration mode.ts rules via throwaway vitest (5/5). All servers stopped (pid+cmd verified).
- Doc fixes: full paths (mode.ts, robots/sitemap, public pages, request-controls), table paths relative to src/, feature-branch differences (old mode.ts, no /en/login, integration-only files), ports/npm ci notes, guard command. Verified table added. Path script .context/handover-paths.cjs: 72 paths, 0 missing both.
- New tests/e2e/public-directory-smoke.spec.ts: doctors (symptom search -> symptom=fever, profile, request link) + labs (filter, detail, request link), axe/overflow/storage each step; 4 passed at 390/1280.
- tsc 0, lint 0, vitest 69 files 1023 + 3 skipped.

## TASK REPORT: R9-C12 (fe-q, feat/fe2-c)
- Second adversarial pass on int fec9da1 (incl. d 0e09eef), e d97e0a5, p 7f9fd28 (exports deleted). New: C12-1 LOW 3 rupee parsers differ; C12-2 = finding 3 (5 formatters); C12-3 LOW consultation photos [] fallback (fe-d); C12-4 LOW my 4 pages addresses [] fallback -> FIXED here; C12-5 INFO hi errorSummary (unreachable 0). Clean: analytics/console/external, gating 72/72 + no admin signup, fixture env gated + no client env reads, dialogs labelled, i18n parity/no English fallback.
- Status refresh: 2, 4 (except C12-5), E2, R6-1, C3-2, P1 fixed at int; P2/P3 fixed on fe2-p pending; 1b/F8-2/5/C12-4 on fe2-c pending; open 3, D1-D4, R6-2.
- tests/unit/r9c12-guards.test.ts (8). tsc 0, lint 0, vitest 70 files 1030 + 4 skipped.

## TASK REPORT: R9-C13 (fe-q, feat/fe2-c)
- docs/frontend/BACKEND_CONNECT_PLAN.md: read-only compare of int fec9da1 http adapters vs API_CONTRACTS + local PR branches I01(#1) I02(#2) C01(#3) B01(#4); #5 not local -> UNKNOWN (friend-backend / S01 candidates).
- Key: bookings + admin send no Bearer (401) -> MISMATCH; auth/onboarding(provider)/verification/providers/doctor MATCH; /api/onboarding/patient, /api/consultations/*, collection, proof called but no backend route; reschedule/slots/addresses shapes differ (gated now).
- tests/unit/http-routes-contract.test.ts (6; red-checked). Scripts .context/route-compare.cjs. tsc 0 lint 0 vitest 71 files 1036 + 4 skipped.
