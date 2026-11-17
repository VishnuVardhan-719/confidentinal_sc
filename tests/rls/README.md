# I01 identity and follow-up verification handoff

## C01 Kiro review fixes — current handoff, 17 November 2026

Uncommitted changes to `202611170004_c01_catalog.sql` are authorized in place.
Apply the complete edited file to a disposable I01/I02/I01-followups baseline;
do not rerun its CREATE statements over an already migrated shared database.
This verification uses a schema-only local clone retaining original ownership,
removes only C01 objects inside that disposable DB, then applies the edited file.
The shared local database is not reset or migrated by this review-fix task.
Existing multi-block migration history is retained; no new migration number is
introduced. Deployments that already recorded 004 need explicit integration
reconciliation and must not assume an edit to 004 will automatically run (M2).

Implemented review policy: M1 price range is 0 through `10000000000` paise,
enforced by a DB CHECK, RPC validation and Zod. Zero remains accepted pending the
owner's minimum-price decision. M3 checks run after provider locking and after
idempotent-replay lookup: at most 100 services (all statuses), 200 price versions
per service (all history), and 50 non-revoked areas (including rejected/expired
rows). Replay at each cap succeeds; a new N+1th create fails `23514` without
changing any counter or closing the current price. Revoked coverage history and
idempotency/audit history remain unbounded; retention is a separate operation.
L6 duration is 1–10080 minutes in SQL and Zod.

L2 approvals require a finite future expiry within 12 calendar months. Zod uses
UTC calendar arithmetic including leap-day clamping; SQL is authoritative.
L3 re-proposing the same expired approved PIN under the provider lock retires
the old row to revoked, writes an immutable expiry event/audit record and creates
a fresh proposed area. An org manager can request renewal, but independent
`coverage:verify` plus MFA is still required to approve it. Unexpired approved or
already proposed coverage keeps its unique-key protection.

L4 contract change: `POST /api/provider/coverage`'s `expectedVersion` now refers
to the **coverage proposal counter**, initially 1, not `providers.version`.
`GET /api/provider/services?providerId=...` returns `coverageVersion` alongside
the unchanged `providerVersion`. `provider_catalog_counters` is private/RLS,
has no client write grants and advances only on successful fresh proposals.
Provider onboarding versions are never changed by coverage creation/renewal.
Each area's own version still controls review and withdrawal. Exact idempotent
retries recheck authority and return the original area without advancing counters.

Reviewer queue sorts pending (`proposed`) first, then each group's oldest
`created_at`, with UUID as a final deterministic tie. Queue results now include
`created_at`; HTTP `nextCursor` is `priority,created_at,area_uuid` (0 pending,
1 reviewed). The RPC accepts `p_after`, `p_after_priority`, `p_after_created_at`
together or all null. Cursor scope and immutable timestamp are checked; unknown
or inaccessible cursors return the same 422. The original priority is preserved
when a reviewer approves the last row of a page, so remaining pending work is
not skipped. This is live continuation, not a snapshot; other records can still
change between pages. Older UUID-only queue cursors must be discarded.

Document-only findings, deliberately unchanged:

- **L1:** public discovery stays `private, no-store` and rechecks credential/price/
  coverage eligibility per candidate. There is no edge/platform rate limiter;
  callers can use the guest RPC directly. Production-scale query plans, upstream
  throttling and a revocation-safe cache/filter strategy need a separate review.
  Do not add caching that can keep revoked providers publicly visible.
- **L5:** service titles and provider-chosen `terms_version` can change without
  moderation. Titles are not vetted credential claims and a terms label is not a
  platform-approved policy identifier. Bind accepted policies in B01 and decide
  moderation/PII rules separately; this task adds no filtering or moderation.
- **L7:** an I02 provider verifier can read an authorized provider skeleton but
  cannot read C01's owner/manager-only services, so the private catalog route can
  return 200 with empty lists versus 404 for an unknown provider. This existence
  distinction is limited to already-authorized verifiers and remains accepted.

Regression coverage: ceiling/ceiling+1/zero, one-week duration boundary, approval
at/exceeding 12 months (plus leap-day validation), all N/N+1 caps and replay at
caps, private counter isolation, manager renewal/history, unchanged onboarding
versions, stale coverage counters, queue priority/chronology/review-then-next. Four
SQL suites run with `ON_ERROR_STOP=1` on the disposable DB and roll back fixtures.
Final application verification totals are recorded after execution below.

Integration guard: `.gitignore` now anchors generated coverage output to
`/coverage/`. The former unanchored `coverage/` hid the provider coverage and
admin coverage API directories from Git. Include those newly visible route
sources when integrating; they are required by the tested C01 API contract.

Final verification for this review-fix task:

```text
Fresh complete 004 migration on disposable I01/I02/followups schema -> exit 0
i01_identity.sql  -> exit 0; I01 SQL assertions passed
i01_followups.sql -> exit 0; I01 follow-up SQL assertions passed
i02_providers.sql -> exit 0; I02 SQL assertions passed
c01_catalog.sql   -> exit 0; C01 SQL assertions passed
npm run lint      -> exit 0; no diagnostics
npm run typecheck -> exit 0; Types generated successfully
npm test          -> 11 files passed / 1 skipped; 135 tests passed / 1 skipped
npm run build     -> exit 0; compiled successfully; static pages 19/19
git diff --check  -> exit 0
```

SQL ran via `docker exec -i supabase_db_surecurevisit psql -U postgres
-d c01_review_verify_20261117 -v ON_ERROR_STOP=1 < tests/rls/<suite>.sql`.
Every suite rolled back its synthetic fixtures. The schema-only disposable DB
was removed after verification; shared DB/migration history was unchanged.
Independent review's queue-cursor finding was fixed and regression-tested;
the hidden-route ignore finding was fixed as described above. No commits, push,
`.context` edits, remote migrations, live data or UI changes. Actual HTTP/Auth/MFA
gateway behavior, staging/E2E and all cap/revocation concurrency races remain
outside this run; unit HTTP tests mock boundaries and SQL simulates JWT claims.

## I02 provider onboarding handoff — 2026-11-17

### Kiro re-review N2/N3/N6 — latest follow-up

Owner confirmed no shared database applied I02 and authorized editing it in place; no commit.
N2: readiness ignores pending reservations without objects. Required category evidence
still needs a current uploaded object; uploaded pending evidence still must be current,
and verified evidence must retain its object. Optional reservations stay pending and
are excluded from approval's reviewed IDs. This supersedes the earlier strict M3
expectation that every pending reservation must have bytes.
N3: the 50-document cap counts only pending and verified rows. Rejected/superseded
history no longer exhausts it. Historical metadata/files remain unbounded by this cap;
retention/cleanup remains a separate operational follow-up.

N6 is an I01-side follow-up: set_organization_member updates membership_role but only
resets acceptance for invitation, scope expansion or disabled-member reactivation.
An active staff-to-manager promotion with unchanged scopes retains accepted_at, so
I02 org_admin treats it as accepted. The I01 follow-up must set status=invited and
accepted_at=NULL on role promotion; accept_organization_invite must then record
a fresh accepted_at. Add same-scope promotion/re-acceptance coverage there. I01's
migration is unchanged in this round; this finding remains open for that owner.

SQL regressions reproduced credentials_required for the optional reservation and
document_limit for 50 historical rows before the fixes. Now cover submit, approval,
suspension/re-approval, exact reviewed IDs, required missing bytes, expired uploaded
optional evidence, missing verified objects, and enforcement at 50 pending/verified.
Local DB received only the two revised function definitions. Independent narrow
review found no readiness/authorization defect.

Actual verification: lint and typecheck exited 0; npm test: 8 files passed/1 skipped,
78 tests passed/1 skipped; production build passed, 14/14 static pages generated.
Both SQL suites passed directly from disk and rolled back fixtures. The opt-in Storage
HTTP test was not rerun because these changes affect SQL readiness/counting only.

### CodeRabbit submission profile guard — latest follow-up

Base commit `6c31773`; owner explicitly authorized editing the I02 migration in place.
`submit_provider` now requires provider_profiles after authorization/editable-state
checks and before credentials/state/version/audit mutations. Missing profile raises
SQLSTATE23514; the HTTP route returns sanitized private422 invalid_input.

SQL regression first reproduced unexpected successful submission with valid uploaded
licence evidence but no profile. It now verifies rejection leaves state/version/events/
submission audit unchanged, followed by success after update_provider creates the profile.
Added a unit test for the submission handler's private422 response. Independent narrow
review found no defect. Local DB updated with submit_provider definition only.

Actual verification: both SQL suites passed directly from disk and rolled back fixtures;
lint and typecheck exited0; npm test reported8 files passed/1 skipped and78 tests passed/
1 skipped; git diff --check exited0. The opt-in HTTP test was not rerun for this SQL guard.
Build was not requested or rerun for this follow-up. Changes remain uncommitted.

### CodeRabbit legacy-profile fix — latest state

Owner additionally authorized the queued missing-profile fix and edits to the two
obsolete expectations in `tests/rls/i01_identity.sql`. This supersedes the earlier
round-1 notes saying the unchanged I01 suite fails or is outside permitted scope.

`update_provider` now upserts provider_profiles after the existing actor, editable-state
and optimistic-version checks. Existing I01 provider skeletons receive a profile from
owner-submitted values on their first update; no invented display-name backfill.
Regression first reproduced `FAIL: legacy update creates missing profile`; now passes
for missing-profile creation, repeat update without duplication, unauthorized denial
and stale-version rejection without overwriting data. The local DB received the updated
function only. Independent narrow-diff review found no concrete issue.

Changed in this follow-up: I02 migration, i02_providers.sql, i01_identity.sql and this
handoff. The two I01 assertions now require patient-only roles for draft individual/org
providers. Both SQL suites run directly from their saved files, without substitutions.

Actual results:

    I01 SQL assertions passed; all synthetic fixtures rolled back.
    I02 SQL assertions passed; fixtures rolled back.
    npm run lint       exit 0, no diagnostics
    npm run typecheck  exit 0, Types generated successfully; tsc passed
    npm test           8 files passed / 1 skipped; 77 tests passed / 1 skipped
    npm run build     exit 0, Compiled successfully in 1510ms;
                      TypeScript finished; static generation 14/14 in 587ms
    git diff --check  exit 0

The skipped test is the opt-in local Storage HTTP test, previously run separately and
passed in round 1; it was not rerun for this SQL-only follow-up. Changes remain
uncommitted; no push/stash. Signed URL issuance remains safely disabled. M1 renewal
and M4 four-eyes remain owner decisions; the earlier remaining verification limits apply.

### Review fix round 1 — current state

Executed `codex_I02_fix1.md` after reading Kiro's `.claude-scratch-I02-review.md`.
All fixes remain uncommitted within the assigned I02 paths. The uncommitted migration
was edited in place as explicitly authorized; duplicate earlier draft definitions were
consolidated. The local DB received only the corresponding reviewed definition changes.

- H1: identity_roles provider branch now requires active + approved + publishable.
  SQL asserts draft/submitted/under_review/rejected/suspended/expired denial and valid approval.
- H2: reservation rejects expiry beyond five years; approval events snapshot sorted
  reviewed document IDs. This does not introduce reviewer-edited expiry or legal validation.
- H3: reproducible opt-in SDK HTTP test is `tests/unit/provider-storage-http.test.ts`.
  It uploads/downloads as a synthetic user JWT, calls createSignedUrl(86400),
  createSignedUrls(86400) and createSignedUploadUrl, and asserts all grants fail.
  Temporary policy instrumentation LOGs the actual operation GUC without changing
  authorization results. Observed real values: `storage.object.sign`,
  `storage.object.sign_many`, `storage.object.sign_upload_url`; all were denied.
  Batch denial may be HTTP 200 with per-item errors and no URLs; it grants no access.
  Policy/function instrumentation is restored and bytes/fixtures cleaned in finally.
  Run: `I02_STORAGE_HTTP=1 WSLENV=I02_STORAGE_HTTP npm test -- tests/unit/provider-storage-http.test.ts`
  (WSLENV is needed only for this environment's Windows npm wrapper.) Actual result: 1 passed.
  The normal unit run skips this explicitly local/Docker-dependent test.
- M3: readiness requires bytes for every pending document, including optional kinds;
  approval updates only uploaded pending documents and records their IDs.
- M5: authenticated table SELECT revoked on verification events; column grants expose
  public_reason and safe metadata, excluding actor_profile_id and internal reason.
  public_reason uses fixed provider-safe text. readProvider uses this projection.
- L1: target access checked before provider/org/member locks, including create_provider;
  post-lock checks retained. Active I01 organization creators need no invite timestamp;
  active managers still require acceptance. A fresh-org onboarding regression passes.
- L2: CHECK ties active operational status to approved verification.
- L3: UPDATE/DELETE and TRUNCATE triggers protect audit_events and verification events,
  including privileged normal SQL. Local HTTP fixture cleanup alone uses a scoped
  transaction with session_replication_role=replica for generated synthetic actor rows.
- M2: verifier document metadata/Storage reads restricted to submitted/under_review.
  Current owners and active scoped org admins retain their own document reads.
- L8: add_provider_document returns JSONB `{document,provider_version}`; route returns
  the authoritative RPC version. Regression used version17 for expectedVersion2.

Owner decisions deliberately NOT implemented: M1 credential renewal/reopening policy;
M4 whether review requires two distinct authorized people. No default invented.
Signed URLs remain safely disabled; short-lived signing acceptance remains unmet.

SQL results on local Supabase:

    tests/rls/i02_providers.sql: ROLLBACK; I02 SQL assertions passed
    tests/rls/i01_identity.sql unchanged: FAIL trusted individual doctor workspace
    I01 compatibility run (two role arrays adjusted in memory only):
      ROLLBACK; I01 SQL assertions passed; all synthetic fixtures rolled back.

Application gates after these fixes all exited 0:

    npm run lint       eslint; no diagnostics
    npm run typecheck  Types generated successfully; tsc --noEmit passed
    npm test           8 files passed / 1 skipped; 77 tests passed / 1 skipped
    npm run build     Compiled successfully in 2.0s; TypeScript finished;
                      static generation 14/14 in 949ms

The skipped test is the separately executed local Storage SDK HTTP test: 1 passed.
An initial typecheck caught an ES-target-incompatible regex in that test; replaced
it with string slicing before the final passing gates. New regression tests first
failed for RPC version calculation and draft role issuance, then passed after fixes.
Independent final review found no further defect in pre-lock checks or the I01
organization-owner acceptance handling.

I01's two obsolete expectations are at lines89 and99: inactive draft individual/org
providers used to receive category roles. They must now expect only patient. The
file is outside this task's allowed edits and remains untouched. Do not report the
unchanged I01 suite as passing. All other I01 assertions passed in the compatibility run.

Remaining verification limits: real Auth/MFA enrollment, remote/staging behavior,
malware/content scanning, end-to-end UI and broad concurrency/revocation races.
No service-role key added to application routes. No commit/push/stash or deployment.

The following earlier I02 evidence is historical; this round supersedes its event
column grants, role semantics, document response shape and test totals.

Task I02; agent Codex; human owner/integrator Owner/Claude.
Branch `task/I02-provider-onboarding`; base `84321ae26cc6708c56d69f8a542f254b7c6b49b7`.
Changes remain uncommitted; no push/merge/reset/stash. Dependencies: I01, canonical v0.1.
Status: IMPLEMENTED_UNVERIFIED overall; core application/SQL/Storage checks verified,
short-lived signing feature remains blocked and safely disabled (details below).
Task state is recorded here because the assigned exclusive scope excludes `.context/` and other docs.

Plan executed: extend provider lifecycle; add private profiles/documents/events; enforce
owner/scoped-org draft/rejected edits; implement versioned audited submission/review;
require scoped aal2 provider:verify; prevent self-review; gate publication on current
uploaded credentials and active owner/org; add metadata-bound immutable Storage;
add bearer APIs/strict validation; run adversarial SQL and application checks; review/handoff.

Files: `supabase/migrations/202611170002_i02_provider_onboarding.sql`,
`src/lib/providers/service.ts`, `src/lib/validation/providers.ts`,
`src/app/api/providers/**`, `src/app/api/admin/providers/**`,
`tests/unit/providers.test.ts`, `tests/unit/provider-http.test.ts`,
`tests/rls/i02_providers.sql`, and this section. No UI or shared contract edits.

Verification evidence:

Final required command chain exited 0 after security corrections:

    npm run lint          > eslint (no diagnostics)
    npm run typecheck     > next typegen && tsc --noEmit (exit 0)
    npm test              Test Files 8 passed (8); Tests 77 passed (77)
    npm run build         Compiled successfully; TypeScript finished;
                          Generating static pages (14/14) in 785ms

I02 and I01 SQL suites both pass with fixtures rolled back. Scoped whitespace check PASS.
No additional security blocker found in the independent final review; signing acceptance
remains unmet as explicitly recorded below. Integrator must review actual untracked
file contents as well as `git diff` (which alone excludes those new files).

    npm test -- tests/unit/providers.test.ts
    FAIL: Cannot find package '@/lib/validation/providers' (expected initial baseline)
    npm test -- tests/unit/provider-http.test.ts tests/unit/providers.test.ts
    Test Files 2 passed; Tests 19 passed
    npm run lint
    > eslint (no diagnostics, exit 0)
    npm run typecheck
    Types generated successfully (exit 0)
    npm test
    Test Files 8 passed; Tests 77 passed (exit 0)
    npm run build
    Compiled successfully in 4.8s; TypeScript finished in 6.6s
    Generating static pages 14/14 in 847ms (exit 0)
    docker exec -i supabase_db_surecurevisit psql -U postgres -v ON_ERROR_STOP=1 < tests/rls/i02_providers.sql
    ROLLBACK; I02 SQL assertions passed (including expanded resubmission/capability tests)

Locked dependencies installed with `npm ci --no-audit --no-fund` (400 packages; no
manifest/lockfile changes). The I02 migration was applied only to the authorized
local `supabase_db_surecurevisit` container. First attempt rolled back on a duplicate
policy declaration; corrected migration applied with COMMIT. No storage.* ALTER.
SQL fixtures are synthetic and rollback. No production/staging migration or deployment.

Security: all new tables use SELECT-only RLS; writes use narrow SECURITY DEFINER
commands with empty search_path. Server uses the I01 request client (user bearer JWT
and anon key). Org evidence requires active accepted owner/manager and exact scope;
admin evidence/review requires current scoped provider:verify plus aal2. Self-review
is denied for individual owners, any org affiliation and document uploaders. Review
locks capabilities; actor/org/member/provider locking follows I01 order. Transitions
increment provider version and append both verification events and audit events.
Objects use UUID paths, never user filenames, and permit no overwrite/delete. Bucket
is private, 10 MiB, PDF/JPEG/PNG only. Signed URL issuance remains disabled.

Proposed API/DB contract changes (shared API_CONTRACTS.md intentionally untouched):

| Method / route | Contract |
|---|---|
| POST `/api/providers` | category, displayName, optional description/organizationId; 201 providerId; owner derived in DB |
| GET `/api/providers/:id` | **Private onboarding** provider/profile/doc metadata/review history; not C01 public profile |
| PATCH `/api/providers/:id` | displayName, description, expectedVersion; draft/rejected only |
| POST `/api/providers/:id/documents` | kind, contentType, expiresAt, expectedVersion; 201 reserved document + upload bucket/maxBytes/upsert:false + providerVersion |
| POST `/api/providers/:id/documents/:documentId/signed-url` | authenticated empty-body command; 503 provider_signed_urls_unavailable pending reviewed signing design |
| POST `/api/providers/:id/submit` | expectedVersion; requires uploaded current category credential |
| POST `/api/admin/providers/:id/review` | decision, reason, expectedVersion; decision under_review/approved/rejected/suspended |

All routes require bearer auth and return private/no-store JSON with sanitized errors.
Upload file bytes through the ordinary Supabase Storage API using the same user JWT,
reserved document.object_name and contentType, with upsert:false; no signed upload
token bypass. Metadata reservation advances provider version by one. Provider detail
returns at most 50 docs and latest 100 review events. Broader list/pagination is deferred.
GET `/api/providers/:id` currently conflicts with the proposed future public catalog
route; integrator must move private reads to a dedicated onboarding route or reserve
a separate C01 public projection before connecting UI. No public directory added.

DB adds provider_profiles/provider_documents/provider_verification_events and six
public RPCs: create_provider, update_provider, add_provider_document, submit_provider,
review_provider, provider_is_publishable. Verification state is draft/submitted/
under_review/approved/rejected/suspended (I01 verified maps to approved; expired maps
to suspended); operational status remains active/inactive/suspended. Submitted or
suspended -> under_review -> approved/rejected; approved -> suspended. Rejected
providers replace rejected evidence and resubmit; suspended evidence is rechecked.
Minimum evidence kinds: doctor registration, lab licence, ambulance vehicle_permit,
caretaker background_check; all documents require finite future expiry at reservation.
This minimum is an engineering gate, not a complete legal/category verification checklist.
`provider_is_publishable(uuid)` is the only guest RPC, returns only boolean, and checks
approval/status, private profile, active owner/org, uploaded verified category evidence
and absence of expired verified credentials. It does **not** assert verified coverage,
price, availability or operational readiness: C01/B01 must add those gates.

Independent review (same session): found expired pending evidence could trap a draft.
Added a forward correction at the end of the migration (earlier applied definitions
preserved): replacement metadata supersedes same-kind pending evidence. New SQL
regression first failed, then passed after applying only the correction to the local DB.
Document status additionally permits `superseded`; those objects remain readable to
authorized readers but cannot receive uploads or satisfy credential eligibility.
Expanded SQL tests pass for future/expired/revoked/wrong-org admin capabilities,
organization self-review, rejection/correction/resubmission and disabled organizations.
I01 SQL regression also passed after I02: `I01 SQL assertions passed; all synthetic fixtures rolled back.`

Review P1 mitigated, REQUIREMENT STILL BLOCKED: an authorized user can call Supabase
Storage signing directly with arbitrary expiresIn; RLS cannot bound that HTTP parameter.
Safer default applied after asking for user preference: appended forward restrictive
policy denies single/batch/download-image/upload signing. The application route rechecks
metadata then returns 503 provider_signed_urls_unavailable. Ordinary authenticated
Storage upload/download remains available. No signed URLs are issued. Implementing
globally bounded short-lived URLs needs a separately reviewed signing design compatible
with the no-service-role-in-routes requirement. Do not mark all of I02 DONE_VERIFIED.

Actual local HTTP checks (Storage v1.96.0, gateway 58421): synthetic owner JWT upload
and authenticated download PASS; direct signing with expiresIn 86400 denied PASS;
batch signing denied PASS; signed-upload grant denied PASS. Credential values stayed
only in process memory. Uploaded bytes and committed synthetic DB fixtures were removed
in finally cleanup. Privileged local credentials were used solely for fixture-byte cleanup;
application routes still use only user JWT + anon key. SQL operation-aware denial tests
also pass. Real Auth/MFA enrollment and remote/staging behavior remain unverified.

Not verified: real Auth/MFA enrollment flows, cross-tenant Storage HTTP scenarios,
two-connection revocation/concurrency races, generated DB types, browser/E2E/staging.
Unit tests mock upstream boundaries; SQL tests use actual roles/JWT settings, not HTTP.
No public/clinical/emergency/payment activation. Final integration remains with Claude.

---

Task: I01. Implementer: Codex. Human owner/integrator: Owner/Claude.
Branch: `task/I01-auth-rls`; base: `d532f09b6f8d091a1843485f11ab3cd3ec3b549e` (`develop`).
Changes are uncommitted. No packages installed, migrations applied, or external accounts changed.
Status: IMPLEMENTED_UNVERIFIED; local application checks pass; DB execution remains blocked.
This file holds task state because I01's exclusive file scope excludes `.context/` and project docs.
## Current task and scope

Task: I01 follow-ups. Implementer: Codex. Human owner/integrator: Owner/Claude.
Branch: task/I01-auth-rls. Follow-up base: 84321ae26cc6708c56d69f8a542f254b7c6b49b7.
Changes are uncommitted. No commits, pushes, stashes, packages, frontend changes,
shared-contract edits, external accounts or source-database mutations.

The earlier I01 implementation and review fixes are in the base commit. This task
adds migration 202611170003_i01_followups.sql; migration 001 is unchanged.
Allowed paths: this new migration, organization API routes, shared libraries/tests.
The task explicitly excludes auth API route edits, so paginated invites are exposed
at /api/organizations/invitations. The existing /api/auth/invitations route remains
a bounded compatibility endpoint; its underlying RPC now filters expiry and caps
results at 50. It does not accept pagination query parameters.

Plan completed: failing pagination/SQL tests; scoped cursor RPCs/routes; invitation
expiry/cap; real local SQL and reciprocal-invitation concurrency tests; application
checks; changed-file review and this handoff. SQL tests cover DB-role simulation;
actual Auth/Storage HTTP and staging E2E still require separate verification.

## Pagination contract

All three paginated GET routes require a valid user bearer session and an active
profile. Query validation uses shared strict Zod schemas. limit defaults to 20,
accepts integers 1 through 50, and rejects values over 50, empty/noninteger values,
unknown fields and repeated query parameters. cursor is an optional UUID.

| Route | Result |
|---|---|
| GET /api/organizations?limit=&cursor= | organizations: id/name/version; nextCursor |
| GET /api/organizations/:id/members?limit=&cursor= | members: id/profile_id/membership_role/status/scopes/version/invite_expires_at; nextCursor |
| GET /api/organizations/invitations?limit=&cursor= | invitations: own organization_id/scopes/version/invite_expires_at; nextCursor |

Use nextCursor as the next request's cursor; null means exhausted. Organization and
member pages sort by UUID id; invite pages sort by organization_id. A page returns
at most limit rows; one extra authorized row is inspected internally to determine
continuation. This is live keyset pagination, not an immutable multi-request snapshot.

RPCs: list_organizations(integer,uuid),
list_organization_members(uuid,integer,uuid),
list_organization_invites_page(integer,uuid). SQL independently enforces 1..50.
The first two are SECURITY INVOKER and retain table RLS; own-invite discovery is a
narrow SECURITY DEFINER projection pinned to auth.uid(), active profile/org and
unexpired invited status. All three pin search_path and revoke PUBLIC/anon execute.
No count or row from a foreign organization is disclosed. Staff without members:read
continue to see only their own active membership. New contracts need integrator
review; docs/API_CONTRACTS.md intentionally remains untouched.

## Invitation lifecycle and cap

Migration 003 adds invite_expires_at and an organization/pending-expiry index.
New invitations expire after 14 days. Existing pending invitations are backfilled
from their last updated_at plus 14 days, so old invitations are not silently renewed.
Expiry is relevant only to invited status; other membership states do not expire
through this field. The temporary column default is dropped after backfill; only
invitation commands explicitly assign expiry. Active owners inserted by the existing
organization-creation command retain NULL expiry. Trusted invitation fixtures must
provide expiry after migration 003 (the baseline suite supports both schemas).

Acceptance locks the active organization and invitee membership and checks expiry
with clock_timestamp after locking. Starting a transaction before expiry cannot
revive an expired invite. Successful acceptance clears the pending expiry and records
acceptance, a version increment and audit. Discovery excludes expired invitations.

At most 25 unexpired pending invitations may exist per organization. The existing
organization row lock serializes slot checks and mutations across owners. An expired
invite frees capacity, but renewing it must reacquire a slot. Active/disabled members
do not consume slots. Disable/re-invite/expanded-scope/reactivation operations retain
version, grantor scope, self-promotion/owner and fresh-acceptance protections.
Promoting staff or billing to manager requires fresh acceptance even with unchanged
scopes: status becomes invited, accepted_at clears and a new expiry is assigned.
Manager is the higher privileged role; staff and billing are separate peer roles.

Renewal uses the existing owner membership command with status invited and the current
expectedVersion. It receives a fresh 14-day expiry and clears old acceptance. There
is no new unauthenticated invite token or self-supplied profile authority.

## Actual verification, 2026-11-17

Application commands executed through the existing Windows Node/npm entry point;
package scripts were unchanged. Actual tails:

    npm run lint: exit 0
    > eslint
    (no diagnostics)

    npm run typecheck: exit 0
    Generating route types...
    Types generated successfully

    npm test: exit 0
    Test Files  7 passed (7)
         Tests  77 passed (77)

    npm run build: exit 0
    Build exited 0; generated route table includes /api/organizations/invitations.

Test-first evidence: three list-route behavior tests failed before route changes;
the new SQL suite failed before migration 003 because its schema was absent.
After implementation, all pagination unit tests and application checks passed.

## Real local Supabase tests and isolation

Container verified: supabase_db_surecurevisit, published DB port 58422. The runner
creates a unique i01_followups_<random> database in that local container. It copies
schema only, never source data. Supabase managed infrastructure is restored with
original owners using local supabase_admin; all application migrations and tests
run as postgres, matching the real migration role. Synthetic fixtures use only
example.invalid contacts and no clinical/patient records.

Commands:

    python3 tests/rls/test_i01_runner.py
    python3 tests/rls/run_i01_followups.py --red
    python3 tests/rls/run_i01_followups.py
    python3 tests/rls/run_i01_followups.py --current-schema

The default rebuilds only scratch application schemas from this branch's migration
001, preserving Supabase Auth/Storage infrastructure. The current-schema mode tests
a clone of the actually running schema, including concurrent I02 changes. The runner
never resets or applies anything to the source postgres database. It removes only
the unique validated scratch database created by that run, including on failure.

Observed output, default mode (exit 0):

    PASS: existing I01 SQL authorization suite before migration 003
    PASS: migration 003 applied on isolated database
    PASS: existing I01 SQL authorization suite after migration 003
    PASS: follow-up pagination/expiry/cap/ACL SQL suite
    PASS: reciprocal invitations commit on two overlapping connections, no deadlock
    PASS: two owners race for final invite slot; one success, one 23514; exactly 25 pending
    PASS: disposable test database removed; source DB unchanged

Current-schema mode (exit 0): migration 003, follow-up SQL suite and reciprocal
invitations and final-slot race all passed; scratch database removed. The source database already
contains I02 provider-role changes, so the old I01-only provider-workspace assertions
are run only against the branch baseline. They are not silently weakened.

The reciprocal test holds connection A open after it invites B, waits until A reaches
its sleep barrier, then has B invite A into a separate organization. B must finish
while A still holds profile/FK locks; both transactions must commit with exactly two
unaccepted invitations. This exercises FOR NO KEY UPDATE versus FK KEY SHARE locks.

The SQL suite verifies all page boundaries and max limits; distinct/no-skip traversal;
foreign/anonymous/staff isolation; 14-day defaults; expired acceptance/discovery;
renewal and version behavior; the 25/26 pending boundary; expired-slot reuse;
renewal rejection at capacity; wall-clock expiry in old transactions; RPC ACLs and
search_path. The original I01 suite verifies cross-patient/org denial, escalation,
revocation/MFA, base-table DML denial and restrictive Storage policies.

## Remaining limits and risks

- Migration 003 was applied only to disposable local databases. No shared staging or
  production migration, release, deployment or source migration-history update.
- Actual Auth/Storage/PostgREST HTTP integration, token refresh/logout, email/MFA
  settings, signed URLs and staging E2E are not established by SQL-role simulation
  or mocked unit tests. Storage DDL/RLS passed in local SQL; Storage HTTP remains open.
- SQL cap boundary/serialization and reciprocal invitation overlap are tested;
  the two-owner final-slot race passed in both schema modes. No load/soak test is claimed.
- The historical provider category role means workspace access in the I01 baseline;
  I02/current schema may impose stronger checks. Bookability always needs independent
  current verification, credential, coverage and assignment authorization.
- Client legal/privacy/payment/clinical/emergency gates remain unchanged. Synthetic
  staging only; no real patient data, live payments or emergency activation.

## I01f review fixes and verification

Addressed M1, L1, L4 and L5 in the uncommitted follow-up work. Migration 001 remains
unchanged. No commit, push or stash. Promotion regression failed against the old 003
with FAIL: staff to manager requires fresh acceptance, then passed after the fix.
The SQL suite also asserts that the expiry column has no default and active fixture
owners have NULL expiry. Python guard tests first failed because the guard was absent;
all five test methods now pass, including remote host/context/endpoint/database denial.

The runner checks DOCKER_HOST, DOCKER_CONTEXT, the selected context name and its
actual endpoint before inspecting or dumping any container. It allows only default
or desktop-linux contexts and Unix socket/named-pipe endpoints, rejects TCP/SSH even
on loopback, then verifies PostgreSQL uses a Unix socket or loopback address before
creating any database. It never prints environment endpoint values. Guard tests mock
all Docker/SQL calls and assert early rejection before database access.

The final-slot test seeds 24 pending invitations and two distinct active owners.
Connection A allocates slot 25 and stays open at a sleep barrier. Connection B must
be observed waiting on a lock before A commits. Exactly one transaction succeeds;
the other must fail with SQLSTATE 23514 and invitation_limit. The committed database
must have exactly 25 pending invitations and exactly one of the two target members.
Both default and current-schema runs passed, including reciprocal invitations and
cleanup. Fresh application verification: lint 0, typecheck 0, Vitest 7 files/77 tests
passed, production build 0. Guard suite: 5 methods passed.

L2 (document only): the 50-row limit bounds these API/RPC responses; it is not an
authorization or global resource-consumption limit. Authenticated clients may query
base tables directly through PostgREST within existing RLS permissions. Operational
PostgREST max_rows configuration remains an owner/integrator decision, not implemented.

## Verification update (2026-11-17, local Supabase on Docker)
- `supabase start` applies `202611170001_i01_identity.sql` cleanly (project id `surecurevisit`, ports 584xx so it does not collide with other local stacks).
- First attempt FAILED: `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` raised `must be owner of table objects` (Kiro F3, CodeRabbit major). Fixed by removing both ALTER statements; Supabase already enables RLS on those tables. The restrictive deny-all policies remain and apply.
- `tests/rls/i01_identity.sql` run with `psql -v ON_ERROR_STOP=1` against the local DB: all assertions passed, fixtures rolled back.
- Command: `docker exec -i supabase_db_surecurevisit psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/rls/i01_identity.sql`
- Still NOT done: reciprocal-invite two-connection concurrency test, Auth/Storage HTTP tests, list pagination, invite expiry/cap.

---

## C01 engineering handoff — 17 November 2026

TASK ID: C01. AGENT: Codex. Human owner: Owner; integrator: Claude.
BRANCH: `task/C01-catalog`. BASE COMMIT: `6c31773519cb470624cecc0b236f11a11aa7cfc0`.
COMMIT(S): none; changes remain uncommitted as instructed. C01 implementation and
its checks pass; final I02 regression fails against changed shared DB behavior.
Integration/contract approval and staging remain pending.
The master task ledger is intentionally untouched under C01's exclusive file scope;
Claude should transfer this evidence into its ledger when integrating.

Implemented private catalog types, PIN reference directory, services, immutable
price history, coverage proposals/reviews, scoped management RPCs and public discovery.
Every new table has RLS and no direct client writes. Public reads require I02's
live `provider_is_publishable` predicate, a published service/current price and an
exact approved, unexpired PIN area. The directory returns service offers, so one
provider can appear more than once. Order is amount, provider ID, service ID;
the last ID resolves ties between equally priced services. Availability remains
unknown (`advisory_availability: null`); C01 does not certify a booking slot.

FILES CHANGED: this README, `.context/activeContext.md`,
`supabase/migrations/202611170004_c01_catalog.sql`, `src/lib/catalog/**`,
`src/lib/validation/catalog.ts`, `src/app/api/catalog/**`,
`src/app/api/provider/services/**`, `src/app/api/provider/coverage/**`,
`tests/unit/catalog*.test.ts`, and `tests/rls/c01_catalog.sql`.
No UI, I01/I02 source, shared API document, payment or clinical feature changes.

### Proposed API/DB contract additions — integrator review required

`docs/API_CONTRACTS.md` was not edited. Existing I02 private provider routes remain
in place. C01 uses the following separate namespace to avoid that route conflict.
All responses are `private, no-store`; protected routes require a user bearer JWT.
Validation failures return 422; authorization 401/403; stale versions 409; hidden
and missing public providers return the identical 404 body. Upstream details are
not returned. Creation routes require a UUID `Idempotency-Key` header.

| Route | Proposed request/result |
|---|---|
| GET `/api/catalog` | Required `category`, exact `pin`; optional `priceMax` paise string, `limit` 1–50 (default 20), `cursor`; returns `{results,nextCursor}` |
| GET `/api/catalog/:id` | Required `category`, `pin`; returns up to 50 eligible service offers or 404 |
| GET `/api/provider/services` | Required `providerId`; authorized private services/price history/coverage, first 100 services and 100 areas, and current provider version |
| POST `/api/provider/services` | `providerId,catalogTypeId,title,description,durationMinutes,status:draft,expectedVersion:0`; creates/replays a draft service |
| PATCH `/api/provider/services/:id` | Same service fields and positive `expectedVersion`; catalog type immutable; publishing requires a current price |
| POST `/api/provider/services/:id/prices` | `amountPaise` decimal string, `termsVersion`, service `expectedVersion`; returns `priceVersionId` and advances service version |
| POST `/api/provider/coverage` | `providerId,pin,expectedVersion` (provider); proposes only, advances provider version |
| POST `/api/provider/coverage/:id/withdraw` | Area `expectedVersion`; individual owner or active organization owner with manage scope only |
| GET `/api/catalog/admin/coverage` | MFA coverage reviewer; bounded `limit` and UUID `cursor`; scoped queue with limited provider summary |
| POST `/api/catalog/admin/coverage/:id/review` | `decision` approved/rejected/revoked, `reason`, area `expectedVersion`; approval also requires future finite `validUntil` |

Public row allowlist: provider ID, category, public display name, service ID/title,
duration, amount as a decimal string, INR, unit, terms version, matched PIN, city,
nullable advisory availability. No owner/org IDs, contacts, addresses, documents,
reviewer identity/notes, storage paths or internal workflow versions are public.
The HTTP layer also strips unexpected upstream public fields. Cursor format is
`amount_paise,provider_uuid,service_uuid`; it conveys only public sort keys and
is validated, never used as authority. It represents continuation, not a snapshot:
offers can change between pages. A full final page can yield an empty next page.

DB public RPC additions: `search_providers`, `get_public_provider`,
`upsert_service`, `publish_price_version`, `propose_service_area`,
`withdraw_service_area`, `review_service_area`, `list_service_area_reviews`.
Guest execution is granted only to the two public discovery RPCs. All definer
functions pin an empty search path. Creates recheck authorization before replay;
actor/provider/service locks and expected versions serialize price mutations.
The DB excludes overlapping price ranges and prohibits historical price changes
except a single closing timestamp. Coverage approval requires `coverage:verify`,
`aal2`, current capability scope/lifetime and an independent reviewer; owners,
proposers and all members of the owning organization cannot self-review.

### Migration and actual verification evidence

Applied the new migration manually to LOCAL `supabase_db_surecurevisit` only,
using `docker exec -i ... psql -U postgres -v ON_ERROR_STOP=1 < file`.
I01/I02 were already present. Manual psql application does not record a Supabase
migration-history entry; the integrator must reconcile local history before
using migration-up tooling. No staging or production migration ran.

Earlier locally applied definitions are preserved; forward corrective definitions
are appended in the same assigned migration file. Regressions first reproduced
fresh-price timestamp visibility, queue column ambiguity, missing-MFA-claim
authorization and manager withdrawal; corrected final definitions pass. Evaluate
the last definition when reviewing repeated functions. The complete file also
applied successfully from scratch on a disposable schema-only I02 clone, preserving
original function owners. Its complete C01 SQL suite passed afterward.

Independent read-only security review found the missing-`aal` SQL NULL issue.
The new denial test first failed, then passed after `IS NOT DISTINCT FROM 'aal2'`.
No unresolved important finding from that review remains. No service-role fallback,
Storage-policy change or real patient/provider data was introduced.

Actual commands/results (final check totals recorded below):

```text
npm run lint       -> exit 0; eslint, no diagnostics
npm run typecheck  -> exit 0; Types generated successfully
npm test           -> 10 files passed, 1 skipped; 109 tests passed, 1 skipped
npm run build      -> exit 0; production compile/typecheck/static generation passed
tests/rls/i01_identity.sql -> I01 SQL assertions passed; fixtures rolled back
tests/rls/i02_providers.sql -> initially passed; FINAL RERUN FAILED (see below)
tests/rls/c01_catalog.sql -> C01 SQL assertions passed; fixtures rolled back
```

SQL assertions include public function/column allowlists, base grants/RLS, PIN
abuse, price precision/immutability/overlap, provider and credential visibility,
UTC expiry boundaries, coverage states, scoped/expired/revoked/future admin
capabilities, MFA including absent claim, cross-tenant denial, organization
membership/scope/invitation/disablement, self-review and owner-only withdrawal.
The one skipped unit test is the inherited opt-in Storage HTTP test.

Final I02 rerun failed with `pending optional metadata without bytes blocks
submission, unexpectedly succeeded`. Inspection found the local DB's
`providers_private.credentials_ready` now excludes pending reservations without
uploaded objects, unlike the I02 migration/tests in this branch. That helper
is also present in the isolated schema snapshot. C01 neither defines nor changes
it. I01 and C01 still pass on the final shared DB. I02's author/integrator must
reconcile this changed dependency behavior and its tests before integration;
the earlier I02 pass must not be used to claim the final full SQL run is green.

A separate actual two-connection test ran in the disposable database: after an
initial price, both sessions attempted an update with service version 2. The first
held its transaction open after publication, the second waited and then received
`40001`; result was two historical versions, exactly one open window, service
version 3. This checks a price-update race, not every revocation/locking race.
The disposable database and its committed synthetic concurrency fixtures were
removed afterward. Standard SQL suites roll back their fixtures.

### Limits and next work

No PINs, catalog types, coverage or provider listings are seeded. An approved
reference-data import and human coverage review are prerequisites to any results.
Commercial price ceiling and per-provider PIN cap remain owner decisions; only
the PostgreSQL bigint technical price bound is enforced. Do not describe those
commercial abuse controls as implemented. Provider read lists are bounded but
nested price history has no pagination; public detail caps offers at 50. Nationwide
browsing without PIN, lab baskets, radius fallback, scheduling, edge rate limits
and provider-facing detailed coverage rejection reasons remain deferred.

Not verified: live Auth/MFA enrollment, C01 HTTP requests through the Supabase/Next
gateway (unit HTTP tests mock boundaries), generated DB types, browser/E2E/staging,
all two-session revocation/disablement races, query plans at production scale.
No production-readiness or bookable-capacity claim is made.

Next: reconcile the I02 dependency/test mismatch, then Claude reviews/integrates
C01 and updates shared contracts/ledger; obtain
approved PIN/service references and operational/commercial decisions; implement
B01 server-derived price snapshots and booking/resource eligibility. Frontend
handover can use the proposed routes and shared validation after contract review;
all UI screens remain outside C01.
L3 (document only): the 25-pending cap is per organization, not per invitee. A caller
controlling five organizations could direct up to 125 pending invitations at one
profile. There is no per-invitee cap, decline/block control or platform-wide rate
limit in this change. Those anti-harassment/product decisions remain open for the
owner; this task adds no cross-organization recipient quota.
# B01 execution plan (2026-11-17)

Task B01, Codex, branch `task/B01-booking`, base
`802a8bdc64414c5f57c88002f2ed069f2c8ba59b`. Dependencies: I01/I02/C01,
canonical schema v0.1 and the supplied Kiro B01 design. Exclusive scope: migration
005, booking libraries/validation/API routes, booking tests and this handoff.
No commits, shared contracts, UI or context-file edits are authorized by this task.

Implementation sequence: (1) failing boundary/SQL tests, (2) migration with private
snapshots, state machine, RLS and scoped resource scheduling RPCs, (3) HTTP adapters,
(4) isolated migration/SQL and two-session races, (5) lint/typecheck/unit/build and
changed-file security review. Acceptance requires authoritative price/coverage,
fresh patient/provider/assignment authorization, atomic reservations, immutable
events, stale-version rejection and privacy-preserving queue projections. Expiry,
rescheduling and post-accept cancellation require explicit published policy; no
fees, deadline or clinical activation will be invented. P01 owns payment tables.


# B01 handoff (2026-11-17, Kiro completing interrupted Codex work)

Delivered: migration `202611170005_b01_booking.sql`, `src/lib/booking/service.ts`,
`src/lib/validation/booking.ts`, routes under `src/app/api/{bookings,availability,patient/addresses,provider/booking}`,
`tests/unit/booking.test.ts`, `tests/rls/b01_booking.sql`, `tests/rls/run_b01_concurrency.py`.

Run: `python tests/rls/run_b01_concurrency.py` (scratch DB cloned from local Supabase, migrations 001-005 replayed, then
the I01/I01-followup/I02/C01/B01 SQL suites and real two-connection races; scratch DB dropped, source DB untouched).

Design notes: client-facing assigned check is `booking_private.assigned()`; `identity_private.is_assigned()` stays
revoked from `authenticated` (existing ACL suite forbids it). Routes carry no actor, price, status or paid field.
Reschedule, expiry, post-accept cancellation and fees stay disabled until a published `booking_policy_versions` row exists
(reschedule always returns 55000 `reschedule_policy_required`).

Proposed contract changes (docs/API_CONTRACTS.md not edited): POST/GET `/api/bookings`; GET `/api/bookings/:id`;
POST `/api/bookings/:id/{accept,decline,cancel,reschedule,en-route,arrive,start,complete}`; GET `/api/availability`;
POST `/api/patient/addresses`; POST `/api/provider/booking/{resources,availability,blackouts}`. Create/reschedule need
`Idempotency-Key`. Not done: `get_provider_queue` has no route (list_bookings with providerId serves it), P01 payments,
`expire_requested_bookings` worker, UI.

Known gaps: `tests/rls/c01_catalog.sql` fails on I01-003 `invited_membership_expiry` (pre-existing, runner reports it);
`tests/unit/catalog-http.test.ts` imports C01 routes absent from this branch (typecheck/vitest fail, pre-existing).
No HTTP-level route tests against a live DB; no reassignment/ex-doctor, suspended-provider or revoked-membership SQL cases yet.

