# Business rules and approvals — pre-start supplement v2.3

**Source of choices:** Owner’s previously confirmed planning decisions; these are not legal/tax approvals.

| Area | Confirmed direction | Still requires an owner/client-approved policy | Acceptance check |
|---|---|---|---|
| Money collection | **Mixed:** online/platform and pay-provider/pay-after-service possibilities | Per-service payee/merchant of record, refund liability, invoices, GST treatment, cash receipt reconciliation, settlements and fees | Never label cash as gateway-paid; immutable amount/collector/reference snapshots; refunds reconcile |
| Cancellation | **Hybrid:** platform-wide safeguards plus service-specific terms | Window, fee cap, no-show, provider late cancellation, refund timelines, consumer disclosures, reschedule limits | Terms/version shown before request; booking snapshots correct policy; disputed changes auditable |
| Support | **Shared:** provider first-line service resolution plus platform escalation | Ticket owner, severity, response targets, staffed hours, patient-safety escalation, decision authority, privacy access | Every ticket has assigned owner; unresolved cases escalate; no unsupported 24/7 promise |
| Coverage | **Verified only:** nationwide browsability but only real local bookability | Geographic rollout sign-off, PIN lists/coverage geometry, operating hours, capacity, provider verification expiry, deactivation handling | Unverified/inactive/out-of-area providers cannot be booked by UI or direct API |

## Release ownership / sign-off matrix

| Gate | Decision owner | Evidence before enablement |
|---|---|---|
| Brand, legal identity, privacy notices | Client + qualified legal reviewer | Approved organization particulars, notices, terms, contact/grievance point |
| Provider activation | Authorized verification admin + operations owner | Credential review evidence, service scope and local operating coverage |
| Scheduled doctor/lab/ambulance/care bookings | Product owner + provider operations | Provider capacity, cancellation/refund disclosures, incident escalation |
| Clinical records, prescriptions, lab report release | Qualified clinical governance owner + legal/privacy reviewers | Clinician identity/signature/authorizations, audit, medical record governance, signed test evidence |
| Live Razorpay/payments | Client finance/merchant owner + implementer | Live merchant validation, GST/invoice determination, refunds, webhook reconciliation |
| Emergency dispatch | Dedicated operations lead + client legal/safety approval | 24/7 staffed dispatch, vehicle/crew verification, escalation drill; otherwise disabled |
| DNS switch / public production | Client owner + engineering release lead | Written UAT signoff, rollback/restore evidence, service runbook, no open critical/high risks |

## Questions that must not be silently guessed

1. Which legal entity is named in terms, invoices, payouts and payment gateway account?
2. Who issues an invoice for each service and payment path? No invoice/receipt conflation.
3. Who receives and reconciles provider-collected cash or UPI outside the gateway?
4. Which exact cancellation fees and refund windows apply by service and event?
5. Who answers after-hours service failures and what is the backup escalation route?
6. Which specific PINs/providers are verified and operational on launch day?
7. What is *actually included* in November 23 acceptance, and what is only demonstrated in synthetic-data staging?

**Default until signed off:** client-facing paid/clinical/emergency flows remain disabled; use synthetic staging tests.
