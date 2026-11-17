# Test evidence

No application tests have been run as part of preparing this documentation pack. Do not interpret the documentation ZIP inspection as application verification.

For each test run, record:
- Date/time and commit SHA.
- Environment (local/staging; synthetic data only).
- Command.
- Exit code.
- Pass/fail counts and relevant output summary.
- Known skipped tests and reason.
- Owner/agent who ran it.

Never record credentials, patient data or secret values.

## F01 foundation — 2026-11-17 (branch task/F01-foundation, uncommitted, awaiting review)
- Next.js 16.4.6, React 19.3, strict TS, Tailwind 4, Zod 4, Vitest 5, Supabase JS/SSR clients installed; one lockfile (npm).
- `npm run lint`, `npm run typecheck`, `npm test` (2 files, 5 tests), `npm run build`: all exit 0 on Node 26.7.
- Covers env validation and feature flags (all OFF by default). No auth, DB or UI features yet. Not independently reviewed.

## I01 identity/organization database — 2026-11-17 (local DB verified; independent review pending)

- Agent: Codex; branch `task/I01-auth-rls`; base `d532f09b6f8d091a1843485f11ab3cd3ec3b549e`; changes uncommitted. Local synthetic data only.
- Contract: approved canonical v0.1 defaults; self-only patient grants, bounded organization memberships, explicit MFA admin capabilities, no universal account role, append-only authorization audit.
- Artifacts: `supabase/migrations/20261117000100_i01_identity_organizations.sql`, `supabase/tests/001_identity_rls.test.sql`, `supabase/seed.sql` (intentionally empty).
- Resume verification window: 19:14–19:19 IST (UTC+05:30), 2026-11-17. Local Supabase project `surecure-visit`, PostgreSQL at `127.0.0.1:54322`; CLI 3.2.0/PostgreSQL 17.12/pgTAP 1.3.3 per Kiro's setup report. Existing stack used; no start/stop command issued.
- `npx supabase db reset`: exit 0. Output: `Applying migration 20261117000100_i01_identity_organizations.sql...`, `Seeding data from supabase/seed.sql...`, `Finished supabase db reset on branch task/I01-auth-rls.` Migration unchanged during this resume.
- Initial `npx supabase test db`: exit 1 after 22 passing assertions. PostgreSQL rejected line 48: `WITH clause containing a data-modifying statement must be at the top level`; TAP ended without a completed plan.
- Fix: moved four UPDATE/RETURNING CTEs to top-level statements before their pgTAP assertions (cross-patient profile update, cross-org update, manager without update scope, revoked patient update). Each still asserts zero modified rows; no authorization checks weakened.
- Final `npx supabase test db`: exit 0. Actual output:

  ```text
  All tests successful.
  Files=1, Tests=96,  1 wallclock secs ( 0.10 usr  0.05 sys +  0.01 cusr  0.07 csys =  0.23 CPU)
  Result: PASS
  ```

- Coverage executed: RLS on all seven tables; self-only patients; metadata/role escalation denial; cross-patient/cross-org reads and updates; scoped invitations and version conflicts; MFA plus explicit bounded admin capabilities; disabled/revoked/expired access; anonymous denial; immutable allowlisted audit; pinned definer search paths; no authenticated service-role inheritance/BYPASSRLS. Fixtures are rolled back at test end.
- Launch limitations: the Windows Bash alias failed; explicit Git Bash was used. A sandboxed test attempt failed with npm registry/cache `EACCES`; the successful DB commands ran with approved escalation. No remote/shared database was targeted.
- `npm run build`: deliberately skipped on resume per owner instruction (DB-only task; build fetches fonts). The earlier session's build failed because `next` was missing; no app-build verification is claimed. No package/lockfile edits.
- `git diff --check`: exit 0 after documentation updates. Explicit trailing-whitespace checks passed for the untracked migration, test and seed; changed-file review recorded in the session log.
- Source inspection: six source files currently exist. `SUPABASE_SERVICE_ROLE_KEY` occurs only in the optional server environment schema in `src/lib/env/index.ts`; no browser Supabase client or service-role client is implemented in this checkout. This is a source snapshot check, not proof about future app code or deployed bundles. SQL tests separately check that `authenticated` cannot bypass RLS or inherit `service_role`.
- Remaining gate: Claude's independent security/diff review and integration. These results verify the local database scope, not browser Auth flows, Storage (excluded from the running stack), later task behavior or production readiness.

### I01 review fixes round — 2026-11-17

- Agent/branch/base unchanged; changes remain uncommitted. Instructions: `C:\tmp\scv_logs\codex_I01_fixes.txt`; findings: `docs/I01_KIRO_REVIEW.md` (read in full) and `C:\tmp\scv_logs\cr_I01.txt`. Same existing local synthetic stack, `surecure-visit`, `127.0.0.1:54322`; no start/stop command.
- Test-first reproduction: expanded `npx supabase test db` against the previous migration exited 1, with 13 failures out of 152 assertions. Failures were 105–108 (anonymous Auth), 121–122 (target-profile oracle/disabled target), 133–135 (manager changing broader-scoped members), 138 (rename audit), and 148–150 (service-role audit INSERT/TRIGGER/REFERENCES). The other 139 assertions passed; no SQL syntax/plan error.
- In-place migration corrections, explicitly authorized because applied only locally: F1 rejects `is_anonymous=true` in the account helper and in both onboarding/organization creation paths; F3 revokes service-role audit INSERT/TRIGGER/REFERENCES while postgres-owned trigger writers remain functional; F4 records old/new organization display names without patient/profile names; F5/F6 lock/check an active target profile and return identical `42501 membership change denied` for missing/disabled targets; F7 prevents non-owners from editing, stripping or disabling a member whose current scopes exceed theirs.
- F2 decision applied: all RESTRICT foreign keys retained; one-line SQL comment records that controlled account deletion/anonymisation awaits retention decision Q05. No deletion procedure implemented or erasure support claimed.
- Added all section 5 negative cases: anonymous Auth; six missing anon RPC/helper denials; three missing authenticated trigger-helper denials; owner/manager escalation and peer protection; five missing DELETE denials; global versus scoped capabilities and null-boundary patient audit metadata; disabled-org invite acceptance; missing/disabled targets; rename auditing; service-role forgery denial; and `raw_app_meta_data` escalation denial. Positive controls preserve bounded manager/owner mutations and trusted audit insertion.
- CodeRabbit test corrections: profile and organization UPDATEs assert exactly one RETURNING row, including the unchanged organization name; profile display name and locale are read back explicitly. The real rename case checks before/after audit payloads.
- `npx supabase db reset`: exit 0; applied `20261117000100_i01_identity_organizations.sql`, seeded the unchanged empty seed, and reported `Finished supabase db reset on branch task/I01-auth-rls.`
- Final `npx supabase test db`: exit 0. Actual output:

  ```text
  All tests successful.
  Files=1, Tests=152,  1 wallclock secs ( 0.07 usr  0.06 sys +  0.04 cusr  0.07 csys =  0.24 CPU)
  Result: PASS
  ```

- Final SQL trailing-whitespace checks passed; tracked `git diff --check` exited 0 after documentation updates. Changed-file review is recorded in the session log.
- Deferred/out of scope: CodeRabbit TOTP enrollment/verification configuration finding remains for Kiro/Claude because `supabase/config.toml` is expressly forbidden in this round. Real Auth MFA integration is not verified by SQL-set `aal` claims. Informational quota/rate-limit and direct display-field concurrency findings were not changed. `npm run build` deliberately not run. No stack/config/seed/app edits, commits, pushes or real data.
- Next gate: Claude reviews the corrected migration and 152-assertion evidence, coordinates TOTP configuration with Kiro and integration; independent re-review of these fixes is not claimed.

### I01 review fixes round 2 — 2026-11-17

- Agent: Codex; branch `task/I01-auth-rls`; base `d532f09b6f8d091a1843485f11ab3cd3ec3b549e`; uncommitted. Followed `C:\tmp\scv_logs\codex_I01_fixes2.txt`, Kiro's Round 2 N1–N3 and CodeRabbit's final N1 finding. Only the migration, test and three authorized documents were edited this round.
- Test-first reproduction: `npx supabase test db` exited 1 with 12 failures out of 174 assertions (152 original plus 22 new). Failures: 154, 156 (invalid-role existence/status distinction); 163–165, 167–168 (suspended-account revocation/version check and restored access); 170–174 (anonymous Auth row with missing/false JWT claim). All failures matched the review findings; no harness/syntax failure.
- N1: target profile existence and share lock retained; only existing memberships may be disabled while the target account is disabled. Invitations and activation still require an active target. Existing organization/account/member locks, owner/manager authority, protected-membership rules, scope bounds and expected-version checks remain. Regression sequence checks initial access, account suspension, revocation, persisted membership status and denied access/self-reactivation after account re-enablement; separate denials cover stale version, missing target, reinvitation and activation while suspended.
- N2: existing argument validation moved before target-profile lookup. Invalid-role calls return identical `42501 membership scope elevation denied` for missing, active and disabled profiles. Valid invite success still inherently signals eligibility; no email invitation workflow is introduced.
- N3: `private.is_active_account()` additionally checks `auth.users.is_anonymous` under its existing pinned security-definer context. Anonymous Auth rows are denied even when a token omits the claim or reports false. Tests cover onboarding, organization creation and profile visibility, with ordinary account behavior exercised by the rest of the suite.
- Review context: Kiro's Round 2 report records real Auth TOTP enrollment/verification success and an `aal2` session after Kiro's config update. Codex did not edit config or independently repeat that API exercise. F2 RESTRICT/account-closure limitation remains deferred pending Q05; no deletion/anonymisation procedure added. Informational service-role TRIGGER/REFERENCES privileges on other tables are unchanged.
- `npx supabase db reset`: exit 0. Applied `20261117000100_i01_identity_organizations.sql`, seeded the unchanged empty seed and reported `Finished supabase db reset on branch task/I01-auth-rls.` Target: local `127.0.0.1:54322`. The reset spent several minutes in recreation/schema initialization; read-only container health inspection showed the database healthy. Codex did not start/stop the stack.
- Final `npx supabase test db`: exit 0. Actual output:

  ```text
  All tests successful.
  Files=1, Tests=174,  7 wallclock secs ( 0.34 usr  0.25 sys +  0.60 cusr  0.59 csys =  1.78 CPU)
  Result: PASS
  ```

- Synthetic fixtures rolled back. No build, config/seed/app edits, secrets, real data, commits or pushes. Local SQL verification does not claim production readiness or independently repeat Kiro's Auth API verification. Claude's final review/integration remains pending.
- Final changed-file review completed; standalone `git diff --check` exited 0 and explicit SQL trailing-whitespace checks passed.

### I01 review fixes round 3 — 2026-11-17

- Agent: Codex; same branch/base, uncommitted. Followed `C:\tmp\scv_logs\codex_I01_fixes3.txt` and CodeRabbit's minor Security & Privacy finding in `C:\tmp\scv_logs\cr_I01_c.txt`. Only the assigned migration, test and three documents were edited this round.
- Test-first reproduction: the first expanded suite failed 31/217 assertions. Adding the constraint-boundary regression gave a final red run of `npx supabase test db`, exit 1, 32 failures / 218 assertions. Failures included leaked `23514` constraint names, a multidimensional-array `0A000`, distinct invitation/version errors and non-generic validation messages. No SQL harness or plan failure.
- Structural correction: argument validation rejects empty/null/multidimensional scopes, null scope entries, unknown statuses and invalid roles/scope subsets with `42501 membership change denied`. New-membership eligibility (active target, invited status, expected version zero) uses that same denial. Missing/non-active profiles already use it. A command-level `check_violation` handler translates any remaining `23514` to the generic denial without original constraint details. This supersedes round 2's distinct `membership scope elevation denied` message.
- Added 44 assertions: 14 invalid-input cases crossed with missing, active and disabled profiles that have no membership (42 exact SQLSTATE/message assertions), no-row-created assertion and a boundary regression using a temporary synthetic billing-role CHECK. The CHECK is removed within the rolled-back test transaction. Updated the three earlier invalid-role expectations to the generic message. Existing positive invitation tests, membership version conflicts and suspended-account revocation remain exercised.
- `npx supabase db reset`: exit 0 on local `127.0.0.1:54322`; applied `20261117000100_i01_identity_organizations.sql`, seeded the unchanged empty seed and reported `Finished supabase db reset on branch task/I01-auth-rls.` No Supabase start/stop command issued.
- Final `npx supabase test db`: exit 0. Actual output:

  ```text
  All tests successful.
  Files=1, Tests=218,  3 wallclock secs ( 0.18 usr  0.10 sys +  0.21 cusr  0.20 csys =  0.69 CPU)
  Result: PASS
  ```

- Synthetic fixtures and test-only DDL rolled back. No build, config/seed/app edits, secrets, real data, commits or pushes. F2 controlled account closure remains deferred pending Q05; Claude's final review/integration remains pending. Local SQL verification does not claim production readiness.
- Final changed-file review completed; standalone `git diff --check` exited 0 and both SQL files passed explicit trailing-whitespace checks.

## Local Storage enablement for I02 — 2026-11-17 (Kiro, branch task/I02-provider-onboarding, uncommitted)

- `git merge --ff-only develop`: fast-forwarded `8ab977a` to `ce23f63` (Merge I01b server foundation). No merge commit, no conflicts. The untracked `docs/I02_DESIGN.md` was left as is.
- `supabase/config.toml`: `[storage] enabled = true` was already set. The only edit is `file_size_limit` from `"50MiB"` to `"5MiB"`. The storage container now reports `FILE_SIZE_LIMIT=5242880`. `[storage.s3_protocol] enabled = true` is unchanged (CLI default).
- The stack was stopped and started again from this worktree. Run every Supabase CLI command from this worktree root. Exact start command:

  ```powershell
  npx supabase start -x studio,imgproxy,edge-runtime,vector,logflare,realtime,postgres-meta,mailpit
  ```

  This is the I01 list with `storage-api` removed. Running containers: `supabase_db_surecure-visit`, `supabase_auth_surecure-visit`, `supabase_rest_surecure-visit`, `supabase_kong_surecure-visit`, `supabase_storage_surecure-visit` (storage-api v1.96.0, `STORAGE_BACKEND=file`).
- Storage API: `http://127.0.0.1:54321/storage/v1`. `GET /storage/v1/status` returned 200. `GET /storage/v1/bucket` without a JWT was refused (`AccessDenied`). After the reset, the `storage` schema has 12 tables, `storage.buckets` has 0 rows and `storage.objects` has RLS on. No buckets are created by config. I02 migrations own bucket creation and policies.
- `npx supabase db reset`: exit 0. Applied `20261117000100_i01_identity_organizations.sql` and the empty seed, then reported `Finished supabase db reset on branch task/I02-provider-onboarding.`
- `npx supabase test db`: exit 0. Actual output:

  ```text
  /SURECUREVISIT/.worktrees/kiro-task-I02-provider-onboarding/supabase/tests/001_identity_rls.test.sql .. ok
  All tests successful.
  Files=1, Tests=218,  3 wallclock secs ( 0.17 usr  0.28 sys +  0.14 cusr  0.22 csys =  0.81 CPU)
  Result: PASS
  ```

- No migrations, app code, commits or pushes. No keys recorded. Note: the global `UPLOAD_FILE_SIZE_LIMIT` in the container is the CLI default. The 5 MiB cap is enforced through `FILE_SIZE_LIMIT`, and I02 buckets should also set their own `file_size_limit` and `allowed_mime_types`.

## I02 provider onboarding, documents, verification - 2026-11-17 (Kiro, branch task/I02-provider-onboarding, uncommitted)

- Base `ce23f63` (develop, I01 + I01b merged). Instructions: `C:\tmp\scv_logs\kiro_I02_impl.txt`. Design: `docs/I02_DESIGN.md` (OQ-1..OQ-11 defaults approved; section 11 I01 changes done in the I02 forward migration, I01 migration untouched). Local stack only (`127.0.0.1:54322`, storage-api enabled); synthetic data only.
- Artifacts: `supabase/migrations/20261117000200_i02_provider_onboarding.sql`, `supabase/tests/002_provider_onboarding.test.sql`, `src/lib/contracts/providers.ts`, `tests/unit/providers-contract.test.ts`, `scripts/i02-storage-smoke.mjs`, `scripts/i02-concurrency.ps1`. `npm ci` was run (no package or lockfile change).
- `npx supabase db reset`: exit 0. Applied `20261117000100_i01_identity_organizations.sql` and `20261117000200_i02_provider_onboarding.sql`, then `Finished supabase db reset on branch task/I02-provider-onboarding.`
- `npx supabase test db`: exit 0. Per file: `001_identity_rls` 218/218, `002_provider_onboarding` 266/266. Actual output:

  ```text
  /SURECUREVISIT/.worktrees/kiro-task-I02-provider-onboarding/supabase/tests/001_identity_rls.test.sql ......... ok
  /SURECUREVISIT/.worktrees/kiro-task-I02-provider-onboarding/supabase/tests/002_provider_onboarding.test.sql .. ok
  All tests successful.
  Files=2, Tests=484, 12 wallclock secs ( 0.51 usr  0.23 sys +  0.25 cusr  0.53 csys =  1.52 CPU)
  Result: PASS
  ```

- `npx supabase db lint --schema public,private --level warning`: `No schema errors found` (one unused-variable warning fixed before this run).
- Real Storage API (`node scripts/i02-storage-smoke.mjs`, two synthetic signups): exit 0, `checks=17 failed=0`. Covers upload to reserved path, upsert/overwrite rejected, guessed path, cross-user and anon upload, bucket MIME and 5 MiB limits, confirm against real object metadata, signed URL denied without a ticket, 60 s signed URL with a ticket returning the exact bytes, cross-user/anon sign and download denied, Storage API delete leaves evidence in place.
- Two-session concurrency (`scripts/i02-concurrency.ps1`): exit 0. Concurrent `create_provider` for one owner+category returned the same id with 1 row; two concurrent `suspend_provider` calls with the same expected version: one committed, the other got `40001 version conflict`, 1 suspended event. The DB was reset afterwards.
- `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` exit 0 (4 files, 18 tests, 9 new). `git diff --check` exit 0; no trailing whitespace in new files.
- Not verified: browser/app flows (no UI or route handlers in I02), real TOTP enrollment for verifiers (pgTAP sets `aal` claims), malware scanning (none approved, OQ-5), scheduling of `expire_due_verifications` (OQ-9), owner-scope backfill on non-empty data (ran on 0 rows). `npm run build` not run. Files uploaded by the smoke script may remain in the local storage container's file backend after reset; their DB rows are gone. No commits, pushes, secrets or real data.