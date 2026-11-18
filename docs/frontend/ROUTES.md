# Frontend route inventory — draft

Snapshot: 2026-11-18, fe2-c HEAD 4c95a00. Authority: [FRONTEND_MASTER](../FRONTEND_MASTER.md), section 5 (catalogue), sections 8–16 (role/security requirements), and [API_CONTRACTS](../API_CONTRACTS.md). The latter describes proposed contracts, not evidence of implemented endpoints. This inventory covers browser routes; API endpoints are maintained in that contract.

All catalogue paths below have locale prefix /{locale}, with en, te or hi. Thus /patient/bookings/[id] means /{locale}/patient/bookings/[id], and / means /{locale}. Route groups are not URL segments. IDs remain opaque and unchanged by translation. The current unlocalized / is a Next scaffold; locale redirects/default landing still need implementation.

## Readiness and evidence

- **FIXTURE**: a rendered route works with synthetic adapters, an explicit fixture notice, real route guards and relevant fixture/browser checks. It is not production integration.
- **INTEGRATED**: a rendered route uses implemented backend contracts and verified server authorization; supported operations work against a controlled environment. Missing contracts stay visibly gated.
- **VERIFIED**: integrated route also passes its required role/ownership denial, RLS/private-file, responsive, accessibility, locale and workflow checks; applicable clinical/payment release approvals are recorded.
- **PENDING → FIXTURE**: the next target is FIXTURE; the route does not exist in this worktree. This is deliberately not a claim that fixture UI is ready.

Evidence: src/app contains only page.tsx, layout.tsx, globals.css and favicon.ico. No catalogue locale/private page is implemented in this snapshot; none is INTEGRATED or VERIFIED. Booking/directory unit tests do not promote route readiness. tests/e2e specs remain test.fixme; Playwright, page, scenario/auth and observer harness dependencies are outstanding. Other worktrees are not merged-route evidence. The unlocalized scaffold earns no product readiness label.

## Gates applying to all routes

Public browsing needs no sign-in. Public listings require verified, active providers and real coverage. Unknown IDs/slugs use localized not-found; private denial must not disclose entity existence. Every private route needs request-scoped server authentication, role/workspace authorization, active organization membership and resource/assignment checks as applicable; every mutation repeats these checks server-side and in DB. A role-wide advisory guard is insufficient for organization or clinical access.

Patient onboarding incomplete/unknown may access questionnaire/setup/account/help surfaces, but ordinary booking requires server-confirmed completion. Family booking consent and record-view grants are separate. Non-active providers retain approved setup/status/help views; suspension blocks operational writes and public booking. Admin is invite-only, scoped and MFA-protected, with no clinical access inferred from admin role. Workspace switching must clear old private state and reauthorize the selected membership.

Clinical features require explicit independent clinical enablement and approval; drafts are assigned-clinician only, patients receive permitted finalized records, and private files require per-issuance authorization and short expiry. Payment state never follows booking/clinical state automatically. Live gateway, payouts, emergency dispatch, GPS and recurring plans remain gated until their separate approvals/contracts pass. Feature flags and hidden buttons never replace server authorization.

## Public routes

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/` | Public | Approved public copy/assets; supported PIN for live availability. | PENDING → FIXTURE |
| `/about` | Public | Approved claims, team identities and assets only. | PENDING → FIXTURE |
| `/our-story` | Public | Approved editorial content only. | PENDING → FIXTURE |
| `/stories` | Public | Published, locale-reviewed stories; pagination/empty state. | PENDING → FIXTURE |
| `/stories/[slug]` | Public | Published record and approved author/consent; unknown slug → not-found. | PENDING → FIXTURE |
| `/how-it-works` | Public | Approved manual acceptance, collection and payment explanation. | PENDING → FIXTURE |
| `/doctors` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. | PENDING → FIXTURE |
| `/doctors/[id]` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. Recheck eligibility for the requested ID; unknown/ineligible → not-found. | PENDING → FIXTURE |
| `/lab-tests` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. Verified branch/test catalogue; multi-test quote requires server support. | PENDING → FIXTURE |
| `/lab-tests/[id]` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. Verified branch/test catalogue; multi-test quote requires server support. Recheck eligibility for the requested ID; unknown/ineligible → not-found. | PENDING → FIXTURE |
| `/ambulances` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. Scheduled transport only; no dispatch/ETA claim. | PENDING → FIXTURE |
| `/ambulances/[id]` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. Scheduled transport only; no dispatch/ETA claim. Recheck eligibility for the requested ID; unknown/ineligible → not-found. | PENDING → FIXTURE |
| `/caretakers` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. Approved nonclinical scope; recurring plans gated. | PENDING → FIXTURE |
| `/caretakers/[id]` | Public | Verified, active, publishable provider + actual service/PIN coverage; server price and advisory availability; no private fields. Approved nonclinical scope; recurring plans gated. Recheck eligibility for the requested ID; unknown/ineligible → not-found. | PENDING → FIXTURE |
| `/memberships` | Public | Informational/unpublished until plan, subscription and billing gates approved; no sale. | PENDING → FIXTURE |
| `/become-a-provider` | Public | Four category intents → signed-in category onboarding; no admin signup. | PENDING → FIXTURE |
| `/faq` | Public | Published, translated answers only. | PENDING → FIXTURE |
| `/contact` | Public | Approved channels, anti-abuse; no diagnostic/clinical free-text collection. | PENDING → FIXTURE |
| `/privacy` | Public | Approved legal identity, notice/version/date; unpublished until approved. | PENDING → FIXTURE |
| `/terms` | Public | Approved legal identity and service terms/version/date. | PENDING → FIXTURE |
| `/refunds` | Public | Approved cancellation/refund policy; no invented guarantees. | PENDING → FIXTURE |
| `/emergency` | Public | Proposed public 112 guidance; independent of auth, questionnaire, payment and JavaScript; dispatch disabled. | PENDING → FIXTURE |
| `/login` | Public | Supported auth only; safe internal next; expiry/rate-limit/recovery; staff/admin invite + MFA. | PENDING → FIXTURE |
| `/signup` | Public | Patient/four provider intents only; supported verification + versioned consent; no self-granted role. | PENDING → FIXTURE |

## Patient workspace

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/patient/dashboard` | patient | Own patient setup; required questionnaire completion is server-derived; no browser-persisted medical drafts. | PENDING → FIXTURE |
| `/patient/onboarding` | patient | Own patient setup; required questionnaire completion is server-derived; no browser-persisted medical drafts. | PENDING → FIXTURE |
| `/patient/profile` | patient | Own patient setup; required questionnaire completion is server-derived; no browser-persisted medical drafts. | PENDING → FIXTURE |
| `/patient/health-profile` | patient | Own patient setup; required questionnaire completion is server-derived; no browser-persisted medical drafts. | PENDING → FIXTURE |
| `/patient/family` | patient | Own account + explicit family consent/guardian/invite grant; booking permission does not grant record access. | PENDING → FIXTURE |
| `/patient/family/[memberId]` | patient | Own account + explicit family consent/guardian/invite grant; booking permission does not grant record access. | PENDING → FIXTURE |
| `/patient/addresses` | patient | Own patient setup; required questionnaire completion is server-derived; no browser-persisted medical drafts. | PENDING → FIXTURE |
| `/patient/bookings` | patient | Owner/authorized booking-for grant; integer-paise server snapshot; provider manually accepts; booking/payment/clinical states separate. | PENDING → FIXTURE |
| `/patient/bookings/new` | patient | Server-complete questionnaire, authorized member/address, covered verified provider, fresh schedule/price/policy review; eight steps; stable idempotent intent and uncertain-outcome reconciliation. | PENDING → FIXTURE |
| `/patient/bookings/[id]` | patient | Owner/authorized booking-for grant; integer-paise server snapshot; provider manually accepts; booking/payment/clinical states separate. | PENDING → FIXTURE |
| `/patient/records` | patient | Owner or explicit record-view family grant; clinical gate; permitted finalized source only, never clinician drafts. | PENDING → FIXTURE |
| `/patient/records/[id]` | patient | Owner or explicit record-view family grant; clinical gate; permitted finalized source only, never clinician drafts. | PENDING → FIXTURE |
| `/patient/documents` | patient | Owner/explicit grant, private storage; authorize every short-lived URL and upload; no forced document upload. | PENDING → FIXTURE |
| `/patient/payments` | patient | Own payment record; authoritative independent state; pay-after distinct; gateway/claim/refund actions gated by actual contracts. | PENDING → FIXTURE |
| `/patient/payments/[id]` | patient | Own payment record; authoritative independent state; pay-after distinct; gateway/claim/refund actions gated by actual contracts. | PENDING → FIXTURE |
| `/patient/notifications` | patient | Own authorized account/workspace; allowlisted fields and supported contract only. Own scoped notifications; safe payloads; optimistic read rollback on failure. | PENDING → FIXTURE |
| `/patient/support` | patient | Own authorized account/workspace; allowlisted fields and supported contract only. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/patient/support/[id]` | patient | Own authorized account/workspace; allowlisted fields and supported contract only. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/patient/settings` | patient | Own authorized account/workspace; allowlisted fields and supported contract only. | PENDING → FIXTURE |
| `/patient/memberships` | patient | Informational only; subscriptions/recurring billing and approved plans gate purchase. | PENDING → FIXTURE |

## Doctor workspace

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/doctor/dashboard` | doctor | Own provider setup/status; profile completeness differs from credentials/activation/suspension. | PENDING → FIXTURE |
| `/doctor/onboarding` | doctor | Own provider setup/status; profile completeness differs from credentials/activation/suspension. | PENDING → FIXTURE |
| `/doctor/profile` | doctor | Own provider setup/status; profile completeness differs from credentials/activation/suspension. | PENDING → FIXTURE |
| `/doctor/services` | doctor | Own approved provider + actual coverage and approved service/fee/schedule contract; server controls publishability. | PENDING → FIXTURE |
| `/doctor/availability` | doctor | Own approved provider + actual coverage and approved service/fee/schedule contract; server controls publishability. | PENDING → FIXTURE |
| `/doctor/requests` | doctor | Eligible provider request scope; minimum pre-acceptance patient details; versioned manual acceptance/decline. | PENDING → FIXTURE |
| `/doctor/visits` | doctor | Assigned doctor only; correct booking version/phase; consent and backend support for location; arrival challenge is booking-bound, expiring and replay-safe. | PENDING → FIXTURE |
| `/doctor/visits/[id]` | doctor | Assigned doctor only; correct booking version/phase; consent and backend support for location; arrival challenge is booking-bound, expiring and replay-safe. | PENDING → FIXTURE |
| `/doctor/visits/[id]/consultation` | doctor | Assigned doctor + clinical gate + arrival verified/service started for writes; five-step in-memory draft; versioned autosave, reviewed conflict, server-confirmed signing and audited amendment. | PENDING → FIXTURE |
| `/doctor/visits/[id]/records` | doctor | Assigned authorized clinician + clinical gate; finalized source and authorized short-lived PDF; no unrelated patient history. | PENDING → FIXTURE |
| `/doctor/earnings` | doctor | Collection/payout reporting only where authorized; live payouts gated; unpaid care may still finalize. | PENDING → FIXTURE |
| `/doctor/notifications` | doctor | Own authorized account/workspace; allowlisted fields and supported contract only. Own scoped notifications; safe payloads; optimistic read rollback on failure. | PENDING → FIXTURE |
| `/doctor/support` | doctor | Own authorized account/workspace; allowlisted fields and supported contract only. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/doctor/settings` | doctor | Own authorized account/workspace; allowlisted fields and supported contract only. | PENDING → FIXTURE |

## Lab workspace

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/lab/dashboard` | lab / scoped organization staff | Own authorized setup/status; distinguish branch, credential, catalogue and service activation. | PENDING → FIXTURE |
| `/lab/onboarding` | lab / scoped organization staff | Own authorized setup/status; distinguish branch, credential, catalogue and service activation. | PENDING → FIXTURE |
| `/lab/profile` | lab / scoped organization staff | Own authorized setup/status; distinguish branch, credential, catalogue and service activation. | PENDING → FIXTURE |
| `/lab/branches` | lab / scoped organization staff | Active lab organization membership + branch/action scope; assignment-limited technician access. | PENDING → FIXTURE |
| `/lab/catalog` | lab / scoped organization staff | Active lab organization membership + branch/action scope; assignment-limited technician access. | PENDING → FIXTURE |
| `/lab/staff` | lab / scoped organization staff | Active lab organization membership + branch/action scope; assignment-limited technician access. | PENDING → FIXTURE |
| `/lab/orders` | lab / scoped organization staff | Lab/branch scope + assigned collection/order; versioned workflow, no unrelated patient history. | PENDING → FIXTURE |
| `/lab/orders/[id]` | lab / scoped organization staff | Lab/branch scope + assigned collection/order; versioned workflow, no unrelated patient history. | PENDING → FIXTURE |
| `/lab/collections` | lab / scoped organization staff | Lab/branch scope + assigned collection/order; versioned workflow, no unrelated patient history. | PENDING → FIXTURE |
| `/lab/reports` | lab / scoped organization staff | Clinical/report-release gate + assigned branch/release permission; authorized finalized report/private files only; detail explicitly gated in master. | PENDING → FIXTURE |
| `/lab/reports/[id]` | lab / scoped organization staff | Clinical/report-release gate + assigned branch/release permission; authorized finalized report/private files only; detail explicitly gated in master. | PENDING → FIXTURE |
| `/lab/billing` | lab / scoped organization staff | Authorized lab billing scope; separate collections/payment; gateway/payout operations gated. | PENDING → FIXTURE |
| `/lab/notifications` | lab / scoped organization staff | Active lab organization membership + branch/action scope; assignment-limited technician access. Own scoped notifications; safe payloads; optimistic read rollback on failure. | PENDING → FIXTURE |
| `/lab/support` | lab / scoped organization staff | Active lab organization membership + branch/action scope; assignment-limited technician access. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/lab/settings` | lab / scoped organization staff | Active lab organization membership + branch/action scope; assignment-limited technician access. | PENDING → FIXTURE |

## Ambulance workspace

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/ambulance/dashboard` | ambulance / scoped organization staff | Own setup/status; vehicle/crew credential approval and activation tracked separately. | PENDING → FIXTURE |
| `/ambulance/onboarding` | ambulance / scoped organization staff | Own setup/status; vehicle/crew credential approval and activation tracked separately. | PENDING → FIXTURE |
| `/ambulance/profile` | ambulance / scoped organization staff | Own setup/status; vehicle/crew credential approval and activation tracked separately. | PENDING → FIXTURE |
| `/ambulance/fleet` | ambulance / scoped organization staff | Active operator membership + vehicle/crew scope; scheduled transport only; verified permits/class and coverage. | PENDING → FIXTURE |
| `/ambulance/crew` | ambulance / scoped organization staff | Active operator membership + vehicle/crew scope; scheduled transport only; verified permits/class and coverage. | PENDING → FIXTURE |
| `/ambulance/availability` | ambulance / scoped organization staff | Active operator membership + vehicle/crew scope; scheduled transport only; verified permits/class and coverage. | PENDING → FIXTURE |
| `/ambulance/requests` | ambulance / scoped organization staff | Assigned trip/operator dispatch scope for scheduled requests; server-approved assignment; no emergency ETA or unconsented GPS. | PENDING → FIXTURE |
| `/ambulance/trips` | ambulance / scoped organization staff | Assigned trip/operator dispatch scope for scheduled requests; server-approved assignment; no emergency ETA or unconsented GPS. | PENDING → FIXTURE |
| `/ambulance/trips/[id]` | ambulance / scoped organization staff | Assigned trip/operator dispatch scope for scheduled requests; server-approved assignment; no emergency ETA or unconsented GPS. | PENDING → FIXTURE |
| `/ambulance/billing` | ambulance / scoped organization staff | Authorized operator billing scope; separate collections/payment; live gateway/payouts gated. | PENDING → FIXTURE |
| `/ambulance/notifications` | ambulance / scoped organization staff | Active operator membership + vehicle/crew scope; scheduled transport only; verified permits/class and coverage. Own scoped notifications; safe payloads; optimistic read rollback on failure. | PENDING → FIXTURE |
| `/ambulance/support` | ambulance / scoped organization staff | Active operator membership + vehicle/crew scope; scheduled transport only; verified permits/class and coverage. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/ambulance/settings` | ambulance / scoped organization staff | Active operator membership + vehicle/crew scope; scheduled transport only; verified permits/class and coverage. | PENDING → FIXTURE |
| `/ambulance/dispatch` | ambulance / scoped organization staff | Future emergency dispatch; disabled pending explicit operational/safety/backend gates; public 112 remains available. | PENDING → FIXTURE |

## Caretaker workspace

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/caretaker/dashboard` | caretaker / scoped organization staff | Own setup/status; qualifications, approved scope and activation tracked separately. | PENDING → FIXTURE |
| `/caretaker/onboarding` | caretaker / scoped organization staff | Own setup/status; qualifications, approved scope and activation tracked separately. | PENDING → FIXTURE |
| `/caretaker/profile` | caretaker / scoped organization staff | Own setup/status; qualifications, approved scope and activation tracked separately. | PENDING → FIXTURE |
| `/caretaker/services` | caretaker / scoped organization staff | Active caregiver/agency membership + permitted nonclinical task scope; staff access assignment-limited. | PENDING → FIXTURE |
| `/caretaker/staff` | caretaker / scoped organization staff | Active caregiver/agency membership + permitted nonclinical task scope; staff access assignment-limited. | PENDING → FIXTURE |
| `/caretaker/availability` | caretaker / scoped organization staff | Active caregiver/agency membership + permitted nonclinical task scope; staff access assignment-limited. | PENDING → FIXTURE |
| `/caretaker/requests` | caretaker / scoped organization staff | Assigned permitted care task/shift; server schedule/conflict checks; no clinical nursing entitlement from care role. | PENDING → FIXTURE |
| `/caretaker/assignments` | caretaker / scoped organization staff | Assigned permitted care task/shift; server schedule/conflict checks; no clinical nursing entitlement from care role. | PENDING → FIXTURE |
| `/caretaker/assignments/[id]` | caretaker / scoped organization staff | Assigned permitted care task/shift; server schedule/conflict checks; no clinical nursing entitlement from care role. | PENDING → FIXTURE |
| `/caretaker/shifts` | caretaker / scoped organization staff | Assigned permitted care task/shift; server schedule/conflict checks; no clinical nursing entitlement from care role. | PENDING → FIXTURE |
| `/caretaker/plans` | caretaker / scoped organization staff | Advanced recurring plans disabled until approved scheduling, subscriptions and billing contracts/gates. | PENDING → FIXTURE |
| `/caretaker/billing` | caretaker / scoped organization staff | Authorized caregiver/agency billing scope; pay periods explicit; live payment/payouts gated. | PENDING → FIXTURE |
| `/caretaker/notifications` | caretaker / scoped organization staff | Active caregiver/agency membership + permitted nonclinical task scope; staff access assignment-limited. Own scoped notifications; safe payloads; optimistic read rollback on failure. | PENDING → FIXTURE |
| `/caretaker/support` | caretaker / scoped organization staff | Active caregiver/agency membership + permitted nonclinical task scope; staff access assignment-limited. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/caretaker/settings` | caretaker / scoped organization staff | Active caregiver/agency membership + permitted nonclinical task scope; staff access assignment-limited. | PENDING → FIXTURE |

## Admin workspace

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/admin/dashboard` | admin | Active invite-only admin + MFA and explicit capability; audit sensitive operations; no implied clinical access. | PENDING → FIXTURE |
| `/admin/providers` | admin | Provider-review capability + scoped entity; reason/version/self-approval controls; private documents authorized per signed URL; unknown status never active. | PENDING → FIXTURE |
| `/admin/providers/[id]` | admin | Provider-review capability + scoped entity; reason/version/self-approval controls; private documents authorized per signed URL; unknown status never active. | PENDING → FIXTURE |
| `/admin/coverage` | admin | Coverage-review scope and verified service/PIN support; mutations require contracted versioned audited decision. | PENDING → FIXTURE |
| `/admin/bookings` | admin | Scoped booking oversight; minimal necessary data; no clinical chart entitlement or forged status/assignment. | PENDING → FIXTURE |
| `/admin/bookings/[id]` | admin | Scoped booking oversight; minimal necessary data; no clinical chart entitlement or forged status/assignment. | PENDING → FIXTURE |
| `/admin/users` | admin | Explicit user-management scope; minimal identity fields; no arbitrary medical/family access. | PENDING → FIXTURE |
| `/admin/staff` | admin | Explicit membership/invite scope; cannot grant another organization or self-elevate privileges. | PENDING → FIXTURE |
| `/admin/payments` | admin | Explicit payment/refund capability + approved authoritative backend; no browser-generated paid/refunded state; live release gates. | PENDING → FIXTURE |
| `/admin/refunds` | admin | Explicit payment/refund capability + approved authoritative backend; no browser-generated paid/refunded state; live release gates. | PENDING → FIXTURE |
| `/admin/support` | admin | Active invite-only admin + MFA and explicit capability; audit sensitive operations; no implied clinical access. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/admin/support/[id]` | admin | Active invite-only admin + MFA and explicit capability; audit sensitive operations; no implied clinical access. Scoped support case ownership/assignment; authorized timeline only; no unnecessary clinical text. | PENDING → FIXTURE |
| `/admin/content` | admin | Content editor/publisher capability; approved copy/assets/legal content, versioned publishing; no fabricated claims. | PENDING → FIXTURE |
| `/admin/content/[id]` | admin | Content editor/publisher capability; approved copy/assets/legal content, versioned publishing; no fabricated claims. | PENDING → FIXTURE |
| `/admin/audit` | admin | Explicit audit-read scope; immutable metadata; no OTP, secret, PHI or signed-URL leakage. | PENDING → FIXTURE |
| `/admin/settings` | admin | Active invite-only admin + MFA and explicit capability; audit sensitive operations; no implied clinical access. | PENDING → FIXTURE |

## Shared private routes

| Route (locale-relative) | Role | Additional gate | Readiness |
|---|---|---|---|
| `/workspace/select` | Any authenticated, unrestricted account | Server-derived role/membership choices only; switch reauthorizes selected organization/branch and clears private caches/drafts. | PENDING → FIXTURE |
| `/account/security` | Any authenticated, unrestricted account | Unrestricted authenticated session; safe recovery, explicit sensitive-action reauthentication and privacy controls as supported. | PENDING → FIXTURE |
| `/account/privacy` | Any authenticated, unrestricted account | Unrestricted authenticated session; safe recovery, explicit sensitive-action reauthentication and privacy controls as supported. | PENDING → FIXTURE |

## Unresolved route contracts and promotion gates

- The master specifies four provider registration journeys, not four additional signup URL paths. Use /signup category intent and /{role}/onboarding for doctor/lab/ambulance/caretaker. No admin signup.
- Invite acceptance, verification callback, recovery/reset and MFA challenge URLs must follow the actual auth provider. Exact paths are TBD, not implemented routes or readiness claims; enforce expiry, one-time use, membership scope and safe internal redirects.
- Six role-root aliases (/patient, /doctor, /lab, /ambulance, /caretaker, /admin) may redirect to authorized dashboard/onboarding. Each redirect is PENDING → FIXTURE; no separate index screen is prescribed. Unsupported locale/unknown path → localized not-found.
- No standalone proof-token, photo, consultation-amendment or PDF browser route is prescribed. These remain authorized workspace features and proposed backend operations until approved route contracts exist. Do not infer public PHI routes.
- Promote a row only with route file, adapter/environment, implemented backend contract where applicable, resource/role-denial evidence, test output and applicable feature-approval reference. Injected loader authorizers must be wired to real request-scoped guards. Foundation integration and route implementation remain outstanding; pending fixme specs are not execution evidence.
