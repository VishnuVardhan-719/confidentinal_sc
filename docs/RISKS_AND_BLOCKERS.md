# Risks and blockers

## Verified from supplied material
- The uploaded v1.5 source kit is a documentation/specification/skills/scripts pack, not a runnable application repository. It contains no package.json, application src tree or applied migrations. The actual repository and separately uploaded project archive must be inspected in Phase 0 before creating a new app or assuming nothing exists.
- The detailed v1.5 specs were recovered from the nested ZIP and are available in `docs/specs/`; they are not missing.
- The v1.5 and v1.1/v1.3 schema concepts overlap but use different names/groupings. Canonical ERD/schema reconciliation is a P0 blocker before first migration.
- The dated 17–23 November plan is aggressive and must be rebaselined if work begins after its original dates.

- The v1.5 detailed consultation spec/day plan request all 14 consultation capabilities for the November 23 target, while the release-contract blueprint defers clinical records/prescriptions from the initial public release. Preserve every capability; obtain client clarification on milestone acceptance. Real-patient activation remains gated independently.
- The owner reports an expiring Fable/reset allowance. Verify exact Fable 5.2 entitlement/expiry and usage treatment in the account UI before heavy use; do not assume the older Fable 5 promotion applies to Fable 5.2.

## Must verify during Phase 0
- Claude/Codex/Kiro CLI versions, account-exposed models/effort, permissions, hooks, skills and actual delegation capabilities.
- Existing application repository, Git status, branches, lockfile, build/tests and code ownership.
- Existing website source, Firebase inventory, data migration and rollback feasibility.
- Domain/DNS ownership/access and production account ownership.

## Client/business approvals still open
- Legal business identity and approved legal copy.
- Logo and final brand approval.
- Verified provider coverage and credentials.
- OTP/SMS/email vendors, consent and costs.
- Merchant account, settlement model, taxes, cancellation/refund policies.
- Medical data hosting, retention, consent and qualified legal/clinical review.
- Emergency dispatch operating model; emergency dispatch stays disabled.
- Membership benefits/prices and licensed pharmacy partner; deferred.
- Client-owned hosting, database, monitoring, backups and recovery accounts.

## Delivery and release risks
- ₹10,000 is the quoted development fee, not an all-inclusive operations/hosting/legal/SMS/maps/payment budget.
- November 23 is an acceptance/staging candidate, not a guaranteed safe production launch.
- Real providers and operations must exist before users can book real services.
- Clinical features, live payments, emergency dispatch, pharmacy, subscriptions, GPS and payouts remain behind release gates.
