## What
Backend task I02: provider onboarding, private documents, admin verification. **Stacked on #1 (I01)** — base is `task/I01-auth-rls`; retarget to `develop` after #1 merges.

## Design
- Provider lifecycle draft → submitted → under_review → approved/rejected/suspended via SECURITY DEFINER RPCs (`search_path=''`), optimistic version checks, audit trail for every transition.
- Private storage bucket (policies only, no storage ALTERs); documents readable by owner, org admins and aal2 verifiers only. Signed URLs disabled (HTTP 503) until a reviewed signing design exists.
- `provider_is_publishable`: approved, non-expired, non-suspended only. `identity_roles()` now requires an approved provider.
- No service-role key; user JWT + anon key only.

## Verification (local, real exit codes)
lint, typecheck, build pass; unit tests 77 pass (1 opt-in HTTP test skipped); I01 and I02 SQL adversarial suites pass on local Supabase.

## Reviews
Kiro: 3 High / 5 Medium found, fixed (identity_roles gating, expiry cap, storage signing, doc verification, audit column grants, lock order, immutability triggers). CodeRabbit: profile backfill fixed. Second-round reviews in progress.

## Not verified / owner decisions
Real MFA flows, staging, cross-org Storage HTTP behavior; renewal policy for approved providers; four-eyes approval; signing design; audited document download route. Proposed contract changes are in `tests/rls/README.md` (docs/API_CONTRACTS.md untouched).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
