# SureCure Visit — Complete Project Handbook

**Version:** 1.5 / Consolidated planning edition  
**Updated:** 17 November 2026  
**Target client milestone:** 23 November 2026  
**Status:** **PLANNING ONLY — development has not started.** Do not interpret this kit as a working application. No code execution, provider deployment, database setup, purchase or CLI prompt is authorized by this document alone. User will explicitly say **START** before implementation.  
**Domain:** `surecurevisit.in` (purchased at GoDaddy)  
**Brand:** SureCure Visit. **Legal company name is NOT established.** Do not use or infer any external company affiliation.

## Read this first

This ZIP consolidates the v1.3 dual-agent kit, the later feature decisions and operational safeguards. It contains design/specification markdown files, suggested Claude/Codex instruction files, sample project-level settings and a *future-use* worktree setup script. It is not an app, and is not an assertion of production readiness.

**Navigation**

| Question | Read |
|---|---|
| What is the product and what has been decided? | `docs/PRODUCT_REQUIREMENTS.md`, `docs/DECISIONS.md` |
| All tools: what, why, when, costs? | `docs/TECH_STACK_AND_SUBSCRIPTIONS.md`, `docs/TOOLKIT.md` |
| What's planned for each date? | `docs/DAY_BY_DAY_PLAN.md`, `docs/IMPLEMENTATION_TASKS.md` |
| How do Claude and Codex work together? | `docs/AGENT_COORDINATION.md`, `CLAUDE.md`, `AGENTS.md` |
| Overall architecture, data model and APIs? | `docs/SYSTEM_ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/API_CONTRACTS.md` |
| What happens for every role and booking? | `docs/ROLE_ONBOARDING_AND_PERMISSIONS.md`, `docs/BOOKING_AND_CONSULTATION.md` |
| AI, WhatsApp and cloud reliability? | `docs/AI_WHATSAPP_AND_CLOUD.md` |
| Visual system, animations, three languages? | `DESIGN.md`, `docs/DESIGN_ANIMATION_I18N.md` |
| What can go live and under which conditions? | `docs/RELEASE_CHECKLIST.md`, `docs/RISKS_OPEN_DECISIONS.md` |
| What do I need from the client? | `docs/CLIENT_HANDOVER_AND_OPERATIONS.md` |
| Existing website and migration? | `docs/EXISTING_SITE_AND_MIGRATION.md` |

## 1. Product in one paragraph

SureCure Visit is a responsive, pan-India **healthcare service marketplace** with a public marketing/discovery site and logged-in portals for **patient, doctor, laboratory, ambulance operator, caretaker and admin**. Users choose providers. Providers (individuals or multi-staff organizations) set prices and **manually accept** bookings. The application supports online and pay-after-service billing, provider verification, locality-specific operational coverage, family profiles and potential Free/Plus/Pro memberships, optional caretaker recurring care plans, a later regulated pharmacy integration, an on-site assistant backed by Ollama Cloud *only when truly no-cost quota is available*, and WhatsApp contact/automation. English, Telugu and Hindi are first-class supported languages.

This is primarily a marketplace, **not an already-approved multi-tenant white-label SaaS** product. There is one central business and multiple provider organizations with strict access isolation.

## 2. Confirmed project constraints

| Property | Decision |
|---|---|
| Client project | Real commercial project, not a throwaway prototype |
| Budget quoted | Approximately **₹10,000 development fee**; not a plausible all-inclusive operational budget |
| Deadline | **November 23, 2026** (tight target for client handover) |
| Deployment | Entire production application and database are cloud-hosted, not on developer laptop |
| Developer workflow | **Claude Code CLI + OpenAI Codex CLI** side by side, after one foundation commit; separate Git worktrees |
| Editor | **Google Antigravity strictly as editor/inspector**; its AI agents will not be used |
| Other planning tool | ChatGPT Plus for design/review/planning; not the production API |
| Design | Complete rebranding; distinctive premium healthcare editorial aesthetic; **no generic AI slop** |
| Language | English `en`, Telugu `te`, Hindi `hi` |
| Patient signup | Quick identity creation + **mandatory health-profile questionnaire** (Unknown/None/No documents accepted); profile completion before normal bookings; urgent emergency info not gated |
| Provider onboarding | Detailed role-specific verified profiles; admins never public sign-up |
| Public IDs | Provider/org/staff/account role prefixes such as `#SCV-DOC-000001`; patients use internal UUID, no public patient identifier |
| Coverage | Nationwide website, **only verified and operational providers bookable** by area |
| Money | Mixed online/direct-to-provider payment; hybrid cancellation; mixed provider/client support; monetization undecided |
| Status | Planning only; no app or payments launched |

## 3. The full customer flow

**Visitor:** `surecurevisit.in` → premium homepage → services, About Us, story, real stories/articles, how it works, memberships/FAQs/contact → location search and verified public provider profiles → signup/login only when booking or viewing private info.  
**Patient:** verified account → role-specific onboarding with required health questionnaire and explicit Unknown/None options → dashboard → chooses provider, selects service/time/address, reviews price + policy → REQUESTED → provider ACCEPTS → reference and booking confirmation → physician travels → arrives → patient verifies clinician ID → short-lived OTP → doctor submits OTP → consultation starts → draft notes/vitals/diagnosis/prescription → clinician finalizes → patient gets private record, payment/receipt/status and follow-up.  
**Other services:** labs (orders/collection/report review), ambulance (scheduled transfers; emergency operational release gate), caretakers (shifts and possible ongoing care), with shared booking foundation and service-specific states.  
**Support:** patient/provider support ticket → shared provider or admin resolver → escalations, audit, fair dispute path.

## 4. Why these technologies?

| Layer | Choice | Why | When |
|---|---|---|---|
| Full stack | Next.js App Router, React, TypeScript | Public search SEO plus private dashboards, typed server logic, single repo | Foundation |
| Design | Tailwind, **customized** shadcn/ui, 21st.dev selectively | Accessible forms/tables with bespoke branding; avoid default templates | Foundation through polish |
| Animation | Three.js + React Three Fiber, Anime.js, CSS | Single optional hero 3D experience; focused timelines/scroll effects; CSS for small transitions | After core flows; lazy load and reduced-motion fallback |
| Data | **Supabase Cloud PostgreSQL** + Auth, private Storage, RLS | Relational bookings, organization access and cloud-hosted health records | Foundation |
| Real-time | Supabase Realtime + reconnect/refetch | Patient view updates when assigned provider changes booking/visit status | Doctor workflow |
| Validation | Zod, database constraints and access checks | Reject malformed/unauthorized requests; avoid trusting UI | Every API |
| Payment | Razorpay subject to client merchant approval | India-facing checkout/webhooks and pay-after ledger | Test mode first; production only if reconciled |
| Maps | Google Maps Platform (usage-based) | Addresses, distance and optional transport maps | When coverage/dispatch needs it |
| Chat AI | Ollama Cloud API **free included allowance only** | Hosted model inference not tied to laptop; no paid fallback | Optional, after marketplace works |
| WhatsApp | Click-to-chat then official Meta Cloud API | Easy patient contact, later menu-based automated booking | Button now; bot after approval |
| i18n | next-intl and reviewed locale files | English, Telugu, Hindi with stable message keys | Foundation |
| Hosting | Vercel **Pro** client-owned | Commercial hosting, preview/staging and SSL | Client-approved production |
| Monitoring | Sentry or equivalent; uptime check/alerts | Errors, outages and safety-critical operational failures | Before production |
| CI/tests | GitHub, GitHub Actions, Vitest, Playwright, RLS integration tests | Merge discipline; actual verification not visual-only demos | Foundation and daily |
| IDE/AI dev | Antigravity (editor only), Claude Code CLI, Codex CLI | Dedicated coding agents in separate worktrees | After explicit START |

Detailed rationale, alternatives, subscriptions and indicative INR amounts: **`docs/TECH_STACK_AND_SUBSCRIPTIONS.md`**.

## 5. Roles and distinct dashboards

- **Patient:** self/family profiles, medical questionnaires, address book, discovery, bookings, arrival OTP, real-time timeline, clinical records, invoices/receipts, memberships and support.
- **Doctor:** public profile, medical council proof, specialization and pricing, coverage/availability, accept/decline, travel/arrival/OTP, consultation draft, vitals/examination/diagnosis, structured prescriptions, finalization, reports, payment status and earnings.
- **Lab provider:** organization/branches/team, licensing evidence, catalog/prices, collection staff assignment, order statuses, report review and secure publishing, support and settlements.
- **Ambulance operator:** company/vehicles/drivers/equipment/coverage, scheduled transport quote and assignment, trip progress; emergency dispatch is **not safe merely because code works**.
- **Caretaker or agency:** skills/identity/relevant checks, prices and availability, assignment, daily/weekly/monthly care and shift check-in/out with replacements.
- **Admin:** private invitation only; provider approvals, coverage controls, complaints/escalations, billing/reconciliation, audit and operational content management. Admin roles never automatically grant clinical record read access.

Read **`docs/ROLE_ONBOARDING_AND_PERMISSIONS.md`** for required/optional fields, public/private separation and organization members.

## 6. Financial and business rules

Patients can pay online where enabled or directly after service; track the collection path and never mark direct cash as a gateway payment. Providers set fees; freeze the agreed price on booking. Commission/pricing model *not yet client-approved*. Policies are platform baseline with service-specific exceptions. An accepted request gets **a booking reference and confirmation document**; issuing an invoice and receipt is based on the actual legal supplier, charge and settlement, not simply the acceptance event. Clinical completion and payment remain separate state machines. Real subscription payments require explicit approved plan benefits, subscription terms, merchant and operating economics.

## 7. Identifiers and privacy

Providers get permanent unique human references (`#SCV-DOC-000001`, `#SCV-LAB-000001`, `#SCV-AMB-000001`, `#SCV-CARE-000001`, `#SCV-ADM-000001` internal-only). Bookings `#SCV-BKG-...`, visits `#SCV-VIS-...`, tickets `#SCV-TKT-...`. **Use UUIDs as internal keys**; generated references are immutable/unique and never authorization credentials. Patients still have private internal UUIDs and may receive booking references. Identity and clinical records are kept in private RLS-protected tables/storage with auditable access.

## 8. Doctor consultation details

The captured UI references are **functional inspiration only**, not to be copied visually. The proposed doctor flow is booking acceptance → travel → arrival → OTP activation, doctor enters booking-bound short-lived one-time OTP → authorized consultation starts → autosaved clinical draft → structured observations (units), diagnosis/assessment, prescription, tests, instructions/follow-up → clinician signs/finalizes immutable version → patient views authorized record, optional privacy-safe visit QR, consensual photo and PDF. Do not tie clinical completion to successful collection of cash. Never permit another doctor to access this visit just by guessing its public ID. For deeper specification read `docs/BOOKING_AND_CONSULTATION.md`.

## 9. AI + WhatsApp + 24/7

The live website/db/storage remain hosted in the cloud even when the development laptop is turned off. Ollama local inference would not meet this goal. Managed Ollama Cloud **does not guarantee unlimited free model use**: $0 plan may offer starter credits or pay-as-you-go, according to current pricing; do **not** register a card or enable chargeable inference without owner consent. Design an app-level zero-spend guard and turn AI off if included truly free usage is unavailable/exhausted. Core booking is deterministic and independent of the model. Assist with FAQs and provider discovery; no autonomous diagnosis, prescriptions, payments, emergency triage or unrestricted database reads. WhatsApp begins as a floating click-to-chat button; automation needs a client-owned Meta business account and approved workflows, message cost and consent controls.

## 10. Day-by-day timeline (planning target, not promise)

| Date | Primary emphasis | Exit evidence |
|---|---|---|
| **17 Nov** | Foundation, repo, isolated cloud development/staging plan, UI tokens, permissions/contract | App builds; env validation; initial schema/RLS tests; source controlled |
| **18 Nov** | Public landing/about/stories, 3 languages, signups/onboarding, admin approval | Account journeys working on synthetic data; role isolation tests |
| **19 Nov** | Doctor discovery and request/accept, references, OTP and confirmation | Real backend request → acceptance → arrival verification |
| **20 Nov** | Clinical workspace, autosave, realtime, prescriptions, patient record | One doctor-to-patient visit passes end-to-end tests |
| **21 Nov** | Lab/caretaker/scheduled ambulance, billing/confirmation, support | Core cross-service flows tested or transparently blocked |
| **22 Nov** | AI/WhatsApp optional, animation polish, privacy/security/performance, freeze | Critical tests green, payment test mode, fixes prioritized |
| **23 Nov** | Client acceptance, deployment review, signed handover | Staging or production only according to release gates |

For granular agent ownership, dependencies, acceptance criteria and honest cut lines read `docs/DAY_BY_DAY_PLAN.md`.

## 11. Subscriptions in **Indian rupees**

**Already paid/available to developer:** Claude Code Pro, ChatGPT Plus with Codex CLI, Google Antigravity editor, GoDaddy domain. **No extra development subscription purchase is necessary.** Existing renewals are not free.  
**During development:** GitHub Free and Supabase Free are viable with synthetic test data (limitations apply).  
**Commercial release:** Vercel Pro $20/mo ≈ **₹1,878** and Supabase Pro $25/mo ≈ **₹2,347** at a reference rate ₹93.88 per USD (16 Nov 2026). Combined ≈ **₹4,225/month before taxes/usage**; illustrative 18% tax ≈ **₹4,986/month**, not a final invoice. Separate SMS/OTP, WhatsApp, Google Maps, email, storage/compute overages, payment fees, support and on-call staff. Client should own and pay for production accounts. Verify current quotes when purchasing. Ollama cloud **₹0 spend target but no guaranteed free production usage**.

Official source URLs and fuller calculations in `docs/TECH_STACK_AND_SUBSCRIPTIONS.md`.

## 12. Delivery and risk reality

A nationwide marketplace with all six roles, medical forms, real-time verification, emergency ambulance dispatch, multilingual UX, AI, WhatsApp, plans and payment/clinical reliability is **far more than a safe 7-day production build from zero**. The ambition is retained, but release gates are not negotiable: no unverified clinician access, no emergency promises without staffed operations, no public medical records, no patient-health data pasted into AI prompts, no fake claims/testimonials, no payment without verified gateway/ledger, no clinical prescriptions from an AI model. November 23 may be a **private staging demonstration / client acceptance milestone** if gates aren't met. The client must expressly agree to a revised delivery scope if commercial promises exceed validated work.

## 13. Workflows, governance and client ownership

The developer uses Claude Code CLI and Codex CLI in **separate Git worktrees** once a single foundation implementation is committed. Antigravity is used for file editing/inspection only; built-in Antigravity agents are disabled/not used. A single integrator merges and controls deployments, conflicts and DB migrations. AI agents get broad local development autonomy as requested, but cannot establish a safe exception for irrecoverable deletion, real patient data export, live charges or emergency feature activation; production authorization and technical checks still apply. `CLAUDE.md`, `AGENTS.md`, `docs/AGENT_COORDINATION.md` and `docs/PERMISSIONS.md` define the collaboration rules. None of these files are CLI prompts or instructions to start now.

**Recommended reading order:** README → DECISIONS → PRODUCT_REQUIREMENTS → SYSTEM_ARCHITECTURE → ROLE_ONBOARDING_AND_PERMISSIONS → BOOKING_AND_CONSULTATION → TECH_STACK_AND_SUBSCRIPTIONS → DAY_BY_DAY_PLAN → RELEASE_CHECKLIST.
