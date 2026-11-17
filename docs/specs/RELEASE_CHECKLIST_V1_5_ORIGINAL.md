# Production / Client Acceptance Checklist

**Status:** Nothing checked; planning only. Acceptance milestone November 23, 2026. Client can accept a private staging demo if public safety gates aren't met.

## Application
- [ ] Public site has accurate brand, domain, no unknown company references, no fake stories/credentials
- [ ] en/te/hi essential signup/booking and error screens verified by human reviewers
- [ ] Mobile, keyboard, accessibility, reduced motion and low-bandwidth fallback tested
- [ ] Real location/PIN coverage and prices correspond to actual active verified providers
- [ ] All primary role routes backed by server authorization and RLS
- [ ] Staff org isolation and authorized patient-dependent access tested
- [ ] Provider credential review documented, including professional licenses where applicable
- [ ] Booking concurrency, idempotent provider acceptance, cancellation/exception paths tested
- [ ] Patient health questionnaire handles Unknown/None with privacy consent
- [ ] Doctor arrival OTP expiry/replay/rate limit/wrong actor tests pass
- [ ] Realtime progress secure; reconnect/refetch tested
- [ ] Clinical autosave, sign, immutable amendment flow tested and clinician-approved
- [ ] Prescription structured safety checks and patient privacy tests pass
- [ ] PDF/QR/private documents authorized; photo consent recorded and revocable
- [ ] Pay-after ledger and online sandbox reconciliation tested; no false paid state
- [ ] Client and accountant approve invoice issuer, taxation, refund and receipt rules
- [ ] WhatsApp and AI are optional, safe and billable AI disabled unless truly free

## Cloud and operations
- [ ] Client owns production Vercel/Supabase/merchant/Meta/domain accounts
- [ ] Staging and production secrets/projects separate; no credentials in repo
- [ ] Database backups and **tested restoration** documented
- [ ] Monitoring/alerts, incident contact and support operator designated
- [ ] Privacy/consent/retention, vendor and data location approved by client counsel
- [ ] Existing Firebase inventory/migration reconciled before replacing live patient workflows
- [ ] Emergency ambulance operational readiness confirmed independently **or disabled**, emergency 112 visible
- [ ] Medicine marketplace off until licensed pharmacy partner approved
- [ ] Paid subscription/recurring charge off until client approves plan/merchant/terms
- [ ] Security review with negative access tests and no critical unresolved issues
- [ ] Client sees actual delivery list, known blockers and gives written launch/staging sign-off

**Rule:** Incomplete critical gates → staging-only acceptance. Never claim 'production-ready' solely because the build passes.
