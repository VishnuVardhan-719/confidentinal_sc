# Date-by-Date Execution Plan — 17–23 November 2026

**Starting state:** no application development started. Two AI CLIs can code in parallel **only after one clean foundation commit and shared contracts**. Antigravity is editor only. Plan is an ambitious target, not guarantee of secure production launch by Nov 23. Every task includes server behavior/tests; screenshots alone do not count. The user has NOT issued START; this file is planning only.

## Work units and dependencies

Foundation (F) → roles/verification (R) → booking (B) → doctor visit OTP (V) → clinical (C) → cross-service (S) → optional integrations (I) → validation (Q). **Backend API contracts and initial RLS policies must be reviewed before UI connects to them.** A single integrator manages migrations/merge, not simultaneous direct edits to `main`.

## Day 1 — Tue Nov 17 — Foundation

**Claude Code CLI:** establish app folder/modules, responsive layouts, custom brand tokens, basic localized shell/landing wireframe and navigation, UI component conventions.  
**Codex CLI:** choose/pin compatible dependencies with integrator, Supabase dev schema foundation, account/organization RLS skeleton, typed validation/CI/test setup.  
**Shared:** stable project decisions and contract files, Git worktrees only after common foundation, staging isolation/synthetic data and secret policy.  
**Exit evidence:** Next.js builds, tests run, Supabase cloud/dev environment reachable with test identity, no public data leak. If foundation not done, all later dates shift.

## Day 2 — Wed Nov 18 — Marketing and onboarding

**Claude:** homepage/story/about/how-it-works/service categories, responsive custom navigation, signup/onboarding UI, language switch en/te/hi and profile-completion UI.  
**Codex:** patient questionnaire with Unknown/None, provider registration and org staff, admin invite/review, public provider IDs, RLS tests, signup/approval state.  
**Exit evidence:** guest browse → patient signup → mandatory questionnaire → private patient dashboard; provider signup → pending admin review → approved listing, unauthorized role denied.

## Day 3 — Thu Nov 19 — Doctor booking and arrival

**Claude:** provider directory/profile, PIN/price search, booking request/accept interface, timeline, doctor identity/OTP UI, confirmation view.  
**Codex:** verified coverage, atomic reservation and price snapshot, manual accept/decline/reject, booking references, arrival challenge, expiration/replay/attempt caps, status events and authorization.  
**Exit evidence:** test patient books provider → doctor accepts → confirmation/reference → arrival OTP → verified start; concurrency and unauthorized-access tests pass.

## Day 4 — Fri Nov 20 — Clinical workflow (high risk)

**Claude:** five-step doctor workspace, vitals/assessment/medicine/test/instructions, autosave status, review/sign, patient realtime progress and authorized record view.  
**Codex:** consultation/vitals/prescription schema, versioned drafts, assignment authorization, signed final records/amendments, scoped Realtime, safe private documents and tests.  
**Stretch, if verified:** PDF layout, QR proof, consent photo, health fact review/audit.  
**Exit evidence:** authenticated doctor completes assigned test visit and patient sees record; payment remains independent; negative access tests pass. If not, *do not enable clinical features publicly*.

## Day 5 — Sat Nov 21 — Other services, billing and remaining 14

**Claude:** lab order, caretaker shifts, scheduled ambulance booking and per-role dashboard essentials; patient invoices/receipts UI, optional photo/QR/PDF screens.  
**Codex:** service-specific status engines, assignment/coverage, pay-after reconciliation, invoice vs confirmation, notifications, clinical verification history and photo/QR/PDF backend with tests.  
**Exit evidence:** one realistic tested service journey per ready category and complete 14-feature consultation checklist where feasible. Unfinished features explicitly marked unready; never show fake success.

## Day 6 — Sun Nov 22 — Integrations, 3 languages, QA freeze

**Claude:** design polish without AI slop, optional one lazy Three.js scene, selective Anime.js/21st.dev, keyboard/motion/mobile audit, three-language UI strings and errors.  
**Codex:** Ollama Cloud account free-allowance check & opt-in assistant if genuinely no-cost, WhatsApp click-to-chat, optional approved API webhook, payments sandbox/webhook tests, RLS audit, concurrency/load/privacy.  
**Exit evidence:** release blockers prioritized, critical test failures fixed, no paid AI fallback, backup/restore and staging deployment assessed. Freeze feature expansion.

## Day 7 — Mon Nov 23 — Client review and handover

**Claude:** review demos and screen defects; docs, editorial/legal review, multilingual/responsive pass.  
**Codex:** final integrated test results, account/access review, migration and recovery plan, production env and payment safety gates.  
**Integrator + client:** accept staged functionality, document unfinished work, obtain written decision about public launch, domain handover and ongoing costs.  
**Exit evidence:** signed acceptance for **what really works**; staging if not safe for real patient access. Never claim all features are live because a CLI generated code.

## Delivery tiers

**Required gating before any live patient booking:** real accounts; approved verified providers; truthful coverage/prices; atomic booking/acceptance; RLS; secure user data; backup/restore and support; consumer-facing terms/cancellation; reliable notifications or an alternative; tested critical flows.

**Requested by Nov 23, subject to actual test evidence:** all 14 doctor consultation functions (assigned doctor, OTP, Realtime, vitals/exam, autosave, assessment, finalize, prescriptions, patient access, payment status, health verification, QR proof, photo consent, PDF). Not defensible to guarantee all from zero with seven days; mark failures plainly.

**Do not turn on without independent approvals:** emergency ambulance dispatch; paid medical memberships/subscription auto-renewal; online payment settlement; medicine pharmacy delivery; AI handling individual clinical cases; broad sharing of clinical records; public clinical features with unresolved security errors.

## Daily reporting standard (for eventual use)

`Completed + verified` / `Implemented unverified` / `Blocked + owner` / `Failed checks` / `Changes to contracts` / `Deployment state` / `Next highest priority`. Both agents preserve a clean contract and handoff, one integrator merges only reviewed work.

## Timeline tradeoff

If day 2 foundation/onboarding incomplete, protect secure doctor booking by dropping cosmetic animation, optional AI, paid memberships and cross-service breadth from the Nov 23 *public* target. If by day 4 clinical tests fail, hand over staging preview and defer real clinical enablement. Client must explicitly accept a revised schedule or scope; no silent shortcut.
