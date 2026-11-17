# B01 (booking) and P01 (pay-after) design brief
Kiro, read-only. Sources: END_TO_END, CANONICAL_SCHEMA_DRAFT (§3 tables, §5 state machines, §8 constraints/atomic commands, API deltas), API_CONTRACTS, PERMISSIONS, BUSINESS_RULES. Names marked (proposed) are not in the repo. Repo head: I01 and I02 migrations only; B01 also needs the C01 catalog tables (`services`, `service_price_versions`, `provider_service_areas`, `provider_publicly_bookable`), which I did not find committed.

## 0. Gates, assumptions, open owner decisions
- Core only: pay-after, manual acceptance, no gateway, no live payment, no clinical record, no OTP, no GPS, no emergency. DC01 here means only the assigned-doctor authorization predicate (P_ASSIGNED). Consultations and signing stay P2.
- Not approved, so not hard-coded: request expiry (30 min proposed), cancellation window and fee, reschedule limit, travel/turnaround buffers, idempotency retention horizon (Q02/Q11), collector reconciliation policy (Q04). Ship them as `booking_policy_versions` (proposed) rows that are empty or disabled by default. Expiry transitions stay disabled until a policy row exists.
- Fix before B01 relies on roles: I02 review H1 (`identity_roles()` returns provider roles for unverified providers). B01 must not use `identity_roles()` for authorization. Use DB predicates only.
- Synthetic data only. No patient name, phone, address or notes in events, outbox, audit or logs.

## 1. Tables (migration `202611xx_b01_booking.sql`, then `202611xx_p01_payments.sql`, one author each, sequential)
B01:
- `booking_policy_versions` (proposed): `id`, `version`, `terms_text_ref`, `cancel_window_minutes` null, `request_expiry_minutes` null, `buffer_minutes` default 0, `status`. Immutable once published.
- `patient_addresses`: `patient_id`, structured address, `pin_code`, `version`. Private. RLS P_PATIENT.
- `bookings`: `id`, `public_ref` (sequence-backed, gaps allowed, not an invoice number), `requester_profile_id`, `patient_id` (recipient), `provider_id`, `category`, FK `(provider_id,category)`, `service_id`, `price_version_id` (FK matches service), `amount_paise bigint >= 0`, `currency='INR'`, `policy_version_id`, `terms_version`, `address_snapshot jsonb`, `contact_snapshot jsonb`, `start_at`, `end_at` (`timestamptz`, CHECK `end_at > start_at`), `state`, `version`, `supersedes_booking_id` null, `created_at`, `updated_at`. Snapshot columns immutable (BEFORE UPDATE trigger). `unique(requester_profile_id, supersedes_booking_id)` where not null.
- `booking_events`: append-only. `booking_id`, `actor_profile_id`, `from_state`, `to_state`, `aggregate_version`, `reason`, `request_key`, `occurred_at`. No UPDATE or DELETE grants, plus a BEFORE UPDATE/DELETE trigger.
- `resources`, `availability_rules`, `availability_exceptions`: per the draft. One person row per profile globally, one row per vehicle.
- `booking_assignments`: `booking_id`, `resource_id`, `purpose`, `assigned_profile_id` null, `period tstzrange`, `status` (active, replaced, ended), `ended_at`.
- `resource_reservations`: `assignment_id` unique, `resource_id`, `occupied_period tstzrange` finite and nonempty with buffers, `status` in (active, released). `EXCLUDE USING gist (resource_id WITH =, occupied_period WITH &&) WHERE (status='active')` (needs `btree_gist`; confirm on the managed version). Never put `now()` in the predicate.
- `doctor_visits` (core operational substate only): `booking_id` unique, `assignment_id`, `substate` in (scheduled, en_route, arrived, service_started, service_completed).
- Reuse I01 `idempotency_requests` (unique `(actor_profile_id, action, request_key)`) and `audit_events`. Add `notification_outbox` (proposed, minimal payload, P_WORKER only).
P01:
- `payments`: `booking_id` unique, `amount_paise` (frozen from booking), `collection_path='direct_pay_after'` CHECK, `state`, `confirmed_paise bigint default 0`, `version`.
- `payment_collections`: `payment_id`, `collector_profile_id`, `amount_paise > 0`, `method` in (cash, upi_direct), `reference` text (UPI reference only, max 64; CHECK rejects card-number patterns), `status` in (reported, confirmed, disputed, voided, superseded), `request_key`, `superseded_by`, `reported_at`, `reconciled_by`, `reconciled_at`, `reason`.
- `payment_events`: append-only ledger of state changes, including admin overrides (`actor`, `capability`, `reason` not null, `from_state`, `to_state`, `payment_version`).
- No card, PAN, CVV, VPA beyond a reference, gateway tables or webhook tables. No `paid_at` writable from clients.

## 2. State machines
Booking: `draft -> requested -> accepted -> confirmed -> in_progress -> completed`. Side exits: `draft -> cancelled`; `requested -> declined | expired | cancelled`; `accepted | confirmed -> cancelled`; `confirmed -> no_show`; `in_progress -> interrupted`. Terminal states never reopen.
- Core pay-after: `accepted -> confirmed` is written in the same transaction as acceptance (two events), and sets payment `not_initiated -> due`.
- Reschedule is not an update. It creates a new `requested` booking with `supersedes_booking_id`, needs fresh patient approval, and releases the old reservations atomically only when the new one is accepted. Gated by policy, so disabled when no policy exists.
- Transition guard table `booking_transitions(from, to, actor_kind)` (proposed) plus a trigger that rejects any `state` change not in the table, so a bug in one RPC cannot skip a state.
Doctor substate: `scheduled -> en_route -> arrived -> service_started -> service_completed`. No skip, no reverse. `service_started` maps to `confirmed -> in_progress`; `service_completed` maps to `in_progress -> completed`.
Payment (core): `not_initiated -> due -> partially_paid -> paid`, plus `disputed` and `voided`. `paid` needs `confirmed_paise = amount_paise`. Collection: `reported -> confirmed | disputed | voided`, `confirmed -> superseded` only by correction. Booking and payment states never write each other except `due` at confirmation.

## 3. RPCs / API (every one: `auth.uid()` only, `require_actor()`, `set search_path=''`, expected version, audit and event rows, idempotency key on creates, no actor/status/price/role/paid parameter)
| Route | RPC (proposed) | Rule |
|---|---|---|
| `GET /api/availability?provider=&service=&date=` | `list_slots` | Advisory only. Derived from rules, exceptions and active reservations. Never returns other patients' data. |
| `POST /api/bookings` | `create_booking_request` | Patient grant `booking:create`, recipient grant, `provider_publicly_bookable`, PIN from the saved address matches an approved area, server price and policy snapshot. Creates `draft` then `requested` (one call). |
| `POST /api/bookings/:id/accept` | `accept_booking` | Provider owner or org scope `schedule:manage`. Locks booking, provider, resources (UUID order). Rechecks verification, coverage, price, schedule. Inserts assignment, reservation, `confirmed`, payment `due`. |
| `.../decline`, `.../cancel` | `decline_booking`, `cancel_booking` | Reason required. Locks booking, resources. Releases reservations. Policy snapshot, no invented fee. |
| `.../en-route`, `.../arrive`, `.../start`, `.../complete` | `advance_visit` | P_ASSIGNED only (see §4). Substate machine only. |
| `POST /api/bookings/:id/reschedule` | `request_reschedule` | Creates the superseding request. Disabled without policy. |
| `GET /api/bookings`, `/:id` | `list_bookings`, `get_booking` | Patient side vs provider queue projections (§4). Keyset pagination, limit <= 50. |
| `POST /api/bookings/:id/collection` | `report_collection` | Assigned collector or P_FINANCE scope. Appends `reported`. Idempotent by key. |
| `POST /api/admin/payments/:id/reconcile` | `reconcile_collection` | `finance:reconcile` capability (proposed, not in I01) + aal2. Reviewer is not the collector. |
| `POST /api/admin/payments/:id/override` | `override_payment` | Admin capability + aal2 + reason >= 10 chars. Writes `payment_events` and `audit_events` before returning. Cannot create `paid` without confirmed collections that equal the total. Cannot exceed total. |
| System | `expire_requested_bookings` | Worker only (`service_role`), revoked from `authenticated`. Does nothing without an approved policy deadline. |

## 4. RLS rules
- All new tables: RLS on, `revoke all from public, anon, authenticated`, only the SELECT policies below. No direct INSERT, UPDATE or DELETE grant anywhere. Writes go through RPCs.
- Patient: SELECT own bookings where `requester_profile_id=auth.uid()` or an active `patient_access` grant with `booking:read` for the recipient. Payment summary (amount, state, confirmed total) only.
- Provider queue (before acceptance): `get_provider_queue` returns locality (PIN), service, time and public_ref only. Exact address and contact snapshots appear only after `accepted`, and only to P_ASSIGNED or the provider owner/org admin with `schedule:manage`.
- Assigned-doctor predicate `identity_private.is_assigned(booking_id, purpose)` (proposed): active assignment to the caller's person resource, `purpose='doctor_visit'`, booking state in (confirmed, in_progress), provider `active` and `approved`, `provider_is_publishable`, membership `active` and accepted, profile `active`. Rechecked on every call. Reassignment ends the old assignment at once, so old actors lose access in the same transaction.
- Resources: provider sees its own resources and the free/busy of those resources, never other tenants' reservations (RLS or definer function returning booleans only).
- Payments: patient own summary; provider P_FINANCE scope (org `finance:read` for read, assigned collector for `report_collection`). Admin finance sees metadata only, no address.
- `anon`: nothing. Public discovery stays in C01.

## 5. Race conditions and how each is closed
1. **Double booking, same resource.** The GiST exclusion on `resource_reservations` is the authority. `accept_booking` also locks resources in UUID order. Two accepts for overlapping intervals: one commits, the other gets `23P01` mapped to 409. Cross-org, cross-category and driver-vs-doctor cases share the same person resource.
2. **Concurrent accept and cancel.** Both `for update` the booking row first. Whichever runs second sees the new state and `version` and gets 409 or 55000. No reservation survives a cancelled booking (assert in test).
3. **Concurrent confirm and cancel after acceptance.** Confirmation happens inside `accept_booking`, so there is no window. Later transitions use `where version = expected`.
4. **Retry/replay.** Same key and same payload returns the stored result after rechecking authorization. Same key, different hash: 409. A rolled-back transaction leaves no key. Replay of `report_collection` never adds a second row (unique `(payment_id, request_key)`).
5. **Suspension, blackout or membership revocation vs accept.** Those commands take the same provider and resource locks first, so acceptance either sees the new state or happens before it. Suspension raises an operations exception for existing bookings, and does not silently cancel them.
6. **Concurrent collection reports and reconcile.** Lock the payment row. `confirmed_paise` is recomputed from confirmed rows, never incremented from client input. CHECK `confirmed_paise <= amount_paise`.
7. **Reassignment.** Locks old and new resources and the booking, ends old assignment and reservation, inserts new ones in one transaction.
8. **Deadlocks/serialization.** Fixed lock order: booking, provider, resources by UUID, payment. Bounded retry in the service layer with the same key.

## 6. Top 12 abuse cases and exact assertions
1. **Double booking.** Two sessions call `accept_booking` for overlapping slots on one resource: `select is((select count(*) from public.resource_reservations where resource_id=:r and status='active' and occupied_period && :p), 1::bigint)`; the loser raises `23P01` or `40001`. Adjacent half-open slots both succeed.
2. **Price tampering.** `create_booking_request` has no price parameter. Posting `amountPaise`, `status`, `state`, `paid` or `role` gives 422 (strict Zod object). `update public.bookings set amount_paise=1` as authenticated: `42501` (no grant). Snapshot-column UPDATE even by definer code: trigger `55000`.
3. **Unbookable provider.** For each of draft, submitted, under_review, rejected, suspended, approved-with-expired-document, and an uncovered PIN: `throws_ok($$select public.create_booking_request(...)$$, '42501')` and no row inserted.
4. **IDOR on bookings.** User B selects user A's booking by id: `select is((select count(*) from public.bookings where id=:a_booking), 0::bigint)`; API returns the same 404 body and status as for a random id.
5. **Address and contact exposure.** Provider (non-assigned) on a `requested` booking: the queue projection column list equals `['public_ref','category','pin_code','service','start_at','end_at']`; `address_snapshot` and `contact_snapshot` selects return 0 rows or are denied. After `accept_booking`, only the assigned actor and owner/org admin can read them. Disabled member, invited member, org-disabled and wrong-org member: 0 rows.
6. **Assigned-doctor bypass.** Doctor not assigned, assignment `ended`, booking in `requested`, `completed` or `cancelled`, provider suspended, membership disabled: `throws_ok($$select public.advance_visit(:b,'arrive',:v)$$, '42501')` for each. After reassignment, the old doctor's next call fails in the same session.
7. **State skipping and reopening.** `advance_visit` with `service_completed` from `scheduled`: error `55000` or `22023`. `update public.bookings set state='confirmed' where state='cancelled'` via any RPC: rejected by the transition trigger. Terminal states have no outgoing row in `booking_transitions` (assert the count is 0).
8. **Stale version and lost update.** Cancel with `expected_version = n-1`: `40001`. Two concurrent cancels: exactly one `booking.cancelled` event (`select count(*) = 1`).
9. **Idempotency abuse.** Same key and payload: same booking id, one row, one event. Same key, different payload hash: `40001`. A revoked member replaying an old key is denied (authorization rechecked before the replay).
10. **Payment spoofing.** Provider reports collection and tries to confirm it: `report_collection` produces `status='reported'`, `confirmed_paise` unchanged, payment state unchanged. `reconcile_collection` by the same collector: `42501`. Patient or provider setting `state='paid'` directly: no grant. `confirmed_paise > amount_paise` or a collection summing over total: `23514`.
11. **Card data and gateway labels.** `reference` containing 13-19 digits (Luhn-valid) or text over 64 chars: `23514`. No column named card/pan/cvv/token exists: `select count(*)=0 from information_schema.columns where table_schema='public' and column_name ~ '(card|pan|cvv|cvc|token)'` on the P01 tables. `collection_path` can only be `direct_pay_after`; no `paid` row ever has a gateway id.
12. **Admin override without trail.** `override_payment` without aal2, without `finance` capability, with expired or revoked capability, reason under 10 chars, or by the booking's provider/patient: `42501` or `22023`. A successful override writes exactly one `payment_events` and one `audit_events` row in the same transaction (`select count(*)=1` each) and cannot yield `paid` unless confirmed collections equal the total.
Cross-cutting: every definer function in B01/P01 has `search_path=""`, is revoked from `public` and `anon`, and `has_table_privilege('authenticated', <each table>, 'INSERT,UPDATE,DELETE')` is false. Event and ledger tables reject UPDATE and DELETE for every role.

## 7. Codex file scope
B01 (branch `task/B01-booking`, exclusive files):
1. `supabase/migrations/202611xx0001_b01_booking.sql`.
2. `tests/rls/b01_booking.sql` (cases 1-9, cross-cutting) and `tests/rls/run_b01_concurrency.py` (two-connection tests for cases 1, 8; scratch DB only, regex-validated name, local Docker context check).
3. `src/lib/booking/schemas.ts` (Zod, strict objects, UUID, ISO UTC instants) and `src/lib/booking/service.ts` (RPC wrapper, error map 401/403/404/409/422/429).
4. `src/app/api/bookings/route.ts`, `src/app/api/bookings/[id]/route.ts`, `.../[id]/{accept,decline,cancel,reschedule,en-route,arrive,start,complete}/route.ts`, `src/app/api/availability/route.ts`.
5. `tests/unit/booking*.test.ts` and `tests/api/booking.*.test.ts`.
6. `docs/API_CONTRACTS.md` booking rows, task ledger and handoff note.
P01 (branch `task/P01-pay-after`, starts after B01 merges; touches no B01 file except via a new migration):
1. `supabase/migrations/202611xx0002_p01_payments.sql` (payments, collections, ledger, `report_collection`, `reconcile_collection`, `override_payment`, capability value `finance:reconcile` added through the reviewed bootstrap path, not a client path).
2. `tests/rls/p01_payments.sql` (cases 10-12 and RLS).
3. `src/lib/payments/{schemas,service}.ts`, `src/app/api/bookings/[id]/collection/route.ts`, `src/app/api/admin/payments/[id]/{reconcile,override}/route.ts`.
4. `tests/unit/payments*.test.ts`, `tests/api/payments.*.test.ts`.
5. `docs/API_CONTRACTS.md` payment rows and handoff note.
Out of scope for both: `src/app/**` pages and components, I01/I02/C01 files, gateway/webhook/refund code, clinical consultation tables, OTP, GPS, notifications delivery worker, seed data.

## 8. Limitations to record
- Reservation exclusion needs `btree_gist` confirmed on the target. The race tests need a real Postgres, not mocks.
- No expiry, cancellation fee or reschedule limit exists until the owner approves a policy row.
- Collector reconciliation and the `finance:reconcile` capability depend on owner decision Q04. Without it, nothing can reach `paid`, by design.
