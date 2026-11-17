# Product Requirements — All Roles and Surfaces

## Scope summary

Healthcare service marketplace for India: doctor home visits, diagnostic labs/home sample collection, ambulance (scheduled plus eventual emergency), caretaker/home care, possible licensed-pharmacy partner medicine ordering, family memberships and recurring care, an AI support/discovery assistant, WhatsApp chat/automation, English/Telugu/Hindi. One app, one cloud data architecture and six primary role dashboards.

## Public guest experience

- `surecurevisit.in` opens premium **landing homepage**, not a login form.
- Pages: `/`, `/about`, `/our-story`, `/stories`, `/how-it-works`, `/doctors`, `/lab-tests`, `/ambulances`, `/caretakers`, `/memberships`, `/become-a-provider`, `/faq`, `/contact`, `/privacy`, `/terms`, `/refunds`, `/login`, `/signup` (localized prefixes `en`, `te`, `hi`).
- Hero shows useful search, service availability and verified claims; not generic animated filler. Curated authentic stories only with consent and editorial approval, no fabricated testimonials, numbers or provider credentials.
- Browse real verified providers and pricing without signup; redirect to login/role onboarding to request a booking.
- Global location/PIN selection and verified coverage filtering; absence clearly reported.
- Dedicated floating WhatsApp contact and optional AI chat with disclosure and fallback. Emergency 112 action highly visible, not hidden behind signup.

## Patient

- Quick account verification (phone OTP and supported methods) and mandatory onboarding questionnaire before non-emergency bookings. Make "Unknown", "No known condition", "No medicine", "None added" and "No documents" genuine choices rather than forcing false answers.
- Basic name/DOB or age, address and PIN, permitted household members/dependent relationships, clear consent and privacy explanations. Blood group, allergies, medications, surgeries, medical history, family section and documents section must be *answered*; medical document upload cannot be compulsory if none exists.
- Search/filter providers, public credentials and rates, request booking, manual approval, reference, cancellation policy, pay online or after service.
- Doctor progress timeline (confirmed/en route/arrived/verified/in consultation/completed), view visit OTP after arrival, view authorized clinician records, PDFs, payment documents, follow-up, history, support and subscriptions when enabled.
- Adult family data access requires explicit authorization; minor/guardian workflow distinct.

## Doctors

- Profile identity, public SCV ID, registration number/authority, qualification, specialty, experience, photo, languages, professional bio, service area/radius, pricing, availability, certificates and validation.
- Submitted/under review/changes required/approved/suspended onboarding statuses; no accepting visits until actually approved.
- New requests: view relevant service needs and availability; accept/decline. After acceptance, assigned visit address/contact, travel status and optional consented GPS.
- Arrived triggers short-lived OTP challenge available to patient; doctor enters valid one-time code; only backend moves to visit verified and consultation started.
- Clinical workspace: vitals with units/plausibility flags, exam, assessment/diagnosis, structured medicines, tests, advice, follow-up, manual and debounced draft save, autosave/error/conflict UX, signing/finalization and amendment version history.
- QR visit proof (no medical content), optional consent-based visit photo, PDF report, status and independent payment state, cash acknowledgment and support disputes.
- Avoid workflow in which unpaid invoice blocks legitimate clinical record completion.

## Labs and staff

- Organization owner/manager, multiple branches, applicable permits and accreditation evidence, catalog/test packages and prices, home collection areas, working hours, sample collectors, order management and report turnaround claims.
- Lab order contains multiple test line items; collection scheduling, collector assignment and status, failed visit/re-collection, processing, authorized clinician/lab reviewer release and private patient report access.
- Technicians only view minimum details for assigned jobs; cannot see entire patient history.

## Ambulance operators

- Company/sole operator, fleet, registration/permits, driver identities/qualifications, required equipment, base, coverage, availability, type (BLS/ALS/etc only where substantiated), transparent quote/base/distance policy.
- Scheduled pickup/destination, manual acceptance, assignment, pickup and completion states, cancellations/no-shows and payment.
- Emergency requests are a **distinct safety-critical system**, not normal manually accepted bookings. Keep emergency dispatch disabled until staffed dispatch, response SLAs, partner validation and escalation are tested. Provide visible emergency call 112.

## Caretakers and agencies

- Individual/agency, identity and relevant checks, skill/scope, permitted tasks, language, experience, photo, availability, hourly/day/week/month rates, travel radius and shift assignments.
- Care plan defines days/times, provider duties, rest/replacement, caregiver attendance/check-in/out per shift, patient confirmation, renewal and disputes. **Never allow unqualified caretaker to issue medication orders or clinical notes.**
- Subscription/membership is separate from contract for actual recurring hours; no unlimited care promise.

## Administrators

- Admin invites only, MFA, private SCV ID, scoped verification/operations/billing/support/CMS roles.
- Provider application queue, document expiry, admin approval/rejection with reasons, coverage activation, booking exception oversight, payments/settlements/refund reconciliation, staff access and investigations, support tickets and escalation.
- CMS for real stories, FAQs, brand copy, service areas, partners and notices, with revision history and approvals. Clinical records not default admin-readable.

## Common cross-cutting features

- Multiple organizations per user without merging privileges.
- Server-generated immutable IDs and audit trails; support phone/WhatsApp references.
- Rate limiting, anti-fraud, export/delete/privacy request process, accessibility, retry/reconnect, data backups and restoration checks.
- Three languages across essential flows; notifications preferred locale where offered, clinical records in clinician-authored language unless independently certified translation.
- Availability/fees/coverage are truthful; no fabricated real-time status or ETA.

## Acceptance framework

Each feature is **Not Started → In Progress → Implemented → Tested → Client Accepted → Production Enabled**. A screen that looks finished but has no real database/permission behavior is **not implemented**. Clinical/security/financial gates require negative tests and authorized client sign-off.
