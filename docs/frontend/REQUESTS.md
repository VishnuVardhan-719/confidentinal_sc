# Frontend requests and contract mismatches (append-only)

Agents append dated sections below. Do not edit or delete other sections.

---

## 2026-11-18 · FE13-17-data (Kiro E, branch feat/fe2-e) · lab, ambulance, caretaker, admin, CMS, audit data layer

Names checked read-only against `origin/task/C01-catalog` (I01/I02/C01 migrations, routes, validation), `origin/task/B01-booking` (booking states) and `origin/task/S01-design` (`docs/S01_DESIGN.md`). Nothing was merged.

### R-E01 Shared HTTP client (owner: src/lib/api)
- `src/modules/admin/http-util.ts` is a private fetch wrapper (status-to-`ApiErrorCode` mapping, Zod response parsing, `no-store`, `redirect: "error"`, `Idempotency-Key`). Replace it with a shared client in `src/lib/api` once one exists.
- Backend error envelope on C01 is `{ error: { code } }` with codes such as `invalid_input`, `invalid_transition`, `credentials_required`, `identity_unavailable`, `catalog_unavailable`. These do not match `ApiErrorCode` (`validation`, `unavailable`, ...). The wrapper maps by HTTP status only and never shows server text. Request: agree one code vocabulary, or a documented mapping, in `docs/API_CONTRACTS.md`.

### R-E02 Shared status kit (owner: src/lib)
- `StatusTone` / `StatusDescriptor` / `describe()` are duplicated in the six `status.ts` files of these modules, because there is no shared location in my owned paths. Request: a shared `src/lib/status` helper; the modules will switch to it.

### R-E03 Feature flags (owner: src/lib/feature-flags)
- S01 defines `FEATURE_LAB`, `FEATURE_SCHEDULED_TRANSPORT`, `FEATURE_CARE` (all OFF). They are not in `FEATURE_FLAGS`. Request: add `lab`, `scheduledTransport`, `care`.
- Advanced recurring care plans have no flag. The caretaker module hard-codes the gate OFF (`RECURRING_CARE_GATE`). Request: add a `recurringCare` flag (default OFF) if the owner wants it switchable.
- Lab report review/release is gated on `isEnabled("clinical")` (release matrix: "Clinical records, prescriptions, lab report release"). S01 puts report upload/review/release in P2. Confirm `clinical` is the right gate, or add `labReports`.

### R-E04 Admin capabilities (owner: backend I01)
- I01 `admin_capabilities.capability` allows only `provider:verify`, `coverage:verify`, `security:audit`, `membership:admin`.
- The frontend model also defines proposed `booking:operate`, `payment:read`, `refund:approve`, `support:operate`, `settings:read`, `content:edit`, `content:publish` (FE spec section 15). No real principal holds them yet, so those areas render denied. Request: backend migration and contract for these, or replacement names.
- I01 RPCs only accept `scope_key = 'global'`. The frontend supports organization-scoped grants (`{ kind: "organization", organizationId }`) for audit; the backend needs an equivalent before org-scoped admins exist.

### R-E05 Provider verification states
- I01 defines `verification_state in ('draft','submitted','verified','rejected','expired','suspended')`; I02 replaces it with `('draft','submitted','under_review','approved','rejected','suspended')`. The frontend uses the I02 set. `verified` and `expired` map to "unknown", not approved.
- The FE spec lists "changes required", "active" and "expired" states, plus a "request changes" decision. I02 has none of these (decisions: `under_review`, `approved`, `rejected`, `suspended`). Request: decide whether "request changes" and expiry are states or derived flags.

### R-E06 Money format
- C01 returns `amount_paise` as a decimal string (`amount_paise::text`, `paiseSchema` string). Frontend view models use integer paise (`number`). `paiseFromServer()` in `admin/http-util.ts` converts and rejects values that are not safe integers. Confirm that the maximum (10,000,000,000 paise) stays within `Number.MAX_SAFE_INTEGER`; it does today.
- C01 `service_price_versions.unit` allows `visit|test|trip|hour|day`. Caretaker pricing per FE spec 14 needs `week` and `month`. The frontend marks those rates `periodSupportedByBackend: false`. Request: owner policy and a C01 unit change, or drop week/month.

### R-E07 Endpoints with no documented contract (http adapters return `gated`)
Documented and wired: `POST /api/admin/providers/:id/review` (body `{ decision, reason, expectedVersion }`, response `{ provider: { id, verification_state, version, ... } }` per C01). The C01 handler does not read `Idempotency-Key`; the frontend sends it anyway.

Not documented, so `fail("gated")`:
- Lab: branches, catalog, staff, order queues, order detail, assigned collections, collection commands (S01 proposes `POST /api/bookings/:id/lab/{start-collection,collected,handoff,collection-failed,handoff-failed}`), recollection request, report list/review/release.
- Ambulance: fleet, crew, request queue/detail, trip queue/detail, driver trip view, trip commands (S01 proposes `POST /api/bookings/:id/trip/{en-route,arrived,picked-up,destination-reached,interrupt}`).
- Caretaker: services/rates, staff, requests, assignments, care commands (S01 proposes `POST /api/bookings/:id/care/{start,end,interrupt}`), shifts, check-in/out, absence, replacement. Recurring plans stay gated by policy.
- Admin: provider review queue and detail (`GET`), document signed URL (I02 has `/api/providers/:id/documents/:documentId/signed-url` but it is not in API_CONTRACTS), coverage queue/review/history (C01 has `GET /api/catalog/admin/coverage` and `POST /api/catalog/admin/coverage/:id/review`; request adding them to API_CONTRACTS so they can be wired), booking ops search, admin invites/scope/suspend, payments, refunds, support queue.
- CMS: admin content CRUD/workflow and the public stories/FAQ read model.
- Audit: event list. I01 `audit_events` has no organization column; org-scoped audit reading needs one (or a join rule).

### R-E08 State-name differences (frontend follows backend/S01)
- Lab: FE spec actions "accepted/arrived/collected/failed/recollect" map to S01 substates `scheduled → collecting → collected → processing_handoff`, failures `collection_failed`, `handoff_failed`. Recollection is a new booking (S01), never a reset. Turnaround claims are stored but not shown (`turnaroundDisplayApproved: false`, S01-Q05).
- Ambulance: FE spec "reached/completed" is S01 `destination_reached` (booking state `completed`). `cancelled` and `no_show` are shared booking states; `no_show` only through support review, never a driver button.
- Caretaker: S01 substates `assigned/started/ended/care_interrupted`. Shift attendance (`scheduled/checked_in/checked_out/absent/replaced`) is a frontend view model; `care_shifts` is deferred in the schema, so the shape needs backend agreement.
- Payment status uses lowercase snake_case (`not_initiated`, `due`, `processing`, `paid`, `partially_paid`, `disputed`, `refunded`) to match the canonical schema; FE spec section 16 writes them in upper case.
- Lab staff roles `manager/collector/reviewer` are not I01 membership roles (`owner/manager/staff/billing`). Request: the scope names the backend will use for collector and reviewer.

### R-E09 Messages (owner: i18n)
- Status label keys are defined in each module's `status.ts` (`lab.status.*`, `ambulance.status.*`, `ambulance.vehicleType.*`, `ambulance.emergency.call112`, `caretaker.status.*`, `caretaker.task.*`, `caretaker.rate.*`, `admin.status.*`, `admin.priority.*`, `admin.settings.*`, `admin.cms.status.*`, `admin.audit.*`). They need en/te/hi entries. Lab completion copy must never say "report ready" (S01-Q08), and no ambulance string may contain minutes or an ETA (S01 A13).
