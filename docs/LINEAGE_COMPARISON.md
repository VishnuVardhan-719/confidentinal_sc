# Backend lineage comparison: ours (I01/I02) vs the friend's (I01/I02/C01/B01)

Date: 2026-11-17. Author: Kiro. Read-only comparison. The only file written is this document; no code, migrations, commits or DB resets.

| Label | Worktree | Branch / HEAD | Migrations |
|---|---|---|---|
| **O** (ours) | `C:\SURECUREVISIT\.worktrees\kiro-task-I02-provider-onboarding` | `ours/I02-provider-onboarding` @ `5097170` (on `develop` `ce23f63`) | `20261117000100_i01_identity_organizations.sql` (413 lines), `20261117000200_i02_provider_onboarding.sql` (1139 lines) |
| **F** (friend) | `C:\SURECUREVISIT\.worktrees\kiro-integ-friend` | `integ/friend-backend` @ `e8a71ed` (merge base with develop: `d532f09`) | `202611170001_i01_identity.sql` (373), `..0002_i02_provider_onboarding.sql` (333), `..0003_i01_followups.sql` (159), `..0004_c01_catalog.sql` (582), `..0005_b01_booking.sql` (573) |

Citations use `O-I01:line`, `O-I02:line`, `F-1:line` … `F-5:line` for those migration files. Other files are given by path.

Not done in this task: the friend's SQL suites were not executed. Running them needs a reset of the single local Supabase stack this worktree uses, which would be a DB mutation. Their pass claims below come from `tests/rls/README.md` and are marked as reported.

## 1. Table and column coverage vs `docs/CANONICAL_SCHEMA_DRAFT.md`

The canonical core dictionary (CANONICAL_SCHEMA_DRAFT.md lines 259-315) lists 42 core tables. Matching `create table` names in each lineage:

| Canonical table (line) | O | F | Notes |
|---|---|---|---|
| profiles, patients, patient_access, organizations, organization_members, admin_capabilities (259-266) | yes | yes | Shapes differ, see section 7 |
| patient_addresses (262) | no | yes F-5:20 | |
| patient_health_facts (263) | no | no | Questionnaire not built by either |
| providers (272) | yes O-I02:50 | yes F-1:90 | |
| doctor/lab/ambulance/caretaker_profiles (273-276) | yes O-I02:78-135 | **no** | F has one generic `provider_profiles(display_name, description)` F-2:16-22. No specialty, qualification, languages, fleet types or skills anywhere in F. |
| provider_locations (277) | no | no | |
| provider_documents, provider_verification_events (278-279) | yes | yes | |
| provider_service_areas, services, service_price_versions (280-282) | no | yes F-4:21-59 | |
| availability_rules/exceptions, resources (283-285) | no | yes F-5:72-96 | |
| bookings, booking_events, booking_assignments, resource_reservations, doctor_visits (291-295) | no | yes F-5:31-119 | |
| lab_*, ambulance_*, transport_trips, care_plans, payments, payment_collections, notification_attempts (296-311) | no | no | |
| notification_outbox (310) | no | yes F-5:120 | |
| audit_events (312) | yes O-I01:106 | yes F-1:104 | Different shapes, see section 2 |
| consent_events (313) | no | yes F-1:27 | |
| public_reference_counters (314) | partial: `private.provider_reference_counters`, providers only, O-I02:44 | no | F has a booking sequence only (F-5:30-33) |
| idempotency_requests (315) | no (keys stored per command on event/document rows) | yes F-1:112-118 | |
| **Total core tables present** | **14 / 42** | **25 / 42** | |

Non-canonical tables. O adds `provider_verification_cases`, `provider_document_types` and `provider_document_access_grants` (O-I02:138, 163, 248). F adds `provider_profiles`, `service_catalog_types`, `pin_directory`, `provider_catalog_counters`, `coverage_review_events`, `booking_policy_versions` and `booking_transitions` (F-2:16, F-4:9-73, F-5:11, 52).

Public provider reference (ROP "Public reference format", MR-23): O allocates `SCV-DOC/LAB/AMB/CARE-000001` (O-I02:55, 376). F has no provider reference. Its public search returns the internal provider UUID to anon (F-4:358-372). Bookings get `SCV-` plus 12 digits, not `SCV-BKG-` (F-5:33).

Verification states: O implements the six canonical states, including `expired`, with a worker transition (O-I02:57, 534, 1004). F replaces `expired` with `under_review` and maps old `expired` rows to `suspended` (F-2:8-14). Document expiry in F is lazy: an approved provider keeps `verification_state='approved'` and only drops out of `provider_is_publishable` (F-2:105-132).

## 2. RLS and security posture

| Control | O | F |
|---|---|---|
| Deny by default (revoke, then RLS, then explicit grants) | Yes, every table (O-I01:120-128, O-I02:260-274) | Yes, every table (F-1:146-152, F-2:130-134, F-5:554-560) |
| `SECURITY DEFINER` with `search_path=''` | All definer functions. A pgTAP test enumerates `pg_proc` and asserts zero exceptions (`supabase/tests/002_provider_onboarding.test.sql`, "every definer function pins an empty search_path") | All definer functions read have `set search_path=''`. No equivalent catalogue assertion found. |
| Anonymous Auth accounts rejected in SQL | Yes: JWT claim and `auth.users.is_anonymous` (O-I01:132-133) | No: `active_account()` checks profile status only (F-1:122-125). Relies on `enable_anonymous_sign_ins=false` (F `supabase/config.toml:183`). |
| Audit tamper-proofing | Update/delete/truncate triggers (O-I01:228-231, O-I02:487-494). `service_role` loses insert/update/delete/truncate/trigger/references on audit, events and tickets (O-I01:234, O-I02:276-277). | Update/delete/truncate triggers (F-2:330-342, F-5:173-174). No `service_role` revoke appears in any F migration (grep for `service_role` returns nothing), so service_role can insert forged audit rows. |
| Audit content | Trigger-based with allowlisted before/after state and org boundary (O-I01:188-221, O-I02:496-531). Direct writes by trusted roles are also captured. | `actor, action, target_type, target_id` only (F-1:104-109), inserted by hand inside each command. Direct writes are not captured. **No read policy or grant on `audit_events`**, so there is no scoped auditor path (P_AUDIT). |
| MFA for admin actions | `aal2` inside `has_admin_capability` (O-I01:157), used by every review/suspend/document-read path | `aal2` in `providers_private.verifier` (F-2:60-66), `catalog_private.verifier` (F-4:76-82) and the queue RPC (F-4:515, 544) |
| Self-approval | Blocks owner, case subject, any org member (any status) and any uploader (O-I02:423-433) | Blocks owner, any org member and any document owner (F-2:233-236) |
| Admin capability vocabulary | `provider:review`, `provider:document_read`, `provider:suspend` are separate (O-I02:10-13) | One `provider:verify` both reads files and decides (F-1:79, F-2:60-79) |
| Private bucket | `provider-verification`, private, 5 MiB, PDF/JPEG/PNG (O-I02:1096-1099) | Same name, private, **10 MiB** (F-2:269-270) |
| Storage policies | Permissive insert (reserved row, uploader, under 1 hour) and select (60 s ticket). No update/delete policy (O-I02:1101-1104). | Restrictive fail-closed guard across all buckets, plus permissive read/insert and restrictive no-update/no-delete (F-2:287-294) |
| Signed URLs | Ticket-gated. Issuing a ticket writes an event and an audit row (O-I02:969-1001). **Weakness:** once a ticket exists, the client chooses `expiresIn` when it calls `createSignedUrl` itself, so the Q11 60-second link is not enforced in the database. This is inferred from the Storage API contract and was not exercised; the smoke test used 60 s. | Signing denied entirely through `storage.operation()` (F-2:304-309). The API route always returns 503 (`src/lib/providers/service.ts:30-39`). Authenticated downloads still work, but they are **not audited per read**. |
| Private provider fields | `registration_number`, `private_phone` and similar are readable by any org member with `provider:read` (policy O-I02:1030; column grant O-I02:1061 is update-only). A column-level split is needed. | Not applicable: F stores no such fields |
| Emergency dispatch | Disabled in the schema: `ambulance_profiles.scheduled_only check (scheduled_only)` (O-I02:118) | No ambulance-specific table. Not enforced in the schema. |
| Guest access | `provider_directory` view (security barrier) over a frozen allowlisted snapshot only (O-I02:1068-1092) | `search_providers` and `get_public_provider` RPCs (F-4:151, 353-376). `provider_is_publishable(uuid)` is granted to anon as a boolean oracle (F-2:303). |

## 3. Idempotency and optimistic versions

| | O | F |
|---|---|---|
| Version checks | Every mutating command takes an expected version and raises `40001` on a mismatch (O-I01:357, 392; O-I02:761, 801, 853, 892, 929, 960). `touch_version` trigger on every mutable table. | Every mutating command uses `... where version=p_expected_version` and raises `40001` (F-1:210, 275; F-2:176, 201, 222, 249; F-5:306, 361, 374, 394). A booking guard trigger enforces `version=old+1` (F-5:188). |
| Idempotency keys | Per command: request hash stored on `provider_verification_events` with a unique `(case_id, idempotency_key)` index; documents use `unique(provider_id, idempotency_key)`. Same key with different arguments raises `23505` (O-I02:793-798, 884-889). | Generic `idempotency_requests(actor, action, request_key, request_hash)` (F-1:112-118), used by org create, service, price, coverage and booking create (F-1:245-260, F-4:171-182, 209-225, 237-258, F-5:269-292). Different hash raises `40001`. I02 commands in F take no keys. |
| Concurrency proof | `scripts/i02-concurrency.ps1`: 2 sessions on create (1 row) and on suspend (1 commit, one `40001`). Executed. | `tests/rls/run_b01_concurrency.py` (170 lines) for booking accept. Reported, not run here. Resource overlap uses a GiST exclusion (F-5:113); price windows use another (F-4:45). |

## 4. Test depth

| | O | F |
|---|---|---|
| DB tests location | `supabase/tests/*.test.sql` (pgTAP), run by `npx supabase test db` | `tests/rls/*.sql` (custom fail-fast `pg_temp.assert_true` / `expect_state`), run by psql or Python runners. `supabase test db` finds nothing (there is no `supabase/tests` in F). |
| Counted assertions | **484** executed: I01 218/218, I02 266/266 (`docs/TEST_EVIDENCE.md`, I02 section, `Files=2, Tests=484 ... Result: PASS`) | **About 365 static assertion call sites** by grep: i01_identity 126, i01_followups 27, i02_providers 97, c01_catalog 84, b01_booking 31. Fail-fast scripts report pass/fail only, not counts. Pass claimed in `tests/rls/README.md:83-87`. |
| Real Storage API | `scripts/i02-storage-smoke.mjs`: 17/17 checks executed | `tests/unit/provider-storage-http.test.ts` is opt-in. README:136-154 says it was not rerun for the last round. |
| Unit tests | 4 files, 18 tests (vitest) | 13 files. README:90 reports 135 passed and 1 skipped (static `it(` count is 80). |
| CI | `.github/workflows` runs npm lint, typecheck, test and build only | Same steps (`.github/workflows/ci.yml`). Neither lineage runs DB tests in CI. |

## 5. API route coverage vs `docs/API_CONTRACTS.md`

O has **no route handlers**. It has only Zod contracts (`src/lib/contracts/identity.ts`, `providers.ts`) and I01b Supabase clients (`src/lib/supabase/*`).

F has **43 route handlers** under `src/app/api` (auth, organizations, providers, documents, admin review, catalog, coverage, services/prices, availability, bookings). Against the 23 proposed routes in API_CONTRACTS.md:

| API_CONTRACTS route | F |
|---|---|
| `GET /api/providers?category&pin&priceMax` | `GET /api/catalog` (C01 search). `/api/providers` is POST-only (create). |
| `GET /api/providers/:id` | `GET /api/catalog/[id]` (public). `GET /api/providers/[id]` is the owner view. |
| `POST /api/onboarding/provider` | `POST /api/providers`, `/documents`, `/submit` |
| `POST /api/admin/providers/:id/review` | yes |
| `POST /api/bookings`, `/accept`, `/decline`, `/cancel`, `/en-route`, `/arrive` | yes (also `/start`, `/complete`, `/reschedule`) |
| `POST /api/onboarding/patient` (questionnaire) | no (`POST /api/auth/patient` creates the patient row only) |
| verify-arrival, consultations, PDF, proof, payment, webhook, collection, support, assistant, WhatsApp | no (P2 or gated) |

So F covers 9 of the 23 contract routes, including the directory, at different paths. O covers 0.

## 6. Section-0 decisions (`docs/S00_DECISION_SHEET.md`)

| Q | Safe default | O | F |
|---|---|---|---|
| Q01 | Self-only patients, no delegation | Honoured: `grant_source='self'`, composite FK (O-I01:34-55) | Honoured: `source='self'` and self-profile check (F-1:38-50, 134-141) |
| Q02 | No expiry or penalties invented | Not applicable (no bookings) | Honoured: the `system` actor is always rejected, so `requested->expired` cannot fire (F-5:199). No policy seeds (F-5:1-3). |
| Q03 | No invoices, receipts or online collection | Honoured (no finance fields) | Honoured: no payment tables. "never labels a booking as gateway-paid" (F-5:3-4). |
| Q04 | No paid state | Not applicable | Honoured (no payment state) |
| Q05 | Synthetic only, nothing deleted | Honoured: RESTRICT FKs, no deletes (O-I01:9) | Honoured: RESTRICT FKs. Stores address and phone (F-5:20-28) as booking requires. |
| **Q06** | One provider per owner+category; **only individually verified clinicians can be assigned** | **Honoured**: partial unique indexes (O-I02:71-74), per-person staff credential cases (O-I02:138-160) and `person_is_verified` (O-I02:361-374), tested in pgTAP | **Partly**: unique indexes yes (F-1:102-103). **Violated in B01**: `resource_eligible` accepts any active, accepted org member with `provider:read` (F-5:141-150). `is_assigned` only checks org-level `provider_is_publishable` (F-5:151-160). F has no per-person credential record. |
| Q07 | Exact verified PINs only, no promised ETA | Not applicable | Honoured: `pin_directory` needs a `source_reference`, coverage needs `coverage:verify` with aal2 and at most 12 months (F-4:16-20, 47-59). Availability is advisory only (F-4:358). |
| Q08 | Lab completion is not "report delivered" | Not applicable | Not applicable (no lab ops) |
| Q09 | No clinical activation | Honoured | Honoured: `doctor_visits` substates are operational only (F-5:115-119) |
| Q10 | No 24/7 promise | Not applicable | Not applicable |
| Q11 | 60 s private links, durable dedupe, references never reused | Partly: 60 s tickets, but client-chosen URL lifetime (section 2); references never reused (O-I02:376-384) | Stricter on links: signing disabled. Durable `idempotency_requests`. No provider reference. |
| Q12 | Fixed server-side prices | Not applicable | Honoured: bigint paise with an upper bound, immutable price versions, server snapshot checked by the booking guard (F-4:34-46, 100-111; F-5:178-184) |

## 7. Recommendation: hybrid on the friend's base

**Adopt F as the base lineage** and port O's I02 hardening into it as forward migrations. Do not keep both sets of files.

Why F is the base:
- C01, B01 and all 43 routes are written against F's names: `provider_profiles`, `scope_key`, `provider:verify`, `org:read`, `organization_members.accepted_at`, `identity_private.*`.
- Nothing depends on O's I02.
- Rebuilding C01, B01 and the routes on O's vocabulary would cost more than porting O's I02 controls forward.

Port from O before B01 is accepted (each item as a new `2026111700NN_*` migration after `202611170005`, with pgTAP):
1. **Q06 fix (blocking):** per-person credential cases plus a `person_is_verified` equivalent, called from F's `resource_eligible` and `is_assigned` (F-5:141-160).
2. Anonymous-account rejection in `identity_private.active_account()` (port O-I01:132-133).
3. Revoke `service_role` write/trigger/references on `audit_events` and `provider_verification_events` (port O-I01:234, O-I02:276-277). Add a scoped `audit:read` policy (O-I01:274).
4. Provider `public_reference` with a race-safe counter (O-I02:44-48, 55, 376-384). Search should return the reference instead of the UUID.
5. Category extension tables with a frozen public snapshot (O-I02:78-135, 387-406, 1068-1092).
6. Canonical `expired` state with a service-role expiry job (O-I02:1004-1022), or an owner decision to keep F's lazy-expiry model.
7. Separate document-read and suspend capabilities, plus an audited per-read access path (O-I02:248-257, 969-1001). Keep F's signing ban (F-2:304-309): it fixes the client-chosen `expiresIn` weakness in O.
8. Bucket limit: set 5 MiB (approved OQ-6) or record the owner's choice of 10 MiB.
9. Move F's `tests/rls/*.sql` into `supabase/tests` as pgTAP so `supabase test db` counts them. Add DB tests to CI for both.

Concrete merge risks:
1. **Migration ordering is ambiguous.** The two prefix widths (12 vs 14 digits) sort three different ways:
   - ordinal filename sort: `..000100`, `..0001`, `..000200`, `..0002`, …;
   - version-string sort: `..0001`, `..000100`, `..0002`, `..000200`, …;
   - numeric sort: all five F files first.

   Never put both directories' files in one `supabase/migrations`.
2. **Git will merge cleanly and the DB will not.** The filenames differ, so `git merge` reports no conflict. A `db reset` then fails at the second `create table public.profiles`.

   `develop` already contains O's I01 (`03761eb`). F branched from `d532f09` and does not contain develop (`git merge-base --is-ancestor ce23f63 HEAD` returned 1). Adopting F means removing O's two migration files from the branch, plus a reset or reconciliation of any database that applied them. So far only the local stack has (per `docs/TEST_EVIDENCE.md`).
3. **Duplicated tables with different columns:**
   - `profiles` and the five identity tables;
   - `providers`, `provider_documents`, `provider_verification_events`, `audit_events`;
   - examples: `organizations.name` vs `display_name`; `patient_access.scope` row vs `scopes[]`; `admin_capabilities.scope_key` vs `organization_id`; `provider_documents.object_name` vs `object_path`.
4. **Same-signature functions with different semantics:** `set_organization_member(uuid,uuid,text,text,text[],integer)` and `accept_organization_invite(uuid,integer)`. Role sets also differ: F uses `staff`, O uses `doctor/technician/driver/caregiver`.

   Different-signature overloads would coexist: `create_organization(text)` vs `(text,uuid)`, and `create_provider` with different argument orders. PostgREST resolves RPCs by argument names, so mixed client code could call the wrong overload.
5. **Two `auth.users` triggers.** O-I01:183 `on_auth_user_created` and F-1:186 `i01_auth_profile` both insert into `profiles`. The second fails on the primary key and breaks signup.
6. **Bucket and Storage policy collisions.** F inserts `provider-verification` without `on conflict` (F-2:269), so it fails if O's runs first. O's `on conflict do update` (O-I02:1096-1099) would silently change F's limit to 5 MiB.

   F's restrictive `i02_objects_guard` and `i02_no_signing` (F-2:287-309) would block O's ticketed signing. Its `object_access` reads `object_name`, a column O does not have.
7. **Capability and scope vocabularies differ.** Admin grants issued under one set (`provider:verify` vs `provider:review`; `org:read` vs `organization:read`) mean nothing to the other.
8. **App-layer duplication.** O has `src/lib/contracts/*` and `src/lib/supabase/*` (from I01b, on develop). F has `src/lib/validation/*` and `src/lib/db/request-client.ts`. F does not contain the I01b files, so pick one set and drop the other.
9. **Tests break across lineages.** O's 484 pgTAP assertions target O's schema and will fail against F. F's suites are not wired to `supabase test db` or CI.

Owner decisions needed: whether to replace develop's I01 with F's; whether to keep the lazy-expiry model or port the canonical `expired` state; and the bucket size (5 or 10 MiB).
