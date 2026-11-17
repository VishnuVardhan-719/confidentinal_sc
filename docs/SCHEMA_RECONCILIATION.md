# Schema reconciliation — S00 canonical crosswalk

_SureCure Visit · 17 November 2026 · Design proposal for Claude, Kiro and owner review_

---

## 📋 Status and task boundary

**Status:** DRAFTED; owner approval PENDING; independent Kiro review PENDING. No canonical SQL is approved or applied. Detailed proposal: [CANONICAL_SCHEMA_DRAFT.md](CANONICAL_SCHEMA_DRAFT.md).

| Task field | Assignment |
|---|---|
| Task / agent / human owner | S00 / Codex / Owner |
| Branch / base branch | `task/S00-erd-draft` / `develop` |
| Verified base commit | `137e002172ccfea1d90e6bff273f9c23f2251c7b` |
| Exclusive file scope | This file and `docs/CANONICAL_SCHEMA_DRAFT.md` |
| Dependencies | Source specifications; D-POL and D-PRIV remain open |
| Contract | Proposed canonical schema v0.1; API deltas are proposals |
| Acceptance | Outputs 1–8 drafted; output 9 approval stays pending; output 10 belongs to Kiro |
| Verification | Document coverage, links, diagrams and changed-file checks; no application/DB test claim |

The [task assignment](../TASK_S00.md) authorizes design documents only: no migrations, application files, package manifest or commits. Continuity and the pending decision entry are recorded here because two-file ownership excludes `.context/activeContext.md`, `DECISIONS.md` and shared task/handoff files. Claude can transfer this record during integration.

Sources: [README sections 4–9](../README.md), [v1.5 database specification](specs/DATABASE_SCHEMA.md), [v1.1 logical schema](source/SureCureVisit_Master_Blueprint_v1.1.md), [consultation requirements](specs/BOOKING_AND_CONSULTATION.md), [role permissions](specs/ROLE_ONBOARDING_AND_PERMISSIONS.md), [business approvals](BUSINESS_RULES_AND_APPROVAL_MATRIX.md), [permissions](PERMISSIONS.md), [API contracts](API_CONTRACTS.md), and latest setup decisions in [DECISIONS.md](DECISIONS.md). Historical v1.3 concepts below come from the inherited crosswalk; no separate v1.3 implementation is asserted.

## 🔗 Source-to-canonical mapping

`CORE` means initial-release proposal; `P2` means phase 2 after core, gated; `LATER` means excluded from initial migrations. Every inherited crosswalk concept is accounted for, including merges. Exact purposes, principals and retention classes are in the draft dictionary.

| Domain | Source concepts: v1.5; historical | Proposed canonical mapping and reason |
|---|---|---|
| User identity | `profiles`, `patient_profiles`; `profiles`, `patients` | CORE `profiles` for Auth identity; `patients` for service recipient. Merge `patient_profiles` into `patients`; nullable unique `self_profile_id` permits future dependents without a login per patient. Self-service only until dependent-access tests pass. |
| Address book | `patient_addresses`; `addresses`, `provider_locations` | CORE `patient_addresses` and `provider_locations`; split `addresses` by privacy/ownership. Bookings retain immutable private address snapshots. No shared patient/provider address row. |
| Health questionnaire | `patient_health_facts`, `patient_documents` | CORE versioned `patient_health_facts` with known/unknown/none; P2 `patient_documents`. No-document answer is questionnaire metadata, never a fabricated file. |
| Family access | `family_relationships`; `patient_access` | CORE `patient_access` is the sole scoped grant model, initially self grants; P2 `family_relationships` labels relationships only. Adult invite or approved guardian verification required before another person's access activates. |
| Organizations/members | `organizations`, `organization_members`, `admin_capabilities`; `organizations`, `organization_members`, `user_roles` | CORE first three names retained. Exclude universal `user_roles`: patient identity, provider ownership, active membership and server-granted admin capabilities independently authorize workspaces. |
| Provider/category | `providers`, `doctor_profiles`, `lab_profiles`, `ambulance_profiles`, `caretaker_profiles`; `providers`, `provider_categories`, `doctor_details`, `caretaker_details` | CORE one `providers` row per owner/category and matching profile extension. Merge `provider_categories` into `providers.category`; rename historical detail tables to corresponding profiles. Category-specific verification remains independent. |
| Verification | `provider_documents`, `provider_verification_events`; `provider_documents`, `verification_state` | CORE both tables. Protected current state derives from immutable review events, evidence validity and suspension. Resource credentials use resource-scoped documents in the same model. |
| Coverage | `provider_service_areas`; `provider_locations`, `service_areas` | CORE `provider_service_areas` for approved exact PINs/validity and `provider_locations` for branches. Rename `service_areas`. Geometry/radius search excluded from core; a branch never implies coverage. |
| Services/prices | `services`, `service_price_versions`; `services`, `service_prices` | CORE `services` and immutable `service_price_versions`; rename historical `service_prices`. Fixed visit/test/hour/day units initially; quote-only services unbookable until an approved quote flow exists. |
| Availability/resources | `provider_availability`, `resources`, `resource_reservations`; `availability_rules`, `availability_exceptions`, `resources`, `booking_assignments` | CORE split `provider_availability` into `availability_rules`/`availability_exceptions`; retain other names. Assignments define authority/history; reservations alone enforce occupancy. Canonical person resources prevent cross-org overlap. |
| Bookings/events | `bookings`, `booking_events`, `booking_assignments` in both | CORE names retained; immutable request snapshots, separate requester/patient, versions, append-only transitions. Material changes require patient re-approval; no generic status write. |
| Visit verification | `visit_verification_challenges` | P2 same name; clinician-bound one-use OTP with secret-keyed verifier, expiry, attempts/replay controls. Core completion cannot claim OTP-verified attendance. |
| Consultation/clinical | `consultations`, `consultation_drafts`, `vital_observations`, `clinical_assessments`, `prescriptions`, `clinical_amendments`; `doctor_visits`, `clinical_records`, `prescriptions` | CORE `doctor_visits` contains operations only. P2 six v1.5 names retained; historical `clinical_records` becomes immutable final-record version. Also retain v1.5 `prescription_items`, `recommended_tests`, `care_instructions` in P2. No clinical JSON inside core bookings. |
| Health fact review | `health_fact_verifications` | P2 same name; review refers to exact fact version, evidence and professional reviewer; self-reported provenance preserved. |
| Visit evidence | `visit_evidence`, `visit_proof_tokens` | P2 same names; optional consent-bound private evidence; hashed revocable expiring proof token with no public patient/health payload. |
| Laboratory | `lab_branches`, `lab_tests`, `lab_orders`, `lab_order_items`, `collection_assignments`, `lab_reports`; `lab_tests`, `lab_orders`, `lab_order_items`, `lab_reports` | CORE `lab_tests`, `lab_orders`, `lab_order_items`. Merge `lab_branches` into lab-kind `provider_locations`; `collection_assignments` into collector-purpose `booking_assignments`. P2 `lab_reports`; core completion means collection/processing handoff, never report release. |
| Ambulance | `ambulance_vehicles`, `ambulance_drivers`, `transport_trips`, `dispatch_events`; first three historical names | CORE first three; mode fixed to scheduled, private route snapshots and verified assignments. LATER `dispatch_events` (emergency dispatch). |
| Care | `care_plans`, `care_assignments`, `care_shifts`, `care_shift_events`; `caretaker_details`, `care_assignments`, `care_shifts` | CORE `care_plans`: one agreed nonclinical scope per booking. Merge `care_assignments` into caregiver-purpose `booking_assignments`; rename `caretaker_details` to `caretaker_profiles`. LATER `care_shifts`, `care_shift_events`; core has one bounded interval per booking. |
| Payments | `payments`, `payment_attempts`, `gateway_webhook_events`, `payment_collections`, `invoices`, `receipts`, `refunds`, `settlement_ledger`; `payments`, `refunds`, `settlement_entries`, `webhook_events` | CORE `payments` for amount due/collection projection and `payment_collections` for direct pay-after claims/reconciliation. LATER gateway attempts, inbox, refunds and ledger; rename `webhook_events`/`settlement_entries` to v1.5 names. LATER invoices/receipts pending issuer/tax policy. Confirmation/collection acknowledgment is neither legal document. |
| Membership | `membership_plans`, `plan_versions`, `patient_subscriptions`, `entitlement_usage`; `membership_plans`, `subscriptions`, `subscription_members`, `entitlement_usage` | LATER names only: `membership_plans`, `plan_versions`, `patient_subscriptions`, `subscription_members`, `entitlement_usage`; rename `subscriptions` to `patient_subscriptions`. |
| Messaging/outbox | `notification_outbox`, `notification_attempts`, `whatsapp_events`; `notifications`, `outbox` | CORE `notification_outbox`, `notification_attempts`; combine historical delivery intents into one durable outbox with attempt history. LATER `whatsapp_contacts`/`whatsapp_events` from full v1.5 schema. Click-to-chat needs no such tables. |
| AI audit | `conversations`, `conversation_messages`, `assistant_tool_runs`, `ai_usage` | LATER names only; no core AI schema or autonomous clinical/booking authority. |
| Support/audit/content | `support_tickets`, `support_events`, `audit_events`, `consent_events`, `content_pages`; `support_cases`, `audit_events`, `consent_events` | CORE audit/consent events. LATER `support_tickets` (rename `support_cases`), `support_events` pending staffed support policy. Exclude `content_pages` DB table from core: approved localized copy in version control suffices. |
| Public reference IDs | `public_reference_counters`; reference prefixes only | CORE same name: UUID PK, unique namespace/prefix, atomic bigint counter, unique immutable provider/booking references. Never a public patient reference. |

One support table is added: CORE `idempotency_requests`, for actor/action/key deduplication and request-hash conflicts across booking, collection and review actions.

## 📍 Required outputs and locations

| Output | Draft location / evidence |
|---|---|
| 1. Initial-release ERD, deferred separately | Section 2 domain ERDs; sections 6–7 separate deferred scope |
| 2. Canonical table dictionary | Section 3 CORE; section 6 P2; section 7 later disposition |
| 3. Every crosswalk row | Mapping above, including exclusions/merges |
| 4. Role/org/patient access and Storage | Section 4 policy families, access matrix, private buckets |
| 5. Booking/consultation/payment state machines | Section 5 with actors/guards; consultation explicitly P2 |
| 6. Constraints/indexes/concurrency | Section 8, global resource exclusion and idempotency |
| 7. Migration/rollback plan | Section 9; no SQL files |
| 8. API deltas | Section 10; proposed route contracts |
| 9. Dated owner decision | S00-D01 below: approval PENDING; draft Q01–Q12 |
| 10. Independent review / negative tests | PENDING — Kiro review and later executed implementation tests |

## ✍️ Decision record — S00-D01, 2026-11-17

| Field | Record |
|---|---|
| Proposal | Canonical schema v0.1: core first, then DC01–DC14 |
| Proposed by | Codex, S00, `task/S00-erd-draft` |
| Approval owner | Project owner; privacy/clinical/finance policy also requires qualified client reviewers |
| Owner approval | PENDING — no approving identity/date/evidence supplied |
| Independent review | PENDING — Kiro; S00 does not satisfy output 10 |
| Unresolved decisions | Draft Q01–Q12: patient access, cancellation, retention, legal issuer, collection reconciliation, coverage and operational/clinical gates |
| Existing decision honored | Latest setup entry in `DECISIONS.md`: D-WF resolved; D-CLIN scope order resolved to core first, then DC01–DC14, synthetic/private staging only |
| Migration gate | Owner design approval before initial SQL; independent review and relevant executed tests before shared staging/production migrations |
| Integration action | Claude reviews actual diff, transfers evidence to shared ledgers, assigns Kiro review, collects owner decisions |

Alternatives considered: patient-as-login extension versus distinct service recipient; multi-category provider versus per-category entity; overloaded status versus separate booking/operations/clinical/payment states. The draft recommends the latter choices to preserve dependent identity, category-specific approval and independent financial/clinical truth. These remain proposed choices.

## 🔍 Handoff and verification boundary

Review checks: every CORE table has a UUID key, principal, retention class and ERD entity; every source concept has a disposition; three state machines name actors and guards; no P2 tables appear in core ERDs; only two owned files change.

No application manifest exists at the inspected base. Build/typecheck, migrations, RLS, concurrency and E2E execution are not S00 evidence. Future test obligations are specified in the draft; document checks do not establish runtime security.

Verification evidence, 2026-11-17: `git diff --check` passed. A Node stdin document audit passed 259 assertions covering the original 24 domains/source concepts, 42 CORE dictionary/ERD entities, 17 separate P2 tables, all 14 DC requirements, 12 pending questions, local links, fences and the exact two-file scope. `node --check -` validated the audit script itself; it was not an application build. All six ER panels and three state diagrams parsed and rendered to SVG with Mermaid 11 in a browser. No test/preview artifacts are retained in the worktree.

Next task: Kiro challenges the draft; Claude resolves Q01–Q12, records owner approval, and assigns one migration author after the design gate.
