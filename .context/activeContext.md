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

## t4 (fe-p) records/notifications/public loading - in progress
- Added patient/records (list, [id], actions), patient/notifications (page, actions, api.ts), PatientShell+dashboard nav, patient.json en/te/hi strings, (public) loading.tsx files + components/public/route-loading.tsx, tests/e2e/patient-records.spec.ts. Next: build, run e2e in 3 server modes, bookings e2e, commit, handoff-t4.md.


## R7-P (fe-p, fe2-p, port 3384) - started
- Brief: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE-R7-P.md. Order: family-members, saved-providers, reviews, reminder-prefs. One new message namespace 'patientAccount' (registered in src/i18n/messages.ts). No contracts -> http adapters gated + REQUESTS.md. Don't edit PatientShell/nav: list nav links in REQUESTS.md.
- Fixture store: process-wide on globalThis keyed by patientId (persists across requests). FIXTURE_FAMILY_SCENARIO=empty for empty state.


## R7-P progress (2026-11-19)
- DONE family-members: ecf6f05. tsc 0, lint 0, vitest 60 files/965 pass, e2e all modes on 3384: on 42, off 24, guest 6 (records+bookings+family).
- Patterns to reuse for the next sub-tasks:
  - module layout src/modules/family-members (fixture store on globalThis keyed by patientId; validate fn returns field codes; http gated)
  - routes src/app/[locale]/patient/family (_lib.ts guard, actions.ts, _components client form with ErrorSummary, IntlScope ["patientAccount"])
  - messages via .context/r7-messages.mjs <section> reading .context/r7-<section>.json (en/te/hi)
  - e2e spec pattern tests/e2e/patient-family.spec.ts; add new spec to .context/fep-e2e-all.ps1
- NEXT: saved-providers (/patient/saved), then reviews (/patient/reviews), then reminder-prefs (/patient/settings/reminders).
- Port 3380 is still held by fe2-d's server; use 3384.
- DONE saved-providers 20f0f2c, reviews 275c9da (records e2e expect timeout 15s). NEXT reminder-prefs (/patient/settings/reminders): channels sms/whatsapp/email, quiet hours IST (may span midnight), version-checked save, FIXTURE_REMINDERS_SCENARIO.

## TASK REPORT: PHASE R8-P (fe-p, feat/fe2-p, port 3384), 2026-11-19
Status: DONE_VERIFIED (steps 1 to 4). Stopped; awaiting the lead.

Commits (not pushed):
- 1e1df00 nav: PatientShell and dashboard nav link to Family, Saved doctors, Reviews and Reminders (en/te/hi). AppShell gains additive `bookmark` and `star` icons.
- 1be71ac loading.tsx and error.tsx added to family/new, family/[memberId] and reviews/[bookingId]. Every fe-p patient segment now has both.
  - PatientRouteError shows the localized copy, Try again, a home link, and the digest only (never the raw error).
  - Gated and denied states on bookings, family, notifications, records, reviews, saved and reminders offer "Go to your overview" (`patient.shell.toDashboard`).
  - Detail and not-found states already had back links. InlineError shows localized copy by code, plus a retry.
- 8f7ca31 fix: typing of the route-error unit test (the build typechecks tests).
- 459ef05 tests/e2e/a11y-sweep-p.spec.ts, covering 13 routes in both projects (mobile-390, desktop-1280):
  - axe WCAG 2.1 A/AA: no serious or critical violations
  - no horizontal scroll
  - visible focus ring on the first Tab stop
  - nav reachability of the four R7 pages from the dashboard and the shell

Verification:
- tsc 0, eslint 0, vitest 64 files / 995 tests pass, build 0.
- Playwright via `pwsh .context/fep-e2e-all.ps1` (single server on 3384, restarted per mode), all patient specs plus the sweep:
  - seeded: 96 passed
  - empty: 66 passed
  - guest: 12 passed
  - 0 failed in every mode
- Step 4: the sweep found no serious or critical issues, no overflow and no missing focus ring, so there was nothing to fix. The feature specs also assert zero axe violations of any impact on their main pages.

Limitations / notes:
- The sweep checks English only; te/hi axe runs are in each feature spec.
- The sweep asserts serious and critical axe impacts only, as briefed. Minor and moderate impacts on the dashboard and detail pages are not asserted by the sweep.
- Port 3380 is still held by fe2-d's server; everything ran on 3384. My server is stopped.

## TASK REPORT: PHASE R8-P2 (fe-p, feat/fe2-p, port 3384), 2026-11-19
Status: DONE_VERIFIED. Stopped; awaiting the lead.

Commits (not pushed):
- fd37da2 Step 1: review edit/withdraw and the admin review-moderation queue.
  - Patient side:
    - `/patient/reviews/[bookingId]/edit` (loading/error included). Editing sends the review back to moderation and is version-checked.
    - Rejected reviews show the moderator's fixed-copy reason.
    - Withdraw needs confirmation and is final: no edit, no new review.
  - Admin side: `/admin/reviews` behind the new proposed capability `review:moderate` (nav item "Review moderation").
    - Filters (waiting, published, not published) are URL state.
    - Publish, or decline with a required reason; conflict handling.
    - No patient identity and no ids in URLs.
  - Modules: the fixture adapters span every synthetic patient plus a seeded queue owner; the http adapters are gated.
  - Fixture-only synthetic moderator in `src/modules/admin/session.ts`: `FIXTURE_ADMIN_SESSION=moderator` (server env, fixture mode, refused in production). Needs lead review (REQUESTS R-FE-P-R8-1).
  - en/te/hi strings. Contracts: R-FE-P-R7-3 (amended), R-FE-P-R8-1.
- 328390d Step 2: the a11y sweep now fails on moderate issues on the dashboard and detail pages (STRICT_ROUTES), and sweeps the notification inbox in te and hi (strict). The review edit page was added.
  - Finding fixed: the review Edit link failed label-in-name (WCAG 2.5.3) in en/te/hi.
  - New unit test enforces label-in-name for every aria-labelled control string in all locales.

Step 3 verification (after both commits):
- `npm run lint` 0; `npm run typecheck` 0; vitest 65 files / 1006 tests pass; `npm run build` 0 (382 pages).
- fe-p e2e via `pwsh .context/fep-e2e-all.ps1` (one server on 3384, restarted per mode; all patient specs, the a11y sweep and the moderation spec):
  - seeded: 116 passed
  - empty: 66 skipped / 74 passed
  - guest: 14 passed
  - 0 failed
- Shared public.spec + a11y.spec (guest server): 106 passed, 13 failed. All 13 are the known te@1280 header overflow (12px). It is fixed on feat/fe2-a (9027669, 305e48d) and not yet merged into fe2-p; not caused by this phase.

Known limitations:
- No backend contracts; the http adapters are gated.
- No audit-log view for moderation decisions (the backend must audit).
- Moderation cannot undo a decision.
- The fixture review store is shared per server: run the review specs once per server start (the script restarts it).
- te/hi are machine-written (REVIEW_NEEDED.md).
## T5 fe-p on fe2-a (port 3330)
- 305e48d header 2xl overflow fix (te 175px@1536). public+public-nav+a11y: 131 passed 0 failed before 1536 add; 1536 sweep 3/3.
- Next: R8 usability audit te/hi 390/768/1280 via .context/fep2-audit.mjs, fix CSS/components, small commits, handoff-fe-p2.md.


## TASK REPORT: R9-P (fe-p, feat/fe2-p, port 3384), 2026-11-20 (replaces the PAUSED STATE)
- Merge: feat/fe2-a (3c72d13) merged in ca1a8d3 before the shutdown; feat/fe2-a has no newer commits. Telugu header overflow cleared: every "render in every locale te" test passes.
- Shared suites (guest server): public + public-nav + a11y 130 passed, 4 failed, 20 skipped. The 4 failures are public-nav hero search (:81, :93, both projects): the spec expects fe-a's DoctorSearch labels, the landing renders fe-c's DoctorSearchBar since f18d7cb (R-C2-4). Logged as REQUESTS R-FE-P-R9-1; spec and landing page are outside fe-p scope.
- Decision log: `/admin/reviews/log` (read-only, newest first, no undo, `review:moderate`), linked from /admin/reviews as "Decision log". `ReviewModerationApi.listDecisions()`; fixture log is append-only, seeded with 3 past decisions (SYN-BKG-0204/0206/0207, another synthetic moderator); `decide` refuses without an attributable actor and logs only successful decisions; rows expose `decidedBySelf`, never ids, patient or review text. http adapter gated. en/te/hi messages.
- Checks: tsc 0, lint 0, vitest 1040/1040, build 0, fep-e2e-all on 118 pass / off 74 / guest 14 (0 failed).
- Next: lead decides R-FE-P-R9-1 and whether moderation decisions join /admin/audit.

## TASK REPORT: R9-P2 (fe-p, feat/fe2-p, port 3384), 2026-11-20
- (1) Sign-in return: the admin layout redirected first with next=/admin/dashboard for every page. Layout now defers to the page gate; AdminRouteGate takes subPath; log page subPath="log" -> next=/en/admin/reviews/log. Unit: tests/unit/modules-operations/admin-return-path.test.ts (27). Login consumer lives on fe-b/integration (normalizeInternalPath). REQUESTS R-FE-P-R9-3.
- (2) Reminders flake root cause: input/click before hydration (typed values reverted and old values saved; or native GET put the form in the URL). Reproduced with a JS-chunk delay probe (.context/r9p2-hydration-probe.mjs). Fix: form controls in a disabled fieldset until hydrated. New e2e holds JS chunks and checks disabled -> enabled -> validation. Stress: 60/60 at 4 workers x5.
- (3) Overlay sweep: notifications + reminders, en/te/hi, 390 (menu sheet dialog) and 1280 (language menu), moderate+ axe, focus in overlay, Escape returns focus. 12/12. Known: aria-hidden-focus behind Radix modal language menu at 1280, accepted only with the Tab trap verified; REQUESTS R-FE-P-R9-2 to fe-a.
- (4) Notifications leftovers: every file referenced (page imports ./actions, ./api, NotificationsInbox). Nothing deleted.
- Checks: tsc 0, lint 0, vitest 68 files / 1067 tests, build 0, fep-e2e-all on 132 / off 88 / guest 14 passed, 0 failed.