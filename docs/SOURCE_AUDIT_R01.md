# R01 Source Audit and Conflict Reconciliation

| Field | Value |
|---|---|
| Task | R01, independent source audit (design docs only) |
| Agent | Kiro CLI |
| Branch / base | `task/R01-source-audit` at `137e002` (same commit as `develop` and `main`) |
| Date | 2026-11-17 (Tuesday) |
| Status | Draft for Claude review. Nothing here is an owner, client, legal, clinical or tax approval. |
| Scope | Read-only analysis. No code, SQL, schema docs or package files touched. S00 schema work belongs to Codex. |

## 0. How to read this document

### 0.1 Source abbreviations

| Abbrev. | File |
|---|---|
| RM | `README.md` (root, labelled v2.3) |
| DEC | `docs/DECISIONS.md` |
| PSA | `docs/PRESTART_AUDIT_v2.3.md` |
| BRM | `docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md` |
| POG | `docs/PRIVACY_AND_OPERATIONS_GATES.md` |
| ATM | `docs/ACCEPTANCE_AND_TEST_MATRIX.md` |
| SI | `docs/SOURCE_INVENTORY.md` |
| PR | `docs/specs/PRODUCT_REQUIREMENTS.md` |
| BC | `docs/specs/BOOKING_AND_CONSULTATION.md` |
| ROP | `docs/specs/ROLE_ONBOARDING_AND_PERMISSIONS.md` |
| DBS | `docs/specs/DATABASE_SCHEMA.md` |
| SA | `docs/specs/SYSTEM_ARCHITECTURE.md` |
| TS | `docs/specs/TECH_STACK_AND_SUBSCRIPTIONS.md` |
| AIW | `docs/specs/AI_WHATSAPP_AND_CLOUD.md` |
| DAI | `docs/specs/DESIGN_ANIMATION_I18N.md` |
| ESM | `docs/specs/EXISTING_SITE_AND_MIGRATION.md` |
| CHO | `docs/specs/CLIENT_HANDOVER_AND_OPERATIONS.md` |
| ROD | `docs/specs/RISKS_OPEN_DECISIONS.md` |
| DDP | `docs/specs/DAY_BY_DAY_PLAN.md` |
| D15 | `docs/specs/DECISIONS_V1_5_ORIGINAL.md` (D01–D29) |
| R15 | `docs/specs/README_V1_5_ORIGINAL.md` |
| MB15-N | `docs/specs/MASTER_BLUEPRINT_V1_5_ORIGINAL.md`, the "v1.5 CONSOLIDATION NOTICE" at the top |
| MB13 | `docs/specs/MASTER_BLUEPRINT_V1_5_ORIGINAL.md`, the inherited v1.3 body below the notice |
| BP11 | `docs/source/SureCureVisit_Master_Blueprint_v1.1.md` |
| API15 / IT15 / AC15 / PM15 / RC15 / TK15 / DS15 / FI | v1.5 originals in `docs/specs/`: API contracts, implementation tasks, agent coordination, permissions, release checklist, toolkit, design, file index |

Other current files cited for consistency checks: `docs/IMPLEMENTATION_TASKS.md` (IT), `docs/FEATURE_STATUS.md` (FS), `docs/SESSION_LOG.md` (SL), `docs/SCHEMA_RECONCILIATION.md` (SR, read only), `docs/API_CONTRACTS.md` (API), `docs/MASTER_BLUEPRINT.md` (MB), `docs/AGENT_COORDINATION.md` (AGC), `docs/RISKS_AND_BLOCKERS.md` (RB), `docs/RELEASE_CHECKLIST.md` (RC), `docs/HANDOVER.md`, `CLAUDE.md`, `.context/activeContext.md`, `.claude/skills/*`, `.claude/settings.json`.

### 0.2 Conflict hierarchy as applied

From RM §3 "Conflict hierarchy":

| Level | Source | Governs (per RM) |
|---|---|---|
| L1 | Latest direct owner instruction | Everything |
| L2 | Root README (RM) | Execution workflow and human/agent arrangement |
| L3 | Latest v1.5 product handbook | Product scope and decisions |
| L4 | DEC and approved architecture decisions | |
| L5 | v1.3 kit | Where not in conflict with RM |
| L6 | v1.1 blueprint | Historical/technical reference |

Interpretations I applied. Claude should confirm them:

1. **L1 evidence.** Owner answers recorded in DEC "2026-11-17 Owner decisions at setup" and the start record in SL "R00 reconnaissance (explicit start received)" count as L1. Other DEC entries count as L4.
2. **v2.3 supplements** (PSA, BRM, POG, ATM) are addenda to RM (RM "V2.3 PRE-START REVIEW"), so they rank with L2.
3. **"v1.5 handbook"** means R15, D15 and the detailed specs. MB13 is v1.3 text. MB15-N says it is "a detailed historical technical reference" that loses wherever it conflicts with the v1.5 files, so MB13 ranks at L5.
4. **Scope questions.** RM gives product scope to L3, but RM §4 repeats a scope list copied from MB13/BP11 §1. On scope, v1.5 therefore outranks the RM §4 list. Release *gates* (feature flags OFF, real-patient bans) are safety rules that every level repeats, so no level overrides them.
5. RM §3 says that if sources disagree on healthcare policy, business or legal identity, payment rules, scope, privacy or safety, nobody silently picks a winner; the conflict goes to DEC. The "Owner decision needed" column below marks those cases.

### 0.3 Source integrity verified during this audit

- SHA-256 and byte sizes for all 10 entries in `docs/source/SHA256SUMS.md` match the committed git blobs (`git show HEAD:<path>`).
- All 20 `docs/` Markdown entries in `docs/source/SureCureVisit_v1.5_original_kit.zip`, plus its README, FILE_INDEX, DESIGN, four `SKILL.md` files and `.claude/settings.json`, are byte-identical to the extracted copies.
- `docs/API_CONTRACTS.md` is byte-identical to `docs/specs/API_CONTRACTS_V1_5_ORIGINAL.md`, so the "current" API contract has never been reconciled.
- The only change between v1.5 `DESIGN.md` and root `DESIGN.md` is one updated link path.
- BP11 matches the MB13 body except for: the version line, one sentence in §3 about production releases, the §9 file list, and §15 (dual-agent text, added in v1.3).

---

## 1. Conflict register

Columns: **Winner** is the source that wins under §0.2. **Owner decision needed** is what remains open even after the winner is applied.

### 1A. Release scope

| ID | Topic | Source A | Source B | Winner | Owner decision needed |
|---|---|---|---|---|---|
| CR-01 | DC01–DC14 consultation capabilities for Nov 23 | BC "Requested 14 consultation capabilities" ("All 14 are requested for the Nov 23 milestone"); DDP "Delivery tiers"; D15 "Conflict resolution note"; MB15-N ("old v1.3 section that listed clinical work as deferred is superseded as planning priority") | MB13 §1 and BP11 §1 "Release contract → Deferred: … clinical records/prescriptions"; RM §4 "Separately gated…" paragraph | **L3 (v1.5)** keeps all 14 as planning targets. **L1 D-CLIN** (DEC 2026-11-17 setup) sets the order: core booking first, then DC01–DC14 on synthetic data. Every level keeps real-patient activation gated. | Yes. The client's item-level list of what counts as accepted on Nov 23 versus "demonstrated in synthetic staging" (BRM Q7, PSA blocker 1). Also the name of the clinical governance approver (PSA blocker 4). IT still shows D-CLIN as PENDING. See IC-01: RM misattributes this conflict. |
| CR-02 | Recurring caretaker care plans / multi-shift | PR "Caretakers and agencies" (care plan, per-shift check-in/out, renewal); BC "Service-specific adaptations → Care"; IT15 S02 "Care plan/shifts"; DDP Day 5 "caretaker shifts" | RM §8 Caretaker ("Recurring shifts are later scope"); MB13 §6 ("recurring shifts later"); MB13 §1 deferred "advanced workforce scheduling" | L3 wins on scope, but v1.5 never dates recurring care to Nov 23, and D15 D14 calls it desired with "prices/benefits not approved". Combined reading: single-engagement care is in scope, recurring plans are deferred. | Confirm that a caretaker booking on Nov 23 means one engagement (hourly or one day) with no recurring plan. |
| CR-03 | Booking for family members / dependents | MB13 §1 ("Basic family profiles may be implemented only if authorization tests pass"); MB13 §6 Patient ("self/dependent booking") | PR Patient ("permitted household members/dependent relationships", "minor/guardian workflow distinct"); ROP questionnaire "Family section"; DBS `bookings` "actual patient (family)" | Sources agree on direction. RM §4 allows basic family profiles once authorization/consent tests pass. | Yes. Is dependent booking in the Nov 23 scope, and what are the minor/guardian rules? Guardian and consent rules depend on D-PRIV (legal). See MR-05. |
| CR-04 | GPS / live location | PR Doctors ("optional consented GPS"); API15 `en-route` ("start limited sharing if consented") | RM §4 and §5 (GPS gated, flag default OFF); MB13 §1 (GPS tracking deferred) | Sources agree GPS is optional. RM's flag rule decides: OFF. | No, unless the client asks for GPS on Nov 23. |
| CR-05 | Memberships page | PR public pages include `/memberships`; DAI "Content and IA" includes "Family memberships (only approved claims)" | MB13 §7 ("Do not launch subscription checkout November 23; optionally show informational plans"); D15 D14 and D26 (benefits and prices not approved); ROD "do not sell" | Compatible if the page is informational only, with no prices or benefits. | Yes. Show the page at all before benefits are approved? |
| CR-06 | Lab report release | PR Labs ("authorized clinician/lab reviewer release and private patient report access"); BC Lab ("report independently reviewed and securely released") | MB13 §1 (lab reports deferred); RM §8 Laboratory ("Reports remain private and deferred"); ATM Lab row ("reports separately gated") | All sources require authorized review before release, and none dates it. Gate stays OFF. | Name the authorized report reviewer role (see CR-32). |
| CR-07 | Pay-after "receipts" | RM §13 Phase 6 ("Pay-after collection records and receipts"); MB13 §7 ("patient receipt and dispute path") | BC "Shared booking lifecycle" ("Invoice and receipt depend on actual legal supplier…; confirmation is not receipt"); D15 D23 and D25; BRM Money row ("No invoice/receipt conflation"); ATM pay-after row ("invoice not fabricated") | **L3 + v2.3 supplements.** Before D25 is decided, record collection only; do not issue or label a receipt or invoice. | Yes. Legal issuer, invoice and receipt rules per payment path (D25, BRM Q1–Q3). |
| CR-08 | Contents of the Nov 23 acceptance list | RM §4 "Initial acceptance candidate" (copied from MB13 §1) | D15 D10 (en/te/hi), D11 (`#` IDs), D12 (accept → OTP chain), D13 (mandatory questionnaire), D15 (floating WhatsApp button) | L3 adds these items to the scope. RM mentions them in other sections but leaves them off its acceptance list. | Yes. One signed Nov 23 checklist (BRM Q7). The baseline in §2 is my proposed version. |
| CR-09 | Nov 23 production vs staging | MB13 §10 Nov 23 ("launch only if gates pass"); R15 §10 ("Staging or production only according to release gates") | RM header and §4 ("acceptance/staging candidate"); POG "November 23 milestone separation" (four levels) | **L2 (v2.3)**. Nov 23 is a staging/acceptance candidate, and production needs a separate authorization. | No new decision. The client must accept the framing. |

### 1B. States

| ID | Topic | Source A | Source B | Winner | Owner decision needed |
|---|---|---|---|---|---|
| CR-10 | Shared booking lifecycle | BC "Shared booking lifecycle": `DRAFT → REQUESTED → ACCEPTED → CONFIRMED → EN_ROUTE → ARRIVED → ARRIVAL_VERIFIED → IN_CONSULTATION → COMPLETED`, with doctor-only states inside the "shared" chain | MB13 §6: `REQUESTED → ACCEPTED → CONFIRMED → IN_PROGRESS → COMPLETED` plus per-category chains. RM §8 merges them: shared chain with `IN_PROGRESS`, plus a doctor sub-lifecycle. | RM §8 is consistent with BC's own "Service-specific adaptations" section, so the RM model applies: a shared status plus category sub-states. How to store this is an S00 decision. | No business decision. Claude records the engineering choice in DEC. Proposed `IN_PROGRESS` mapping: MR-14. |
| CR-11 | `DRAFT` state | BC lifecycle and RM §8 include `DRAFT`; AIW tool `prepareBookingDraft` | MB13 §6 has no `DRAFT` | v1.5 lists it, but the only consumers are AI and WhatsApp, which are optional and flagged OFF. | No. Default: do not persist `DRAFT` in the initial release (MR-15). |
| CR-12 | Doctor arrival states | MB13 §6 Doctor: `confirmed → en route → arrived → visit complete` | BC "Doctor arrival verification" and D15 D12 add `ARRIVAL_VERIFIED` and `IN_CONSULTATION` as separate events | **L3** (D12 is CONFIRMED) | No. |
| CR-13 | Lab states | MB13 §6: `confirmed → collection scheduled → collected → processing → report ready → completed`, with "failed collection" as an exception | BC Lab: `confirms → technician assigned → collector arrives (optional pickup code) → sample collected → processing → report reviewed/released`; PR Labs "failed visit/re-collection" | **L3**. Use the BC chain; keep "failed collection / re-collection" (present in both). The initial release stops before report release (CR-06). | Is the optional lab pickup code in scope? Default: no. |
| CR-14 | Scheduled ambulance states | MB13 §6: `confirmed → assigned → en route → picked up → destination reached → completed` | BC Scheduled ambulance: `driver assigned / arrives / picks up / reaches destination` | **L3**. BC adds an "arrived" step; otherwise the chains match. | No. |
| CR-15 | Caretaker states | MB13 §6: `confirmed → assigned → shift started → shift ended → completed` | BC Care: per-shift check-in/out with attendance evidence; PR adds "patient confirmation" | For a single engagement the two chains are equivalent. Patient confirmation of a shift is part of recurring care (CR-02). | No for a single engagement. |
| CR-16 | When a "booking confirmation" exists | MB13 §6: an accepted online booking holds the resource until payment and becomes `CONFIRMED` on capture; an accepted pay-after booking "confirms immediately" | BC lifecycle ("Upon acceptance … generate … booking confirmation"); SA "Provider acceptance … assign public reference and confirmation"; D15 D23 is PROPOSED | Pay-after: the two sources agree, because accept and confirm happen together. Online (test mode only): MB13/RM hold semantics apply, so no "confirmation" document exists until `CONFIRMED`. | Yes. D23 is still PROPOSED and needs approval. |
| CR-17 | When the booking reference (`#SCV-BKG-…`) is assigned | BC ("Upon acceptance … generate immutable booking reference"); SA (assigned at acceptance) | PR Patient ("request booking, manual approval, reference"), which is ambiguous; AIW Stage 1 (WhatsApp prefill uses a "public reference"); ATM support row (tickets need a booking anchor) | The sources disagree and none defines it. | Engineering default in MR-09 (assign at request). Needs owner OK because it departs from BC/SA. |
| CR-18 | Payment / financial state names | BC "Finalization": `DUE, PAID, PARTIAL, DISPUTED, REFUNDED` | BC "Payments, invoices, cancellation": `NOT_INITIATED, DUE, PROCESSING, PAID, PARTIALLY_PAID, DISPUTED, REFUNDED`. MB13 §7 names only `DUE`. | The fuller BC list is more specific, so it is the starting point. It still lacks failed, expired-hold, waived/written-off and partially-refunded states. | No business decision. S00 defines the enum (MR-19). |
| CR-19 | `INTERRUPTED` and `NO_SHOW` | MB13 §6 (`IN_PROGRESS → INTERRUPTED` "with ops review"; no-show as an exception event) | BC lists both as "valid event/exception states"; RM §8 says "subject to the approved policy" | Agreed that both exist. Their meaning and any fees are undefined. | Yes. No-show charges and provider late cancellation (D15 D26, BRM Cancellation row). The non-financial default is MR-16. |

### 1C. Timeouts and durations

| ID | Topic | Values in sources | Winner | Owner decision needed |
|---|---|---|---|---|
| CR-20 | Request expiry | 30 min "default development assumption" (MB13 §13; RM §8; DEC "Pending client/project decisions"). No other value anywhere. | None. It is a proposal only. | Yes. Approve a value. For scheduled home services, also bound expiry by the requested start time (MR-07). |
| CR-21 | Online payment hold | 15 min (same sources as CR-20) | None. It is a proposal and applies only to the online path, which runs in test mode. | Yes, but only before live payments. |
| CR-22 | Arrival OTP validity, attempts, resends | BC step 2: "short window (proposed five minutes)"; attempt and resend limits required but no numbers given | L3 sets 5 min as a proposal. Limits are undefined. | No business decision. Engineering defaults in MR-20. |
| CR-23 | RPO/RTO | MB13 §3: 24 h / 4 h "for client approval"; v1.5 gives no value | Proposal only | Yes, client, before production. |
| CR-24 | Signed URL / QR token lifetime | RM §7, MB13 §5 and BC say "short-lived" or "expiring" with no value | Undefined | No business decision. Engineering default in MR-21. |

### 1D. Payments and money

| ID | Topic | Source A | Source B | Winner | Owner decision needed |
|---|---|---|---|---|---|
| CR-25 | Pay-after endpoint and actor | MB13 §8 `POST /api/bookings/:id/pay-after-record`; MB13 §7 "provider records collection method/reference" | API15 `POST /api/bookings/:id/collection` ("Assigned provider acknowledgment and audit/reconcile") | **L3** name. Both say the provider records the collection. | No. |
| CR-26 | Platform fee and tax on the booking | MB13 §4 `bookings` includes `platform_fee_paise`, `tax_paise`; MB13 §7 "configurable zero platform fee initially" | ROD open question 4 (monetization not approved); BRM Money row (GST treatment open); D15 D25 OPEN | Zero fee is consistent everywhere. Tax handling is undecided. | Yes, accountant/client. Interim default in MR-18. |
| CR-27 | Online payment timing | MB13 §10 Nov 20 ("Razorpay test integration only if core passes"); RM §13 Phase 6 ("only if core flows are stable") | DDP Day 6 ("payments sandbox/webhook tests"); TS table ("Test Day 5") | Every source treats it as conditional and test mode only, so it is a stretch item. | No. |

### 1E. Roles, workflow and naming

| ID | Topic | Source A | Source B | Winner | Owner decision needed |
|---|---|---|---|---|---|
| CR-28 | Start / authorization gate | R15 header ("PLANNING ONLY"); D15 D20; PM15; AC15; DDP header ("The user has NOT issued START"); RM header ("PRE-EXECUTION / OWNER REVIEW — no development authorized"); DEC v2.3 entry ("not an explicit START instruction"); `.context/activeContext.md` ("waiting for explicit start"); RC v2.3 first item | SL "R00 reconnaissance (explicit start received)"; IT R00 is `DONE_VERIFIED`; task branches exist (`task/F01-foundation`, `task/S00-erd-draft`, `task/R01-source-audit`) | **L1**, as recorded in SL | Yes. Record the start authorization as a dated DEC entry, then update RM header, activeContext and RC. Today the only evidence is one SL line. |
| CR-29 | Agent roles and migration ownership | D15 D18 and D22; AC15 ("Codex is sole owner for migrations", Claude UI / Codex backend); TK15 ("No third AI coding agent"); DDP per-day Claude/Codex split; DBS last paragraph ("Codex primary migration owner"); MB13 §15 | RM §1.2; AGENTS.md; DEC "Owner decisions at setup" (D-WF RESOLVED: Claude orchestrates Codex and Kiro; Antigravity removed); RM §6 ("one designated migration author at a time") | **L1** (D-WF). Codex drafting S00 is consistent with both sides. | Yes, housekeeping: name the designated migration author in DEC. Clear the stale "pending" items: IT D-WF row, PSA blocker 2, DEC v2.3 "Pending user confirmation" bullet, RC v2.3 second item. |
| CR-30 | Role model storage | MB13 §4 `user_roles` (user_id, role; unique pair) | ROP "Organization model" ("Do not store a single mutable `role` column as universal authorization"); DBS `admin_capabilities` | Compatible: `user_roles` is many rows, not one column. Structure is S00's call. | No. |
| CR-31 | Organization member roles | ROP: `owner, manager, doctor, technician, driver, caregiver, billing` | MB13 §5 actors include "Lab authorized reviewer" and "Security admin"; ROP permission matrix has "Lab manager/reviewer"; ROP field catalogue mentions "private dispatcher contacts" | Union of both. ROP's role list lacks a lab report reviewer and a dispatcher. | Yes, if lab report release or a dispatcher is ever enabled. Not needed for the Nov 23 booking core. |
| CR-32 | Admin capability set | PR Administrators: verification / operations / billing / support / CMS | ROP: "Admin verifier", "Admin billing/support"; MB13 §5: "Admin verification", "Admin operations/support", "Security admin (break-glass only if approved)" | Union. Break-glass exists only if approved (POG "if one is implemented"). | Yes. Will break-glass access exist? Default: no. |
| CR-33 | Caretaker naming | "caretaker" (RM, PR `/caretakers`, ROP `#SCV-CARE`, DBS `caretaker_profiles`) | "caregiver" (ROP member role; MB13 resource type); "care" (module names in RM §6 and SA) | No owner decision. Proposal: category value `caretaker`; staff member role `caregiver`; module `care`. | No. Record in DEC. |
| CR-34 | Lab staff naming | ROP member role `technician`; ROP ID `#SCV-TECH-…` | BC "sample collector"; DBS `resources` "lab collector", `collection_assignments` | No owner decision. Proposal: one canonical term, used consistently in UI copy and S00. | No. |
| CR-35 | Locale in routes | RM §6 and MB13 §9: `src/app/(public)/…` with no locale segment | SA: `src/app/[locale]/…`; DAI "Internationalization" (`/en/`, `/te/`, `/hi/`); PR (localized prefixes) | **L3**. RM calls its tree "a suitable target structure". | No. Claude/F01 records it. F01 is in progress on `task/F01-foundation`, so this affects that branch now. |
| CR-36 | Module names | RM §6: `auth, organizations, providers, catalog, coverage, bookings, payments, doctor, lab, ambulance, care, audit` | SA: `accounts, …, visits, clinical, labs, …, assistant, whatsapp, notifications, audit, admin` | No owner decision. Pick one list in F01. | No. |
| CR-37 | API route names and coverage | MB13 §8: `/api/provider/onboarding`, `/providers/:id/services`, `PATCH /api/services/:id/price`, `/bookings/:id/accept`, `/decline`, `/cancel`, `/complete`, `/assign`, `/pay-after-record`, `/files/sign`, `/admin/refunds` | API15 (= current API): `/api/onboarding/provider`, `/api/onboarding/patient`, `/en-route`, `/arrive`, `/verify-arrival`, `/collection`, consultation, support and assistant routes | v1.5 names win where both define a route. The v1.3-only routes (catalog/price management, assignment, completion, file signing) are still needed for the initial scope (IC-09). | No. Update the API contract after S00. |
| CR-38 | Which entities get public `#` IDs | ROP "Public reference format" (`#SCV-DOC`, `#SCV-LAB`, `#SCV-AMB`, `#SCV-CARE`, `#SCV-ADM`; staff optional); D15 D11 ("every non-patient primary provider/admin profile") | DBS gives both `organizations` and `providers` a unique public ref; DBS `organizations.kind` includes `agency` and `clinic`, which have no defined prefix | Undefined. Agreed constants: patients never get a public ID; refs are never used for authorization. | Engineering default in MR-23. No owner decision unless the prefix scheme changes. |
| CR-39 | `organizations.kind = clinic` | DBS lists `lab/ambulance/agency/clinic` | No requirement in PR, ROP or BC describes clinic organizations or clinic onboarding | Undefined. | Low priority. Are multi-doctor clinics in scope for Nov 23? Default: individual doctors only, unless the client says otherwise. |
| CR-40 | Visual identity | MB13 §6 ("teal/navy/white") | DAI ("deep teal / warm ivory / graphite"); DS15 and root `DESIGN.md` hex palette (`#0F5F59`, `#0A857C`, `#17282B`, `#FAF8F2`, `#E9F3F0`, `#B36D20`) | **`DESIGN.md`** (RM §10; L3) | Yes, client brand approval (D15 D29). Not blocking for staging. |
| CR-41 | Delivery order and dates | MB13 §10 (Nov 16–23; no clinical day); DDP and R15 §10 (Nov 17–23; clinical on Day 4, Nov 20) | PSA "Recommended execution order" (clinical after all four journeys); L1 D-CLIN (core first) | **L1 + PSA**. DDP must be rebaselined (RM §13 Phase 0). Day 1 is today and the foundation is not done (DDP Day 1 says "If foundation not done, all later dates shift"). | Yes. The client accepts the revised plan (DDP "Timeline tradeoff"). |

---

## 2. Current scope baseline (proposed)

Status key:
- **IN**: part of the initial acceptance candidate, in staging with synthetic data.
- **IN-SYN**: built and tested in synthetic staging only; real-patient use stays gated.
- **GATED**: may be built behind a server-side flag defaulting OFF, or in test mode only.
- **DEFERRED**: not built for Nov 23; design kept.
- **OPEN**: inclusion depends on an owner/client decision.

This baseline is my reading of the sources. It needs Claude review and client sign-off (BRM Q7) before anyone uses it as the acceptance list.

| # | Capability | Status | Source |
|---|---|---|---|
| 1 | Branded responsive public site, four service categories, how-it-works, provider registration entry | IN | RM §4; MB13 §1, §6; PR "Public guest experience" |
| 2 | Legal pages (`/privacy`, `/terms`, `/refunds`) and About/Story content | IN as structure only. Publishable text is blocked until legal identity and copy are approved. | PR; DAI "Content and IA"; RM §4; D15 D25, D29 |
| 3 | `/stories` and testimonials | IN only with consented, approved stories. Otherwise omit; never fabricate. | PR; CHO "Operational team roles"; ATM row 1 |
| 4 | `/memberships` | OPEN. At most informational, with no prices or purchase. | CR-05 |
| 5 | Emergency 112, visible without login | IN | RM §15; MB13 §7; PR; AIW |
| 6 | English, Telugu and Hindi for navigation, forms, booking, statuses and errors; locale persisted | IN. te/hi need human review before they count as accepted. | D15 D10; RM §10; DAI; ATM Languages row |
| 7 | Real authentication (patient and provider signup/login) | IN. The phone OTP method is OPEN (MR-01). | RM §4; PR Patient; ROP "Identity flow" |
| 8 | Admin invite-only accounts with MFA | IN | ROP step 7; PR Administrators; MB13 §5 |
| 9 | Patient profile and mandatory questionnaire (Unknown/None/No documents valid) before normal booking | IN | D15 D13; ROP; DEC v2.3 entry; POG |
| 10 | Basic family/dependent profiles and booking for a dependent | OPEN. Allowed only if authorization/consent tests pass. | CR-03; RM §4; MB13 §1 |
| 11 | Adult relative record access by consent grant | DEFERRED | PR Patient; ROP; POG |
| 12 | Provider onboarding: doctor, lab, ambulance, caretaker; individual or organization; staff memberships | IN | RM §4; MB13 §1; PR; ROP |
| 13 | Private credential upload, admin verification, rejection with reason, expiry, suspension | IN | RM §4; PR Administrators; ROP; MB13 §6 |
| 14 | Public `#SCV-…` provider IDs; no public patient ID | IN | D15 D11; ROP "Public reference format" |
| 15 | Verified provider search by PIN and category; out-of-area reported honestly | IN | RM §4; PR; MB13 §1; ATM "Discover and request" |
| 16 | Google Maps, PostGIS radius search | DEFERRED (optional) | RM §5; MB13 §3; TS |
| 17 | Service listings with versioned provider-set prices | IN | RM §4; MB13 §1; DBS "Catalog" |
| 18 | Manual request / accept / decline / cancel for all four categories | IN | RM §4; MB13 §1; ATM "Manual acceptance" |
| 19 | Request expiry (value OPEN, CR-20) and atomic non-overlap reservation | IN | RM §8; MB13 §4, §6; BC |
| 20 | Category progress: doctor en-route/arrived; lab collection; ambulance trip; caretaker single engagement | IN | RM §8; MB13 §6; BC "Service-specific adaptations" |
| 21 | Scheduled ambulance only | IN | RM §4; all sources |
| 22 | Emergency dispatch | GATED (disabled) | RM §15; PR; AIW; ROD "Release hold policy" |
| 23 | Recurring care plans / multi-shift | DEFERRED, pending CR-02 | RM §8; MB13 §6 |
| 24 | Patient, provider and admin dashboards | IN | RM §4; MB13 §1 |
| 25 | Pay-after collection record (no receipt/invoice labelling) | IN | RM §4; CR-07 |
| 26 | Razorpay test mode, webhook inbox, reconciliation tests | GATED (test mode; stretch only after core) | RM §9, §13 Phase 6; CR-27 |
| 27 | Live payments, settlement, refunds, payouts | GATED / DEFERRED | RM §4, §15; MB13 §1; BRM |
| 28 | Basic operational audit (append-only events) | IN | RM §4; MB13 §4 |
| 29 | Durable outbox | IN | RM §5; MB13 §3 |
| 30 | Email/SMS delivery of notifications | OPEN (vendor not chosen, MR-02) | DEC pending list; TS "API billing" |
| 31 | Realtime booking status with reconnect/refetch | IN (minimal, non-clinical payload) | RM §5; SA; BC "Real-time patient events" |
| 32 | DC01 assigned-doctor authorization; DC02 arrival OTP | IN-SYN. Part of the doctor booking core under D-CLIN. | BC; DDP Day 3; IT DC01–DC02 |
| 33 | DC03–DC14 consultation workspace, record, prescription, QR, photo, PDF, health-fact verification | IN-SYN after core. Nov 23 acceptance is OPEN (CR-01). | BC; IT DC03–DC14; DEC D-CLIN |
| 34 | Real-patient clinical use, prescription issuance, release of clinical records | GATED | RM §4, §15; BRM sign-off matrix; ROD |
| 35 | Lab report release | GATED | CR-06 |
| 36 | GPS tracking | GATED (OFF) | CR-04 |
| 37 | Subscriptions / family plans purchase | DEFERRED | RM §4; MB13 §7; D15 D14 |
| 38 | Pharmacy | DEFERRED | all sources |
| 39 | Ollama AI assistant | GATED (OFF unless zero-spend verified) | RM §9; TS; AIW; D15 D16 |
| 40 | Floating WhatsApp click-to-chat | IN (optional). Needs a client-owned number. | D15 D15; AIW Stage 1; IT15 X01 |
| 41 | WhatsApp Cloud API automation | DEFERRED | RM §9; AIW Stage 2 |
| 42 | Support tickets / contact | OPEN. API15 defines `POST /api/support/tickets` and D15 D08 confirms shared support, but RM §4 does not list it. Minimum default: contact form plus a booking-linked ticket record. | D15 D08; API15; ATM Support row |
| 43 | Admin CMS for stories/FAQ/notices | DEFERRED. Use repository-managed static content for Nov 23. | PR Administrators; not in RM §4 |
| 44 | Three.js / Anime.js polish | DEFERRED until core is stable (optional) | RM §10, §13 priority list; DAI |
| 45 | Existing curevist.in data migration and DNS cutover | DEFERRED | ESM; CHO; RM §5 |
| 46 | Staging deployment and handover pack | IN | RM §4, §13 Phase 9; CHO "Client acceptance" |
| 47 | Production launch | GATED (separate written authorization) | RM §15; POG level 4 |

---

## 3. Missing requirements and ambiguities that block core booking (DB-free)

Each item states the gap and a recommended default. "Owner" marks defaults that touch business policy and need owner/client confirmation. The rest are engineering defaults Claude can accept. Where an item needs a structural choice, it describes the behaviour only and leaves structure to S00.

| ID | Gap | Why it blocks | Recommended default | Owner? |
|---|---|---|---|---|
| MR-01 | Patient/provider sign-in method. Sources say "phone OTP and supported methods" (PR), "OTP verified" (ATM), but no SMS vendor is chosen (DEC pending list) and India DLT registration is required (TS). | "Real authentication" (RM §4) cannot use phone OTP without a vendor. | Staging: email OTP or magic link through Supabase Auth, with a phone number captured but unverified. Switch to phone OTP once a vendor is approved. Admin: email plus TOTP MFA. | Owner |
| MR-02 | No notification channel for "new request" or "accepted" events (vendor OPEN). | With a short expiry (CR-20), requests expire unseen. | Outbox records every event. Staging delivery is an in-app dashboard badge plus Realtime. An email channel is added after vendor approval. The UAT script tells providers to watch the dashboard. | Owner (vendor) |
| MR-03 | Slot model. Sources mention availability windows, exceptions and `duration_minutes`, but not slot granularity, travel buffers or whether off-window requests are allowed. | The request form and the overlap check both need it. | Patients pick a start time from slots generated within provider availability windows (Asia/Kolkata), on a 30-min grid. Reserved interval = service duration + provider-set travel buffer (default 30 min, configurable per service). No off-window requests. | Owner (buffer default) |
| MR-04 | Lead time and booking horizon. | Prevents impossible same-minute or far-future requests. | Per-service config: minimum lead time 2 h, maximum horizon 30 days. Proposal only. | Owner |
| MR-05 | Who the booking is for (CR-03). | Determines the questionnaire precondition, consent text and RLS. | Initial release: self, or a dependent profile created and managed by the account holder (booker attests authority). The actual patient's questionnaire must be complete. Linked adult accounts and shared access: deferred. | Owner + legal (D-PRIV) |
| MR-06 | Coverage rule per category. "PIN eligibility" is stated but not which address is checked for ambulance (pickup or destination). | Needed by the server-side eligibility check. | Doctor, lab, caretaker: the service-address PIN must be in the provider's active coverage. Ambulance: the pickup PIN must be covered; the destination is unrestricted but shown to the provider before acceptance. | Owner (ambulance) |
| MR-07 | Expiry semantics beyond the 30-min proposal. | A scheduled visit requested for 10 min from now could outlive its own start time. | Only offer slots where `requested_start − now ≥ minimum lead time` (MR-04, 2 h), so a usable response window always remains. Then `expires_at = min(created + configured TTL, requested_start − response cutoff)`, with the cutoff smaller than the lead time (e.g. 30 min), so it never expires at creation. Accept is rejected server-side once expired, even if the expiry worker has not run yet. A durable scheduled job moves stale requests to `EXPIRED` and emits events. | Owner (TTL) |
| MR-08 | Multiple concurrent requests by the same patient. | Without a rule, patients can fan out requests and providers waste accept attempts; with too strict a rule, patients cannot shop. | At most one open `REQUESTED` booking per patient profile per category with an overlapping time window. To try another provider, cancel first. Duplicate submissions are deduplicated by idempotency key. | Owner |
| MR-09 | When the booking reference is assigned (CR-17). | Support tickets and WhatsApp prefill need a reference before acceptance. | Assign `SCV-BKG` at request creation, never reuse it, and expect gaps. Call the document a "booking confirmation" only after `CONFIRMED`. | Owner (departs from BC/SA) |
| MR-10 | Which resource is reserved at acceptance for organizations. MB13 has a separate `/assign`; API15 says accept takes an "atomic resource hold". | The non-overlap guarantee needs a concrete resource at accept time. | Individual provider: their single resource is auto-selected. Organization: the accepting manager must pick an available resource in the same transaction. Later reassignment goes through an authorized, audited transition with a patient notice (MB13 §6). | No |
| MR-11 | The same person working under several providers (independent doctor and also an org member, or two orgs). Per-provider resources would let one person be double-booked. | Breaks the double-booking guarantee (ATM "Manual acceptance"). | The overlap constraint must cover the underlying person for human resources and the vehicle for ambulances, across providers. Raise this with S00. | No |
| MR-12 | Price change after request. "Material price change requires patient approval" (RM §8; BC), but "material", the state and the timeout are undefined. | Undefined flows produce stuck bookings. | No price edits on an open request. If the price changes, the provider declines with reason code `PRICE_CHANGED` and the patient re-requests at the current price. Accept fails if the snapshot's price version is no longer what the patient saw. | Owner |
| MR-13 | Ambulance "quote" pricing (PR "transparent quote/base/distance policy"; DBS price unit `quote`). | A snapshot needs a known price at request time. | Initial release: fixed provider-published price per trip type, with optional distance bands defined before booking. Free-form quotes are deferred. | Owner |
| MR-14 | Mapping the shared `IN_PROGRESS` to category sub-states (CR-10). | Dashboards, filters and RLS conditions depend on it. | The booking enters `IN_PROGRESS` on the first category progress event: doctor `EN_ROUTE`, lab collector en route, ambulance driver en route, caretaker check-in. The booking reaches `COMPLETED` only through the category's final step. | No |
| MR-15 | Persisting `DRAFT` (CR-11). | Adds a state with no initial consumer. | Do not persist `DRAFT` in the initial release. Add it when AI/WhatsApp drafts are enabled. | No |
| MR-16 | Exception transitions and actors: `CANCELLED` after acceptance, `NO_SHOW`, `INTERRUPTED`, admin powers. | Needed for the transition table and its negative tests. | Patient may cancel any time before `IN_PROGRESS`. Provider may cancel after acceptance only with a reason code; the cancellation is flagged to admin. Provider may mark patient `NO_SHOW` after scheduled start + 30-min grace. Patients report a provider no-show via support, and admin resolves it. `INTERRUPTED` is set by the provider with a reason; admin resolves it to `COMPLETED` or `CANCELLED`. Admin may cancel or resolve but never accept, start or complete on a provider's behalf (MB13 §6). No fees on Nov 23 (CR-19). | Owner (fees later) |
| MR-17 | Cancellation terms shown before request (BRM; ATM "Support/cancellation") while no policy exists, and BC forbids showing a placeholder as final. | The request form must snapshot "terms". | Snapshot a versioned terms record. In staging, show a "provisional, pending client approval" banner. With pay-after only, there is no money to refund, so no fee logic is needed yet. | Owner |
| MR-18 | Amounts shown and stored while GST/fee treatment is open (CR-26). | The price snapshot and pay-after due amount need defined components. | Amount due = provider-set price as displayed; platform fee 0. Tax is not computed or itemised; record "tax treatment pending". No invoice is issued. | Owner + accountant |
| MR-19 | Payment state enum (CR-18) and the pay-after flow. | The booking/payment separation needs fixed values. | `NOT_INITIATED, DUE, PROCESSING, PAID, PARTIALLY_PAID, FAILED, DISPUTED, REFUNDED, PARTIALLY_REFUNDED, WAIVED`, plus a payment method/path on each record. A pay-after booking moves to `DUE` at `CONFIRMED`. Only the assigned provider's recorded collection moves it to `PAID` or `PARTIALLY_PAID`. A gateway webhook can never set a pay-after record to paid (ATM). | No |
| MR-20 | OTP limits (CR-22). | DC02 negative tests need concrete numbers. | Six digits, 5-min validity, hashed and bound to booking + doctor. Max 5 verify attempts per challenge, max 3 regenerations per visit, 60 s between regenerations. Failures are audited without the code. Lockout escalates to support (BC step 6). | No |
| MR-21 | Signed URL and proof-token lifetimes (CR-24). | Private document access tests need values. | Signed download URLs: 60 s, issued per request after an authorization check. QR proof tokens: revocable, expire 7 days after the visit (DC12, synthetic only). | No |
| MR-22 | Provider status changes after acceptance (suspension or document expiry before the visit). | An unverified provider could otherwise perform a confirmed visit. | Suspension: block new acceptances immediately, auto-cancel future bookings with patient notice and an admin event. Document expiry: block new acceptances; existing bookings go to an admin review queue. | Owner |
| MR-23 | Public reference scheme (CR-38). | IDs are immutable, so the scheme must be right on day one. | Store the value without `#` and display it with `#`. Prefix by provider category, applied to the provider entity (individual or organization-owned). Organizations without a category of their own get no public ID for now. Zero-padded to 6 digits, allowed to grow. One race-safe counter per prefix (DBS `public_reference_counters`). | No |
| MR-24 | Address disclosure before acceptance ("limited locality", MB13 §5). | Booking list queries and RLS need the exact field set. | Before acceptance the provider sees PIN, city and locality name only, with no street, phone or patient name beyond first name. After acceptance, only the assigned personnel see the full address and contact. | No |
| MR-25 | Decline/cancel reasons. | Free text risks medical content in logs and events. | Fixed reason codes plus an optional short note marked "no medical details". Notes are excluded from notifications. | No |
| MR-26 | Who marks `COMPLETED`, and whether the patient must confirm. | Final transition actor. | The assigned provider marks completion. The patient can dispute through support. No patient confirmation gate on Nov 23 (recurring care confirmation deferred with CR-02). | No |
| MR-27 | Reschedule. | No source defines it. | Not supported in the initial release: cancel and request again. | Owner |
| MR-28 | Emergency intent during ambulance or doctor booking. | ATM: "Emergency claim/booking not possible while dispatch disabled". | Ambulance and doctor request forms start with an "Is this an emergency?" step that links to 112 and blocks the form for that path. | No |
| MR-29 | Lab collection mode (home vs branch walk-in). PR and DBS imply both. | Address and coverage rules differ by mode. | Home collection only for Nov 23. Branch walk-in deferred. | Owner |
| MR-30 | Caretaker engagement unit for Nov 23 (CR-02). | Pricing units hour/day/week/month all appear (PR). | Hour or day units only, one contiguous engagement per booking. Week, month and recurring units deferred. | Owner |
| MR-31 | "Questionnaire complete" definition and later edits. | Booking precondition. | Complete = all seven ROP items answered (Unknown/None count). Edits create new versions. Bookings check completeness at request time and do not snapshot health data. | No |
| MR-32 | Idempotency key scope and retention. | Retried creates and accepts must be safe. | Key unique per requester + operation. Retained at least 24 h. A replay returns the original result. State-changing calls also require the current `version`, and a mismatch returns 409. | No |

---

## 4. Risks to the Nov 23 staging target (ranked)

Today is Tuesday Nov 17. Nov 23 is six calendar days away. The repository holds one documentation commit (`137e002`) and no application code (SL "R00").

| Rank | Risk | Evidence | Impact if unmanaged | Mitigation |
|---|---|---|---|---|
| 1 | The canonical schema (S00) is not yet approved, and every database-backed feature depends on it | SR "Status: NOT STARTED"; RM §7 (owner approves before first migration); `task/S00-erd-draft` just branched | Each day of delay pushes back auth, onboarding, booking and RLS tests. Late approval forces rework | Timebox S00 to initial-release tables only (SR output 1). Owner reviews the same day. Defer clinical, subscription and payment-ledger tables to later migrations |
| 2 | No signed Nov 23 acceptance list; key client decisions missing | BRM Q1–Q7; PSA blockers 1, 3–6; DEC "Still OPEN: D-POL, D-PRIV …"; CR-01, CR-08 | Without an agreed definition of "met", the milestone cannot be accepted, and DC01–DC14 work may crowd out core booking | Send the §2 baseline and the "Owner" items from §3 to the client as one decision sheet. Engineering defaults (Owner? = No) proceed. Every "Owner" default stays an open proposal until the named approver explicitly accepts it; silence is not approval, and legal/accountant items need explicit sign-off |
| 3 | Scope volume: four categories, onboarding, verification, booking, three dashboards, three languages, plus DC01–DC14, from zero in six days on a ₹10,000 fee | ROD "Severe feasibility warning"; DDP "Not defensible to guarantee all"; RM §13 priority list | Shallow implementations without negative tests, which by ATM's own rule do not count as done | Follow RM §13 priority order and D-CLIN. Build one complete doctor journey end to end, then clone the pattern for lab, ambulance and caretaker. Cut animation, AI, CMS and online payments first |
| 4 | Staging infrastructure not provisioned or owned | SL: Supabase CLI not installed, no Supabase MCP, `vercel` and `gh` not installed; RM §5 (client-owned accounts after approval); CHO (client owns Vercel/Supabase) | No staging deployment means no client acceptance. Using the developer's own accounts conflicts with client ownership expectations | Decide this week who owns the staging Supabase and Vercel projects (owner decision). Install the Supabase CLI. The Docker client is present (`docker --version` 29.6.2), but whether the daemon runs is unverified. Use local Supabase for RLS tests so agents never share a mutable dev DB |
| 5 | Phone OTP and notifications have no vendor | MR-01, MR-02; TS DLT note | "Real authentication" and timely provider responses fail in UAT | Email-based auth and dashboard notifications for staging (MR-01/02). Disclose this in acceptance notes |
| 6 | Contradictory or stale governance docs mislead agents | CR-28, CR-29; IC-01 to IC-06 below; `.claude/skills/*` are unchanged v1.5 originals | Agents may refuse to start, follow the Claude-UI/Codex-backend split, or treat D-WF/D-CLIN as open | Claude applies the IC fixes in one docs commit before the next round of delegated tasks |
| 7 | Parallel branches on an unapproved contract | Worktrees exist for F01, S00 and R01 off the same base; CR-35 (locale routing) and CR-36 (module names) affect F01 directly | Rework when the S00 and API decisions land | F01 limited to scaffold, CI, i18n shell and tokens with no data access. Record the CR-35 and CR-36 decisions before F01 merges |
| 8 | te/hi translations need human reviewers who are not identified | DAI; ATM Languages row; RC "verified by human reviewers" | Languages cannot count as accepted | Ship stable keys and machine-drafted strings marked "unreviewed" in staging. Name reviewers in the decision sheet |
| 9 | Brand, legal and content assets missing (logo, legal entity, approved copy, stories) | D15 D25, D29; RM §4 | Public pages are sparse or placeholder-only. Legal pages cannot be published | Neutral placeholder treatment clearly marked as staging. No invented copy or claims |
| 10 | Tool and model limits | SL: Claude Code 2.1.296 (below the 2.1.321 Fable 5.2 needs); Kiro MCP settings failed to load | Slower orchestration; Kiro cannot use Context7/Playwright through MCP in some sessions | Update Claude Code if desired. Kiro tasks avoid MCP dependence or report the limitation |
| 11 | Clinical (DC) work takes time from core verification | CR-01; DDP Day 4 marked "high risk" | Core booking negative tests skipped | DC work starts only after the core doctor journey passes ATM negative tests (D-CLIN) |
| 12 | Existing curevist.in data and migration expectations | ESM; ROD question 10 | Low for Nov 23 if the client accepts migration as deferred | State it as deferred in the acceptance sheet |

---

## 5. Inaccuracies and internal inconsistencies in the pack

| ID | Location | Problem | Suggested correction (for Claude to apply; R01 edits no other file) |
|---|---|---|---|
| IC-01 | RM §4 "Scope conflict…" and §13 Phase 7 ("v1.5 release-contract blueprint"); DEC "Clinical consultation scope / release conflict (OPEN)" ("v1.5 consolidation/release-contract blueprint"); SL v2.2 entry ("the v1.5 conflict"); RB and IT DC preamble repeat the framing | They treat the clinical deferral as a v1.5 source. That text is MB13/BP11 §1 (v1.1/v1.3). MB15-N in the same file says the deferral "is superseded as planning priority", and D15's conflict note says the same. v1.5 already resolved the planning conflict; only the client acceptance question is open. | Reword as "v1.1/v1.3 release contract (inherited in MB13) vs v1.5". Keep the OPEN item limited to the client acceptance list. |
| IC-02 | RM header "PRE-EXECUTION / OWNER REVIEW — no development authorized"; RM §0; DEC v2.3 first bullet; `.context/activeContext.md`; RC v2.3 first item; README_START banner | All of these contradict SL "explicit start received", R00 `DONE_VERIFIED` and the live task branches. | Add a dated DEC entry recording the start. Update the status lines. |
| IC-03 | IT rows D-WF and D-CLIN (`PENDING`); PSA blocker 2; DEC v2.3 "Pending user confirmation" bullet | DEC "Owner decisions at setup" marks D-WF RESOLVED and D-CLIN RESOLVED (scope order). | Mark D-WF resolved. Split D-CLIN into "order: resolved" and "Nov 23 acceptance list: open". |
| IC-04 | RM §3 hierarchy ("This v2.2 master README"); SI "Pack version: 2.2"; MB "Current execution contract: README.md v2.2"; HANDOVER "(v2.2)"; FS snapshot "v2.2"; `docs/specs/README.md` ("governing v2.2 execution contract") | RM is labelled v2.3. | Align version labels to v2.3. |
| IC-05 | FS "Schema reconciliation crosswalk: DONE_VERIFIED" | SR header says "Status: NOT STARTED". SR contains a candidate crosswalk, but none of its 10 required outputs exist. | FS: "Candidate crosswalk drafted; canonical ERD PENDING (S00)". |
| IC-06 | SI "Historical conflicts and precedence": "The owner later explicitly authorized development" | RM §0 says the review "cannot independently establish that authorization". SI was written before the setup and start decisions. | Point SI to the DEC start entry from IC-02. |
| IC-07 | RM §7: "Provider exact address/contact is disclosed only after acceptance and only to authorized assigned personnel." | The source (MB13/BP11 §5) says the *provider sees the patient's* exact address/contact only after acceptance. As worded, RM reverses the subject. | "Patient exact address/contact is disclosed to the provider only after acceptance and only to authorized assigned personnel." |
| IC-08 | BC: payment states listed twice with different values | "Finalization" uses `PARTIAL`; "Payments, invoices, cancellation" uses `PARTIALLY_PAID` and adds `NOT_INITIATED` and `PROCESSING`. | Resolve in S00 (MR-19). Leave the source file unedited; it is a preserved original. |
| IC-09 | `docs/API_CONTRACTS.md` (byte-identical to API15) | The current contract has no routes for service/price management, organization staff assignment, completion for non-doctor categories, lab/ambulance/caretaker progress transitions, file signing, or admin cancellation/refund. All of these are in the initial acceptance scope (§2 rows 13, 17, 18, 20). MB13 §8 had several of them. | Rebuild the API contract after S00 (RM §3 item 7 already flags this). |
| IC-10 | RM §13 Phase 6 "Pay-after collection records and receipts" | Conflicts with v1.5 and v2.3 rules on receipts (CR-07). | "Pay-after collection records; receipts/invoices only after D25." |
| IC-11 | BC "Shared booking lifecycle" | Lists doctor-only states as the shared lifecycle, contradicting the same file's "Service-specific adaptations" and RM §8. | Note in S00 state diagrams (CR-10). Source unchanged. |
| IC-12 | RM §4 "Initial acceptance candidate" | Copied from MB13 §1. Omits v1.5 CONFIRMED items (languages, IDs, questionnaire, OTP, WhatsApp button) that RM includes elsewhere (CR-08). | Replace with the approved §2 baseline. |
| IC-13 | `.claude/skills/surecure-security/SKILL.md` ("Read PERMISSIONS.md and blueprint"); `surecure-booking` ("Read blueprint and API_CONTRACTS.md") | Unchanged v1.5 originals. `docs/PERMISSIONS.md` is the agent-autonomy policy; data-access rules live in ROP. "blueprint" now resolves to MB, an index with no booking detail. | Point the skills to ROP, BC, and SR/S00 output. |
| IC-14 | AGC "Isolation": `feature/*` branches | The live branches use `task/<ID>-…`. | Pick one convention. |
| IC-15 | RM §6 tree lists `docs/DATABASE_SCHEMA.md` and `docs/SECURITY_REVIEW.md` at the docs root | Neither exists there. The schema spec is `docs/specs/DATABASE_SCHEMA.md`, and no security review file exists yet. The tree also lacks the `[locale]` segment (CR-35). | Mark these as "to be created" or fix the paths. |
| IC-16 | FI; R15 navigation table; MB15-N authority list | Reference `docs/PRODUCT_REQUIREMENTS.md`, `docs/BOOKING_AND_CONSULTATION.md` etc. and `scripts/setup-worktrees.sh` at their original v1.5 paths. The files now live in `docs/specs/` and `docs/source/setup-worktrees-v1.3-legacy.sh`. | Expected for byte-preserved originals. Add a path note to `docs/specs/README.md` instead of editing them. |
| IC-17 | `docs/source/SHA256SUMS.md` | Correct for committed blobs, but `core.autocrlf=true` rewrites line endings on Windows checkout. Hashing the working-tree `.md` files therefore gives different sizes and hashes (README v1.5: 17,053 B committed vs 17,195 B on disk). | Add a note: verify with `git show HEAD:<path>`, or add a `.gitattributes` rule (`docs/source/** -text`, `docs/specs/*_ORIGINAL.md -text`) so originals stay byte-exact on disk. |
| IC-18 | `.claude/settings.json` allows `npm run lint/typecheck/build`, `npm test:*` | The package manager is not chosen yet (RM §5 "one package manager/lockfile"). | Align once F01 picks the package manager. |
| IC-19 | DBS last paragraph ("Codex primary migration owner, Claude reviews typed contracts"); AC15 ("Codex is sole owner for migrations") | Superseded by RM §6 ("one designated migration author at a time"), but no current file names the author. | Name the author in DEC (CR-29). |
| IC-20 | IT R00 `DONE_VERIFIED` | ATM "Feature-level evidence rule" requires commit(s), environment, test command, result and reviewer for `DONE_VERIFIED`. The R00 evidence exists only as SL prose, with no TEST_EVIDENCE entry or reviewer. | Add a short evidence entry and name the reviewer. |
| IC-21 | DDP and R15 §10 day labels | DDP's "Day 1 — Tue Nov 17 — Foundation" assumes foundation work today, with Claude on UI and Codex on backend. Both the agent split and the dates are stale (CR-29, CR-41). DDP's own rule ("If foundation not done, all later dates shift") applies. | Rebaseline in IT, not in the preserved original. |

---

## 6. Limits of this audit

- I read every file required by TASK_R01 plus the current governance files listed in §0.1. I did not read `docs/MODEL_SELECTION.md` or `docs/VERIFICATION_REPORT_v2.2.md` beyond what SL summarises, and I did not open the v1.3 or v2.0 ZIP contents. MB13 represents v1.3 here, and I confirmed BP11 matches it apart from the noted lines.
- This document makes no legal, tax, clinical or regulatory determination. Every "Owner" default is a proposal for the owner and client.
- No patient data was used. No code, SQL, schema document or package file was created or changed.
