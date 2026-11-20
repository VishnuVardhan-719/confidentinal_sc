# Feature status

**Snapshot:** 17 November 2026 — master execution pack v2.2 verified.  
Update only from inspected repository evidence, commits and executed tests.

| Area | Status | Evidence / limitation |
|---|---|---|
| Master execution README and agent governance | DONE_VERIFIED | Root README and Claude/Codex/Kiro contracts prepared and cross-checked |
| v1.5 detailed specification recovery | DONE_VERIFIED | Extracted source specs under `docs/specs/`; original 44-entry ZIP preserved under `docs/source/` |
| Model/effort recommendation guide | DONE_VERIFIED | Official vendor docs checked; actual account/CLI model availability still PENDING until CLI verification |
| Schema reconciliation crosswalk | IN_PROGRESS | Candidate crosswalk drafted (SCHEMA_RECONCILIATION.md, CANONICAL_SCHEMA_DRAFT.md); canonical ERD PENDING owner approval |
| Existing application source/repository audit | PENDING | No runnable app source was in the inspected v1.5 spec archive; inspect actual repository and other upload before scaffolding |
| Application foundation | PENDING | No verified app implementation evidence in this execution pack |
| Authentication and roles | PENDING | No verified implementation evidence |
| Provider verification | PENDING | No verified implementation evidence |
| Public discovery/catalog | PENDING | No verified implementation evidence |
| Booking engine | PENDING | No verified implementation evidence |
| Doctor consultation (14 requested capabilities) | PENDING / GATED | All 14 capabilities individually tracked as DC01–DC14 in the task ledger; milestone acceptance conflict is OPEN; real-patient activation requires separate governance/security/release gates |
| Lab workflow | PENDING | No verified implementation evidence |
| Scheduled ambulance workflow | PENDING | No verified implementation evidence; emergency dispatch disabled |
| Caretaker workflow | PENDING | No verified implementation evidence |
| Pay-after/payment | IN_PROGRESS | P01a app plus SQL authored: 14 matching RPCs, private worker, suites 070–089 and 9 race cases. Database execution/RLS/concurrency NOT VERIFIED pending shared merge; activation OFF. P01b excluded under D-14 option A. [SQL handoff](handoffs/P01a_sql_codex_2026-11-19.md) |
| Security/RLS/E2E | PENDING | Must be executed against actual app and role tokens |
| Notifications (N01) | IN_PROGRESS — authored, DB NOT EXECUTED | Six migrations, suites100–109, four race cases and validated app routes/dispatcher authored. Notification gates OFF; category merge/reseed and DB/UI acceptance pending. [Handoff](handoffs/N01_codex_2026-11-20.md) |
| Staging and release | PENDING | No deployment evidence |
| Friend frontend handover | PENDING | Prepare from actual pending work when the friend joins |

**Important:** Documentation pack verification is not application implementation, application testing, legal compliance, security certification or production readiness.

**v2.3 note:** Four pre-start review documents have been added. All application features remain unverified; no implementation status has changed.
