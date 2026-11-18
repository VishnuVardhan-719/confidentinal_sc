# FE07–FE09 pending browser specifications

Source: docs/FRONTEND_MASTER.md §§5,7,9,10,19,20 and docs/frontend/CONVENTIONS.md. These specifications are fixture-only acceptance work, not browser verification or real integration evidence. Every case uses the declaration form test.fixme(title, body), so pending pages cannot accidentally report a passing journey. Remove fixme case by case after implementation and review.

This branch currently lacks @playwright/test, browser binaries, a Playwright config, locale pages, shared UI/i18n and real patient-guard bindings. The foundation owner controls dependencies/config; no manifest, lock, application route or guard was changed here. Files use Playwright-supported .spec.mjs while the runner dependency is absent; node --check validates syntax, not Playwright behavior or selector correctness. Vitest continues to discover only tests/unit/**/*.test.ts. Do not count skipped cases as completed E2E coverage.

## Activation contract for fe-a / lead

1. Supply the approved Playwright runner/config and local web server. Set APP_ENV=test and FRONTEND_ADAPTER=fixture in both app and test processes; configure testDir as tests/e2e and testMatch as **/*.spec.mjs. The helper defaults to http://127.0.0.1:3000; E2E_BASE_URL may select another local port.
2. Supply an isolated scenario lifecycle and pin the app/adapter clock to 2026-11-18T00:00:00Z. The schedule fixture is 20 November at 10:00 IST (04:30 UTC). Each scenario must reset state before each case; no shared mutable database or data across workers. E2E_FIXTURE_SCENARIO is a runner assertion of which scenario was seeded, not an implementation of scenario selection. Run one matching scenario group per isolated app/process, or replace this assertion with the approved per-test fixture lifecycle. Full-suite execution against one unchanged seed is invalid.
3. Supply synthetic test-auth sessions through the actual auth mechanism/guard. E2E_PATIENT_STORAGE_STATE and E2E_PROVIDER_STORAGE_STATE point to local ignored Playwright storage-state files; do not commit session state. The helper reads these files through Playwright; it does not set role cookies, create demo accounts or bypass auth. Guest contexts have no session. Patient workspace switching needs two independently authorized test memberships.
4. Implement/reconcile the proposed accessible names and test IDs below with the shared components. English action names are locale-en expectations, not permission to hardcode JSX strings. Telugu/Hindi checks use stable IDs/roles and real translated labels. Agree the safe login return parameter with the auth owner (current pending expectation: next=/locale/patient/...).
5. Wire the real module APIs in fixture mode. Do not mock /api/catalog in the browser as a substitute: server loaders and fixture adapters may never make browser fetch calls. No speculative fixture-control endpoint, production preview role switch or local success fabrication is introduced by these specs.
6. Implement approved test-only offer/policy/consent preparation and cancellation quotes before activating consequential booking cases. They must remain gated with real adapters until backend contracts land. Never disable a production policy gate merely to make a pending spec pass.

When the runner is available, first list cases with its local CLI and an explicit test directory/config; then run the scenario selected for the local app. Enabling a whole file without matching per-case scenario reset is unsupported. This task does not install or execute an absent Playwright package through npx.

## Settled application observations (required before race cases are enabled)

E2E_APP_OBSERVER_MODULE names an approved .mjs harness module relative to tests/e2e (for example harness/app-observer.mjs). It is deliberately not provided here: observation must connect to the real isolated fixture app, including server-side module calls, rather than return local constants. The helper rejects a missing module or a path outside tests/e2e.

The module exports createObserver({ scenario }) returning begin(label), settle(token), dispose(). begin captures a unique action boundary for the current per-case reset. settle must release scripted delayed responses, flush late/superseded completions, advance the controlled clock through reconnect/effect/retry work and wait for all associated adapter/transport work to drain. A quiet snapshot immediately after a click is insufficient. It returns aggregate deltas since begin: createCalls, persistedBookings, uniqueIntentKeys, bodyChanges and inFlight. Count create invocations at the actual BookingsApi boundary across browser/server execution; browser fetch interception alone misses server loaders or local fixture adapters. Count unique intent keys and body changes in memory; never expose raw request bodies, private drafts, auth state or cookies in observations/logs. dispose detaches all listeners and clears per-case observations.

Double-click requires exactly one create invocation and one persisted booking. Unknown-ID lost-response reconciliation requires two invocations with one unchanged key/body and one persisted booking. Offline/reconnect requires zero invocations and zero new bookings after drained reconnect work. Superseded directory assertions run after the observer flushes the old completion. These cases fail closed if the coordinated observation module is absent; the specs do not implement a fake probe or new app endpoint.

## Scenario inventory (proposed; not a claim these exist)

| Scenario | Required synthetic behavior |
| --- | --- |
| directory.available | Existing four eligible synthetic provider fixtures, PIN 500001, 50000 paise with category units, null public reference; PIN 500002 has no coverage. |
| directory.empty / pending / suspended | Corresponding ProvidersFixtureApi scenario; no public booking CTA enabled, even on a direct profile URL. |
| directory.delayed_then_empty | First PIN yields one row; changing PIN delays an older request, latest PIN 500003 yields empty. Old completion must be flushed by the harness before the final assertion is accepted. |
| directory.unavailable_then_available | Controllable initial delay then safe unavailable result; explicit retry returns eligible row. |
| booking.requestable | Complete authorized patient, address ...0021, future schedule, approved synthetic offer/policy acknowledgment; the scenario starts with no bookings and create persists one request with null public reference. Lab, scheduled ambulance and nonclinical caretaker details use their respective schemas. Ambulance destination ...0022 is separately authorized. |
| booking.delayed_create / uncertain_after_commit | Deterministically pause create; or commit once then lose the response. Reconciliation uses original intent and returns the persisted request. No automatic new-key POST. The scenario starts with no bookings. |
| booking.changed_price / changed_policy / stale_slot | Server preparation/transition rejects the stale review, publishes changed offer or schedule conflict; prior consent/review cannot authorize a new price or slot. |
| booking.cancellable | Preseed booking ...0061 REQUESTED; server quote policy synthetic-policy-v1, fee/refund both 0 paise. This is a test-only quote, not approved business policy. Cancellation appends an event; it does not set payment refunded. |
| booking.policy_missing / lab_multi | Missing approved offer/policy blocks checkout; or two distinct authorized lab lines with a server-reviewed total of 100000 paise. Multi-line create remains a missing real contract. |
| booking.cancellation_policy_missing | Missing approved quote/policy disables cancellation. |
| patient.workspace | Authorized patient with next visit ...0061 CONFIRMED, independent DUE payment, clinical panel gated, profile completion and unread notifications. |
| patient.empty / bookings_incomplete_page | No bookings; or 21 records behind cursor pagination with incomplete next-visit knowledge. |
| patient.incomplete / family.denied / family.authorized | Questionnaire incomplete; adult without a grant has no selectable identity/private record; or an explicitly granted family patient is selectable and remains in review. Use actual guard/authorization responses. |
| patient.records_gated | Clinical/report gate off; direct draft/other-member record ...0099 is denied; no signed PDF URL. |
| patient.notifications_write_fails / support | Mark-read fails once then succeeds, preserving rollback; or support create returns its actual reference and scoped timeline. |
| patient.workspace_switch / guest / wrong_role | Two authorized memberships with different data; no session; or actual authenticated provider denied patient detail. |

Available module fixture constructors cover only part of this inventory. Delay/failure-after-commit, patient/family/session, policy/quote, pagination, support timeline and cross-workspace scenarios need the coordinated test harness. Their absence is why all specs remain fixme.

## Proposed selector contract

Use roles and accessible names for inputs/actions/dialogs and stable test IDs only for page regions/state projections. Never encode private data in a test ID. Required shared IDs: fixture-notice, gate-notice, form-error-summary, offline-banner, profile-completion, private-access-denied. Directory IDs: provider-card, provider-price, provider-availability, manual-acceptance-notice, directory-results (aria-busy), directory-stale-notice, directory-needs-pin, directory-empty, directory-skeleton, profile-unavailable.

Booking: booking-progress is a semantic list with eight items; exactly one item has aria-current=step and data-step matching service/patient/location/schedule/details/paymentPolicy/review/result. Visible step panels use booking-step-<step>. State IDs: booking-price-snapshot, booking-policy-version, booking-review-schedule, booking-review-patient, booking-review-test-line, booking-review-total, booking-policy-gate, booking-result, booking-status, booking-submit-pending, booking-uncertain, booking-reapproval-required, schedule-conflict, scheduled-transport-notice, nonclinical-scope-notice, profile-completion-required, family-access-denied. Result/detail reference and status are server-derived; no generated SCV string for a null fixture reference.

Patient: patient-next-visit, patient-next-visit-empty, patient-next-visit-incomplete, patient-recent-notifications, patient-page-content, patient-bookings-empty, patient-booking-card, patient-booking-detail, booking-timeline, payment-status, clinical-panel, cancellation-policy-version, cancellation-fee, cancellation-refund, cancellation-unavailable, notification-item, support-reference, support-timeline, support-status, workspace-switch-pending. Private-field sentinel IDs used in absence checks are not requests to render private fields publicly.

The specs cover widths 360/390/768/1280, three locale routes, keyboard/focus, mobile filter dialog, URL restoration, truthful availability/prices, 8-step category flows, duplicate/uncertain submission, reapproval, safe private state, direct guards, cancellation and gates. They do not prove RLS, real backend concurrency, translation review, contrast or integrated payment/clinical security.


## Handoff checkpoint — FE07–FE09 test preparation, 2026-11-18

Agent: Codex C, feat/fe2-c, observed owner-integrated base 2e4eee2. No commits/pushes. Owned task changes: three pending browser specs and shared test helper/README under tests/e2e; three unit branch-test files under tests/unit/modules-marketplace; docs/frontend/COMPONENTS.md; .context/activeContext.md. No application, routes, shared components, global CSS, package, lock or root test configuration changes.

Implemented: pending directory/wizard/patient acceptance specifications; 60 additional meaningful unit cases; 13 prioritized component needs for fe-a. Not implemented: route pages, auth/scenario/observation producers, Playwright package/config/browser installation or browser execution. No RLS/integrated-security/browser-success claim.

Verification: npm test reports 14 files / 175 tests passed; npm run typecheck exit0; node --check on helper and all three .spec.mjs files exit0. Final lint evidence is saved in activeContext. No route edits, so production build was not rerun for this test-only task.

Read-only marketplace_review found a call-count oracle gap in duplicate/reconnect cases; fixed using the explicitly required real-app observation contract, with no fake producer. Targeted re-review found no remaining important issues. Reviewer did not independently rerun tests. Lead can transfer this checkpoint to shared task/status/test evidence ledgers; browser cases stay pending until activation prerequisites above are met.
