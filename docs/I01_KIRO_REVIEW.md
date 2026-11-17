# I01 independent review (Kiro)

Untracked review note. Do not commit unless Claude decides to.

- Reviewed: `supabase/migrations/20261117000100_i01_identity_organizations.sql` (22,582 bytes, mtime 2026-11-17 19:00) and `supabase/tests/001_identity_rls.test.sql` (18,660 bytes, mtime 2026-11-17 19:18), both authored by Codex.
- Against: `docs/CANONICAL_SCHEMA_DRAFT.md` section 4 and `docs/PERMISSIONS.md`.
- Environment: local stack `surecure-visit`, Supabase CLI 3.2.0, Postgres 17.12, pgTAP 1.3.3. Synthetic data only.
- I did not edit the migration, the tests or any other tracked file.

## Verdict

I found no Critical or High issue. RLS, grants, helper functions, tenant isolation, patient isolation and audit immutability all hold under direct attack, both in SQL and through the real REST and Auth APIs. I found 2 Medium and 5 Low issues, plus some informational notes and missing negative tests. None of them lets an ordinary user read or change another user's data today.

## 1. Test run (real output)

`npx supabase db reset` (exit 0):
```
Resetting local database...
Recreating database...
Initialising schema...
Seeding globals from roles.sql...
Applying migration 20261117000100_i01_identity_organizations.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch task/I01-auth-rls.
```

`npx supabase test db` (exit 0):
```
psql:.../001_identity_rls.test.sql:3: NOTICE:  extension "pgtap" already exists, skipping
/SURECUREVISIT/.worktrees/codex-task-I01-auth-rls/supabase/tests/001_identity_rls.test.sql .. ok
All tests successful.
Files=1, Tests=96,  1 wallclock secs ( 0.16 usr  0.09 sys +  0.08 cusr  0.09 csys =  0.42 CPU)
Result: PASS
```

## 2. Findings

### F1 (Medium, latent): anonymous Auth users are treated as full accounts

`handle_new_user` creates an active profile for every `auth.users` row. No helper or policy checks the JWT `is_anonymous` claim. If anyone turns on anonymous sign-ins (one dashboard toggle; currently `enable_anonymous_sign_ins = false` in `config.toml`), an anonymous visitor could create organizations, become their owner and onboard a patient record.

Evidence (rolled back, `kiro_i01_probe_behavior.sql` P6): auth user inserted with `is_anonymous=true`, JWT `{"role":"authenticated","is_anonymous":true}`:
```
 anon_user_created_org
-----------------------
 t
 anon_user_onboarded_patient
-----------------------------
 t
```

Fix: in `private.is_active_account()`, also require `not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)`. Every helper and command already calls it. Add a pgTAP case asserting that an `is_anonymous` JWT cannot onboard or create an organization.

### F2 (Medium, compliance/operations): Auth users can never be deleted

`profiles.id` references `auth.users(id) ON DELETE RESTRICT`. Every other identity FK, including `audit_events.actor_profile_id`, is also `RESTRICT`. As a result, both Supabase Auth `admin.deleteUser` and user self-deletion fail with HTTP 500.

Evidence: a real GoTrue signup (synthetic `kiro-e2e-signup@example.invalid`), then `DELETE /auth/v1/admin/users/{id}` with the service-role key returned `HTTP 500`. Auth container log: `"error":"ERROR: update or delete on table \"users\" violates foreign key cons...`. The same check in SQL (P7):
```
ERROR:  update or delete on table "users" violates foreign key constraint "profiles_id_fkey" on table "profiles"
```
I removed the synthetic user afterwards with `npx supabase db reset`. Counts are back to `auth_users=0 profiles=0 audit=0`.

Fix: this is a product and legal decision (DPDP erasure versus audit retention), so it needs an owner answer. A workable default:
- Add a trusted `account_close` command that disables the profile, scrubs `display_name`, revokes grants and memberships, and bans the Auth user rather than deleting it.
- Document that `deleteUser` is not supported.
- Alternatively, drop the FK from `audit_events.actor_profile_id` (keep the raw uuid) so history never blocks erasure.

Record the decision in `docs/` before I02 adds more FKs to `profiles`.

### F3 (Low, defence in depth): service_role can forge audit events

The migration revokes UPDATE, DELETE and TRUNCATE on `audit_events` from `service_role`, but INSERT, TRIGGER and REFERENCES remain. Server code with the service key can therefore append events with any actor, action or target. With a direct DB connection as `service_role` it could also attach a trigger to the audit table.

Evidence (catalog): `audit_events | service_role | INSERT,REFERENCES,SELECT,TRIGGER`. Evidence (P1, rolled back):
```
       result        |           actor_profile_id
---------------------+--------------------------------------
 FORGED ROW ACCEPTED | 20000000-0000-0000-0000-00000000000a
 svc_trigger_priv  ->  t
```

Fix: `revoke insert, trigger, references on public.audit_events from service_role;`. If server code later needs app-level audit entries, give it a narrow `private.append_audit(...)` definer function that fixes the actor and validates the action. Also consider `revoke trigger, references ... from service_role` on the other six I01 tables.

### F4 (Low): organization renames are not audited

The audit allowlist omits `display_name`. An org rename therefore changes no allowlisted key, and the trigger returns before inserting a row. Org names will become public provider identity, so a rename trail matters for impersonation disputes.

Evidence (P2): the owner renamed the org (`version` went to 2) while `org_update_audits_before = 0` and `org_update_audits_after = 0`.

Fix: include `display_name` in the allowlist only when `tg_table_name = 'organizations'`. Keep patient and profile names excluded. Add a pgTAP assertion.

### F5 (Low): any account can check whether a profile UUID exists

`create_organization` is open to every active account, which makes the caller an owner. `set_organization_member` then inserts with the caller-supplied `p_profile_id`. For a missing profile, the FK error and its DETAIL go back to the client (PostgREST passes `details` through). Random UUIDs are not guessable, but profile ids do appear in rosters and audit rows.

Evidence (P3):
```
ERROR:  insert or update on table "organization_members" violates foreign key constraint "organization_members_profile_id_fkey"
DETAIL:  Key (profile_id)=(2fffffff-ffff-ffff-ffff-ffffffffffff) is not present in table "profiles".
```

Fix: before the insert, check `exists(select 1 from public.profiles where id=p_profile_id and status='active')`. If it fails, raise the same `42501 'membership change denied'` used elsewhere. This also fixes F6.

### F6 (Low): invitations can target disabled accounts

Evidence (P3b): `disabled_profile_invited = t`. The invitee cannot accept while disabled, but re-enabling the account would silently surface a pending invite. Fix: same check as F5.

### F7 (Low, policy): a manager can strip or disable a member who holds more scopes than the manager

`set_organization_member` checks that the new `p_scopes` are a subset of the actor's scopes. It does not check the target's current scopes. A manager without `organization:update` therefore disabled a doctor who holds `organization:update`.

Evidence (P4): `manager_disabled_more_privileged_member = t`.

Fix, if the owner agrees: for a non-owner actor, also require `v_target.scopes <@ v_actor.scopes` before any change. Owners stay exempt.

## 3. Informational

- **No version checks on direct updates.** Direct REST UPDATEs on `profiles`, `patients` and `organizations` bump `version` but never compare it, so concurrent edits are last-write-wins. Acceptable for display fields in I01. Booking and price work must use expected-version commands.
- **Open org creation.** `create_organization` has no quota or rate limit. Every account can create unlimited organizations. This is a product decision, and Auth rate limits do not cover RPCs.
- **Local Auth config is dev-grade.** These are not migration bugs, but production config must change them:
  - `auth.mfa.totp enroll_enabled/verify_enabled = false`, so `aal2` is unreachable and every admin capability is unusable outside tests.
  - `enable_confirmations = false`.
  - `minimum_password_length = 6`.
- **Brief lock before authorization.** `set_organization_member` and `accept_organization_invite` take `FOR UPDATE` on the organization row before checking the caller. An outsider with a known org UUID gets the same generic error, so there is no oracle, and the lock is released when the RPC fails. The effect is negligible. Checking cheaply before locking would be slightly cleaner.
- **Spoofable claims for direct SQL sessions.** `auth.uid()` and `aal` come from `request.jwt.claims`, which any SQL session can `set_config`. That is safe today because only PostgREST connects as `authenticated`. It becomes a privilege-escalation path if a future RPC executes caller-controlled SQL or `set_config`. Keep that rule in review checklists.

## 4. Checked, no issue found

| Area | Check | Result |
|---|---|---|
| RLS coverage | `pg_class` for public/private | All 7 I01 tables have RLS. There are no other tables or views in public/private. Realtime publication has no public tables. |
| Policies | `pg_policies` | SELECT on all 7, UPDATE on profiles/patients/organizations only. No INSERT/DELETE policies. All `TO authenticated`. |
| Table grants | `role_table_grants` | anon: none. authenticated: SELECT only, plus column UPDATE on `profiles(display_name,locale)`, `patients(display_name,date_of_birth)`, `organizations(display_name)`. |
| Direct DML | Authenticated DELETE on every table; INSERT/UPDATE on memberships, capabilities, grants | All `42501 permission denied` (P5 plus pgTAP). |
| Security definer | `pg_proc` | All 10 definer functions are owned by `postgres` with `search_path=""`. anon has EXECUTE on none. authenticated has EXECUTE on the 4 public commands and 4 private boolean helpers only. Trigger functions are not executable (P5: `permission denied for function handle_new_user` / `touch_version`). |
| Helper export | `has_org_scope` / `has_patient_scope` | Pinned to `auth.uid()`. They answer only for the caller. No row export. |
| Private schema exposure | REST `Content-Profile: private` | `HTTP 406`. `private` is not in the API `schemas`. |
| Recursion | Policies call definer helpers that bypass RLS as owner | No recursion. Roster and patient-access reads pass in pgTAP. |
| Anon via REST | GET on all 7 tables, RPC `onboard_self_patient` / `create_organization` | All `HTTP 401`, code `42501`. |
| Signup metadata | Real GoTrue signup with `data:{role:admin,status:disabled}` | Profile `status=active`, no capabilities. PATCH own `status` returns `HTTP 403`. PATCH own `locale` returns `HTTP 200`, `version` 2. |
| Self-grant via REST | POST `admin_capabilities` (self `capability:manage`), POST `audit_events` | Both `HTTP 403`. |
| Signup trigger | Real GoTrue signup via `supabase_auth_admin` | Profile created and audited (`INSERT profiles {"status":"active"}`). |
| Escalation | Owner invites `owner` role; manager invites `manager`; manager targets owner; self change | All denied (`scope elevation denied` / `protected membership` / `membership change denied`). |
| Audit tamper | UPDATE/DELETE/TRUNCATE as client and trusted SQL | Rejected by trigger; service_role lacks UPDATE/DELETE/TRUNCATE. See F3 for INSERT. |
| Patient leakage | pgTAP plus `has_patient_scope` | The composite FK pins grantee to `self_profile_id`. Cross-patient read and update return 0 rows. Patient audits carry `organization_id NULL`, readable only by a global `audit:read` holder with aal2. |
| Role attributes | `pg_roles` | `authenticated` and `anon`: no super, no bypassrls. |

## 5. Missing negative tests (add to `001_identity_rls.test.sql`)

1. `is_anonymous` JWT cannot onboard or create an organization (F1).
2. anon EXECUTE denied on `create_organization`, `set_organization_member`, `accept_organization_invite`, `has_org_scope`, `has_patient_scope`, `has_admin_capability`. Only `onboard_self_patient` and `is_active_account` are tested now.
3. authenticated EXECUTE denied on `private.handle_new_user`, `private.touch_version`, `private.reject_audit_mutation`. Only `audit_access_change` is tested.
4. Owner cannot invite with `p_role='owner'`; manager cannot invite `manager`; manager cannot change the owner's or another manager's row. These currently work (P5) but are untested.
5. Authenticated DELETE denied on `profiles`, `patients`, `organizations`, `patient_access`, `admin_capabilities`. Only memberships are tested.
6. A global capability (`organization_id IS NULL`) behaves as intended, and an org-scoped `audit:read` cannot read `organization_id IS NULL` (patient) audits. The second is partly covered.
7. Accepting an invite to a disabled organization is denied.
8. Inviting a missing or disabled profile returns a generic `42501` (after the F5/F6 fix).
9. Org rename produces an audit row (after the F4 fix).
10. `service_role` cannot INSERT into `audit_events` (after the F3 fix).
11. Signup with `raw_app_meta_data` containing `role` grants nothing. Only `raw_user_meta_data` is tested.

## 6. Probe artifacts

Outside the repo, under `C:\tmp\scv_logs\`. All SQL runs inside `begin ... rollback`. The behavioral script ends with a leftover check that returned `leftover_auth_users = 0`, `leftover_audit = 0`.

- `kiro_i01_probe_catalog.sql` / `.out`: read-only catalog checks.
- `kiro_i01_probe_behavior.sql` / `.out`: P1 to P7.
- `kiro_i01_e2e.ps1`: real Auth signup plus REST calls. It prints no keys or tokens. This is the only probe that wrote outside a transaction (one synthetic user); `db reset` removed it.
- `kiro_review_reset.log`, `kiro_review_test.log`, `kiro_review_reset2.log`: raw command output.

---

## Round 2 (after Codex fixes)

Migration mtime is 2026-11-17 19:47 (23,654 bytes). Test file mtime is 19:46 (31,327 bytes). Neither was edited by Kiro.

### Config change (Kiro-owned)

`supabase/config.toml`, `[auth.mfa.totp]`: `enroll_enabled` and `verify_enabled` changed from `false` to `true`. Nothing else changed. `enable_anonymous_sign_ins` stays `false`.

The CLI cannot restart a single service, so I ran `npx supabase stop` and then the usual minimal `start -x ...`. Auth container env before: `GOTRUE_MFA_TOTP_ENROLL_ENABLED=false GOTRUE_MFA_TOTP_VERIFY_ENABLED=false GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false`. After: `...ENROLL_ENABLED=true ...VERIFY_ENABLED=true ...ANONYMOUS_USERS_ENABLED=false`.

### TOTP through the real Auth API

Script: `C:\tmp\scv_logs\kiro_i01_totp.ps1`. It uses a synthetic `kiro-totp-*@example.invalid` user and prints no keys, tokens, secrets or codes. The script's TOTP generator was checked against the RFC 6238 vectors (t=59 gives 287082, t=1111111109 gives 081804).

```
1 signup -> HTTP 200; user 301fc234-6ca2-4234-8283-c0ba1683bedf; session aal=aal1
2 enroll totp -> HTTP 200; factor type=totp; secret returned=True; qr returned=True
3 challenge -> HTTP 200; challenge issued=True
4 verify -> HTTP 200; new session aal=aal2; amr=totp,password
5 verify wrong code -> HTTP 422
6 admin deleteUser -> HTTP 500
```

TOTP enroll and verify work, and the verified session carries `aal2`, which `has_admin_capability` requires.

Step 6 failed because F2 is still open. The Auth log shows `ERROR: update or delete on table "users" violates foreign key ...`. I removed the throwaway users with `npx supabase db reset`. After the reset: `auth_users=0 mfa_factors=0 profiles=0`. A first script attempt, before the RFC fix, left one more synthetic user; the same reset removed it.

### Reruns

- `npx supabase db reset`: exit 0. It applied `20261117000100_i01_identity_organizations.sql` and the seed, then printed `Finished supabase db reset on branch task/I01-auth-rls.`
- `npx supabase test db`: the first attempt right after the reset failed with `failed to connect to postgres ... Connection timed out` while containers were restarting. It is transient. A retry 10 s later gave:
  ```
  001_identity_rls.test.sql .. ok
  All tests successful.
  Files=1, Tests=152,  6 wallclock secs
  Result: PASS
  ```
- Catalog: RLS is on for all 7 tables. All 10 security-definer functions pin `search_path=""`. anon has EXECUTE on none.

### Re-attack results

Script: `kiro_i01_probe_round2.sql` / `.out`. Every run was rolled back, and the leftover check returned 0/0.

| Finding | Re-attack | Result |
|---|---|---|
| F1 anonymous users | `is_anonymous:true` JWT (boolean and string `"true"`) calling `create_organization` and `onboard_self_patient`, then reading `profiles` | **Fixed.** Every call returns `42501 active account required`. 0 profile rows visible. |
| F3 service_role audit forgery | service_role INSERT into `audit_events`; privilege check | **Fixed.** `permission denied for table audit_events`. INSERT, TRIGGER and REFERENCES are all `f`, SELECT is `t`. The trusted trigger path still audits service_role changes with `actor_profile_id NULL` (rechecked with service-role claims). |
| F4 rename audit (spot check) | Owner renames org | **Fixed.** 1 `organizations UPDATE` audit row containing the new `display_name`. |
| F5 profile existence | Invite a missing UUID | **Fixed as reported.** Generic `42501 membership change denied`, no FK DETAIL. Residual oracle remains, see N2. |
| F6 invite disabled account | Invite a disabled profile | **Fixed.** `42501 membership change denied`. The fix introduced N1. |
| F7 manager vs more-privileged member | Manager (no `organization:update`) disables a doctor holding `organization:update`; then a technician with equal scopes | **Fixed.** The doctor change is denied (`membership change denied`). The equal-scope technician can still be disabled (`t`). |
| F2 account deletion | Real Auth `deleteUser` | **Still open** (owner decision pending). HTTP 500. |

### New in round 2

**N1 (Medium): owners cannot revoke the membership of a member whose account is disabled.** The F5/F6 fix checks `profiles.status='active'` on the target for every call, including `p_status='disabled'`.

Scenario: an account is suspended, for example because it is suspected compromised. The org owner tries to offboard that member. The call fails, the membership row stays `active`, and the org rights come back as soon as the account is re-enabled.

Evidence:
```
owner -> set_organization_member(..., doctor, 'disabled', ...)   ERROR: membership change denied (line 20)
doctor_membership_status_after_owner_attempt = active
(account re-enabled) has_org_scope(org,'organization:update') = t
```
This contradicts the section 4 rule that revoking membership stops access.

Fix: apply the active-profile check only to the insert path and to `p_status in ('invited','active')`. Always allow `p_status='disabled'` on an existing row, whatever the target's account status. Add a pgTAP case: owner disables the membership of a disabled account, and after re-enabling the account `has_org_scope` is false.

**N2 (Low): profile existence can still be inferred from error text.** The target-profile check (line 20) runs before argument validation (line 24). Calling with `p_role='owner'` returns:
- `membership change denied` for a missing profile UUID;
- `membership scope elevation denied` for an existing active profile.

No row is created either way. Fix: validate arguments before the profile lookup, or return one message for every denial in this function. Some existence signal is inherent to invite-by-UUID, because a valid invite succeeds. Long term, invites should go through a server-side email flow.

**N3 (Low, defence in depth): F1 relies only on the JWT claim.** If an `auth.users` row has `is_anonymous=true` but the JWT has no `is_anonymous` claim, the caller is treated as a full account (`anon_row_without_claim_created_org = t`). GoTrue always issues the claim today, so this is not exploitable now. It would become exploitable with a custom access-token hook or a third-party JWT issuer that drops the claim. Fix: in `is_active_account()`, also require `not exists(select 1 from auth.users u where u.id=(select auth.uid()) and u.is_anonymous)`.

**Info:** service_role still holds TRIGGER and REFERENCES on the other six I01 tables. This was optional in F3. Revoke them too if the same reasoning should apply.

### Round 2 verdict

F1, F3, F4, F6 and F7 are fixed and hold under re-attack. F5 is fixed as reported, with the residual oracle in N2. F2 stays open pending an owner decision. N1 should be fixed before I01 merges, because it blocks membership revocation. N2 and N3 are Low.

Round 2 artifacts in `C:\tmp\scv_logs\`: `kiro_i01_totp.ps1` / `.out`, `kiro_i01_probe_round2.sql` / `.out`, `kiro_r2_reset.log`, `kiro_r2_test.log`.

---

## Round 3 (after N1/N2/N3 fixes)

Migration mtime is 2026-11-17 20:14 (24,135 bytes). Test file mtime is 20:13 (36,882 bytes). Neither was edited by Kiro.

### Reruns

- `npx supabase db reset`: exit 0. It applied `20261117000100_i01_identity_organizations.sql` and the seed, then printed `Finished supabase db reset on branch task/I01-auth-rls.`
- `npx supabase test db` (exit 0):
  ```
  001_identity_rls.test.sql .. ok
  All tests successful.
  Files=1, Tests=174,  4 wallclock secs
  Result: PASS
  ```
  This confirms Codex's count of 174.

### Re-attack

Script: `C:\tmp\scv_logs\kiro_i01_probe_round3.sql` / `.out`. It ran in a single rolled-back transaction. Afterwards `leftover auth users=0` and `leftover audit rows=0`.

| Step | Result |
|---|---|
| N1a owner disables the membership of a suspended account | `ok` |
| N1d membership after revoke | `disabled`, `disabled_at` set |
| N1f/g account re-enabled: `has_org_scope` for `organization:read` and `members:read` | `false` / `false` |
| N1h re-enabled account reads organizations | 0 rows |
| N1i re-enabled account tries to self-reactivate via accept | `42501 invitation unavailable` |
| N1b owner re-invites the suspended account | `42501 membership change denied` |
| N1c owner "disables" a suspended non-member (would create a row) | `42501`, 0 rows created |
| N1j manager disables a suspended equal-scope technician | `ok` |
| N2a/b `role=owner`, missing vs existing profile | both `42501 membership scope elevation denied` |
| N2c/d `status=disabled, v=0`, missing vs existing non-member | `membership change denied` vs `invitation required` |
| N2e/f `invited, v=1`, missing vs existing non-member | `membership change denied` vs `40001 membership version conflict` |
| N2g/h `status=active, v=0`, missing vs existing non-member | `membership change denied` vs `invitation required` |
| N2i rows created by the N2 probes | 0 |
| N3a/b anonymous `auth.users` row, JWT without the claim: `create_organization` / `onboard_self_patient` | both `42501 active account required` |
| N3c/d same caller: `is_active_account()` / visible profiles | `false` / 0 |
| N3e anonymous row with the claim | `42501 active account required` |
| N3f ordinary account with `is_anonymous:false` | `is_active_account() = true` (no false denial) |
| R1 service_role audit forgery | `42501 permission denied for table audit_events` |
| R2 unpinned definers / anon EXECUTE | `0 / 0` |
| R3 tables with RLS off | `0` |

### Status

- **N1: fixed.** Owners and managers can revoke the membership of a suspended account. Re-enabling the account restores no org rights and does not allow self-reactivation. A suspended account cannot be newly invited.
- **N3: fixed.** The DB-side `auth.users.is_anonymous` check closes the missing-claim path. Ordinary accounts are unaffected.
- **N2: fixed for the reported case** (`role=owner` gives the same text for missing and existing profiles). A residual existence signal remains for other argument shapes (N2c to N2h). It reveals nothing beyond what an owner already learns by sending a valid invite, which succeeds only for an existing active profile. This is inherent to invite-by-UUID and is accepted as Low. Long term, the fix is a server-side invite-by-email flow.
- **F2: still open.** Auth users cannot be deleted because of `ON DELETE RESTRICT`. This is a product and legal decision, not an access-control flaw, and it needs an owner answer before I02 adds more FKs to `profiles`.
- **F1, F3, F4, F5, F6, F7:** hold. Regressions R1 to R3 are clean.

### Verdict: MERGE

No open Critical, High or Medium access-control issue. Conditions to record in the task ledger, not blockers:
1. F2 (account deletion versus audit retention) is logged as an open owner decision before I02.
2. The residual N2 oracle and the remaining service_role TRIGGER/REFERENCES grants on the six non-audit tables are tracked as Low.
3. Production Auth config must match local TOTP (`enroll_enabled`/`verify_enabled = true`), keep anonymous sign-ins off, require email confirmation and use a stronger password minimum than `6`.
