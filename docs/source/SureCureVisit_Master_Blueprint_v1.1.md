# SureCure Visit — Production Master Blueprint
**Version 1.1 | 16 November 2026 | Target client handover: 23 November 2026**

## 1. Contract and scope
Build a responsive, rebranded Indian healthcare marketplace at surecurevisit.in. One business operates the marketplace; independent providers and organizations sell services under their own listings. This is not white-label SaaS. Use SureCure Visit as the public brand and surecurevisit.in as the production domain. The legal business name is unconfirmed; do not infer or associate any other company with the project. Obtain the client-approved legal identity and ownership details before publishing legal notices, merchant details or invoices. Patient selects provider; provider manually accepts; provider sets prices; online and pay-after-service options; nationwide discovery with actual local coverage. Six primary roles: patient, doctor, lab, ambulance, caretaker, admin. Employees have scoped organization memberships. Development budget ₹10,000; hosting, SMS, maps, payment fees, legal review, maintenance and operations excluded unless contract says otherwise. Deadline is seven days, not a guarantee of safe launch.

### Release contract
**November 23 acceptance candidate:** branded responsive public site, real auth, patient profiles, provider onboarding for all four categories, admin verification, verified provider search by PIN code, service listings with price, manual booking request/accept/reject/cancel for all four categories (scheduled transport only), patient/provider dashboards, payment-after-service record, basic operational audit, staging deployment and handover. Online payment test mode only until merchant approval and reconciliation tests pass; activate live payments only after gates. No dummy records on public production. If gates fail, deliver private staging and defer public transactional activation. The complete target below remains contractual only if explicitly agreed; negotiate additional milestones/budget rather than silently promise it in seven days.
**Deferred:** emergency dispatch, recurring payments, clinical records/prescriptions, lab reports, GPS tracking, automated payouts, pharmacy marketplace, advanced workforce scheduling, family paid benefits. Basic family profiles may be implemented only if authorization tests pass. Every unavailable feature is clearly labeled unavailable, not a working button.

## 2. Existing site and migration
Public audit: https://curevist.in/ shows doctor home visits, doctor onboarding, and lab link; privacy https://curevist.in/privacy discloses Firebase/GCP and medical/location data; https://curevist.in/terms excludes emergency response. Public access to https://surecurevisit.in/ returned 502 on audit; domain/DNS ownership unverified. Frontend dependencies, real records, payments, schema, hosting and credentials unknown. Obtain authorized read-only repository, package manifest, Firebase project inventory, Auth user counts, Firestore/Storage schema, rules, exports and backup; never send patient records or secrets to AI. Map identifiers and permissions, reconcile counts, migrate synthetic sample then restricted staging, preserve consent/retention, validate records and rollback. Firebase password migration may require compatible hash import or secure re-auth/reset; do not assume passwords transferable. Keep old site active; client approves cutover, redirects and data freeze/delta sync. Update legal text to match new services and vendors.

## 3. Architecture and deployment
One modular Next.js App Router + TypeScript repository; Tailwind CSS, shadcn/ui, Zod; Supabase managed PostgreSQL/Auth/private Storage; SQL migrations and generated DB types; PostGIS later for radius search; Vercel commercial hosting subject to vendor/privacy review; GitHub private repo and CI; Vitest/Playwright. Razorpay Orders/Checkout/webhooks and approved marketplace settlement product later; SMS/email provider after approval; maps optional for scheduled transport. Select supported stable versions at setup, pin lockfile. Use Node runtime for integrations needing it. Server Components for public reads, server actions/route handlers for authenticated operations; domain services in src/modules, database functions for atomic mutations. No separate NestJS/Redis/microservices initially. Durable outbox table + scheduled worker for reminders, retries and payment reconciliation; never rely on in-memory timers or fire-and-forget serverless tasks. Feature flags enforced server-side, default false for clinical, live payments, emergency, medicine, subscriptions, GPS.

Architecture: Browser → Next.js server → domain service → Postgres transaction/RLS; authenticated user Supabase session → scoped queries; private storage signed short-lived access; external payment webhook → signature verification → event inbox → transaction → outbox → retry worker. Public provider search uses sanitized published view; no direct access to private provider documents. Use service-role key only in narrowly scoped server-only jobs, never browser. Prefer user JWT + RLS for ordinary requests; elevated operations explicitly authorize and audit. SECURITY DEFINER functions only if necessary, fixed search_path, revoked public execute, explicit authorization. No caching of authenticated patient data in shared CDN.

Environments: local Supabase via CLI/Docker if available; isolated staging and production projects, credentials and payment modes; preview deployments use staging only; production releases via protected main after CI/client approval. Verify vendor data location, processor terms, backup/PITR and storage recovery requirements before real health data. Client owns production accounts, domain, payment merchant, billing and recovery; developer least privilege; MFA. GoDaddy DNS: add domain in Vercel, use exact records shown by Vercel, preserve MX/TXT, verify HTTPS apex/www and canonical redirect; staging protected, noindex; do not modify old domain until migration approval. Rollback via previous deployment plus backward-compatible DB migration; never assume code rollback reverses schema changes. Monitor sanitized errors, booking failures, webhook lag, backup age, uptime; document escalation contact and recovery drills. Suggested initial RPO/RTO for client approval: 24h/4h, stronger if clinical or emergency operations demand it.

## 4. Data model (logical schema, not executed SQL)
UUID PKs, timestamptz UTC, currency INR integer paise (bigint), NOT NULL where required, foreign keys, check constraints, indexed FK and search fields. Store local service timezone Asia/Kolkata for display, UTC intervals [start,end). No floating point money. Every mutable business record created_at/updated_at; immutable event rows. Use migrations, not dashboard-only changes. No blanket cascading delete for financial/clinical records. Retention and deletion approved by client/legal.

| Table | Key columns / constraints |
|---|---|
| profiles | id FK auth.users, display_name, phone, email, status; no self-editable privileged role |
| user_roles | user_id, role; unique pair; admin role granted by trusted process only |
| organizations | id, legal_name, owner_user_id, status, verification_state |
| organization_members | org_id, user_id, membership_role, status; unique pair; invitation lifecycle |
| providers | id, individual_user_id OR organization_id (exactly one), public_name, status, verification_state |
| provider_categories | provider_id, category; unique pair; category-specific approval |
| provider_documents | provider_id, type, private_object_key, expiry, reviewer_id, verification_state |
| provider_locations | provider_id, branch_name, address_id, active |
| service_areas | provider_id, location_id, state, city, pin_code, active; unique coverage mapping |
| addresses | owner_patient_id or provider_location reference, address fields, PIN, optional geo; private |
| patients | id, account_owner_id, name, DOB if necessary, relationship, status |
| patient_access | patient_id, user_id, scope, relationship, consent_reference, expires_at; unique grant |
| services | id, provider_id, category, title, description, duration_minutes, status |
| service_prices | id, service_id, version, pricing_unit, amount_paise, currency, effective_at; immutable versions |
| resources | id, provider_id, type (doctor, technician, vehicle, caregiver), active |
| availability_rules | resource_id, weekday, start_local, end_local, effective_dates |
| availability_exceptions | resource_id, start_at, end_at, reason |
| bookings | id, patient_id, requester_user_id, provider_id, service_id, category, status, requested_start/end, accepted_start/end, price_snapshot_paise, platform_fee_paise, tax_paise, total_paise, currency, payment_method, version, expires_at, idempotency_key; unique requester/key |
| booking_assignments | booking_id, resource_id, start_at, end_at, status; exclusion constraint for active overlapping resource intervals (GiST btree_gist) |
| booking_events | booking_id, previous_state, next_state, actor_id, reason, timestamp; append only |
| doctor_details | provider_id, registration_number, council, specialization, qualifications, verification |
| doctor_visits | booking_id unique, assigned_doctor_resource_id, visit_address_id, clinical_record_id nullable |
| clinical_records | booking_id, author_user_id, patient_id, notes, signed_at, supersedes_id; restricted, deferred |
| prescriptions | clinical_record_id, private_object_key, author_id, issued_at; deferred |
| lab_tests | provider_id, service_id, test_code, sample_type, preparation, turnaround |
| lab_orders | booking_id unique, collection_address_id, branch_id, collection_status |
| lab_order_items | lab_order_id, test_id, quantity, unit_price_snapshot_paise |
| lab_reports | lab_order_id, patient_id, uploader_id, private_object_key, released_at, version; deferred |
| ambulance_vehicles | resource_id unique, provider_id, registration, vehicle_type, equipment, credential_status |
| ambulance_drivers | resource_id, user_id, credentials, status |
| transport_trips | booking_id unique, mode scheduled/emergency, pickup_address_id, destination_address_id, vehicle_id, driver_id, trip_state |
| caretaker_details | provider_id, skills, qualification, verification, permitted_scope |
| care_assignments | booking_id, caregiver_resource_id, care_scope, start/end |
| care_shifts | assignment_id, start/end, attendance_state; prevent overlap |
| payments | booking_id, method, gateway, gateway_order_id unique, gateway_payment_id unique, amount_paise, currency, state |
| refunds | payment_id, gateway_refund_id unique, amount_paise, status, reason |
| settlement_entries | booking_id, provider_id, amount_paise, type, currency, external_reference, status; immutable ledger |
| webhook_events | provider, external_event_id unique per provider, payload_hash, received_at, processed_at, status; restricted payload retention |
| membership_plans | id, code, version, term, price_paise, benefits_json, status |
| subscriptions | id, owner_user_id, plan_id/version, gateway_subscription_id unique, period_start/end, state, auto_renew |
| subscription_members | subscription_id, patient_id, consent_grant_id; unique pair |
| entitlement_usage | subscription_id, benefit_code, booking_id, quantity, used_at; unique idempotency key |
| consent_events | user_id, patient_id, purpose, policy_version, decision, timestamp |
| notifications | recipient_id, channel, template, state, sent_at; no medical payload |
| outbox | event_type, entity_id, dedupe_key unique, attempts, next_attempt_at, status |
| audit_events | actor_id, action, object_type/id, outcome, timestamp, correlation_id; append only |
| support_cases | requester_id, booking_id, assigned_staff_id, state, restricted notes |

Implementation sequence: identity/provider/catalog/coverage → booking/assignment/events → payment/inbox/outbox → service details → clinical and membership. In week one implement only necessary tables; document deferred migrations rather than create unused tables. Public search index on published provider/category/PIN; private queries indexed on patient_id/provider_id/org_id; booking status/time indexes. Availability acceptance transaction locks booking and resource, checks verification, ownership, price and coverage, inserts non-overlap assignment, transitions state and outbox together. Reject concurrent stale version; idempotent retries. Provider-specific detail row must match booking category and ownership via transaction constraints/functions. No orphan bookings or double charges.

## 5. Permissions and organization isolation
| Actor | Read | Mutate |
|---|---|---|
| Anonymous | Published verified catalog, public profiles and coverage | None except rate-limited registration/contact |
| Patient/guardian | Own account, authorized dependents, own bookings and released records | Own profile, create/cancel eligible requests, payment initiation, consent |
| Provider owner | Own listings, organization bookings with minimal operational info | Prices, availability, staff invite, accept/decline and assign within org |
| Provider manager | Assigned org operational records | Delegated scheduling/assignment, not owner/admin privileges |
| Doctor | Assigned accepted visits and necessary consented medical info | Own visit status, signed clinical notes/prescriptions once enabled |
| Lab technician | Assigned collection details, minimum necessary address/contact | Collection status only |
| Lab authorized reviewer | Assigned lab orders and report data | Release versioned reports when enabled |
| Ambulance driver | Assigned active trip pickup/destination/contact | Trip progress only; no medical history browsing |
| Caregiver | Assigned shifts, agreed care instructions and contact | Shift status/attendance; no prescribing |
| Admin verification | Submitted credentials, public listing metadata | Approve/reject/suspend with reason; no routine clinical access |
| Admin operations/support | Minimum booking/payment metadata, assigned cases | Authorized cancellation/refund workflow, not arbitrary clinical edits |
| Security admin | Audit and incident data | Explicit time-bound break-glass access only if approved; logged |

RLS enabled on every exposed table and storage bucket; deny by default; test SELECT/INSERT/UPDATE/DELETE and RPCs using actual role tokens. Membership scoped to organization, active status checked on every mutation; role cannot be self-granted. Provider sees limited locality before acceptance, exact address/contact only after acceptance and only assigned personnel. Guardian consent verified; family plan membership alone never grants clinical access. No public bucket for IDs/reports. Signed links short lived, authorize each issuance; file MIME/size/magic-byte checks and malware scan before release. Admin MFA and separate capabilities. Tests must prove cross-org, cross-patient, unverified provider and suspended staff access denied, including direct API/Storage attempts.

## 6. Product features and workflows
Public: brand, home, four service categories, PIN search, provider listing/profile, transparent pricing, availability request, registration, contact, grievance, terms/privacy/refunds, emergency call 112. No fabricated ratings, testimonials or credentials. Responsive mobile/desktop, keyboard accessibility, accessible labels/errors, readable contrast. Proposed visual identity: teal/navy/white, calm clinical design; client approves logo, copy and assets. No assumption that every Indian location is served.
Patient: sign in, address, self/dependent booking, select verified provider/service/slot, review price and cancellation policy, request, status timeline, payment option, cancel, history/support; reports and memberships later. Provider onboarding: category, individual/company, credentials, branch/PIN, service pricing and availability, submit for review; admin approves category and listing; reverify expiry, suspend immediately if needed. Doctors: qualifications/council, visit requests, accept/decline, assignment and completion; later clinical notes/prescriptions. Labs: test catalog, multi-test orders, sample collection, processing, authorized report release later. Ambulance: operator, vehicle/driver credentials, transport type, pickup/destination, scheduled quote and acceptance, assignment/trip status; emergency disabled until gate. Caretaker: skills/background check, nonclinical care scope, hourly/daily pricing, availability, assignment and completion; recurring shifts later. Admin: provider queue, credential review, booking oversight, price listing moderation, support, suspension, audit, payment reconciliation/refunds, coverage controls; no blanket clinical access.

Common booking state machine: REQUESTED → ACCEPTED → CONFIRMED → IN_PROGRESS → COMPLETED. REQUESTED → DECLINED/EXPIRED/CANCELLED; ACCEPTED/CONFIRMED → CANCELLED subject policy; IN_PROGRESS → COMPLETED or INTERRUPTED with ops review. Online accepted booking holds resource for defined payment window; expires and releases hold if not paid; pay-after accepted booking confirms immediately. Requested quotes expire; price frozen at request and accepted terms; material changes require new patient approval. All transitions server-validated and actor-scoped; status history append-only. Provider manually accepts; admin can coordinate but cannot fabricate provider acceptance. Payment and service states separate.
Doctor: confirmed → en route → arrived → visit complete. Lab: confirmed → collection scheduled → collected → processing → report ready → completed (report release only after verification). Scheduled ambulance: confirmed → assigned → en route → picked up → destination reached → completed. Care: confirmed → assigned → shift started → shift ended → completed, multiple shifts in later phase. Cancellation, no-show, failed collection, vehicle breakdown and caregiver replacement are explicit exception states/events; reassignment requires authorization and patient notice.

## 7. Payments and subscriptions
Online: after provider acceptance create Razorpay order server-side for immutable total; client checkout; verify signature and authoritative gateway status; webhook raw body signature, event dedupe, amount/currency/order checks, transaction; never trust browser callback alone. On captured payment confirm booking; late capture after hold expiry enters reconciliation/refund, not silent rebooking. Retry/outbox and daily reconciliation; partial/full refunds bounded by captured minus refunded; provider payout via approved merchant/marketplace arrangement only; no collecting into developer account. Pay-after: confirmed booking with payment state DUE; provider records collection method/reference; patient receipt and dispute path; don't mark gateway paid; admin review mismatch. No storing card data. Client approves cancellation rules, taxes, invoices, commissions, settlement and chargeback responsibility. Monetization undecided; configurable zero platform fee initially, no automatic commissions without legal/financial approval. Healthcare fee splitting needs review.

Subscription recommendation (not approved prices): Family Free: household profiles and unified history; Family Plus: optional priority scheduling support, transparent partner discounts and reminders (no guaranteed doctor availability); Family Pro: expanded household limits and concierge coordination, not unlimited clinical care. Care plans: prepaid clearly defined shifts/hours with caregiver availability, replacement/cancellation terms and usage ledger; separate care service contract from membership. Medicine Plus/Pro: later licensed pharmacy partner benefit (delivery discounts/coordination), not unlimited medicines or prescription bypass. Do not sell or fulfill medicine until partner licensing, prescription verification, pharmacist workflow, jurisdiction rules and delivery policy reviewed. No insurance claims or reimbursement promises. Plans versioned, explicit consent and renewal/cancellation disclosures; recurring mandates through approved gateway, webhook handling, grace period/expiry, entitlement checks transactionally, refund policy; no entitlement before confirmed payment. Manual pay-after applies to individual services, not automatic membership renewal unless explicitly designed. Do not launch subscription checkout November 23; optionally show informational plans with no purchase until approved.

Emergency ambulance: immediate visible call 112 (https://www.mha.gov.in/emergency-response-support-system-erss). Never require login, payment or form completion before emergency instructions. Public platform not emergency dispatch until staffed verified coverage, 24/7 dispatch capability, vehicle/crew credentials, location accuracy, explicit acceptance, escalation timers, human fallback, tested communication and incident response, jurisdiction/legal approval and signed partner SLAs. No fake ETA/availability; no guaranteed response; if enabled later, urgent requests must not wait indefinitely for a provider. Scheduled transport does not substitute for emergency care. Official reference: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2279073&lang=1&reg=48.

## 8. API contract (proposed)
All JSON mutations validated Zod; authenticated session, role/membership, idempotency key for create/payment, version for state changes; 401 unauthenticated, 403 forbidden, 404 scoped not found, 409 conflict, 422 validation, 429 rate limit. Error codes stable, no sensitive details. Public GET /api/providers?category=&pin= and /api/providers/:id; POST /api/provider/onboarding; POST /api/admin/providers/:id/review; POST /api/providers/:id/services; PATCH /api/services/:id/price; GET/POST /api/bookings; GET /api/bookings/:id; POST /api/bookings/:id/accept|decline|cancel|complete; POST /api/bookings/:id/assign; POST /api/bookings/:id/payment-order; POST /api/payments/razorpay/webhook (signature, not user auth); POST /api/bookings/:id/pay-after-record; POST /api/admin/refunds; POST /api/files/sign (authorized scope). Service-specific transition endpoints validate category. Deferred /api/subscriptions, /api/emergency, /api/clinical. No generic arbitrary status PATCH. Server Actions may wrap same services, not duplicate rules. Pagination and server-side filtering for lists.

## 9. Repository layout
```
src/app/(public)/, (auth)/, patient/, doctor/, lab/, ambulance/, caretaker/, admin/, api/
src/modules/{auth,providers,organizations,catalog,coverage,bookings,payments,doctor,lab,ambulance,care,subscriptions,audit}/
src/components/{ui,shared,dashboards}/
src/lib/{supabase,auth,validation,feature-flags}/
supabase/migrations/; supabase/seed.sql (synthetic only)
tests/{unit,integration,e2e,rls}/
docs/MASTER_BLUEPRINT.md; docs/DECISIONS.md; docs/RELEASE_CHECKLIST.md
CLAUDE.md; .env.example; README.md; lockfile
```

## 10. Seven-day delivery schedule (IST)
| Date | Deliverable and stop condition |
|---|---|
| Nov 16 | Agree scope/client signoff, repo and staging, brand direction, inventory existing data, schema/permissions; if credentials absent use staging and record blocker |
| Nov 17 | Auth, profiles, orgs, RLS, provider application, admin review; test cross-tenant denial |
| Nov 18 | Public home/search/listings, four category profiles, PIN coverage, service price and availability UI; no unverified public listing |
| Nov 19 | Atomic booking request/accept/decline/cancel, price snapshot, resource conflict tests; patient/provider dashboards |
| Nov 20 | Category details, scheduled ambulance pickup/destination, pay-after records, admin operations; Razorpay test integration only if core passes |
| Nov 21 | Responsive/accessibility checks, RLS/security tests, concurrency, notifications, legal copy review, backups and deployment rehearsal |
| Nov 22 | Client UAT, fix blockers, smoke tests, data migration decision, domain verification, restore/rollback rehearsal; freeze scope |
| Nov 23 | Handover approved release, client-owned accounts/docs, launch only if gates pass; otherwise private staging with signed defect/deferred list |

Do not add advanced features to compensate for schedule pressure. If all four booking modules cannot pass tests, enable only tested modules and disclose clearly. Real launch requires real verified providers and operations, not just software. Later milestones: payment live + reconciliation; lab/clinical secure records; care recurring shifts and family memberships; emergency dispatch pilot; licensed pharmacy partner. Estimate each after requirements, not arbitrary dates.

## 11. Acceptance and go/no-go
- Auth: session expiration, recovery, role escalation denied, admin MFA; verified provider only publicly visible.
- Booking: patient A cannot read B, org A cannot read B, staff suspension takes effect; duplicate requests idempotent; concurrent acceptance cannot double-book; immutable price; all four category flows tested.
- Payments: signature tamper rejected, duplicate/out-of-order event safe, wrong amount rejected, failed/late payment handled, refunds bounded, pay-after distinct; live merchant approved before live switch.
- Files: private access, expired signed link, unauthorized object blocked; no real medical data until clinical gates.
- UI: mobile and desktop, keyboard navigation, clear empty/error states, real coverage, emergency 112 visible, unavailable features not advertised as active.
- Operations: staging isolated, secrets scanned, no PII in logs, rate limits, backups and restore tested, monitoring alerts delivered, client support contacts, legal/privacy/consent review, verified provider onboarding and signed UAT. No unresolved critical/high security or safety defects.
- Domain: HTTPS and canonical redirects, DNS verified, old site untouched until explicit migration approval. Document release hash and rollback.

## 12. Budget and ownership
₹10k development fee is very low for full target; agree capped November release and separately priced later work. No promise of unlimited support. Paid hosting/database/OTP/maps/payment costs and taxes billed to client; verify current vendor quotes before purchase. Use free development resources only with synthetic data; commercial production hosting and managed DB plan require approval. Estimate infrastructure separately from development; no purchase without authorization. Client owns merchant/domain/cloud, appoints operations and clinical reviewers, signs data processing/terms and coverage responsibilities. Developer hands over repo, migration instructions, environment variable names (not secrets), access inventory, tests, known issues, runbook, maintenance terms.

## 13. Decisions pending / blockers
Client signoff on release scope and ₹10k boundary; actual existing repo/data inventory and migration; legal business identity, brand/logo and approved copy; provider coverage and credentials; OTP/email method and provider costs; live payment merchant and payout model; booking hold/expiry/cancellation terms; medical data hosting/retention and applicable Indian privacy/healthcare requirements; emergency operations; subscription benefits/prices and medicine partner; domain access and DNS status. Default development assumptions: 30-minute request expiry and 15-minute online payment hold for scheduled bookings, configurable and client-approved before launch; zero fee; no emergency dispatch, pharmacy or recurring billing in initial release; no real data in AI tools. These are proposals, not client-approved policy.

## 14. Source and verification notes
Public existing site: https://curevist.in/ ; privacy https://curevist.in/privacy ; terms https://curevist.in/terms. National emergency service: https://www.mha.gov.in/emergency-response-support-system-erss. Technical references: https://nextjs.org/docs ; https://supabase.com/docs ; https://razorpay.com/docs/ ; https://vercel.com/docs . No repository, DNS console, database or live merchant access was supplied. This blueprint is a logical design and release plan, not implemented code, audited security or legal advice.
