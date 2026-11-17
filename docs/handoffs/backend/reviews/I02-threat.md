# I02 threat model and test checklist (Kiro, read-only review)

Sources: docs/PERMISSIONS.md, docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md, supabase/migrations/202611170001_i01_identity.sql.
Names marked `(proposed)` do not exist yet. Rename them to match the I02 migration.
Test style: pgTAP or psql in `tests/rls/i02_*.sql`. Impersonate users with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","aal":"aal2"}'`.

## I01 findings that I02 must fix or work around

- **F1. `identity_roles()` grants provider roles too early.** It returns `p.category` for every provider row the caller owns or can read, unless `status = 'suspended'`. A `draft`, `rejected`, `expired` or `inactive` provider therefore receives the `doctor`, `lab` and other roles. The role must require `status='active' and verification_state='verified'`.
- **F2. `status` and `verification_state` are independent columns.** `status='active'` with `verification_state='draft'` is a legal row today. A cross-column CHECK constraint is needed.
- **F3. There is no expiry data.** `providers` has no `expires_at`, no document table and no sweep job.
- **F4. `audit_events` carries no from/to state, reason or document ID.** It also has no immutability trigger. Without direct grants it is only protected by the absence of a policy.
- **F5. `i01_objects_locked` is RESTRICTIVE `for all ... using(false)`.** Any permissive Storage policy added by I02 stays dead until this policy is dropped. Do not replace it with a broad policy.
- **F6. Admin capabilities are scoped.** `scope_key` can be `org:<uuid>`, but `identity_roles()` only honours `global`. I02 verification RPCs must check the scope explicitly.

## Top 15 abuse cases, ranked

### 1. Unverified provider receives a provider role (F1)
Impact: the person can use provider-only functions without any review.
```sql
-- as user U who owns a providers row with verification_state in ('draft','submitted','rejected','expired','suspended') or status<>'active'
select is((select count(*) from public.identity_roles() r where r <> 'patient'), 0::bigint, 'no provider role before verification');
```
Repeat for each state. Also assert that `verified` + `active` yields exactly one provider role.

### 2. Self-verification or a mutable approval (privilege escalation)
Impact: a provider approves themselves, or edits `verification_state` directly.
```sql
set local role authenticated;  -- as owner U
select throws_ok($$update public.providers set verification_state='verified', status='active' where individual_owner_profile_id = auth.uid()$$, '42501');
select throws_ok($$select public.verify_provider(:pid, 'verified', :expected_version, :reason)$$, '42501', 'forbidden');   -- (proposed) caller has no provider:verify capability
-- admin who is also the provider owner or an org member of that provider's org:
select throws_ok($$select public.verify_provider(:own_pid,'verified',:v,:r)$$, '42501', 'forbidden');   -- four-eyes: reviewer <> owner/member
select is(has_table_privilege('authenticated','public.providers','UPDATE'), false);
```
Also assert that `verify_provider` checks `auth.jwt()->>'aal'='aal2'`, a non-revoked capability row and an unexpired one. Test each of those four failures separately.

### 3. Storage bypass through the client API
Impact: reading or writing another provider's documents with the Supabase client.
```sql
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id='provider-docs'), 0::bigint);   -- (proposed) bucket name
select throws_ok($$insert into storage.objects(bucket_id,name,owner) values('provider-docs','x/y.pdf',auth.uid())$$, '42501');
select is((select public from storage.buckets where id='provider-docs'), false);
select is((select count(*) from storage.buckets where id='provider-docs' and public), 0::bigint);
-- anon:
set local role anon; select is((select count(*) from storage.objects), 0::bigint);
```
Also assert that the `i01_*_locked` restrictive policies still exist after the I02 migration. All access goes through server routes that use the service role after an authorization check. Add a test that no client-side bundle references the service key.

### 4. IDOR on document metadata and signed URLs
Impact: an authenticated user guesses or enumerates document IDs and gets another provider's licence.
```sql
-- A = owner of provider PA, B = owner of provider PB, doc DA belongs to PA
set local request.jwt.claims = '{"sub":"<B>","aal":"aal1"}';
select is((select count(*) from public.provider_documents where id = :DA), 0::bigint);   -- (proposed) RLS
select throws_ok($$select public.authorize_document_download(:DA)$$, '42501', 'forbidden');   -- (proposed) must raise the same error for a missing doc and a foreign doc
```
API test: `GET /api/provider-documents/{DA}/url` as B returns 404 or 403 with an identical body, status and timing class for missing and foreign IDs. The response must not contain the storage path. Signed-URL expiry must be <= 120 s. Check that `expiresIn` is a server constant and not a client parameter. After the owner's membership or `evidence:manage` scope is revoked, a new URL request returns 403.

### 5. Cross-tenant upload path (path traversal or prefix spoofing)
Impact: a document is written under another provider's prefix, or overwrites an approved file.
Server rule: the object key is generated on the server as `{provider_id}/{document_id}/{sha256}.{ext}`. The client never supplies a key.
```sql
select throws_ok($$select public.register_provider_document(:other_pid, 'licence', ...)$$, '42501');   -- caller lacks provider:manage or evidence:manage on that provider
select throws_ok($$insert ... storage_path = '../'||:other_pid||'/x.pdf'$$, '23514');   -- CHECK (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(pdf|png|jpg)$' and storage_path like provider_id::text||'/%')
select is((select count(*) from public.provider_documents where storage_path <> provider_id||'/'||id||'/'||sha256||'.'||ext), 0::bigint);
```
Also test that upload never uses `upsert`, and that a document with `locked_at is not null` cannot have its object replaced.

### 6. Malicious or oversized file (MIME spoof, HTML or SVG, zip bomb, executable)
Impact: stored XSS or malware served from the project origin to the reviewing admin.
```sql
select throws_ok($$insert into public.provider_documents(..., mime_type) values(..., 'text/html')$$, '23514');
-- CHECK (mime_type in ('application/pdf','image/jpeg','image/png') and size_bytes between 1 and 10485760)
```
API tests:
- A `.pdf` file with an `image/svg+xml` or HTML body is rejected based on magic bytes, not on the client-supplied Content-Type.
- An 11 MB upload is rejected.
- The filename in `Content-Disposition` is server-generated.
- Responses carry `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`.
- The bucket's `allowed_mime_types` and `file_size_limit` are set in the migration.
- No malware scanner is in scope. Document that limitation in the handoff.

### 7. Stale approval (TOCTOU between submission and review)
Impact: the provider swaps documents after submitting, and the admin approves a different file than they reviewed.
```sql
-- admin reviewed submission snapshot v3; owner replaced a doc, which bumped version to 4
select throws_ok($$select public.verify_provider(:pid,'verified',3,:reason)$$, '40001', 'conflict');
-- owner cannot mutate documents while verification_state='submitted':
select throws_ok($$select public.replace_provider_document(:docid, ...)$$, '55000');   -- (proposed) state check
-- approval records the reviewed document hash set:
select isnt((select reviewed_doc_hashes from public.provider_verifications where provider_id=:pid order by decided_at desc limit 1), null);   -- (proposed)
```
Add a concurrency test with two sessions: the owner edits while the admin approves. Exactly one wins and the version is checked.

### 8. Illegal state transitions (verification state machine)
Impact: a rejected, suspended or expired provider re-enables itself, or an owner resets itself to draft.
Allowed transitions:
- draft -> submitted
- submitted -> verified | rejected
- rejected -> submitted
- verified -> expired | suspended
- expired -> submitted
- suspended -> submitted only after an admin lift

```sql
-- table-driven test over all 36 (from,to) pairs and each actor type (owner, org member, admin, anon);
-- only the allowed pairs by the allowed actor succeed. Everything else raises 22023 or 42501.
select throws_ok($$select public.submit_provider(:suspended_pid, ...)$$, '55000');   -- owner cannot leave 'suspended'
select throws_ok($$select public.lift_suspension(:pid, ...)$$, '42501');   -- non-admin
-- DB-level backstop trigger rejects any UPDATE on providers.verification_state outside the allowed matrix, even from definer code
```
Also add the F2 constraint: `check (status <> 'active' or verification_state = 'verified')`. Test: an insert or update of `status='active'` with `verification_state='submitted'` raises 23514.

### 9. Expired credential still bookable or listed
Impact: expired licences keep a provider public, which breaks the "verified only" coverage rule in the business matrix.
```sql
-- doc expiry in the past; sweep not yet run:
select is((select count(*) from public.public_bookable_providers where id=:pid), 0::bigint);   -- (proposed) the view must compute expiry at read time: verified and no required doc with expires_at <= now() (timestamptz, not date)
-- after sweep:
select is((select verification_state from public.providers where id=:pid), 'expired');
select is((select status from public.providers where id=:pid), 'inactive');
select is((select count(*) from public.identity_roles() ...), 0::bigint);   -- as owner, no provider role
```
Expiry tests:
- The boundary uses `expires_at <= now()` with a frozen clock.
- Test an IST-midnight expiry: a doc that expires on 2026-12-31 IST must be treated as expired at 2026-12-31 18:30 UTC, not a day later.
- The sweep function is idempotent.
- The sweep writes one `audit_events` row per provider.
- The sweep is not callable by `authenticated` (`has_function_privilege('authenticated','public.expire_providers()','EXECUTE') = false`).
- A provider with several required docs expires when the earliest one expires.
- Renewal must not leave the provider verified on an old document while a new one is pending, unless a documented grace policy exists. That policy is an owner decision. Do not guess it.

### 10. Suspension does not take effect immediately or is reversible by the provider
Impact: a suspended provider keeps acting through cached JWT claims, an org membership, or a second org.
```sql
-- after admin suspends P:
select is((select count(*) from public.identity_roles() r where r <> 'patient'), 0::bigint);   -- as owner AND as an active org member with provider:read
select throws_ok($$select public.update_provider_profile(:pid, ...)$$, '42501');   -- (proposed) every provider-write RPC checks status<>'suspended' server-side
select is((select count(*) from public.public_bookable_providers where id=:pid), 0::bigint);
select throws_ok($$select public.submit_provider(:pid)$$, '55000');
```
Tests:
- An org owner cannot clear the suspension by deleting and recreating the provider. `unique(organization_id,category)` plus `on delete restrict` prevents this. Assert that DELETE is not granted.
- An org owner cannot clear suspension by creating a new organization (limit 5 per actor). Record this as an accepted risk that needs human review, and add an admin-side flag on the profile. Open question for the owner.
- Open bookings and pending appointments for a suspended provider are blocked from confirmation. Mark this as a dependency on the booking task.

### 11. Org-membership abuse on provider and document RPCs
Impact: a disabled, invited, scope-less or foreign-org member manages evidence.
```sql
-- table-driven: member status in (invited, disabled), org status disabled, profile status disabled,
-- scopes without 'provider:manage' / 'evidence:manage', member of a different org, member of the same org but another provider
select throws_ok($$select public.register_provider_document(:pid,...)$$, '42501');   -- each case
select throws_ok($$select public.create_provider(:org_id,'lab')$$, '42501');   -- (proposed) caller lacks provider:manage, or the org is disabled
-- individual provider: individual_owner_profile_id must equal auth.uid(); a caller-supplied owner id is ignored or rejected
select throws_ok($$select public.create_provider_individual('doctor', :other_profile_id)$$, '42501');
```
A scope removed from a member takes effect on the next call, and the next signed-URL request fails. Also test that RPCs lock the `organization_members` row (`for update`), as I01 does, to avoid a race between scope revocation and an upload.

### 12. Admin capability misuse (scope, expiry, aal, revoked grants)
Impact: an org-scoped or expired reviewer verifies globally, or reads documents without MFA.
```sql
-- capability row cases: revoked_at set; expires_at in the past; valid_from in the future; scope_key='org:<other>' ; capability='security:audit' ; capability='coverage:verify' only
-- jwt aal='aal1'
select throws_ok($$select public.verify_provider(:pid,'verified',:v,:r)$$, '42501');   -- each case
select throws_ok($$select public.authorize_document_download_admin(:docid, :reason)$$, '42501');   -- same cases
```
Also assert:
- `coverage:verify` cannot verify credentials.
- `security:audit` cannot approve.
- The admin download RPC requires a non-empty reason and writes an audit row.
- No client path creates, extends or revokes `admin_capabilities` (`has_table_privilege('authenticated','public.admin_capabilities','INSERT,UPDATE,DELETE') = false`).
- Disabling a profile (`status='disabled'`) blocks admin actions on the next call.

### 13. Audit gaps and tampering
Impact: no record of who approved, viewed or suspended, or the record can be edited.
```sql
select is(has_table_privilege('authenticated','public.audit_events','INSERT,UPDATE,DELETE'), false);
-- after each I02 mutation, one audit row exists with the exact action:
--   provider.created, provider.submitted, provider.verified, provider.rejected, provider.suspended, provider.suspension_lifted,
--   provider.expired, document.registered, document.replaced, document.downloaded (incl. admin reviewer + reason), document.deleted
select is((select count(*) from public.audit_events where target_id=:pid and action='provider.verified'), 1::bigint);
-- immutability backstop:
select throws_ok($$update public.audit_events set action='x'$$, '55000');   -- (proposed) BEFORE UPDATE/DELETE trigger raises, even for definer roles
-- rolled-back mutation leaves no audit row; audit and state change are in the same transaction
```
I01 `audit_events` has no `from_state`, `to_state`, `reason` or metadata columns (F4). I02 must add these (or a `provider_verifications` ledger) so that approval can be reconstructed. Required by the "Credential review evidence" gate.

### 14. Replay, double submit and idempotency
Impact: duplicate documents, double verification, or a retried request that bypasses the version check.
```sql
select is(public.register_provider_document(:pid,'licence',...,:key), public.register_provider_document(:pid,'licence',...,:key));   -- same result id
select throws_ok($$select public.register_provider_document(:pid,'registration',...,:key)$$, '40001', 'conflict');   -- same key, different payload hash
-- verify_provider replay with the same expected_version after success: raises 40001 and does NOT write a second audit row
select is((select count(*) from public.audit_events where target_id=:pid and action='provider.verified'), 1::bigint);
-- per-provider cap: 21st document raises 23514; per-user upload rate limit enforced at the API
```
The request key must be scoped by actor and action, as `idempotency_requests` already does. Check that the idempotent replay path re-checks authorization, as `create_organization` does with `org_scope`, so that a revoked member cannot replay a stale key.

### 15. Data exposure through error messages, listings and logs
Impact: licence numbers, document paths or reviewer notes leak to patients, to other providers, or to logs.
```sql
-- public/patient view contains only whitelisted columns
select is((select array_agg(column_name order by column_name) from information_schema.columns where table_name='public_bookable_providers'), array['category','display_name','id']);   -- (proposed) adjust to the approved list; no licence_no, doc ids, storage_path, reviewer notes, owner profile id
select is((select relkind||coalesce(array_to_string(reloptions,','),'') from pg_class where relname='public_bookable_providers'), 'vsecurity_invoker=true');   -- or a definer function with explicit filter; never a plain view over RLS-less tables
-- reviewer notes and rejection reasons: owner sees the public rejection reason only, not internal notes
select is((select count(*) from public.provider_review_notes), 0::bigint);   -- as owner (proposed table)
```
API and logging tests:
- The error body for 403 and 404 is identical.
- Server logs and `audit_events` never contain file contents, signed URLs or tokens. Grep the test log output for `token=`.
- Signed URLs are not returned in list endpoints.
- A signed URL is `Cache-Control: no-store`.
- Test data is synthetic only. Fixtures contain fake licence numbers with no real-person data (AGENTS.md invariant).

## Cross-cutting checks (not ranked)

- Every new table has `enable row level security`, `revoke all ... from public, anon, authenticated`, and a test that `anon` gets 0 rows and cannot insert. This is the I01 pattern.
- Every new `security definer` function has `set search_path = ''`, takes no actor ID parameter, and uses `identity_private.require_actor()`. Test with a query on `pg_proc` that lists definer functions in `public` whose `proconfig` lacks `search_path=""`. The result must be empty.
- `revoke ... from public, anon` on each RPC and `grant execute` to `authenticated` only. For a sweep or system job, grant to a service role only.
- Migration and RLS tests run on an isolated synthetic DB (`docs/PERMISSIONS.md`). Nothing runs against shared staging without Claude coordination.
- Enabling any provider publication (listing) remains gated on "Provider activation" sign-off: authorized verification admin plus operations owner, with credential evidence and service coverage. I02 may store and verify but must not publish anything outside the `public_bookable_providers` filter.

## Open owner decisions (do not guess)

1. Required document types per category, and which of them must carry an expiry.
2. Grace period or renewal policy for expired documents.
3. Reviewer separation: is a single admin enough, or is four-eyes required for approval?
4. Retention and deletion of rejected or expired documents, and the legal basis for keeping them.
5. Re-registration after suspension, and how to prevent evasion by creating a new account or organization.
6. Whether org-scoped admin capabilities (`org:<uuid>`) may verify, given `identity_roles()` only honours `global`.
