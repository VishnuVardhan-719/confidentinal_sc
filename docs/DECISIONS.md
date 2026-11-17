# SureCure Visit — current decisions and open questions

Record date, decision, rationale, approver, source and unresolved questions. Do not turn proposals into client-approved policy. The historical v1.5 decision file (including its original D01–D28 entries and earlier agent/startup choices) is preserved at `docs/specs/DECISIONS_V1_5_ORIGINAL.md`.

## 2026-11-16 — Brand identity
- Public brand: SureCure Visit.
- Intended production domain: `surecurevisit.in`.
- Legal business name remains unconfirmed; do not infer another company affiliation.

## 2026-11-17 — Human-controlled multi-agent orchestration (current)
- Claude Code is the single lead orchestrator controlled directly by the project owner.
- Codex CLI and Kiro CLI are delegated engineering agents. Actual CLI invocation, model support, reasoning settings and orchestration methods must be verified in the installed tools.
- The project owner initially starts and directs both frontend and backend development.
- The friend joins later, primarily taking pending frontend/UI tasks via explicit handover; do not assign work to the friend before they join.
- One shared GitHub repository; isolated feature branches/worktrees for concurrent agents.
- Antigravity is removed from active workflow; AI Dev Kit is disbanded and must not be a dependency.

## 2026-11-17 — Master instruction location
- Root `README.md` is the single master execution prompt and project entrypoint.
- Heavy prompts, task instructions, architecture rules and handover material belong in repository README/docs, not repeated in chat.
- Chat instructions should be short and point Claude to the README and live task ledger.

## 2026-11-17 — Source archive recovery and authority
- The full nested v1.5 specification archive was recovered during the pack audit and extracted to `docs/specs/`.
- Earlier notes that called these detailed specifications missing are incorrect and have been removed.
- The original v1.5 and v1.3 archives are preserved under `docs/source/`.
- Current root README and current workflow documents supersede historical v1.5/v1.3 agent assignments and the old planning-only/start gate. This supersedes the old instructions; it does not waive security, release or owner approval gates.

## 2026-11-17 — Schema reconciliation requirement
- The v1.5 data model and v1.1/v1.3 blueprint use overlapping concepts with different names/groupings.
- No canonical schema is approved or migrated by this documentation pack.
- `docs/SCHEMA_RECONCILIATION.md` is the required crosswalk task. A single canonical ERD/schema and API mapping must be approved before initial migrations.

## 2026-11-17 — Clinical consultation scope / release conflict (OPEN)
- The detailed v1.5 `docs/specs/BOOKING_AND_CONSULTATION.md` and `docs/specs/DAY_BY_DAY_PLAN.md` request all 14 doctor-consultation capabilities for the November 23 target.
- The v1.5 consolidation/release-contract blueprint separately lists clinical records and prescriptions among features deferred from the initial public transactional release.
- Preserve all 14 capabilities in the product scope and task ledger; implement/test using synthetic data in isolated staging where feasible. Do not silently drop requirements.
- Client must clarify whether all 14 are required for November 23 acceptance or whether some can be accepted as documented staging-only/deferred items. This pack does not resolve that commercial scope decision.
- Regardless of milestone scope, real-patient activation, prescription issuance and release of clinical records remain disabled until privacy, consent, clinician authorization, audit, legal/clinical governance, operations and release gates pass.
- **Status:** OPEN — client clarification required. **Sources:** `docs/specs/BOOKING_AND_CONSULTATION.md`, `docs/specs/DAY_BY_DAY_PLAN.md`, `docs/specs/MASTER_BLUEPRINT_V1_5_ORIGINAL.md`.

## Pending client/project decisions
- Legal business identity and approved legal copy.
- Logo and final brand approval.
- Existing website repository/data inventory and migration decision.
- Verified provider coverage and credentials.
- OTP/email/SMS vendor and costs.
- Merchant account, settlement model, taxes, refund/cancellation policy.
- Request expiry/payment hold policy (30-minute request expiry and 15-minute payment hold are proposals only).
- Medical data hosting, retention, consent and legal review.
- Emergency dispatch operating model; disabled until independently approved.
- Membership benefits/prices and licensed pharmacy partner; deferred.
- Domain/DNS access and cutover authority.
- Client-owned hosting, database, monitoring and recovery accounts.

## 2026-11-17 — Pre-start review supplements (v2.3)
- Current chat request is a review before starting; it is **not an explicit START instruction**. Do not initiate coding or deployment based solely on this review.
- Previously confirmed policy direction: **mixed payment collection**, **hybrid cancellation**, **shared support**, **verified operating coverage**. Policy mechanics, invoice issuer and financial responsibility remain client-approval items rather than new product decisions.
- Patient health questionnaire is required before ordinary healthcare booking; None/Unknown/no-document/no-family responses are valid. Do not require fabricated medical history or a medical document at initial account creation.
- **Pending user confirmation:** v2.2 introduces Kiro CLI and removes Antigravity, whereas an earlier documented workflow had Claude+Codex only and Antigravity as the editor. Do not automatically install tools or retire the editor without latest owner confirmation.
- Documentation supplements: `docs/PRESTART_AUDIT_v2.3.md`, `docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md`, `docs/ACCEPTANCE_AND_TEST_MATRIX.md`, `docs/PRIVACY_AND_OPERATIONS_GATES.md`.

## 2026-11-17 — Owner decisions at setup (resolves D-WF, D-CLIN)
- **D-WF RESOLVED:** Claude Code orchestrates Codex CLI and Kiro CLI. Antigravity and AI Dev Kit are not used. The friend joins later for pending frontend/UI work. Source: owner answer during setup.
- **D-CLIN RESOLVED (scope order):** Core booking journeys first, then clinical DC01–DC14. Synthetic data and private staging only; real-patient activation stays gated by D-PRIV and clinical sign-off. Source: owner answer during setup.
- **Project root:** `C:\SURECUREVISIT`, git repo initialised in place, remote `VishnuVardhan-719/confidentinal_sc`. Old v1.1/v2.2 files are in the git-ignored `_archive/`.
- Still OPEN: D-POL, D-PRIV, S00 schema/ERD approval, legal entity, merchant/invoice issuer, approver names.

## 2026-11-17 — S00 canonical schema approved with defaults
- **S00 APPROVED:** Owner replied "Approve all defaults" to `docs/S00_DECISION_SHEET.md`. `docs/CANONICAL_SCHEMA_DRAFT.md` is the canonical schema basis for migrations, with the draft's safe default for each of Q01–Q12.
- Q01, Q06, Q08, Q11 and Q12 are settled as engineering defaults.
- Q02, Q03, Q04, Q05, Q07, Q09 and Q10 are approved only as safe defaults. The client, legal or finance answers remain OPEN. They block real payments, real patient data, clinical use and public go-live, not the core booking build.
- Still OPEN: legal entity, merchant/invoice issuer, D-POL, D-PRIV, approver names, Nov 23 acceptance list.
