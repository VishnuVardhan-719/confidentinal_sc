## What
Backend task C01: service catalog, prices, provider coverage (PIN areas) with reviewer approval. Stacked on I02 (which stacks on I01). Built by Codex, reviewed by Kiro, integrated by Claude Code.

## Design
- Catalog/price/coverage tables with RLS deny-by-default; writes via SECURITY DEFINER RPCs.
- Caps: 100 services, 200 prices/service, 50 areas; price ceiling 10^10 paise; duration cap 10080; valid_until ≤ 12 months; re-propose after expiry; reviewer queue pending-first.
- Coverage proposals do not bump providers.version.
- Routes: /api/catalog/**, /api/catalog/admin/**, /api/provider/coverage/**.

## Verification (local, real exit codes)
- lint 0, typecheck 0, build 0, unit 135 passed / 1 skipped.
- SQL suites pass after db reset: i01_identity, i01_followups, i02_providers, c01_catalog.

## Not verified
- Auth/MFA and Storage HTTP flows, staging deployment.

## For the owner
New endpoints need approval in `docs/API_CONTRACTS.md`; not edited here. Open policy decisions: price 0 allowed?, cap values, coverage horizon.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
