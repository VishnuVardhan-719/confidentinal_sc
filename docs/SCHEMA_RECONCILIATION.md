# Schema Reconciliation — Required Before First Migration

**Status:** NOT STARTED — design task only; no canonical SQL has been approved.  
**Sources:** `docs/specs/DATABASE_SCHEMA.md` (v1.5) and `docs/source/SureCureVisit_Master_Blueprint_v1.1.md` (standalone v1.1), with the v1.3 blueprint archived under `docs/source/v1.3_original/`.

This crosswalk identifies overlapping concepts and likely naming/grouping differences. It is not an approved migration map. Do not create tables solely from this candidate list. Claude coordinates the design; assign one agent to draft the ERD and another to independently challenge it. Owner approves material decisions before the first migration.

| Domain | v1.5 schema concepts | Historical v1.1/v1.3 concepts | Required decision |
|---|---|---|---|
| User identity | `profiles`, `patient_profiles` | `profiles`, `patients` | Decide whether patient is a one-to-one profile extension or a separately addressable household/member entity; preserve auth-user identity cleanly. |
| Address book | `patient_addresses` | `addresses`, `provider_locations` | Separate patient-owned private addresses from provider branch/location records; define ownership and shared-address rules. |
| Health questionnaire | `patient_health_facts`, `patient_documents` | No equivalent detailed tables in v1.1 | Define explicit `unknown`/`none`, versioning, source, consent, retention and access policy. |
| Family access | `family_relationships` | `patient_access` | Normalize relationship records versus scoped, revocable access grants; relationship alone must not authorize clinical reads. |
| Organizations/members | `organizations`, `organization_members`, `admin_capabilities` | `organizations`, `organization_members`, `user_roles` | Decide role/capability boundaries and whether admin permissions use a separate capability model. |
| Provider/category | `providers`, role-specific `doctor_profiles`/`lab_profiles`/`ambulance_profiles`/`caretaker_profiles` | `providers`, `provider_categories`, `doctor_details`, `caretaker_details` | Choose one category-specific model and define individual versus organization ownership without duplicating category state. |
| Verification | `provider_documents`, `provider_verification_events` | `provider_documents`, `verification_state` fields | Keep immutable review events separate from the current derived verification state; define expiry/reverification/suspension. |
| Coverage | `provider_service_areas` | `provider_locations`, `service_areas` | Distinguish branch address from service coverage polygons/PINs; do not imply national coverage without evidence. |
| Services/prices | `services`, `service_price_versions` | `services`, `service_prices` | Select one immutable versioned price model; freeze the selected price/terms on booking. |
| Availability/resources | `provider_availability`, `resources`, `resource_reservations` | `availability_rules`, `availability_exceptions`, `resources`, `booking_assignments` | Define slot generation, timezone, resource reservation interval and exclusion/locking strategy. |
| Bookings/events | `bookings`, `booking_events`, `booking_assignments` | `bookings`, `booking_events`, `booking_assignments` | Mostly same concepts; align state machine, actor, idempotency, optimistic version and immutable snapshot fields. |
| Visit verification | `visit_verification_challenges` | No equivalent detailed OTP table | Define one-use doctor-bound OTP/challenge, hashed verifier, expiry, attempts, replay protection and audit. |
| Consultation/clinical | `consultations`, `consultation_drafts`, `vital_observations`, `clinical_assessments`, `prescriptions`, `clinical_amendments` | `doctor_visits`, `clinical_records`, `prescriptions` | Keep visit operations, consultation workflow and immutable signed clinical records distinct where needed; define authorship and amendment model. |
| Health fact review | `health_fact_verifications` | No equivalent detailed table | Define reviewer authority, evidence, timestamp, version and patient visibility. |
| Visit evidence | `visit_evidence`, `visit_proof_tokens` | No equivalent detailed table | Define optional image consent/retention and expiring revocable QR; QR must expose no health data or raw patient ID. |
| Laboratory | `lab_branches`, `lab_tests`, `lab_orders`, `lab_order_items`, `collection_assignments`, `lab_reports` | `lab_tests`, `lab_orders`, `lab_order_items`, `lab_reports` | Normalize branches, assigned collectors, item price snapshots, report review/versioning and private release. |
| Ambulance | `ambulance_vehicles`, `ambulance_drivers`, `transport_trips`, `dispatch_events` | `ambulance_vehicles`, `ambulance_drivers`, `transport_trips` | Initial release is scheduled transport only; emergency dispatch remains disabled. Decide whether dispatch-event model is needed later. |
| Care | `care_plans`, `care_assignments`, `care_shifts`, `care_shift_events` | `caretaker_details`, `care_assignments`, `care_shifts` | Separate provider profile from agreed plan, assignment and per-shift evidence. |
| Payments | `payments`, `payment_attempts`, `gateway_webhook_events`, `payment_collections`, `invoices`, `receipts`, `refunds`, `settlement_ledger` | `payments`, `refunds`, `settlement_entries`, `webhook_events` | Distinguish gateway attempts, direct pay-after collection, legally issued invoices/receipts, refunds and immutable settlement ledger. |
| Membership | `membership_plans`, `plan_versions`, `patient_subscriptions`, `entitlement_usage` | `membership_plans`, `subscriptions`, `subscription_members`, `entitlement_usage` | Deferred. Do not activate subscription purchase/renewal until benefits, legal policy and billing are approved. |
| Messaging/outbox | `notification_outbox`, `notification_attempts`, `whatsapp_events` | `notifications`, `outbox` | Decide a single durable outbox model and retry/deduplication contract; no medical payloads in notifications. |
| AI audit | `conversations`, `conversation_messages`, `assistant_tool_runs`, `ai_usage` | Not present in v1.1 table list | Optional and feature-gated; never store unrestricted clinical payloads or permit clinical decisions. |
| Support/audit/content | `support_tickets`, `support_events`, `audit_events`, `consent_events`, `content_pages` | `support_cases`, `audit_events`, `consent_events` | Normalize support cases/events and localized CMS; keep audit append-only and consent versioned. |
| Public reference IDs | `public_reference_counters` | Prefixes described in product requirements; no detailed counter table | Use race-safe atomic counter/sequence strategy; never expose a patient public ID. |

## Required outputs before migration

1. A Mermaid ER diagram or equivalent ERD covering only initial-release scope and deferred modules separately.
2. A canonical table dictionary with exact names, purpose, ownership, retention and whether it is initial-release or deferred.
3. A source-to-canonical mapping for every table/concept above, including concepts intentionally combined or excluded.
4. A role/organization/patient access matrix linked to RLS policies and Storage buckets.
5. Booking, consultation and payment state-machine diagrams with allowed actors and transition conditions.
6. An index, unique-constraint, check-constraint and concurrency plan (including the resource overlap strategy).
7. A migration order and rollback/forward-correction plan.
8. API contract changes aligned to the approved canonical model.
9. A dated decision log entry naming the owner approval and unresolved questions.
10. Independent review of the ERD and negative authorization tests before any shared staging or production migration.

## Ownership and execution

- Claude: orchestrates and maintains the decision/task record.
- Codex: may draft the initial normalized schema/migrations in an isolated worktree after task assignment.
- Kiro: independently challenges the data model, role boundaries and edge cases in a separate task/worktree.
- Owner: approves the canonical model and any material business/privacy decision.
- One designated migration author at a time. Never let two agents edit migrations simultaneously.
