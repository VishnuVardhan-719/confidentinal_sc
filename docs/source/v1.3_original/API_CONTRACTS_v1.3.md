# API contracts — proposed v1 baseline
Codex owns implementation, Claude consumes; integrator approves breaking changes. Freeze contract before parallel wiring. All JSON is Zod-validated; opaque UUIDs, timestamps ISO UTC, money integer paise INR. Auth session determines requester and role; patientId must be authorized. No client-supplied price or status. Errors {error:{code,message,requestId}} with no sensitive details; 401/403/404/409/422/429. Paginated list {items,nextCursor}. Mutation idempotency key header; optimistic version for transitions. Server Actions may call same domain functions.

| Method/path | Request | Success |
|---|---|---|
| GET /api/providers?category=&pin=&cursor= | public query | verified published items, nextCursor |
| GET /api/providers/:id | public | profile, published services/prices, coverage |
| POST /api/provider/onboarding | category, profile, org choice | providerId, verificationState |
| POST /api/admin/providers/:id/review | decision, reason, version | verificationState |
| POST /api/providers/:id/services | category, title, pricing unit, amountPaise | serviceId, version |
| POST /api/bookings | patientId, providerId, serviceId, requestedStart, requestedEnd, paymentMethod, details | bookingId, status=REQUESTED, totalPaise, currency, version |
| GET /api/bookings/:id | scoped | booking, status, paymentState, version |
| POST /api/bookings/:id/accept | version, resourceIds, acceptedStart, acceptedEnd | status, version, paymentState |
| POST /api/bookings/:id/decline or /cancel | version, reason | status, version |
| POST /api/bookings/:id/complete | version | status, version |
| POST /api/bookings/:id/payment-order | idempotency key | gatewayOrderId, amountPaise, currency (test only initially) |
| POST /api/payments/razorpay/webhook | raw signed payload | acknowledged after durable processing/recording |
| POST /api/bookings/:id/pay-after-record | version, collection reference/method | paymentState |

Details discriminated by service category: doctor visit address; lab collection address and test IDs/quantities; ambulance scheduled pickup/destination and vehicle type; caretaker address, duration, care scope. IDs resolve only within authorized scope. Request price derived server-side, snapshot stored; changed material terms require patient approval. Accept performs atomic resource reservation; pay-after confirms immediately, online holds until verified capture. Expiry releases reservation; late payment enters reconciliation. Full state machine in blueprint section 6. No emergency endpoint or paid subscription activation in initial release. Add schema and typed client in shared contract module, test examples against actual handler, update this document on change.
