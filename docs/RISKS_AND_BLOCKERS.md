# Risks and blockers

**Snapshot:** 2026-11-18, from git refs fetched into the `fe2-b` worktree. Each entry cites where the evidence lives. Status ledger: `docs/IMPLEMENTATION_TASKS.md`. Frontend contract gaps in detail: `docs/frontend/REQUESTS.md`.

Severity: **Blocker** = stops integration or a release gate; **High** = likely to cause wrong or unsafe behaviour if ignored; **Medium** = schedule or quality risk.

## Current blockers

### B-1 Backend PRs #1-#5 are unmerged (Blocker)
- `origin/develop` is still at `d532f09` (docs). No backend code is in `develop`.
- Known stacked PRs (`origin/docs/backend-handoff:docs/handoffs/backend/README.md`):

  | PR | Branch | Base | Head |
  |---|---|---|---|
  | #1 I01 identity, roles, orgs, RLS | `task/I01-auth-rls` | `develop` | `1efbab0` |
  | #2 I02 provider onboarding, docs, admin review | `task/I02-provider-onboarding` | I01 branch | `34811b8` |
  | #3 C01 catalog, prices, PIN coverage | `task/C01-catalog` | I02 branch | `373251f` |
  | #4 B01 booking, availability, accept/cancel | `task/B01-booking` | C01 branch | `e8a71ed` |

- **PR #5 is referenced but not identified.** `origin/feat/fe2-a:.context/activeContext.md:4` says "PRs #1-#5 unmerged", but no committed doc names #5's branch or base. Confirm on GitHub before planning merges.
- Effect on frontend: every FE item is at most `FIXTURE`. HTTP adapters target routes that exist only on unmerged branches, and nothing can be marked `INTEGRATED`.
- Merge order is I01 → I02 → C01 → B01, retargeting each PR to `develop` after its parent merges. Migrations were edited in place during review, so reset the local DB before applying. Merge only on the owner's explicit instruction.

### B-2 Competing backend lineages and uncommitted work (High)
- **Friend stack:** `integ/friend-backend` (`05ec926`) ports I02 hardening onto the friend's stack, with new migration numbering (`20261117000600..660`) and a `provider_reference` contract change.
- **Our lineage:** `ours/I02-provider-onboarding` (`21989aa`).
- **B01 fixes:** in progress on `integ/b01-fixes` (`f8d5cf3`, WIP) and `wip/B01-fix-round1` (`7801cbb`, interrupted, unverified).
- The 2026-11-18 handoff (`origin/docs/handoff-2026-11-18:.context/activeContext.md`) records work **uncommitted on disk** in those worktrees and agents that were killed mid-task.
- Risk: frontend adapters are written against PR #1-#4 shapes (e.g. I02 `provider_id`); the friend stack changes catalog identifiers. The owner has to pick one lineage before frontend integration starts.

### B-3 Open B01 review findings (High)
From `origin/docs/backend-handoff:docs/handoffs/backend/README.md`:
- **H1:** `identity_private.is_assigned` time check is a no-op, so the assigned doctor sees the patient's address and phone early.
- **H2:** there is no cancel path without a cancellation policy.
- **H3:** non-doctor categories can be accepted but cannot progress.
- **M1-M6:** clinician assignment without a doctor credential, no dependents, no abuse limits, `lock_provider` serialization, resource upsert leaks, non-scheduler listing.
- These block DC01 (assigned-doctor access) and FE08/FE10 integration.

### B-4 Frontend contract gaps (High)
Logged in `docs/frontend/REQUESTS.md` (R-FE03-01 to R-FE05-03 and other agents' entries). The ones that block pages:
- Phone OTP signup/login is not implemented in I01, which is email+password only (R-FE03-01).
- Tokens come back in JSON; a cookie session or refresher in `src/proxy.ts` is needed (R-FE03-02, R-FE04-02).
- `/api/auth/me` doesn't report draft, submitted or suspended providers, or patient questionnaire completion (R-FE03-03).
- There is no persistence for category onboarding sections, patient draft save/read, review queue, `changes_required`, coverage or signed document URLs (R-FE03-05/08/10/12/13, R-FE04-05).
- `APP_ORIGIN` env name is missing from `.env.example` (R-FE04-01).
- fe2-d's HTTP adapters send no bearer token and are built without an origin (XREVIEW-b D1/D2).

### B-5 Frontend foundation not merged into feature branches (Blocker for pages)
- `feat/fe2-a` is a WIP snapshot (`b3faa17`, "unverified"). It brings `src/components/{ui,shared}`, `src/i18n`, next-intl, Radix, `@playwright/test` and `@axe-core/playwright`.
- Until it is verified and merged, fe2-b..fe2-e cannot build pages. The E2E specs stay `test.describe.fixme`; fe2-b's specs carry a temporary `@ts-nocheck` (R-FE05-01).
- Cross-review XREVIEW-b found shared-component issues to fix first: status tone vocabulary mismatch with fe2-d, stepper `<nav>`, duplicate ErrorSummary IDs, PhoneInput truncation and hidden `+91`, and `GateNotice` accepting only feature flags.

## Content, data and vendor risks

### R-1 Telugu and Hindi copy is unreviewed (High for public launch)
- `src/messages/REVIEW_NEEDED.md` in the fe2-a worktree (uncommitted) states that every `te` and `hi` string was written by an AI agent and that **none has been reviewed by a fluent speaker**.
- Priority review areas: `public.emergency.*` (also needs a clinical/first-aid reviewer), `public.legal.*`, and the payment/cancellation/privacy FAQ answers.
- Also flagged there: "verified" wording, caretaker scope, and the gender-neutral phrasing choices.
- Namespaces for auth, onboarding, admin and the dashboards have no strings yet. They will need the same review.
- Mitigation: treat te/hi as staging-only until a named fluent reviewer signs off. Track per namespace in `REVIEW_NEEDED.md`.

### R-2 No real provider data (Blocker for real bookings)
- There are no verified providers, credentials, schedules, prices or PIN coverage anywhere in the repo. All provider, coverage and catalog records are synthetic fixtures (`src/fixtures/**`, fictional names, `@example.invalid`, placeholder PINs `500001-500003`).
- FRONTEND_MASTER s23 assigns "Service PIN coverage, verified provider credentials and schedules" to provider ops/admin.
- Until they exist: directory pages show empty states, there are no live listings, and fixture data must never appear outside `FRONTEND_ADAPTER=fixture` with the FixtureNotice shown. The fixture adapter is refused when `APP_ENV=production`.
- Also undecided: the provider evidence list per category (the frontend mirrors I02's single required document kind, R-FE03-09), provider renewal policy, four-eyes approval, and coverage horizon (backend handoff "Open owner decisions").

### R-3 Cloudflare is not an approved vendor (Medium)
- The only Cloudflare material is a recommendation on an unmerged branch: `origin/wip/frontend-pause-2026-11-18:docs/SECURITY_EDGE.md`. Its line 3 reads "Status: recommendation only. Cloudflare is **not an approved vendor** yet". `docs/SECURITY_AUDIT_U02.md:20` on the same branch says the same.
- That branch belongs to the owner-rejected demo frontend and must not be merged as is.
- Approved direction (AGENTS.md) is Vercel subject to client ownership, with no unapproved vendors. Any edge, WAF, DNS or DNSSEC, Turnstile or Access setup needs an explicit owner/client decision and an account the client owns.
- If adopted later, the checklist's constraints apply: Full (strict) TLS, no "Cache Everything" on private or RSC routes, origin lock, and CSP changes only where a widget renders.

### R-4 Repository visibility (High)
- The 2026-11-18 handoff states "repo still public". Synthetic data only, but private planning, review findings and security notes are exposed.
- Owner decision needed before any non-synthetic material is committed.

## Verified from supplied material (still valid)
- The detailed v1.5 specs are in `docs/specs/`.
- v1.5 and v1.1/v1.3 schema concepts differ; S00 reconciled them, approved with defaults (`docs/S00_DECISION_SHEET.md`).
- The 17-23 November plan is aggressive; by 18 November no backend is merged and no FE v2 role pages exist.
- All 14 consultation capabilities are requested for November 23, while the release-contract blueprint defers clinical records and prescriptions. D-CLIN acceptance is still OPEN. Real-patient activation stays gated.
- Owner reported an expiring Fable/reset allowance; verify entitlement in the account UI before heavy use.

## Must still verify
- Real Auth/MFA flows, Storage cross-org behaviour over HTTP, staging deployment, signed document URLs. Per the backend handoff these were "never verified".
- CI on `develop` after the first backend merge.
- Existing website source, Firebase inventory, data migration and rollback feasibility.
- Domain/DNS ownership and production account ownership (`surecurevisit.in`).

## Client/business approvals still open
- Legal business identity and approved legal copy.
- Logo and final brand.
- Verified provider coverage and credentials (R-2).
- OTP/SMS/email vendors, consent and costs (affects R-FE03-01).
- Merchant account, settlement, taxes, cancellation and refund policies (D-POL).
- Medical data hosting, retention, consent, minors, and qualified legal/clinical review (D-PRIV, D-CLIN).
- Emergency dispatch operating model (stays disabled; `/emergency` with "Call 112" must keep working).
- Membership benefits/prices and a licensed pharmacy partner (deferred).
- Client-owned hosting, database, monitoring, backups and recovery accounts.
- Edge/CDN vendor (R-3).

## Delivery and release risks
- ₹10,000 is the quoted development fee, not an all-inclusive operations, hosting, legal, SMS, maps or payment budget.
- November 23 is an acceptance/staging candidate, not a guaranteed safe production launch. At this snapshot, the earliest possible state is synthetic-fixture UI plus unmerged backend.
- Real providers and operations must exist before users can book real services (R-2).
- Clinical features, live payments, emergency dispatch, pharmacy, subscriptions, GPS and payouts stay behind release gates (`src/lib/feature-flags`, all default off).
- Agent sessions have been lost mid-task (2026-11-18 handoff). Treat any uncommitted worktree state as unverified until re-checked.
