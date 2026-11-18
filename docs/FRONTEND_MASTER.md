# SureCure Visit — Frontend Master Execution Specification

**Version:** FE 1.0 / parent execution pack v2.3 REVIEWED  
**Date:** 18 November 2026  
**Domain:** surecurevisit.in  
**Audience:** Owner, Claude Code lead, Codex CLI, Kiro CLI, future frontend developer  
**Target:** 23 November staging/acceptance milestone; production is a separate go/no-go decision.

## 0. Read this first

This is the complete frontend workstream guide, not a replacement for the parent README, approved API contracts, permissions, release checklist or database design. It expands the actual v2.3 pack and its detailed v1.5 specifications into a page-by-page frontend implementation plan. Current repository state is not known: inspect existing code, dependencies, branches, task status and actual backend readiness before changing anything. Preserve working code. The owner has now requested frontend work; this does not authorize production deployment, paid integrations, database resets or real clinical data.

**Owner-confirmed workflow:** Claude Code orchestrates; Codex and Kiro are delegated engineers; Herdr is the monitoring/terminal workspace; Antigravity is removed; friend joins later for frontend work. Earlier historical files mentioning two agents or Antigravity are superseded. Mark D-WF confirmed in the active decision ledger with the explicit owner confirmation, without claiming other decisions are approved. Claude Sonnet 5.5 Medium is the owner's reported current selection; verify actual CLI and account availability. Higher effort only where useful. No automatic delegation assumption: verify supported mechanisms first.

### Meaning of priority and readiness

- **P0:** foundation, public discovery, onboarding, verified providers, shared booking and essential role journeys, accessibility and security. Build first.
- **P1:** additional operational/clinical UI, all 14 doctor capabilities, lab report, payment sandbox, support and CMS. Implement in dependency order; clinical functionality may only operate with synthetic data in isolated staging until authorized.
- **P2:** optional animated hero, advanced scheduling, paid memberships, WhatsApp automation, AI assistant, GPS, pharmacy, emergency dispatch. Not a commitment to immediate live activation.
- **FIXTURE** means a screen uses explicit synthetic data; never call this integrated or production-ready. **INTEGRATED** means real development APIs are connected but tests/approval may be outstanding. **VERIFIED** requires actual tests and review. Keep master ledger statuses unchanged (PENDING, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, DONE_VERIFIED, BLOCKED, PENDING_HANDOVER, DEFERRED_BY_DESIGN); frontend readiness is an extra dimension, not a substitute.

**Non-negotiable:** never make a pretty screen pretend to be a real service. Never use real patient information, actual credentials or original screenshot contact details in fixtures, prompts, analytics, screenshots or public demos. Do not fake provider ratings or results. Live clinical records, prescriptions, released lab reports, emergency dispatch, live payments, subscriptions, precise GPS and automated payouts remain server-side gated. Public 112 emergency guidance must work without auth, payment or OTP. The reference screenshots describe functionality, not visual styling or actual seed data.

## 1. Source hierarchy and crosswalk

The authoritative inputs are the current owner directions and active v2.3 pack, not old archived execution instructions. The following files are in the repository root or docs tree. Re-read relevant sources before implementing a ticket.

| Source | Frontend implications |
|---|---|
| README.md, README_START.md, CLAUDE.md, AGENTS.md | Execution, restrictions, agent ownership and review |
| DESIGN.md; docs/specs/DESIGN_ANIMATION_I18N.md | Brand, typography, anti-AI-slop, motion, locale and accessibility |
| docs/specs/PRODUCT_REQUIREMENTS.md | All public pages, six roles, cross-cutting features |
| docs/specs/ROLE_ONBOARDING_AND_PERMISSIONS.md | Field visibility, mandatory questionnaire, organization switching, IDs |
| docs/specs/BOOKING_AND_CONSULTATION.md | Booking state machine, OTP, 5-step consultation and DC01–14 |
| docs/API_CONTRACTS.md; docs/SCHEMA_RECONCILIATION.md | Proposed endpoints; reconcile with backend before integration |
| docs/specs/DATABASE_SCHEMA.md; docs/MASTER_BLUEPRINT.md | Conceptual records and data ownership; not two schemas to copy |
| docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md | Mixed money, hybrid cancellation, shared support and verified coverage |
| docs/ACCEPTANCE_AND_TEST_MATRIX.md; docs/PRIVACY_AND_OPERATIONS_GATES.md | Role/feature gates and required negative tests |
| docs/IMPLEMENTATION_TASKS.md; docs/FEATURE_STATUS.md; docs/TEST_EVIDENCE.md; docs/HANDOVER.md | Evidence, statuses and work allocation |
| docs/specs/AI_WHATSAPP_AND_CLOUD.md; docs/TOOLKIT.md | Optional integrations and approved tool selection |
| docs/specs/DAY_BY_DAY_PLAN.md | Historical target dates; use revised frontend plan in section 22 |

Sections below add recommended frontend choices where the source leaves a gap (route subpaths, layouts, component names, UI budgets, tests and ticket decomposition). Those are proposals, not claims of existing code or client approval. If a proposal conflicts with an approved backend contract, revise it together with the lead. The exact legal entity, policies, support contact, brand assets, merchant details and coverage need client approval. Do not invent any.

## 2. Product experience and guiding principles

One coherent marketplace, not six unrelated apps. Public entry is the landing page, not login. A guest can discover verified healthcare providers and prices before authentication. Signup -> verify identity -> role-specific onboarding -> authorized dashboard. Returning accounts resume incomplete onboarding or go to their authorized workspace. A patient selects their provider, the provider sets price and manually accepts; no AI autonomously matches/accepts a booking. A multi-role account may switch authorized workspaces/organizations, never manufacture permissions by toggling UI.

Four categories: doctor home visits, lab tests/home sample collection, scheduled ambulance transport (future emergency service distinct), caretaker/home care. Nationwide website access is not nationwide coverage: only actually operational, approved providers are bookable in a supported PIN/area. Explicitly display lack of local availability. Patient health questionnaire is mandatory before ordinary booking; truthful Unknown/None answers are valid, family and document sections must be answered but members/uploads are not compulsory. Never gate emergency call information behind that questionnaire.

Business direction: mixed online and provider-collected/pay-after payments; hybrid cancellation (platform safeguards + service-specific terms); shared support (provider service issues + platform escalation); verified coverage. Policies/fees/refunds/response times/merchant/invoice issuer not yet finalized. UI must consume approved server policy version or fail closed. Do not invent a cancellation fee or represent an amount due as payment received.

## 3. Technology stack and usage

| Technology | Purpose | Implementation instruction |
|---|---|---|
| Next.js App Router + React | One public website and private dashboards | Server components for public reads and noninteractive content; client boundaries only for forms, filters, interactive widgets. Use existing routing conventions; one app. |
| TypeScript strict | Typed screen contracts and state transitions | No blanket any, no unsafe assertion of API responses. Generate and share backend types; validate boundaries. |
| Tailwind CSS | Responsive styling and design tokens | Semantic classes backed by shared CSS variables; no duplicated palettes. |
| shadcn/ui | Accessible component primitives | Customize dialogs, input, select, sheet, table, tabs, dropdown, toast; do not ship unmodified default template. |
| Zod | Input schema and form/server contract validation | Shared representations; browser checks improve usability, server remains authoritative. |
| next-intl | English, Telugu, Hindi | Stable message keys, locale routing and persisted preference. |
| CSS motion | Buttons, state transitions | Default mechanism; motion reduced or disabled as appropriate. |
| Three.js + React Three Fiber | Optional custom marketing hero | At most one lazy-loaded scene; approved performance budget, static poster and reduced-motion/no-WebGL fallback. Never required for core flow. |
| Anime.js | Optional section/SVG reveals | Selective purposeful use after functionality; no animations during clinical, payment, OTP or emergency action. |
| 21st.dev | Curated component references | Adapt selectively; check licenses, dependencies and keyboard behavior first. |
| Supabase Auth / PostgreSQL / Storage / Realtime | Identity, authorized data, private files, booking status | Through approved browser and server adapters; NEVER ship service-role key, admin credentials or raw privileged data to browser. |
| Razorpay | Approved checkout | Sandbox first; backend order and webhook truth. Live separately gated. |
| Google Maps | Optional map display | Approved usage and consent only; PIN coverage works without maps; never infer availability from geocoding. |
| Ollama Cloud | Optional support/search only | Calls server-side, verified free allowance or disabled, no paid fallback, no clinical AI. |
| WhatsApp | Client-approved click-to-chat; later official automation | No PHI in URL/message; automation separately approved. |
| Vitest + Playwright | Component/state, integration and end-to-end evidence | Synthetic fixtures, browser/a11y tests, no patient data in traces. |
| GitHub Actions + Vercel | CI and staging/production hosting | One lockfile, branch protections, client-owned commercial production. |

Recommended (not mandated dependency): use native React state for local UI and URL search params for public filters; existing shared form/data libraries only when justified. If adopting React Hook Form with Zod for complex forms, approve once centrally. No parallel UI frameworks, duplicate animation libraries, global state store for all pages, new frontend subscriptions or second app. Pin compatible stable versions based on inspected repo. Use Impeccable / design-review skills, official documentation tools and accessibility checks if installed; do not indiscriminately install plugins/MCPs.

## 4. Brand, art direction and design tokens

Source palette from active DESIGN.md (client sign-off pending):

| Token | Hex | Use |
|---|---|---|
| primary / deep forest teal | #0F5F59 | Primary navigation, booking CTA, key emphasis |
| focus teal | #0A857C | Focus ring/accent; test contrast on every surface |
| ink | #17282B | Primary text, headings |
| paper | #FAF8F2 | Warm public canvas |
| mist | #E9F3F0 | Subtle section background and alternate surfaces |
| warning | #B36D20 | Caution with icon and text; validate contrast |

Additional semantic tokens (proposal): white surface, muted text, neutral border, danger, success, info, disabled and focus. Derive/test contrast rather than assuming any token provides accessible text on any fill. Use text/icons in addition to color for states. Retain teal/cream as the shared identity; do not introduce purple neon, gratuitous gradients, fake medical badges or red for normal statuses. Use red sparingly for genuinely urgent/unsafe action. No dark mode requirement in initial scope; don't spend days implementing it.

Typography: legible editorial display face for public hero (licensed asset or approved local font), clean sans for UI. Suggested family trials: a restrained Latin display serif + Noto Sans/Inter-like UI; Noto Sans Telugu and Noto Sans Devanagari for native scripts. Select after real glyph/weight and layout tests. Do not use Latin-only fonts for Telugu/Hindi. Suggested mobile body 16 px, dashboard labels 13–14 px with sufficient contrast, page headings 28–40 px, public hero 36–64 px responsive, line-height ~1.5 body and 1.15–1.3 headings (adjust for Indian scripts). No all-caps long labels or tiny gray text.

Layout proposals: 4/8 px spacing system (4, 8, 12, 16, 24, 32, 48, 64, 96), desktop content max 1200–1320 px, mobile gutters 16–20 px, tablet 24 px, desktop 32 px. 12-column adaptive landing grid; 240–272 px dashboard sidebar; main forms max 720–880 px, long clinical editor desktop context rail and mobile single-column stacked. Rounded 8–16 px on controls/surfaces, modest shadows only where layer separation matters. Primary button solid teal, secondary quiet outline or text; compact row actions visibly labelled. At least ~44 px touch targets; focus visible; disabled reason accessible. Body text at least WCAG AA contrast target 4.5:1, large text 3:1; test rather than assume.

Visual language: warm, confident and human. Use real approved home-visit/settings imagery, textured editorial cropping, meaningful medical/service icons and generous whitespace. Four service sections should have distinct useful layouts, not cloned icon cards. Landing page gets strong typography, compelling story, intentional asymmetric composition; clinical workspaces get predictable forms and stable layouts. Do not present stock/AI images as actual doctors or client staff. No fictional testimonials, patient counts, success ratios, "India's #1", fake reviews or fabricated provider verification. Use honest empty states until assets and copy are approved. No exact company association without approval.

## 5. Information architecture and route catalogue

Route paths here are proposed frontend paths; locale prefix `/{locale}` for all user-facing routes, e.g. `/te/doctors`. Use Next.js route groups for layout grouping without changing URLs. Keep `/api/...` nonlocalized unless backend explicitly requires otherwise. Every route has loading, empty, error, permission and feature-gated behavior as applicable. IDs in URLs must be authorization checked; public references are display identifiers, not secrets. No clinical metadata in query params, analytics or page titles.

### Public routes (P0 except explicitly optional)

| Route | Main content and interaction | Data / state |
|---|---|---|
| / | Landing, PIN selector, four services, how-it-works, verification, stories, FAQ, provider CTA | Published brand content + real service availability |
| /about | Mission, operating model, real team if approved | Client-approved copy/assets |
| /our-story | Brand origin and purpose | Approved editorial copy |
| /stories | Published articles and stories | Loading, no published stories, pagination |
| /stories/[slug] | Story/article, dates, author consent, related content | Approved published record only, not-found |
| /how-it-works | Patient/provider journey, manual acceptance and payment explanation | Approved terms and links |
| /doctors | Verified doctor directory | PIN, specialty, language, rate, availability filters |
| /doctors/[id] | Doctor profile and book CTA | Public allowed fields and dynamic eligibility |
| /lab-tests | Lab/test catalogue, branches and search | Category/PIN/test filter, package prices |
| /lab-tests/[id] | Lab listing/test menu, prep guidance if approved | Verified provider + selected tests |
| /ambulances | Scheduled ambulance transport; separate emergency guidance | Operators and verified coverage; no fake dispatch |
| /ambulances/[id] | Operator, substantiated fleet types, scheduled quote/request | Verified fleet and eligible schedule |
| /caretakers | Care provider discovery | PIN, language, care skill, schedule and rates |
| /caretakers/[id] | Care profile, permitted services, plan request | Verified scope and rate |
| /memberships | Only approved plans/benefits; otherwise informational or unpublished | Free/Plus/Pro proposal not sold until approved |
| /become-a-provider | Four provider registration routes, verification expectations | Approved qualification guidance |
| /faq | Searchable service/billing/account answers | Published locale-reviewed content |
| /contact | Approved contact channels, public help | No diagnostic text fields; anti-abuse |
| /privacy, /terms, /refunds | Approved legal notices, version/date | No placeholder legal entity or invented policies |
| /emergency (proposed) | Call 112, emergency guidance, honest dispatch status | Works without login, motion or payment |
| /login, /signup | Authentication and role choice | Verified auth and safe return destination |

### Private route map (proposed subpaths)

| Workspace | Routes relative to role root |
|---|---|
| /patient | /dashboard, /onboarding, /profile, /health-profile, /family, /family/[memberId], /addresses, /bookings, /bookings/new, /bookings/[id], /records, /records/[id], /documents, /payments, /payments/[id], /notifications, /support, /support/[id], /settings, /memberships (gated) |
| /doctor | /dashboard, /onboarding, /profile, /services, /availability, /requests, /visits, /visits/[id], /visits/[id]/consultation, /visits/[id]/records, /earnings, /notifications, /support, /settings |
| /lab | /dashboard, /onboarding, /profile, /branches, /catalog, /staff, /orders, /orders/[id], /collections, /reports, /reports/[id] (gated), /billing, /notifications, /support, /settings |
| /ambulance | /dashboard, /onboarding, /profile, /fleet, /crew, /availability, /requests, /trips, /trips/[id], /billing, /notifications, /support, /settings; /dispatch future gated |
| /caretaker | /dashboard, /onboarding, /profile, /services, /staff, /availability, /requests, /assignments, /assignments/[id], /shifts, /plans (advanced gated), /billing, /notifications, /support, /settings |
| /admin | /dashboard, /providers, /providers/[id], /coverage, /bookings, /bookings/[id], /users (scoped), /staff, /payments, /refunds, /support, /support/[id], /content, /content/[id], /audit, /settings |
| Shared | /workspace/select, /account/security, /account/privacy; role-specific access enforced; internal invite/recovery routes as supported by auth provider |

Technicians, drivers, caregivers and organization managers use scoped views within their organization's service workspace, not additional broadly privileged accounts. Never grant clinical access to admin merely because they can see bookings. Unknown route => localized not-found; unauthorized => minimal access-denied/sign-in response without revealing private entity existence. Suspension and disabled service routes fail closed on server. All public and private paths must remain consistent with the actual backend permission map.

## 6. Public landing page — detailed art direction and content order

Build the marketing page as a distinctive editorial experience. Recommended content sequence:

1. **Global header:** logo/wordmark, Services (four categories), About, Stories, How it works, language, location, Sign in/Sign up. Mobile menu sheet with keyboard focus trap and scroll-safe content. Emergency link easily accessible but not disguised as a normal booking CTA.
2. **Hero:** clear value proposition, suggested unapproved draft headline "Care that comes closer." Support line explains home healthcare discovery, not guaranteed immediate arrival. Primary action selects service/PIN or explores services; secondary explains workflow. Right-side approved photo or single custom lightweight 3D scene with static poster. No stock doctor presented as verified provider. Keep initial hero readable with JS/motion disabled.
3. **Location and service finder:** 6-digit Indian PIN input (validate shape; server verifies supported PIN), optional city label, four selectable service types; reflect current results honestly. Never request precise location without reason/consent. Search routes to actual category filter; no sign-in requirement.
4. **Service editorial pathways:** doctor home visits, lab/home sample collection, scheduled ambulance and caretaker support. Each has distinct image/text composition, benefit, coverage caveat and Explore action. No unsupported medical claims.
5. **How it works:** select provider, request appointment, provider accepts, receive service, access authorized records where enabled. Clarify request vs confirmation. Translate all.
6. **Trust and verification:** explain how credentials and coverage are reviewed; do not suggest blanket accreditation or guarantee. Show only approved evidence/claims.
7. **About / Our Story:** real mission and operating model. Link to dedicated pages. Client supplies story, team, legal copy, photos.
8. **Stories and health awareness:** approved patient/provider stories, articles and publication dates. Empty state or omit block when none; never create fabricated human testimonials. Editorial not personalized advice.
9. **Memberships:** design a neutral section for proposed plans only; publish benefits/prices once approved. Do not imply coverage or unlimited home visits.
10. **Become a provider:** clear professional signup vs patient signup; verification and review expectations, not guaranteed approval.
11. **FAQ + support:** accessible disclosure summaries, contact and approved WhatsApp if configured. Use actual published contact details; do not invent phone or support hours.
12. **Footer:** four services, about, stories, legal, contact, locale and emergency guidance. Link only working pages; hide or explicitly mark gated pages. Copyright/identity only as approved.

Search interaction: retain category and PIN on navigation; input loading, invalid, unsupported, no-provider, network failure and retry. No duplicate or conflicting search bars. Do not create decorative buttons that do nothing. Public pages server-render useful text and avoid leaking private details. Add localized title/description, social preview (approved assets), canonical/hreflang and sitemap for public published pages only; private or staging pages noindex plus real auth, not noindex alone.

## 7. Shared shell and components

Public shell differs from authenticated app. Dashboard shell desktop: sidebar with role-specific primary nav; top bar with page title/breadcrumb, authorized organization/workspace switcher, locale, notifications and profile menu. Mobile: header with accessible menu or a concise bottom navigation for top 3–5 workflows (proposal; choose by role), secondary actions in sheet, avoid excessive menus. Show verification restrictions, not generic KPI tiles. Preserve selected workspace across page transitions after server validation. Patient homepage prioritizes next visit, find services, profile completion and support; provider homepage prioritizes pending requests and today's work. Global notification unread count comes from authorized data, not fabricated numbers.

Component catalogue (names proposed; adapt existing code):

| Component family | Reusable behaviors |
|---|---|
| BrandLogo, PublicHeader, Footer, LocaleSelector | Locale navigation, approved assets, no resetting form state |
| ServiceFinder, PinInput, ServiceFilterBar, ProviderCard | Validated PIN, real published data, filter URL, coverage/price visibility |
| ProviderProfileHeader, CredentialSummary, AvailabilityGrid | Public subset, verified status, no personal docs, real bookability |
| AppShell, RoleNav, WorkspaceSwitcher, UserMenu | Authorized role navigation and responsive collapse |
| PageHeader, Breadcrumb, SectionHeading, EmptyState | Consistent hierarchy and useful next action |
| StatusBadge, VerificationBanner, ProfileCompletion | Text/icon/color, server-derived counts, separate review/activation |
| Field, FormSection, Stepper, ErrorSummary, PhoneInput, OTPInput | Labels, error linkage, focus, mobile input mode, async pending |
| DocumentUpload, PrivateDocumentList, ConsentField | File type/size feedback, upload retry, purpose + consent, permission |
| DataTable, FilterToolbar, Pagination, MobileRecordList | Semantic rows/headers, filter/sort, responsive records, no leaking IDs |
| BookingSummary, BookingTimeline, BookingActions, CancellationDialog | Price/policy snapshot, actor/status-specific actions, explicit confirmation |
| PaymentSummary, PaymentStatus, InvoiceLink, ReceiptLink | Separate gateway/cash states and approved issuer documents |
| ClinicalContextHeader, VitalField, MedicationEditor, DraftStatus | Assignment-aware, units, source versions, autosave/error and safe review |
| HealthFactHistory, ProofQR, PhotoConsentPanel, PrivatePDFViewer | Gated, scoped, consent and expiration states |
| NotificationList, SupportTicketForm, TicketTimeline | Shared issue tracking, privacy-safe context and responses |
| LoadingSkeleton, InlineError, RetryAction, OfflineBanner, GateNotice | No misleading success; actual freshness/pending state and recovery |
| ConfirmDialog, Toast, AccessibleDialog, Drawer | Explicit consequence, focus management, non-toast critical messages |

Use single canonical status-to-label mapping per state machine. No literal English strings scattered through JSX. All components keyboard-operable, testable and responsive. Do not use animation to hide delayed backend response. No nested clickable controls inside clickable cards. Accessible links/buttons by semantics. Keep persistent inline errors for consequential actions.

## 8. Signup, login and onboarding

Account creation screen: select patient or one of four provider categories; no admin signup. Name/phone/approved auth method, clear privacy explanation and terms, verify OTP with resend countdown and throttling sourced from server. Accessible OTP can accept paste and autofill; no code in URL/logs. Expired/wrong code, network error, account already exists and rate-limited states. Staff/admin sign in via authorized invite and MFA; admin capability never self-selected. Verify all auth redirects to approved internal route (no arbitrary external redirect), protect refresh/session expiry, safe recovery without exposing private records. Do not reuse visit OTP as login.

Onboarding pattern for all roles: top progress steps, Save and continue / Back, server-saved partial draft, required marker, helpful examples without real personal details, review summary, submit or continue dashboard. Reload should resume last saved state, not leak sensitive drafts via localStorage. Incomplete provider may enter restricted profile/setup dashboard; show review status and missing requirements. Record which sections are actually required for activation, not an arbitrary percent. Separate profile completeness, credential review, service activation, availability, suspension and expiry. Edit profile and verification documents through distinct controlled operations. Provider edits affecting credentials may require re-review; backend decides.

### Patient required sections

| Step | Fields and conditional behavior |
|---|---|
| Account | Verified phone or supported auth; name; email if approved/needed |
| Personal | Name, DOB or age (approved validation), address, city/state/PIN, contact, emergency contact if appropriate |
| Blood group | ABO/Rh selection or Unknown, no guessed result |
| Allergies | Known details / No known allergies / Unknown; details required only if known |
| Current medicines | Listed / None / Unknown; repeatable list by approved schema |
| Previous surgeries | Listed / None / Unknown; details if known |
| Medical history | Listed / No known history / Unknown; patient-entered provenance |
| Family | Add authorized member or No family members added; relation, consent/invite or guardian flow |
| Documents | Authorized private uploads or No documents available; no compulsory upload |
| Review/consent | Answer completion, privacy purpose and access, versioned consent and confirm |

Additional field recommendations: preferred language, saved address labels, accessibility/communication preferences where justified. Avoid collecting unrelated personal IDs or unnecessary information. Do not represent self-reported details as doctor-verified. Clinical/governance owner approves health questions, optional demographics, minor flows and retention before real data collection. Mandatory questionnaire applies before ordinary booking, not to emergency 112 access. A patient may browse signed out. Revalidate profile completeness server-side at booking submission.

### Doctor onboarding and profile

Identity: name, professional photo, verified contact, registration number + issuing authority, qualifications, specialty, experience, languages, clinic/hospital affiliation, city/base, professional bio. Operational: home-visit fee, service areas/PINs, travel radius, private starting point, working hours, appointment availability, cancellation-policy preview. Private verification: ID evidence, professional registration/certificates, payout details only if necessary, contact/home location. Review screen lists public preview vs private verification fields; missing price/coverage/start/photo or other required approved fields highlighted, not displayed as actual verified until review. Public display SCV-DOC reference once generated; exact personal contact/address not public.

The provided profile-at-a-glance screenshot informs the overview: profile completion count, edit profile, name, contact, registration, qualification, specialty, experience, language, affiliation, location, fee, service area/radius, starting point, bio, photo and availability. Use a clean two-column desktop definition grid and single-column mobile; show missing values and targeted completion action. Do not reproduce screenshot branding, colors, names, registration or contact values. Separate patient-facing profile preview and provider-only details.

### Lab onboarding

Individual authorized manager/organization choice, legal/brand name, manager contact, permits/registration and accreditation evidence (only claim after verification), branches, branch addresses, operating hours, home collection coverage, test catalog/packages, price and turnaround policy, collector staff, review/release roles. Workflow: org setup -> branches -> credentials -> catalog/coverage -> staff -> review. Private bank/identity/legal docs gated. Multiple branches have clear selector; branch-specific prices and schedules follow server contract.

### Ambulance onboarding

Sole operator/company, operator contact, base and coverage, fleet records, vehicle registration/permit evidence, verified fleet class/equipment, driver/crew qualifications, availability and quote/base/distance policy. Upload and review per vehicle/crew; no unverified ALS/BLS claims. Scheduled transport only by default; dedicated emergency dispatch remains disabled. Vehicle assignments, permitted service types, pending credentials and availability are distinct.

### Caretaker onboarding

Independent caregiver/agency, identity/photo, training/qualifications and relevant approved background checks, experience, skills, authorized task scope, languages, hours, service areas/radius, pricing by hour/day/week/month, staffing/agency affiliation. Do not allow unqualified caregiver to select clinical nursing actions. Pricing periods and plan/shift policy clearly labelled. Advanced recurring plans gated until scheduling supported.

### Admin and staff

Invite-only admin, work identity, assigned scopes, MFA and private SCV-ADM reference. Organization owner/manager invites staff; show role, membership state and branch scope. No invite grants another org's records. Technicians, drivers and caregivers have assignment-limited queues. Admin review detail includes credential metadata, secure file viewer, request changes, approved/rejected/suspended status, reason and timestamps; no casually accessible clinical history. Distinguish staff user identity from provider organization entity.

Provider status UI: draft, submitted, under review, changes required, approved, active, suspended/expired according to server enums. Never map unknown server status to active. All profile completions are derived from approved required fields; verification is not a progress checkbox.

## 9. Provider discovery and shared booking UI

Directory: public title/category, PIN selector, result count from real data, search, category-specific filters, sort with transparent meaning, verified availability label, provider name/photo and public SCV ID, specialty/skills/test/fleet, approved rate with units, coverage, profile action. Use skeletons on first load; keep previous results during refetch marked stale if necessary; cancel superseded requests. No slot guarantee until server confirms. Filters should work on mobile via drawer with Apply/Clear; reflect in URL for public routes. No fake reviews, distance or ETA. Links remain keyboard-accessible. No exact personal contact or private address in public results.

Profile: credentials/public scope, bio, permitted services, price incl. known fees, availability, area coverage, cancellation policy, Book/Request CTA and accessible locale. Explain manual acceptance: "Your request is sent to the provider. Your booking is confirmed only after acceptance and any required payment step." If suspended, unavailable, out-of-area or verification expired, disable booking and give truthful reason; the server enforces this independently. Use provider IDs from server, never derive public references client-side.

Shared booking wizard (proposed):

| Step | Data and interaction | Failure handling |
|---|---|---|
| 1. Service | Chosen provider and service/test/transport/care scope | Reconfirm real eligibility; invalid listing => search alternative |
| 2. Patient | Self or authorized family member; required questionnaire state | Route to incomplete profile; deny unapproved family record access |
| 3. Location | Saved address or address form; city/PIN and required service fields | Unsupported coverage, incomplete address; map optional |
| 4. Schedule | Date/slot/availability or approved quote path; IST | Slot changed or unavailable => refresh and choose again |
| 5. Details | Category-specific relevant needs; minimal data collection | Validation and clear field errors; no clinical diagnosis by AI |
| 6. Payment and policy | Approved method, price breakdown, amount due, cancellation terms/version, consent | Price change requires reapproval; disabled live gateway or missing policy blocks real checkout |
| 7. Review and submit | Immutable review snapshot, explicit Request action | Pending, duplicate-safe retry, stale eligibility, timeout; never assume success |
| 8. Result | Request receipt, current server state, actual reference when generated, next action | No fictitious confirmation; refetch on uncertain outcome |

State model (source): DRAFT → REQUESTED → ACCEPTED → CONFIRMED → IN_PROGRESS → COMPLETED; alternative DECLINED / EXPIRED / CANCELLED / INTERRUPTED / NO_SHOW where authorized. Doctor detail overlays EN_ROUTE → ARRIVED → ARRIVAL_VERIFIED → IN_CONSULTATION. Server transition functions are the only authority, not arbitrary status selection. UI should derive permitted actions from current state and server authorization; disabled reason visible. Reconcile common and service-specific enums before coding. Accepted/confirmed may differ because online payment hold is conditional. Keep booking, clinical and financial status separate (never one combined badge).

Provider request detail: request overview, minimal service needs, schedule, coverage and quoted price, patient identity/location only to permitted extent, Accept / Decline with explicit confirmation and reason where required. After acceptance, show actual assigned contact/address only to authorized parties, reference, visit details and next actions. No fake ETA. Concurrent acceptance/slot conflict => refresh, explain no duplicate booking. Expiration countdown is server timestamp-based; do not hardcode 30 min request or 15 min payment hold (proposed not approved). Provider cancellation / patient cancellation / rescheduling: fetch applicable policy, show consequence and money breakdown before confirm, collect approved reason, display transaction result and refund status separately. Preserve event history; never delete booking.

Booking timeline: timestamped events, actor category, readable localized status, upcoming authorized actions, retry/offline banner and last updated time. Realtime broadcast minimum event payload; reconnect refetch authority, discard stale versions, unsubscribe on unmount/logout/workspace switch. If transport disconnected, status reads "Last updated ..." rather than pretending live. Support link with booking context; do not include clinical data in ticket default text.

## 10. Patient dashboard and pages

Patient dashboard should answer: What is my next booking? Can I request care? Do I need to complete my profile? What action is needed? Use a prioritized next-visit panel, service finder, active bookings, health profile completion and recent notifications. Show only actual data; no generic income/clinical charts. Mobile top action Find care, next visit and urgent guidance; bottom nav proposal Home / Bookings / Records / Account. Record features appear only if approved or clearly labeled synthetic staging.

| Screen | Main content / actions |
|---|---|
| Profile | Contacts, address, language, edit and verification state; secure account changes |
| Health profile | Seven required questionnaire sections, patient-entered vs clinician-reviewed badges, last update and review history; update with provenance |
| Family list/detail | Relationship and access/invite/guardian state, add/remove subject to consent rules; book for eligible member; revoke scoped access |
| Addresses | Add/edit permitted addresses, PIN validation, choose booking address; avoid precise location by default |
| Bookings | Upcoming / past / cancelled, category/time/status filters, open detail, pagination and empty state |
| Booking detail | Provider public info, exact authorized contact only after acceptance, timeline, payment panel, cancellation, support, visit OTP if eligible |
| Records | Authorized published/finalized visit records and reviewed lab reports only; draft never presented as final; filters by authorized member/date |
| Record detail | Clinician identity, visit reference, version/date, findings, prescription and follow-up in original language, authorized PDF download; amendments clearly marked |
| Documents | Private upload/list/delete request as policy allows; upload progress, expiry retry, access restrictions |
| Payments | Booking reference, method, amount due/paid, receipt/invoice only when issued, refund/dispute status and authorized download |
| Notifications | Read/unread, time, booking links, mark read; no PHI in push preview |
| Support | New ticket with category, authorized booking, description/attachment if allowed; ticket reference, assigned owner, timeline, status, escalate per policy |
| Settings/privacy | Locale, account/security, notification consent, privacy request/export/deletion workflow, logout |
| Memberships | Gated plans/entitlements, renewal/cancellation only after approved commercial rules; no purchase now |

Always allow access to legitimately authorized final clinical record regardless of unpaid balance; financial disputes remain separate. Adult family member access requires explicit grant; distinguish booking-for from record-view permission. Do not show household records simply because they share account holder or address. Medical records absent => honest empty state, not fake sample prescription on production.

## 11. Doctor dashboard and full consultation workspace

Doctor dashboard prioritizes verification banner, pending booking requests, today/upcoming visits, assigned active consultation, availability toggle only if approved, notifications and real collection summaries where authorized. Profile completion separate from credential approval. Sidebar: Overview, Requests, Visits, Availability, Services & fees, Profile, Earnings (gated), Support, Settings. Mobile has quick access to today's visits and pending requests. Do not show unassigned patient history.

### Doctor visit execution screen

Before acceptance: minimal relevant request fields; after acceptance: patient/member identity, appointment schedule and context, approved contact/address, booking reference, payment state, status, actions. On-the-way button emits EN_ROUTE; optional location only by consent and backend support. Arrived action emits ARRIVED and starts server challenge. Patient sees assigned doctor identity/photo and code after arrival only; doctor sees input not patient's code. Patient UI says check doctor in person, do not share in advance or with callers. Six-digit code, short validity (five minutes proposed, use server expiry), resend/invalid/expired/attempt-limit states, no plaintext stored client-side beyond transient required display, no screenshot/log analytics. Wrong assigned doctor, replay or expired => denied; support-assisted fallback only with audited two-party verification. After verification, separate Start consultation action. Emergency assistance must never wait for OTP. Keep a slim status timeline at top and clear next action.

### Clinical editor: five steps (source guidance)

Layout: persistent compact context header (authorized patient identity, booking reference, age as approved, appointment date, status, allergies warning when available, DraftStatus); desktop steps/side rail and central form; mobile stepper with current step and sticky safe action area that never obscures error text or keyboard. Back/Next preserve draft. Never navigate to another patient's data during a pending save without explicit decision. Use approved vital validation and clinical terminology; do not fabricate thresholds or force diagnosis/medications. All clinical screens synthetic/staging until independently enabled.

| Step | Detailed fields and UI requirements |
|---|---|
| 1. Vitals & exam | Temperature + C/F unit, systolic/diastolic BP, pulse bpm, SpO2 %, respiratory rate, height/weight if relevant, examination findings. Optional clinically appropriate measurements; preserve entered value; warn on approved implausible/dangerous criteria, require acknowledgment where protocol requires. No silent correction or automatic diagnosis. Clearly mark missing/unknown. |
| 2. Assessment | Chief complaint/symptoms, duration, examination findings if separated, provisional/final assessment, clinically appropriate uncertainty, optional differential, red flags/clinician decision. Do not force definitive diagnosis merely to complete form. |
| 3. Prescription & tests | Repeatable medicine lines: name, formulation/strength, prescribed dose, route, frequency, duration, quantity, special instructions (including food timing if relevant). Add/remove with accessible controls, preserve ordering. Explicit "No medicine prescribed" option, tests/referrals optional. Show known allergies, require clinician review per governance. Never generate medication recommendations. |
| 4. Care instructions & follow-up | Clinician-authored advice, red flags as authored, follow-up recommendation/date, referrals/test requests. Optional follow-up and "not required" state. Keep plan editable until finalization. |
| 5. Review & sign | Summarized all steps, missing required fields, patient identity and allergies, medicine list, advice; explicit acknowledge/sign/finalize action. Show irreversible nature of finalized version, server-attributed author/time/version. Amendments are separate audited versions with reason, not silent editing. |

Draft UX: Save draft available throughout, debounced autosave after a deliberate interval (proposal 500–1000 ms; tune), visible Saving / Saved at time / Unsaved / Offline / Save failed / Conflict. Server uses optimistic version, cancel or serialize pending writes, ignore stale responses. Retry boundedly and only with authorization; preserve unsaved text in current memory if safe, warn before leaving; do not put medical data in plaintext localStorage/sessionStorage, URL or error-reporting payload. On version disagreement, stop blind autosave, fetch authorized latest version, inform clinician and allow reviewed reconciliation; never silently overwrite newer clinical notes. Finalization disabled while unsaved/error/conflict, require server confirmation; if response uncertain refetch signed state before retry. After sign, read-only record and amendment action per approved backend. View clinical and payment completion independently.

### Health fact confirmation and evidence (DC11)

Reference screenshots show individual facts with patient-entered/doctor-verified markers and history. Implement a dedicated authorized panel for blood group, height/weight if relevant, allergies, condition history, medicines, surgeries and important notes as supported by canonical schema. Source, date, verifier, reviewed evidence and version displayed. Select facts actually reviewed, confirm with explicit review action, do not mark all facts verified by entering consultation. Preserve previous values and verification history. Corrections require documented attribution. Do not display verification if only patient entered data or clinician has not reviewed evidence.

### QR, photo, PDF and clinical disposition

Proof-of-visit card: generate/revoke expiring token through backend; display QR and expiry, authorized regeneration, minimum attendance confirmation only. Never encode raw patient UUID, OTP, diagnosis or actual chart. Public verification view returns limited approved information, handles expired/revoked; no identity or address leak.

Photograph panel: optional, explain purpose, specific consent or decline, upload private image with progress and metadata review, allow permitted withdrawal/retention process. No obligation to photograph patient; refusal cannot block clinical completion. No patient photo in public profile or proof QR. Do not request camera until intentional consent and action. File storage is private and access checked server-side.

PDF: only authoritative permitted signed/finalized version, patient/provider identity, visit reference/time, clinician-authored findings, prescription/advice as applicable, version/signature attribution and verification info. Private authorized download/view; expiration retry; no browser-created unofficial final document from unsaved state. Print preview preserve scripts and medicine units; PDF renderer/backend decides final artifact. Patient view uses same signed source, not draft.

Reference screenshots also include cash collected/not collected and ambulance assessment UI. Cash acknowledgement uses independent collection state, amount/method/reference and reconciliation; never blocks legitimate care or implies gateway payment. A clinician may document a transport recommendation only if the clinical governance and data contract approve that additional field; it is not automatic ambulance dispatch. Keep emergency instructions separate and visible. Do not infer a transport decision from vitals or generate it autonomously.

### DC01–DC14 frontend acceptance crosswalk (all individually tracked)

| Task | Required visible feature | Minimum proof / denial case |
|---|---|---|
| DC01 | Assigned doctor visit access and context | Other doctor denied direct route/API even when ID known |
| DC02 | Patient arrival challenge and doctor OTP form | Expiry, resend, attempt limit, replay and wrong doctor denied |
| DC03 | Patient status timeline and freshness | Scoped updates; reconnect/refetch and out-of-order event recovery |
| DC04 | Vital measurements + exam form | Units, approved validation, save authorized draft; no silent correction |
| DC05 | Draft autosave/recovery indicators | Offline/error/conflict; refresh server draft and no plaintext persistent PHI |
| DC06 | Clinician-authored assessment | Provisional uncertainty; no autonomous diagnosis |
| DC07 | Review/sign/final record/amendment | Immutable signed version; repeat write denied or idempotent |
| DC08 | Structured medicine/test rows | No medicine valid; allergy review, clinician authorization |
| DC09 | Patient authorized record views | Other patient/family without grant denied; drafts hidden |
| DC10 | Separate collection/payment state | Unpaid visit can finalize; gateway vs pay-after distinct |
| DC11 | Health fact review/history | Attribution, evidence, prior versions; no fake verification |
| DC12 | Revocable, expiring QR proof | Expired/revoked token handled, no PHI/OTP encoded |
| DC13 | Optional photo consent/private upload | Decline allowed; unauthorized file access denied |
| DC14 | Signed version PDF view/download | Correct patient/version, expired link recovery and no public object |

All fourteen remain requested for November 23, but the parent document records a client scope conflict about deferral of live clinical features. Complete screens using synthetic fixtures where backend blocked, disclose their readiness accurately, require explicit clinical sign-off and evidence before real data or issuance. Never lower security to satisfy the deadline.

## 12. Laboratory frontend

Manager dashboard: verification status, today's collections, pending orders, processing/review queue, real counts, branch switcher, catalog shortcuts. Technician dashboard: assigned collection jobs only, minimal contact/address and sample instructions as permitted. Reviewer dashboard: authorized reviewed release queue, not accessible to ordinary collector.

| Screen | UI fields and actions |
|---|---|
| Branches | Branch details, address, operating hours, coverage, verification, activate/deactivate only when allowed |
| Catalog | Tests/package listing, name, specimen/approved prep, price, collection type, turnaround claim, active/disabled; edit with server validation |
| Staff | Authorized invites, branch assignment, role, membership state, credential status |
| Order request | Patient/authorized member, selected test lines, address, slot, price snapshot/policy, manual accept/decline |
| Order detail | Reference, tests, schedule, assigned collector, status history, collection/payment separate, operator actions |
| Collections | Assigned list, accepted/arrive/collected/failed/recollect actions as approved; optional pickup code is distinct from login/doctor OTP |
| Results/reports | Private upload/review workflow, version and reviewer, released only by authorized reviewer; patient notification without medical payload |
| Billing/support | Collection record, settlement status where applicable, support tickets and escalation |

Patient lab flow: discover verified provider/test -> choose test lines -> scheduling and manual acceptance -> technician assigned -> collection -> processing -> authorized review/release -> private report in patient Records. No report auto-release due to payment or technician upload. Failed visit/recollection must display next steps and any revised fee policy, not silently mark collected. Report files inaccessible to unrelated staff/patient; no diagnostic interpretation by AI.

## 13. Ambulance frontend

Always distinguish scheduled non-emergency transport from emergency services. Public emergency page and call 112 accessible without account or payment. Emergency dispatch hidden or explicitly unavailable until staffed and authorized; no fake live tracking, ETA, immediate-dispatch or "ambulance on the way" if not actually assigned.

Operator dashboard: scheduled requests, today's trips, available verified vehicles and crew, credential expiry, operations notifications. Driver view: assigned current trip only, essential pickup/destination and permitted contact/notes. No patient history beyond assignment.

| Screen | UI fields and actions |
|---|---|
| Fleet | Vehicle identifier, registration/permits, approved type/equipment, base, availability, expiry, verified status |
| Crew | Driver/crew qualification and permitted scope, document review and assignment availability |
| Scheduled request | Pickup and destination, date/time, appropriate transport requirements, passenger/context fields strictly necessary, approved quote/base/distance breakdown, policy |
| Requests | Manual accept/decline with vehicle/crew capacity and stale quote checks |
| Trip detail | Assigned vehicle/driver, status, pickup/destination, authorized contact, audit trail, payment and support |
| Trip progress | Assigned/arrived/picked up/reached destination/completed as backend permits; cancellation/no-show exceptions |
| Emergency dispatch | Future separate operational module; disabled by default, no booking/payment/OTP dependency |

Quote uncertainty: show "Request quote" or estimated price only if backend supports it; material changes require explicit patient approval. Map optional after approved API, consent and cost review. Driver check-in cannot represent emergency guarantee; no emergency countdown from normal booking. Clinical assessment from doctor may recommend care but cannot trigger autonomous dispatch. Do not suggest users wait for platform review in life-threatening emergencies.

## 14. Caretaker / agency frontend

Caretaker dashboard: pending assignments/requests, today's scheduled work, profile readiness, availability, active care tasks and support. Agency view includes scoped staff and assignments; independent caregiver sees only own. Nonclinical care scope clearly displayed; nursing/clinical actions permitted only with appropriate verified credentials and governance, never by default.

| Screen | UI fields and actions |
|---|---|
| Services & rates | Permitted skills/tasks, hourly/day/week/month prices, period/units and availability, travel coverage |
| Staff | Caregiver identities, scopes, credential/review state, languages, shifts and authorized organization assignment |
| Requests | Patient needs, requested schedule, rate snapshot, manual accept/decline, relevant authorized care details |
| Assignment detail | Care plan/scope, patient context minimum necessary, approved contact, assigned caregiver, status/payment/support |
| Shift view | Individual start/end/attendance, check-in/out with server timestamps, absence, replacement and interruption handling |
| Advanced plans | Recurring days/times, duties, rest/replacement, shift series, renewal and dispute; gated until scheduler and policy approved |
| Billing | Actual delivered service/collection status, disputes, no false recurring charge |

Patient care journey: discover -> choose authorized scope and period -> request -> manual acceptance -> assigned caregiver -> attendance/service complete -> patient-visible status/payment. No automatic infinite renewal or "unlimited care" promise. Membership entitlement is separate from a purchased hours/shift contract. Caregiver must not issue prescription, diagnose or write clinical record unless explicitly qualified and authorized through appropriate clinical role.

## 15. Admin and organization management frontend

Admin views are capability-based, not a single all-seeing dashboard. Invite-only MFA; server checks admin scope on every route and mutation. Provide concise overview from genuine metrics only, queues requiring action, stale data/errors and audit records. Restricted user receives access-denied, never hidden-button-only security.

| Area | Detailed UX |
|---|---|
| Provider review | Filter by category/state/expiry; review application, submitted fields and private evidence; request changes/approve/reject/suspend with reason and explicit confirmation; track reviewer/time. No self-approval. |
| Coverage | Approved PIN/city/service eligibility, operating capacity and activation controls; changes audited; unverified provider not bookable |
| Booking operations | Search reference and authorized metadata, status and exceptions; no impersonating provider acceptance or editing arbitrary state |
| Staff/admin access | Invite, scope, membership, suspend/revoke, review confirmation and audit; no public admin signup |
| Billing/refunds | Payment records, due/collected distinction, merchant/reference/reconciliation, refund amount limits, explicit approval; live gated |
| Support | Ticket priority/status/owner, provider first-line then platform escalation, assigned time, responses and audit; no unsupported 24/7 promises |
| CMS | Draft/preview/publish story, FAQ, homepage copy, service notice, coverage content, locale versions and revision history; publisher role and consent evidence |
| Audit | Scoped event list, actor/action/time, category, reason and safe filters; do not display raw secret tokens or sensitive payload |
| Settings | Approved operational policy version, service flags, contact/notice configuration; production changes gated by authority and audit |

Organization managers: branch/vehicle/caregiver/technician membership selector, active/suspended scope, permitted settings. User with multiple organizations must never see combined cross-org sensitive search results unless explicit authorized contract exists. Invite acceptance validates server membership and scope, revoked staff cannot access cached pages. Do not let CMS author edit verification, price or clinical records through content endpoints.

## 16. Payments, cancellations, support, communications and optional integrations

Payment summary appears in booking and separate payment page. Display service/price snapshot, approved fees/taxes, payable total/currency INR (source integer paise; never compute gateway total from float inputs), selected method and payee/issuer only if confirmed. Separate financial enum NOT_INITIATED / DUE / PROCESSING / PAID / PARTIALLY_PAID / DISPUTED / REFUNDED; reconcile with server. Gateway test mode clearly marked in staging. Online checkout only if eligible order created on server; browser payment callback means checking, not definitive paid. Close/cancel/failed/network/late capture create recoverable state; refetch from server. Never store card data, fake UPI QR or mark paid from localStorage. Provider collection form records authorized actual collection method/cash or direct UPI, amount and reference, no fabricated gateway result. Booking confirmation, tax invoice and receipt distinct. Do not block record completion due to payment. Refund detail shows actual approved amount/status and policy, not guaranteed timeline before approval.

Cancellation: show current booking's applicable policy version, reason, recalculated fee/refund impact from backend, confirmation, status event. Reschedule only supported by contract and approved availability; do not mutate an accepted slot by changing local date controls. Failed reschedule retains old booking unless backend says otherwise. Support ticket can link booking reference with minimal data; own tickets and permitted staff queue only, no clinical info to general support unnecessarily. Show actual response owner/status; no unsupported SLA. Escalation and after-hours contact approved by client.

Notifications: in-app first, category-specific event list (request, acceptance/rejection, arrival, cancellation, payment, report availability, shift), localized content, safe links, unread state. Email/SMS/WhatsApp via backend-approved templates and consent; no PHI, note, diagnosis, prescription or OTP in generic preview. Auth/visit OTP delivery follows separate security design. Do not implement fake notification delivery. Outbox server-side, not browser timers.

WhatsApp: floating button uses approved business number and neutral message like "I need assistance with SureCure Visit." Do not encode patient details/booking clinical data in link. Hide until contact configured. Accessible label, safe positioning away from primary CTAs, not distracting on clinical/OTP/emergency pages. Future Meta bot needs consent, templates/webhook security, client business approval; cannot directly accept booking or supply treatment.

AI assistant: optional enable only if verified free allowance and cost guard, otherwise normal FAQ and service finder. Public assistant identifies as AI, offers approved FAQs, location/service search, draft booking request with explicit patient confirmation, handoff to human support. No diagnosis, triage, prescribing, auto-acceptance, autonomous financial action or unrestricted records. No client API key. No sending real patient clinical data to external AI. On quota/failure show understandable fallback; no paid fallback. Do not overclaim response reliability or 24/7 availability. Emergency guidance visible independently of assistant. Preserve locale and use reviewed language for safety-critical content.

Membership/pharmacy/advanced scheduling/GPS: design information architecture and gated placeholders only as appropriate to scope; not clickable fake purchases. Membership Free/Plus/Pro benefits/prices still undecided. Licensed pharmacy partner workflow requires approval; no self-dispensed prescriptions, online medicine commerce or real ordering until legal/partner gates. GPS sharing needs explicit consent, scope, expiry and real tracking; text status works without it. Never display a live map marker from random fixtures on a real service.

## 17. Frontend architecture, contracts and state management

Proposed folder boundaries (adapt to existing repo and do not duplicate existing app):

```text
src/
  app/[locale]/
    (public)/               public pages and directory
    (auth)/                 login/signup
    patient/ doctor/ lab/ ambulance/ caretaker/ admin/
  app/api/                  backend-owned route handlers
  components/
    ui/                     customized primitives
    shared/                 cross-role UI, status, fields, shell
    public/                 marketing, search, profile components
    dashboards/             role-specific layout components
  modules/
    auth/ providers/ coverage/ catalog/ bookings/ payments/
    doctor/ lab/ ambulance/ care/ organizations/ audit/
    ...                     feature UI + approved domain adapters
  lib/                      auth, Supabase adapters, feature flags, validation
  i18n/                     locale config and dictionaries (adapt existing)
  styles/                   tokens and shared CSS (adapt existing)
  fixtures/                 synthetic development-only scenarios
 tests/                     unit, integration, e2e, rls (adapt existing)
```

One frontend foundation owner for shared layout/tokens, route convention, i18n config, package manifest and common components. Agent-specific directories assigned only after foundation commit. Do not create a separate frontend repository if current project uses modular monolith. UI components accept narrow typed view models rather than full DB records or Supabase service-role data. Server components read only approved DTOs; client components submit via agreed actions/handlers. Security-critical decisions server-side. Use stable IDs for list keys; derived values not duplicated in multiple stores. State ownership: URL for public filters, local state for ephemeral dialog/form UI, server state for booking/verification/records/payments, authorized server draft for ongoing clinical edits. Do not copy private data into global client store persistently, service-worker caches or external observability. Clear state on logout/workspace switch.

API contracts below are the **proposed routes from active docs/API_CONTRACTS.md**, not proof they exist. Confirm request/response schema, auth and status names against backend and canonical ERD. Do not implement speculative endpoints in frontend. Missing list/detail/dependent endpoints require contract tickets first.

| Frontend surface | Proposed API |
|---|---|
| Directory/filter | GET /api/providers?category=&pin=&priceMax= |
| Provider public detail | GET /api/providers/:id |
| Patient onboarding | POST /api/onboarding/patient |
| Provider onboarding | POST /api/onboarding/provider |
| Admin review | POST /api/admin/providers/:id/review |
| Request booking | POST /api/bookings |
| Accept/decline/cancel | POST /api/bookings/:id/accept, /decline, /cancel |
| Doctor travel | POST /api/bookings/:id/en-route, /arrive |
| Doctor arrival OTP | POST /api/bookings/:id/verify-arrival |
| Clinical draft/sign | POST /api/consultations/:id/draft, /finalize |
| Clinical detail/PDF | GET /api/consultations/:id, /pdf |
| Proof of visit | POST /api/bookings/:id/proof |
| Online order | POST /api/bookings/:id/payment-order |
| Record pay-after | POST /api/bookings/:id/collection |
| Support | POST /api/support/tickets |
| Optional AI | POST /api/assistant/chat |
| Provider webhooks | Server ONLY: /api/payments/razorpay/webhook, /api/whatsapp/webhook |

For each contract agree: actor, route/method, input schema, response DTO, status enum, permitted actions, server timestamp/version, pagination, idempotency and stable error codes with locale mapping. Distinguish 401 unauthenticated, 403 or privacy-safe 404 unauthorized, 409 stale version/slot, 422 validation, 429 throttled and 5xx retry. Exact status/error shape requires backend agreement. Do not render raw backend errors or stack trace. Use server-supplied amounts and timestamps, format INR and Asia/Kolkata; reference IDs and OTP digits canonical. Use idempotency key for user intent where server contract supports, maintain through retry; don't generate new duplicate request on uncertain outcome. Never change booking status optimistically before server confirms. For updates that can be optimistic (e.g. read notification) support rollback.

### Mock-first frontend rules

Owner wants to start full frontend now. Build against typed contracts with synthetic mock adapter if backend unavailable; real adapter integrated separately. Clearly label all fixture routes or preview screens "Synthetic demo / not live"; disable production fixture resolution at build/server runtime, no fake real provider listing or payment. Fixture scenarios: empty directory; approved doctor; pending/suspended provider; patient incomplete profile; authorized family member vs denied; booking requested/accepted/declined/cancelled; stale slot; expired OTP; assigned vs unauthorized doctor; draft conflict/offline; unsigned vs signed record; PDF expired; lab failed collection/review; scheduled ambulance; caretaker absence; payment due/failed/processing/paid/refund; support escalation. Use fictional identifiers/contacts and no actual screenshots copied into repo. Tests validate both adapters where feasible. Mock-complete never counts as end-to-end verified, and direct URL/API permissions still need integration tests. Never bypass auth guard to demonstrate full flow in public deployment.

## 18. Localization, accessibility and responsive behavior

Three languages: English default (`en`), Telugu (`te`), Hindi (`hi`). Stable keys by namespace: common, public, auth, onboarding, patient, doctor, lab, ambulance, caretaker, admin, booking, clinical, payment, support, errors, accessibility. Locale switch in header/settings; retain intended route and form state without exposing private values. Persist preference in approved cookie/profile; no PHI in cookies. Use Intl locale-aware date/currency and numerals as appropriate but canonical backend IDs, OTP digits, medical units and prescribed values unchanged. Verify translation completeness; no raw keys/English mixed into critical screens. Review consent/medical/payment terms with fluent reviewers. Preserve clinician-authored original language; never automatically rewrite medication names/doses or signed record. PDF glyph rendering tested. Use alternate fonts and actual script shaping, increased spacing/line-height if necessary, no truncating critical labels. Notifications preferred locale where supported; locale does not change policy/version or data access.

Viewports: 360, 390 (recommended), 768, 1024, 1280 and 1440 (recommended). Must work on small Android and typical iOS Safari, desktop Chrome/Edge and Firefox according to approved matrix. No horizontal scrolling except intentional accessible tables; use card-like mobile rows with clear labels, keep headers linked, horizontal wrappers with visible affordance when needed. Forms single-column on mobile; two-column only where logically grouped. Sticky CTA safe areas account for mobile browser and keyboard; don't obscure focus. Drawer closes with Escape, returns focus; dialogs have title, description, focus trap; form errors associated with fields and summary, focus first invalid field; async saves announce meaningful status via aria-live (avoid chatter). All icon buttons labelled; links distinguish from buttons; skip link and landmarks, logical headings, keyboard ordering and visible focus. Color not sole indicator. Text zoom 200% test; no disabled browser zoom. Reduced-motion preferences, no autoplay decorative media, Three.js fallback and no motion on emergency/OTP/checkout/clinical work.

Recommended performance quality budgets (not source-mandated guarantees): measure Core Web Vitals target LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 at p75 where real traffic exists; during development use Lighthouse lab results as indicators, not claim real-user metrics. Lazy load hero WebGL and secondary media; responsive optimized images, reserved dimensions, sensible font subsets, no unused JS or giant UI libraries; dynamic import optional SDKs after consent/action; dashboard data pagination and minimal DTOs. Low bandwidth/slow network means skeleton, retry, timely feedback, no fake live status. Keep marketing 3D out of authenticated bundle where possible. Optimize before adding animations; never block a care action on a scene.

## 19. Error, empty, loading, offline and security rules

Every page ticket must enumerate normal/loading/empty/error/denied/disabled states. Forms distinguish field error vs server rejection, preserve safe unsaved input and allow retry. Realtime disconnect shows stale state and refetch on reconnect. Upload shows progress/cancel/retry, size/type rejection; scan status and signed-link expiry, not just successful upload. Route navigation uses meaningful skeleton, error boundary and localized not-found. Do not claim offline bookings processed until server confirms. No offline service worker queue for clinical/payment mutations. Expired session prompts re-auth safely; clear private state and old sensitive pages. Error messages actionable without disclosing other patient/provider status.

Privacy frontend hard rules: no private medical data in public route metadata, URL, query strings, toast logs, analytics, session replay, browser persistent storage, service worker, public bucket or external AI. Use no-store/private appropriate response caching and server authorization; noindex not security. Client flags cannot authorize restricted feature; server fails closed on direct route/API. Never rely solely on hiding menu options, client JWT parsing, role dropdown or public ref IDs. Signed URLs short-lived, generated only after checking access; do not include in telemetry. Safe content rendering: no arbitrary HTML injection from CMS, messages or AI; sanitize approved rich text; validate upload type/size server-side even if browser filters. CSP/headers and CSRF/origin protections coordinated with backend without inventing custom auth. Localized external links safe and no open redirect. Don't print secrets in CLI/output; `.env.example` names only. No real patient data on staging previews. Access removal/suspension must invalidate relevant access and cached views according to server contract. Admin need-to-know, consent/grants for family/photography, evidence and audit remain mandatory. Privacy deletion/export requests follow approved retention and governance, not immediate destructive button. Emergency 112 remains accessible.

## 20. Testing, accessibility audit and definition of done

The frontend is not complete merely because it renders. For each ticket record task ID, route, commit, environment, synthetic/integrated state, contract version, test command, result and reviewer in existing docs/TEST_EVIDENCE.md and task ledger. Run the repo's actual lint, typecheck, test and build scripts (inspect package.json first; do not invent scripts). Playwright important flows; Vitest validation, state transition display, component interactions and locale formatting; backend integration/RLS authorization tests linked, not replaced by UI tests. No real data/traces/logs. Compare designs at all target widths and three scripts. Check every CTA and not just main happy path.

| Test suite | Required scenarios |
|---|---|
| Public | Guest browse/search/PIN, unsupported area, no results, published vs private content, truthful prices, no unverified provider, emergency link without auth, all navigation working |
| Auth & onboarding | Login OTP expiry/wrong/throttle, resume partial profile, questionnaire Unknown/None, conditional fields, no upload required if unavailable, admin signup denied, locale switch mid-form, logout/private data reset |
| Verification | Pending/rejected/changes-required/expired/suspended providers, missing required fields, review reasons, no public private documents, direct API denial |
| Booking | User selects provider, request/accept, reference only from server, conflicting slot/double click/idempotency, decline/expire/cancel, price/policy snapshot and reapproval, denied wrong actor |
| Doctor | Every DC01–DC14 crosswalk in section 11, mobile long clinical form, autosave conflict/recovery, review & sign, independent payment, private PDF/QR/photo and consent |
| Lab | Multi-test booking, assignment, failed collection/recollect, review/release gating, unauthorized collector denied report release |
| Ambulance | Scheduled pickup/destination, verified fleet/crew, accept/assign/trip states, no emergency booking in disabled mode, driver sees only assigned trip |
| Care | Period/rate, permitted scope, assigned shift, absence/replacement, no clinical privilege from nonclinical caregiver, recurring gate |
| Family & privacy | Adult without grant denied, role/organization switch invalidates previous data, unauthorized exact address/private documents refused, no sensitive query/cache/analytics leakage |
| Payments & support | Pay-after vs online distinction, sandbox pending/failure/refetch, refund/dispute, no fake invoice, approved cancellation, ticket ownership/escalation |
| Resilience | Timeout after mutation, duplicate request, offline banner, stale realtime data, reconnect/refetch, expired signed link, unauthorized session, upload failure |
| A11y & i18n | Keyboard-only, focus order, screen reader labels/errors/dialogs, 200% zoom, contrast, target sizes, reduced motion, Telugu/Hindi wrapping and font shaping, translated errors |
| Performance | Mobile slow network, no layout shift, lazy optional scene, image sizes, no unnecessary third-party SDKs, measured build/bundle and Lighthouse evidence |
| Production flags | Fixture adapter not reachable, all gated real clinical/emergency/payment/subscription/AI features blocked when unauthorized incl. direct requests |

Frontend definition of done for any ticket: correct routes and navigation; responsive approved design tokens; three-locale strings; loading/empty/error/denied/offline states where applicable; validated form and actual server state; no fake CTA or leaked details; accessibility checks; actual lint/typecheck/build/test evidence; reviewed diff; documented deviations and known blockers. A fixture route is `IMPLEMENTED_UNVERIFIED` or appropriately tracked as UI-only, not `DONE_VERIFIED` for end-to-end journey. Verify integrated flows before client acceptance. No live release before parent go/no-go.

## 21. Work breakdown, ownership and Herdr workflow

The following FE tickets supplement (not replace) the master IDs F01/I01/I02/C01/B01/S01/P01/U01/Q01/DC01–14/H01. Start all as PENDING until verified real repository state says otherwise. One lead integrates; assign specific subdirectories only after confirming they exist and recording contract version, base commit and exclusive paths. Examples of separation: foundation owner controls global CSS, shared components, package/lockfile and i18n schema; public workstream owns public route files; onboarding workstream owns auth/onboarding components; dashboard modules split by role. Changes to shared primitives/translation dictionaries via owner-approved patch or coordinated locale files. No concurrent edits to same file; no multiple migration authors. Read-only review can happen concurrently with development without editing.

| FE ID | Workstream | Priority | Parent / prerequisite | Exit evidence |
|---|---|---|---|---|
| FE00 | Repo/preflight, source/decision audit, Herdr CLI smoke | P0 | R00/R01 | Correct repo, clean base or preserved changes, actual agents/permissions and task ownership |
| FE01 | Shared frontend foundation, tokens, shells, localization config, component primitives | P0 | F01 | One app; lint/type/build; responsive shell and locale switching |
| FE02 | Public landing, about, story, FAQ, contact, legal scaffolding | P0 | FE01/C01 | Working public nav, approved content or truthful draft state |
| FE03 | Auth, role selection, restricted workspace routing | P0 | FE01/I01 | Real or explicitly fixture identity flow; direct route deny after integration |
| FE04 | Patient questionnaire, addresses, family grants, docs | P0 | FE03/I01 | Required truth-preserving onboarding and resume; private field scope |
| FE05 | Four provider onboardings, review states, profile at a glance | P0 | FE03/I02 | Correct role fields, required/verified distinction, no self-approval |
| FE06 | Admin verification queue / coverage | P0 | FE05/I02 | Review with reason + scoped access; coverage eligibility wired |
| FE07 | Directory and provider profiles (all four) | P0 | FE02/C01 | PIN/filters/eligible prices, no fake results, mobile search |
| FE08 | Shared booking wizard and provider accept/decline, timeline | P0 | FE04/FE05/FE07/B01 | Complete patient/provider request journey, conflict/cancel states |
| FE09 | Patient dashboard, booking detail, records/payment/support navigation | P0 | FE08/U01 | Correct role nav and real data boundaries |
| FE10 | Doctor dashboard, travel, arrival OTP, visit context | P1 | FE08/DC01–03 | Assigned doctor only, expiry/reconnect, patient timeline |
| FE11 | Clinical editor five steps, sign/amendment, autosave | P1 | FE10/DC04–08 | Synthetic/tested editor, reviewed clinical gates |
| FE12 | Record viewer, verification history, QR/photo/PDF, independent payment | P1 | FE11/DC09–14 | Individual evidence for all 14; no private leaks |
| FE13 | Lab manager/technician, orders/collections/reports | P1 | FE08/S01 | One scheduled collection journey; report release separately gated |
| FE14 | Ambulance operator/driver, fleet and scheduled trips | P1 | FE08/S01 | Scheduled transport journey only, 112 always visible |
| FE15 | Caretaker/agency, assignments and shifts | P1 | FE08/S01 | Nonclinical approved task scope and one assignment flow |
| FE16 | Mixed payment records, cancellation, notifications and support views | P1 | FE08/P01/D-POL | Honest states, policy version/approval, sandbox gates |
| FE17 | Admin content/FAQ/stories, support, audit and remaining scoped tools | P1 | FE06/U01 | Scope-limited queues + audited publish/review |
| FE18 | Optional Three.js/Anime.js, WhatsApp, assistant, memberships, advanced future UI | P2 | FE02/Q01 + approvals | No performance/security regressions; optional flags fail closed |
| FE19 | Full translation, accessibility, responsive and E2E regression | P0 | Every integrated slice/Q01 | Evidence by route/role/locale; no critical defects |
| FE20 | Staging handover, frontend inventory and client UAT | P0 | FE19/R02/H01 | Actual readiness and blockers, friend-ready handoff, explicit sign-off |

Practical parallelism after FE01: Claude coordinates integration and shared contracts; Codex may take contract adapters/tests/authorization-dependent UI; Kiro may take independent public or role module UI; actual assignment depends on verified tools and agent availability. Friend is not assigned active tasks until joined. Claude's task ticket includes objective, route list, allowed/forbidden paths, branch/base, contract, mock vs integrated mode, requirements, test commands and handoff format. Monitor agent sessions in Herdr if supported; processes may run in panes or headless depending on tested configuration. Do not assume launching a pane means delegation succeeded. Never give broad bypass permissions for convenience. If another agent cannot run, report limitation; continue a small independent slice. Each returns task ID, branch, commits, changes, tests, blockers, API deviations and screenshots if safe. Lead inspects diff, tests and security implications before integrating into development branch. Protect main and require owner-approved release. Avoid rebuilding working PRs or running arbitrary installation scripts.

## 22. Updated frontend schedule — November 18–23, 2026

The historic day-by-day plan begins Nov 17; today is Nov 18, and no implemented app is verified by this handbook. Recalculate against actual repo preflight. Six calendar days remain including the 23rd; do not represent missed milestones as complete. This is an aggressive staging target, not a 6-day full production promise. Start P0 frontend tasks immediately after common foundation and approvals needed for safe code work. UI fixtures can allow parallel progress while backend contract tasks are pending; integration and negative tests remain mandatory. If a dependency fails, move downstream date, cut optional work and report blocker.

| Date | Frontend delivery focus | Dependencies / exit gate |
|---|---|---|
| Wed 18 Nov | FE00–02: inspect repo, shared tokens/typography/shell, locale config, public landing and nav; start auth forms once contracts stable | Foundation commit; approved/unapproved content distinction; no fake provider/testimonials; build/keyboard/mobile |
| Thu 19 Nov | FE03–07: patient/provider signup and onboarding, profile completion, admin review basics, public directory/profile | Auth/verification contracts agreed; synthetic adapter if necessary; real authorization tests before calling integrated |
| Fri 20 Nov | FE08–10: shared booking wizard, manual acceptance, patient/doctor dashboards, timeline/travel/OTP | Canonical booking schemas/policies, server states; complete one tested doctor request-to-accept slice first |
| Sat 21 Nov | FE11–15: five-step consultation editor, all 14 clinical views, lab/scheduled ambulance/care operational UI in independent modules | Clinical gates synthetic only; backend assignment/draft/OTP contracts; prioritize actual safe slice over breadth |
| Sun 22 Nov | FE16–19: payments/support/notifications/admin CMS, remaining locale strings, responsive accessibility/security and integrated regression; optional polish only if core green | Approved policy, real integration readiness, freeze feature expansion; no unnecessary animations/integrations |
| Mon 23 Nov | FE20: fix critical issues, test evidence, staging preview, client UAT, friend handover and known gaps | Release hash, actual pass/fail, mock vs integrated inventory, no unauthorized production or clinical enablement |

Daily checkpoints: beginning = actual branch/commit and unblocked scope; mid-day = demo one coherent user journey and inspect test failures; end = reviewed commit, screenshots synthetic, evidence links, pending blockers, next 3 tasks. Do not spend all day on model selection or planning prose. If no secure booking integration by Nov 20, protect core doctor flow and move advanced extras. If any required clinical authorization test fails, keep those features disabled for real patients. Don't postpone i18n/keyboard labels until final day: build with locale keys and accessibility from the first component.

## 23. What the client and backend must provide

| Needed | Owner / dependency | Frontend behavior until ready |
|---|---|---|
| Brand logo, approved palette/type and real images | Client | Proposed palette, neutral brand text, licensed nonmisleading images |
| About/Our Story, published story consent, service claims, FAQs | Client/editor | Draft copy confined to staging or omit unapproved block |
| Legal identity, privacy/consent/refund terms, grievance contact, minors/retention rules | Client and qualified legal/privacy reviewer | No invented company/terms; block real collection/booking where not approved |
| Service PIN coverage, verified provider credentials and schedules | Provider ops/admin | No live listings until approved; synthetic staging only |
| Payment payee/issuer/taxes/settlement, cancellation rules | Finance/client | Test-mode or disabled payments, no fabricated invoice/fees |
| Clinical fields/validation, clinician signature, scope, consent and record governance | Clinical lead | Editor + synthetic fixtures only; no real prescriptions or records |
| Canonical route/data contracts, auth and RLS tests | Backend lead | Typed mock adapter, UI not marked integrated |
| SMS/WhatsApp support number, approved sender/templates/consent | Client ops | In-app or hidden optional CTA; no invented contact |
| Maps, AI allowance, memberships, pharmacy and emergency ops | Client / appropriate owners | Gated, no unapproved paid calls or service claims |

No additional frontend-specific paid subscription required to begin with existing Claude/Codex/Kiro/Herdr tooling and open-source libraries, subject to actual entitlements and licenses. Parent v2.3 pack controls hosting costs and approvals. Client owns commercial Vercel/Supabase and optional service billing. Do not purchase tool upgrades, paid UI kits or API subscriptions without approval. Existing developer tool access does not entitle runtime AI customer inference.

## 24. Frontend handover checklist and startup instruction

Save this file in the existing repo as `docs/FRONTEND_MASTER.md`, not over root README.md. If path already exists, compare and merge deliberately. Keep current README, DESIGN.md, AGENTS.md, CLAUDE.md, contracts and task ledger as the source of execution authority. Link this document from root README after lead review; frontend route proposals require contract confirmation. Do not create a second app or copy outdated archived settings. Reconcile D-WF as owner-confirmed; all D-POL, D-CLIN, D-PRIV remain dependent on actual approvals. Friend handover includes branch/base commit, app run instructions from inspected package scripts, required env variable names only, route/component map, design tokens, mock adapter scenarios, real adapter contract version, completed/pending pages, open PRs, test commands/evidence, synthetic screenshots, known defects/flags and next independent tickets. Store in docs/HANDOVER.md and per-task handoff docs, not only in chat.

Suggested owner message to Claude (frontend authorization only):

> Read README.md, CLAUDE.md, AGENTS.md, DESIGN.md, docs/FRONTEND_MASTER.md and the referenced v2.3 specs. Begin the frontend workstream from actual repository state. I control Claude; you orchestrate Codex and Kiro in Herdr using isolated Git worktrees and exclusive path ownership. Inspect existing implementation and contracts first. Establish FE00/FE01, then build frontend vertical slices in dependency order, using explicitly labelled synthetic fixtures when backend is not ready. Preserve root architecture and all existing work. Track FE tickets and parent IDs, including DC01–DC14, with actual tests and commits. Do not enable live clinical/emergency/payment/AI features, run production migrations, buy services, deploy publicly or use real patient data without separate approval. Report blockers and next tasks; do not mark mock screens as integrated. Start frontend now.

### Final completion statement

The target is a cohesive, accessible, multilingual healthcare marketplace interface with real integrations where verified, truthful status and safe handling of regulated/sensitive workflows. A complete frontend design does not imply a complete backend or a production release. Every route, form, status, button and exceptional state needs evidence; every real-patient activation needs the parent release gates. Do not silently remove any of the 14 clinical capabilities or the other role requirements. Deliver the largest safe, demonstrable slice and explicitly identify unimplemented or gated functionality.
