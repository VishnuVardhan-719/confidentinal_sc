# System Architecture and Boundaries

## Architecture principles

- **One Next.js TypeScript modular monolith** with route groups for public/auth/patient/doctor/lab/ambulance/caretaker/admin; no separate databases per role.
- **Supabase-hosted Postgres** as source of truth. Every database action uses typed validated service layer, explicit role/organization/assignment checks and RLS (not just hidden buttons). Transactions for booking, price snapshot, status and OTP consumption.
- Public directory uses curated published views. Never return provider verification attachments or patients in public APIs.
- Private storage with authorized short-lived download links. Clinician notes versioned, audit trail append-only.
- User-bound Realtime channels for non-clinical booking status with reconnect fallback. No broad table-broadcast of medical details.
- Decouple asynchronous notifications/webhooks via durable outbox. Feature flags default OFF for unapproved clinical flows, paid subscriptions, live emergency dispatch, medicine fulfillment and billable AI.
- Build for `en`, `te`, `hi`: locale dictionaries + language selection + localized formatting. Identifiers, medicine instructions and audit events remain language-independent or clinician-authored.

## Suggested repository structure (target, not files already implemented)

```text
src/
  app/[locale]/(public)/
  app/[locale]/(auth)/
  app/[locale]/patient/
  app/[locale]/doctor/
  app/[locale]/lab/
  app/[locale]/ambulance/
  app/[locale]/caretaker/
  app/[locale]/admin/
  app/api/
  modules/{accounts,organizations,providers,catalog,coverage,bookings,visits,clinical,labs,ambulance,care,payments,subscriptions,assistant,whatsapp,notifications,audit,admin}/
  components/{ui,shared,marketing,dashboards,consultation,three,animations}/
  lib/{supabase,auth,permissions,validation,feature-flags,i18n}/
supabase/migrations/
supabase/seed.sql
messages/{en,te,hi}.json
tests/{unit,integration,e2e,rls}/
docs/
CLAUDE.md
AGENTS.md
DESIGN.md
```

## Logical request boundaries

**Public provider lookup:** locale/query → server validation → published verified provider listings → filter real coverage/price/availability → render; no AI or Maps necessary for all queries.

**Patient booking:** authenticated patient and completed onboarding → qualified provider/slot → atomic create with terms/price snapshot and idempotency → notify provider via outbox.

**Provider acceptance:** authorized provider/organization staff → compare booking version + verify resource availability → transactional status/slot hold → assign public reference and confirmation → outbox patient notification.

**Arrival OTP:** assigned doctor authenticated → verified arrival stage → scoped challenge → patient sees code, not via untrusted chat → code redeemed once server side → audit → Realtime status.

**Clinical note:** only assigned verified clinician for active visit → draft version/lock → finalize immutable signed record → private patient-specific rendering/PDF.

**Payment:** approved provider online gateway (verified amount/order/capture/webhook) OR recorded direct collection; ledger/payment state independent of visit stage. Never use browser callback alone as proof of money.

## Performance/security baselines

- Sensitive fetches no-store/private, no leaking secrets via source maps/logs, correct auth token propagation.
- Doctor/public search fast and crawlable with truthful service locality; provider cards have custom design and accessible forms.
- Next.js server components for public content; client components only interactive regions; Three.js dynamic import with static fallback, reduced-motion support.
- Limit role and data scope at Postgres and API; enforce clinician assignment and positive consent; admin does not equal medical data superuser.
- Automated code lint/typecheck, unit/integration/E2E, RLS negative tests, stress booking concurrency and OTP replay.

## Deployment topology

**Local dev:** optional Docker Supabase local with synthetic-only records, no production secrets.  
**Staging:** separately provisioned cloud project and private preview domain, client test accounts, no actual patient records.  
**Production:** client-owned Vercel Pro, Supabase Pro, GoDaddy DNS, Razorpay merchant etc after operational/security signoff. Separate keys, projects and environment variables. Single designated release integrator. Backup/recovery tested, rollback documented. Changes to production require audit even under broad agent autonomy.

## Platform expansion

Pharmacy is future licensed business, not just a UI tab. Emergency ambulance requires real staffed human dispatch. Subscription entitlements should be separate from care shift service contract. Existing Firebase data must be inventoried and migrated under client authority, not guessed.
