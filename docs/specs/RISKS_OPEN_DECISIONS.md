# Risks, Blockers and Client Decisions

## Severe feasibility warning

A full nationwide provider marketplace + four service categories + all 14 clinical features + live emergency dispatch + AI/WhatsApp + three languages + subscription fulfillment cannot credibly be guaranteed in seven days on ₹10,000 from a blank codebase. The brief is the **complete architecture and requested feature set**; client acceptance by Nov 23 must be tied to tested, actual implementation. Avoid misrepresenting clinical readiness.

| Risk | Why serious | Mitigation / responsible decision |
|---|---|---|
| Legal entity unknown | Cannot issue proper legal docs/invoices or payment merchant without legal supplier | Client provides business registered name/details and tax advisor |
| Existing app data unknown | No access to private Firestore/Auth; can't promise migration | Authorized read-only audit, backups and documented reconciliation |
| Emergency ambulance expectation | 24/7 software ≠ emergency dispatch staffed and ready | Human dispatcher, validated providers/areas, escalation and 112; OFF until readiness |
| Mandatory sensitive health profile | Collecting sensitive information at signup has privacy/friction burden | Purpose limitation, consent, Unknown/None, access control, staged collection, legal review |
| Clinical safety | Wrong prescriptions, unlocked charts, unsigned notes | Real clinician confirmation, access tests, versioned signing, human review |
| Provider verification claims | Public badge may incorrectly imply official medical licensing | Evidence-led verification, expiry, published meaning, human review |
| Subscription model undefined | Price/benefits may lose money or violate restrictions | Model entitlements but do not sell until client approves economics/legal terms |
| Razorpay/settlements | Pay-after and online receipts/tax liability differ | Merchant/accountant approval, independent ledger, webhook reconciliation |
| Ollama free assumption | No-subscription can be billable tokens; free quota tiny | Confirm actual account tier/credits, zero-spend behavior, fallback FAQ |
| WhatsApp automation | Meta setup, opt-in, templates, message cost and security | Start click-to-chat; signed webhook and opt-in later |
| Provider geographic coverage | Public 'pan-India' may imply service anywhere | City/PIN activation only when verified capacity exists |
| Cloud backup and data jurisdiction | Paid cloud != compliant healthcare by default | Client legal security review, backup and restore drills |
| Agent race conditions | Claude and Codex editing schema/components concurrently | Separate worktrees, typed shared contracts and one migration owner |
| 3D performance/accessibility | Slow mobile experience undermines patient booking | Single lazy scene, fallback, reduced motion, hard performance budgets |
| Language accuracy | Medical terms/trust instructions incorrectly translated | Reviewed en/te/hi resources, preserve clinician-authored documents |

## Open questions requiring client answers

1. Client's actual legal name and tax invoicing entity (do not infer).
2. Who receives patient online funds, who receives cash, when provider is paid, who invoices, refund liability and merchant eligibility.
3. Exact service-specific cancellation windows, refunds, rescheduling and no-show charges.
4. Commission vs subscriptions vs provider listing fees: not approved.
5. Family Free/Plus/Pro final benefits, household member limits, pricing, renewal/cancellation, partnered pharmacy scope.
6. Actual provider vetting checklists per medical profession, lab permits, vehicles, caregivers and workforce contracts.
7. Real supported cities/PIN codes, verified coverage and target operational readiness.
8. Who is staffed for support, complaint escalation and ambulance 24/7 dispatch, with contact number and SLAs.
9. Data controller/processor, consent, age/guardian rules, retention, legal counsel and Indian healthcare compliance obligations.
10. Existing `curevist.in` repo/backend access, Firebase datasets and go-live migration decision.
11. Approved brand logo/photography, story/testimonial rights and About Us copy.
12. Client owns accounts/subscriptions/domain and payment authorizations, cost ceiling and maintenance contract.

## Release hold policy

Clinical functions OFF until assigned-doctor, RLS, OTP and signed-record tests pass. Emergency dispatch OFF until operational readiness independently confirmed. Live payments OFF until merchant and webhook reconciliation approved. Pharmacy ordering OFF until licensed partner/legal checks. AI OFF if paid inference might occur without explicit budget approval. Mark disabled features clearly; no deceptive live buttons.
