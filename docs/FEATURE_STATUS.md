# Feature status

**Snapshot:** 20 November 2026, `main` = `develop` = `integ/all` at `3a223e2` (CI run #65 green).
Update only from inspected repository evidence, commits and executed tests. Task-level detail: `docs/IMPLEMENTATION_TASKS.md`.

"CI-verified" means every migration applies on a clean database and the block's pgTAP suites pass in GitHub Actions. The Python concurrency race runners (`tests/rls/run_*_concurrency.py`) have **not** been run for any block. All features are behind database gates seeded **off**; synthetic data only.

| Area | Status | Evidence / limitation |
|---|---|---|
| Master execution pack, specs, schema crosswalk | DONE | `README.md`, `docs/specs/`, `docs/SCHEMA_RECONCILIATION.md` (S00 approved defaults) |
| Application foundation (F01) | CI-verified | Next.js 16, strict TS, env validation, feature flags; CI `app` job green |
| Authentication, roles, organizations (I01) | CI-verified | Suites 001, 002, 010, 014; Q01 gap suite 018 |
| Provider onboarding and verification (I02, Q06) | CI-verified | Suites 003, 016; Storage policies |
| Public discovery and catalog (C01) | CI-verified | Suites 004, 015; only approved providers are public |
| Booking engine (B01) | CI-verified, race runner not run | Suites 005, 011-013; scope bug fixed in migration 002210 |
| Shared category engine (P5) | CI-verified, race runner not run | Suites 020-029, integration 090 |
| Doctor visits (S01, DC01-DC02) | CI-verified, race runner not run | Suites 030-032 |
| Doctor clinical (DC03-DC14) | CI-verified, race runner not run; owner questions open | Suites 110-114, 120-125; questions in `docs/handoffs/DC_*_kiro_2026-11-20.md`; PDF prints Latin text only |
| Lab workflow | CI-verified, race runner not run | Suites 040-048 |
| Scheduled ambulance | CI-verified, race runner not run | Suites 050-056; emergency dispatch disabled |
| Caretaker workflow | CI-verified, race runner not run; two design gaps | Suites 060-069; gaps in `docs/handoffs/P5_care_kiro_2026-11-20.md` |
| Pay-after payments (P01a) | CI-verified, race runner not run | Suites 070-089 |
| Payment gateway (P01b) | DEFERRED | Decision D-14 |
| Notifications (N01) | CI-verified, race runner not run | Suites 100-109; SMS/email/WhatsApp adapters log-only |
| UI (U01) | NOT STARTED on `main` | Placeholder page only; unverified earlier work on `wip/U01a-onto-integ` |
| Security / E2E / accessibility / performance / backup (Q01) | PARTIAL | RLS denial tests in pgTAP and CI done; E2E, accessibility, performance, backup/restore not done |
| Frontend handover (H01) | DONE | `START_HERE.md`, `docs/HANDOFF_FRONTEND.md` (§11 route index) |
| Staging and release (R02) | NOT STARTED | No deployment |
| Emergency dispatch, pharmacy, subscriptions, GPS, payouts | OUT OF SCOPE | Gates stay off |

**Important:** CI-verified database behaviour is not legal compliance, security certification, clinical approval or production readiness. Real-patient use needs the release gates in `docs/RELEASE_CHECKLIST.md` and the owner decisions in `docs/OWNER_DECISIONS_PENDING.md`.
