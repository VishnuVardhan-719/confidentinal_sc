# Risks and blockers

## Technical risks and open work (2026-11-20, `main` at `3a223e2`)
- **Race runners never executed.** The pgTAP suites pass in CI, but `tests/rls/run_*_concurrency.py` (double-booking, double-accept, payment and notification races) have never run. Run `npm run verify:db` on a machine with Docker before any activation.
- **Repository is public** (R-1 in `docs/OWNER_DECISIONS_PENDING.md`) and holds confidential specs plus an email address in commit metadata. Owner should make it private.
- **B01 `service_role` writes are not hardened** on booking events and the outbox (`docs/handoffs/N01_codex_2026-11-20.md`). Real SMS/email/WhatsApp delivery must wait for it.
- **Doctor clinical answers missing:** the DC owner questions (`docs/handoffs/DC_clinical_core_kiro_2026-11-20.md`, `DC_extras_kiro_2026-11-20.md`) and D-CLIN / D-PRIV are open. Clinical gates stay off until answered.
- **Caretaker design gaps:** admission without a task list and closeout after suspension (`docs/handoffs/P5_care_kiro_2026-11-20.md`).
- **No ops or finance assignee** (OD-2, D-1, D-13): incidents cannot be closed and no booking can become paid.
- **UI not built.** The only UI work (`wip/U01a-onto-integ`) is an unverified merge onto an older backend.
- **PDF report** prints Latin text only; Hindi/Telugu need an embedded font.
- **No staging, monitoring or backup** yet (R02, Q01).

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
