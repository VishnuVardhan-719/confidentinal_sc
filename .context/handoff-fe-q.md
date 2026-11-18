# Handoff: fe-q (continuing fe-c3 / PHASE4-C3), worktree C:/Users/Yashwanth/fe2-c, branch feat/fe2-c

Task source: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE4-common.md and PHASE4-C3.md. Previous handoff: .context/handoff-t3j.md (WIP 7550c76 = booking-store).

## DONE (in the shutdown checkpoint commit "wip(fe-q): checkpoint before shutdown")
- Data layer:
  - bookings/schemas.ts: optional `visitReason` (max 240) on createBookingSchema; new `rescheduleSchema`.
  - bookings/api.ts + http.ts: `reschedule` (HTTP gated). HTTP create strips visitReason (B01 has no such field).
  - bookings/fixture.ts: `store` option (shared synthetic marketplace). With store: tick() on every read, past/uncovered-address/overlapping slots refused, respondAt + NOT_INITIATED payment on create, reschedule back to REQUESTED, cancel/decline zero the due amount. Exported `overlapsActiveBooking`.
  - payments/fixture.ts and patient/fixture.ts: `store` option; `PatientApi.addAddress` (+ `newAddressSchema`), HTTP gated.
  - New bookings/slots.ts (fixture slots, next 5 IST days, 6 times/day, HTTP gated) and bookings/journey.ts (server-only factory for all journey APIs).
- Routes (fe-p's patient/bookings* untouched):
  - /[locale]/patient/book (wizard page, loading, shell, actions.ts with session-checked server actions).
  - /[locale]/patient/book/[id] (request page: lead message, booking/payment/visit-record badges, Check for updates, details, cancel + reschedule, timeline, PaymentSummary, ReceiptLink).
  - /[locale]/patient/book/[id]/receipt (paid only; provider-issued, not a tax invoice).
- Components: components/booking/booking-wizard.tsx (7 visible steps using wizardReducer + createBookingSubmitter), slot-picker.tsx, request-actions.tsx.
- doctorBookHref now `/patient/book?providerId&serviceId`; unit test regex updated.
- Strings: booking.wizard/request/receipt in en, real te/hi translations (machine-written by agent, need native review). Generator: .context/booking-strings.mjs + booking-strings-{te,hi}.json.

## Verification so far
- `npx next typegen && npx tsc --noEmit`: exit 0.
- eslint on changed dirs: exit 0.
- Full vitest before string/href fixes: 3 failures (messages copy test, href regex). After fixes, messages.test.ts + doctor-search-ui.test.ts: 112/112 pass. Full suite NOT re-run after the fixes.
- `next build` (FRONTEND_ADAPTER=fixture APP_ENV=test): exit 0.
- No browser/e2e run yet. No server was started; port 3360 is free.

## REMAINING
1. Re-run full `npm test`, `npm run lint`.
2. Start server: `$env:FRONTEND_ADAPTER='fixture'; $env:APP_ENV='test'; $env:FIXTURE_PATIENT_SESSION='self'; $env:FIXTURE_PROVIDER_RESPONSE_MS='1500'; npx next start -p 3360`.
3. Write tests/e2e/booking-journey.spec.ts: happy path doctor 1 (00000000-0000-4000-8000-000000000001, home address PIN 500001) -> pending -> Check for updates -> confirmed with SCV- reference -> reschedule -> cancel; decline path doctor 2 (...0101, add new address PIN 500032); receipt for seeded paid booking 00000000-0000-4000-8000-000000000071; keyboard-only run; axe on each page; projects mobile-390 and desktop-1280. Port doctor cases from directory.spec.mjs / booking-wizard.spec.mjs; leave the rest fixme with reasons.
4. Run: `$env:PLAYWRIGHT_BASE_URL='http://localhost:3360'; $env:FRONTEND_ADAPTER='fixture'; npx playwright test tests/e2e/doctor-search.spec.ts tests/e2e/booking-journey.spec.ts`. Fix real failures.
5. Docs: docs/frontend/BOOKING_JOURNEY.md (22 steps -> routes/tests), REVIEW_NEEDED.md (te/hi booking.wizard/request/receipt need native review), REQUESTS.md (visitReason, reschedule, slots, addAddress contracts missing on backend).
6. Commit and report DONE to lead.

## Known issues / notes
- Shared store is in-memory per server process; e2e tests mutate it (slots get taken). Tests should pick any free slot, not a fixed time.
- Booking ownership is not checked per patient in fixture (single synthetic account).
- Patient cancel always sends reason `patient_request` (cancellation-dialog reasons differ from decisionReasonSchema).
- Patient dashboard still uses its own scenario fixture, so new journey bookings do not appear there (fe-p scope).
- Wizard not yet exercised in a browser: possible runtime issues in focus handling, Tailwind `has-focus-visible:` variant on slot pills, CancellationDialog inside IntlScope.
- `.playwright-mcp/` is untracked and excluded from commits.
