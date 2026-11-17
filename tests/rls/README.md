# I01 identity test and review handoff

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
SQL/RLS/migration tests: **NOT RUN**, Docker Desktop unavailable as stated in task;
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
Storage denial and absence of any public bucket. SQL remains NOT RUN.
The invitation validation tests first failed (2 failures), then passed after the fix.
Final verification: lint and typecheck passed; Vitest 6 files / 46 tests passed;
Next.js production compilation and generation of all 12 static pages passed.

- F3 OPEN: Storage RLS/DDL ownership must be verified on a disposable real Supabase
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
  end of i01_identity.sql: **NOT RUN** without the local database.
- Auth retryable/network/5xx failures return 503 identity_unavailable; known invalid
  sessions remain 401, and upstream throttling remains 429. Login/refresh/signup
  use the same returned-error classification; error details remain private.
  The new Auth tests first reproduced six failures before the fix.
- DEFERRED: organization and membership list pagination; existing lists return at
  most 100 rows. No pagination contract was added in this task.
- N3 DEFERRED: invitation expiry and a per-organization invitation cap. Pending
  invitations currently have no expiry; do not claim these abuse controls exist.
- F3 OPEN: actual Supabase Storage DDL ownership/RLS/public-URL behavior still needs
  verification on the intended disposable local target. No database migration,
  SQL/RLS suite or concurrency test was executed here.


Round 2 final verification (2026-11-17): npm run lint exit 0 (no diagnostics);
npm run typecheck exit 0 (Types generated successfully); npm test exit 0
(Test Files 6 passed, Tests 58 passed); npm run build exit 0 (Compiled successfully
in 2.2s; Generating static pages 13/13 in 641ms). Commands ran the unchanged package
scripts through Windows Node/npm. Scoped whitespace validation passed.
Changes remain uncommitted on task/I01-auth-rls. No SQL execution or migration applied.
