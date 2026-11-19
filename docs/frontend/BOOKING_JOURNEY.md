# Patient doctor-booking journey (PHASE4-C3)

Branch `feat/fe2-c`. Fixture adapter only: every value is synthetic and labelled "Synthetic data, not live". The HTTP adapter returns `gated` for every journey call that has no agreed backend contract (see `REQUESTS.md`, 2026-11-19 entry).

Run the server with `FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PROVIDER_RESPONSE_MS=1500 npx next start -p <port>`. The synthetic store (`src/fixtures/marketplace/booking-store.ts`) is in memory per server process: "Synthetic doctor 2" declines every request; every other synthetic doctor accepts and the booking is confirmed with a server-made `SCV-` reference after `FIXTURE_PROVIDER_RESPONSE_MS`.

## The 22 steps

| # | Step | Route / component | Covered by |
|---|---|---|---|
| 1 | Search by city or PIN | `/[locale]/doctors`, LocationPicker | doctor-search.spec.ts |
| 2 | Search by name, speciality or symptom (type-ahead) | DoctorSearch combobox | doctor-search.spec.ts "type-ahead" |
| 3 | Location opt-in (browser geolocation, never in URL or storage) | LocationPicker "Use my location" | doctor-search.spec.ts "keeps coordinates out of the URL" |
| 4 | Results with filters and sort (mobile drawer: Apply, Cancel, Clear) | DoctorResults, filter sheet | doctor-search.spec.ts "mobile filter drawer", "sorts, filters" |
| 5 | Doctor profile with fee, area and a truthful booking state | `/[locale]/doctors/[id]` | booking-journey "happy path"; doctor-search "profile" (fully booked doctor disabled) |
| 6 | Start a request (Request a visit) | `/[locale]/patient/book?providerId&serviceId` | booking-journey "happy path", "refuses to start" |
| 7 | Doctor and visit summary (fee set by the doctor) | BookingWizard step 1 | booking-journey |
| 8 | Patient: self or authorised family member, profile readiness | PatientGate (step 2) | booking-journey |
| 9 | Consent to share health details with the visiting doctor | PatientGate | booking-journey (error + focus when missing) |
| 10 | Address: saved address inside the doctor's area | LocationStep (step 3) | booking-journey "happy path" |
| 11 | Address: add a new address when saved ones are outside the area | AddressForm | booking-journey "decline path" (validation focus, save, auto-select) |
| 12 | Slot picking: day then time, IST, one-hour visits | SlotPicker (step 4) | booking-journey (all tests; keyboard arrows in keyboard test) |
| 13 | Symptoms or visit note (optional, 240 chars, never in URL or storage) | DetailsStep (step 5) | booking-journey, `expectNoPrivateDraft` |
| 14 | Fee (server price snapshot in paise) and cancellation policy; online payment disabled | PolicyStep (step 6) | booking-journey |
| 15 | Review with Change links and explicit confirmation | ReviewStep (step 7) | booking-journey |
| 16 | Submit once with one idempotency key; slot taken meanwhile sends the patient back to the time step | `createBookingSubmitter`, `send()` | booking-journey `send()` (conflict recovery), unit booking-submit.test.ts |
| 17 | Pending state ("Waiting for ... to answer"), no reference yet, Check for updates | `/[locale]/patient/book/[id]` | booking-journey |
| 18 | Accepted and confirmed, server reference `SCV-xxxxxx` | request page lead notice | booking-journey "happy path" |
| 19 | Declined, not charged, Find another doctor | request page | booking-journey "decline path" |
| 20 | Payment state badge separate from booking and visit-record badges (pay after visit; Not initiated, Payment due, Paid) | request page status list, PaymentSummary | booking-journey (badges rendered, axe), unit tests |
| 21 | Reschedule (doctor must accept again) and cancel (reason + terms acknowledgement) | RequestActions, CancellationDialog | booking-journey "happy path" and keyboard test |
| 22 | Receipt for a paid visit, provider-issued, not a tax invoice | `/[locale]/patient/book/[id]/receipt` | booking-journey "receipt" (seeded paid booking `...0071`) |

Every page state above runs axe (WCAG 2 A/AA) and a no-horizontal-scroll check on both Playwright projects (`mobile-390`, `desktop-1280`). The keyboard test completes and cancels a request with Tab, Space, Enter and arrow keys only.

## Payment data

There is no `payment.json` fixture. Payment summaries come from `src/fixtures/marketplace/payments.ts` through the shared store: a new request is `NOT_INITIATED`, a confirmed one is `DUE` with the snapshotted fee, a declined or cancelled one has 0 due, and the seeded completed visit is `PAID` with a receipt. Live payments stay disabled.

## Legacy specs

`tests/e2e/directory.spec.mjs` and `tests/e2e/booking-wizard.spec.mjs` (FE07/FE08) stay `fixme`. They target a different contract: a scenario runner (`E2E_FIXTURE_SCENARIO`), storage-state logins, four provider categories, `/patient/bookings/new` (owned by fe-p) and data-test ids this UI does not use. Their doctor cases are covered by `doctor-search.spec.ts` and `booking-journey.spec.ts`. Lab, ambulance and caretaker cases wait for those booking flows.

## Known limits

- The store is per process and tests mutate it. Tests pick slots by position per project and recover from a taken slot. Restarting the server resets it.
- Booking ownership is not checked per patient in the fixture (one synthetic account).
- Patient cancel always sends the reason `patient_request`; the dialog's reasons are not yet mapped to `decisionReasonSchema`.
- The patient dashboard uses its own scenario fixture, so journey bookings do not show there (fe-p scope).
- Under heavy machine load (little free RAM) run Playwright with `--workers=2`; with the default worker count page loads timed out.
