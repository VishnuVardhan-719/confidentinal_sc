# I01 identity and follow-up verification handoff

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

L3 (document only): the 25-pending cap is per organization, not per invitee. A caller
controlling five organizations could direct up to 125 pending invitations at one
profile. There is no per-invitee cap, decline/block control or platform-wide rate
limit in this change. Those anti-harassment/product decisions remain open for the
owner; this task adds no cross-organization recipient quota.
