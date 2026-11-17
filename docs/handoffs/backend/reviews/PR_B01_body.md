## What
Backend task B01: booking requests, availability, provider accept/decline, cancel. Stacked on C01 (PR #3).

## Design
- Migration 005 with SECURITY DEFINER RPCs, RLS deny-by-default, exclusion-constraint reservations so overlapping accepts cannot both commit; half-open intervals.
- Authoritative price read from DB (bigint paise); optimistic version checks; idempotent events.
- Routes: /api/availability, /api/bookings/**, /api/patient/**, /api/provider/booking/**.

## Verification (local, real exit codes)
- lint 0, typecheck 0, build 0, unit 148 passed / 1 skipped.
- SQL suites pass on reset DB: i01_identity, i01_followups, i02_providers, c01_catalog, b01_booking.
- Two-connection concurrency runner passes (overlap accept, adjacent accepts, cancel/accept race, double cancel).

## Not verified
- Kiro/CodeRabbit review of B01 pending; Auth/MFA HTTP flows; staging.

## For the owner
New endpoints need approval in `docs/API_CONTRACTS.md`; not edited here.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
