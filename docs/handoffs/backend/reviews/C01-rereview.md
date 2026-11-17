# C01 round-2 re-review (task/C01-catalog, 802a8bd..HEAD = ca989c4 + 373251f)

Scope: static, read-only. Read `git diff 802a8bd..HEAD` for the migration, `src/lib/catalog`, `src/lib/validation/catalog.ts`, the 4 new routes and the unit tests. I also read the unchanged `review_service_area`, `withdraw_service_area`, `can_read` and `lock_manager` for context. I ran no tests and changed no repo files.
Not reviewed: the uncommitted working-tree changes in that worktree (`package.json`, `tests/rls/run_i01_followups.py`, `scripts/rls-all.mjs`, `tests/rls/zz_q01_*.sql`, `tests/unit/rls-runner.test.ts`). They are outside the requested diff.

## Verdict
The core fixes are sound:
- The price ceiling is enforced at the table CHECK, in the RPCs and in Zod.
- The coverage RPCs keep the same authorization shape: `lock_manager` for the provider side, and `verifier` plus a conflict-of-interest exclusion for review.
- The reviewer queue is now oldest-proposed-first with a tuple keyset.
- Revoked areas are filtered before the 100-row limit.

Two findings need fixing before B01 or the UI builds on this: M1 (queue cursor breaks on `+` in a URL) and M2 (caps that can never be reclaimed).

## HIGH
None found.

## MEDIUM

**M1. The reviewer-queue cursor is fragile and trusts client-supplied fields.**
- `coverageQueue` builds `nextCursor` as `"0|1,<created_at>,<id>"`. `created_at` comes from PostgREST as `...+00:00`.
- In a query string an unencoded `+` decodes to a space. `queueCursorSchema` (`z.iso.datetime({offset:true})`) then rejects it with 422. Any client that puts the cursor into a URL without `encodeURIComponent` can only read page 1.
- The SQL compares `a.created_at = p_after_created_at` exactly. Normalising to `toISOString()` (millisecond precision) would drop microseconds and trigger `invalid_cursor`. So the format cannot be "fixed" on the client side.
- `p_after_priority` is client-supplied and is not checked against the real status of row `p_after`. A caller can pass a mismatched priority with a valid `(id, created_at)` and skew paging (skip or repeat rows). The data stays inside the verifier's own scope, so there is no leak. This is a correctness issue only.
- Fix: make the cursor an opaque base64url string, or send only `p_after` and derive `created_at` and the priority inside the function from that row (which the function already looks up). Add a test with a `+` in the cursor.

**M2. The new caps can lock a provider out permanently, because nothing is ever reclaimed.**
- Coverage cap: `count(*) where status<>'revoked' >= 50`. `rejected` rows and expired-but-still-`approved` rows are not `revoked`, so they count forever.
  - A provider with 50 rejected or expired proposals can never propose again.
  - The re-propose path only revokes the expired approval for the same PIN being proposed. Expired approvals on other PINs stay counted.
- Service cap: `count(*) from services where provider_id=...` includes `archived` rows, and there is no delete. 100 lifetime services is the limit, not 100 active.
- Price-version cap: at 200 versions a service can never change price again. No archive or clone path exists.
- The product cap values (50, 100, 200) need an owner decision, and the lockout is worse than the abuse it prevents.
- Fix: count only live rows (`proposed` plus unexpired `approved`; services not `archived`). Prefer a periodic or lazy sweep of expired approvals (revoke them in every `propose_service_area`, not just for the same PIN). Define a successor path for exhausted price versions.

**M3. Migration 004 was edited in place, and the file now holds duplicate function definitions.**
- A shared local DB already has 004 applied. The in-place edits (new CHECK bounds on `duration_minutes`, `amount_paise` and `valid_to`, the new `provider_catalog_counters` table) do not reach any database that already ran the old 004. A fresh replay and a long-lived DB will diverge.
- The same functions (`upsert_service`, `publish_price_version`, `propose_service_area`, `search_providers`) now appear twice, as the original `create function` and again as `create or replace` further down. Each fix had to be applied twice, and only the last copy is live. The first copy of `propose_service_area` differs from the final one: it does not null `approved_by` or `proposed_by` on the idempotent-replay return.
- Fix: say explicitly that 004 is unreleased and all environments must be rebuilt, or ship the changes as a forward migration. Collapse the duplicates.

**M4. Cross-branch break: B01's fixture price violates the new ceiling.**
- B01's `tests/rls/b01_booking.sql` inserts `amount_paise = 9007199254740993` to prove bigint precision. The new CHECK (`<= 10000000000`) rejects that insert. Once B01 is rebased on this C01, that suite fails at its fixtures. The B01 precision assertion (`'9007199254740993'`) needs a value that is above 2^31 and below 10^10, or a different way to test precision.
- B01's `c01_catalog.sql` copy (a stale C01 suite) also still fails on `invited_membership_expiry`. Resolve by taking C01's updated suite when rebasing.

**M5. The expected-version contract for coverage proposals changed silently.**
- `propose_service_area` now checks `provider_catalog_counters.coverage_version`, not `providers.version`. A client that sends `providerVersion` (as the old private catalog GET returned) now gets 409 forever.
- The GET now returns `coverageVersion` (defaulting to 1 when the counter row does not exist). The first `propose` creates the row with `on conflict do nothing`, which is fine.
- The counter only increments on proposals, not on review or withdraw. Two parallel proposals for different PINs conflict, which is safe but forces a refetch.
- Fix: record this in the API contract and change notes. Add a test that a stale provider version is rejected.

## LOW
- **L1. Zero price remains allowed** (`amount_paise between 0 and 10000000000`; the comment says "Zero remains pending owner policy"). A free service creates `amount_paise=0` bookings. B01 accepts them and P01 must handle zero-amount obligations. Needs an owner decision (see the P01 brief, D-6).
- **L2. Ceiling is duplicated in six places** (table CHECK, `search_providers` x2 copies, `publish_price_version` x2 copies, Zod). Changing it later means editing all of them. A single SQL constant function would avoid drift.
- **L3. `search_providers` rejects `p_price_max` or `p_after_amount` above the ceiling with 22023.** A user who filters by a huge max price gets 422 instead of "no limit". Clamp instead.
- **L4. The expiry-revoke event is attributed to the provider.** In `propose_service_area` the `coverage_review_events` row for an expired approval has `actor_profile_id = actor` (the provider's own manager), `from_status='approved'`, `to_status='revoked'`. An auditor reading the history sees a provider "revoking" an approval. It is accurate (they triggered it) but misleading. Use a distinct reason code or a system actor marker.
- **L5. `duration_minutes` max 10080 (7 days) is far above anything B01 can schedule.** B01's `in_schedule` requires a slot to fit inside one day's window, so services longer than that day-window are never bookable but still publishable. A pre-publish warning or a lower cap fits better.
- **L6. `.neq("status","revoked")` fixes the history-limit problem, but the provider can still read revoked rows directly under RLS,** so the filter is a UX choice and not a privacy control. That is fine, but do not rely on it for hiding.
- **L7. The revoked-areas fix applies only to `privateCatalog`.** The limit is 100 and the cap is 50 non-revoked, so it cannot truncate today. If the cap is later raised above 100, the same bug returns.

## Verified sound
- **Caps are race-safe.** `lock_manager` takes the provider row lock before every count-then-insert, so two parallel creates cannot both pass the check.
- **Coverage RPC authorization:**
  - propose and withdraw go through `lock_manager` (manage access rechecked after the lock; suspended providers refused).
  - Idempotent replay happens after the lock, so a revoked manager cannot replay.
  - Review requires the verifier capability and rejects the proposer, the individual owner and any member of the provider's organization (conflict of interest).
- **Revoked-area filtering in discovery** is unaffected: public search and `provider_publicly_bookable` require `status='approved'` and `valid_to>now()`.
- **Expiry re-propose:** only `status='approved' and valid_to<=now()` for the same provider and PIN are revoked, with review-event and audit rows. A still-valid approval or an open proposal hits the unique index `c01_area_current` (23505). The 12-month bound holds in SQL (CHECK and review) and in Zod (calendar-year, day clamped for short months).
- **Queue authorization:** `list_service_area_reviews` needs AAL2 plus an active, unrevoked `coverage:verify` capability, validates `limit`, and checks the cursor row belongs to the reviewer's scope.

## Suggested tests to add
- A cursor containing `+` through the route, and a mismatched `p_after_priority`.
- 50 rejected proposals followed by a new proposal (should succeed once M2 is fixed).
- A stale `providerVersion` sent as `expectedVersion` on propose.
- A zero-price publish and booking (documents the open decision).
- The B01 fixture value against the new ceiling.
