# P01 pay-after: implementation brief

Sources: `.claude-scratch-B01-P01-design.md`, `docs/IMPLEMENTATION_TASKS.md`, `docs/API_CONTRACTS.md`, `docs/CANONICAL_SCHEMA_DRAFT.md` (payment sections), `docs/DECISIONS.md`, `docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md`, and the B01 migration as it exists in the worktree. Written read-only. No repo files were changed.

**Ledger wording:** P01 is "Pay-after records, payment test mode, webhooks and reconciliation". API_CONTRACTS lists `payment-order` and the Razorpay webhook as proposed. The canonical schema marks them unavailable in core. This brief covers **core pay-after only** (record, report, reconcile, override). The gateway and webhook are a separate gated task, because Q03 and Q04 are open and block real payments.

"Q01" in the task ledger is the QA/security task. "Q01" in `DECISIONS.md` is the dependent/guardian decision. They are different things.

## 0. Preconditions and ordering
- Branch `task/P01-pay-after`, stacked on merged B01. Exactly one migration author: `supabase/migrations/2026111700xx_p01_payments.sql`, ordered after B01's 005.
- B01 must first fix the issues in `.claude-scratch-B01-review.md`. P01 depends on these:
  - **H1:** the time window in `is_assigned`.
  - **H2/H3:** cancel and non-doctor visit paths.
  - **M1:** who counts as a clinician.
- P01 does not edit B01 files. It adds new objects and, where it must change a B01 function, uses `CREATE OR REPLACE` in its own migration. Prefer triggers (section 3) so that no B01 function is replaced.
- Money rules (AGENTS.md): integer paise (`bigint`), UTC, idempotency, atomic transitions, version checks, no browser-trusted price or paid state. Synthetic data only.

## 1. Tables (all RLS on, `revoke all from public, anon, authenticated`, only the SELECT policies in section 4, no write grants)

**`payments`** (one obligation per booking)
- `id uuid pk`
- `booking_id uuid not null unique references bookings(id)`
- `amount_paise bigint not null check (>= 0)`, frozen from `bookings.amount_paise` at creation
- `currency text not null default 'INR' check (= 'INR')`
- `collection_path text not null default 'direct_pay_after' check (= 'direct_pay_after')`
- `state text not null default 'not_initiated' check in ('not_initiated','due','partially_paid','paid','disputed','voided')`. `processing`, `refunded` and `partially_refunded` are not allowed yet.
- `confirmed_paise bigint not null default 0 check (confirmed_paise between 0 and amount_paise)`
- `version integer not null default 1`
- `created_at`, `updated_at`
- A guard trigger rejects direct changes to `booking_id`, `amount_paise` and `collection_path`. It also rejects any `state` change not in `payment_transitions`.

**`payment_transitions(from_state, to_state, actor_kind)`**: a seeded transition table, with a guard trigger, like B01's `booking_transitions`.
- Core edges:
  - `not_initiated -> due` (system, on booking confirmation)
  - `not_initiated -> voided`
  - `due -> partially_paid | paid | voided | disputed`
  - `partially_paid -> partially_paid | paid | disputed`
  - `paid -> disputed`
  - `disputed -> due | partially_paid | paid` (finance resolution only)
- There is no outgoing edge from `voided`.

**`payment_collections`** (claims and reconciliation, never deleted)
- `id`, `payment_id references payments(id)`
- `collector_profile_id references profiles(id)`
- `amount_paise bigint not null check (> 0)`
- `method text not null check in ('cash','upi_direct')`
- `reference text null check (char_length <= 64 and reference ~ '^[A-Za-z0-9-]{0,64}$')`, plus a CHECK or trigger rejecting card-like digit runs (13–19 digits, Luhn-valid). No other free text.
- `status text not null default 'reported' check in ('reported','confirmed','disputed','voided','superseded')`
- `request_key uuid not null`, with `unique(payment_id, request_key)`
- `superseded_by uuid null references payment_collections(id)`
- `reported_at`, `reconciled_by`, `reconciled_at`
- `reason_code` from an enum (no free text)
- Check: `status in ('confirmed','disputed','voided','superseded')` implies `reconciled_by is not null`.
- Check: `reconciled_by is distinct from collector_profile_id`.

**`payment_events`** (append-only ledger)
- `id`, `payment_id`, `collection_id null`
- `actor_profile_id`
- `capability text` (`collector`, `finance`, `admin_override`, `system`)
- `from_state`, `to_state`, `payment_version`
- `reason_code not null`
- `request_key null`, `occurred_at`
- `unique(payment_id, payment_version)`
- Triggers reject UPDATE, DELETE and TRUNCATE for every role.

**`payment_dispute_reasons`**: not needed. Use a CHECK-constrained `reason_code` enum with codes: `amount_mismatch`, `not_received`, `duplicate`, `wrong_payee`, `correction`, `other`.

**Reuse:**
- I01 `idempotency_requests`, with actions `payment.collect`, `payment.reconcile`, `payment.override`.
- `audit_events`.
- B01 `notification_outbox`, minimal payload (ids and states only).

**Not created:** gateway or webhook tables, card or VPA columns, any `paid_at` writable by a client, invoice or receipt tables (Q03).

## 2. Money and state rules
- `confirmed_paise` is always recomputed: `sum(amount_paise) where status='confirmed'` under the payment row lock. It is never incremented from input.
- Hard bound: `confirmed_paise <= amount_paise`. A report that would push the sum of reported plus confirmed claims over the amount is rejected (22023 `over_collection`). Whether over-collection may be recorded as a dispute is an open decision (D-4).
- A derived state follows the sum:
  - 0 confirmed means `due`
  - 0 < sum < amount means `partially_paid`
  - sum = amount means `paid`
  - `disputed` and `voided` are explicit commands.
- A zero-amount booking (`amount_paise = 0`): go directly `not_initiated -> due`, and make `paid` impossible without a confirmation of a positive amount. Decision D-6 covers the case.
- `PAID` is only ever `direct_pay_after`. It is never gateway-paid and never written by anything but `reconcile_collection`, `resolve_dispute` or `override_payment`.
- Booking and payment states are independent. The only coupling is the one `not_initiated -> due` write at confirmation.

## 3. Coupling with B01 (triggers, not rewriting B01 functions)
- **Create obligation on confirmation:** an AFTER UPDATE trigger on `bookings` for `state` going to `'confirmed'` does an insert-on-conflict into `payments` with `state='due'`, `amount_paise = new.amount_paise`.
  - It is a definer function, `search_path=''`.
  - It runs in the same transaction as acceptance.
  - It also writes a `payment_events` row (`system`).
- **Backfill:** the migration backfills a `due` payment for any existing `confirmed` or `in_progress` booking without one. Run it once, inside the migration, and idempotently.
- **Cancellation:** an AFTER UPDATE trigger on `state -> 'cancelled' | 'declined' | 'expired'` voids a `due` payment with 0 confirmed or reported collections (`due -> voided`, zero-charge). If any non-void collection exists, do not void. Raise an operations flag, set the payment `disputed`, and write an event.
- No refunds are invented. A cancellation fee cannot be created until Q02 is approved.
- **Booking `completed`** does not change payment. It only unlocks the collector's reporting window.

## 4. RPCs
All are `SECURITY DEFINER`, `set search_path=''`, `revoke ... from public, anon`, `grant execute ... to authenticated`. Each takes the actor from `auth.uid()` through `identity_private.require_actor()`. None takes an actor, status, price or paid parameter. Locks are taken in B01's order (booking, provider, resources) and then the payment row.

**`report_collection(p_booking_id, p_amount_paise bigint, p_method text, p_reference text, p_request_key uuid) -> uuid`**
- Authz (re-checked after lock): caller is the assigned collector (see 4.1) or has an active org membership with `finance:collect` on the booking's provider. Provider active and publishable. Profile active.
- Booking state `in_progress` or `completed`, within the reporting window. The window length is open (D-2).
- Payment state `due` or `partially_paid` (not `voided`, `disputed`, `paid`).
- Lock the payment row. Check the sum bound. Insert a `reported` row. Payment state and `confirmed_paise` do not change.
- Idempotent: the same `(actor, action, key)` and payload returns the stored id. A different payload with the same key gives 40001. `unique(payment_id, request_key)` backs this up.
- Event, audit and outbox rows in the same transaction.

**`reconcile_collection(p_collection_id, p_decision text, p_reason text, p_expected_payment_version int, p_request_key uuid)`**, where `decision` is `confirm` or `dispute`.
- Authz: finance reviewer capability `finance:reconcile`, AAL2 required, `reconciler <> collector`, and not the booking's provider owner or patient.
- Lock payment, then collection. Check the version. Collection must be `reported`.
- `confirm` marks the collection `confirmed`, recomputes `confirmed_paise`, and sets the derived payment state.
- `dispute` marks it `disputed`, with no change to `confirmed_paise`.
- Writes an event and audit rows.

**`void_or_supersede_collection(p_collection_id, p_replacement jsonb null, ...)`**
- For corrections only. The collector or finance may void a `reported` row. Only finance may supersede a `confirmed` row (new row plus `superseded_by`). Nothing is ever deleted.
- Recompute totals and state.
- Re-derived state may go backward (`paid -> partially_paid`). That path needs `paid -> disputed` first, then a finance resolution.

**`resolve_dispute(p_payment_id, p_expected_version, p_resolution_code, p_reason)`**
- Finance only, AAL2. Recomputes state from confirmed rows: `disputed -> due | partially_paid | paid`.

**`override_payment(p_payment_id, p_expected_version, p_target_state, p_reason text)`**
- Admin capability `finance:override` plus AAL2, reason length >= 10.
- It can never produce `paid` unless confirmed collections equal the amount.
- It cannot exceed the amount, and it cannot bypass the transition table.
- Writes exactly one `payment_events` row and one `audit_events` row in the same transaction, before returning.

**Read functions**
- `get_payment_summary(p_booking_id)`
  - Patient: amount, state, confirmed total only.
  - Provider finance scope: the same, plus claim counts and statuses.
  - No collector profile ids and no references, except to the collector or finance.
- `list_payment_queue(p_limit, p_after)`
  - Finance: reported claims waiting. It contains no address or contact, and only `public_ref`, amount, method and age.
  - Keyset pagination on `(reported_at, id)`.

### 4.1 The collector authorization predicate
Define `payments_private.is_collector(booking_id)`, separate from B01's `is_assigned`.
- Why: `is_assigned` requires booking state `confirmed` or `in_progress`. After `completed` the doctor loses access, so they could not report a collection after finishing the visit.
- Rule: caller has an assignment on that booking (any status, including ended on completion) with purpose `doctor_visit` or the category's equivalent, booking state `in_progress` or `completed`, and the provider and membership still active.
- Revoked membership, suspended provider, ended-by-reassignment assignment and cancelled booking all fail.
- It is separate from the "reconciler" capability. A collector can never also reconcile their own claim.

### 4.2 New capability values
`finance:collect` (org scope, provider side), `finance:reconcile`, `finance:override`. They are added through the reviewed bootstrap path used for I01 capabilities, not any client path. Until Q04 is decided, grant `finance:reconcile` to nobody. By design, nothing can reach `paid` until then.

## 5. RLS (SELECT only)
- `payments`: the patient with `booking:read` on the recipient (via the booking). Provider owner or org member with `finance:read`, scoped to that provider. Finance reviewers: metadata only.
- `payment_collections`: the collector sees their own claims. Provider finance scope sees its provider's claims. Finance sees claims in its queue. A patient sees no collector or reference details. Only the amount and state through the summary function.
- `payment_events`: the same scoping, with no `actor_profile_id` shown to patients.
- No table is readable by `anon`.
- Admin finance sees `public_ref`, amounts and states. No address, contact or patient identity.

## 6. API routes (thin adapters, same pattern as B01: `endpoint`, `session`, `input`, `requestKey`, strict Zod)
- `POST /api/bookings/:id/collection` -> `report_collection`. Body is strict: `amountPaise` (integer string or number up to bigint safe range, validate as a string-encoded integer), `method`, `reference?`. Requires `Idempotency-Key`. Response contains `{ id }` only. No `paid` is ever implied.
- `GET /api/bookings/:id/payment` -> `get_payment_summary`.
- `POST /api/admin/payments/:id/reconcile`, `/resolve`, `/override`, `GET /api/admin/payments/queue`. These need the capability, AAL2, and no body field for actor or state.
- `POST /api/bookings/:id/payment-order` and the Razorpay webhook are **not built**. If routes exist, they return a stable "feature unavailable" error (never success), as the canonical contract requires.
- Error map: 401, scoped 403/404, 409 for stale or key conflicts, 422, 429. `service.ts` does not retry stale versions or idempotency conflicts.

Amounts above 2^53 must not be treated as JS numbers. Use strings in JSON and `z.string().regex(/^[0-9]{1,15}$/)` or BigInt validation. B01 already returns `amount_paise` as a string.

## 7. Tests
**SQL (`tests/rls/p01_payments.sql`, run by a `run_p01_*.py` that follows `run_b01_concurrency.py`)**
1. Structure: RLS on every table. Zero INSERT/UPDATE/DELETE grants. `search_path=''` on every function. No column named `card`, `pan`, `cvv`, `cvc` or `token`. `collection_path` can only be `direct_pay_after`.
2. Confirmation creates exactly one `due` payment. Re-running or backfilling creates none extra.
3. Cancellation before any claim voids to `voided`. Cancellation with a claim does not void.
4. Collector authz: not assigned, assignment ended by reassignment, booking `requested`, `cancelled` or `confirmed`-before-start, provider suspended, membership disabled, wrong provider. All give 42501, with no row written.
5. Collector can report in `completed` state within the window, and cannot after it.
6. Spoofing: reporting never changes `confirmed_paise` or state. `update payments set state='paid'` has no grant. The collector calling reconcile gets 42501. Reconciler equal to the collector gets 42501. Patient or provider cannot reconcile.
7. Over-collection: a report that exceeds the remaining amount fails. A direct insert violating the bound hits `23514`.
8. State: `due -> partially_paid -> paid` by confirmed sums only. Disputed then resolved goes back correctly. The transition guard rejects skips and any move out of `voided`.
9. Card data: references with 13–19 Luhn-valid digits, over 64 characters, or with spaces, are rejected.
10. Idempotency: same key and payload returns the same collection id and writes one row and one event. Same key with a different amount returns 40001. A rolled-back call leaves no key. A revoked collector replaying an old key is denied.
11. Override: missing AAL2, missing capability, expired capability, reason under 10 characters, by the provider or patient: all denied. A success writes exactly one `payment_events` row and one `audit_events` row. It cannot create `paid` without matching confirmed sums.
12. Events and ledger tables reject UPDATE, DELETE and TRUNCATE even for the owner.
13. IDOR: patient B cannot read patient A's payment (0 rows, and the function returns the same not-found as for a random id). Provider X cannot read provider Y's claims.
14. PII: `payment_events`, outbox and audit contain no name, phone, address or reference.

**Concurrency (two real connections, scratch DB only)**
- Two simultaneous `report_collection` calls that would together exceed the amount: exactly one succeeds.
- Two reconcile calls on the same claim: one wins, the other gets 40001, and `confirmed_paise` is correct.
- Reconcile versus void by the collector on the same claim.
- Cancel versus report: no claim is left on a voided payment.
- Replay of the same key from two connections: one row.

**Unit and API (`tests/unit/payments*.test.ts`, `tests/api/payments.*`)**
- Strict schemas reject `paid`, `state`, `actor` and extra fields. Bigint-string handling. Required `Idempotency-Key`. Error mapping. No retry of 40001. The unavailable-feature routes never return success.

**Gates:** `npm run lint`, `typecheck`, `test`, `build`, plus every SQL suite. The `c01_catalog.sql` failure and `catalog-http.test.ts` import failure noted in B01 are pre-existing and must be resolved or explicitly waived before P01 claims a green run.

## 8. Edge cases
- Booking completed, then the doctor's membership is revoked before they report. Decide: finance or the org manager can report on their behalf (`finance:collect`), which is why that capability exists.
- Collection reported after cancellation: reject, and send the case to support (no support table exists, so return a stable 409).
- Partial payments in two methods (cash then UPI): both are valid. The sum is across methods.
- A patient disputes ("I paid it") before any claim: patient acknowledgment is evidence only. It is a `dispute` command with a reason, never a state PATCH. Patient dispute authority is open (D-3).
- Correction after `paid`: supersede flow through `disputed`, never an edit.
- Duplicate UPI reference across different bookings: a unique-ish check is advisory only. Raise a flag. Do not block.
- A zero-amount booking.
- A price change after confirmation does not change the obligation (frozen from the booking snapshot).
- A refund requested for a `paid` direct collection: unavailable. Return 409 with a stable code. No refund tables exist.
- `completed` booking with the payment still `due` forever: no auto-expire or auto-paid. It stays visible in the finance queue. It never blocks the booking record.
- Time: all timestamps `timestamptz` from `clock_timestamp()`. No browser time.
- Timeouts: bounded lock waits (`lock_timeout`) to avoid long blocking under the payment row lock.

## 9. Owner decisions needed (defaults used until answered)
- **D-1 (Q04):** who reconciles cash/UPI and with what evidence? Default: no confirmations are possible. `finance:reconcile` held by nobody, nothing reaches `paid`.
- **D-2:** length of the post-completion reporting window for collectors. Proposed: 72 hours, configurable in a policy row. Not hard-coded.
- **D-3:** whether a patient can dispute, and whether patient acknowledgment is required for confirmation. Default: patient may dispute only, and acknowledgment is optional evidence.
- **D-4 (Q03/Q04):** over-collection handling. Default: reject.
- **D-5 (Q02):** cancellation or no-show fees and who is owed. Default: none. Zero-charge cancellation only.
- **D-6:** zero-amount bookings. Default: immediate `due`, cannot become `paid` without a positive confirmation. Alternative: a distinct "no charge" state.
- **D-7 (Q03):** invoice and receipt issuer, GST treatment, payee and merchant of record. Default: no invoices, no receipts, no tax fields.
- **D-8:** must two people approve large corrections or overrides? Default: one finance admin plus AAL2 and a reason.
- **D-9 (Q11):** idempotency retention. Rule: deleting dedupe rows must never allow replay of a collection. Keep the permanent `unique(payment_id, request_key)`.
- **D-10:** which provider staff may report on behalf of a doctor (`finance:collect` scope), and which role can see payment amounts in provider-side lists.

## 10. Out of scope and release gates
- Razorpay order, signature, webhook inbox, dedupe, late-capture reconciliation, refunds, payouts, subscriptions, recurring billing, invoicing and GST. All stay disabled until Q03/Q04, with live merchant validation by the client's finance owner.
- Live payments and real patient money remain gated by the AGENTS.md release gates. The test-mode gateway task needs its own ticket.
- Handoff: append to `tests/rls/README.md`, update the task ledger, and list proposed `API_CONTRACTS.md` changes. Do not edit that file in the task.
