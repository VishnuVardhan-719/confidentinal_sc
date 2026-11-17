# Account Onboarding, Role Profiles and Access Control

## Identity flow

1. Visitor can browse public pages with no login.
2. Patient/provider chooses signup, verifies phone or other approved identity mechanism; server creates internal UUID.
3. Route to appropriate role-specific onboarding; save partial progress privately.
4. Patient must *complete questionnaire* before normal healthcare booking; Unknown/None entries are permitted. Emergency contact instructions never depend on login.
5. Providers upload identity/credential evidence, services, prices and areas. Submit for review; admin verifies before service listing bookable.
6. Returning accounts route directly to dashboard if complete; otherwise resumed onboarding. Multi-role users select authorized workspace.
7. Admin accounts are invite-only and MFA-protected.

## Field catalogue

| Role | Public directory content | Private/verification/operational content |
|---|---|---|
| Patient | **None** (no public patient ID) | name, contact, DOB, address, health questionnaire, family relationships, history, medicines, allergies, surgeries, blood group known/unknown, documents private |
| Doctor | name, photo, specialty, qualification, languages, approved registration detail as permitted, SCV ID, price and service coverage | government ID, license evidence, payout details, private phone, home location, ongoing verification decisions |
| Lab org | brand name, branches, verified public category, test catalog, rates, location coverage, SCV ID | legal registration/permits, management contact, staff, lab certification evidence, settlement records |
| Caretaker | professional name/photo, skills, availability/rates, SCV ID, language | ID document, checks, private residence, personal contact, employment documents |
| Ambulance provider | operator name, approved fleet types, available regions, base rates, SCV ID | permits, VIN/vehicle proof, crew credentials, private dispatcher contacts, equipment review |
| Admin | **Never public** | invite identity, internal SCV-ADM ID, department, MFA and assigned capabilities |

## Organization model

- A login identity can hold patient status, provider status, and membership in one or multiple organizations. Do not store a single mutable `role` column as universal authorization.
- `organization_members`: `org_id`, `user_id`, role (`owner`, `manager`, `doctor`, `technician`, `driver`, `caregiver`, `billing`), status, scopes, created/disabled timestamps.
- Provider pages belong to provider entities, not user sign-in accounts. Org owner can add branches and employees. Provider verification is independent of membership permission.
- Individual independent doctor/caretaker also represented as provider entity with user ownership.

## Patient health questionnaire: mandatory but truthful

| Question | Valid answers |
|---|---|
| Blood group | Valid ABO/Rh **or Unknown**; do not infer |
| Allergies | Known details, No known allergies, Unknown |
| Current medicines | Listed, None, Unknown |
| Previous surgeries | Listed, None, Unknown |
| Medical history | Listed, No known history, Unknown |
| Family section | Add linked family members **or No members added** |
| Supporting documents | Upload available documents **or No documents available** |

Use patient-entered provenance and timestamps. Clinical verification claims require actual authorized professional review. A family membership does not grant access to another adult's records; consent/invite/guardian rights are specific.

## Permission matrix (summarized)

| Actor | Read | Mutate | Never |
|---|---|---|---|
| Guest | published directory, public story | public contact/search | patient private data |
| Patient | own booking, linked record with authorization | request booking, personal profile, consent | others' records, status spoof |
| Doctor | own assigned accepted visits/needed clinical data | travel status, OTP verify, clinical record for assigned visit | unrelated patients' files, own approval |
| Lab technician | assigned collection job | collection milestones | patient clinical history, lab report release without reviewer role |
| Lab manager/reviewer | own org tests and assigned reports | prices/assignments, reviewed release when authorized | competing org data |
| Ambulance driver | own active assigned trip | trip progress | unassigned records |
| Caregiver | own assigned shift and agreed instructions | attendance | prescriptions, unrelated patients |
| Org owner/manager | delegated org listings/bookings | service/assignment actions within scope | another org billing and private records |
| Admin verifier | submitted provider verification data | approve/reject/suspend with reason | casual clinical record access |
| Admin billing/support | scoped payments/issues and booking metadata | refund/issue workflows per policy | unrestricted document access |
| System worker | minimum system events | idempotent outbox tasks | arbitrary broad data export |

For each operation enforce identity **server side**, status, organization membership and assignment, row level security, role-specific field access and audit events. RLS is required on exposed Postgres tables and private storage buckets; test with actual role tokens and malicious direct API access.

## Public reference format

Internal `uuid` for every entity. Immutable database-generated and unique text `public_reference` for doctor `#SCV-DOC-000001`, lab `#SCV-LAB-000001`, ambulance `#SCV-AMB-000001`, caretaker `#SCV-CARE-000001`, admin internal-only `#SCV-ADM-000001`, staff types optional `#SCV-TECH-...` and `#SCV-DRV-...`. Booking `#SCV-BKG-...`, consultation `#SCV-VIS-...`, ticket `#SCV-TKT-...`. Use sequences/counters with transactions and UNIQUE constraints. Never use these references for authorization, login secret or OTP.
