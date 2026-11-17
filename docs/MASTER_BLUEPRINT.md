# SureCure Visit — Current Master Blueprint Reference

**Current execution contract:** `README.md` v2.2  
**Detailed product/technical specifications:** `docs/specs/` (recovered v1.5 source files)  
**Historical architecture reference:** v1.1 and v1.3 blueprints preserved under `docs/source/`

This file is an index and current-state summary. It intentionally does not duplicate the full master execution prompt or silently combine incompatible historical schemas. The root `README.md` is the single authoritative execution prompt.

## 1. Product

SureCure Visit is a branded Indian healthcare services marketplace at `surecurevisit.in`, supporting patients and four provider categories (doctors, laboratories, scheduled ambulance operators and caretakers), with a separate admin role. Providers may be individuals or organizations with scoped staff memberships. Patient chooses a provider; provider sets the price and manually accepts the booking. Only verified providers with real operational coverage may be bookable.

## 2. Current people and agent arrangement

- Project owner: human controller of Claude and final decision-maker; initially directs both frontend and backend.
- Claude Code: lead orchestrator, task planner, reviewer and integration coordinator.
- OpenAI Codex CLI: delegated engineering agent.
- Kiro CLI: delegated engineering agent using only capabilities actually available to the owner's plan/CLI.
- Friend: later human contributor, primarily taking pending frontend/UI work through a structured handover.
- Antigravity and AI Dev Kit: removed from the active workflow.

See `docs/AGENT_COORDINATION.md`, `CLAUDE.md` and `AGENTS.md`.

## 3. Approved architectural direction

- One Next.js App Router + strict TypeScript modular monolith.
- Tailwind CSS and customized shadcn/ui.
- Zod validation.
- Supabase managed PostgreSQL, Auth and private Storage.
- SQL migrations and generated database types.
- Server-side authorization plus deny-by-default RLS on exposed tables/storage.
- Vitest, Playwright and GitHub Actions.
- Vercel subject to client-owned account and release approval.
- Razorpay test mode only until merchant, webhook, reconciliation and client gates pass.
- Optional Ollama Cloud only if the actual allowance is usable without an unapproved paid fallback; AI must not make clinical decisions.

Do not replace this stack or add paid vendors/frameworks without recording the reason and obtaining the required approval.

## 4. Architecture principles

Browser → Next.js server boundary → domain module/service → transactional PostgreSQL operation with RLS and explicit authorization. Authenticated patient data must not enter shared public caches. Private files use server-authorized, short-lived signed access. Elevated service credentials remain server-only and narrowly scoped. Payment webhooks must be signature-verified, deduplicated and reconciled. Durable notifications/retries use an outbox, not in-memory timers.

Keep a modular monolith initially. Do not introduce microservices, a second database, Redis or a separate backend framework without a documented need and approval.

## 5. Non-negotiable product/security rules

- No fabricated providers, credentials, coverage, prices, reviews, availability, payment success or emergency response times.
- Provider verification and actual service coverage precede public bookability.
- Patient chooses provider; provider manually accepts.
- Server-calculated immutable booking price snapshots use integer INR paise.
- Booking and payment states remain separate.
- Booking changes are actor-authorized, idempotent and auditable; resource conflicts are prevented transactionally/database-side.
- Patient, organization, staff and provider access is scoped; no self-granted roles.
- No real patient data in prompts, agent sessions, fixtures or logs.
- No browser service-role key, public clinical documents or unauthorized direct storage access.
- Live payments, emergency dispatch, pharmacy, subscriptions, GPS/payout automation and real-patient clinical workflows remain gated until their documented release requirements pass.

## 6. Schema authority and unresolved design issue

The v1.5 `docs/specs/DATABASE_SCHEMA.md` and historical v1.1/v1.3 blueprint have overlapping concepts but different table names and groupings. No canonical SQL schema has been approved or executed by this documentation pack. Claude must complete `docs/SCHEMA_RECONCILIATION.md`, prepare one canonical ERD, record decisions and align `docs/API_CONTRACTS.md` before any migration. One migration author at a time.

## 7. Detailed source map

- Product and user flows: `docs/specs/PRODUCT_REQUIREMENTS.md`
- Architecture/deployment: `docs/specs/SYSTEM_ARCHITECTURE.md`
- Data model: `docs/specs/DATABASE_SCHEMA.md` + `docs/SCHEMA_RECONCILIATION.md`
- Roles and permissions: `docs/specs/ROLE_ONBOARDING_AND_PERMISSIONS.md`, `docs/PERMISSIONS.md`
- Booking and clinical scope: `docs/specs/BOOKING_AND_CONSULTATION.md`
- Payments/subscriptions: `docs/specs/TECH_STACK_AND_SUBSCRIPTIONS.md`
- AI/messaging/cloud: `docs/specs/AI_WHATSAPP_AND_CLOUD.md`
- Visual design/i18n: `DESIGN.md`, `docs/specs/DESIGN_ANIMATION_I18N.md`
- Existing site/data migration: `docs/specs/EXISTING_SITE_AND_MIGRATION.md`
- Operations and handover: `docs/specs/CLIENT_HANDOVER_AND_OPERATIONS.md`
- Risks/open questions: `docs/specs/RISKS_OPEN_DECISIONS.md`, `docs/RISKS_AND_BLOCKERS.md`
- Current execution: `README.md`, `docs/IMPLEMENTATION_TASKS.md`, `docs/FEATURE_STATUS.md`, `docs/SESSION_LOG.md`

## 8. Release principle

23 November 2026 is an aggressive client acceptance/staging target, not a promise of safe production launch. Release only tested capabilities. If any clinical, payment, privacy, provider-verification, emergency or operational gate is unmet, keep that feature disabled and document the reason. Never trade security or patient safety for schedule pressure.
