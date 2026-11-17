# I02 re-review (Kiro, read-only), HEAD fe95098
Read: `supabase/migrations/202611170002_i02_provider_onboarding.sql` (M), `src/lib/providers/service.ts`, `src/app/api/providers/[id]/documents/route.ts`, `tests/rls/i02_providers.sql` (T) and its README. I did not run SQL, Docker or tests. Status comes from reading plus the README's recorded results.

## Status of earlier findings
| ID | Status | Evidence |
|---|---|---|
| H1 identity_roles leak | FIXED | M:311-324 requires `status='active'`, `approved`, and `provider_is_publishable(p.id)`. T:17 asserts each state. |
| H2 provider-chosen expiry | PARTIAL | M:192 caps at 5 years. Reviewer still cannot confirm or enter a validity date. M:246-259 records reviewed document ids only. A provider can declare 5 years on a licence with 1 year left. README admits this. |
| H3 signing guard unverified | FIXED | README round 1: the opt-in SDK test `tests/unit/provider-storage-http.test.ts` calls `createSignedUrl`, `createSignedUrls`, `createSignedUploadUrl` and records the real GUC values (`storage.object.sign`, `...sign_many`, `...sign_upload_url`). M:303-305 matches them. Caveats: the test is opt-in and skipped in normal runs, and `storage.render.image_sign` was never observed. |
| M1 renewal deadlock | PARTIAL | Still no self-service path (M:189, M:211). A recovery exists that I missed earlier: admin `suspended -> under_review -> rejected` (M:236-237) flips documents to `rejected`, then the owner re-adds and submits. It is three admin steps, labelled "rejected", and the provider cannot start it. README says it is an owner decision. |
| M2 read audit | PARTIAL | M:75-76 limits verifier evidence reads to `submitted`/`under_review`. Reads (storage SELECT) are still unaudited. No download audit event or reason exists. |
| M3 approve marks files that do not exist | FIXED | M:247-252 flips only pending documents with an object. Ids stored in `reviewed_document_ids` (M:46, M:256). Readiness now fails if any pending document has no object (M:111-113). See N2 for a side effect. |
| M4 four-eyes | NOT FIXED | M:231-239: one admin can run `submitted -> under_review -> approved`. Owner decision, per README. |
| M5 reviewer identity and reasons | FIXED | M:307-309 revokes table SELECT and grants only safe columns. `public_reason` added (M:45, M:257-259). T:84-85, T:121-122 assert `42501` on `actor_profile_id` and `reason`. `service.ts:25` uses the safe list. |
| L1 locks before authorization | FIXED | M:86-88 authorizes first in `lock_provider`. `create_provider` checks `org_admin` before locking (M:148). |
| L2 status/state CHECK | FIXED | M:11-12 backfills and adds `providers_active_requires_approval`. |
| L3 audit immutability | FIXED | M:326-338 triggers on UPDATE, DELETE and TRUNCATE for `audit_events` and `provider_verification_events`. T:140-143 assert `55000`. |
| L4 MIME vs content | NOT FIXED | Bucket MIME list only (M:266). No magic-byte check. |
| L5 orphan objects | NOT FIXED | Update and delete denied (M:288-289). No cleanup job. |
| L6 suspension evasion | NOT FIXED | Owner decision. |
| L7 anon `provider_is_publishable` | NOT FIXED | M:299 unchanged. Acceptable only if C01 needs it. |
| L8 version return | FIXED | M:196, M:203 return `provider_version`. Route uses `result.provider_version`. |

## New findings from the fixes
**N1 (Medium). Migration 002 was edited in place after it had been applied.**
- README says the local DB "received only the corresponding reviewed definition changes". I01's own header says "Forward corrections only after application".
- Effect: any database that applied the first 002 (including the one used by other branches, the I01 and C01 worktrees) lacks `identity_roles()`, the triggers, the column grants, `public_reason`, `reviewed_document_ids` and the CHECK, and cannot be upgraded because `create function add_provider_document` is not idempotent. M:311 `create or replace identity_roles` is the only replace.
- Fix: before anything shared applies 002, confirm no shared DB has it. Otherwise ship the deltas as `202611170004_i02_corrections.sql`.

**N2 (Medium). Leftover pending documents without a file block re-approval.**
- M:111-113 treats a pending document with no object as "not ready" (`credentials_ready(false)`).
- Exploit or failure: an approved provider keeps a pending optional document with no file (approval flips only documents that have objects, M:250-252). After suspension and `under_review`, M:254 reverts verified documents to pending, and M:240 can never pass for that provider. The only exit is reject (M:237), which marks every pending document rejected.
- Same cause at submit: a provider who reserved an optional document and never uploaded cannot submit until the document is superseded (M:198) or rejected.
- Fix: exclude `superseded`/optional-without-object documents from the second clause, or have `submit_provider` and `under_review` supersede documents with no object.

**N3 (Low). The 50-document cap counts superseded and rejected rows (M:194).**
- Each failed upload attempt burns a slot, and slots never come back. A provider reaches `document_limit` permanently, with no cleanup path. Count only `pending` and `verified`, or add a rolling window.

**N4 (Low). Verifiers cannot read evidence for suspended or approved providers, and admins cannot read `reason` either.**
- M:76 and M:307-309 apply to every authenticated user, including admins. An admin reviewing a `suspended -> under_review` case sees the provider state change only after the transition and has no REST path to the internal `reason` of earlier decisions. Functional gap, not a leak. Provide an admin-only definer RPC if reviewers need history.

**N5 (Low). Immutability triggers also block legitimate erasure and test cleanup (M:331-338).**
- Truncate and delete fail for every role, so privacy erasure or retention clean-up needs `alter table ... disable trigger` by a superuser. Document the procedure as a reviewed out-of-band step. Any future test that truncates these tables will fail.

**N6 (Low, interaction with I01 follow-up M1). Role promotion keeps `accepted_at`.**
- `org_admin` (M:57) requires `accepted_at is not null` for managers. An owner can promote an active `staff` member to `manager` with the same scopes without re-acceptance (I01 follow-up finding M1), and `org_admin` then returns true. Fix in the I01 follow-up migration.

## Checked after the fixes, no new exploit found
- `identity_roles()` uses `provider_is_publishable` (definer, pinned search path) and still only exposes the caller's own providers. It adds one storage join per provider per call, so it is a performance risk if called per request.
- `org_admin` change (M:57): owners no longer need `accepted_at`. The owner row from `create_organization` has none, so this fixes a real lock-out. `org_scope` still requires an active organization, an active member and the scope.
- `update_provider` profile upsert (M:175-178) sits behind the same authorization, state and version checks. It cannot write another provider's profile.
- `providers_private` grants unchanged: only `access`, `verifier` and `object_access` are executable by `authenticated` (M:293).
- Column-level grant revoke order is correct (M:307-309). `select *` through PostgREST on `provider_verification_events` now fails with `42501`, so clients must list columns, as `service.ts:25` does.
