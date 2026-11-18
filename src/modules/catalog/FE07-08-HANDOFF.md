# FE07/08-data handoff — Phase 1 marketplace data layer

TASK ID: FE07/08-data
AGENT: Codex C; human owner Owner. Independent read-only reviewer: marketplace_review, gpt-6.1-sol/high.
BRANCH: feat/fe2-c (current worktree C:/Users/Yashwanth/fe2-c only).
BASE COMMIT: 3174196adf512a4fde8011ca699a66f9b3fcf99e.
COMMIT(S): None; no commit, push, merge, checkout, reset, stash, migration or deployment performed.
STATUS: Phase 1 verified locally. Readiness: synthetic fixture adapters + mocked HTTP contract tests; real backend integration UNVERIFIED. Phase 2 UI is not implemented.
OWNED PATHS: New src/lib/api files only; src/lib/format/**; src/modules/{providers,bookings,payments,support,notifications,catalog}/**; src/fixtures/marketplace/**; tests/unit/modules-marketplace/**. Explicit contract-request exception: docs/frontend/REQUESTS.md (append-only). Continuity: .context/activeContext.md.
DEPENDENCIES / CONTRACT: frontend conventions and master sections 9/10/12/13/14/16/17/19; backend B01 e8a71ede046ec88cde71cf243adc54b1e64460ac and C01 373251fd40d596a66767bdef934b71e8f69558a7, inspected read-only from local origin refs. No remote fetch performed.

IMPLEMENTED:
- Typed JSON fetch client; same-origin credentials, redirect rejection, no-store, abort timeout/caller signal, Zod boundary validation, safe HTTP status codes and numeric rate-limit hints. No raw backend error strings, blind retries or automatic optimistic booking updates.
- In-memory immutable UUID intent key; retain the same key through retries/uncertain create outcomes and replace it for material intent changes. Nothing persisted in browser storage.
- Exact integer-paise INR formatting (including safe-integer boundary), UTC validation and Asia/Kolkata display, en/te/hi locale formatting.
- Allowlisted public service/provider DTOs, four categories, exact PIN and price/cursor validation, URL roundtrip, providers/catalog API and actual C01 projection adapter. Descending global sort gated until supported. Fixture coverage for available/pending/suspended/empty/unsupported PIN; records explicitly synthetic and without fake credentials/reviews/contact/address/availability promises.
- Canonical shared booking statuses plus separate doctor overlays, operational substate, clinical status, and financial types. Stable localized label/tone maps with unknown-state neutral fallback. Pure permittedActions matches state + actor + explicit server grant; wrong actor, absent grants, unknown state and clinical gate fail closed. Operational completion is independent of clinical signing/payment.
- All eight wizard-step schemas, authorized-recipient/questionnaire requirement, saved-location/schedule validation, four category details (scheduled transport and nonclinical care only), policy/price snapshots, category/policy review consistency, and validated server result shape.
- Bookings API: create/list/get/accept/decline/cancel use actual B01 payloads/envelopes, UUID key, version/resource constraints and safe 409 conflict results. Timeline HTTP is gated pending contract. Synthetic requests preserve category, key/body deduplication and conflict behavior; B01 request version2 and acceptance events version3/4 are modeled. Return values are cloned to avoid mutable fixture state leakage.
- Payment status/summary/collection claim schemas, label map, idempotent synthetic claims; cash/direct-UPI claim never changes a record into gateway paid. Support minimal schemas/owned synthetic tickets without health payloads or invented references/SLA. Notification minimal typed event records, versioned mark-read, optimistic before/after snapshots and conditional rollback.
- Mode-selected factories for every module default HTTP. Fixture constructors AND operations enforce explicit fixture mode and production rejection, including actual production despite an injected nonproduction environment. No new dependencies.

NOT IMPLEMENTED:
- No UI, directory/profile page, booking wizard page, dashboard, locale dictionaries or components. Phase 2 follows lead integration.
- No end-to-end/backend/RLS/concurrency tests, real auth/session exercise, clinical workflow activation, payment gateway, invoice/receipt issuance, emergency dispatch, GPS, subscription, notifications delivery or deployment.
- HTTP timeline, payment summary/collection, support and in-app notification operations return gated without making speculative requests because implemented backend contracts are absent. These are honest adapter stubs, not integrations.
- No detailed provider credentials/public SCV reference absent from the public backend projection; no fabricated substitutes. No complete wizard HTTP submission until approved policy/price acknowledgment, details/multi-test selection and payment-method contracts exist.

API/DB CONTRACT CHANGES:
- None to backend/API routes or DB. Frontend view models project current wire contracts; append-only reconciliation requests in docs/frontend/REQUESTS.md document missing endpoints, policy/price reapproval, server action grants, clinical/operational differences and future locale keys.
- Actual provider route is /api/catalog, not proposed /api/providers (private onboarding); required category + PIN supplied. Integer paise converted only after safe bounded decimal-string validation.
- HTTP mutations never accept client-supplied prices/status/roles; create returns server ID only. Call get(id) after success/conflict as appropriate; do not synthesize server public references or mutate local booking status before confirmation.
- HTTP transport uses browser-relative same-origin routes. Server-component consumers need a request-scoped approved server transport/domain adapter; do not invent public origin or forward user credentials to an arbitrary host.

TEST COMMANDS:
- npm run lint
- npm run typecheck
- npm test
Executed via Windows Node npm CLI from Bash: node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' <script>. Exact package scripts were preserved.

ACTUAL TEST RESULTS (2026-11-18, final verification):
```text
> surecure-visit@0.1.0 lint
> eslint
Exit code: 0. No warnings/errors.

> surecure-visit@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
Exit code: 0.

> surecure-visit@0.1.0 test
> vitest run
RUN v5.1.0 C:/Users/Yashwanth/fe2-c
Test Files  6 passed (6)
Tests       74 passed (74)
Duration    872ms
Exit code: 0.
```

- 69 marketplace tests plus 5 existing foundation tests. Watched initial missing-module failures, then passing implementations. Added and reproduced failures for URL traversal, four-category/version fidelity, production-env override, exact paise/date handling, independent operational completion and malformed cursors; fixes passed targeted/full tests.
- git diff --check passed; only CRLF normalization advisory for continuity Markdown. Protected-file diff for result.ts, mode.ts, package/lock, routes/components and excluded modules is empty. Source audit: 40 new TypeScript files, 1,059 lines, no any/@ts-ignore/@ts-nocheck. No build required/run: routes untouched.

SECURITY/PRIVACY NOTES:
- Synthetic data only. No actual patient records, keys, credentials, card data, private address/contact projections, OTPs, browser persistence or medical telemetry.
- Authorization remains server/DB responsibility. Role/state hints require actual server action grants; B01 has no grants projection yet, so the current HTTP view models do not enable those actions.
- Fixtures model isolated scenarios, not a security boundary, shared operational backend or evidence of tenant isolation. Do not ship real transactional/clinical/financial activation based on these unit tests.
- Policies/legal identity, real provider coverage, finance/reconciliation and release gates remain pending; no paid service or real medical workflow enabled.

REVIEW:
- Independent read-only review found no critical or important issues; checked current C01/B01 wire shapes, privacy allowlists, production guards, state/version behavior, protected files and tests. Reviewer did not independently rerun tests.
- Deferred minor: seeded accepted/declined/cancelled booking scenarios retain seed version2 rather than post-transition versions. Created request/accept paths match actual version2 ->3 ->4 and are covered. Align preseeded scenario metadata before Phase 2 scenario-driven UI tests.

BLOCKERS:
- Actual integrated behavior awaits backend merge/contracts, action grants, approved policy/price reapproval and gated endpoints listed in REQUESTS.md. No blocker to reviewing/integrating this Phase 1 code slice; do not call gated services integrated.

NEXT ACTION:
1. Lead reviews this uncommitted scope, integrates the data layer and transfers evidence/status to shared task ledger, feature status, session/test evidence and handover docs (outside this agent's ownership).
2. Backend owner resolves REQUESTS.md contracts and verifies authorization/RLS/concurrency, approved policy/price snapshots and real coverage; connect remaining HTTP adapters only against approved endpoints.
3. Authorize Phase 2 UI against these typed APIs, reviewed locale keys, safe loading/error/denied/disabled/empty states, then browser/E2E verification. Align the deferred synthetic seed-version minor before scenario testing.

FILES CHANGED:
- src/lib/api/fixture.ts
- src/lib/api/http.ts
- src/lib/api/idempotency.ts
- src/lib/format/index.ts
- src/modules/bookings/actions.ts
- src/modules/bookings/api.ts
- src/modules/bookings/fixture.ts
- src/modules/bookings/http.ts
- src/modules/bookings/schemas.ts
- src/modules/bookings/status.ts
- src/modules/bookings/wizard.ts
- src/modules/catalog/api.ts
- src/modules/catalog/schemas.ts
- src/modules/notifications/api.ts
- src/modules/notifications/fixture.ts
- src/modules/notifications/http.ts
- src/modules/notifications/schemas.ts
- src/modules/payments/api.ts
- src/modules/payments/fixture.ts
- src/modules/payments/http.ts
- src/modules/payments/schemas.ts
- src/modules/payments/status.ts
- src/modules/providers/api.ts
- src/modules/providers/filters.ts
- src/modules/providers/fixture.ts
- src/modules/providers/http.ts
- src/modules/providers/schemas.ts
- src/modules/support/api.ts
- src/modules/support/fixture.ts
- src/modules/support/http.ts
- src/modules/support/schemas.ts
- src/fixtures/marketplace/bookings.ts
- src/fixtures/marketplace/notifications.ts
- src/fixtures/marketplace/payments.ts
- src/fixtures/marketplace/providers.ts
- src/fixtures/marketplace/support.ts
- tests/unit/modules-marketplace/actions-and-records.test.ts
- tests/unit/modules-marketplace/contracts.test.ts
- tests/unit/modules-marketplace/foundations.test.ts
- tests/unit/modules-marketplace/modules.test.ts
- src/modules/catalog/FE07-08-HANDOFF.md
- docs/frontend/REQUESTS.md (append-only new file)
- .context/activeContext.md


## Phase 2 C non-UI checkpoint — 2026-11-18

Base: owner commit 84d36cf, current feat/fe2-c only. No commits/pushes. UI pages intentionally pending owner's fe2-a foundation merge message; shared components, i18n, auth guards, global CSS and package files untouched.

Implemented:
- bookings/wizard-state.ts: eight-step gating, save/back/downstream invalidation, revision matching, uncertain and changed-offer locks. schedule.ts converts validated IST wall time to UTC explicitly.
- bookings/submit.ts: per-intent UUID key, same-promise duplicate dedupe, no automatic retry, exact key/body reconciliation after unknown response, known-ID GET reconciliation, full server snapshot comparison, session disposal. review-matching.ts shares the comparison. Missing verified preparation callback fails gated before POST.
- providers/directory-model.ts: category-bound URL allowlist, PIN entry, draft Apply/Clear/cancel restoration via directoryDraftFromQuery, public card links and localized prices. directory-controller.ts aborts superseded calls and ignores late responses; immutable snapshots support later UI external stores. ProvidersApi.list accepts optional AbortSignal without breaking existing callers.
- providers/server-loaders.ts: request-scoped directory/profile reads, validated URL scopes and response projection. Distinguishes missing PIN, invalid URL, no results and transport error.
- bookings/server-loaders.ts and view-model.ts: required per-read patient authorization callback, request-scoped adapters, no private cache, validated booking/timeline/payment ownership and allowlists, separate gated auxiliary panels, action hints denied absent server grants, explicit page scope/cursor and suppressed global next visit when incomplete. No route handlers with invented endpoints or permissive guards.

Integration requirements:
- Bind private loaders to real request-scoped requireRole after the foundation is merged. Never inject a constant-success authorization function into production.
- Bind submission prepare only to a verified server offer/policy/eligibility/consent acknowledgment contract. Browser review flags are display state, not authorization. Existing B01 lacks this contract; production creation stays gated.
- Patient list exposes loaded_page, hasMore, nextCursor, complete and nextVisitState. Render incomplete as unknown; do not render it as no upcoming visit. Reset accumulated pages on session/filters change.
- Use one submitter per active intent/session. On uncertainty expose explicit reconciliation; do not reset/new-key retry. On review_required show the already-created booking and changed offer for server-authorized review; never create another booking.
- Controllers and wizard drafts live only in memory. Dispose controllers/discard drafts on logout, identity or organization change. Loading directory pages may retain old cards as stale; disable their booking actions until current request resolves.

Evidence: test-first failures reproduced for new boundaries and regressions. Final npm test: 10 files, 106 tests passed (32 added). npm run typecheck: exit0. npm run build: exit0, compiled and generated existing / and /_not-found routes. No UI/E2E claims at this checkpoint. Final lint evidence recorded in activeContext. Independent read-only marketplace_review found two loader issues (payment validation/ownership and next-visit pagination); both fixed with failing-then-passing regressions, targeted re-review found no remaining important issues. Reviewer did not run tests.


## CodeRabbit Phase 1 follow-up — 2026-11-18

Read CR-fixes-C.md: all 13 findings verified as valid. Eight implementation regressions reproduced before fixes; five existing assertions strengthened. Minimal fixes only, no commit/push.

| Finding | Change / evidence |
| --- | --- |
| HTTP-date Retry-After dropped | Parse date/delta forms, clamp past to zero and upper bound to 99,999,999 seconds; invalid values omitted. foundations.test verifies future/past/numeric/bounded/invalid hints. |
| Unread HTTP error stream | Cancel body without waiting on indefinitely open cancellation; swallow cancellation rejection, preserve safe HTTP error. Two foundations regressions. |
| Resource UUID duplicates | Compare lowercase UUIDs for resource count; case-only duplicates rejected, distinct IDs accepted. review-fixes.test. |
| Booking fixture lookup casing | Canonical get/timeline/decision lookup keys; uppercase reads and acceptance see same lowercase booking. review-fixes.test. |
| Lab UUID duplicates | Compare lowercase UUIDs for selected-test uniqueness; duplicate and distinct regressions. review-fixes.test. |
| Notification prior snapshot stripped | Capture detached original caller snapshot, keeping safe parsed optimistic after value; rollback restores UI fields and nested isolation, does not overwrite newer versions. review-fixes.test. |
| Payment fixture duplicate UUID rows | Canonical summary and claim booking IDs, including idempotency comparison body; same booking version across spellings and stale rejection. review-fixes.test. |
| Provider scope can override ID | Validate explicit id plus only category/pin from scope; regression verifies requested ID and invalid explicit ID rejection. review-fixes.test. |
| Notification readback vacuity | Require successful list and matching notification ID with the captured non-null readAt. |
| Gated adapters zero-fetch claim | Spy before adapter construction; assert zero fetch calls; restore spy in finally. |
| IST clock substring | Anchored complete 05:30 or 5:30 AM clock rejects 15:30 and PM. All three locales verified. |
| Create-attempt count vacuity | Require two successful results and exactly two fetch calls before inspecting headers/body. |
| Known status unknown fallback | Every known status must have a nonempty label different from unknown; retain exact unknown fallback assertion. |

Verification: npm test 11 files/115 tests passed (9 new regressions in this follow-up); npm run typecheck exit0 after explicitly typing the new fetch mock; npm run lint exit0; git diff --check exit0. Existing Phase 2 work remains uncommitted and pages still await foundation merge notification. Independent targeted follow-up review confirmed all requested fixes, no remaining important issues; reviewer made no edits and did not independently rerun tests.
