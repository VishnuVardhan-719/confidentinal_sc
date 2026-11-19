# Handoff: fe-c3 (PHASE4-C3), worktree C:/Users/Yashwanth/fe2-c, branch feat/fe2-c

Task source: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE4-common.md and PHASE4-C3.md. The task is doctor discovery plus the 22-step booking journey, verified in a browser on port 3360.

## DONE
- Fast-forwarded feat/fe2-c from 0331c6b to feat/fe2-integration 1ac677e. 0331c6b was an ancestor, so there were no conflicts and package.json did not change. This brings in the patient session guard (src/modules/patient-dashboard/session.ts), the shared payment components (src/components/payments/*) and the CSP config.
- 7550c76 `wip(fe-c3)`: src/fixtures/marketplace/booking-store.ts. This is a process-wide synthetic store on globalThis holding records, events, intents, addresses, payments and respondAt, with a `tick(now)` that applies the synthetic provider's decision. Synthetic doctor 2 (...0101) declines. Every other provider accepts, then the booking becomes CONFIRMED with a server-made reference `SCV-XXXXXX` and payment DUE (pay after). The decision lands after FIXTURE_PROVIDER_RESPONSE_MS (default 3000). The store is seeded with a COMPLETED, PAID booking ...0071 that has a receipt. NOT yet wired into anything and NOT typechecked or tested.

## IN PROGRESS / REMAINS (nothing below is written yet)
1. Data layer:
   - Wire the store into the fixtures: add a `store` option to createBookingsFixtureApi (use the store's maps and call `tick` on get/list/timeline), and the same for the payments fixture and the patient fixture (listAddresses comes from the store).
   - Add `PatientApi.addAddress` (HTTP adapter returns gated).
   - Add `BookingsApi.reschedule` (fixture: status goes back to REQUESTED and respondAt is reset; HTTP adapter returns gated).
   - New src/modules/bookings/slots.ts: fixture slots for the next 5 days in IST, excluding active bookings. The fixture create should reject an overlapping slot with a conflict.
   - Add optional `visitReason` (max 240) to createBookingSchema. Log the contract change in REQUESTS.md.
   - Pass the cancellation policy SYNTHETIC_CANCELLATION_POLICY.
2. Routes (avoid patient/bookings*, which fe-p owns):
   - /[locale]/patient/book: an 8-step wizard using the existing wizardReducer, createBookingSubmitter and PatientGate. Server actions handle offer, addAddress, slots, prepare (re-check offer and price), create and get.
   - /[locale]/patient/book/[id]: the request page. It shows pending, accepted or declined, plus "Check for updates" (router.refresh) and last updated time; separate booking, payment and clinical badges; the timeline; the fee in paise; pay-after with online payment shown as disabled; the confirmation reference; cancel (reuse src/components/payments/cancellation-dialog); reschedule; and a request receipt. When paid, the receipt is a ReceiptLink to /patient/book/[id]/receipt.
   - Change doctorBookHref in src/components/directory/doctor-card.tsx from /patient/bookings/new to /patient/book.
3. Strings: booking.wizard.* and booking.request.* in en, with te/hi copies; list the te/hi placeholders in docs/frontend/REVIEW_NEEDED.md. Add docs/frontend/BOOKING_JOURNEY.md mapping the 22 steps to routes and tests.
4. E2E: the new tests/e2e/booking-journey.spec.ts should cover the happy path with doctor 1 (home address PIN 500001), the decline path with doctor 2 (new address with PIN 500032), receipt ...0071, keyboard-only, axe, and the 390 and 1280 projects. Run doctor-search.spec.ts too. directory.spec.mjs and booking-wizard.spec.mjs are test.fixme. They need an external scenario runner and auth storage state, and cover all four categories. Port the doctor-applicable cases into the new spec and leave the rest as fixme with reasons.
5. Verify: npm run lint, npm run typecheck, npm test, npm run build. Then start the server:
   `$env:FRONTEND_ADAPTER='fixture'; $env:APP_ENV='test'; $env:FIXTURE_PATIENT_SESSION='self'; npx next start -p 3360`
   Run the tests with:
   `$env:PLAYWRIGHT_BASE_URL='http://localhost:3360'; $env:FRONTEND_ADAPTER='fixture'; npx playwright test tests/e2e/doctor-search.spec.ts tests/e2e/booking-journey.spec.ts`
   Then commit and report.

## Test status
No lint, typecheck, unit or e2e runs have been done in this session. No server is running. Port 3360 is unused.

## Notes / known issues
- The doctor workspace (/doctor/requests) uses the clinical world fixture, not the marketplace bookings. That is why the provider decision is simulated by the synthetic responder in the store.
- The decision reasons in src/components/payments cancellation-dialog differ from decisionReasonSchema, so a patient cancel sends `patient_request`.
- Booking ownership is not checked per patient in the fixture, because there is a single synthetic account.
- `.playwright-mcp/` is untracked, predates this session, and was left out of the commit.
