# Database Specification — Logical, Not Yet Migrated

**Status:** Proposed tables and constraints, designed for Supabase PostgreSQL. No SQL has been applied. Choose migrations only after reviewing authorization and client operations. `id uuid PRIMARY KEY` by default. Names are conceptual and can be refined once, not inconsistently renamed by different agents.

## Identity, users and organizations

| Table | Key fields / constraints |
|---|---|
| `profiles` | id auth.users FK, display name, locale, phone metadata, onboarding progress |
| `patient_profiles` | profile FK unique, DOB/age, health questionnaire complete_at |
| `patient_addresses` | patient FK, structured line/city/state/PIN, geocoordinates optional |
| `patient_health_facts` | patient ID, field type, value/unknown, self-reported source, recorded_at, latest version |
| `patient_documents` | patient FK, private storage key, type, review state |
| `family_relationships` | principal patient, relative patient, relationship, guardian/consent grant and revocation |
| `organizations` | uuid, kind (lab/ambulance/agency/clinic), registered display, status, unique public ref |
| `organization_members` | org FK + user FK + role/scope/status; unique active membership key |
| `providers` | uuid, org/independent owner FK, category, public_ref UNIQUE, verification/activation state |
| `doctor_profiles`, `lab_profiles`, `ambulance_profiles`, `caretaker_profiles` | provider FK, per-role credentials, specialty/resources |
| `provider_documents` | provider FK, private storage key, doc type, expiry, verification event |
| `provider_service_areas` | provider FK, PIN/city/state/geometry, status, valid_until |
| `provider_verification_events` | admin actor, decision, evidence, version, effective_at |
| `admin_capabilities` | user FK, named scoped permission; invite/MFA enforced |

## Catalog and scheduling

| Table | Key fields / constraints |
|---|---|
| `services` | provider FK, category, listing slug, published status |
| `service_price_versions` | service FK, currency INR, amount, units (visit/test/hour/day/quote), effective window |
| `provider_availability` | provider/resource FK, time windows, timezone, exceptions |
| `resources` | clinician, lab collector, vehicle, caregiver; owner provider/org |
| `resource_reservations` | booking FK, resource FK, time range with exclusion constraint where applicable |

## Booking, OTP, visit and clinical

| Table | Key fields / constraints |
|---|---|
| `bookings` | UUID, `#SCV-BKG...` unique, patient/provider/service, actual patient (family), schedule, address, immutable price/terms snapshot, service type, payment option, booking status, version |
| `booking_events` | append-only UUID, booking, actor, prev/new, timestamp, reason, idempotency ID |
| `booking_assignments` | booking, staff/resource, active assignment period and permissions |
| `visit_verification_challenges` | booking, assigned clinician, salted code verifier, expiry, attempts, consumed_at |
| `consultations` | UUID, `#SCV-VIS...`, booking one-to-one as applicable, clinician, status, draft_version, signed_at |
| `consultation_drafts` | consultation FK, encrypted/privacy-controlled content and version, saved_at |
| `vital_observations` | structured units, numeric fields, observed_at, recorder, warnings acknowledged |
| `clinical_assessments` | consultation FK, assessment/diagnosis notes, version, clinician |
| `prescriptions` | consultation FK, signed final version, clinician and issue time |
| `prescription_items` | prescription FK, drug, formulation/strength, actual dose, route, frequency, duration, quantity and instructions |
| `recommended_tests` | consultation FK, requested item, indication, status |
| `care_instructions` | consultation FK, advice, optional follow-up |
| `clinical_amendments` | immutable linked signed correction version/reason |
| `health_fact_verifications` | patient fact, professional actor, evidence/source, reviewed_at |
| `visit_evidence` | booking, optional photo private key, consent grant, retention state |
| `visit_proof_tokens` | booking, hashed expiring/revocable non-health QR token |

## Labs, ambulance, care

| Table | Key fields |
|---|---|
| `lab_branches`, `lab_tests`, `lab_orders`, `lab_order_items`, `collection_assignments`, `lab_reports` | organization/branch, pricing snapshot, assigned staff, private reviewed report, status |
| `ambulance_vehicles`, `ambulance_drivers`, `transport_trips`, `dispatch_events` | operator, verified resources, route/pickup, assignment, scheduled trip states; emergency disabled until gate |
| `care_plans`, `care_assignments`, `care_shifts`, `care_shift_events` | agreed plan, worker/schedule, each shift attendance and exceptions |

## Finance, subscriptions, communications, CMS

| Table | Key fields |
|---|---|
| `payments`, `payment_attempts`, `gateway_webhook_events` | booking, amount/currency/provider, gateway IDs, status, signature verification, dedupe |
| `payment_collections` | direct cash/UPI after-service records, collector, evidence/reconciliation |
| `invoices`, `receipts`, `refunds`, `settlement_ledger` | legal issuer, sequential compliant refs, amount/tax, payment linkage, immutable ledger |
| `membership_plans`, `plan_versions`, `patient_subscriptions`, `entitlement_usage` | approved Free/Plus/Pro rules, billing consent, plans frozen by version |
| `conversations`, `conversation_messages`, `assistant_tool_runs`, `ai_usage` | optional AI, consent/retention, limited logs; no raw clinical data by default |
| `whatsapp_contacts`, `whatsapp_events`, `notification_outbox`, `notification_attempts` | verified messaging consent, webhook dedupe, retry |
| `support_tickets`, `support_events`, `audit_events`, `consent_events`, `content_pages` | complaints, audit, privacy, localized CMS |
| `public_reference_counters` | prefix key, atomic next bigint; UNIQUE across formatted references |

## Explicit constraints

- Foreign keys, non-null where meaningful, unique per provider reference, unique per booking external idempotency key, check price nonnegative and currency INR, enum/status checks, timestamps in UTC, display in Asia/Kolkata when local Indian schedule applies.
- Prevent overlapping clinician/vehicle/caregiver assignments with PostgreSQL exclusion/transactional checks, not a frontend check.
- `booking_events`, finalized records, payment ledger and audit should be append-only; no insecure cascade delete of clinical history.
- Patient's submitted questionnaire may have explicit `unknown`/`none` markers; cannot require actual medical documents in absence of evidence.
- Provider activation depends on `verified` + active listing + coverage + availability; no self-granted approved state.
- All exposed tables have RLS with explicit allowed roles; cross-org / cross-patient / direct storage negative tests; service role never exposed publicly.
- Multi-tenant-like organization isolation inside one marketplace is not equivalent to independent white-label tenant deployment.

## High-level events and state ownership

Booking writes owned by booking service; medical records by assigned clinician under clinical service; payment settlement only by verified gateway/operator; notifications by outbox worker; admin review by authorized verification permission. Do not let both agents produce conflicting migrations—Codex primary migration owner, Claude reviews typed contracts.
