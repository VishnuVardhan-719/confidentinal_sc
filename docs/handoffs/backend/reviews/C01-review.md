# C01 adversarial review (Kiro, read-only)
Repo SureCureVisit-codex-C01. Reviewed `supabase/migrations/202611170004_c01_catalog.sql` (M, 542 lines, five transaction blocks), `src/lib/catalog/{service,http}.ts`, `src/lib/validation/catalog.ts`, `src/app/api/catalog/**`, `src/app/api/provider/{services,coverage}/**`, and the assertion list of `tests/rls/c01_catalog.sql` (T). The working tree is the merge HEAD (802a8bd); I read the C01 files as they stand there.
I did not run SQL, Docker or tests. Findings come from reading.
Result: no critical or high issue found. Private columns, unapproved or expired providers and fake coverage did not leak in any path I could trace. Medium and low items follow.

## MEDIUM
**M1. No commercial price ceiling or sanity bound.** M:36, M:129-133, M:198-200; `validation/catalog.ts:5`.
- Only the bigint limit is enforced (the code comment says so). A provider can publish `9223372036854775807` paise (about 92 quadrillion rupees) or 0 paise, and both show in public search (M:134).
- Downstream: B01 totals (price x quantity, lab baskets, sums) overflow `bigint` and raise `22003`, so one hostile listing can break every booking request that touches it. Also breaks UI layout.
- Fix: DB CHECK `amount_paise <= <cap>` per catalog unit (owner decision, e.g. 10^10 paise as an interim ceiling) and decide whether 0 is allowed. Mirror in `paiseSchema`. Add a test at cap and cap+1.

**M2. Forward corrections were appended to the same migration version.** M:319-542.
- Four "forward correction" blocks (statement_timestamp fix, reviewer queue, MFA NULL fix, withdraw owner-only) sit inside `202611170004`. Any database that already applied the first block will never run the rest, because the version is already recorded. This is the same defect I raised for I02 (N1). The file is also five separate BEGIN/COMMIT blocks, so a failure in block 3 leaves blocks 1-2 committed.
- Concrete consequence if an environment kept the first block: `search_providers` uses `now()` for price windows, a fresh price is invisible until the next transaction; `catalog_private.verifier` returns NULL instead of false when `aal` is absent, so `if not verifier` does not fire; and coverage withdrawal is open to managers.
- Fix: confirm no shared DB has the first block applied. If any does, move blocks 2-5 to `202611170005_c01_corrections.sql`. Keep one transaction per file.

**M3. No per-provider caps; reviewer queue can be flooded.** M:59, M:220-239, M:471-486, M:171-174, M:209-217.
- A manager can create unlimited services (each call with a new key), unlimited price versions per service, and propose every PIN in `pin_directory` (about 19k). `list_service_area_reviews` returns all statuses ordered by `id`, not pending first (M:506-507), so proposals bury the real queue. A revoked provider can immediately re-propose the same PIN (revoked rows are outside the unique index at M:59).
- Fix: caps checked under the provider lock (for example 100 services, 200 price versions per service, N pending or approved PINs; the number is an owner decision), plus `where a.status='proposed'` and an order by `created_at` in the queue.

## LOW
**L1. Public search is uncached and does per-row work.** `lib/auth/http.ts:6` (`private, no-store`), M:343-352, M:322-329.
- Each result row calls `provider_publicly_bookable` (storage join, three existence checks). The predicate runs for every candidate that passes the joins, before `limit`, so a category/PIN with many providers that fail the predicate (expired documents) is scanned in full. `anon` can also call `search_providers` straight through PostgREST, bypassing the API's Zod limits and headers. There is no rate limit in the repo.
- Fix: edge rate limit, a short public `Cache-Control` for anon (30-60 s), and a materialized `publishable` filter ordered before the function call. Not urgent for the staging target.

**L2. Coverage approval `valid_until` has no upper bound.** M:274, `validation/catalog.ts:28`. A reviewer can approve until year 9999, which defeats the "expiry" rule. Cap at a policy horizon (for example 12 months, owner decision).

**L3. Expired approved coverage cannot be renewed by a manager.** M:59, M:273, M:524-533.
- The area stays `status='approved'` after `valid_to`, so the unique index (M:59) rejects a new proposal for the same PIN with `23505` and the reviewer cannot re-approve (only `approved -> revoked` is allowed). The only way out is the org owner withdrawing, then re-proposing. A manager sees a 409 with no hint. Add an `expired` outcome or allow re-approval with a new `valid_until`.

**L4. `propose_service_area` bumps `providers.version`.** M:233-234, M:431-433. The I02 commands (`add_provider_document`, `submit_provider`) use the same version as their expected value. Any coverage proposal during onboarding makes the next document or submit call fail with 409. Use a separate counter or leave the provider version alone.

**L5. Free-text public fields change after approval without review.** M:182-183, M:383-384; `service_title` and `terms_version` are public (M:134).
- Approved providers can edit `service_title` (public) at any time, for example to add a credential claim, a phone number or a "free" lure. `terms_version` is a provider-chosen string, not a platform policy id, so a later booking snapshot of it proves nothing.
- Fix: reject URLs and long digit runs in titles, and bind `terms_version` to an admin-owned policy row (B01 dependency). A re-review flag for title changes is optional.

**L6. Duration is unbounded in practice.** `validation/catalog.ts:18`, M:25. `duration_minutes` accepts up to 2,147,483,647. B01 slot arithmetic would overflow `timestamptz` ranges. Cap per catalog type (for example 1440 for visits).

**L7. Existence difference for private reads.** `service.ts:48-50`. `GET /api/provider/services?providerId=` returns 404 for a random id but 200 with empty lists for I02 provider verifiers, who can read the `providers` row (I02 `providers_verifier_read`). That reveals existence to verifiers only. Acceptable; note it.

## Checked and found sound
- Public leakage: `search_providers` and `get_public_provider` return a fixed column list (M:121-124, T:58 asserts the names), and the API strips unknown fields through `publicRow` (`service.ts:22-26`). Draft, submitted, under_review, rejected, suspended, expired-document, disabled-owner, proposed/rejected/revoked/expired coverage, and withdrawn coverage all return zero rows (T lines for each state). A missing id and a non-visible id both give an empty result then 404 with one body (`service.ts:43`).
- Direct table access: `anon` has no table grants (T:47). `authenticated` only has SELECT through RLS (`can_read` for owner/manager, area reviewer for areas), and `provider_service_areas` is column-limited so `proposed_by`/`approved_by` are hidden (M:305-306). `coverage_review_events` is readable only by area reviewers. Writes have no grants. Price rows are protected by a trigger that allows only closing `effective_to` (M:94-110).
- Fake coverage: `pin_directory` has no seed and an FK from `provider_service_areas.pin_code` (M:49) blocks unknown PINs (T:`23503`). Approval requires `approved_by`, `valid_from` and `valid_to` (M:56). The search matches the PIN exactly with `a.pin_code=p_pin` and a time window (M:347). Reviewer cannot be the proposer, the owner or an org member (M:268-269).
- Injection and limits: all inputs are typed parameters or anchored regexes (`^[1-9][0-9]{5}$`, `^(0|[1-9][0-9]{0,18})$`), with no dynamic SQL. The numeric compare happens before the bigint cast (M:129), so overflow raises `22023` and not `22003`. `limit` is 1..50 in SQL (M:128) and in Zod. A partial cursor is rejected (M:130). The keyset order `(amount, provider, service)` is total and stable.
- Cross-org IDOR: `upsert_service` selects the service with `provider_id = p.id` under the provider lock (M:377); `publish_price_version` resolves the provider from the service id and then `lock_manager` runs `access(...,'manage')` first, so a null or foreign id gives `42501` (M:395-396). Org tests cover missing scope, invited, disabled member and disabled organization (T).
- Price races: price publish locks provider then service, checks `s.version = expected` before it picks the timestamp (M:397, M:406), closes the previous window and opens the next with the same `statement_timestamp()`, and the GiST exclusion (M:45) backs it up. T asserts one current price and `40001` on a stale concurrent version. Replay returns the stored result after authorization.
- Definer hygiene: every function sets `search_path=''`. Only `search_providers` and `get_public_provider` are executable by `anon` (T:55); `provider_publicly_bookable` and `area_reviewer` are revoked from `anon` (M:309, M:458). `create or replace` keeps the ACLs. MFA absence is now false instead of NULL (M:515).

## Tests to add
1. Price at cap and cap+1; zero price policy (M1).
2. Migration applied twice or in two steps leaves the same schema (M2).
3. Caps: the N+1th service, price version and PIN fail with `23514` (M3).
4. Queue returns proposed rows first (M3).
5. Re-propose after expiry works for a manager (L3).
6. Concurrent two-session price publish with the same expected version: exactly one `40001`.
