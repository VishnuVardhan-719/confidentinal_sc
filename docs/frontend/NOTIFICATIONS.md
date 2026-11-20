# Patient notifications and reminder preferences (fe-p)

Status at R9-P3 (branch `feat/fe2-p`): fixture adapters only. Both http adapters return `gated` and make no network calls. Nothing here sends a message. Delivery (SMS, WhatsApp, email) belongs to the backend outbox, which does not exist yet.

## Pages

| Route | What it does | Files |
|---|---|---|
| `/{locale}/patient/notifications` | In-app inbox, newest first. Each item shows only the event kind and time, never health details. It links to the booking page when the server names a booking. Mark-as-read is optimistic and rolls back on failure. | `src/app/[locale]/patient/notifications/{page,actions,api}.ts(x)`, `_components/notifications-body.tsx` (all states), `src/components/patient/notifications-inbox.tsx`, `src/components/notifications/*` |
| `/{locale}/patient/settings/reminders` | Visit-reminder channels and quiet hours. Saves are version-checked. | `src/app/[locale]/patient/settings/reminders/*` (`_components/reminder-body.tsx` renders the states), `src/modules/reminder-prefs/*` |

The data layer for the inbox (`src/modules/notifications/*`, `src/fixtures/marketplace/notifications.ts`) is fe-c's marketplace module. fe-p owns the page, the server action, the page-level adapter choice and the inbox UI.

## Inbox

- Kinds with copy: `booking_requested`, `booking_accepted`, `booking_declined`, `booking_cancelled`, `payment_update`, `report_available`, `shift_update`. An unknown kind renders as a generic "You have an update".
- Links: only `/patient/bookings/{bookingId}`, built on the server from a validated uuid. `isInternalPath` refuses anything that is not a single-slash internal path.
- Mark read: the server action `markNotificationReadAction(id, expectedVersion)` re-validates the uuid and version and re-checks the patient session. A version mismatch returns `conflict`, and the UI restores the item's earlier state. Nothing is logged.
- States: `gated` shows "not available yet" with a link to bookings, never an empty inbox that looks real. `forbidden`/`not_found` show a denied notice. Other errors show an inline error with retry. If any row fails `notificationSchema`, the whole list shows an error with retry (never a partial inbox).
- Fixture scenarios (server env, fixture mode only): `FIXTURE_NOTIFICATION_SCENARIO=empty` gives the empty inbox; without it the inbox has unread items.
- Contract: there is no in-app list or mark-read endpoint. The outbox is not an inbox contract (see the R-E entries near the top of `REQUESTS.md`).

## Reminder preferences

### Channels

`REMINDER_CHANNELS = ["sms", "whatsapp", "email"]` (`src/modules/reminder-prefs/types.ts`).

| Channel | UI label (en) | Hint shown |
|---|---|---|
| `sms` | SMS text message | To the mobile number on your account. |
| `whatsapp` | WhatsApp | Only if you use WhatsApp on that number. |
| `email` | Email | To the email on your account, if you added one. |

- In-app booking status always shows in the account. It is not a preference and cannot be turned off.
- With every channel off, the page warns before saving ("You will not get visit reminders outside your account."). Saving is still allowed.
- Proposed defaults for a new account (needs product confirmation): SMS on, WhatsApp off, email off.

### Quiet hours

- Shape: `{ enabled, start: "HH:MM", end: "HH:MM" }` in India time (IST, `Asia/Kolkata`), stored as wall-clock times rather than UTC instants.
- The window may run past midnight (start later than end, for example 21:00 to 07:00). The end time is exclusive. `inQuietHours(q, now)` in `src/modules/reminder-prefs/status.ts` is the rule the sender should apply. `spansMidnight` drives the "This runs overnight" line.
- Validation (`validateReminderPrefs`, shared by the client and the adapter): when enabled, start and end must match `HH:MM` (00:00 to 23:59) and must differ. Codes: `quiet_start_invalid`, `quiet_end_invalid`, `quiet_same`. When disabled, the stored times are kept and not checked.
- Proposed default: on, 21:00 to 07:00 IST.
- Quiet hours apply to visit reminders only. Whether safety-critical or booking-critical messages bypass them is open (see the TODOs below).

### Saving

- `update(input, expectedVersion)` is version-checked. A stale tab gets `conflict` and a "Reload preferences" button (`router.refresh()`).
- The form controls stay disabled until the page has hydrated (R9-P2). Before that, typed values never reached React state, and an early Save did a native GET that put the form in the URL.
- Fixture store: one record per synthetic patient, kept in server memory. Owner-scoped, but not a security boundary.

## Opt-in and wording TODOs (need product/legal before any live sending)

1. **SMS consent (TRAI TCCCPR / DLT).** Reminders are transactional/service messages. Templates must be registered on DLT with the sender ID (header) of the confirmed legal entity, which is still unconfirmed. Decide whether turning SMS on in this page counts as consent, or whether consent is captured at sign-up with its own recorded wording, time and version.
2. **WhatsApp opt-in.** WhatsApp Business policy needs an explicit opt-in naming WhatsApp and the business. The current hint ("Only if you use WhatsApp on that number.") is not opt-in text. Add a consent line and record consent (time, wording version, number) on the server. Template approval is per message.
3. **Email.** Add a one-click unsubscribe link in each email, and decide whether reminder emails count as transactional.
4. **Defaults.** Confirm SMS on by default. If it needs explicit consent, the default must be off and the page must say so.
5. **Quiet-hours bypass.** Decide which messages ignore quiet hours (for example a provider cancelling a visit within the next hours). The page currently says only visit reminders are affected; update the copy if that changes.
6. **Language.** Messages should go out in the account's preferred locale (en/te/hi). There is no preference field for that yet. Translated templates also need DLT/WhatsApp registration per language.
7. **Health details.** Reminder text must not include diagnosis, test names or report contents. The inbox already shows kind and time only; the outbox templates must follow the same rule.
8. **Withdrawal record.** Turning a channel off must be honoured by the sender on its next run and recorded for audit. The UI cannot guarantee that.

Items 1 to 4 block any live SMS or WhatsApp sending. They are not needed for the fixture UI.

## Contract requests

- `REQUESTS.md` R-FE-P-R7-4: `GET` and `PUT /api/patient/reminder-preferences` with `expectedVersion`; `409` on a version mismatch; `422` with `fields.quietStart|quietEnd`. The outbox must apply the preferences on the server.
- In-app inbox list and mark-read: no endpoint yet (see the R-E entries in `REQUESTS.md`).

## Tests

- Unit: `tests/unit/modules-patient/inbox-states.test.ts` (both pages: loading, empty, error, gated, denied, malformed and ready, in en/te/hi); `tests/unit/modules-patient/reminder-prefs.test.ts` (validation, quiet-hours rule across midnight, version conflicts, adapter gating); `tests/unit/ui-phase2.test.ts` (inbox list, read state, internal links); `tests/unit/modules-marketplace/*` (notification fixtures and optimistic read with rollback).
- e2e (fixture servers, `pwsh .context/fep-e2e-all.ps1`):
  - `tests/e2e/patient-reminders.spec.ts`: IST guidance, validation and focus, an overnight window that persists, all-channels-off warning, stale-tab conflict, te/hi, guest redirect with a safe `next`, controls disabled until hydration.
  - `tests/e2e/patient-records.spec.ts`: inbox flows.
  - `tests/e2e/a11y-sweep-p.spec.ts`: both pages in the route sweep. The inbox is also swept in te/hi. Both pages are swept in en/te/hi with the overlay open: menu sheet at 390, language menu at 1280 (see R-FE-P-R9-2).
