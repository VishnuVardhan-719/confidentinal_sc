# Booking, OTP, Doctor Consultation, Realtime and Documents

## Shared booking lifecycle

`DRAFT → REQUESTED → ACCEPTED` (provider manually accepts) → `CONFIRMED` (depending on payment policy) → `EN_ROUTE → ARRIVED → ARRIVAL_VERIFIED → IN_CONSULTATION → COMPLETED`. Support `DECLINED`, `EXPIRED`, `CANCELLED`, `INTERRUPTED`, `NO_SHOW` as valid event/exception states. Only permitted actors can transition. **Never allow generic PATCH status from untrusted client.**

- Patient chooses actual provider and service; PIN eligibility, active verification and availability checked server-side. Capture immutable service price, provider/patient IDs, address, localized notice and selected cancellation terms at request.
- Upon acceptance reserve slot atomically; generate immutable booking reference and **booking confirmation**. For online path create gateway order only after acceptance/appropriate hold; for pay-after path mark amount due. Invoice and receipt depend on actual legal supplier and payment/tax events; confirmation is not receipt of payment.
- Store append-only booking event history with actor, timestamp, previous/new state, idempotency/request ID and reason. Dedupe concurrent acceptances and block overlap.

## Doctor arrival verification (safe design)

1. Doctor taps Arrived for an accepted, assigned, scheduled visit. This event is authenticated and audited. Patient sees identity/photo/approved qualifications and an OTP only when arrival has been reported.
2. Create a cryptographically random **six-digit** one-use OTP, booking + assigned-doctor bound, valid for a short window (proposed five minutes). Store salted HMAC/hash, not plaintext; don't log or expose via analytics. Limit attempts, regenerate with invalidation, limit resends and audit outcomes.
3. Patient checks doctor in person. Do not share code with a caller claiming to be doctor ahead of arrival.
4. Doctor enters OTP in doctor account. Server verifies assigned visit, patient, active challenge, expiry, attempts and valid status in transaction. Marks `ARRIVAL_VERIFIED` then starts `IN_CONSULTATION` through explicit action; these can be consecutive but are distinct events.
5. Patient timeline updates through scoped Realtime subscription. On reconnect re-fetch authoritative server state; do not rely on websocket alone. Logged OTP events never contain the code.
6. Exception: controlled support-assisted fallback requiring two-party verification and audit; the doctor cannot approve their own OTP bypass. Emergencies must not wait for OTP.

## Consultation workspace (reference screenshot functionality, not design)

**Proposed 5-step editor:** Vitals → Assessment → Prescription/Tests → Care Instructions/Follow-up → Review/Sign. Keep persistent patient/context header. Mobile-first, no distracting Three.js/scroll spectacle. Allow navigation/back and draft save without data loss. Server reconfirms assigned doctor, active visit and allowed status on every write.

**Vital fields:** temperature (unit C/F explicitly), BP systolic/diastolic, pulse bpm, SpO2 %, respiratory rate, height/weight where relevant; thresholds warn on implausible/dangerous readings but preserve actual clinician-entered value and require acknowledgment, not silent correction. If a result is dangerous, clinical escalation SOP separate from auto-generated diagnosis.

**Assessment:** patient symptoms, duration, clinician examination findings, provisional/final assessment with clinically appropriate uncertainty, differential if clinician chooses, symptoms red flags and decision outcome. Never force an overconfident definitive diagnosis.

**Prescription:** potentially multiple medicine line items; separate medication name, formulation/strength, prescribed dose, route, frequency, duration, quantity, special instructions and allergies checked. Optional tests and referrals; no forced medicine if none clinically indicated. AI never autonomously prescribes or translates doses.

**Plan:** patient advice, follow-up appointment recommendation/date, emergency red flags as clinician-authored information, potential lab test requests. Draft with autosave/debounce, optimistic concurrency `version`, explicit saved/unsaved/error state and reconnection recovery. Avoid storing sensitive drafts unencrypted in localStorage.

**Finalization:** clinician reviews and signs; server validates identity, assignment, consent/status and required fields. Persist immutable version, clinician attribution and signed timestamp. Later corrections are append-only amendments (not silent overwrites). Patient sees approved record and secure PDF. Payment remains independent (`DUE`, `PAID`, `PARTIAL`, `DISPUTED`, `REFUNDED`).

## Documents, QR and photos

- **PDF visit summary** has patient and provider identity, visit reference/date, clinician-authored findings, prescriptions where appropriate, version, issue time and verification info. Private storage; short-lived authorized retrieval.
- **QR proof of visit** is a revocable, scoped, expiring token pointing to minimal confirmation of service, not a public chart/prescription/health history. QR never encodes an OTP or raw patient ID.
- **Photograph** optional with specific informed patient consent, documented purpose, private storage, access controls, retention and withdrawal handling. Do not require for record completion and do not encourage medical imagery without a clinical need.
- **Health fact verification**: retain patient-entered source, evidence if reviewed, reviewer and audit. "Doctor verified" must mean actual professional verification, not a click or patient declaration.

## Payments, invoices, cancellation

**Financial states:** `NOT_INITIATED`, `DUE`, `PROCESSING`, `PAID`, `PARTIALLY_PAID`, `DISPUTED`, `REFUNDED`. Record cash/UPI at provider separately from online Razorpay capture. Invoice issuer and jurisdictional tax rules remain open for accountant/client confirmation. Freeze agreed fee; material price change requires patient re-approval. No medical record deletion upon refund or payment failure.

**Hybrid cancellation:** platform baseline protections plus visible service-specific cutoff, reschedule/no-show and exception policy. Cannot invent a rule before client approves; placeholder policy should not be displayed as final.

## Real-time patient events

Doctor travel accepted → server mutates state and appends event → authorized patient subscribed to booking updates sees timeline update → reconnect/refetch fallback → optional notification, never promise exact ETA without real tracking/grounded calculation. Broadcast only minimal booking status; keep actual clinical content private and separately authorized.

## Service-specific adaptations

- Lab: provider confirms test order → technician assigned → sample collector arrives (optional one-time pickup code) → sample collected → processing → report independently reviewed and securely released.
- Care: recurring plan creates separate shift assignments; each shift has separate check-in/out and attendance evidence, not month-long static OTP.
- Scheduled ambulance: driver assigned/arrives/picks up/reaches destination, separate trip audit; emergency dispatch cannot depend on an OTP, ordinary booking acceptance or payment.

## Requested 14 consultation capabilities

1. Assigned-doctor authorization
2. Arrival OTP
3. Real-time patient progress
4. Vital signs/examination notes
5. Save draft/autosave with recovery
6. Clinical assessment/diagnosis
7. Finalized clinical record
8. Structured prescription
9. Patient view of consultation
10. Independent payment collection status
11. Health fact verification history
12. Privacy-safe QR proof of visit
13. Consent-based optional photography
14. PDF report generation

All 14 are **requested for the Nov 23 milestone**, not automatically accepted as safe to run with real patients. Each requires tests, staging review and client acceptance; release gaps must be made explicit, not hidden behind UI.

## Negative tests mandatory

Unassigned doctor cannot read/modify; expired/replayed OTP denied; wrong doctor cannot verify; ten concurrent accepts cannot double-book; RLS denies direct record reads; payment-failure path doesn't corrupt visit; patient can't view another patient's documents; unaudited change to signed clinical record denied; QR leaks no health data; consent withdrawal controls media; clinic record still finalizable when pay-after outstanding; reconnect recovers status.
