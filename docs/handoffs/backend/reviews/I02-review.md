# I02 adversarial review (Kiro, read-only)
Scope: `supabase/migrations/202611170002_i02_provider_onboarding.sql` (M), `src/lib/providers/service.ts`, `src/app/api/providers/**`, `src/app/api/admin/providers/[id]/review/route.ts`, `tests/rls/i02_providers.sql`.
I read the code only. I did not run the SQL, the tests or a local Supabase stack, so each finding below is from reading, not from a reproduced exploit.

## HIGH

**H1. Unverified providers still get a provider role (I01 `identity_roles()` is unchanged). Threat case #1, F1.**
- File: not touched by I02. I01 migration, `public.identity_roles()`. I02 migration has no `create or replace` for it.
- Exploit: any active user calls `create_provider('doctor',...)` (M:130-149). `identity_roles()` then returns `doctor` because it only excludes `p.status = 'suspended'`. The new provider is `draft` and `inactive`. A `rejected` provider, and a provider moved `suspended` -> `under_review` (M:223-224 sets `status='inactive'`), also get the role back.
- Impact: the moment anything gates on `identity_roles()`, such as the upcoming C01/B01 routes or a UI guard, an unreviewed or suspended provider passes. `grep identity_roles` in `src` found no current caller, so it is not exploitable yet, but it is a standing trap.
- Fix: in the I02 migration, `create or replace function public.identity_roles()` so the provider branch requires `p.status='active' and p.verification_state='approved'` and `public.provider_is_publishable(p.id)`. Add a test for each state (draft, submitted, under_review, rejected, suspended, approved with expired document).

**H2. Document expiry date is chosen by the provider and never confirmed by the reviewer. Threat case #9.**
- File: M:166-188 and M:281-303 (`add_provider_document`), M:206-238 (`review_provider`).
- Exploit: `p_expires_at` only has to be `> now()` and finite. A provider submits `9999-12-31` for a licence it has not renewed. `review_provider` takes no document ids and no reviewer-confirmed validity, so approval silently accepts the declared date. `credentials_ready` and `provider_is_publishable` then trust it forever.
- Fix: cap `p_expires_at` (for example `<= now() + interval '5 years'`, owner decision). Make approval carry a reviewer-supplied `valid_until` per required document (or `expires_at` becomes a reviewer-written column), and store the reviewed document ids in `provider_verification_events`.

**H3. Signing block depends on unverified `storage.operation()` values. Threat case #4, F5.**
- File: M:304-309 (`i02_no_signing`). The test at `tests/rls/i02_providers.sql:57-62` sets the same GUC strings by hand, so it proves nothing about the real Storage API.
- Exploit: if the Storage service writes different operation names than `storage.object.sign`, `...sign_many`, `...sign_upload_url`, `storage.render.image_sign`, the restrictive policy is a no-op. A member then calls `createSignedUrl` directly with a user JWT and a long `expiresIn`. The URL survives later revocation of membership, verifier capability or suspension. The app route (`signed-url/route.ts`) only blocks its own route and does not stop a direct Storage call.
- I could not confirm the real names from the Supabase Storage source in this session. Treat it as unverified.
- Fix: run a local Supabase stack, call `createSignedUrl`, `createSignedUrls` and `createSignedUploadUrl` as an owner, and assert each returns 4xx. Record the actual `storage.operation` value in the test. Do not accept a green SQL test that sets the GUC itself.

## MEDIUM

**M1. Approved providers have no renewal path and can get stuck. (availability, not security)**
- File: M:155, M:173, M:194, M:217-219, M:102-103, M:249.
- `add_provider_document`, `update_provider` and storage writes only work in `draft` or `rejected`. An `approved` provider whose document expires is unpublishable but cannot upload a new one. Admin can `approved -> suspended -> under_review`, but approval then needs `credentials_ready(false)`, whose second clause (M:102-103) fails while any pending document is expired. M:230-231 turns verified documents back to `pending`, including the expired one, so the deadlock is permanent.
- Fix: define the renewal policy (owner decision) and a `suspended -> draft` or `expired` re-open path owned by an admin. Exclude `superseded` and expired documents of non-required kinds from the second clause.

**M2. No audit trail for document reads (F4).**
- File: M:123-124, M:243-254, M:260.
- A verifier (global or org-scoped, with no relationship to the provider) reads any provider's evidence directly through `storage.objects` under RLS, in any state including `draft`. No `document.downloaded` event is written, there is no reason, and no per-view limit. The signed-URL route returns a constant 503, so the only read path is the unaudited one. The business matrix requires "credential review evidence".
- Fix: add a server-only download route that uses the service role, checks `providers_private.access`, writes `audit_events` (document id, actor, reason) and then streams. Then remove the verifier from `object_access` reads, or restrict verifier reads to providers in `submitted`/`under_review`.

**M3. Approval can mark documents `verified` that have no file, and the reviewed set is not recorded.**
- File: M:227-229, M:96-104.
- `credentials_ready(false)` only needs one pending required-kind document with an object. On approval, every pending document (for example `identity`, which has no object) becomes `verified`. Concurrent storage inserts are checked without a lock (M:243-254), so an object can land after submission. The admin does not choose or sign off the document ids.
- Fix: flip only documents that have a `storage.objects` row. Require every pending document to have an object at submit time. Record document ids and sizes or hashes in `provider_verification_events`. Optionally lock the provider row inside `object_access` writes (not possible in a policy, so enforce through `status` flip on submit).

**M4. A single admin can run the whole review (no four-eyes). Open owner decision.**
- File: M:206-238. Admin A can do `submitted -> under_review -> approved` alone. Self-approval is blocked (M:212-214), but there is no second reviewer. The matrix names "authorized verification admin + operations owner". Decide and, if required, enforce `actor <> previous under_review actor`.

**M5. Providers can read reviewer identities and internal reasons.**
- File: M:118, M:125-126. `grant select` on `provider_verification_events` exposes `actor_profile_id` and `reason` to the provider owner and org admins through PostgREST, regardless of the column list in `readProvider` (service.ts:25).
- Impact: a provider can learn which admin rejected or suspended it. Reasons written for internal notes are visible.
- Fix: column-level grants (`grant select(id,provider_id,from_state,to_state,provider_version,occurred_at)`) and a separate public-reason column, or a security_invoker view.

## LOW

- **L1. Row locks before authorization (M:76-89, M:154, M:170, M:193, M:210).** `lock_provider` takes `for update` on the provider and its organization row for any caller who supplies a provider id, before the access check. A user can hammer a competitor's provider and org rows to cause lock contention. Check `access(...)` first, then lock, or lock with `nowait`/`lock_timeout` for unauthorized callers.
- **L2. No cross-column check (F2).** No constraint ties `status='active'` to `verification_state='approved'`. All writers are RPCs today. Add `check (status <> 'active' or verification_state = 'approved')` for defense in depth.
- **L3. Audit tables are not immutable (F4).** No BEFORE UPDATE/DELETE trigger on `audit_events` or `provider_verification_events`. Today only the absence of grants protects them.
- **L4. Declared MIME, not actual content.** The bucket restricts to three MIME types and 10 MiB (M:240-241), but nothing ties the uploaded object's MIME to `content_type` in the object name (M:32-33), and nothing checks magic bytes. An admin may open a mislabeled file. Serve with `nosniff` and `attachment`, and document that no malware scan exists.
- **L5. Orphans.** Users cannot delete or replace objects (M:262-264), so abandoned uploads stay in the bucket. Add a service-role cleanup job.
- **L6. Suspension evasion.** A suspended individual can create up to 5 organizations (I01) and register a fresh provider (M:137-147). Needs an admin-side flag on the profile. Open owner decision.
- **L7. `provider_is_publishable` is granted to `anon` (M:274).** It is a boolean oracle over provider UUIDs. It is low risk because UUIDs are unguessable, but it also reveals approval state to anyone holding an id. Keep it only if the C01 public function needs it.
- **L8. Version bump order.** `add_provider_document` (M:180, M:294) updates the version then raises `conflict` if no row matched, but on the success path it does not return the new version. The route assumes `expectedVersion + 1` (documents/route.ts:16). It is correct today, but fragile if the RPC changes.

## Checked and found sound
- Search paths are pinned (`set search_path = ''`) on every security-definer function. `providers_private.*` is revoked from `public`, `anon` and `authenticated` except `access`, `verifier` and `object_access`. `required_kind` is immutable and not definer.
- Direct writes: `authenticated` has only SELECT on the three new tables. No direct INSERT, UPDATE or DELETE on `providers`.
- Self-approval is blocked for owner, org member and document uploader (M:212-214). The aal2, capability validity, revocation and scope checks are in `verifier()` (M:58-61). Inside `review_provider` the capability row is locked `for share`.
- State machine in `review_provider` (M:216-220) is closed. `update_provider`, `add_provider_document` and `submit_provider` all require `draft` or `rejected`. Storage writes require `pending`, the uploader and the same state. So submitted/under_review documents are immutable.
- Storage: restrictive `i02_objects_guard` fails closed for every other bucket, update and delete are denied, buckets are locked, and the bucket is private with a size and MIME limit.
- API layer: routes pass only `auth`-bound input to RPCs, no actor or status fields from the client, and error codes map to fixed messages without SQL text.

## Tests to add before merge
1. Real-Storage test for H3 (direct signing calls).
2. `identity_roles()` per state (H1).
3. Expiry above the cap rejected, reviewer-supplied validity stored (H2).
4. Renewal deadlock scenario (M1).
5. Verifier read writes an audit row, or is blocked (M2).
6. Provider owner cannot select `actor_profile_id` from events (M5).
