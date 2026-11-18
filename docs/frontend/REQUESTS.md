# Frontend change requests (append-only)

Agents append entries here for changes outside their owned paths or for missing/unclear contracts. Do not edit or delete other entries.

---

## FE10-12-data (Kiro D, feat/fe2-d, base 3174196) - 2026-11-18

Source compared: `origin/task/B01-booking` @ e8a71ed (read-only inspection, not merged).

### Booking state mismatches (B01 vs docs/specs/BOOKING_AND_CONSULTATION.md + FRONTEND_MASTER section 9/11)
1. **Case and names.** B01 `bookings.state` is lowercase: `draft, requested, accepted, confirmed, in_progress, completed, declined, expired, cancelled, no_show, interrupted`. Spec uses uppercase and `IN_PROGRESS` vs `IN_CONSULTATION`. Frontend `src/modules/doctor/types.ts` follows B01 lowercase.
2. **Doctor visit overlay is a substate, not booking states.** B01 has `substate in (scheduled, en_route, arrived, service_started, service_completed)` while booking stays `confirmed`/`in_progress`. Spec lists `EN_ROUTE, ARRIVED, ARRIVAL_VERIFIED, IN_CONSULTATION` as lifecycle states. Frontend models a `phase` using B01 substate names.
3. **`ARRIVAL_VERIFIED` missing in B01.** No substate, no OTP challenge table, no `POST /api/bookings/:id/verify-arrival`. B01 `/arrive` only advances substate; it does not start a challenge. B01 `/start` (`service_started`) does not require arrival verification, so the server does not enforce "OTP before consultation". Frontend adds `arrival_verified` as a proposed phase. Backend request: add challenge + verify route + substate, and make `/start` require it.
4. **Error codes.** B01 returns `{ error: { code } }` with `invalid_input`, `booking_unavailable`, `identity_unavailable` (not the frontend `validation`/`unavailable`). Frontend maps by HTTP status via `codeFromStatus`, so this works, but the body code names should be aligned or documented.
5. **Responses carry only `{ version }`.** Commands (`accept, en-route, arrive, start`) return just the new version. Frontend refetches; fine, but a doctor-view DTO is needed to refetch (see 6).

### Missing/unclear contracts (http adapter returns `fail("gated")` until agreed)
6. **Doctor views:** no doctor-scoped DTO for request list (minimal pre-accept fields), assigned visit list, or visit detail. `GET /api/bookings` and `GET /api/bookings/:id` return raw RPC rows of unspecified shape. Needed: `DoctorRequestView` / `AssignedVisitView` shapes in `src/modules/doctor/types.ts`.
7. **Arrival challenge:** need read (`GET` challenge state: expiry, attempts left, resends left, resend-available-at; never the code), resend, and verify (`{ challengeId, code }` -> verified / rejected with reason `invalid_code|expired|replayed|attempts_exhausted`; wrong doctor -> 403).
8. **Clinical:** `GET` draft route missing (needed for conflict recovery); response shapes for `POST /draft` (`{ version, savedAt }`), `POST /finalize` (signed consultation) and `GET /consultations/:id` (draft vs final discriminated by `status`) are frontend proposals in `src/modules/clinical/types.ts`. No amendment route exists in API_CONTRACTS at all (`POST /api/consultations/:id/amend` proposed).
9. **PDF:** `GET /api/consultations/:id/pdf` is described as file delivery. Frontend needs a link-issuing DTO `{ consultationId, version, url, expiresAt }` (or confirmation that the route streams the file with auth and the UI should link to it directly).
10. **Records/patient:** no patient record list endpoint (final-only), no health-fact list/confirm endpoints, no proof revoke or public verify endpoint, no photo consent / upload-URL / view-link endpoints. `POST /bookings/:id/collection` and `POST /bookings/:id/proof` response shapes are frontend proposals in `src/modules/records/types.ts` / `http.ts`.
11. **Clinical policy values not approved:** OTP validity (5 min), attempts (5), resends (3) and resend cooldown (30 s); proof lifetime (24 h); signed link lifetime (300 s); photo max size (10 MB); vital warning thresholds (none shipped; `VitalWarningRule[]` must come from approved clinical governance config); required-field minimum for finalization (`missingForFinalize`). All are fixture/proposed values only.

### Shared code requests
12. `src/modules/clinical/http-util.ts` is a private fetch wrapper (no-store, same-origin, Idempotency-Key, status->code mapping, zod-validated responses). Replace with the shared client in `src/lib/api/**` when its owner publishes one.
13. `StatusTone`/`StatusDescriptor` live in `src/modules/clinical/status-core.ts`. If a shared status/tone type is added under `src/lib` or `src/components/shared`, these maps should switch to it.
14. Message keys referenced by status maps (`doctor.*`, `clinical.*`, `payment.collection.*`, `common.status.unknown`) need entries in `src/messages/{en,te,hi}` by the i18n owner (phase 2 UI ticket).
