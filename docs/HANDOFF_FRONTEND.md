# Frontend handoff (H01)

Refreshed by Kiro on branch `docs/H01-handover`, base `integ/all` at `e7165fd`. Every fact below was read from the code at that commit: `src/app/api/**/route.ts`, `src/lib/**`, `supabase/migrations/*.sql` (latest definition of each function), `supabase/config.toml`, `.env.example`, `package.json` and `.github/workflows/ci.yml`. Items marked **UNVERIFIED** were not confirmed by running anything. Nothing in this document was checked against a running database.

This file is for a frontend developer who has never seen the repository. The owner still directs the work and assigns tickets. Claude coordinates integration.

## 1. Where things stand

- `integ/all` contains the backend (identity, provider onboarding, catalog, booking for doctor visits) and **no UI**. `src/app/page.tsx` is a one-line placeholder and `src/app/layout.tsx` is the default Next.js layout.
- `develop` is 24 commits behind `integ/all` and does not contain the backend routes. Branch from `integ/all` unless the owner names a different base.
- Unmerged, unreviewed UI work exists on `origin/feat/fe2-*` (newest: `feat/fe2-integration`, 2026-11-19, with `docs/frontend/RESUME_HERE.md`) and older `origin/task/U01-*`, `task/U02-*`, `task/U03-integration`, `fix/U01a-*`, `wip/frontend-pause-2026-11-18`. Its own resume note says its `http` adapter follows `docs/API_CONTRACTS.md`. **That file is the original proposal and does not match the implemented routes** (section 6 lists the differences). Ask the owner whether to continue that work or start fresh before picking a ticket. Do not merge those branches yourself.
- `docs/API_CONTRACTS.md` still says "Nothing below is implemented". Use section 5 of this file as the contract instead.

## 2. Setup

### Tools

| Tool | Version | Source |
|---|---|---|
| Node.js | 24 | `.github/workflows/ci.yml` (`node-version: 24`). `package.json` has no `engines` field. |
| npm | the one bundled with Node 24 | `package-lock.json` is committed; use `npm ci` |
| Docker Desktop | any current | needed only for local Supabase |
| Supabase CLI | not pinned in the repo; run with `npx supabase` | **UNVERIFIED** which CLI version the owner uses |

Stack from `package.json`: Next.js 16.4.6 (App Router), React 19.3.0, TypeScript 5 (strict), Tailwind CSS 4.3.3, Zod 4, `@supabase/supabase-js` 2.x, `@supabase/ssr`, Vitest 5, ESLint 9. shadcn/ui is approved in `AGENTS.md` but **not installed yet**. Playwright is approved but **not installed yet**.

### Clone and install

```
git clone https://github.com/VishnuVardhan-719/confidentinal_sc.git
cd confidentinal_sc
git checkout integ/all
git checkout -b task/<TICKET-ID>-short-name
npm ci
```

### Local Supabase

`supabase/config.toml` defines project `surecurevisit` on non-default ports so it does not collide with other stacks:

| Service | Port |
|---|---|
| API (REST, Auth, Storage) | 58421 |
| Postgres | 58422 |
| Studio | 58423 |
| Local mail viewer | 58424 |

Commands for you to run (I did not run them):

```
npx supabase start     # applies every file in supabase/migrations
npx supabase status    # prints the local API URL and keys; copy them into .env.local
```

Local Auth settings that affect UI testing: sign-up is on, email confirmation is **off** (you can log in right after sign-up), TOTP and phone MFA are **off**. Because MFA is off, no local user can reach `aal2`, so every admin endpoint returns 403 locally (section 5.4).

`supabase/seeds/local_demo.sql` is a synthetic **local-only** demo seed. `db reset` does not load it (the DB test fixtures use the same PINs), so load it by hand on a freshly reset database: `npx supabase db reset` then `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/seeds/local_demo.sql` (it refuses to run if any user exists). Run `npx supabase db reset` again before the database test suites. Log in with password `SureCure-local-demo-1` as `patient@seed.example.invalid` (Asha Demo, one address in PIN 599991), `doctor.one@seed.example.invalid` or `doctor.two@seed.example.invalid` (approved individual doctors with a published home visit, coverage of PINs 599991 and 599992, and a 09:00-18:00 IST schedule every day), or `reviewer@seed.example.invalid` (no admin capability). Public search for category `doctor` and PIN `599991` returns both doctors. The seed opens only the `doctor` database gate; lab, ambulance and care stay off, and the route env flags in `.env.local` still apply. No ops (`booking:incident`) or finance user is seeded (OD-2, D-1).

### Environment variables (names only)

Create `.env.local` (all `.env*` files except `.env.example` are gitignored). Never commit values. Never paste them into prompts or logs.

| Name | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/env` (required, must be a URL) | local value from `supabase status` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/env` (required) | public anon key from `supabase status` |
| `SUPABASE_SERVICE_ROLE_KEY` | nothing at runtime | optional in `src/lib/env`; no route reads it. Leave empty. Never expose it to the browser. |
| `FEATURE_CLINICAL`, `FEATURE_LIVE_PAYMENTS`, `FEATURE_EMERGENCY_DISPATCH`, `FEATURE_PHARMACY`, `FEATURE_SUBSCRIPTIONS`, `FEATURE_GPS`, `FEATURE_AUTOMATED_PAYOUTS` | `src/lib/feature-flags` | OFF unless exactly `"true"`. Server-side only: `isEnabled()` reads `process.env`, so call it in Server Components or route handlers, never in client components. Leave all empty. |

### Run the app and tests

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server, http://127.0.0.1:3000 (matches `site_url` in `config.toml`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm test` | Vitest, `tests/unit/**/*.test.ts` only (13 files at `e7165fd`) |
| `npm run build` | production build |

CI (`.github/workflows/ci.yml`) runs `npm ci`, lint, typecheck, test and build on pull requests. All four must pass before you ask for review.

Database tests (`supabase/tests/*.test.sql`, pgTAP, run with `npx supabase test db`) and the Python RLS runners in `tests/rls/` belong to the owner. One Vitest file (`tests/unit/provider-storage-http.test.ts`) only runs when `I02_STORAGE_HTTP=1` and needs local Docker. You do not need any of these for UI tickets.

No E2E test setup exists on `integ/all`. Adding Playwright is part of ticket UI-01.

## 3. Read before coding

1. `README.md`: rules, stack, safety constraints and release gates.
2. `AGENTS.md`: the shared engineering contract.
3. `DESIGN.md`: proposed visual direction.
4. `docs/PERMISSIONS.md` and `docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md`.
5. Section 5 of this file for the real API.

## 4. Rules for every UI ticket

- Synthetic data only. No real patient data, no real-looking providers, prices, coverage, reviews or ETAs. Test fixtures must be visibly synthetic (`@example.invalid` emails, `SCV-DOC-000001`-style references).
- Never claim "paid", "verified", "available", "report delivered" or any medical outcome unless an API field says so. No payment state exists anywhere in the API.
- Money arrives as a **decimal string of paise** (`"50000"` is ₹500.00). Parse with `BigInt`, never `Number`/`parseFloat`. Send prices back as strings.
- Times are UTC ISO strings from the API. Display in `Asia/Kolkata`. Where section 5 says "UTC `Z` only", send strings like `2026-12-01T04:30:00Z`: those fields use `z.iso.datetime()`, which rejects `+05:30` offsets.
- Hidden features stay hidden: clinical, live payments, emergency dispatch, pharmacy, subscriptions, GPS, payouts.
- Every screen has loading, error and empty states and works on mobile and with a keyboard.
- The browser never sends a price, role, status or paid flag. The server derives them.
- One branch per ticket, `task/<ID>-short-name`, only the files in the ticket's scope. Record what you did in `docs/SESSION_LOG.md` and test output in `docs/TEST_EVIDENCE.md`.

## 5. API contract (implemented routes)

### 5.1 Conventions that apply to every route

**Authentication.** Bearer token only. Send `Authorization: Bearer <accessToken>` (the token from login or refresh). There is no cookie session and no middleware. A missing or malformed header gives `401 unauthenticated`. After the token is checked, the caller's `profiles.status` must be `active`, otherwise `403 inactive_account`. The only routes that need no token are `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/catalog` and `GET /api/catalog/{reference}`.

**Request bodies.** JSON, at most 16 384 bytes. Schemas are strict: an unknown key, a wrong type or invalid JSON gives `422 invalid_input`. A route that expects a body returns 422 when the body is missing.

**Query strings.** A repeated key (`?limit=1&limit=2`) or an unknown key gives `422 invalid_input`.

**Idempotency-Key header.** A UUID, required on the routes marked "Idempotency-Key". Generate one per user intent (one click of "Request booking"), keep it while retrying that same intent, and generate a new one for a new intent. Missing or non-UUID gives `422 invalid_input` (`422 invalid_idempotency_key` on `POST /api/organizations`). Reusing a key with a different body gives `409 conflict`.

**Optimistic concurrency.** Most mutations take `expectedVersion`. Send the `version` you last read. A stale value gives `409 conflict`: refetch, show the user the current state and let them decide again. Do not retry automatically with the new version.

**Response headers.** Every response carries `Cache-Control: private, no-store` and `Vary: Authorization`.

**Error envelope.** Always:

```json
{ "error": { "code": "conflict" } }
```

The code is generic. The database's specific reason (for example `pending_booking_limit` or `credentials_required`) is **not** returned. The UI must explain errors from the status, the code and the action the user just took.

| Status | Codes | Meaning for the UI |
|---|---|---|
| 401 | `unauthenticated`, `invalid_credentials`, `invalid_session` | send to login, or refresh once and retry |
| 403 | `forbidden`, `inactive_account` | not allowed or not eligible; do not retry |
| 404 | `not_found` | missing or not visible to this user (the API does not distinguish) |
| 409 | `conflict` | stale version, duplicate, invalid state transition or disabled action; refetch |
| 422 | `invalid_input`, `invalid_idempotency_key`, `signup_unavailable` | client input rejected; show field errors from your own Zod schema |
| 429 | `rate_limited` | Auth rate limit, or a booking/address quota (section 5.5) |
| 500 | `identity_unavailable` | any unexpected server error, on every route (the generic catch-all uses this code) |
| 503 | `identity_unavailable`, `provider_unavailable`, `catalog_unavailable`, `booking_unavailable`, `provider_signed_urls_unavailable` | upstream failure or disabled feature; show a retry option |

**Roles.** `GET /api/auth/me` returns `roles`. Read them carefully (from `identity_roles()` in `20261117000660`):
- `patient` is returned for **every** active account, whether or not a patient record exists.
- `doctor`/`lab`/`ambulance`/`caretaker` are returned only when the user owns, or has `provider:read` in an organization that owns, a provider that is `approved`, `active` and publishable. A provider still in onboarding gives **no** provider role.
- `admin` is returned only with an `aal2` (MFA) session and an unexpired global admin capability.

Use roles to choose dashboards. Do not use them to hide provider onboarding, which must be reachable before approval. The server checks permissions on every call, so a hidden button is not a security control.

### 5.2 Auth and profile

| Method and path | Auth | Request | Success | Notable errors |
|---|---|---|---|---|
| `POST /api/auth/signup` | none | `{ email (≤254), password (12–128) }` | `202 { status: "signup_received" }`, the same for new and existing emails | 422 `invalid_input` / `signup_unavailable`, 429, 503 |
| `POST /api/auth/login` | none | `{ email, password (1–128) }` | `200 { accessToken, refreshToken, expiresAt }` (`expiresAt` is Unix seconds) | 401 `invalid_credentials`, 403 `inactive_account`, 429, 503 |
| `POST /api/auth/refresh` | none | `{ refreshToken }` | same shape as login | 401 `invalid_session`, 403, 429, 503 |
| `POST /api/auth/logout` | bearer | none | `200 { status: "signed_out" }` | 401 `invalid_session` |
| `GET /api/auth/me` | bearer | none | `200 { profile: { id, display_name, locale, version }, roles: string[] }` | 401, 403, 500 |
| `PATCH /api/auth/profile` | bearer | `{ displayName (1–100), locale: "en"\|"te"\|"hi", expectedVersion }` | `200 { profile: <profiles row> }` (includes `version`) | 409 stale version, 422 |
| `POST /api/auth/patient` | bearer | `{ policyVersion (1–80 chars), consent: true }` | `200 { patientId }`. Idempotent: a second call returns the same id | 403 if access was revoked, 422 |
| `GET /api/auth/invitations` | bearer | none | `200 { invitations: [{ organization_id, scopes, version }] }`, unexpired only, max 50 | 401, 403 |

Logout revokes the refresh session, but an access token stays valid until `expiresAt`. The client must discard both tokens. `POST /api/auth/patient` records consent for the patient's own record. Which `policyVersion` string to send is an open owner decision (section 8). There is no password reset, email-change, MFA enrolment or MFA verification route.

### 5.3 Organizations

Organization scopes: `org:read`, `org:edit`, `members:read`, `provider:read`, `provider:manage`, `evidence:manage`, `schedule:manage`, `finance:read`. Membership roles: `owner` (only the creator), `manager`, `staff`, `billing`. Membership status: `invited`, `active`, `disabled`.

| Method and path | Auth | Request | Success | Notable errors |
|---|---|---|---|---|
| `GET /api/organizations?limit=&cursor=` | bearer | `limit` 1–50 (default 20), `cursor` UUID | `200 { organizations: [{ id, name, version }], nextCursor: uuid\|null }`, only orgs visible to the caller | 422 |
| `POST /api/organizations` | bearer, Idempotency-Key | `{ name (1–160) }` | `200 { organizationId }`. The caller becomes owner with every scope | 422 `invalid_idempotency_key`, 422 at the 5-organizations-per-user limit, 409 key reuse |
| `PATCH /api/organizations/{id}` | bearer (owner/manager with `org:edit`) | `{ name, expectedVersion }` | `200 { organization: <row> }` | 403, 409, 422 |
| `GET /api/organizations/{id}/members?limit=&cursor=` | bearer | as above | `200 { members: [{ id, profile_id, membership_role, status, scopes, version, invite_expires_at }], nextCursor }` | 422 |
| `POST /api/organizations/{id}/members` | bearer (owner only) | `{ profileId, membershipRole: "manager"\|"staff"\|"billing", status, scopes[], expectedVersion }`. `expectedVersion: 0` creates an invitation and then `status` must be `"invited"` | `200 { membershipId }` | 403 (self, owner target, scopes the caller lacks, re-activating without acceptance), 409 (exists or stale), 422 (25 pending invitations per org) |
| `GET /api/organizations/invitations?limit=&cursor=` | bearer | as above | `200 { invitations: [{ organization_id, scopes, version, invite_expires_at }], nextCursor }` | 422 |
| `POST /api/organizations/{id}/members/accept` | bearer (the invitee) | `{ expectedVersion }` (the invitation's `version`) | `200 { membershipId }` | 403 (no live invitation, or it expired after 14 days), 409 |

Invitations do not include the organization name, and inviting needs the invitee's profile UUID. No route looks up a user by email.

### 5.4 Provider onboarding and admin review

Categories: `doctor`, `lab`, `ambulance`, `caretaker`. Provider verification states: `draft`, `submitted`, `under_review`, `approved`, `rejected`, `suspended`, `expired`. The owner can edit, add documents and submit only in `draft`, `rejected` or `expired`.

The required document kind per category (`required_kind()`): doctor `registration`, lab `licence`, ambulance `vehicle_permit`, caretaker `background_check`. Submission needs a profile and an uploaded, unexpired document of that kind.

| Method and path | Auth | Request | Success | Notable errors |
|---|---|---|---|---|
| `POST /api/providers` | bearer | `{ category, displayName (1–160), description (≤2000, default ""), organizationId? }` | `201 { providerId }`. Without `organizationId` the caller is the individual owner | 403 without `provider:manage` in that org |
| `GET /api/providers/{id}` | bearer (owner, org member with `provider:read`, or verifier) | none | `200 { provider: { id, category, organization_id, verification_state, status, version, profile: { display_name, description }\|null, documents: [{ id, kind, status, expires_at, created_at }] (≤50), events: [{ from_state, to_state, public_reason, reviewed_document_ids, provider_version, occurred_at }] (≤100) } }` | 404, 422 |
| `PATCH /api/providers/{id}` | bearer (manager) | `{ displayName, description, expectedVersion }` | `200 { provider: <providers row> }` | 403 if not editable, 409 |
| `POST /api/providers/{id}/documents` | bearer (manager; org providers also need `evidence:manage`) | `{ kind: "identity"\|"registration"\|"licence"\|"vehicle_permit"\|"background_check", contentType: "application/pdf"\|"image/jpeg"\|"image/png", expiresAt (offset allowed, future, ≤5 years), expectedVersion (provider version) }` | `201 { document: { id, provider_id, owner_profile_id, kind, content_type, expires_at, object_name, bucket_id, status: "pending", created_at }, upload: { bucket: "provider-verification", upsert: false, maxBytes: 10485760 }, providerVersion }` | 403, 409, 422 (also at 50 live documents) |
| `POST /api/providers/{id}/documents/{documentId}/signed-url` | bearer | none | never succeeds | 404, or `503 provider_signed_urls_unavailable` (signing is disabled on purpose) |
| `POST /api/providers/{id}/submit` | bearer (manager) | `{ expectedVersion }` | `200 { provider: <row> }`, state `submitted` | 403, 409, 422 (no profile or no required document bytes) |
| `POST /api/admin/providers/{id}/review` | bearer, `aal2`, `provider:verify` (or `provider:suspend` to suspend) | `{ decision: "under_review"\|"approved"\|"rejected"\|"suspended", reason (1–1000), expectedVersion }` | `200 { provider: <row> }` | 403 (no capability, no MFA, or the reviewer is linked to the provider), 409, 422 invalid transition |

Allowed review transitions: `submitted` or `suspended` to `under_review`; `under_review` to `approved` or `rejected`; `approved` to `suspended`. An hourly job moves `approved` providers whose verified document expired to `expired`.

**Uploading document bytes.** The documents route only reserves a slot. The browser then uploads the file to Supabase Storage with the user's own access token, using `@supabase/supabase-js`: bucket `upload.bucket`, path `document.object_name`, `upsert: false`, and `contentType` equal to the reserved `content_type`. The storage policy allows this only for the uploader's own `pending` document while the provider is editable. **Size limit mismatch:** the route advertises `maxBytes: 10485760` (10 MiB), but migration `20261117000630` sets the bucket limit to **5 MiB** (5 242 880 bytes). Enforce 5 MiB in the UI. The browser upload path is covered only by the opt-in integration test; it is **UNVERIFIED** from a browser.

Owners cannot view their uploaded files: signed URLs are disabled. Show document metadata (kind, status, expiry) only.

### 5.5 Catalog: public search and provider management

**Public search** (no token needed):

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/catalog?category=&pin=&priceMax=&limit=&cursor=` | `category` required; `pin` required, 6 digits, not starting with 0; `priceMax` paise string ≤ `10000000000`; `limit` 1–50 (default 20); `cursor` = previous `nextCursor` | `200 { results: Row[], nextCursor: string\|null }`, sorted by price, then provider reference, then service id | 422 |
| `GET /api/catalog/{providerReference}?category=&pin=` | reference like `SCV-DOC-000001` (`SCV-(DOC\|LAB\|AMB\|CARE)-` + 6–19 digits); `category` and `pin` required | `200 { results: Row[] }`, one row per bookable service | 404, 422 |

`Row`:

```
provider_reference  "SCV-DOC-000001"
category            "doctor" | "lab" | "ambulance" | "caretaker"
display_name        string
public_profile      { category, display_name, description?, specialty?, qualification?, languages?[],
                      years_experience?, accreditation_label?, home_collection?, fleet_types?[],
                      scheduled_only?: true, skills?[] }   (unknown keys are stripped server-side)
service_id          uuid
service_title       string
duration_minutes    integer
amount_paise        decimal string
currency            "INR"
unit                "visit" | "test" | "trip" | "hour" | "day"
terms_version       string
pin_code            string
city                string
advisory_availability  null   (always null; never show availability from search)
```

A provider appears only when it is approved and active, has a published service with a current price, and has an approved, unexpired coverage area for that PIN. The provider UUID is never exposed publicly; use `provider_reference` and `service_id`.

**Provider catalog management** (bearer; the caller must manage the provider, and a suspended provider gets 403):

| Method and path | Request | Success | Notable errors |
|---|---|---|---|
| `GET /api/provider/services?providerId=` | `providerId` UUID | `200 { providerVersion, coverageVersion, services: [{ id, provider_id, catalog_type_id, title, description, duration_minutes, status, version, service_price_versions: [{ id, version, amount_paise (string), currency, unit, terms_version, effective_from, effective_to }] }], coverage: [{ id, pin_code, status, valid_from, valid_to, version }] }` (≤100 each) | 404 |
| `POST /api/provider/services` (Idempotency-Key) | `{ providerId, catalogTypeId, title (1–160), description (≤2000), durationMinutes (1–10080), status: "draft", expectedVersion: 0 }` | `201 { service: <row> }` | 403, 409 key reuse, 422 (not `draft`, or 100 services) |
| `PATCH /api/provider/services/{id}` | same body; `catalogTypeId` must match the existing one; `expectedVersion` = service `version`; `status` `draft`\|`published`\|`archived` | `200 { service: <row> }` | 403, 409, 422 (type changed, or publishing without a current price) |
| `POST /api/provider/services/{id}/prices` (Idempotency-Key) | `{ amountPaise (string, 0–10000000000), termsVersion (1–160), expectedVersion (service version) }` | `201 { priceVersionId }`. The new price takes effect immediately and the service `version` goes up by 1 | 409, 422 |
| `POST /api/provider/coverage` (Idempotency-Key) | `{ providerId, pin, expectedVersion (coverageVersion from GET) }` | `201 { area: { id, provider_id, pin_code, status: "proposed", valid_from, valid_to, version, ... } }` | 403, 409 stale `coverageVersion`, 422 (PIN not in the PIN directory, or 50 areas) |
| `POST /api/provider/coverage/{id}/withdraw` | `{ expectedVersion (area version) }` | `200 { area }`, status `revoked` | 403 (only the individual owner or the org owner), 409 |

Coverage status: `proposed`, `approved`, `rejected`, `revoked`. An approval lasts at most 12 months.

**Admin coverage review** (bearer, `aal2`, `coverage:verify`):

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/catalog/admin/coverage?limit=&cursor=` | `limit` 1–50, `cursor` = previous `nextCursor` | `200 { results: [{ area_id, provider_id, category, display_name, pin_code, status, valid_from, valid_to, version, created_at }], nextCursor }`, proposed first | 403, 422 |
| `POST /api/catalog/admin/coverage/{id}/review` | `{ decision: "approved"\|"rejected"\|"revoked", reason (1–1000), expectedVersion, validUntil? }`. `validUntil` (offset allowed) is required for `approved`, must be in the future and within 12 months | `200 { area: <row> }` | 403 (also when the reviewer proposed it or belongs to the org), 409, 422 |

### 5.6 Patient addresses, availability and bookings

Booking states: `draft`, `requested`, `accepted`, `confirmed`, `in_progress`, `completed`, `declined`, `expired`, `cancelled`, `no_show`, `interrupted`. Accepting moves `requested` to `confirmed` in one call (through `accepted`), so the UI normally sees `requested` and then `confirmed`. Doctor visits also carry a `substate`: `scheduled`, `en_route`, `arrived`, `service_started`, `service_completed`.

| Method and path | Auth | Request | Success | Notable errors |
|---|---|---|---|---|
| `POST /api/patient/addresses` | bearer (the patient) | `{ patientId, line1 (1–240), locality (1–120), pin, contactName (1–100), phone ("+91" then 10 digits starting 6–9), expectedVersion, addressId? }`. Create: `expectedVersion: 0` and no `addressId`. Update: `addressId` and the address `version` | `201 { id }` on create, `200 { id }` on update | 403, 409, 422, 429 (20 addresses) |
| `GET /api/availability?provider=&service=&date=` | bearer | `provider` = provider reference, `service` = service id, `date` = `YYYY-MM-DD` from today to today+31 in IST | `200 { slots: [{ start_at, end_at, advisory: true }], advisory: true }`, 15-minute steps, max 96. Unknown or non-bookable providers return `[]` | 422 |
| `POST /api/bookings` | bearer, Idempotency-Key | `{ patientId, serviceId, addressId, startAt (UTC Z only) }` | `201 { id }`; state `requested`. The server snapshots the price, terms, address and contact | 403 (not bookable, address PIN not covered, no current price), 409 key reuse, 422 (`startAt` in the past or more than 90 days ahead), 429 (10 open requests) |
| `GET /api/bookings?providerId=&limit=&cursor=` | bearer | without `providerId`: the caller's patient bookings; with `providerId`: that provider's queue (scheduler only); `limit` 1–50; `cursor` = last item `id` | `200 { items: Booking[] }`, ordered by `id`. There is no `nextCursor`: when `items.length === limit`, request again with `cursor` = last `id` | 403, 422 |
| `GET /api/bookings/{id}` | bearer | none | `200 { booking: Booking }` | 404 (also when not visible), 422 |
| `POST /api/bookings/{id}/cancel` | bearer (patient, provider scheduler, or assigned doctor) | `{ expectedVersion, reason: "patient_request"\|"provider_unavailable"\|"unable_to_service"\|"other" }` | `200 { version }` | 403, 409 (wrong state, or patient after start time) |
| `POST /api/bookings/{id}/reschedule` | bearer, Idempotency-Key | `{ expectedVersion, startAt }` | never succeeds | `409` for the patient (disabled until a reschedule policy exists), 403 for others |

`Booking` (from `get_booking()` in `20261117001500`):

```
id, public_ref ("SCV-" + 12 digits), provider_reference, category, service_id, pin_code,
start_at, end_at, state, version, amount_paise (string), currency, terms_version, policy_version_id
+ patient_id, address_snapshot { line1, locality, pin_code }, contact_snapshot { name, phone }
    only for the patient, or for the provider/assignee while the booking is confirmed or
    in_progress, from 60 minutes before start until 12 hours after end
+ substate   only when category is "doctor"
```

The API does **not** check that `startAt` matches a slot when the request is created; acceptance does. Offer only times returned by `/api/availability`.

No cancellation policy is seeded, so `policy_version_id` is `null` and a patient can cancel any time before the start. Do not show cancellation fees or windows.

### 5.7 Provider side: accept, decline, visit progress, scheduling

Scheduler = the individual owner, or an active org member with `schedule:manage`.

| Method and path | Auth | Request | Success | Notable errors |
|---|---|---|---|---|
| `POST /api/bookings/{id}/accept` | scheduler | `{ expectedVersion, resourceIds: [uuid] }` (1 person resource for doctor) | `200 { version }`, state `confirmed` | 403 (not a scheduler, or the person resource is not a verified doctor: org staff need an approved staff credential case, which has no route), 409 (stale, offer changed, outside the resource's schedule, overlap with another booking, **any non-doctor category**), 422 wrong resources |
| `POST /api/bookings/{id}/decline` | scheduler | `{ expectedVersion, reason: "provider_unavailable"\|"unable_to_service"\|"other" }` | `200 { version }` | 403, 409, 422 (`patient_request` is rejected here) |
| `POST /api/bookings/{id}/en-route` | assigned doctor | `{ expectedVersion }` | `200 { version }`, substate `en_route` | 403 (not assigned, or outside the window from 60 min before start to 12 h after end), 409 (stale or out of order) |
| `POST /api/bookings/{id}/arrive` | assigned doctor | same | substate `arrived` | same |
| `POST /api/bookings/{id}/start` | assigned doctor | same | substate `service_started`, state `in_progress` | same |
| `POST /api/bookings/{id}/complete` | assigned doctor | same | substate `service_completed`, state `completed` | same |
| `POST /api/provider/booking/resources` | scheduler | `{ providerId, kind: "person"\|"vehicle", personProfileId?, vehicleKey? (A–Z, 0–9, 6–20 chars), expectedVersion (0 to create), resourceId?, status: "active"\|"disabled" }` | `201 { id }` on create (returns the existing id for a person who already has one), `200 { id }` on update | 403, 409 (in use), 422 |
| `POST /api/provider/booking/availability` | scheduler | `{ providerId, resourceId, weekday (0 = Sunday … 6 = Saturday), localStart "HH:MM", localEnd "HH:MM" (IST), effectiveFrom, effectiveTo ("YYYY-MM-DD"), expectedVersion (0 to create), ruleId? }` | `201 { id }` on create, `200 { id }` on update | 403, 409 (stale, or the resource holds a reservation), 422 |
| `POST /api/provider/booking/blackouts` | scheduler | `{ providerId, resourceId, startAt, endAt (UTC Z only), reason: "unavailable"\|"maintenance"\|"other", expectedVersion (the resource version) }` | `201 { id }`; the resource version goes up by 1 | 403, 409 (stale, or it overlaps accepted work), 422 |

The visit-progress buttons are operational markers only. They carry no OTP, clinical acceptance or consent.

### 5.8 Ops queue, ops closeout and assignment contact

Ops = a holder of the `booking:incident` capability (OD-2: granted to nobody yet, so these return 403 or an empty list until the owner assigns it).

| Method and path | Auth | Request | Success | Notable errors |
|---|---|---|---|---|
| `GET /api/ops/exceptions?limit=&after=` | ops | `limit` 1-50 (default 20), `after` = last `booking_id` of the previous page | `200 { items: [{ booking_id, public_ref, provider_reference, category, start_at, end_at, state, version, last_reason, overdue, escalatable, exceptions: [{ id, kind, reason, opened_at, version }] }] }` ordered by `booking_id`. No contact or address. | 422 bad query |
| `POST /api/ops/bookings/{id}/close` | ops, `Idempotency-Key: <uuid>` | `{ expectedVersion, outcome: "interrupted"\|"no_show", reason: "no_show_confirmed"\|"ops_closeout"\|"provider_did_not_attend"\|"unsafe_conditions"\|"absence_disputed" }` | `200 { version }` (new booking version); open exceptions on the booking are resolved | 403, 409 (stale, not `confirmed`/`in_progress`, or not escalatable yet), 422 (`no_show` needs `confirmed` + an open absence report + `no_show_confirmed`; `absence_disputed` needs an open absence report), 503 gate |
| `POST /api/ops/exceptions/{id}/resolve` | ops, `Idempotency-Key: <uuid>` | `{ expectedVersion, resolution: "resolved" }` | `200 { version }` (new exception version) | 403, 409 (stale, already resolved, or `absence_reported`, which resolves only through close), 422 |
| `POST /api/bookings/{id}/contact` | current assignee, or ops while the booking has an open exception or is escalatable | none | `200 { contact: { booking_id, public_ref, address: { line1, locality, pin_code }, contact: { name, phone } } }` | 404 when not allowed (same as a missing booking) |

Contact is `POST` because every allowed read writes an audit row: fetch it only when the user opens the contact panel, never on page load or prefetch, and never cache it. Retrying a close or resolve with the same `Idempotency-Key` and body returns the first result; the same key with a different body is 409.

## 6. Where the old proposal (`docs/API_CONTRACTS.md`) differs from the code

| Proposal | Implemented |
|---|---|
| `GET /api/providers?category=&pin=&priceMax=` | `GET /api/catalog?category=&pin=&priceMax=&limit=&cursor=` |
| `GET /api/providers/:id` (public profile) | `GET /api/catalog/{providerReference}?category=&pin=`. `GET /api/providers/{id}` exists but is the private onboarding read and needs a token |
| `POST /api/onboarding/patient` (health questionnaire) | `POST /api/auth/patient` (consent only, no questionnaire) |
| `POST /api/onboarding/provider` | `POST /api/providers`, then `PATCH`, documents and submit |
| `POST /api/bookings/:id/verify-arrival` (OTP) | not implemented |
| Consultations, PDF, proof, payment order, Razorpay webhook, pay-after collection, support tickets, assistant chat, WhatsApp | not implemented |
| Booking reference `#SCV-BKG-000142` | `public_ref` is `SCV-` + 12 digits, for example `SCV-000000000142` |

## 7. Not implemented, disabled or missing

Disabled on purpose (do not build UI that implies these work):

- **Lab, scheduled ambulance and caretaker bookings** can be searched and requested, but `accept_booking` refuses every non-doctor category (409). Visit progress exists only for doctors. These are S01 work.
- **Payments**: no payment route, table state or "paid" field. Bookings carry a price snapshot only. P01 work.
- **Rescheduling**: the route always returns 409.
- **Clinical records, prescriptions, PDFs, arrival OTP, emergency dispatch, GPS/live location, pharmacy, subscriptions, payouts**: no routes; feature flags are off.
- **Document viewing**: signed URLs return 503.
- **Notifications**: booking events write to `notification_outbox`, but no sender exists in the repository.

Missing routes that block parts of the UI (backend tickets for the owner/Claude to assign):

| Gap | Blocks |
|---|---|
| No "list my providers" route. A provider id is only returned by `POST /api/providers` | provider dashboard entry after a new login |
| No `GET` for patient addresses | choosing a saved address when booking |
| No route listing `service_catalog_types` (the local seed adds one: `doctor_home_visit`, id `d4000000-0000-4000-8000-000000000001`) | creating any service (`catalogTypeId` is required) |
| No PIN directory route (the local seed adds PINs 599991 and 599992 only) | coverage proposals (422) and realistic search |
| No `GET` for resources, availability rules or blackouts; resource `version` is not readable | provider schedule screens beyond create forms; blackouts after the first |
| No admin queue of submitted providers | admin provider review list (the review action exists) |
| No MFA enrolment or verification route; local TOTP is off | every admin screen (needs `aal2`) |
| No booking event timeline route | patient booking history view |
| Staff credential RPCs (`add_staff_credential_case`, `add_staff_credential_document`, `submit_staff_credential_case`, `review_staff_credential_case`) and `set_provider_details` have no HTTP route | org doctor staff verification; category-specific profile fields (specialty, languages, fleet types) |
| No invite-by-email lookup; invitations omit the organization name | organization invite and accept screens |
| No password reset or email change route | account recovery screen |
| `upload.maxBytes` says 10 MiB but the bucket allows 5 MiB | correct client-side size message |

Do not call Supabase RPCs or tables directly from the browser to work around these gaps. The only direct Supabase call the UI makes is the Storage upload in section 5.4. Ask for a route instead.

## 8. Open decisions that affect UI

Ask the owner before building these. Do not guess.

- **Token storage.** The API returns tokens in JSON and has no httpOnly-cookie flow. Where the access and refresh tokens live (memory only, or a server-side session added by a backend ticket) is undecided. Do not put the refresh token in `localStorage` without a recorded decision.
- **Consent `policyVersion`** string for `POST /api/auth/patient`, and the consent text shown to the patient.
- **Non-doctor booking CTA.** Hide "Request booking" for lab, ambulance and caretaker until S01, or allow requests that cannot be accepted yet.
- **Which existing UI branch to continue** (section 1).
- Invoice/receipt wording, "paid" wording, cancellation-fee wording and support-hours promises stay out until the client answers Q02–Q10 in `docs/S00_DECISION_SHEET.md`.

## 9. UI tickets ready to pick

Each ticket below uses only the routes in section 5. Apart from UI-01, each has its own file scope, so two people can work in parallel. UI-01 owns the shared API client. The other tickets import it, or stub its exported functions in their own tests until it merges. Route group names are suggestions; agree final paths with the owner when the ticket is assigned.

All tickets share these acceptance criteria:
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.
- Every API call goes through the UI-01 client and validates the response with a Zod schema that matches section 5.
- Loading, error (per status in section 5.1) and empty states exist, along with keyboard operation and a 360 px mobile layout.
- No secrets, no real data, no unflagged feature, no price/role/status sent from the browser.
- Unit tests use visibly synthetic fixtures shaped exactly like section 5.

| ID | Work | Scope (suggested) | Ticket-specific acceptance |
|---|---|---|---|
| UI-01 | Typed API client and test setup | `src/lib/api-client/**`, `tests/unit/api-client*.test.ts`; adds Playwright config and dev dependency | One function per route in section 5 with typed input/output; attaches the bearer token; generates and reuses Idempotency-Key per intent; parses the error envelope into a typed error with status and code; one refresh-and-retry on 401; paise helpers using `BigInt` (format ₹ with 2 decimals, never `Number`); unit tests for error mapping, idempotency reuse, refresh, and paise edge cases `"0"` and `"10000000000"` |
| UI-02 | Sign up, log in, log out | `src/app/(auth)/**` | Password field enforces 12–128 on sign-up only; the same "check your email or log in" message for new and existing emails; 401 `invalid_credentials` shows one generic message; 429 shows a wait message; logout discards both tokens even if the call fails. Works against local Supabase with no seed |
| UI-03 | Account and profile | `src/app/(app)/account/**` | Shows `display_name`, `locale` and roles from `/api/auth/me`; edits name and locale (`en`/`te`/`hi`) with `expectedVersion`; 409 refetches and shows the current values |
| UI-04 | Patient consent and address entry | `src/app/(app)/patient/onboarding/**` | Consent checkbox must be ticked to send `consent: true`; `policyVersion` read from one named constant marked pending owner decision; address form validates PIN and `+91` phone with the same rules as the server; after saving, keeps the returned address `id` for the booking flow in the current session and does not show a saved-address list (no route exists) |
| UI-05 | Public search and provider detail | `src/app/(public)/search/**`, `src/app/(public)/providers/[reference]/**` | Category and PIN required; optional max price entered in rupees and sent as a paise string; "Load more" uses `nextCursor`; detail page lists services with price, unit and duration; never shows availability, ratings, ETAs or "verified" badges beyond what the row says; local empty result shows an honest "no providers serve this PIN yet" state |
| UI-06 | Doctor booking request | `src/app/(app)/book/**` | Requires login and a `patientId` (from the idempotent `POST /api/auth/patient`); date picker limited to today…today+31 IST; slots from `/api/availability` shown in IST; sends `startAt` as UTC `Z`; one Idempotency-Key per submit, reused on retry; 403/422/429 mapped to plain-language messages; non-doctor categories handled per the section 8 decision |
| UI-07 | Patient bookings list, detail and cancel | `src/app/(app)/bookings/**` | List pages with `cursor` = last id; detail shows `public_ref`, state, IST times, price snapshot and doctor `substate`; cancel asks for a reason and sends `expectedVersion`; 409 refetches; no payment, refund or fee text; reschedule is not offered |
| UI-08 | Provider onboarding | `src/app/(app)/provider/onboarding/**`, browser Storage upload helper inside that folder | Create provider; edit profile while `draft`/`rejected`/`expired`; reserve a document and upload the file with `upsert: false`, matching content type and a 5 MiB client limit; show document kind, status and expiry; submit with `expectedVersion`; state timeline from `events[].public_reason`; read-only view in other states; keeps the `providerId` from creation because no list route exists |
| UI-09 | Organization management | `src/app/(app)/organizations/**` | List and create (Idempotency-Key) organizations; rename with version; members list with role, status, scopes and invite expiry; invite form takes a profile UUID until a lookup route exists; invitee accepts from `/api/organizations/invitations`; owner-only actions hidden for others but 403 still handled |
| UI-10 | Doctor booking actions | `src/app/(app)/provider/bookings/**` | Provider queue from `GET /api/bookings?providerId=`; accept with one person resource id (entered or kept from UI-11 output), decline with a reason, cancel; en-route, arrive, start and complete buttons in order, each sending `expectedVersion`; contact details shown only when the API returns them; 409 refetches |

Partly blocked tickets (build only the parts the routes allow, and list the gap in the PR):

| ID | Work | Blocked part |
|---|---|---|
| UI-11 | Provider schedule setup: resource, weekly rule and blackout create forms | No list routes; resource version unreadable (section 7) |
| UI-12 | Provider services, prices and coverage | Needs a catalog-type list route and PIN directory data |
| UI-13 | Admin provider review and coverage queue | Needs MFA (`aal2`) and a provider review queue; nothing works locally |

Blocked until backend work lands: lab, ambulance and caretaker journeys (S01); payments and pay-after (P01); clinical screens; arrival OTP; notifications.

## 10. Limitations of this handover

- Derived by reading code at `e7165fd`. I did not run the app, the unit tests, the database tests or any HTTP call while writing it.
- PostgREST serialization of `setof text` (`roles`) as a JSON array of strings, and of full-row RPC results, is assumed from Supabase behaviour: **UNVERIFIED** by an HTTP test in this repo.
- The browser-side Storage upload path is **UNVERIFIED** outside the opt-in integration test.
- The unmerged `feat/fe2-*` and `task/U0*` branches were not reviewed; only their file lists and resume note were read.
- `docs/API_CONTRACTS.md` and `docs/IMPLEMENTATION_TASKS.md` were left unchanged to keep this task's file scope to this document.
