# Patient lab tests, caretakers and ambulance transfers (PHASE-R6-C)

Branch `feat/fe2-c`. Fixture adapter only ("Synthetic data, not live"); HTTP adapters fail closed with `gated` (see `REQUESTS.md`, 2026-11-19 R6-C entry).

## Routes

| Service | Discover (PIN filter) | Request form | Request status |
|---|---|---|---|
| Lab tests at home | `/[locale]/patient/lab-tests` | `/patient/lab-tests/request?providerId=` | `/patient/lab-tests/requests/[id]` |
| Caretakers | `/[locale]/patient/caretakers` | `/patient/caretakers/request?providerId=` | `/patient/caretakers/requests/[id]` |
| Scheduled ambulance transfer | `/[locale]/patient/ambulance` | `/patient/ambulance/request?providerId=` | `/patient/ambulance/requests/[id]` |

The URL carries only a public PIN filter and the public provider id. Notes, addresses, tests and times stay in component state, never in the URL or browser storage.

## Code

- `src/modules/service-requests/`: shared request shape (`core.ts`), synthetic engine and gated HTTP adapter (`fixture-engine.ts`), server patient API (`server.ts`).
- `src/modules/{lab-orders,care-requests,ambulance-requests}/`: `types`, `schemas` (Zod, strict), `status` (booking / payment / record badges), `pricing` (shared by server snapshot and form display), `api`, `http`, `fixture`, `index`.
- `src/components/service-requests/`: shell, provider directory, form parts (patient, address, time, note, price and policy, acknowledgement, submit with idempotency), one form per service, status view, refresh and cancel controls, emergency banner.
- Strings: new `services` namespace (en/te/hi), registered in `src/i18n/messages.ts` and `global.d.ts`.

## Rules the UI follows

- Providers set prices; the server recomputes the snapshot in integer paise and refuses a changed total (409). Pay after service; online payment shown as unavailable.
- Manual accept or decline. Synthetic behaviour: "Synthetic lab 2", "Synthetic care agency 2" and "Synthetic transfer operator 2" decline every request; the others accept after `FIXTURE_PROVIDER_RESPONSE_MS` and the server issues an `SCV-` reference.
- Booking, payment and record states are three separate badges. Lab reports are never shown here (released by a reviewer into Records). Caretakers are non-clinical; the form says what they do not do and needs an acknowledgement. Repeating care plans are not offered.
- Ambulance: scheduled, non-emergency transfers only. Every ambulance page starts with "Emergency? Call 112 now" and a `tel:112` link; the form needs "this is not an emergency"; no ETA, tracking or "on the way" text. A stretcher patient cannot pick a vehicle without a stretcher; the drop-off must be in the operator's area.
- Cancel through the shared CancellationDialog with the page's version; a conflict reloads the page.

## Tests

- Unit: `tests/unit/modules-services/{lab-orders,care-requests,ambulance-requests}.test.ts` (schemas, pricing, status, fixture engine: idempotency, decline, overlap, stale cancel, production refusal, HTTP gating).
- E2E: `tests/e2e/service-requests.spec.ts` on `mobile-390` and `desktop-1280`: discover and PIN filter, happy path to confirmed and cancelled, decline path, uncovered address, keyboard-only path, axe on every page state, no horizontal scroll, no private draft in URL or storage.

## Known limits

- In-memory synthetic stores per server process; restart resets them. No per-patient ownership check in the fixture (one synthetic account).
- Addresses can be added only from the doctor booking journey (shared synthetic addresses); these forms choose from saved ones.
- The cancellation reason chosen in the dialog is not sent (no contract).
- Patient dashboard and bookings list do not show these requests yet (fe-p / fe-a scope).
