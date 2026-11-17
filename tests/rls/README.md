# I01 identity test and review handoff

## I02 provider onboarding handoff — 2026-11-17

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

## Scope and implementation plan

Dependencies: F01, S00 owner-approved Q01–Q12 defaults in `docs/DECISIONS.md`.
Contract: canonical schema v0.1; I01 additions below need integrator contract review.
Allowed: migrations, auth/db/identity validation, I01 API routes, auth/RLS tests.
No pages, layouts, components, CI, environment or shared docs changed.

- [x] Read required rules, schema and API/security contracts; inspect actual Git state.
- [x] Write failing identity tests, then shared validation and request/session services.
- [x] Add numbered transactional migration with identity, self-patient access, org membership and capability RLS.
- [x] Add narrow versioned/audited commands, DB-derived workspace roles and bearer API handlers.
- [x] Write SQL negative integration tests and run Vitest.
- [x] Independent source security review; fix older-password login and revoked patient replay.
- [x] Run lint/typecheck/test/build and record real evidence.
- [ ] Apply migration and execute SQL tests on a disposable local Supabase DB.
- [ ] Auth/Storage HTTP integration, generated DB types and staging E2E.
- [x] Resume and rerun production build; the prior font-fetch failure did not recur.

## Actual verification, resumed 2026-11-17

Verified branch/base: task/I01-auth-rls / d532f09b6f8d091a1843485f11ab3cd3ec3b549e.
Preserved the interrupted implementation, then applied the scoped Kiro review fixes below; no packages installed.
The shell exposes WSL paths while the worktree/dependencies use Windows paths. Used
Windows git.exe and Windows Node to invoke npm's existing JavaScript entry point
(C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js), executing the unchanged
package scripts for the required npm commands.

Actual output tails:

    npm run lint
    > eslint
    (no diagnostics)

    npm run typecheck
    Generating route types...
    ✓ Types generated successfully

    npm test
    Test Files  6 passed (6)
         Tests  58 passed (58)

    npm run build
    ✓ Compiled successfully in 2.2s
      Finished TypeScript in 4.9s ...
    ✓ Generating static pages using 11 workers (13/13) in 641ms
      Finalizing page optimization ...

All four application checks passed. The previous Google font download failure did
not recur; no frontend files were changed. Changed-file review covered the auth
routes, strict validation, user-token client, migration and SQL authorization suite.
Diff whitespace checks and a separate check of scoped untracked files passed.
SQL/RLS/migration tests: PASSED later on local Supabase (see "Verification update" at the end); originally NOT RUN, Docker was down;
no DB or external account was touched. Unit tests use boundary mocks for Supabase;
they do not prove live RLS/Auth behavior. Integration/release still requires actual
migration execution, SQL assertions and Auth/Storage HTTP tests.

## DB verification procedure

1. Start a disposable LOCAL Supabase database, verify target and apply migrations in order.
2. Run `psql "$LOCAL_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/rls/i01_identity.sql`.
3. Expect no assertion failures, transaction rollback, and `I01 SQL assertions passed` at the end.
4. The script uses only `example.invalid` identities and synthetic records, actual DB roles,
   JWT subjects, table/RPC/Storage assertions; it rolls back every fixture.
5. Add Auth/Storage HTTP tests before staging approval; SQL role simulation cannot prove HTTP gateway behavior.

## Proposed I01 API additions (shared API doc intentionally untouched)

All responses: private/no-store, structured `{error:{code}}`. Protected routes require
`Authorization: Bearer <user-access-token>`. No cookie authentication or service-role key.
Clients must manage returned sessions securely; this task does not choose browser token persistence.

| Method / route | Input / result |
|---|---|
| POST `/api/auth/signup` | email/password (12–128 characters); generic 202 `signup_received` |
| POST `/api/auth/login` | email/nonempty existing password; accessToken/refreshToken/expiresAt |
| POST `/api/auth/refresh` | refreshToken; rotated token response after active-account check |
| POST `/api/auth/logout` | bearer; revoke current refresh session; discard client tokens |
| GET `/api/auth/me` | own safe profile plus DB-derived workspace roles |
| PATCH `/api/auth/profile` | displayName, locale en/te/hi, expectedVersion |
| POST `/api/auth/patient` | policyVersion, consent:true; self patient ID, idempotent while authorized |
| GET/POST `/api/organizations` | scoped first 100 orgs / name + UUID Idempotency-Key header; org ID |
| PATCH `/api/organizations/:id` | name, expectedVersion; scoped owner/manager only |
| GET/POST `/api/organizations/:id/members` | scoped first 100 members / profileId, membershipRole, status, scopes, expectedVersion |

Membership creation uses expectedVersion 0 and requires status invited; edits require
current positive version. New members never activate until the invitee calls
POST /api/organizations/:id/members/accept with expectedVersion. The RPC derives
the invitee from auth.uid(), validates account/org/invitation and records accepted_at,
a version increment and an audit event. Owner updates cannot activate unaccepted
invitations, including invitations disabled before acceptance. Existing active memberships remain editable. Scope expansion, explicit re-invitation
and disabled-member reactivation clear acceptance; active requests that expand scopes
or reactivate a previously accepted disabled member become invitations. GET /api/auth/invitations returns only the caller's invited organization_id, scopes and version through a narrow RPC. It exposes no
organization details or other membership rows. Invitation delivery remains deferred.
Only active owners can mutate other non-owner memberships; no self promotion, owner transfer or last-owner removal.
Scopes cannot exceed grantor's current scopes. Invitations alone confer no authority.
Pagination beyond the bounded first 100 rows is a later contract addition.

## Migration notes and security boundaries

Migration: `202611170001_i01_identity.sql`, not applied. Tables: profiles, patients,
patient_access, organizations, organization_members, admin_capabilities, providers,
consent_events, audit_events, idempotency_requests. Every table has RLS and no direct client writes.
Privileged functions pin search_path and actor identity; internal helpers do not export rows.
Auth trigger ignores raw user role/status metadata; existing auth users receive safe profile defaults.
Patient identity and access consent are separate from the later questionnaire; no booking eligibility is asserted.
Provider table is an ownership/category skeleton for I02, with no public listing or bookability.
Workspace roles indicate navigation/onboarding access, not verification or clinical authority.
Provider/admin grants and owner transfer require a separately reviewed trusted process; no client bootstrap endpoint.
Admin workspace needs a current global provider:verify, coverage:verify or membership:admin capability plus aal2; it never bypasses patient/org RLS.
Revocation is checked on every new command/read, including idempotent replay.
Account/org/membership mutations serialize on actor/org rows; future trusted revocation paths must follow that locking order.
Storage objects AND buckets have restrictive deny-all policies for anon/authenticated.
I02 must replace them only alongside metadata ownership checks, private buckets and signed URL authorization.
Signup delivery, email confirmation, MFA enrollment/recovery, password recovery and durable edge abuse controls
remain client-owned Auth/integration configuration; Supabase auth 429 is propagated.
Logout invalidates the current refresh session, but existing access JWTs remain valid until expiry.
No generated DB schema types are claimed: generate from the migrated DB once available.
The SQL suite is required before integration/release; source review and Vitest cannot establish DB correctness.
Forward corrective migrations only after application; no destructive rollback was attempted.


## Follow-up review fixes and open risks

F1: identity_roles requires global scope and an operational admin capability;
security:audit and org-scoped capabilities never yield global admin. Every sensitive
admin action must still authorize its specific capability and scope independently.
F2: invited-only creation and invitee-only acceptance, version checks, accepted_at,
audit and account/org/member locks; no owner activation of unaccepted invitations.
F5: create_organization caps each actor at five historical successful creations,
using immutable audit events under the existing actor lock. Disabled organizations
count; exact idempotent retries are resolved before the cap, without creating rows.
F13: SQL assertions cover aal1; future/expired/revoked capabilities; org scope and
audit-only exclusion; disabled profiles/orgs; anonymous table reads/RPC privileges;
private helper denial; empty definer search_path and PUBLIC/anon EXECUTE revokes;
Storage denial and absence of any public bucket. SQL suite PASSED on local Supabase (see end).
The invitation validation tests first failed (2 failures), then passed after the fix.
Final verification: lint and typecheck passed; Vitest 6 files / 46 tests passed;
Next.js production compilation and generation of all 12 static pages passed.

- F3 FIXED (verified on local Supabase; see end). Was: Storage RLS/DDL ownership must be verified on a disposable real Supabase
  target, including storage.objects/buckets ALTER and policy creation as the actual
  migration role. A managed-table permission failure may abort this transaction.
  Public buckets bypass object-read RLS via public URLs; test absence using a trusted
  DB role and verify actual Storage HTTP behavior before integration.
- F4: provider category roles grant workspace/onboarding navigation only. Draft,
  inactive, rejected or expired providers are never made bookable by identity_roles.
  I02/catalog/booking must independently enforce active verification, credential
  validity, coverage, assignment and active ownership/membership for each operation.
- Supabase email confirmation, upstream abuse controls, actual user-JWT getUser and
  logout behavior still need real Auth/Storage integration verification. No account
  settings, packages, shared contracts, frontend files or external systems changed.


## Round 2 fixes and deferred checks

- N1: list_organization_invites and GET /api/auth/invitations provide own pending
  invitation metadata only (organization_id, scopes, version), require an active
  account and organization, and derive the invitee exclusively from auth.uid().
  Base-table org/member policies remain unchanged. SQL checks cover own invite,
  other-invite denial, no org/base-member leakage and removal after acceptance.
- N2: larger scopes, explicit re-invitation and disabled-member reactivation clear
  accepted_at. Scope expansion/reactivation requesting active is converted to
  invited; direct activation of an unaccepted invitation remains forbidden.
  SQL checks cover fresh scope acceptance, reactivation, and stale-consent bypass.
- Actor profile locking uses FOR NO KEY UPDATE so reciprocal invitations can obtain
  FK KEY SHARE locks. The two-connection regression procedure is recorded at the
  end of i01_identity.sql: still NOT RUN (needs a two-connection harness).
- Auth retryable/network/5xx failures return 503 identity_unavailable; known invalid
  sessions remain 401, and upstream throttling remains 429. Login/refresh/signup
  use the same returned-error classification; error details remain private.
  The new Auth tests first reproduced six failures before the fix.
- DEFERRED: organization and membership list pagination; existing lists return at
  most 100 rows. No pagination contract was added in this task.
- N3 DEFERRED: invitation expiry and a per-organization invitation cap. Pending
  invitations currently have no expiry; do not claim these abuse controls exist.
- F3 FIXED, still needs Storage HTTP test: actual Supabase Storage DDL ownership/RLS/public-URL behavior still needs
  verification on the intended disposable local target. No database migration,
  SQL/RLS suite or concurrency test was executed here.


Round 2 final verification (2026-11-17): npm run lint exit 0 (no diagnostics);
npm run typecheck exit 0 (Types generated successfully); npm test exit 0
(Test Files 6 passed, Tests 58 passed); npm run build exit 0 (Compiled successfully
in 2.2s; Generating static pages 13/13 in 641ms). Commands ran the unchanged package
scripts through Windows Node/npm. Scoped whitespace validation passed.
Changes remain uncommitted on task/I01-auth-rls. No SQL execution or migration applied.

## Verification update (2026-11-17, local Supabase on Docker)
- `supabase start` applies `202611170001_i01_identity.sql` cleanly (project id `surecurevisit`, ports 584xx so it does not collide with other local stacks).
- First attempt FAILED: `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` raised `must be owner of table objects` (Kiro F3, CodeRabbit major). Fixed by removing both ALTER statements; Supabase already enables RLS on those tables. The restrictive deny-all policies remain and apply.
- `tests/rls/i01_identity.sql` run with `psql -v ON_ERROR_STOP=1` against the local DB: all assertions passed, fixtures rolled back.
- Command: `docker exec -i supabase_db_surecurevisit psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/rls/i01_identity.sql`
- Still NOT done: reciprocal-invite two-connection concurrency test, Auth/Storage HTTP tests, list pagination, invite expiry/cap.
