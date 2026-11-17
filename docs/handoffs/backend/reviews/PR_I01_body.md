## What
Backend task I01: identity, roles, organizations, memberships, and RLS. Built by Codex, adversarially reviewed by Kiro (two rounds), reviewed by CodeRabbit CLI, integrated by Claude Code.

## Design
- 10 identity tables, RLS deny-by-default, no write policies. Writes go through SECURITY DEFINER RPCs with `search_path` pinned and EXECUTE revoked from public/anon.
- Roles derived server-side from DB rows only. Global `admin` needs an unexpired, unrevoked global-scope capability at aal2.
- Org members are created as `invited`; only the invitee can accept.
- API routes use the user JWT and anon key only. No service-role key anywhere.
- `supabase/config.toml` added (project id `surecurevisit`, ports 584xx).

## Verification (run locally, real exit codes)
- lint, typecheck, build: pass. `npm test`: 58/58 pass.
- Migration applies cleanly on local Supabase (Docker).
- `tests/rls/i01_identity.sql` PASSED on local Supabase ("I01 SQL assertions passed"; fixtures rolled back).
- Running on a real DB caught `ALTER TABLE storage.objects ... ENABLE ROW LEVEL SECURITY` failing ("must be owner"). Fixed: ALTERs removed, restrictive deny-all policies kept.

## Not verified / deferred (documented in tests/rls/README.md)
- Reciprocal-invite two-connection concurrency test.
- Auth/Storage HTTP-level tests.
- List pagination, invite expiry and per-org cap.

## Review findings
Kiro F1 (High), F2, F3, F5, N1, N2 fixed. CodeRabbit lock mode, Auth 5xx, storage DDL fixed.

## For the owner
New endpoints (incl. invitation accept) need approval in `docs/API_CONTRACTS.md`; not edited here.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
