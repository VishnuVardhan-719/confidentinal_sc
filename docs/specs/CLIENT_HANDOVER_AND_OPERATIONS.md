# Client Operations, Ownership and Handover

## Accounts and ownership

Client owns GoDaddy domain `surecurevisit.in`, Vercel commercial workspace, Supabase production/staging projects, GitHub repository according to contract, Razorpay merchant, WhatsApp Business, Maps, SMS, business email, incident contacts and backups. If domain purchased by developer, agree assignment/renewals and client access before cutover.

No outside company affiliation is established. Publish legal entity only after verified client-provided information. ₹10,000 development budget does not automatically include Vercel/Supabase/OTP/API fees, legal review or support staff. Support/maintenance terms must identify post-handover incident responsibilities and paid change requests.

## Operational team roles

- Provider verification desk checks professional/operating documents before active listings and audits credential expiry.
- Provider-side operations handle attendance, staffing/availability and delivery failures; central SureCure admin handles payment platform issues, disputes, escalations and abuse.
- Dedicated human escalation path for no-show, cash dispute, incorrect report, compromised account or medical incident. Clinical emergencies direct to authorized emergency services, not chatbot.
- Emergency ambulance only if trained, staffed dispatch and verified local crews/resources with escalation procedure and actual operating hours. Cloud uptime alone insufficient.
- Story/content editor obtains written permission for personal testimonials and medical stories; no fabricated metrics.

## Client acceptance and handover artifacts

1. Tested staging URL and exact feature list with statuses `ready`, `in testing`, `disabled`.
2. Application source and deployment architecture in client-owned accounts; no personal credentials exposed.
3. Database migration version history, RLS and role testing results, backup/restore documentation.
4. Payment reconciliation and accounting policy documented; invoices and merchant keys under client control.
5. Approved legal/consent pages, verified coverage configuration, provider vetting SOPs and complaint process.
6. Monitor/alert ownership and incident on-call, renewal/payment reminders, support SLA and ongoing service agreement.
7. Handover call/report and written sign-off or explicit staging-only approval. Detailed uncompleted backlog retained, not hidden.

## Operational checklists

**Daily:** verify booking requests waiting, manually accepted status/failed delivery, provider coverage, failed OTP attempts, pending payment mismatches, rejected webhooks, message queues and support tickets.  
**Weekly:** check backup recoverability/sample restore, provider credential expiry and audit alerts, error rates, localized UX defects, staff access and cost monitoring.  
**Monthly:** reconcile finances with accountant; review privacy requests, retention, domain/hosting bills, incident drill and service availability.

## Domain and migration safety

Current `curevist.in` site may be live and might use GCP/Firebase; private records cannot be inferred from public website. Request authorized read-only inventory and backup before migration. Build new site separately on client domain staging/preview. Prepare cutover with DNS TTL, SSL, redirect, data mapping, rollback and client authorization. Do not delete old Firebase account or existing medical records.
