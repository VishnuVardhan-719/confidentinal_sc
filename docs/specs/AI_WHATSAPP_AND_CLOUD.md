# AI Assistant, WhatsApp Automation and Cloud Uptime

## Production topology

GoDaddy-managed `surecurevisit.in` DNS → Vercel-hosted Next.js site, APIs and background work triggers → managed Supabase Cloud PostgreSQL/Auth/private Storage. Client-owned Meta WhatsApp and approved SMS/email gateways. Ollama Cloud hosted inference via server-side API only. **Developer laptop off does not affect deployed site**. Uptime requires monitoring, redundancy/backup and incident response; provider service operations are distinct from cloud availability.

## SureCure AI: allowed and denied scopes

**Allowed first:** explain how service works, answer vetted FAQs, language-aware service discovery and filter verified provider listings, compare published fees/areas, return booking status for *authenticated patient* through scoped backend API, create unsigned **draft** booking with user review and explicit confirmation, support ticket creation.

**Not allowed:** diagnose individual symptoms, prescribe/dose medicines, reassure away emergency symptoms, automatically modify medical records, issue invoices, initiate charges or finalize bookings without patient confirmation, automatically approve doctors or privileged admin actions. Prompt injection cannot grant tools new permissions. Human support fallback and call 112 for emergencies.

**Tool contracts (proposed):** `searchProviders({category,pin,filters})`, `getPublishedService({id})`, `getBookingStatus({bookingId})`, `prepareBookingDraft({service,slot})`, `createSupportTicket({subject})`. Each runs through server-side auth/role checks and Zod validation. Never give an AI model a Postgres service-role token or unrestricted SQL tool. Keep secrets server-only.

**Free-only Ollama mandate:** published Ollama Cloud options include $0 subscription/pay-per-token model pricing and differing starter-credit text; included free model/inference availability must be confirmed *for this specific account*. Disable paid top-ups/paid fallback; no hidden use of paid OpenAI/Claude APIs (their chat subscriptions do not grant website inference). Server-side global budget/throttle + rate limiting and concurrency handling; AI switches OFF when truly free usage is unavailable/exhausted. Website directory and support forms remain functional.

**Language:** English/Telugu/Hindi with fixed translated UI and typed assistant locale context; refuse to automatically rewrite clinician-authored prescriptions or health facts. Approved source knowledge base for general information, with published date and human editorial responsibility. Avoid sending raw DOB, exact addresses, health records or phone numbers to AI by default.

**Privacy and abuse:** consent/boundaries, limited retention, separate chatbot vs healthcare records, user-level quota, bot moderation, trace tool calls sans clinical data, safe errors and response streaming timeout.

## WhatsApp steps

**Stage 1:** non-intrusive floating icon on public/booking pages opens authorized `wa.me` click-to-chat to client-owned phone. Prefill service type and public reference **only**, no diagnosis/medical history/OTP in URL. Accessible button/label and keyboard support, avoid obstructing emergency/booking CTA.

**Stage 2:** verified Meta WhatsApp Business Platform API integration (business account, verified number, policies/templates and opt-in). Signed webhooks and event idempotency, database-backed conversation state, location/choice/product links, verified user identity before private booking lookup, explicit consent, human handoff/complaint escalation. Send secure links for documents, not sensitive reports in chat. Live per-message costs are separate from Vercel/Ollama.

**Stage 3:** AI adds language understanding but is optional; deterministic booking flow continues without Ollama. Patient reviews fee/policy and confirms on authenticated web surface, provider manually accepts. WhatsApp message is a notification, not definitive service acceptance.

## Durable cloud operations

- Vercel requests are not permanent background workers: schedule jobs via durable outbox/queue + worker/cron with idempotent retries. Stripe/Razorpay/webhook events do not mutate booking without verification and dedupe.
- Secret manager for keys, staging/production separation, log redaction, error alerts, data subject controls, automated database backups and *tested* restore procedure.
- Uptime monitors website, booking APIs, database, webhook deliveries, email/SMS queues and AI independently. AI outage must not take down booking.
- Production health data requires approved cloud region/vendor/privacy/legal review; no ad-hoc use of US-hosted AI for personal medical records.

## Emergency ambulance operational gate

Do not advertise 24/7 emergency ambulance dispatch simply because cloud app runs 24/7. Require real staffed dispatcher with tested triage/switchboard, verified vehicles/crew and geography, escalation SLAs and fallback. Public 112 is available without registration; avoid false ETA and indefinite acceptance wait.
