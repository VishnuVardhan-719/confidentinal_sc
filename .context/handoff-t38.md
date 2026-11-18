# Handoff t38: fe-p (feat/fe2-p)

## Done
- Fast-forwarded feat/fe2-p from 0f2482f to integration head 2276679, because the patient dashboard and session helper only existed there.
- Patient bookings list `/[locale]/patient/bookings`: URL status filter (all/upcoming/past/cancelled, grouping of the loaded page), forward cursor pager, empty, filter-empty, end, error, gated and denied states, loading.tsx, error.tsx.
- Booking detail `/[locale]/patient/bookings/[id]`: separate booking, visit, payment and clinical badges; read-only provider decision; visit details (IST); provider from the public directory; fee in paise; payment summary; timeline; cancel request (ConfirmDialog with acknowledgement, server action `cancelBookingAction`); reschedule form that fails closed as `gated` (no B01 contract).
- Guard: interim `getPatientSession` + `patientLoginRedirect` with a safe return path.
- Nav: health-profile link added to the dashboard nav and to the new PatientShell. Profile and health-profile pages are on feat/fe2-b (ed384ee), not built here.
- Strings: en plus te/hi English placeholders (listed in docs/frontend/REVIEW_NEEDED.md).
- Tests: tests/unit/modules-patient (17 pass); tests/e2e/patient-bookings.spec.ts.

## Verification (this session)
- `npm run typecheck` / `npx tsc --noEmit`: exit 0
- `npm run lint`: exit 0
- vitest: modules-patient 17/17; messages/ui-components/modules-clinical 230/230
- `npm run build` (Turbopack): exit 0
- Playwright, port 3380, workers=1: session mode 18/18 (both projects), guest mode 2/2. Screenshots at 390 and 1280 px looked right, with 0 console errors.

## Environment caveat (fix first)
- Turbopack refused the node_modules junction (it resolves outside the root). The junction was MOVED to `C:\Users\Yashwanth\.fe2p-node_modules-junction` and `fe2-p/node_modules` is now a robocopy of fe2-int's node_modules. To restore: delete fe2-p/node_modules (it is a real directory copy), then `Move-Item C:\Users\Yashwanth\.fe2p-node_modules-junction C:\Users\Yashwanth\fe2-p\node_modules`.
- `next build --webpack` builds, but Tailwind is missing from the output (this project uses @tailwindcss/turbopack). Don't use it for visual checks.

## Commands
- Session server: `FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PATIENT_SESSION=self FIXTURE_BOOKING_SCENARIO=requested next start -p 3380`
- Session e2e: `E2E_FEP_MODE=session PLAYWRIGHT_BASE_URL=http://localhost:3380 npx playwright test tests/e2e/patient-bookings.spec.ts --workers=1`
- Guest e2e: restart the server without FIXTURE_PATIENT_SESSION and run with `E2E_FEP_MODE=guest`.

## Remaining / known issues
- Lead review needed: committed as a WIP checkpoint, not the final commit.
- tests/e2e/patient-workspace.spec.mjs (another agent's fixme harness) assumes tabs, testids, storage states and an observer module that these pages don't use. It was not un-fixme'd.
- Contract gaps: reschedule endpoint, patient cancel grant (`serverAllowedActions`), server-side status filter. See REVIEW_NEEDED.md.
- Fixture mode: a cancel doesn't persist across requests, because each request gets a fresh fixture.
- Not run: the full vitest suite (only the targeted suites).
