# Backend status handoff (I01, I02, C01, B01)

Written 2026-11-17 by the frontend side for whoever owns the backend. This is the only file on this branch. It changes nothing else in the repo. Nothing here is merged into `develop` or `main`.

## What exists on GitHub

| Item | Branch | PR | Base | State |
|---|---|---|---|---|
| I01 identity, roles, orgs, RLS | `task/I01-auth-rls` | #1 | `develop` | open, unmerged |
| I02 provider onboarding, private docs, admin review | `task/I02-provider-onboarding` | #2 | I01 branch | open, unmerged |
| C01 catalog, prices, PIN coverage | `task/C01-catalog` | #3 | I02 branch | open, unmerged |
| B01 booking requests and availability | `task/B01-booking` | #4 | C01 branch | open, unmerged |
| Q01a one-command RLS runner (WIP, unverified) | `wip/Q01a-rls-runner` | none | C01 branch | branch only |
| B01 fix round 1 (WIP, unverified, interrupted) | `wip/B01-fix-round1` | none | B01 branch | branch only |

PRs are stacked. Merge in order: I01, I02, C01, B01. Retarget each PR to `develop` after its parent merges. Migrations are numbered 001 (base), 002 (I02), 003 (I01 follow-ups), 004 (C01), 005 (B01). Migrations were edited in place during review, so reset the local DB before applying (`npx supabase db reset --local`); nothing shared had applied the earlier versions.

## Done (verified locally with real exit codes)

- I01, I02, C01: lint, typecheck, build pass. SQL suites pass on a reset local Supabase: `i01_identity`, `i01_followups`, `i02_providers`, `c01_catalog`.
- B01 (committed version, PR #4): lint 0, typecheck 0, build 0, unit 148 passed / 1 skipped, SQL suite `b01_booking` passes, two-connection concurrency runner `tests/rls/run_b01_concurrency.py` passes (overlapping accepts, adjacent accepts, cancel/accept race, double cancel).
- Reviews done: Kiro (adversarial) and CodeRabbit on I01 and I02, findings fixed. CodeRabbit finding on C01 fixed (revoked areas filtered before history limit).

Run SQL suites with: `docker exec -i supabase_db_surecurevisit psql -U postgres -v ON_ERROR_STOP=1 < tests/rls/<suite>.sql`. Local project id `surecurevisit`, DB port 58422. Do not touch any other local Supabase project.

## Left to do

### B01 (Kiro review findings, not fixed on PR #4)
- **H1** `identity_private.is_assigned` time check is a no-op (`a.period @> clock_timestamp() is not null` is always true). The assigned doctor sees patient address/phone early and `advance_visit` has no time guard. Proposed window: 60 min before start to 12 h after end; require now >= start - 60 min to start the visit.
- **H2** No cancel path when no cancellation policy exists (raises `cancellation_policy_required`). Proposed: allow zero-fee cancel by patient before start and by assigned/scheduler provider; add `mark_no_show` (after start + 30 min) and optionally `reassign_booking`.
- **H3** Only doctor bookings can reach in_progress/completed. Proposed: reject accept for non-doctor categories until S01.
- **M1** Any member with `provider:read` can be assigned as clinician; require a verified doctor credential or a dedicated scope.
- **M2** Dependents unsupported (guardian grant not modelled). **M3** no abuse limits (proposed: 10 pending per patient, 90-day horizon, 20 addresses). **M4** `lock_provider` serialises all org activity (use FOR SHARE where possible). **M5** resource upsert leaks existing ids and plate conflicts. **M6** non-scheduler assignees cannot list their bookings.
- Partial work for H1 to M6 is on `wip/B01-fix-round1`. It was interrupted and is unverified. Treat as a starting point only.
- Full review text is not in the repo; the findings above are the summary.

### C01
- CodeRabbit and Kiro re-reviews of round 2 did not finish. Re-run both.

### Not started
- P01 pay-after, Q01 security/E2E/backup (Q01a runner WIP on `wip/Q01a-rls-runner`), S01 (lab, caretaker, ambulance visits), DC01 to DC14 doctor consultation, R02 staging/release.

### Never verified
- Real Auth/MFA flows, Storage HTTP cross-org behaviour, staging deployment, signed document URLs (disabled, return 503).

## Open owner decisions
Provider renewal policy for approved providers, four-eyes approval, signed-URL design, audited document download route, price 0 allowed, cap values (100 services, 200 prices per service, 50 areas), magic-byte upload check, orphan cleanup, suspension evasion, coverage horizon (currently 12 months), cancellation window and fee policy, dependents model.

## Endpoints needing approval
New routes under `/api/organizations/invitations`, `/api/providers/**`, `/api/admin/providers/[id]/review`, `/api/catalog/**`, `/api/provider/**`, `/api/bookings/**`, `/api/availability`, `/api/patient/**` are not yet in `docs/API_CONTRACTS.md`. Add after owner approval.

## Frontend dependency
Frontend tickets U01-d to U01-g are blocked on these PRs landing (C01, B01, I01, I02).
