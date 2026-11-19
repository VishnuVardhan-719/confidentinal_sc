# Review needed

Items that need a human decision or a native-speaker review before release.

## fe-p: patient bookings pages (feat/fe2-p)

### Translations (machine-written te/hi, need native review)
These keys in `src/messages/te/patient.json` and `src/messages/hi/patient.json` were English placeholders and now hold machine-written Telugu/Hindi. `patient.booking.timeline.actor.system` stays "SureCure Visit" (brand) and is allow-listed in `tests/unit/messages.test.ts`:
- `patient.shell.nav.healthProfile`
- every key under `patient.bookings.*` (list page: title, filters, empty states, pager, states)
- every key under `patient.booking.*` (detail page: status, provider decision, visit, timeline, fee/payment, cancel, reschedule)

### Contract gaps (fail closed, not faked)
- **Reschedule:** B01 has no reschedule endpoint. The reschedule form validates a preferred India-time slot, then `requestRescheduleAction` returns `gated`. The page tells the patient before they fill it in, and after submit it says nothing was sent. A backend contract is needed (suggested: `POST /api/bookings/:id/reschedule-requests` with `expectedVersion`, `startAt` UTC, idempotency key).
- **Cancel grants:** the bookings loader passes no `serverAllowedActions`, so `permittedActions` never marks patient cancel as granted. The detail page still offers a cancel *request* when the actor and state allow it (`patientCancelState` → `request`), and the server decides (ownership, state, policy window). It returns `conflict` when it refuses. Lead to confirm this, or to require a server grant before showing the form.
- **Status filter:** the B01 list endpoint has no status filter. The filter groups the bookings on the page that was loaded (10 per page) and the page says so. The pager is forward-only (`Next page` / `Back to first page`) because cursors are opaque booking ids.
- **Provider name:** read from the public directory (`ProvidersApi.get` with the booking's category and PIN). If the provider is no longer listed, the page shows "Provider details are not available" and keeps the booking.
- **Fixture mode:** each request builds a fresh in-memory bookings fixture, so a successful synthetic cancel is not visible after refresh. Use `FIXTURE_BOOKING_SCENARIO` (server env) to pick a state.

### Routes
- `/patient/profile` and `/patient/health-profile` are linked from the patient nav. They are built on `feat/fe2-b` (`src/app/[locale]/patient/(intake)/…`, commit ed384ee) and are not on this branch, so the links 404 here until fe2-b is merged.

## fe-p: patient records and notifications (feat/fe2-p)

### Translations (machine-written te/hi, need native review)
- `patient.shell.nav.records`, `patient.shell.nav.notifications`
- every key under `patient.records.*`, `patient.record.*` and `patient.notifications.*` in `src/messages/te/patient.json` and `src/messages/hi/patient.json`

### Contract gaps and decisions
- **Records http adapter:** `listMyRecords` and `requestMyRecordPdfLink` return `gated` in http mode (no DC09/DC14 patient contract yet). With `FEATURE_CLINICAL` off every records method is gated and the pages show the clinical gate notice.
- **Record detail privacy:** unknown, draft, other-patient and malformed ids all render the same "not available" state. A guest's login return path is `/patient/records`, never the record id.
- **Notifications:** the http adapter has no in-app inbox contract and returns `gated`; the page says notifications are not available yet and links to bookings. The fixture inbox is not patient-scoped and is rebuilt on every request, so "Mark as read" does not persist after a reload. `FIXTURE_NOTIFICATION_SCENARIO=empty` (server env) shows the empty inbox.
- **Public `loading.tsx`:** added only at `doctors/[id]` (that route already sat under `doctors/loading.tsx`). A group-level `(public)/loading.tsx` breaks the build: the `[...rest]` catch-all calls `notFound()` inside the boundary during prerender. Per-route `loading.tsx` on the static public pages (about, emergency, faq, terms and so on) makes the page show only the skeleton when JavaScript is off, which failed the no-JS e2e for `/hi/emergency` (tel:112) and `/en/faq`. Those were left out on purpose. Lead to confirm.

## fe-p R7: patient account features (feat/fe2-p)
- New namespace `patientAccount` (`src/messages/{en,te,hi}/patientAccount.json`). te/hi are machine-written and need native review: every key under `patientAccount.family.*`.
- Family relation labels (`patientAccount.family.relation.*`): check the wording for grandparent (te: "తాత లేదా అమ్మమ్మ", hi: "दादा-दादी या नाना-नानी").
- te/hi machine-written: every key under `patientAccount.saved.*`.
- te/hi machine-written: every key under `patientAccount.reviews.*` (including the star labels `form.ratingLabels.*`).
