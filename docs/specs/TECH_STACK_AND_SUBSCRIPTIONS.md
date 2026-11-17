# Technical Stack, Subscriptions and Operating Costs (INR)

**Verified public plan pricing context:** 17 November 2026, reference USD→INR **₹93.8808** on 16 November 2026; card FX markup and tax may change final INR. Prices are snapshots and should be rechecked when purchasing. **Client production bills must not silently be deducted from ₹10,000 developer fee.**

## Tools already owned by developer — no new purchase

| Item | Status | Incremental cost now | Use |
|---|---|---:|---|
| Claude Pro / Claude Code CLI | Existing subscription | ₹0 | One of two code-writing agents, primarily UI and UX |
| ChatGPT Plus / Codex CLI | Existing subscription | ₹0 | Other code agent, primarily backend, tests, security |
| Google Antigravity | Existing/free editor | ₹0 | **Editor only**, no built-in Antigravity agents |
| Domain `surecurevisit.in` | Bought through GoDaddy | ₹0 immediate | Customer-facing domain; future renewal due |
| GitHub Free | Free account option | ₹0 | Private repo, PRs, branch protections within plan limits |

`₹0` incremental **does not mean ongoing Claude/ChatGPT subscriptions are free**. Do not upgrade Claude Max, ChatGPT Pro or Google AI subscriptions for this scope without usage evidence.

## Cloud application: product requirement and why

| Category | Selected | Why / tradeoffs | Stage |
|---|---|---|---|
| Framework | Next.js App Router, TypeScript strict | SEO and full-stack web + one modular monolith; server/client boundaries matter | Day 1 |
| UI | Tailwind + customized shadcn/ui + selective 21st.dev | Fast accessible elements without boilerplate design; licenses and generated code reviewed | Day 1+ |
| Visual motion | CSS, Anime.js, React Three Fiber / Three.js | One deliberate 3D scene, accessible and lazy-loaded; avoid on clinical/emergency paths | Day 2/6 |
| Internationalization | next-intl, checked dictionaries | Stable English/Telugu/Hindi copy; not AI-generated on each request | Day 1/2 |
| Core data | Supabase **Cloud** Postgres + SQL migrations | Relations, transactions, checks, organization ACL and bookings | Day 1 |
| Identity | Supabase Auth + MFA for admin | Session management, invitation and claims; app manages roles, not users themselves | Day 1/2 |
| Files | Supabase private Storage | Credential uploads, patient docs and prescriptions must not be public | Day 2/4 |
| Live status | Supabase Realtime | Patient portal receives doctor updates; reconnect/refetch fallback | Day 4 |
| Locality search | PIN/city tables; PostGIS optional | Only genuinely operational area; avoid expensive map calls for every search | Day 3 |
| Payments | Razorpay merchant approved + payment ledger | Online and pay-after-service; webhook reconciliation | Test Day 5 |
| WhatsApp | Meta Cloud API after client setup | Official messaging and templates; automated booking after user identity & policy gates | Day 6 optional |
| AI | Ollama Cloud API limited to truly included/free usage | Hosted inference, no laptop dependence; strict no-paid fail-closed policy | Day 6 optional |
| Backend async jobs | Postgres outbox + managed/scheduled execution | Safe retries and notifications, not in-memory delays | Day 4/5 |
| Tests | Vitest, Playwright, DB/RLS negative tests | Evidence that bookings/permissions work | Every day |
| Cloud hosting | Vercel **Pro** commercial | Preview/staging, Next.js runtime and production domain; verify data-processing terms | Launch gate |
| Observability | Sentry or equivalent + uptime | Errors and incident alerts; no clinical details in logs | Launch gate |
| Maps | Google Maps Platform | Address selection, routing where needed; ongoing usage billed | Optional |

**No requirement for** separate NestJS, Kubernetes, Kafka, Elasticsearch, Redis, six separate deployments, purchased theme or paid animation templates on day one. Add only for measured need.

## Recurring baseline — illustrative INR

| Service | List price USD | INR at ₹93.8808 | Recommended |
|---|---:|---:|---|
| GitHub Free | $0 | ₹0 | Keep |
| Supabase Free dev | $0 | ₹0 | Synthetic dev only; inactivity pause/no automatic backups |
| Supabase Pro production | $25/month starting | **₹2,347/month** | Client-owned; extra projects/storage/compute billed separately |
| Vercel Pro production | $20/month starting | **₹1,878/month** | Client-owned commercial deployment; usage credits/overage terms apply |
| **Base total** | **$45** | **₹4,225/month** | Before taxes and variable costs |
| Illustrative 18% tax addition | — | **~₹761** | Not a universal tax determination |
| **Illustrative base including 18%** | — | **~₹4,986/month** | Only if tax applies as assumed |

A small starting operations envelope of **₹6,000–9,000/month** might cover the base plans plus modest messaging/maps, but **is not a cap or guarantee**, and does not include human staffing/24x7 dispatch/clinical compliance. Vercel and Supabase prices vary by billed seats/projects/usage and may change. The ₹10,000 is the *quoted development budget*, not a month of guaranteed cloud operation.

## Cloud AI: zero paid-usage constraint

- User explicitly wants **Ollama Cloud, API key, only free allowances/models, ₹0 AI inference spend**.
- The published Ollama **Pay as you go** plan can be **$0 subscription yet tokens are chargeable**; another published Free description mentions limited starter usage credits. Do not equate an open-weight model with no-cost hosted inference.
- Verify account-specific included credits and **whether absolutely no paid inference can be triggered** before public AI activation. Do not insert credit card or purchase credits to bypass this preference.
- App needs server-side rate limits, global max request budget, short conversation/context limits, cache of verified FAQs, usage records, and AI feature flag default OFF. When free capacity is unavailable, return a deterministic FAQ and provider-search fallback. **Core booking never depends on AI uptime.**
- Don't put the API key in client JS, generated HTML or the repo; protect via hosting environment secret manager. No real patient personal/clinical data goes to the LLM without separately approved design and data-processing evaluation.

## API billing not covered by subscriptions

| Provider | Expected charging model | What to check before activating |
|---|---|---|
| Razorpay | Merchant processing fees | Current rates, settlement, refunds, marketplace eligibility and registered legal entity |
| Meta WhatsApp Cloud API | Messaging category/region/volume | Account approval, templates, opt-in, message charges and webhook configuration |
| SMS/OTP | Per SMS or verification | India DLT/templates, consent, delivery, fraud and per-message fees |
| Google Maps | Per API call / tier / included quotas | Geocoding, places, routes, cost caps; not every search needs maps |
| Email | Message volume/plan | Approved sender domain, anti-spam and operational notifications |
| Monitoring | Free tiers then usage | Protect logging from patient data; uptime alerts |
| Storage/backup | Varies by provider & level | Private docs, backups, restore testing and retention |

## Responsibility

Developer: existing CLI subscriptions, editor, local machine and development expertise. Client: domain renewal, commercial Vercel and Supabase accounts, payment merchant, WhatsApp Business, SMS, maps, patient support, operational/clinical/legal staffing and production access ownership. Document in contract.

## Official pages verified while preparing this kit

- Vercel plan/pricing, Hobby personal-only and Pro commercial: https://vercel.com/pricing
- Supabase plan pricing, Free pause and Pro backups: https://supabase.com/pricing
- Ollama Cloud published pricing and per-token model rates: https://ollama.com/pricing
- Next.js docs: https://nextjs.org/docs
- Supabase security guide: https://supabase.com/docs/guides/database/postgres/row-level-security
- Meta WhatsApp API docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview
- Razorpay docs: https://razorpay.com/docs/

**No purchase has been made by creating this planning file.**
