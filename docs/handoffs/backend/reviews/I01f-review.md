# I01 follow-up adversarial review (Kiro, read-only)
Repo: SureCureVisit-codex-I01, uncommitted. Files read: `supabase/migrations/202611170003_i01_followups.sql` (M), `src/lib/auth/pagination.ts`, `src/lib/validation/identity.ts` (diff), `src/app/api/organizations/**` (diffs + invitations route), `tests/rls/run_i01_followups.py` (R), assertion list of `tests/rls/i01_followups.sql`.
I did not run anything (no SQL, no Docker, no vitest). Findings come from reading.
Result: no critical or high issue found. One medium, four low, plus a list of checks that held.

## MEDIUM
**M1. Role change takes effect without invitee acceptance.** M:46-48, M:61.
- `needs_acceptance` is true only for `p_status='invited'`, wider scopes, or reactivation. It ignores `p_membership_role`.
- Exploit: an owner calls `set_organization_member(org, member, 'manager', 'active', <same scopes>, version)` on an active `staff` member. The member becomes `manager` at once (M:61). I02's `providers_private.org_admin` (I02 M:49-55) treats `owner` and `manager` as org admins, so the same scopes now unlock provider and evidence management that `staff` did not have. The member never agreed to the role.
- Fix: add `or p_membership_role is distinct from prior.membership_role` to `needs_acceptance` when the new role is higher than the old one. Add a test: staff -> manager on an active member returns to `invited`, `accepted_at` null.

## LOW
**L1. Default expiry leaks onto non-invited rows.** M:5, M:8; `create_organization` (001) inserts the owner row without the column.
- The column default `clock_timestamp()+14 days` stays in place after the backfill. Every new `active` owner row therefore gets a non-null `invite_expires_at` (the test fixtures at R:52 show the same). Nothing grants access from it, but the data is misleading and any later code that tests `invite_expires_at is not null` will misread owners.
- Fix: `alter table ... alter column invite_expires_at drop default;` after the backfill (M:8). The update path already sets it explicitly (M:58, M:64), and the CHECK at M:9-10 guards `invited` rows.

**L2. Pagination limit is not a security boundary.** M:92, M:110, M:128.
- `authenticated` still has `select` on `organization_members` and `organizations` (001), so a caller can bypass the RPCs and the 50-row cap through PostgREST. RLS still limits the rows to what the caller may see, so there is no cross-org leak. The cap only protects the API route.
- Fix: none needed for security. Document it, and do not rely on the cap for abuse control. Set PostgREST `max_rows` for the same effect.

**L3. Invite spam to an arbitrary active profile.** M:29, M:52-56.
- The 25-pending cap is per organization. An actor can create up to 5 organizations (001), so 125 pending invitations can target one victim. The invitee has no decline or block action and sees only `organization_id`, scopes and version in discovery (M:133).
- Fix: add a per-invitee cap (for example 25 unexpired pending invites per profile, counted in the same lock window) and a `decline_organization_invite` RPC. Both are owner decisions.

**L4. Cap race is protected but not tested concurrently.** M:18, M:50-56, test R:43-89.
- The org row `for update` at M:18 (and in `accept_organization_invite`, M:76) serializes all pending-slot allocations per organization, so I found no check-then-insert race. The test only covers the sequential 26th rejection (follow-up SQL lines 72-92) and the cross-org reciprocal case. The reciprocal test shows the organizations do not block each other. It does not show two owners of the same organization racing for the 25th slot.
- Fix: add a two-connection test: two owners of one org each invite a different profile at pending=24 and expect exactly one success and one `23514`. This is also the only way to show the org lock is not bypassed.

**L5 (informational). Runner trusts the Docker context.** R:15-16, R:95-104.
- Destructive statements run only against `TARGET` (`i01_followups_<12 hex>`, regex-checked, R:19-20, R:140). `drop schema public cascade` at R:112-114 runs with `db=TARGET` by default, never against `postgres`. `pg_dump` of the source is `--schema-only` (R:99). This is safe for the local Supabase container.
- Gap: nothing checks the container is local. If `DOCKER_HOST` or the active Docker context points at a remote engine that has a container with the same name, the script creates and force-drops a scratch DB there and reads its schema. The scratch DB name cannot collide with real data.
- Fix: assert `docker context show` is `default` (or `desktop-linux`) and `DOCKER_HOST` is unset or `unix://`/`npipe://`. Add a refusal if the `postgres` DB reports a non-local `inet_server_addr()`.

## Checked and found sound
- Cursor and IDOR: `cursor` is a Zod `z.uuid()` (validation/identity.ts), passed as a typed `uuid` RPC parameter, used only as `id > cursor`. There is no string interpolation and no way to select another organization with a cursor. `list_organizations` and `list_organization_members` are `security invoker`, so RLS (`org:read`, `members:read`, own-row) still applies. `list_organization_invites_page` is definer but filtered by `m.profile_id = auth.uid()` and `active_account()` (M:133).
- `nextCursor` is the last returned row's id (limit+1 lookahead, M:97-102). No hidden row or count leaks. Tests cover non-overlap and no skips.
- Unknown or duplicate query keys: `listQuery` rejects duplicates and `listQuerySchema` is `strictObject`, so `?profile_id=` or a repeated `cursor` gives 422 before any RPC. Limit regex `^[0-9]{1,2}$` plus `min(1).max(50)` blocks `0`, `-1`, `51`, `1e1`, and non-ASCII digits. The SQL also re-checks 1..50.
- Expiry: accept (M:80), discovery (M:133, M:150) and slot counting (M:55) all compare against `clock_timestamp()` or `statement_timestamp()`, never `now()`, and the column is `timestamptz`, so there is no timezone or transaction-start skew. The accept path locks the org and member rows first (M:76-78), so expiry cannot pass between check and update. Expired rows stay `status='invited'` but cannot be accepted, cannot be activated by an owner (M:43-45 because `accepted_at` is null), and consume no slot.
- Replay: after acceptance `invite_expires_at` is null (M:82) and the version bumps, so a stale accept fails with 40001 or 42501. Refreshing needs an owner call with the current version (M:40-41).
- Concurrency: lock order is organization, actor member row, target member row (M:18, M:19, M:30). Accept uses organization then own row. The profile `no key update` lock in `require_actor` does not conflict with FK key-share locks, which is what the reciprocal test shows.
- Grants and search path: all three new functions and both replaced ones set `search_path = ''`. `revoke ... from public, anon, authenticated` followed by `grant ... to authenticated` (M:153-156). `create or replace` keeps the existing narrow ACLs (M:157). The SQL suite asserts no `PUBLIC` or `anon` execute and a pinned `search_path` per function (follow-up SQL lines 113-115).
- Migration backfill (M:5-10) keeps old invitations at their original age (`updated_at + 14 days`), so no expired invitation is revived.
