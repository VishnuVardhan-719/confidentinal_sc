# API and Event Contracts — Proposed, To Be Refined Before Implementation

**Nothing below is implemented.** Every endpoint/Server Action must call the same typed server domain service; every mutation authn + authz + Zod validation + idempotency where relevant. Stable 401/403/404 scoped/409 concurrency/422 invalid/429 rate limit errors, never expose sensitive data.

| Module | Proposed route | Behavior |
|---|---|---|
| Directory | `GET /api/providers?category=&pin=&priceMax=` | Published active verified providers only |
| Directory | `GET /api/providers/:id` | Public permitted profile/price/coverage; no identity docs |
| Signup | `POST /api/onboarding/patient` | Save verified patient health questionnaire; unknown allowed |
| Provider | `POST /api/onboarding/provider` | Individual/org fields and private docs metadata |
| Admin | `POST /api/admin/providers/:id/review` | Approve/reject/suspend with scoped capability and audit |
| Booking | `POST /api/bookings` | Patient completed onboarding, valid eligibility and price snapshot |
| Booking | `POST /api/bookings/:id/accept` | Assigned authorized provider, atomic resource hold |
| Booking | `POST /api/bookings/:id/decline` | Reason and event |
| Booking | `POST /api/bookings/:id/cancel` | Current policy and cancellation event |
| Doctor | `POST /api/bookings/:id/en-route` | Assigned doctor only; start limited sharing if consented |
| Doctor | `POST /api/bookings/:id/arrive` | Start OTP challenge; cannot forge patient acceptance |
| OTP | `POST /api/bookings/:id/verify-arrival` | Booking-bound doctor + one-time short-lived OTP |
| Clinical | `POST /api/consultations/:id/draft` | Assigned clinician, version check, safe autosave |
| Clinical | `POST /api/consultations/:id/finalize` | Sign immutable final record, audit |
| Clinical | `GET /api/consultations/:id` | Authorized clinician/linked patient only |
| PDF | `GET /api/consultations/:id/pdf` | Time-bound authenticated private PDF delivery |
| Proof | `POST /api/bookings/:id/proof` | Revocable expiry token; minimum attendance only |
| Pay | `POST /api/bookings/:id/payment-order` | Approved Razorpay test/production eligibility + authoritative amount |
| Pay | `POST /api/payments/razorpay/webhook` | Raw-body signature verification and idempotency |
| Pay-after | `POST /api/bookings/:id/collection` | Assigned provider acknowledgment and audit/reconcile |
| Support | `POST /api/support/tickets` | Patient/provider with own booking/case scope |
| Assistant | `POST /api/assistant/chat` | Scoped allowed tools; ₹0 spend guard and healthcare-safe limitations |
| WhatsApp | `POST /api/whatsapp/webhook` | Validated signed event; if future Meta integration approved |

**Bookings are never accepted by AI agent directly.** A user must choose and confirm; provider manually accepts. Every medical write has clinician assignment. Don't expose OTP in responses to unrelated roles. Locale affects display, not reference IDs.

## Example event shape (conceptual)

```json
{
  "eventId": "uuid",
  "bookingId": "uuid",
  "publicReference": "#SCV-BKG-000142",
  "eventType": "doctor.arrival_verified",
  "actorId": "uuid",
  "occurredAt": "2026-11-20T04:30:00Z",
  "version": 7
}
```

No patient name, medical notes, phone or OTP needed in a Realtime status event. Version/time enable reconnect refetch and ordering. Build explicit payment/clinical events separately.
