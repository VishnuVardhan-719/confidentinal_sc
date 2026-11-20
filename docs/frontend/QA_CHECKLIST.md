# Manual QA checklist (frontend, synthetic fixture build)

A script for a human tester. It is based on `feat/fe2-integration` at `ab6bedb` (the merge of c `1a0db4f`, d `7c0065d`, e `87bfb6b`, p `8dc301a`). Expected results come from `docs/frontend/BOOKING_JOURNEY.md`, `docs/frontend/SERVICE_REQUESTS.md`, `docs/FRONTEND_MASTER.md`, `AGENTS.md` and the e2e specs named in each section. When this checklist and a spec disagree, the spec wins; file a note.

Everything you see is synthetic. Never type real names, phone numbers, addresses or health details, not even in free-text fields.

Mark each line **P** (pass), **F** (fail: write what you saw and the URL) or **B** (blocked: gated or not built; see "Routes still gated or fixme" below).

## 0. Setup

1. Build and start the integration build (one server; port from `tests/e2e/integration.config.ts`):
   `FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true FIXTURE_BOOKING_SCENARIO=accepted npx next build && npx next start --port 3320`
   For the booking journey, also set `FIXTURE_PROVIDER_RESPONSE_MS=1500` so the doctor answers within a few seconds.
2. **Second pass, clinical gate off:** restart the same build without `FEATURE_CLINICAL`. Use this pass for every "flag off" line. Production ships with the flag off.
3. Sign in at `/en/login` with a synthetic account. Any password of 1 to 128 characters works in fixture mode. The phone OTP is `246810`.

| Role | Account | Use for |
|---|---|---|
| Patient (complete profile) | `patient.complete@example.invalid` | Booking journey, patient workspace |
| Patient (new) | `patient.new@example.invalid` | Onboarding questionnaire, booking gate |
| Patient + doctor | `multi.role@example.invalid` | Workspace chooser, doctor workspace (assigned doctor) |
| Doctor (assigned) | `doctor.active@example.invalid` | Doctor workspace |
| Doctor (other) | `doctor.other@example.invalid` | Isolation checks (must be denied) |
| Doctor (draft) | `doctor.draft@example.invalid` | Provider onboarding |
| Lab | `ops.lab.manager@example.invalid`, `ops.lab.collector.a@example.invalid`, `ops.lab.collector.b@example.invalid`, `ops.lab.reviewer@example.invalid`, `ops.lab.multi@example.invalid` | Lab workspace |
| Ambulance | `ops.ambulance.operator@example.invalid`, `ops.ambulance.driver.a@example.invalid`, `ops.ambulance.driver.b@example.invalid` | Ambulance workspace |
| Caretaker | `ops.care.manager@example.invalid`, `ops.care.a@example.invalid`, `ops.care.b@example.invalid`, `ops.care.independent@example.invalid` | Caretaker workspace |
| Admin | `ops.admin.lead@example.invalid` (all areas, including review moderation), `ops.admin.verifier@example.invalid`, `ops.admin.nogrants@example.invalid`, `ops.admin.auditor@example.invalid`, `ops.content.editor@example.invalid`, `ops.content.publisher@example.invalid` | Admin workspace, CMS |
| Restricted | `disabled@example.invalid`, `caregiver.suspended@example.invalid`, `lab.owner@example.invalid` (pending review), `ambulance.operator@example.invalid` (changes required) | Refusal and setup states |

4. Browsers: current Chrome, plus one real Android phone if available. Use DevTools device mode at **390 x 844** and a desktop window at **1280 x 800**.

## 1. Checks on every page you visit

Do these on each page in sections 2 to 7, at both widths. Do the language and keyboard checks at least once per page type.

| # | Check | Expected |
|---|---|---|
| C1 | Synthetic label | The fixture build shows "Synthetic data, not live" (or the area's synthetic notice) |
| C2 | Width 390 and 1280 | No horizontal scroll; nothing is cut off; sticky bars don't cover the field you are typing in |
| C3 | One main heading | Exactly one `h1`; the page title in the tab matches it |
| C4 | Keyboard | The first Tab shows a visible "Skip to content" link; every control can be reached with Tab and Shift+Tab; the focus ring is always visible; Enter and Space activate; Esc closes dialogs and returns focus to the control that opened them |
| C5 | Language switch | Switch en -> te -> hi from the header. The same page reloads in the new language, at the same path and query (`/te/...`, `/hi/...`). There is no English left (except brand, endonyms and synthetic names) and no raw keys like `booking.request.title`. Telugu and Hindi text wraps and doesn't overflow at 390. Numbers and prices use Indian grouping (e.g. ₹1,500.00) |
| C6 | URL privacy | The address bar never shows a name, phone, email, address, coordinates, OTP, symptoms or note text. Allowed: opaque IDs, booking references, PIN, city, filters, `next=` |
| C7 | Browser storage | DevTools > Application: Local Storage and Session Storage stay empty for the site; cookies are only the session cookies (httpOnly) |
| C8 | Private pages not indexable | On every `/patient`, `/doctor`, `/lab`, `/ambulance`, `/caretaker`, `/admin`, `/account` page, view source has `<meta name="robots" content="noindex...">` (redirect-only role roots are exempt) |
| C9 | Errors | No raw error text or stack trace. Errors show a plain message, a next action (Try again, Back) and at most a reference code |
| C10 | Money | Amounts come from the server snapshot, shown in rupees with paise (`₹800.00`). Online payment is shown as disabled; nothing claims "Paid" unless the record says so |
| C11 | Separate badges | Booking status, payment status and visit-record status are separate badges, never merged into one |
| C12 | Sign out | Sign out is reachable at both widths. After signing out, Back does not show a private page; a private URL asks you to sign in |

## 2. Patient

Account: `patient.complete@example.invalid`. Specs: `booking-journey.spec.ts`, `doctor-search.spec.ts`, `service-requests.spec.ts`, patient specs.

### 2.1 The 22-step doctor booking journey

"Synthetic doctor 1" accepts every request; "Synthetic doctor 2" declines every request. Run the whole table once at 390 and once at 1280. Then do it by keyboard only (section 2.3).

| # | Step | Do | Expected |
|---|---|---|---|
| 1 | Search by city or PIN | Open `/en/doctors`, enter city or PIN with the location picker | Results for that area; invalid PIN shows a field error, not an empty list |
| 2 | Type-ahead | Type "fev" (symptom) or part of a doctor name or speciality | Suggestions list; arrow keys move, Enter picks; picking a symptom maps to a speciality |
| 3 | Location opt-in | "Use my location", allow in the browser | Results sorted by distance; the URL has no lat/lng; nothing in storage (C6, C7). Deny permission: a calm message, search still works |
| 4 | Filters and sort | Apply filters and sort. At 390, open the filter sheet: Apply, Cancel, Clear | Results update; Cancel discards changes; Clear resets; filters are in the URL and survive reload |
| 5 | Doctor profile | Open Synthetic doctor 1 | Fee, area, languages and a truthful booking state. A fully booked doctor shows the request button disabled with the reason |
| 6 | Start a request | "Request a visit" | Goes to `/en/patient/book?providerId=...&serviceId=...` titled "Request a visit with Synthetic doctor 1". Without a doctor: "Choose a doctor first". Not bookable: "This doctor cannot take requests right now" |
| 7 | Visit summary | Step 1 of 7 | Doctor, visit type and fee set by the doctor |
| 8 | Patient | Step 2: choose self (or an authorised family member) | Profile readiness shown ("n of N"); an incomplete profile blocks with a link to finish it |
| 9 | Consent | Continue without ticking consent | Error summary; focus moves to the consent checkbox |
| 10 | Saved address | Step 3: pick a saved address inside the doctor's area | Addresses outside the area are marked and can't be picked |
| 11 | New address | Add an address (submit empty first) | Field errors with focus on the first one; after saving, the new address is selected |
| 12 | Slot | Step 4: pick a day, then a time | Times shown in IST (one-hour visits); arrow keys move between options |
| 13 | Note | Step 5: optional note, max 240 characters | Counter, hard limit; the note never appears in the URL or storage |
| 14 | Fee and policy | Step 6 "Fee and cancellation"; Continue without accepting | "Accept the fee and the cancellation policy to continue." Online payment disabled, pay after visit. The fee equals the profile fee |
| 15 | Review | Step 7 | Every answer with a Change link back to its step; explicit confirmation needed |
| 16 | Submit | Press Send (double-click it once) | Exactly one request is created. If the slot was taken meanwhile: back to the time step with an explanation, other answers kept |
| 17 | Pending | Request page `/en/patient/book/<id>` | "Waiting for Synthetic doctor 1 to answer", no reference yet, "Check for updates" with a last-updated time |
| 18 | Accepted | Wait a few seconds, Check for updates | Confirmed, with a server reference `SCV-xxxxxx` |
| 19 | Declined | Repeat steps 5 to 16 with Synthetic doctor 2 and a new address | Declined, "not charged", "Find another doctor"; no Cancel button |
| 20 | Badges | On the request page | Booking, payment (Not initiated, Payment due, Paid) and visit-record badges are separate (C11) |
| 21 | Reschedule and cancel | Change time (the doctor must accept again); then "Cancel request" | The cancel dialog "Cancel this booking?" keeps "Cancel booking" disabled until you tick "I have read the cancellation terms"; then "This request is cancelled" and no Cancel button. Flag: the cancellation window shown is synthetic (2 hours); in http mode the dialog must say terms are unavailable and refuse |
| 22 | Receipt | Open `/en/patient/book/00000000-0000-4000-8000-000000000071/receipt` | Provider-issued receipt: "This receipt confirms payment to the doctor. It is not a tax invoice." |

### 2.2 Other patient flows

| # | Flow | Expected |
|---|---|---|
| P1 | `patient.new`: dashboard, then try to book | Onboarding questionnaire first; booking blocked until complete |
| P2 | Lab tests: `/en/patient/lab-tests` | PIN discovery; choose tests and time; the lab accepts; cancel works; a declining lab points elsewhere; a lab outside every saved address can't be requested |
| P3 | Caretaker: `/en/patient/caretakers` | One non-clinical shift; hours before start time; accept, decline (nothing due), cancel |
| P4 | Ambulance: `/en/patient/ambulance` | Every page leads with the 112 emergency notice (a `tel:` link that works with JavaScript off); scheduled transfer only, no ETA, no dispatch |
| P5 | Bookings `/en/patient/bookings` and detail | Tabs; separate badges; cancellation shows server policy and consequences first |
| P6 | Records `/en/patient/records` (flag on) | Signed records only, newest first, read-only; PDF link short-lived. Flag off: gate notice and no data |
| P7 | Family, saved doctors, reviews, reminders, notifications | Honest empty states; reviews start "pending moderation"; edit sends a review back to moderation; withdraw is final |
| P8 | Public pages signed out: `/en`, `/en/lab-tests`, `/en/stories`, `/en/emergency` | Lab directory filters by test and city; emergency shows 112 and dispatch "not available" |

### 2.3 Keyboard-only run (patient)

Unplug or ignore the mouse. Complete steps 1 to 21 using Tab, Shift+Tab, Enter, Space, arrows and Esc only. **Expected:** every step can be completed. The step heading takes focus after each Next. Error summaries take focus and link to their fields. The cancel dialog traps focus and returns it to "Cancel request".

## 3. Doctor

Accounts: `doctor.active` (or `multi.role`), `doctor.other`. Specs: `doctor-workspace.spec.ts`, `doctor-consultation.spec.ts`, `doctor-reviews.spec.ts`, `proof-check.spec.ts`.

| # | Flow | Expected |
|---|---|---|
| D1 | Signed out, open `/en/doctor/dashboard` | Login with a safe `next=` |
| D2 | Dashboard | Synthetic notice, pending request, today's visits, active consultation; no horizontal scroll at 390 |
| D3 | Request before accepting | Locality/PIN, price and respond-by only; never the patient's name, phone or address |
| D4 | Decline, accept | Decline needs a reason. Accepting in a second tab conflicts instead of overwriting |
| D5 | Visit: en route -> arrived -> arrival code | 6-digit numeric input with expiry and attempts; letters rejected; wrong codes count down and clear the field; at the limit the form locks and offers only a new code |
| D6 | Consultation editor (flag on) | Five steps in spec order; the sticky header shows reference, allergy warning and draft status; autosave; inputs disabled until the page has loaded; a missing field on sign-off shows a focused error summary; attest and sign off -> read-only signed notes |
| D7 | Prescription draft | "Draft - not issued"; no issue action; templates fill a medicine; storage stays clean |
| D8 | Records | Signed view; PDF link; amendment adds a version, doesn't overwrite |
| D9 | Reviews `/en/doctor/reviews` | Average over published reviews only; pending and rejected show no rating or text. Known issue D2 in ADVERSARIAL_REVIEW: they show an exact submission date |
| D10 | `doctor.other` opens the assigned doctor's visit URL | Denied state, no patient data; a malformed ID is "not found" |
| D11 | Flag off pass | Consultation, prescription, records, reviews and verify show the clinical gate notice and no form |
| D12 | Proof of visit `/en/verify` | Works by keyboard and without JavaScript (form -> `/verify/check` -> result). Empty or malformed code: field error; valid code: only date, service and doctor, no patient data |

## 4. Lab

Accounts: `ops.lab.*`. Spec: `lab.spec.ts`.

| # | Flow | Expected |
|---|---|---|
| L1 | Manager dashboard | Real queue counts, branch status, synthetic notice |
| L2 | Orders list and detail | Price snapshot, collector, separate statuses |
| L3 | Failed collection | Offers recollection as a new request and keeps the failed order |
| L4 | Catalogue | No unapproved turnaround claims; price edits go through server validation (prefilled price shows exact paise) |
| L5 | `ops.lab.multi` | Must choose one lab; never sees combined results |
| L6 | Collector A / B | Sees only assigned jobs; a failed collection needs a reason; can't open collector B's jobs |
| L7 | Reviewer | Release offered only for a reviewed report, never by the uploader |
| L8 | Flag off pass | The reports page shows the gate notice, not data; completed collection never claims a report is ready |
| L9 | `lab.owner` (pending review) | Setup dashboard; operational pages redirect (automated case is still `fixme` in `onboarding.spec.ts`) |

## 5. Ambulance

Accounts: `ops.ambulance.*`. Spec: `ambulance.spec.ts`.

| # | Flow | Expected |
|---|---|---|
| A1 | Operator dashboard | Real counts, credential expiry, no ETA wording |
| A2 | Fleet | A vehicle type is shown only when verified |
| A3 | Requests | Accept is blocked for a stale quote and allowed for a fresh one; decline always needs a reason |
| A4 | Operator vs driver | The operator can't record driver milestones; driver A sees only their current trip and one next step; driver B can't open driver A's trip |
| A5 | Emergency `/en/ambulance/emergency` | Dispatch unavailable even with the flag on; "Call 112" always visible as a `tel:` link, also with JavaScript disabled |
| A6 | Hindi | Licence expiry "0 days left" reads correctly. Known defect: shows "1 दिन बाकी" (REQUESTS R-FE-Q-R9C3-1) |

## 6. Caretaker

Accounts: `ops.care.*`. Spec: `caretaker.spec.ts`.

| # | Flow | Expected |
|---|---|---|
| K1 | Manager dashboard | Real counts and the synthetic notice |
| K2 | Services | Rates per period; periods the backend doesn't support yet are marked |
| K3 | Staff and requests | Visible to the manager; replacement only for an absent shift |
| K4 | Recurring plans | Gate notice; no purchase or schedule controls |
| K5 | Caregiver A / B | Own assignments only; check-in records a server timestamp; no clinical actions; agency staff and services are denied |
| K6 | Independent caregiver | Manages own services; no staff page |
| K7 | `caregiver.suspended` | Refused, with Sign out available |

## 7. Admin

Accounts: `ops.admin.*`, `ops.content.*`. Specs: `admin-ops.spec.ts`, `admin-verification.spec.ts`, `admin-review-moderation.spec.ts`, `cms.spec.ts`.

| # | Flow | Expected |
|---|---|---|
| M1 | Lead admin dashboard | Only real queue counts and every assigned area |
| M2 | No-grants admin | Empty state; every area denied |
| M3 | Org auditor | Audit only; the audit list never shows secrets or contact data |
| M4 | Booking search | Accepts only a booking reference (via a form, not the URL); booking and payment are separate badges |
| M5 | Own grants | An admin can't change their own grants |
| M6 | Payments | Pay-after collections are never shown as gateway payments; refund approval is gated |
| M7 | Support queue | Owner and status, no SLA promises |
| M8 | Settings | Read-only, shows gates |
| M9 | Verification (`ops.admin.verifier`) | Only items needing action, oldest first; filters in the URL; the private document viewer is gated (no URL issued); approve needs a reason and a confirm dialog; a stale tab gets a conflict |
| M10 | Review moderation (lead admin) `/en/admin/reviews` | Queue without patient identity; filters in the URL; publish, or decline with a required reason; `/en/admin/reviews/log` is read-only, newest first, with no patient identity or review text |
| M11 | CMS editor vs publisher | The editor can save and preview but not publish. The publisher publishes; revision history updates the public FAQ; a newer draft doesn't change the live story. Script or raw HTML is rejected with a field error |
| M12 | Non-admin opens `/en/admin/dashboard` | Sent to their own landing, no queue data |

## 8. Routes still gated or fixme

A **B** (blocked) result is expected on these.

### 8.1 Gated by a feature flag (off in production)

| Gate | Routes | What you see |
|---|---|---|
| `clinical` (`FEATURE_CLINICAL`) | `/doctor/visits/[id]/consultation`, `/doctor/consultations/[bookingId]`, `/doctor/consultations/[bookingId]/prescription`, `/doctor/records/[id]`, `/doctor/reviews`, clinical panels on `/doctor/visits/[id]`, `/patient/records`, `/patient/records/[id]`, `/verify`, `/verify/[code]`, `/lab/reports` (lab release) | Clinical gate notice, no form, no data |
| `emergencyDispatch` | `/emergency` (dispatch part), `/ambulance/emergency` | "Not available"; 112 always shown. Stays unavailable even if the flag is switched on |
| `subscriptions` | `/memberships` | Status gate notice; no purchase |
| `livePayments` | Online payment in the booking journey, refund approval in `/admin/payments` | Disabled, with a reason |
| `automatedPayouts` | `/doctor/earnings` | Payouts gate notice |
| Recurring billing | Recurring plans in the caretaker workspace | Gate notice |

### 8.2 Gated until a backend contract exists (shown only with `FRONTEND_ADAPTER=http`)

In http mode these show a "not connected yet" notice (`GateNotice reason="contract_pending"`) or an honest empty state, never invented data. The proposed endpoints are in `docs/frontend/REQUESTS.md`.

- **Public:** `/doctors`, `/doctors/[id]` (doctor search fields), `/lab-tests`, `/lab-tests/[id]`, `/stories`, `/stories/[slug]` (HTTP 200 "not available yet").
- **Patient:**
  - `/patient/dashboard`, `/patient/bookings`, `/patient/bookings/[id]`.
  - The booking journey's slots, addresses, reschedule and cancellation terms (the cancel dialog says terms are unavailable).
  - `/patient/lab-tests`, `/patient/lab-tests/request`, `/patient/caretakers`, `/patient/caretakers/request`, `/patient/ambulance`, `/patient/ambulance/request`.
  - `/patient/family`, `/patient/family/[memberId]`, `/patient/saved`, `/patient/reviews`, `/patient/reviews/[bookingId]`, `/patient/reviews/[bookingId]/edit`, `/patient/settings/reminders`, `/patient/notifications`.
  - Parts of `/patient/onboarding`, `/patient/health-profile` and `/patient/records`.
- **Doctor:** `/doctor/requests/[id]` (decline reasons, resources), visit actions without a contract, consultation, records and reviews.
- **Operations:** lab, caretaker and ambulance workspaces (their http adapters are gated), `/admin/audit`, `/admin/reviews`, `/admin/reviews/log`, the CMS, the private document viewer in `/admin/providers/[id]` and `/admin/coverage` decisions without a contract.

### 8.3 E2E cases still `fixme` (not automated; check by hand or mark B)

| Spec | Pending cases | Why |
|---|---|---|
| `tests/e2e/booking-wizard.spec.mjs` | 13 FE08 `fixme` declarations for other categories (eight-step wizard, stale slot, offline, family grant, multi-test total, missing policy) | Old contract (scenario runner, `/patient/bookings/new`); doctor cases are covered by `booking-journey.spec.ts` |
| `tests/e2e/directory.spec.mjs` | 7 FE07 `fixme` declarations (four categories, PIN state, stale refetch, skeleton/retry) | Same old contract; doctor and lab are covered by `doctor-search.spec.ts` and `lab-directory.spec.ts` |
| `tests/e2e/patient-workspace.spec.mjs` | 16 cases (widths, tabs, account gates, te/hi wrapping, no next visit, truncated pages, cancellation policy, records, notification rollback, support reference, workspace switch, logout, direct URLs, provider isolation, 112 without JS) | Needs the appObserver harness; several are covered by newer patient specs |
| `tests/e2e/patient-workspace.spec.ts` | 4 records cases (list, detail, malformed IDs, gate off) | Records routes under real sign-in |
| `tests/e2e/patient-records.spec.ts` | Notifications list and empty inbox | Notification inbox ownership |
| `tests/e2e/navigation.spec.ts` | Role workspace navigation (whole describe) | Pages owned by other workstreams |
| `tests/e2e/onboarding.spec.ts` | Booking blocked until the questionnaire is complete; pending-review provider redirects | Cross-workstream pages |

Specs that **skip** unless the server runs in a matching mode (not gaps; run them in that mode): doctor-search HTTP-only cases, `admin-review-moderation`, `patient-family`, `patient-reminders`, `patient-reviews`, `patient-saved`, `patient-review-changes` (session or guest fixture modes), `lab.spec.ts` and `patient-records.spec.ts` flag on and off passes, and `perf.spec.ts` (`E2E_PERF=1`, mobile only).

## 9. Known defects to confirm, not re-report

These are open in `docs/frontend/ADVERSARIAL_REVIEW.md` and `REQUESTS.md`:
- Hindi counts of zero read "1 ..." (licence days, OTP attempts, error summary, lab test count).
- Doctor reviews: pending and rejected cards show the exact submission date (D2); a withdrawn review breaks the page (D1).
- Signup role picked before the page finishes loading is reset (R6-1).
- Stories: in http mode any `/stories/<slug>` returns 200 and is indexable (E1).
- Fixture adapter guard checks only `APP_ENV` (finding 2).
- Four different money formatters: payment pages show "₹800", others "₹800.00" (finding 3).
