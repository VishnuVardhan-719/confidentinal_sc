# C01 design brief: verified catalog, services, pricing, PIN coverage, public discovery
(Kiro, read-only. Sources: END_TO_END, CANONICAL_SCHEMA_DRAFT §3/§8/§P_PUBLIC, API_CONTRACTS, PERMISSIONS, BUSINESS_RULES. Names marked (proposed) are not in the repo yet.)

## 0. Assumptions and dependencies
- C01 depends on I02 for `provider_documents`, `provider_verification_events` and the verification columns. Provider "verified" must be derived from I02 state and never stored a second time in C01.
- I01 `providers` has `unique(id,category)`, which C01 FKs use as a composite key. I01 `identity_roles()` still has the unverified-role leak (see the I02 threat file, F1). Fix it before C01 relies on it.
- Synthetic data only. No seeded real-looking providers. Empty-state is a valid result.
- Open owner decisions (Q07 and BUSINESS_RULES Q6): which PINs are launch-verified, operating hours, capacity. C01 builds the mechanism and ships zero coverage rows.

## 1. Tables (migration `202611xx_c01_catalog.sql`, one author)
| Table | Purpose and key constraints |
|---|---|
| `service_catalog_types` (proposed) | Admin-owned reference list: `code`, `category`, `name`, `unit` (visit, test, trip, hour, day). Provider services must reference it. Prevents free-text fake services. |
| `services` | `id`, `provider_id`, `category`, FK `(provider_id,category)` -> `providers(id,category)`, `catalog_type_id` (category must match), `title`, `description`, `duration_minutes` > 0, `status` in (draft, published, archived), `version`. Only `published` is public. |
| `service_price_versions` | `service_id`, `version`, `amount_paise bigint >= 0`, `currency = 'INR'` CHECK, `unit`, `terms_version`, `effective_from timestamptz not null`, `effective_to`. `unique(service_id,version)`. EXCLUDE USING gist (`service_id` WITH =, `tstzrange(effective_from,effective_to,'[)')` WITH &&). Immutable: BEFORE UPDATE trigger allows only `effective_to` null -> value. No DELETE. |
| `lab_tests` | Only if the owner wants lab baskets in C01. Otherwise defer to B01. Parent `services` row optional. |
| `provider_service_areas` | `id`, `provider_id`, `provider_location_id` null, `pin_code text CHECK (pin_code ~ '^[1-9][0-9]{5}$')`, `proposed_by`, `status` in (proposed, approved, rejected, revoked), `valid_from`, `valid_to`, `approved_by`, `approved_at`, `version`. `unique(provider_id,pin_code)` where status in (proposed,approved). Index `(pin_code, provider_id)`. |
| `provider_locations` | Only if the doctor, lab or caretaker base address is needed. Public output contains PIN and city only, never a street address. |
| `coverage_review_events` (proposed) | Immutable ledger: area id, reviewer, from/to status, reason, evidence note. Mirrors `provider_verification_events`. |
| `pin_directory` (proposed) | Reference list of valid Indian PINs (6 digits) with state and district. Used to validate input only. It never marks a PIN as bookable. |

No `ratings`, `reviews` or `eta` tables or columns. No gateway or payout columns.

## 2. Public vs private column separation
- Base tables stay private: `revoke all ... from public, anon, authenticated`, with RLS enabled. Provider owner SELECT only through RLS predicates (P_PROVIDER, org scope).
- The public path uses a `security definer` or `security_invoker` function, not a view over base tables, e.g. `public.search_providers(...)` returning a fixed column set. If a view is used, set `security_invoker=true` and also expose only the allowlist.
- Public allowlist: `provider_id`, `category`, `display_name` (provider-approved public name), `service_id`, `service_title`, `duration_minutes`, `amount_paise` (as text), `currency`, `unit`, `terms_version`, `pin_code` matched, `city`, `advisory_availability` (nullable).
- Never public: owner profile id, org id, membership, documents, licence or registration number, document ids, storage paths, reviewer notes, coverage reviewer, exact street address, phone, email, version, internal status columns.
- Provider-private extras (owner and org with `provider:read`): draft services, all price versions, proposed coverage, rejection reasons.
- Admin (P_VERIFY with `coverage:verify` + aal2): coverage review queue and a limited provider summary. No clinical data.

## 3. RPC / API list
Every mutation: `auth.uid()` only, `require_actor()`, `set search_path=''`, `expected_version`, audit row, idempotency key where creation is involved. No actor id parameter.
| Route | RPC (proposed) | Rules |
|---|---|---|
| `GET /api/providers?category=&pin=&priceMax=&cursor=` | `search_providers` | Anon and authenticated. Zod allowlist, `limit <= 50`, keyset cursor. `pin` is required for bookable results. |
| `GET /api/providers/:id` | `get_public_provider` | Same visibility rule as search. 404 for non-visible, identical body to not-found. |
| `POST /api/provider/services` and `PATCH` | `upsert_service` | P_PROVIDER with `provider:manage`. Provider must not be suspended. Category must match the provider. Publishing requires an active price version. |
| `POST /api/provider/services/:id/prices` | `publish_price_version` | Closes the previous window and opens the new one in one transaction. Server validates integer paise from a decimal string. Rejects floats, negatives and > cap. |
| `POST /api/provider/coverage` | `propose_service_area` | P_PROVIDER. Validates PIN format and `pin_directory`. Status always `proposed`. Max N PINs per provider (cap decision with owner). |
| `POST /api/provider/coverage/:id/withdraw` | `withdraw_service_area` | Owner only. |
| `POST /api/admin/coverage/:id/review` | `review_service_area` | `coverage:verify` + aal2 + non-expired capability + reviewer is not the provider owner or org member (four-eyes). Writes `coverage_review_events`. Requires reason on reject or revoke. |
| `POST /api/admin/providers/:id/review` | I02 | Not C01. Suspension and expiry in I02 must cascade to C01 visibility without a data copy. |
| System | `expire_catalog_visibility` | Not required for correctness (public reads recheck time). Used only for audit rows. Server-only. |

## 4. RLS and visibility rules
Single predicate, defined once in `identity_private.provider_publicly_bookable(provider_id uuid, at timestamptz default now())` (proposed), and used by every public function and any view:
```
providers.status = 'active' and providers.verification_state = 'verified'
and organization (if any) status = 'active'
and owner profile status = 'active' (individual) 
and not exists required document where expires_at <= at or review state <> 'approved'   -- recheck at read time, never rely on the sweep
and services.status = 'published'
and a price version with effective_from <= at and (effective_to is null or effective_to > at)
and area.status = 'approved' and area.valid_from <= at and (area.valid_to is null or area.valid_to > at)
```
- Base tables: SELECT policy for owner or org only; no anon or authenticated INSERT, UPDATE or DELETE grants. Writes happen only through RPCs.
- `anon` may execute only the two public functions. The functions never return rows when the predicate is false.
- `i01_*_locked` Storage policies are untouched by C01.
- Suspended, expired, rejected, draft and inactive providers disappear immediately, with no cache or materialized view that outlives the predicate. If caching is added, TTL <= 60 s and a documented limitation.

## 5. PIN coverage matching algorithm
Input `pin` (string), `category`. Steps:
1. Normalize: trim, reject unless `^[1-9][0-9]{5}$` (also reject leading zero and non-ASCII digits). Return 422 on bad input. Never "close" or prefix match.
2. Exact match on `provider_service_areas.pin_code = :pin` with `status='approved'` and the validity window containing `now()`.
3. Join providers on `provider_id`, filter `category`, then apply `provider_publicly_bookable`.
4. Join services (published) and the current price version. A provider with zero qualifying services is excluded.
5. Sort deterministically: `amount_paise asc, provider_id` (no ranking, no sponsorship, no fake relevance). Keyset pagination on that order.
6. If no `pin` is supplied: return only a count of categories or a browse list marked `bookable=false`. Browsing nationwide is allowed by the business matrix. Booking is not. No row may claim local coverage without an approved area.
7. Adjacent-PIN, district or radius fallback is out of scope. A radius feature needs geometry sign-off (BUSINESS_RULES coverage row).
8. Empty result returns `[]` with an honest "no verified provider covers this PIN yet" message. No filler providers.

## 6. Top 10 abuse cases with assertions
1. **Unapproved provider listed.** For each `verification_state` in (draft, submitted, rejected, expired, suspended) and each `status` <> 'active': `select is((select count(*) from public.search_providers('doctor','500001')), 0::bigint)`, as anon and as authenticated.
2. **Expired credential still listed.** Set a required document `expires_at = now() - interval '1 second'` without running the sweep: `search_providers` returns 0 rows for that provider. Also test the IST boundary with a frozen clock.
3. **Fake or unapproved coverage.** Area `status` in (proposed, rejected, revoked) or `valid_to <= now()`: provider absent for that PIN. Provider is present for an approved PIN only: `select is((select count(*) from public.search_providers('doctor','500002') where provider_id=:p), 0::bigint)` when only 500001 is approved.
4. **Self-approved coverage.** `review_service_area` as the provider owner, as an org member, and as an admin without `coverage:verify`, with aal1, with an expired or revoked capability: `throws_ok(..., '42501')`. `has_table_privilege('authenticated','public.provider_service_areas','INSERT,UPDATE,DELETE')` is false.
5. **Direct table access and column leak.** As anon: `select count(*) from public.services` and from every C01 base table returns 0 or is denied. `select array_agg(column_name order by column_name)` from the public function's return type equals the allowlist exactly (no licence, owner, org, document, storage, notes columns).
6. **Price tampering and overlap.** `amount_paise` as a float, negative, over the cap or a string with decimals: 22023 or 23514. Overlapping effective windows: exclusion violation 23P01. `update service_price_versions set amount_paise=...` raises 55000 (immutable). Concurrent `publish_price_version` calls from two sessions leave exactly one open window.
7. **Cross-category or cross-tenant service write.** Provider of category lab creates a service with a doctor catalog type: 23503 or 23514. Org member without `provider:manage`, an invited or disabled member, or a member of another org: 42501 on `upsert_service`, `publish_price_version`, `propose_service_area`.
8. **Suspension and disabled org/profile cascade.** After suspension, org disablement or profile disablement, the provider's services and prices are unreachable by `get_public_provider` (404 identical to missing) within the same transaction. `identity_roles()` returns no provider role.
9. **PIN input abuse.** `pin` values `'50001'`, `'5000011'`, `'050001'`, `'5000 1'`, `'50001%'`, `'5%'`, `"' or 1=1 --"`, Arabic-Indic digits: all give 422 and no SQL error text. Verify the query is parameterized and `pin` has no LIKE path. No wildcard enumeration of every provider.
10. **Enumeration and stale data.** `get_public_provider` returns the same status, body and timing class for non-existent and non-visible ids. Pagination: `limit=1000` is clamped or rejected, cursor tampering returns 422, and no total count of hidden providers leaks. Responses carry no `version`, owner id or document reference. `cache-control` is short or `no-store`, never CDN-cached beyond 60 s.

Cross-cutting: a catalog query on `pg_proc` shows every C01 definer function has `search_path=""`, is revoked from `public` and granted only as listed, and `anon` execute rights exist only on the two public functions.

## 7. Codex implementation file scope (exclusive, in order)
1. `supabase/migrations/202611xx0001_c01_catalog.sql`: tables, constraints, EXCLUDE, immutability triggers, `provider_publicly_bookable`, RPCs, grants, RLS. Single author, no other migration in flight.
2. `tests/rls/c01_catalog.sql`: assertions 1 to 10 and the cross-cutting checks above, using synthetic fixtures built inside the test transaction.
3. `src/lib/catalog/schemas.ts`: Zod schemas (PIN, category, paise decimal string, pagination cursor), shared with the friend by agreement.
4. `src/lib/catalog/paise.ts` (+ unit test `src/lib/catalog/paise.test.ts`): decimal string <-> bigint, no floats.
5. `src/lib/catalog/service.ts`: typed domain service that wraps the RPCs. Every route calls this.
6. `src/app/api/providers/route.ts` and `src/app/api/providers/[id]/route.ts`: public GET, Zod validation, cache headers, 401/403/404/422/429 mapping.
7. `src/app/api/provider/services/**` and `src/app/api/provider/coverage/**`: provider mutation routes.
8. `src/app/api/admin/coverage/[id]/review/route.ts`: reviewer route.
9. `src/lib/catalog/*.test.ts` and `tests/api/catalog.*.test.ts`: API-level contract tests (status codes, allowlisted fields, identical 404).
10. `docs/API_CONTRACTS.md`: update only the C01 rows (owner writes, friend reads). Plus the task ledger and handoff note with migration notes and limitations.
Out of scope: `src/app/**` pages, components, any I01 or I02 file, booking tables, payments, lab baskets (unless the owner confirms), radius or geo search, ratings, ETAs, seed data of real-looking providers.

## 8. Honest limitations to record in the handoff
- No coverage rows exist until a verified human admin approves them. Search returns empty on a fresh database by design.
- Document expiry is enforced at read time. The worker sweep is only for state and audit.
- Cap values (PINs per provider, price ceiling) and the required-document list are owner decisions and are not guessed.
