# SURECURE VISIT — MASTER EXECUTION README

**Project:** SureCure Visit  
**Domain:** `surecurevisit.in`  
**Master instructions:** v2.3 — pre-start review addendum to v2.2, preserving source recovery and agent workflow  
**Prepared:** 17 November 2026  
**Target milestone:** 23 November 2026 (acceptance/staging candidate; not a promise of production readiness)  
**Current state:** PRE-EXECUTION / OWNER REVIEW — no development authorized by this review alone  
**Human controller:** Project owner  
**Lead orchestrator:** Claude Code CLI  
**Delegated engineering agents:** OpenAI Codex CLI and Kiro CLI  
**Removed from active workflow:** Antigravity agents/editor workflow and AI Dev Kit  

> **THIS IS THE PRIMARY CLAUDE STARTUP PROMPT AND PROJECT ENTRYPOINT.** When beginning or resuming a substantial engineering session, Claude must read this entire README first, then the source specifications and project instructions listed below. Do not ask the owner to paste a large prompt into chat. The owner should only need to say: **“Read README.md and resume execution from the current task ledger. Follow the model/effort selection instructions and begin.”**

---

## V2.3 PRE-START REVIEW — READ BEFORE EXECUTION

This addendum supplements—not replaces—the original v2.2 specs. Read `docs/PRESTART_AUDIT_v2.3.md`, `docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md`, `docs/ACCEPTANCE_AND_TEST_MATRIX.md` and `docs/PRIVACY_AND_OPERATIONS_GATES.md` before delegating work. The earlier v2.2 verification report remains historical evidence of documentation integrity, **not** a v2.3 application audit. The latest owner request was to review this package: it does not by itself authorize coding or deployment.

# 0. OPERATING STATE AND AUTHORIZATION

This master README consolidates the supplied SureCure Visit v1.5 handbook and its complete nested specification archive, the v1.3 engineering kit, the separately supplied v1.1 blueprint, and the owner's latest workflow decisions. The complete nested v1.5 archive was recovered during v2.1 verification and re-audited for v2.2; its detailed requirements are now extracted under `docs/specs/` and the original ZIP is preserved under `docs/source/`.

Previous pack materials report a development authorization in another context; this review cannot independently establish that authorization. **The latest direct owner message asks for a pre-start review, not implementation.** Do not start implementation, invoke coding agents or execute the worktree script merely because this file is opened or reviewed. Begin only on a new, explicit owner instruction to start or resume engineering work.

At every new session, inspect actual repository state before acting. Do not assume that work described in a previous chat or by an agent was completed. Verify the files, commits, branches, tests and task ledger.

The project is a real Indian healthcare marketplace, not a throwaway prototype. Do not claim production readiness, legal compliance, clinical safety certification or successful deployment without evidence.

# 1. CURRENT HUMAN AND AGENT WORKFLOW — OVERRIDES OLD KIT

## 1.1 Human ownership

**The project owner initially starts and controls BOTH frontend and backend development.** The owner directly controls Claude Code. The owner is not required to manually operate Codex or Kiro task by task; Claude should coordinate them through supported CLI/agent mechanisms and report their actual results to the owner.

**The second human developer joins later.** The intended later responsibility is primarily frontend/UI work and whichever remaining tasks the owner assigns. The project must therefore maintain a handover-ready task ledger from the first commit. Do not reserve all frontend work for the friend now; the owner may implement both sides first and transfer unfinished frontend tasks later.

## 1.2 Agent authority

- **Claude Code CLI — lead orchestrator and integration coordinator.** Reads this README, chooses/records its model and effort, audits the repo, plans tickets, delegates to Codex/Kiro, reviews actual diffs and test evidence, coordinates integration and reports to the owner.
- **Codex CLI — delegated engineering agent.** Use for substantial independent implementation, backend/database work, tests, security review, refactoring within assigned scope and independent verification. Claude assigns the task and reviews the result.
- **Kiro CLI — delegated engineering agent.** Use its available Ultra-tier capabilities for requirements/specification, architecture analysis, implementation, testing and review. Claude assigns the task and reviews the result.
- **Owner — sole human controller of Claude and final decision-maker.** Controls product direction, material decisions and sensitive operations.
- **Friend — later human contributor.** Expected to take pending frontend/UI tasks and other explicitly assigned work after handover.
- **Antigravity and AI Dev Kit — not used.** Do not add them to the workflow unless the owner changes this decision.

Claude is the orchestrator, but it must not falsely claim that it can control another CLI. First inspect the installed Claude, Codex and Kiro versions, available agent/delegation mechanisms, permissions, hooks and CLI invocation syntax. Use supported mechanisms only. If native agent delegation is unavailable, Claude should invoke Codex/Kiro through their supported CLI processes in isolated worktrees. Ask the owner only if authentication, permissions or a tool limitation genuinely requires human action; do not create a second manual orchestration workflow. Never fabricate a completed agent run.

## 1.3 Human task ownership

Until the friend joins, the owner owns overall product implementation across frontend and backend. Claude may delegate implementation tickets to Codex/Kiro. The human ownership field must remain `Owner` or `Unassigned` as appropriate; do not assign tasks to the future friend prematurely.

When the friend joins, Claude prepares a self-contained frontend handover: branch, base commit, file ownership, running instructions, contracts, UI status, tests, known defects and the next independent tasks.

---

# 2. FIRST ACTION IN EVERY NEW SESSION — MODEL AND EFFORT

Read `docs/MODEL_SELECTION.md` before selecting models. It contains current 17 November 2026 recommendations, official references, the Claude Code version requirement for Fable 5.2, and explicit checks for actual account/CLI availability.

## Starting model recommendations

These are starting choices, not assumptions about account access. Verify each model in the live CLI, then record the exact active model and effort in `docs/SESSION_LOG.md`.

- **Claude Code orchestrator:** use **Claude Fable 5.2 (`claude-fable-5-2`)** during the owner's available reset window if the account exposes it. It is the recommended choice here for demanding reasoning and long-horizon agentic work. Start at `high` effort; Fable's published default is high and adaptive thinking is always on. Use `xhigh`/`max` only when the current picker offers them and a task genuinely benefits. Verify with `/status`.
- **Codex CLI:** prefer **GPT-6 Astra (`gpt-6-astra`)** only if it is actually exposed in the authenticated Codex CLI picker. Otherwise select the strongest stable model the installed CLI exposes; GPT-6.1 Sol (`gpt-6.1-sol`) is a documented fallback when available. Start at `high` for substantial work; escalate to `xhigh` for particularly difficult schema/security/concurrency tasks and reserve `max` for rare, justified cases. Do not assume API catalog availability equals subscription CLI availability; inspect the installed picker/help.
- **Kiro CLI:** use the user's Kiro Ultra entitlement. Verify its live model picker, available Ultra/effort setting, model list, agents, specs, hooks and permissions. Kiro's current model guide describes GPT-5.6 Sol for the hardest multi-step work; use it only if this authenticated account/region actually exposes it. Otherwise choose the strongest stable model available; use Auto for routine routing only where appropriate. Do not assume access to enterprise-only or experimental models.

## Mandatory session-start checks

1. Read this README, `docs/MODEL_SELECTION.md`, `CLAUDE.md`, `AGENTS.md`, `docs/IMPLEMENTATION_TASKS.md`, `docs/FEATURE_STATUS.md`, `docs/SESSION_LOG.md`, `docs/DECISIONS.md` and `docs/HANDOVER.md`.
2. Verify Claude Code is v2.1.321 or later for Fable 5.2 support. Select Fable 5.2 for the owner's current reset window if the account picker exposes it; verify `/status`. Otherwise use the strongest supported alternative (Opus 5.5 is Anthropic's general-workload recommendation).
3. Verify actual Claude Code effort choices using `/effort`. Start Fable at `high`; do not assume that `max` or `xhigh` is supported by every model.
4. Verify Codex CLI version, available models and reasoning levels. Prefer GPT-6 Astra only if shown in the actual CLI picker; otherwise choose the strongest stable CLI model (GPT-6.1 Sol if available). Use supported CLI controls only.
5. Verify Kiro CLI version and Kiro Ultra entitlement capabilities. Record actual model, effort, agents, hooks and delegation support.
6. Record exact model identifiers, effort settings, CLI versions and verification method in `docs/SESSION_LOG.md`. Never record tokens, credentials or private account data.
7. If a preferred model is unavailable, use the strongest available alternative and report the limitation. Do not burn the session repeatedly trying unavailable models.

**Usage priority:** The owner reports an expiring Fable/reset allowance. Verify its exact model, expiry and billing/usage treatment in the account Usage/credits page before substantial work. Do not assume a historic promotion covers Fable 5.2: Anthropic's current plan guidance distinguishes Max/Ultra weekly usage from Pro usage credits, and Fable consumes included limits faster. If the allowance is confirmed, spend it on high-value orchestration, source reconciliation, difficult implementation and review—not repeated planning/status prose. Give Codex and Kiro independent, well-scoped tasks so the reset produces verified engineering progress.

# 3. REQUIRED SOURCE READING AND CONFLICT HANDLING

Read these sources before substantial work. Do not skip the detailed v1.5 documents recovered from the nested archive.

1. `README.md` — master execution contract and startup instructions.
2. `docs/MODEL_SELECTION.md` — recommended models/effort and official references.
3. `CLAUDE.md` and `AGENTS.md` — Claude-specific and shared agent rules.
4. `docs/MASTER_BLUEPRINT.md` — consolidated technical blueprint.
5. `docs/DECISIONS.md` — current owner decisions and unresolved approvals.
6. `docs/AGENT_COORDINATION.md` and `docs/PERMISSIONS.md` — current human-controlled orchestration and autonomy limits.
7. `docs/API_CONTRACTS.md` — v1.5 proposed API contracts; reconcile against implementation before use.
8. `docs/IMPLEMENTATION_TASKS.md`, `docs/FEATURE_STATUS.md`, `docs/SESSION_LOG.md`, `docs/TEST_EVIDENCE.md`, `docs/HANDOVER.md` and `docs/VERIFICATION_REPORT_v2.2.md` — live execution continuity and the last documentation-pack verification.
9. `docs/RELEASE_CHECKLIST.md` and `docs/RISKS_AND_BLOCKERS.md` — release and risk gates.
10. `DESIGN.md` and `docs/TOOLKIT.md` — current proposed design and tool guidance.
11. `.claude/skills/*/SKILL.md` — booking, design, release and security guidance.
12. All detailed v1.5 specs in `docs/specs/`: `PRODUCT_REQUIREMENTS.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `ROLE_ONBOARDING_AND_PERMISSIONS.md`, `BOOKING_AND_CONSULTATION.md`, `TECH_STACK_AND_SUBSCRIPTIONS.md`, `AI_WHATSAPP_AND_CLOUD.md`, `DESIGN_ANIMATION_I18N.md`, `EXISTING_SITE_AND_MIGRATION.md`, `CLIENT_HANDOVER_AND_OPERATIONS.md`, `RISKS_OPEN_DECISIONS.md` and `DAY_BY_DAY_PLAN.md`.
13. `docs/specs/README.md`, `docs/SOURCE_INVENTORY.md` and `docs/SCHEMA_RECONCILIATION.md` — source provenance, source completeness and required data-model crosswalk.
14. `docs/source/SureCureVisit_README_v1.5.md`, `docs/source/SureCureVisit_Day_by_Day_Plan_v1.5.md`, `docs/source/SureCureVisit_Master_Blueprint_v1.1.md` and `docs/specs/MASTER_BLUEPRINT_V1_5_ORIGINAL.md` — original standalone handbooks and historical blueprints.
15. `docs/source/SureCureVisit_v1.5_original_kit.zip`, `docs/source/SureCureVisit_v1.3_original_dual_agent_kit.zip`, the v1.1 kit and v2.0 originals — exact source archives retained for traceability. See `docs/source/SHA256SUMS.md`. Do not execute legacy scripts from them.

The detailed files were present inside the nested `SureCureVisit/SureCureVisit.zip` archive in the original upload. They have now been extracted to `docs/specs/`. The original v1.5 archive is retained byte-for-byte. Do not claim the detailed specs are missing. The original archives are specification/toolkit packs, not application source code; no `package.json`, `src/` application tree or executed migrations were present in the nested kit inspected for this pack.

## Conflict hierarchy

1. Latest direct owner instruction.
2. This v2.2 master README for execution workflow and current human/agent arrangement.
3. Latest v1.5 product handbook for product scope and decisions.
4. Current `docs/DECISIONS.md` and approved architecture decisions.
5. v1.3 kit files, updated where they conflict with this README.
6. v1.1 blueprint as historical/technical reference.

The old v1.3 kit assigns Claude to UI and Codex to backend. That split is superseded. Claude now orchestrates; Codex and Kiro are delegated agents; the owner initially controls both frontend and backend; the friend joins later. The old kit's Antigravity references are superseded.

If sources disagree on healthcare policy, business/legal identity, payment rules, scope, privacy or safety, do not silently choose. Add a dated entry to `docs/DECISIONS.md` with source references, options, risk and required approver.

---

# 4. PRODUCT DEFINITION AND COMMERCIAL SCOPE

SureCure Visit is a responsive, rebranded Indian healthcare service marketplace at `surecurevisit.in`. One marketplace business lists independent providers and provider organizations. It is **not white-label SaaS**.

The legal business name is unconfirmed. Use SureCure Visit as the public brand only. Do not invent a legal entity, company affiliation, merchant identity, invoice issuer, provider credential, coverage promise or testimonial. Obtain client-approved legal identity and ownership details before legal notices, merchant disclosures or invoices.

The marketplace supports six primary roles:

1. Patient.
2. Doctor.
3. Laboratory provider.
4. Ambulance operator.
5. Caretaker.
6. Admin.

Providers may be individuals or organizations with owners, managers and scoped staff memberships.

Core business rules:
- Patient chooses the provider.
- Provider sets the price.
- Provider manually accepts or rejects booking requests.
- Services may support online payment or pay-after-service, subject to release gates.
- Discovery is nationwide only where actual verified provider coverage exists.
- No fake listings, ratings, reviews, credentials, availability or ETAs.
- Provider verification is category-specific and can expire or be revoked.

Budget and timeline:
- Quoted development budget is approximately ₹10,000; this is not a realistic all-inclusive operating budget for the full marketplace.
- Hosting, database plans, SMS/OTP, maps, payment fees, legal review, maintenance and operations are separate unless explicitly contracted.
- November 23, 2026 is a target client acceptance/staging milestone, not a guarantee of safe production launch.
- If release gates fail, deliver private staging and a transparent deferred-work list. Never silently lower security or safety standards to meet the date.

## Initial acceptance candidate

- Branded responsive public site.
- Real authentication.
- Patient profiles.
- Provider onboarding for all four categories.
- Admin provider verification.
- Verified provider search by PIN code.
- Service listings and pricing.
- Manual booking request/accept/reject/cancel for all four service categories; ambulance is scheduled transport only.
- Patient and provider dashboards.
- Pay-after-service record.
- Basic operational audit.
- Staging deployment and handover.

Online payment remains test mode until merchant approval, reconciliation, refund and security tests pass. Live payment is a separate approval gate.

Separately gated or not part of the initial public transactional release: emergency dispatch, recurring payments, live clinical operations with real patient data, released lab reports, GPS tracking, automated payouts, pharmacy marketplace, advanced workforce scheduling and paid family benefits/subscriptions. **Scope conflict requiring explicit client confirmation:** the detailed v1.5 consultation specification and day-by-day plan request all 14 doctor-consultation capabilities for the November 23 target, while the v1.5 release-contract blueprint lists clinical records/prescriptions among deferred initial-release features. Do not erase either source. Keep all 14 capabilities in the implementation backlog, design and test with synthetic data where feasible, record item-level evidence, and explicitly disclose anything not completed by the acceptance milestone. Real-patient activation, prescription issuance and release of clinical records remain disabled until their separate legal/clinical governance, consent, privacy, authorization, audit, operations and release gates pass. Basic family profiles are allowed only when authorization/consent tests pass.

---

# 5. APPROVED TECHNICAL DIRECTION

Use a single modular Next.js App Router + TypeScript repository.

| Layer | Direction |
|---|---|
| Application | Next.js App Router, React, strict TypeScript |
| Styling | Tailwind CSS, customized shadcn/ui |
| Validation | Zod |
| Database | Supabase managed PostgreSQL |
| Auth | Supabase Auth |
| Storage | Supabase private Storage |
| Live status | Supabase Realtime with user/booking-scoped channels and reconnect/refetch |
| Authorization | PostgreSQL RLS plus server-side authorization |
| Schema | SQL migrations and generated Supabase types |
| Tests | Vitest, integration tests, Playwright |
| CI | GitHub Actions |
| Hosting | Vercel, client-owned commercial account after approval |
| Payments | Razorpay; test mode first, live only after gates |
| AI | Ollama Cloud only if an actually free included allowance exists; no paid fallback |
| i18n | English (`en`), Telugu (`te`), Hindi (`hi`) |
| Monitoring | Sentry or reviewed equivalent after approval |
| Notifications | Approved email/SMS provider; click-to-chat WhatsApp first |
| Maps | Optional Google Maps Platform after cost/need approval; PIN/city coverage tables work without map calls |

Use supported stable compatible versions and one package manager/lockfile. Inspect existing project versions before upgrading. Do not introduce NestJS, Redis, microservices, a second database or unnecessary vendors without a recorded reason and owner approval.

Architecture:

Browser → Next.js server → domain service → PostgreSQL transaction/RLS.  
Supabase user session → scoped queries.  
Private storage → authorized short-lived signed links.  
Payment webhook → signature verification → durable event inbox → transaction → outbox/retry worker.

Use Server Components for public reads where appropriate. Authenticated mutations go through server actions/route handlers calling shared domain services. Do not duplicate business rules between actions and APIs. Use a durable outbox for retryable notifications and payment events; do not rely on in-memory timers or fire-and-forget serverless work. Service-role keys are server-only and narrowly scoped; prefer user JWT + RLS for ordinary requests.

Use feature flags enforced server-side, default OFF for clinical functionality, live payments, emergency dispatch, pharmacy, subscriptions, GPS and automated payouts.

Environments: local development, isolated staging and production. Preview deployments use staging only. Client owns production domain/cloud/merchant accounts, billing and recovery. Preserve DNS MX/TXT records. Do not change old site/domain or migrate real data without explicit authorization and rollback plan.

---

# 6. REPOSITORY AND IMPLEMENTATION ARCHITECTURE

Adapt to existing working code. Do not scaffold a duplicate app if one exists. A suitable target structure is:

```text
src/
  app/
    (public)/
    (auth)/
    patient/
    doctor/
    lab/
    ambulance/
    caretaker/
    admin/
    api/
  modules/
    auth/
    organizations/
    providers/
    catalog/
    coverage/
    bookings/
    payments/
    doctor/
    lab/
    ambulance/
    care/
    audit/
  components/
    ui/
    shared/
    dashboards/
  lib/
    supabase/
    auth/
    validation/
    feature-flags/

supabase/
  migrations/
  seed.sql                 # synthetic fixtures only

tests/
  unit/
  integration/
  e2e/
  rls/

docs/
  MASTER_BLUEPRINT.md
  DECISIONS.md
  API_CONTRACTS.md
  DATABASE_SCHEMA.md
  IMPLEMENTATION_TASKS.md
  AGENT_COORDINATION.md
  PERMISSIONS.md
  RELEASE_CHECKLIST.md
  HANDOVER.md
  SESSION_LOG.md
  SOURCE_INVENTORY.md
  TEST_EVIDENCE.md
  SECURITY_REVIEW.md
  RISKS_AND_BLOCKERS.md
  FEATURE_STATUS.md
```

Do not create unused future tables or all six full dashboards before the shared identity/catalog/booking foundation works. Implement one vertical slice at a time: migration + RLS + domain service + UI + tests.

---

# 7. DATA MODEL, AUTHORIZATION AND PRIVACY

Use UUID primary keys, UTC `timestamptz`, integer paise (`bigint`) for INR, foreign keys, checks, unique constraints and indexes. Display local service time in `Asia/Kolkata`; use half-open intervals `[start,end)`.

The inherited blueprint and the v1.5 `docs/specs/DATABASE_SCHEMA.md` contain overlapping but non-identical conceptual table names and groupings (for example, `patients` vs `patient_profiles`, `service_prices` vs `service_price_versions`, and `doctor_visits` vs `consultations`). Treat these as design inputs, not two schemas to combine mechanically. Before the first migration, Claude must complete `docs/SCHEMA_RECONCILIATION.md`, compare both models, propose one normalized ERD, map each concept/table to one canonical name, document ownership/retention/RLS, reconcile API contracts, and record unresolved decisions in `docs/DECISIONS.md`. No production or shared staging migration before that review. One designated migration author at a time; owner approves the canonical design before the first migration.

The v1.5 schema and blueprint enumerate identity, organizations, provider verification, coverage, patients/family grants, catalog/pricing, resources/availability, bookings/events/assignments, doctor/clinical records, lab orders/reports, ambulance resources/trips, caretaker plans/shifts, payments/refunds/settlement, subscriptions/entitlements, notifications/outbox, audit and support. Implement only the tables required for the current release; preserve deferred concepts in the design docs rather than creating unused tables. Document deferred schema instead of creating unused structures. No blanket cascading deletes for financial/clinical records. Retention and deletion policies require client/legal approval.

Mandatory security rules:
- RLS enabled on every exposed table and storage bucket.
- Deny by default.
- Test SELECT/INSERT/UPDATE/DELETE and RPCs with actual role tokens.
- Verify ownership, active organization membership, role, provider verification and assignment on every sensitive mutation.
- No user can self-grant admin or privileged roles.
- Admin verification does not imply clinical access.
- Staff see only minimum necessary data for their assignment.
- Provider exact address/contact is disclosed only after acceptance and only to authorized assigned personnel.
- Family relationships do not grant record access; explicit scoped consent is required.
- Private IDs, reports and clinical documents never live in public buckets.
- Signed links are short-lived and each issuance is authorized.
- Validate file MIME, size and magic bytes; scan before release where available.
- Sanitize logs; never log health details, tokens or secrets.
- Do not cache authenticated patient data in shared CDN caches.
- Test cross-patient, cross-organization, suspended staff, unverified provider and role-escalation denial.

Use synthetic patient data only in development, prompts, fixtures and tests. Never provide real patient records to Claude, Codex, Kiro or external AI services.

---

# 8. SHARED BOOKING ENGINE AND SERVICE WORKFLOWS

Common marketplace booking states:

`DRAFT → REQUESTED → ACCEPTED → CONFIRMED → IN_PROGRESS → COMPLETED`

Alternative states/events include `DECLINED`, `EXPIRED`, `CANCELLED`, `INTERRUPTED` and `NO_SHOW`, subject to the approved policy. A doctor visit has a more detailed operational sub-lifecycle: `EN_ROUTE → ARRIVED → ARRIVAL_VERIFIED → IN_CONSULTATION → COMPLETED`. Lab, scheduled ambulance and caretaker services have their own category-specific states. Booking state, clinical state and payment state are separate state machines. See `docs/specs/BOOKING_AND_CONSULTATION.md` for the full transition rules and the mandatory 14-capability clinical target.

Acceptance must be atomic: lock/check booking and resource, validate verification/ownership/coverage/price/version, reserve resource with non-overlap protection, transition state, append event and enqueue outbox event in one transaction. Reject stale versions and idempotently handle retries. Material price changes require patient approval. Provider manually accepts; admin cannot fabricate provider acceptance.

Blueprint proposal: 30-minute request expiry and 15-minute online payment hold. These are configurable assumptions, not client-approved policy. Record as pending decisions until approved.

Service-specific initial flows:

- **Doctor:** onboarding, medical registration/council proof, specialization, qualification, price, coverage, availability, request, accept/decline and assigned visit. The requested 14 consultation capabilities remain in the product roadmap and are explicitly listed in `docs/specs/BOOKING_AND_CONSULTATION.md`: assigned-doctor authorization; arrival OTP; real-time patient progress; vitals/examination notes; draft/autosave recovery; clinical assessment/diagnosis; finalized clinical record; structured prescription; patient record view; independent payment state; health-fact verification history; privacy-safe QR proof; consent-based optional photography; and PDF report generation. Build and test these where feasible, but real-patient clinical activation remains gated on consent, clinician authorization, audit, privacy, legal/clinical governance and client acceptance. Do not erase the requirement merely because initial public activation is deferred.
- **Laboratory:** provider/branch, licenses, tests/catalog/pricing, sample details, collection schedule, assignment and order statuses. Reports remain private and deferred until authorized review/release is ready.
- **Ambulance:** verified operator, vehicle, driver, equipment, scheduled quote/request, pickup/destination, manual acceptance and assignment. Emergency dispatch is disabled.
- **Caretaker:** identity/skills/qualification, background checks as approved, permitted nonclinical scope, price, availability, assignment and completion. Recurring shifts are later scope.

No generic arbitrary status PATCH endpoint. Use category-specific authorized transition functions.

---

# 9. PAYMENTS, NOTIFICATIONS AND OPTIONAL INTEGRATIONS

Pay-after-service is a separate collection record, not a gateway payment. Record method/reference and reconciliation state honestly.

Online payment, when approved:
- Create gateway order server-side for immutable total.
- Verify signature and authoritative gateway status/amount/currency.
- Verify raw webhook signature.
- Deduplicate event IDs and process idempotently.
- Reconcile late captures after expiry; do not silently rebook.
- Bound refunds by captured minus already refunded amount.
- Maintain immutable settlement ledger entries.
- Never store card data or collect into a developer account.
- Do not enable live settlement without merchant, legal, tax, refund and reconciliation approval.

Notifications use a durable outbox with retry/deduplication. Do not include medical payloads in notification text.

Ollama Cloud is optional. Check actual free allowance and cost guard. Core booking must work with AI disabled. No clinical diagnosis, prescription, triage, payment or unrestricted database access by AI. No paid fallback without approval.

WhatsApp starts with click-to-chat. Official Meta Cloud API automation only after account approval, templates, consent, privacy and cost are reviewed.

---

# 10. DESIGN, ACCESSIBILITY AND LOCALIZATION

Proposed design direction from `DESIGN.md` is a warm premium healthcare editorial feel, mobile-first. The proposal in `DESIGN.md` uses deep forest/teal `#0F5F59`, focus teal `#0A857C`, ink `#17282B`, warm paper `#FAF8F2`, mist `#E9F3F0` and warning accent `#B36D20`; all remain subject to client brand approval. Use the DESIGN.md palette as the sole token source unless a documented owner/client decision changes it.

No generic AI landing page, fake stats, fabricated reviews, random floating objects, excessive gradients/glassmorphism, or controls that do nothing. Customize shadcn/ui. Use licensed imagery and approved logo/copy. Use CSS for simple transitions; optional animation/3D only after core workflows, lazy-loaded and with reduced-motion fallback.

Accessibility: semantic HTML, keyboard operation, clear labels/errors, visible focus, contrast review, touch targets around 44px, reduced-motion support, responsive checks at 360/768/1280 widths.

Use next-intl with `en`, `te`, `hi` and stable translation keys. Translate navigation, forms, validation, errors, statuses, notifications, dashboards and accessibility labels. Legal and clinical translations require human review; do not present unverified machine translation as approved.

---

# 11. TOOLING, SKILLS, HOOKS, MCP AND EXTERNAL INTEGRATIONS

Read `docs/TOOLKIT.md` and inspect the actual installed toolchain. Do not assume an item is installed merely because it is named here. Do not bulk-install, buy, enable or grant broad permissions to tools without a concrete task and approval where required.

## 11.1 Claude Code orchestration surface
- Inspect Claude Code version, `/model`, `/effort`, `/status`, project settings and permission mode.
- Inventory available built-in/subagent/agent-team capabilities, project and user skills, hooks, MCP servers, slash commands and configured integrations.
- Use hooks for deterministic quality/safety checks only after inspecting their command, inputs and side effects. Never add a hook that silently performs destructive Git, migration, payment, production or secret-handling operations.
- Keep project-local configuration in the repository; do not copy personal/global settings or credentials into the pack.

## 11.2 Codex CLI engineering surface
- Inspect `codex --version`, `codex --help`, model/reasoning selector, approval/sandbox settings, supported multi-agent/subagent functionality and MCP support in the installed build.
- Use isolated task worktrees and only supported CLI invocation. Do not assume an API model ID or API feature exists in the user's subscription CLI.
- Do not use dangerous permission bypasses, broad filesystem access or unsandboxed execution merely to make delegation easier.

## 11.3 Kiro CLI Ultra surface
- Inspect actual model picker and entitlement, CLI version, reasoning/effort control, specs, steering files, custom agents, agent skills/powers, hooks, MCP servers, workflows and any Crew/parallel execution support.
- Use these capabilities only when available to this authenticated account and appropriate to the task. Record actual model, version, region/inference scope and any credit multiplier shown.
- Do not let Kiro's autonomous features create overlapping worktree/file ownership or execute migrations/deployments outside its assigned task.

## 11.4 Engineering skills and documentation tools
Use where actually installed and relevant:
- **Superpowers:** disciplined task breakdown, TDD, systematic debugging and code review.
- **Impeccable/design skills:** critique and refine the product UI against `DESIGN.md`.
- **Context7:** retrieve version-specific official library documentation when API behavior/version is uncertain.
- **Playwright:** browser-based acceptance and regression tests; record traces/screenshots only when useful and without patient data.
- **OWASP/security skills:** threat modeling and defensive code review; this is not a security certification.
- **React/Next.js best-practice skills:** inspect real performance, server/client boundaries, accessibility and rendering behavior.
- **Supabase CLI:** local synthetic-data migrations/tests; never casually reset or push to a shared/production project.
- **GitHub Actions:** repeatable CI for lint, typecheck, unit/integration tests and build.

Review licenses, version compatibility and generated code before adopting third-party components or scripts. `21st.dev` patterns may be adapted selectively; do not paste them wholesale. `shadcn/ui` is a primitive foundation and must be customized.

## 11.5 Optional UI and runtime integrations
- **Three.js + React Three Fiber:** at most one optional, lazy-loaded marketing hero scene with static fallback and reduced-motion support; never on consultation, OTP, payment or emergency flows.
- **Anime.js:** purposeful section/SVG reveals only; CSS handles normal focus/hover/expand transitions.
- **next-intl:** English (`en`), Telugu (`te`) and Hindi (`hi`) dictionaries; no runtime AI translation for safety-critical text.
- **Supabase Realtime:** minimum booking progress only, scoped to authorized users; refetch authoritative state after reconnect; never broadcast clinical details.
- **Razorpay:** test mode first; signed webhooks, idempotency and reconciliation; live merchant use is separately gated.
- **Meta WhatsApp Cloud API:** optional after client-owned business setup, verified webhook, templates, consent and cost approval; begin with click-to-chat.
- **SMS/OTP and email:** choose an India-capable approved provider only after client consent, sender/DLT requirements, cost and delivery behavior are checked.
- **Google Maps Platform:** optional and metered; use PIN/city/coverage data for basic discovery; do not call maps unnecessarily for every search.
- **Sentry/uptime monitoring:** optional after client-account/cost approval; scrub PII and never log health or clinical payloads.
- **Ollama Cloud:** optional only if actual included free usage is confirmed and a strict zero-spend guard can fail closed. Core booking must work with AI disabled.

No extra service, app, MCP server, hook, provider SDK or paid plan becomes a dependency by being mentioned in documentation. Record why it is needed, what data it receives, required permissions, cost, fallback and owner approval before enabling it.

---

# 12. MULTI-AGENT EXECUTION PROTOCOL

## 12.1 Before every delegated task

Claude creates a ticket with:
- Task ID and priority.
- Objective and user-visible outcome.
- Assigned CLI agent.
- Branch and base commit.
- Explicit allowed paths and forbidden paths.
- Dependencies and relevant source files.
- API/database contract version.
- Acceptance criteria.
- Required tests.
- Expected handoff format.

## 12.2 Isolation

Use one shared Git repository with `main`, `develop` and feature branches. Use separate worktrees for concurrent coding agents. Never let two agents edit the same working directory or overlapping files concurrently. If worktree setup script is used, inspect it first and verify it matches current branch/ownership strategy. Do not run it blindly.

Claude is the integration coordinator. Codex and Kiro do not merge directly to `main` or deploy. The owner retains final control. One migration author at a time. Never rewrite an applied migration; use forward corrective migrations.

## 12.3 Agent handoff format

Every agent must report:

```text
TASK ID:
AGENT:
BRANCH:
BASE COMMIT:
COMMIT(S):
FILES CHANGED:
IMPLEMENTED:
NOT IMPLEMENTED:
API/DB CONTRACT CHANGES:
TEST COMMANDS:
ACTUAL TEST RESULTS:
SECURITY/PRIVACY NOTES:
BLOCKERS:
RECOMMENDED NEXT TASK:
```

Claude must inspect actual Git diff, commit, test output and changed files. A summary alone is not evidence. If a delegated agent cannot run, do not fabricate success; continue with independent work or ask the owner for the minimum required intervention.

## 12.4 Integration

Agent commits feature branch → Claude reviews → cross-review high-risk changes → merge into `develop` → run full CI and relevant RLS/E2E tests → update docs and ledger. `main` is protected stable release. No force pushes, broad resets or destructive clean operations. Never resolve conflicts by blindly choosing ours/theirs.

---

# 13. EXECUTION PHASES AND PRIORITIES

Proceed in dependency order. Do not spend the whole session planning. Reconnaissance should be concise and immediately followed by useful implementation unless a real blocker exists.

## Phase 0 — Resume/reconnaissance
- Recalculate the date-by-date plan in `docs/specs/DAY_BY_DAY_PLAN.md` against the actual execution date; do not follow past dates as if still upcoming. Keep 23 November as a target only if still feasible and client-confirmed.
- Inspect current directory, Git status, branches, remotes, commits and uncommitted changes.
- Inspect all project docs and nested archives.
- Verify CLI versions, models/effort, permissions and delegation capabilities.
- Inventory existing app, dependencies, environment variable names and current test commands without printing secrets.
- Identify missing client artifacts, credentials, vendor access and client decisions. The v1.5 detailed specs are present under `docs/specs/`; verify them rather than marking them missing.
- Compare the inherited blueprint data model, v1.5 `DATABASE_SCHEMA.md` and API contracts; produce a single proposed ERD/schema mapping before migrations.
- Create/update `docs/SOURCE_INVENTORY.md`, `docs/SESSION_LOG.md`, `docs/DECISIONS.md` and task ledger.
- Never overwrite or reset user work.

## Phase 1 — Foundation
- One Next.js app, strict TypeScript, Tailwind and customized shadcn/ui.
- Environment validation and `.env.example` with names only.
- Supabase client/server separation.
- SQL migration and generated type workflow.
- Lint/typecheck/test/build scripts.
- Vitest, Playwright and GitHub Actions CI.
- Design tokens, shared shell and navigation.
- Feature flags, structured sanitized logging and error handling.
- First reviewable foundation commit.

## Phase 2 — Identity and verification
- Supabase Auth, profiles, roles, organizations, memberships.
- Patient registration and mandatory questionnaire with Unknown/None options.
- Provider onboarding for four categories.
- Private document storage and admin review.
- Category-specific verification, expiry and suspension.
- RLS and negative tests.

## Phase 3 — Public discovery and catalog
- Public marketing pages and service categories.
- Verified provider search by PIN/category.
- Provider profiles, services, price and actual coverage.
- No unverified or fabricated listings.
- SEO, responsive and i18n foundation.

## Phase 4 — Shared booking core
- Patient request and provider accept/decline.
- Price snapshot and booking reference.
- Atomic resource assignment and non-overlap constraints.
- Cancellation/expiry and append-only events.
- Patient/provider/admin dashboards.
- Idempotency, concurrency and authorization tests.

## Phase 5 — Four service-specific flows
- Doctor scheduled home visits.
- Lab booking/collection workflow.
- Scheduled ambulance transport only.
- Nonclinical caretaker service and assignment.
- Category-specific states and data.

## Phase 6 — Pay-after, payment test mode and notifications
- Pay-after collection records and receipts.
- Payment ledger/state separation.
- Razorpay sandbox only if core flows are stable.
- Webhook inbox, deduplication and reconciliation tests.
- Outbox and approved notification integration.

## Phase 7 — Requested 14-capability doctor consultation workflow (high risk)
The owner-requested scope includes all 14 capabilities listed in `docs/specs/BOOKING_AND_CONSULTATION.md`; the detailed v1.5 day plan also requests them for the November 23 target. A separate v1.5 release-contract section defers clinical records/prescriptions from the initial public transactional release. Treat this as an explicit client acceptance/scope conflict, not permission to delete the requirements. Design, implement and test each capability with synthetic data in isolated staging where feasible. Track all 14 individually as implemented/tested/deferred with evidence and obtain client clarification on milestone acceptance. Real-patient clinical activation, prescription issuance, released reports and use of real medical data remain disabled until all access, consent, audit, privacy, legal/clinical governance, operations and client-acceptance gates are satisfied. Never use AI to independently diagnose, prescribe or make clinical decisions.

## Phase 8 — QA, security and performance
- Unit/integration/E2E/RLS tests.
- Cross-tenant and direct API denial.
- Concurrency/idempotency.
- Payment/webhook tests.
- Private file authorization.
- Mobile/accessibility/browser checks.
- Secret/dependency scans.
- Performance and error handling.
- Backup/restore and rollback rehearsal.

## Phase 9 — Staging, acceptance and handover
- Client-owned staging/production account inventory.
- Environment variable names and setup guide.
- Migration/rollback instructions.
- Release hash and test evidence.
- Known defects, deferred scope and flags.
- Client UAT and support/operations runbook.
- Production only after explicit authorization and all gates pass.

## Priority when time is limited

1. Safe identity, role isolation and provider verification.
2. Verified discovery and accurate coverage/pricing.
3. Atomic booking and manual provider acceptance.
4. Patient/provider dashboards and all four basic scheduled service journeys.
5. Pay-after-service records and basic audit.
6. Tests, security and staging.
7. Optional polish, AI, animations and integrations.

Do not add advanced features to compensate for schedule pressure. Cut optional scope, not security tests.

---

# 14. FRIEND HANDOVER — ALWAYS MAINTAIN

The owner begins both frontend and backend. Keep the task ledger accurate so the friend can join later without reverse-engineering the whole project.

Maintain:
- `docs/IMPLEMENTATION_TASKS.md` — master task board.
- `docs/FEATURE_STATUS.md` — feature-by-feature truth.
- `docs/HANDOVER.md` — current human handover.
- `docs/handoffs/` — per-agent/per-developer handoffs.
- `docs/SESSION_LOG.md` — session continuity.
- `docs/TEST_EVIDENCE.md` — actual test evidence.

Allowed task statuses:
- `DONE_VERIFIED`
- `IMPLEMENTED_UNVERIFIED`
- `IN_PROGRESS`
- `PENDING`
- `PENDING_HANDOVER`
- `BLOCKED`
- `DEFERRED_BY_DESIGN`

For each task record owner, agent, branch, base/commit, files, dependencies, API/DB contract, acceptance criteria, tests, evidence, blockers and next action. Never mark done merely because an AI agent says so.

When friend joins, prepare a frontend-first handover with setup, branch strategy, completed screens, API contracts, mock-vs-real data status, tests, known issues and a prioritized independent backlog. The friend should be able to begin without interrupting the owner's backend work.

---

# 15. RELEASE AND OPERATIONAL SAFETY

Never enable emergency dispatch without staffed verified coverage, 24/7 dispatch capability, credentialed crew/vehicles, accurate location, explicit acceptance, escalation timers, human fallback, incident response, jurisdiction/legal approval and partner SLAs. Emergency 112 must be visible without login/payment. Scheduled transport is not emergency response.

No real clinical data until hosting, access, retention, consent, legal/privacy review, backup/recovery and audit requirements are approved. No live payment without merchant approval, verified webhook/reconciliation/refund tests and client authorization. No DNS cutover or old-site migration without approval, backup and rollback plan. No paid service purchase without budget approval.

Production go/no-go requires:
- Approved legal identity and consumer-facing terms.
- Verified provider coverage and operational support contacts.
- RLS and role tests green.
- Booking concurrency/idempotency tests green.
- Payment tests and settlement controls appropriate to enabled mode.
- Private file access tests.
- No unresolved critical/high security or safety defects.
- Backups and restore evidence.
- Monitoring and incident escalation.
- Client UAT and explicit release authorization.

If any mandatory gate fails, deliver private staging and list blockers. Never claim production-ready merely because build passes.

---

# 16. IMMEDIATE RESUME INSTRUCTIONS

When the owner says to resume:

1. Read this README completely.
2. Read `docs/MODEL_SELECTION.md`, the current task ledger, feature status, session log, decisions and handover first.
3. Inspect Git and working tree. Preserve existing work.
4. Verify Claude Fable 5.2 (or documented fallback), Codex GPT-6 Astra (or GPT-6.1 Sol fallback), Kiro Ultra capabilities, exact effort settings and supported delegation.
5. Read the latest source docs and reconcile any new owner instructions.
6. Produce a short status report: current commit, completed verified work, in-progress work, blockers and next best task.
7. Continue from the highest-value unblocked task. Do not restart completed work or recreate the plan.
8. Delegate substantial independent tasks to Codex/Kiro with isolated worktrees and precise acceptance criteria.
9. Keep tests and task ledger current.
10. Report meaningful progress to the owner, not repetitive planning.

**The owner's short startup message should be enough. Do not require a long prompt pasted into chat.**

Suggested startup message:

> Read `README.md` and resume SureCure Visit from the current task ledger. Verify the strongest available Claude model and effort, inspect Codex/Kiro capabilities, then continue execution. I control Claude; you orchestrate the other agents. Do not restart completed work.

---

# 17. REQUIRED END-OF-SESSION REPORT

At the end of each substantial session, update files first, then report:

1. Current branch and commit.
2. Model/effort used (identifier only; no secrets).
3. Tasks completed and verified.
4. Tasks implemented but unverified.
5. Actual tests run and pass/fail output summary.
6. Codex and Kiro task/branch/commit status.
7. Changed files and migrations.
8. Security/privacy implications.
9. Blockers and owner decisions needed.
10. Next 3 highest-value tasks.
11. Friend handover readiness and pending frontend tasks.

Never end a session with important knowledge only in chat. Persist it in the repository's README-linked state files.

**BEGIN ONLY WHEN THE OWNER EXPLICITLY RESUMES. THEN EXECUTE, TEST, RECORD AND HAND OVER.**
