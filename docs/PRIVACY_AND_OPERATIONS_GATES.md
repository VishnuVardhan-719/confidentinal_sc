# Patient safety, privacy and operational readiness — v2.3

This is a decision checklist, **not legal advice or a compliance certificate**. Secure qualified client/legal/clinical review before handling real patient records.

## Indian law and data governance checkpoint

- Obtain a dated legal applicability matrix for the Indian Digital Personal Data Protection Act 2023 and the Digital Personal Data Protection Rules 2025, including phased commencement, before treating statutory duties as in force. Official sources: https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf and https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf.
- Verify relevant health-service professional registration, record-keeping and prescribing rules by provider category and jurisdiction. **Do not** assume one generic provider-verification checklist establishes clinical authorization.
- Document data controller/processor roles, vendor contracts, data location and transfer, purpose, notice, consent, revocation, access/correction/grievance procedures, retention, deletion exceptions, breach response and children's/guardian flows as approved by counsel.
- Avoid demanding unnecessary health history to *create an identity account*. The selected product requirement is mandatory questionnaire completion **before normal healthcare booking**, with truthful None/Unknown answers; preserve an unauthenticated route to emergency numbers.
- Keep source-of-truth raw clinician records unchanged; translations or patient summaries are supplementary and reviewed as needed.

## Operations and security verification

- Separate dev/staging/prod cloud projects, billing, backups, domains and secret scopes. No real PHI in staging or AI prompts.
- Threat model account takeover, provider impersonation, privilege escalation, coercion or sharing of OTP, forged webhooks, duplicate booking, malicious file uploads, support staff overaccess, lost provider phones and insider access.
- Add explicit incident classification, on-call name, escalation route, contact channel, recovery objectives and a restoration drill. Run tabletop scenarios for provider no-show, failed arrival verification, missing laboratory result, payment dispute and false ambulance dispatch expectations.
- Encrypt data in transit/at rest via approved providers, minimize logs and analytics, rotate revoked credentials, test private file delivery/expiry, and maintain independent backups with verified restore procedures appropriate to the plan.
- A service area being verified is not the same as active 24/7 coverage. Publishing availability requires provider rosters, real response ownership and updated operating hours.
- WhatsApp/SMS patient notifications must be opt-in where required, contain minimal detail and be reviewed for sender/templating/India DLT constraints if applicable.
- Provider employees and admins need MFA wherever available, deprovisioning, session invalidation, joiner/mover/leaver processes and a break-glass policy with immutable audits if one is implemented.
- User family relationships never imply blanket access to clinical records, particularly for adult relatives.

## November 23 milestone separation

1. **Documentation ready**: requirements, design, agreed policies and signed decisions.
2. **Staging functional**: real implementation with synthetic data and actual executed tests.
3. **Client acceptance**: client has reviewed actual working paths and recorded accepted defects/deferred features.
4. **Production authorized**: separate legal, clinical, financial, security, operations and deployment gates pass.

Never describe 1 as 2, 2 as 3, or 3 as 4.
