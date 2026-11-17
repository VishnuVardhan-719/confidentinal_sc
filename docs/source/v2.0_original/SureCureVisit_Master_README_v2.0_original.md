# SURECURE VISIT — MASTER EXECUTION README

**Project:** SureCure Visit  
**Domain:** `surecurevisit.in`  
**Master instructions:** v2.0 — Human-controlled multi-agent orchestration  
**Prepared:** 17 November 2026  
**Target milestone:** 23 November 2026 (acceptance/staging candidate; not a promise of production readiness)  
**Current state:** PRE-EXECUTION / READY TO RESUME AFTER THE OWNER'S RESET WINDOW  
**Human controller:** Project owner  
**Lead orchestrator:** Claude Code CLI  
**Delegated engineering agents:** OpenAI Codex CLI and Kiro CLI  
**Removed from active workflow:** Antigravity agents/editor workflow and AI Dev Kit  

> **THIS IS THE PRIMARY CLAUDE STARTUP PROMPT AND PROJECT ENTRYPOINT.** When beginning or resuming a substantial engineering session, Claude must read this entire README first, then the source specifications and project instructions listed below. Do not ask the owner to paste a large prompt into chat. The owner should only need to say: **“Read README.md and resume execution from the current task ledger. Follow the model/effort selection instructions and begin.”**

---

# 0. OPERATING STATE AND AUTHORIZATION

This master README consolidates the supplied SureCure Visit v1.5 handbook, v1.3 engineering kit, and v1.1 production blueprint with the owner's latest workflow decisions.

The owner has explicitly authorized development in the conversation, superseding the old v1.5 document's `PLANNING ONLY` and `START required` statements. However, this pack was prepared for later execution after the owner has used the available Claude reset window. **Do not start implementation merely because this file is opened.** Start when the owner explicitly resumes the session with the short instruction above or an equivalent direct instruction.

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

Claude is the orchestrator, but it must not falsely claim that it can control another CLI. First inspect the installed Claude, Codex and Kiro versions, available agent/delegation mechanisms, permissions, hooks and CLI invocation syntax. Use supported mechanisms only. If native delegation is unavailable, launch supported CLI processes in isolated worktrees or prepare clear commands for the owner. Never fabricate a completed agent run.

## 1.3 Human task ownership

Until the friend joins, the owner owns overall product implementation across frontend and backend. Claude may delegate implementation tickets to Codex/Kiro. The human ownership field must remain `Owner` or `Unassigned` as appropriate; do not assign tasks to the future friend prematurely.

When the friend joins, Claude prepares a self-contained frontend handover: branch, base commit, file ownership, running instructions, contracts, UI status, tests, known defects and the next independent tasks.

---

# 2. FIRST ACTION IN EVERY NEW SESSION — MODEL AND EFFORT

Before code changes or delegation:

1. Read this README completely, including the model/effort policy and all project source documents.
2. Inspect the current Claude Code CLI version and actual model-selection options.
3. Read the supplied Claude/global setup README or model-selection guidance available in the environment. The v1.3 toolkit notes that the global setup README referenced Haiku as a default and recommends a stronger available model for complex authentication/transactions. Treat that as a warning to inspect the actual current configuration, not as a hardcoded model name.
4. Select the strongest suitable Claude model actually available for architecture, multi-file implementation, security and orchestration. Select the highest practical reasoning/thinking effort actually supported by the installed CLI/account. Do not invent model names or pretend an unsupported effort setting exists.
5. Record the exact model identifier, effort setting, CLI version and how the setting was applied in `docs/SESSION_LOG.md`. Never record tokens, secrets or private account data.
6. Inspect Codex CLI's installed version and actual supported model/reasoning options. Choose a strong coding/reasoning model available in the user's account and high reasoning effort for database, transactions, RLS, security and code review. Record the actual selection. Do not guess a model name from memory.
7. Inspect Kiro CLI version and available Ultra-tier capabilities, agents, specs, hooks and execution modes. Record what is genuinely available.
8. If a preferred model/effort is unavailable, select the strongest available alternative, explain the limitation, and continue where safe. Do not waste the session repeatedly attempting unavailable configurations.

**Model policy:** model and effort are operational settings, not assumptions. Verify them at session start. Strongest available reasoning for high-risk work; lighter models only for genuinely low-risk/simple tasks when the tool supports reliable switching.

---

# 3. REQUIRED SOURCE READING AND CONFLICT HANDLING

Read these sources before substantial work:

1. `README.md` — this master execution contract.
2. `CLAUDE.md` — Claude-specific project rules.
3. `AGENTS.md` — shared engineering and agent rules.
4. `docs/MASTER_BLUEPRINT.md` — full logical architecture and product model.
5. `docs/DECISIONS.md` — current approved and pending decisions.
6. `docs/AGENT_COORDINATION.md` — human-controlled Claude/Codex/Kiro protocol.
7. `docs/API_CONTRACTS.md` — proposed API contracts; verify against implementation.
8. `docs/IMPLEMENTATION_TASKS.md` — live task ledger; update continuously.
9. `docs/PERMISSIONS.md` — autonomy and operational boundaries.
10. `docs/RELEASE_CHECKLIST.md` — release gates.
11. `DESIGN.md` — proposed visual system; client approval remains pending.
12. `docs/TOOLKIT.md` — optional tools and skills; verify actual installation.
13. `.claude/skills/*/SKILL.md` — project-specific booking, design, release and security guidance.
14. `docs/source/SureCureVisit_README_v1.5.md` — original product handbook.
15. `docs/source/SureCureVisit_Day_by_Day_Plan_v1.5.md` — original schedule and cut lines.
16. `docs/source/SureCureVisit_Master_Blueprint_v1.1.md` — separately supplied blueprint, retained as source.

Inspect nested ZIPs and all files actually present in the project. Some v1.5 handbook links refer to detailed documents that were not present in the supplied archive. **Do not claim those missing documents were read.** List missing sources in `docs/SOURCE_INVENTORY.md`; derive only what the available source text supports and flag gaps.

## Conflict hierarchy

1. Latest direct owner instruction.
2. This v2.0 master README for execution workflow and current human/agent arrangement.
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

Deferred or separately gated: emergency dispatch, recurring payments, clinical records/prescriptions and real clinical operations, lab reports, GPS tracking, automated payouts, pharmacy marketplace, advanced workforce scheduling and paid family benefits/subscriptions. Basic family profiles are allowed only when authorization/consent tests pass.

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
| Maps | Optional Google Maps Platform after cost/need approval |

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

The logical schema in the blueprint includes profiles, user_roles, organizations, organization_members, providers, provider_categories, provider_documents, provider_locations, service_areas, addresses, patients, patient_access, services, service_prices, resources, availability_rules, availability_exceptions, bookings, booking_assignments, booking_events, doctor_details, doctor_visits, clinical_records, prescriptions, lab_tests, lab_orders, lab_order_items, lab_reports, ambulance_vehicles, ambulance_drivers, transport_trips, caretaker_details, care_assignments, care_shifts, payments, refunds, settlement_entries, webhook_events, membership_plans, subscriptions, subscription_members, entitlement_usage, consent_events, notifications, outbox, audit_events and support_cases.

Implement only the tables required for the current release. Document deferred schema instead of creating unused structures. No blanket cascading deletes for financial/clinical records. Retention and deletion policies require client/legal approval.

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

Common booking state machine:

`REQUESTED → ACCEPTED → CONFIRMED → IN_PROGRESS → COMPLETED`

Alternative transitions include `DECLINED`, `EXPIRED`, `CANCELLED` and `INTERRUPTED` subject to policy. Booking state and payment state are separate state machines.

Acceptance must be atomic: lock/check booking and resource, validate verification/ownership/coverage/price/version, reserve resource with non-overlap protection, transition state, append event and enqueue outbox event in one transaction. Reject stale versions and idempotently handle retries. Material price changes require patient approval. Provider manually accepts; admin cannot fabricate provider acceptance.

Blueprint proposal: 30-minute request expiry and 15-minute online payment hold. These are configurable assumptions, not client-approved policy. Record as pending decisions until approved.

Service-specific initial flows:

- **Doctor:** onboarding, medical registration/council proof, specialization, qualification, price, coverage, availability, request, accept/decline, assigned visit, en-route/arrived/complete. Clinical notes, diagnosis and prescriptions are deferred/feature-gated until their separate security and governance gates pass.
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

Proposed design direction from `DESIGN.md` is calm, premium healthcare editorial, mobile-first. Tokens are proposals pending client approval: teal `#087E76`, dark teal `#075B56`, ink `#142C36`, muted `#52656B`, background `#F6FAF9`, white surfaces, border `#DCE7E4`.

No generic AI landing page, fake stats, fabricated reviews, random floating objects, excessive gradients/glassmorphism, or controls that do nothing. Customize shadcn/ui. Use licensed imagery and approved logo/copy. Use CSS for simple transitions; optional animation/3D only after core workflows, lazy-loaded and with reduced-motion fallback.

Accessibility: semantic HTML, keyboard operation, clear labels/errors, visible focus, contrast review, touch targets around 44px, reduced-motion support, responsive checks at 360/768/1280 widths.

Use next-intl with `en`, `te`, `hi` and stable translation keys. Translate navigation, forms, validation, errors, statuses, notifications, dashboards and accessibility labels. Legal and clinical translations require human review; do not present unverified machine translation as approved.

---

# 11. MULTI-AGENT EXECUTION PROTOCOL

## 11.1 Before every delegated task

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

## 11.2 Isolation

Use one shared Git repository with `main`, `develop` and feature branches. Use separate worktrees for concurrent coding agents. Never let two agents edit the same working directory or overlapping files concurrently. If worktree setup script is used, inspect it first and verify it matches current branch/ownership strategy. Do not run it blindly.

Claude is the integration coordinator. Codex and Kiro do not merge directly to `main` or deploy. The owner retains final control. One migration author at a time. Never rewrite an applied migration; use forward corrective migrations.

## 11.3 Agent handoff format

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

## 11.4 Integration

Agent commits feature branch → Claude reviews → cross-review high-risk changes → merge into `develop` → run full CI and relevant RLS/E2E tests → update docs and ledger. `main` is protected stable release. No force pushes, broad resets or destructive clean operations. Never resolve conflicts by blindly choosing ours/theirs.

---

# 12. EXECUTION PHASES AND PRIORITIES

Proceed in dependency order. Do not spend the whole session planning. Reconnaissance should be concise and immediately followed by useful implementation unless a real blocker exists.

## Phase 0 — Resume/reconnaissance
- Inspect current directory, Git status, branches, remotes, commits and uncommitted changes.
- Inspect all project docs and nested archives.
- Verify CLI versions, models/effort, permissions and delegation capabilities.
- Inventory existing app, dependencies, environment variable names and current test commands without printing secrets.
- Identify missing docs, credentials, vendor access and client decisions.
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

## Phase 7 — Optional/high-risk clinical workflow
Only if explicitly approved and all access, consent, audit, privacy and clinical governance gates are satisfied. Clinical records, prescriptions, reports and real patient data remain disabled otherwise. Never use AI to make independent clinical decisions.

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

# 13. FRIEND HANDOVER — ALWAYS MAINTAIN

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
- `PENDING_HANDOVER`
- `BLOCKED`
- `DEFERRED_BY_DESIGN`

For each task record owner, agent, branch, base/commit, files, dependencies, API/DB contract, acceptance criteria, tests, evidence, blockers and next action. Never mark done merely because an AI agent says so.

When friend joins, prepare a frontend-first handover with setup, branch strategy, completed screens, API contracts, mock-vs-real data status, tests, known issues and a prioritized independent backlog. The friend should be able to begin without interrupting the owner's backend work.

---

# 14. RELEASE AND OPERATIONAL SAFETY

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

# 15. IMMEDIATE RESUME INSTRUCTIONS

When the owner says to resume:

1. Read this README completely.
2. Read the current task ledger, session log, decisions and handover first.
3. Inspect Git and working tree. Preserve existing work.
4. Verify actual Claude/Codex/Kiro versions, model/effort and supported delegation.
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

# 16. REQUIRED END-OF-SESSION REPORT

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
