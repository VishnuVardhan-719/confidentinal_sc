# Review needed

Items that need a human decision or a native-speaker review before release.

## fe-p: patient bookings pages (feat/fe2-p)

### Translations (te/hi are English placeholders)
These keys in `src/messages/te/patient.json` and `src/messages/hi/patient.json` currently hold English text and need Telugu/Hindi translations:
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
