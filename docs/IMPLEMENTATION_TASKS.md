# SureCure Visit - live implementation task ledger

**Snapshot:** 2026-11-18, written from git refs fetched into the `fe2-b` worktree (`origin/*` branches, commit messages, committed docs). Nothing below is based on an agent's claim alone. Where the only evidence is a commit message or a handoff note, the row says so.
**Human owner:** Project owner. **Orchestrator:** Claude Code. **Delegated agents:** Codex CLI, Kiro CLI. **Future human handover:** Friend, primarily pending frontend/UI work.

> Update continuously. Do not mark work done based on an agent's claim. Link commits, changed paths and actual test evidence. Do not assign work to the friend before they join.

## Status definitions
- `DONE_VERIFIED`: implemented, reviewed, required tests executed successfully, and merged to `develop`.
- `MERGED`: merged to `develop`, but the required verification (CI, review, negative tests) is not all recorded.
- `IMPLEMENTED_UNVERIFIED`: code exists on a branch but is unmerged, or required verification is incomplete.
- `IN_PROGRESS`: active work with a named branch; partial.
- `PENDING`: ready to start; no code.
- `PENDING_HANDOVER`: prepared for the friend or another developer.
- `BLOCKED`: cannot proceed due to a missing dependency, decision or access.
- `DEFERRED_BY_DESIGN`: deliberately excluded or feature-gated.

## Readiness definitions (frontend)
- `NONE`: no frontend code for this item.
- `FIXTURE`: works only against the synthetic fixture adapter (`FRONTEND_ADAPTER=fixture`, refused when `APP_ENV=production`). HTTP adapters may exist but target unmerged backend routes.
- `INTEGRATED`: wired to backend routes that are merged into `develop`, exercised end to end against a real local stack.
- `VERIFIED`: `INTEGRATED` plus the item's direct-URL/API denial, a11y and E2E evidence recorded in `docs/TEST_EVIDENCE.md`.

**Nothing is `INTEGRATED` or `VERIFIED` today.** No backend PR is merged (`origin/develop` = `d532f09`), and no frontend route pages from the FE v2 build exist on any pushed branch except fe2-a's public pages.

## Backend and platform workstreams

| ID | Workstream | Status | Branch / PR | Evidence and open items |
|---|---|---|---|---|
| R00 | Repository/tool reconnaissance | DONE_VERIFIED | n/a | Recorded at setup (see `docs/SESSION_LOG.md`) |
| R01 | Source audit and conflict register | MERGED | `task/R01-source-audit` (`141d82b`, in `develop`) | `docs/SOURCE_AUDIT_R01.md`; IC fixes merged via `task/docs-ic-fixes` |
| S00 | Canonical schema/ERD crosswalk | MERGED, approved with defaults | `task/S00-erd-draft` (`87f5b5f`); approval on `main` `ef0a31d` | `docs/SCHEMA_RECONCILIATION.md`, `docs/CANONICAL_SCHEMA_DRAFT.md`, `docs/S00_DECISION_SHEET.md` |
| F01 | Next.js foundation, env validation, feature flags, CI | MERGED | `task/F01-foundation` (`9d5f689`, in `develop`) | Lint/typecheck/test/build in commit message; no recorded CI run on `develop` |
| I01 | Auth, profiles, roles, orgs, memberships, RLS | IMPLEMENTED_UNVERIFIED | `task/I01-auth-rls` (`1efbab0`), PR #1 → `develop`, open | Local SQL suites `i01_identity`, `i01_followups` reported passing (`origin/docs/backend-handoff:docs/handoffs/backend/README.md`). Real Auth/MFA never verified. Email+password only, no phone OTP |
| I02 | Provider onboarding, private docs, admin review | IMPLEMENTED_UNVERIFIED | `task/I02-provider-onboarding` (`34811b8`), PR #2 → I01 branch, open | Suite `i02_providers` reported passing. Signed URLs disabled (503). A competing lineage exists: `ours/I02-provider-onboarding`, plus a port onto the friend stack (`integ/friend-backend` `05ec926`) |
| C01 | Catalog, prices, PIN coverage, discovery | IMPLEMENTED_UNVERIFIED | `task/C01-catalog` (`373251f`), PR #3 → I02 branch, open | Suite `c01_catalog` reported passing; round-2 CodeRabbit and Kiro re-reviews not finished |
| B01 | Booking requests, availability, accept/decline/cancel | IMPLEMENTED_UNVERIFIED | `task/B01-booking` (`e8a71ed`), PR #4 → C01 branch, open | Suite `b01_booking` and concurrency runner reported passing. Review findings H1 (assignment time check is a no-op), H2, H3, M1-M6 open. Fix attempts are WIP and unverified: `wip/B01-fix-round1`, `integ/b01-fixes` (`f8d5cf3`) |
| PR #5 | Not identified | unknown | not in repo docs | "PRs #1-#5 unmerged" appears in `origin/feat/fe2-a:.context/activeContext.md:4`, but no committed doc names #5's branch. Confirm on GitHub |
| S01 | Lab, scheduled ambulance, caretaker workflows | IN_PROGRESS (design only) | `task/S01-design` (`e2abee9`, docs) | No code; depends on B01 hardening (H1/H2/H3/M1/M3/Q06) |
| P01 | Pay-after records, payment test mode, webhooks | IN_PROGRESS (design only) | `task/P01-design` (`e2099c6`, docs) | No code |
| Q01 | Security, RLS, E2E, a11y, backup/restore | IN_PROGRESS (WIP) | `wip/Q01a-rls-runner` (`2a55014`) | Runner WIP, unverified |
| U01 | Old dashboards/UI track | Superseded by FE00-FE20 | `task/U01-a-app-shell`, `wip/frontend-pause-2026-11-18` | Owner rejected the old demo frontend (demo logins, UI-only shells). Preserved on the pause branch; not to be merged |
| H01 | Friend frontend handover package | IN_PROGRESS | `docs/HANDOFF_FRONTEND.md` (draft) | Needs refresh for FE v2 |
| R02 | Staging, client acceptance, runbook, release | PENDING | none | Blocked on backend merges and FE pages |

## Frontend FE00-FE20 (FRONTEND_MASTER section 21)

Branches are based on `3174196` (FE00) and are all unmerged into `develop`. "Data layer" means typed module APIs (`src/modules/<name>`) with HTTP and fixture adapters, Zod schemas, status maps and unit tests; no route pages.

| FE | Workstream | Status | Readiness | Branch / evidence | What is missing |
|---|---|---|---|---|---|
| FE00 | Preflight, source/decision audit, conventions | DONE (docs) | n/a | `3174196` on all `feat/fe2-*` branches (not in `develop`): `docs/FRONTEND_MASTER.md`, `docs/frontend/CONVENTIONS.md`, `src/lib/api/{result,mode}.ts` | Merge to `develop` |
| FE01 | Foundation: tokens, shells, i18n config, primitives | IN_PROGRESS | NONE (no data) | `feat/fe2-a` `b3faa17` "wip ... unverified snapshot": `src/components/{ui,shared}`, `src/i18n/*`, `src/proxy.ts`, messages en/te/hi. The fe2-a worktree also holds uncommitted changes (package.json, tests, REVIEW_NEEDED.md) | Verified commit (lint/typecheck/test/build), merge into FE branches. Cross-review findings in XREVIEW-b (tone vocabulary, stepper landmark, ErrorSummary IDs, PhoneInput) |
| FE02 | Public pages (landing, about, story, FAQ, contact, legal) | IN_PROGRESS | NONE (static/draft copy) | `feat/fe2-a`: 20 files under `src/app/[locale]`, `src/components/public` | Approved client copy; te/hi fluent review; verified build |
| FE03 | Auth, role selection, restricted routing | IN_PROGRESS (logic done, no pages) | FIXTURE | `feat/fe2-b` `e4715d1`, `4120d8f`, `029eb74`: `src/modules/auth` (schemas, `requireRole`/`requireSession` guard, cookie session, login/signup/OTP/logout flows and server actions, safe redirect), 160 unit tests passing in fe2-b | `/login`, `/signup`, recovery and denied pages (waiting for the FE01 merge). HTTP targets unmerged I01 (email+password); phone OTP returns `gated`. E2E specs are `test.describe.fixme` |
| FE04 | Patient questionnaire, addresses, family, documents | IN_PROGRESS (logic done, no pages) | FIXTURE | `feat/fe2-b`: `src/modules/onboarding/{patient,wizard,form-models,loaders,flows,actions}.ts` | Wizard pages. Draft read/save contract missing (HTTP `gated`); `POST /api/onboarding/patient` body unagreed; family grants and patient document upload have no backend |
| FE05 | Four provider onboardings, review states, profile at a glance | IN_PROGRESS (logic done, no pages) | FIXTURE | `feat/fe2-b`: `src/modules/onboarding/{provider,readiness,visibility}.ts` | Pages. I02 stores only display name/description and documents; category sections return `gated` over HTTP |
| FE06 | Admin verification queue and coverage | IN_PROGRESS (logic done, no pages) | FIXTURE | `feat/fe2-b`: `src/modules/verification/{status,queries,flows,actions,http,fixture}.ts` | Pages. Queue list, `changes_required`, coverage and signed-URL contracts missing (HTTP `gated`) |
| FE07 | Directory and provider profiles | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-c` `84d36cf`: `src/modules/{providers,catalog}` | Pages; C01 merge |
| FE08 | Booking wizard, accept/decline, timeline | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-c` `2e4eee2`: `src/modules/bookings` (schedule/review logic) | Pages; B01 merge plus H1-H3 fixes |
| FE09 | Patient dashboard, booking detail, navigation | PENDING | NONE | Only supporting modules on `feat/fe2-c` | Pages |
| FE10 | Doctor dashboard, travel, arrival OTP, visit context | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-d` `1762d67`, `5e0981b`: `src/modules/doctor` | Pages. HTTP adapter sends no bearer token (XREVIEW-b D1); list/detail/OTP contracts missing |
| FE11 | Clinical editor (five steps), sign/amend, autosave | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-d`: `src/modules/clinical` (draft reducer, autosave, finalize flow, `FEATURE_CLINICAL` gate) | Pages; no consultation backend; clinical sign-off |
| FE12 | Records, verification history, QR/photo/PDF, payment state | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-d`: `src/modules/records` | Pages; no backend for records, facts, photos or PDF |
| FE13 | Lab manager/technician, orders/collections/reports | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-e` `fe52f2a`: `src/modules/lab` | Pages; S01 backend |
| FE14 | Ambulance operator/driver, fleet, scheduled trips | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-e`: `src/modules/ambulance` | Pages; S01 backend |
| FE15 | Caretaker/agency, assignments, shifts | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-e`: `src/modules/caretaker` | Pages; S01 backend |
| FE16 | Payments, cancellation, notifications, support | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-c`: `src/modules/{payments,support,notifications}` | Pages; P01 and D-POL policy approval |
| FE17 | Admin content/FAQ/stories, support, audit | IN_PROGRESS (data layer) | FIXTURE | `feat/fe2-e` `b71e9b5`: `src/modules/{admin,content,audit}`, org switcher, role guards | Pages; content and audit backend |
| FE18 | Optional motion, WhatsApp, assistant, memberships | PENDING | NONE | none | Approvals; P2 |
| FE19 | Translation, a11y, responsive, E2E regression | PENDING | NONE | E2E specs exist as `test.describe.fixme` on `feat/fe2-b` (`tests/e2e/*.spec.ts`), `feat/fe2-c`, `feat/fe2-d`. No spec has run; `@playwright/test` arrives with FE01 | Pages, Playwright install, fluent te/hi review |
| FE20 | Staging handover, inventory, client UAT | PENDING | NONE | none | Everything above |

Only fe2-b's test result (lint, typecheck, 160 Vitest tests) was executed and observed by the author of this ledger. Other branches' test claims come from their commit messages.

## Doctor consultation DC01-DC14

All clinical features stay behind `FEATURE_CLINICAL` (default off) and synthetic data only. "Frontend" refers to `feat/fe2-d` (`src/modules/{doctor,clinical,records}`) unless stated otherwise.

| DC | Capability | Backend status | Frontend status | Frontend readiness | Notes |
|---|---|---|---|---|---|
| DC01 | Assigned-doctor authorization | IMPLEMENTED_UNVERIFIED (B01 assignment, PR #4) | IN_PROGRESS (data layer) | FIXTURE | B01 H1: `is_assigned` time check is a no-op (open). Frontend guard duplicates `requireRole` (XREVIEW-b D4) |
| DC02 | Arrival OTP | PENDING (B01 has `arrive` without OTP) | IN_PROGRESS (`doctor/otp.ts`) | FIXTURE | `verify-arrival` contract unagreed; HTTP returns `gated` |
| DC03 | Real-time patient progress | PENDING | IN_PROGRESS (`doctor/timeline.ts` reducer) | FIXTURE | No realtime channel |
| DC04 | Vitals and examination notes | PENDING | IN_PROGRESS (`clinical/schemas.ts`, `editor.ts`) | FIXTURE | Approved clinical validation ranges missing |
| DC05 | Draft autosave/recovery | PENDING | IN_PROGRESS (`clinical/autosave.ts`, `draft-machine.ts`) | FIXTURE | In-memory only, no browser storage |
| DC06 | Clinical assessment | PENDING | IN_PROGRESS | FIXTURE | |
| DC07 | Finalized record and amendment | PENDING | IN_PROGRESS (`finalize-flow.ts`) | FIXTURE | Amend route uncontracted (`gated`) |
| DC08 | Structured prescription | PENDING | IN_PROGRESS | FIXTURE | Clinical sign-off required |
| DC09 | Patient consultation view | PENDING | IN_PROGRESS (`records`) | FIXTURE | Drafts never shown as records |
| DC10 | Independent payment collection status | PENDING (P01 design only) | IN_PROGRESS (`records` collection) | FIXTURE | `POST /api/bookings/:id/collection` not implemented |
| DC11 | Health fact verification history | PENDING | IN_PROGRESS (`records/logic.ts`) | FIXTURE | "Doctor verified" requires attribution and evidence |
| DC12 | Privacy-safe QR proof | PENDING | IN_PROGRESS | FIXTURE | Opaque 32-hex token; public view allow-listed |
| DC13 | Consent-based optional photography | PENDING | IN_PROGRESS | FIXTURE | No storage contract |
| DC14 | PDF report | PENDING | IN_PROGRESS (`clinical/pdf.ts`) | FIXTURE | Link-issuing DTO unspecified (`gated`) |

## Rules
- Owner initially directs both frontend and backend; do not assume the friend is already working.
- Every agent gets an exclusive file scope and a separate worktree; no two agents edit the same files.
- Record task ID, branch, base commit, commits, changed files, dependencies, acceptance criteria, test evidence, blockers and next action.
- One designated migration author at a time.
- Merge backend PRs in stack order I01 → I02 → C01 → B01, retargeting to `develop` after each parent merges, and only when the owner says so.
- A frontend item moves past `FIXTURE` only after its backend contract is merged and an integration test against a real local stack passes.
- Cut optional features before cutting security or test requirements.

## v2.3 pre-start decision and acceptance tasks

| ID | Task | Owner | Status | Required evidence |
|---|---|---|---|---|
| D-POL | Mixed-payment, hybrid cancellation, shared support and coverage mechanics | Client/product + finance/operations | PENDING | Signed per-service policy matrix |
| D-WF | Agent/editor workflow | Project owner | RESOLVED 2026-11-17 (see DECISIONS) | Dated owner decision |
| D-CLIN | DC01-DC14 November 23 acceptance (staging vs public/clinical enablement) | Client + clinical lead | Order RESOLVED (core first); Nov 23 acceptance list OPEN | Item-level accepted/deferred list and clinical sign-off owner |
| D-PRIV | Health-data notices, retention, consent, minors, vendor roles | Client + legal/privacy reviewer | PENDING | Dated applicability matrix and approved forms |
| T-NEG | End-to-end negative/security/availability tests per journey | Engineering agent + reviewer | PENDING | `docs/TEST_EVIDENCE.md` references |

Use `docs/ACCEPTANCE_AND_TEST_MATRIX.md` for criteria. Owner items still open per the 2026-11-18 handoff (`origin/docs/handoff-2026-11-18:.context/activeContext.md`): Q02-Q05, Q07, Q09, Q10.
