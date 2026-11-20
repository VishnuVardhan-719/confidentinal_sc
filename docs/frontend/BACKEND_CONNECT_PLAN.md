# Backend connect plan (dry run)

**What this is.** A read-only comparison of every frontend http adapter (`src/modules/*/http*.ts` at `feat/fe2-integration` `fec9da1`) with:
- `docs/API_CONTRACTS.md`;
- the backend PR branches already in the local clone: `origin/task/I01-auth-rls` (PR #1), `origin/task/I02-provider-onboarding` (PR #2), `origin/task/C01-catalog` (PR #3) and `origin/task/B01-booking` (PR #4);
- the backend status note on `origin/docs/backend-status` (`BACKEND_STATUS.md`).

**PR #5.** No PR #5 ref exists locally, and no document in the repo names one. The nearest candidates are `origin/integ/friend-backend` (`05ec926`, "I02 hardening port onto friend stack"; same 43 API routes as B01) and `origin/task/S01-design` (docs only). They are treated as **UNKNOWN** until the owner confirms which branch is #5.

**What was not done.** Nothing was fetched, merged, pushed or run against a database, and no `.env` was read or written. Backend facts come from `git show`/`git ls-tree` on those refs. The route comparison is reproducible with `node .context/route-compare.cjs <exported src> <repo> origin/task/B01-booking`.

## How the two sides talk

| Concern | Backend (I01 to B01) | Frontend | Result |
|---|---|---|---|
| Transport | Same Next.js app, `src/app/api/**/route.ts` | Same-origin `/api/...` only (`src/lib/api/http.ts`: `redirect: "error"`, `cache: "no-store"`, 15 s timeout); server code needs `APP_ORIGIN` | MATCH: one deployment (modular monolith) |
| Authentication | `Authorization: Bearer <access token>` on every private route; cookies are ignored (`src/lib/db/request-client.ts` `bearerToken`) | `auth/http-client.ts` and `clinical/http-util.ts` (used by `auth`, `onboarding`, `verification`, `doctor`, `clinical`, `records`) send Bearer from `getAccessToken()`. **`lib/api/http.ts` `createHttpClient()` (used by `bookings`, `providers`) and `admin/http-util.ts` (used by `admin`) send no `Authorization` header** | **MISMATCH** for `bookings` and `admin` (every call would return 401). `providers` is fine: the catalog is public |
| Idempotency | `Idempotency-Key` must be a UUID (`requestKey()`); required on `POST /api/bookings` and `/reschedule` | Sent as a UUID by `bookings.create` and by `clinical`/`records` commands | MATCH where used |
| Errors | `{ error: { code } }` with 401, 403, 404, 409, 422 (`invalid_input`), 429, 500, 503 | Status-based mapping (`codeFromStatus` in `src/lib/api/result.ts`): 401 unauthenticated, 403 forbidden, 404 not_found, 409 conflict, 422 validation, 429 rate_limited, anything else unavailable. The body is never shown | MATCH |
| Money | Decimal-string paise (`amount_paise: "80000"`), max 10,000,000,000 | `wirePaiseSchema` converts to integer paise | MATCH |
| Versions | `expectedVersion` positive int; commands return `{ version }` | Same | MATCH |

## Per-module table

Status key:
- **MATCH:** route, method, body and response agree with the backend branch.
- **MISMATCH:** something differs and must be fixed before http mode works.
- **GATED:** the adapter returns `gated`, with no network call.
- **UNKNOWN:** the backend source is not in the repo.

| Module | Routes used (http) | Backend source | Status | Exact fix (owner) |
|---|---|---|---|---|
| `auth` | `GET /api/auth/me`; `POST /api/auth/{signup,login,refresh,logout}` | I01 PR #1 | **MATCH**: bodies `{ email, password }` / `{ refreshToken }`; responses `{ accessToken, refreshToken, expiresAt }`, `202 { status: "signup_received" }`, `{ status: "signed_out" }`, `{ profile, roles: text[] }`. `resendOtp`: **GATED** (no phone OTP route) | Add the five routes to `API_CONTRACTS.md` after owner approval (backend). Phone OTP contract (backend, R-FE03-01) |
| `onboarding` | `POST /api/auth/patient`; `POST /api/providers`; `GET`/`PATCH /api/providers/:id`; `POST /api/providers/:id/documents`; `POST /api/providers/:id/submit`; **`POST /api/onboarding/patient`** | I01 PR #1, I02 PR #2 | `/api/auth/patient` **MATCH** (`{ policyVersion, consent: true }` -> `{ patientId }`). Provider routes: path and method **MATCH**; body field lists are in R-FE03-07..09 (not re-verified field by field). **MISMATCH:** `submitPatientQuestionnaire` posts to `/api/onboarding/patient`, which **no backend branch implements** (404 -> `not_found`). `getPatientDraft`/`savePatientSection`: **GATED** | Gate `submitPatientQuestionnaire` (return `gated`) until the questionnaire route exists, or implement `POST /api/onboarding/patient` with the agreed body (fe-b + backend, R-FE03-10) |
| `organizations` | `GET /api/auth/invitations`; `POST /api/organizations/:id/members/accept` | I01 PR #1 | **MATCH** (paths and methods; invite details are thin, R-FE05-03) | Add to `API_CONTRACTS.md` (backend) |
| `verification` | `POST /api/admin/providers/:id/review`; `GET /api/providers/:id`; `POST /api/providers/:id/documents/:id/signed-url` | I02 PR #2 | **MATCH**: review body `{ decision: under_review\|approved\|rejected\|suspended, reason, expectedVersion }` = I02 `reviewSchema`. Signed URL returns 503 by design (-> `unavailable`). Queue and coverage: **GATED** | Wire coverage to C01 `GET /api/catalog/admin/coverage` and `POST /api/catalog/admin/coverage/:id/review` once they are in `API_CONTRACTS.md` (fe-b + backend, R-FE04-05) |
| `admin` | `POST /api/admin/providers/:id/review` | I02 PR #2 | **MISMATCH (auth):** body matches (`providerReviewBodySchema`), but `admin/http-util.ts` sends no Bearer token, so the call returns 401. It also duplicates `verification.review` for the same route | Pass `headers: () => ({ Authorization: "Bearer " + token })` from the request session in `getAdminApi`, or drop the duplicate and use `verification` (fe-e) |
| `providers` (public catalog) | `GET /api/catalog?category&pin[&priceMax&limit&cursor]`; `GET /api/catalog/:id?category&pin` | C01 PR #3 | **MATCH**: query keys equal `searchSchema`; response `{ results, nextCursor }` / `{ results }` with snake_case rows (`catalogRowSchema` is non-strict, so extra fields such as `provider_reference` on `integ/friend-backend` are ignored). Public, no Bearer needed. `price_desc` sort: **GATED** | None to connect. `API_CONTRACTS.md` still lists `/api/providers?category=&pin=` for the directory; update it to `/api/catalog` (backend) |
| `providers/doctor-api` (doctor search) | none | none | **GATED** (C01 has no speciality, language, rating or text search) | Contract R-C2-1 (backend + fe-q) |
| `bookings` | `POST /api/bookings`; `GET /api/bookings?providerId&limit&cursor`; `GET /api/bookings/:id`; `POST /api/bookings/:id/{accept,decline,cancel}` | B01 PR #4 | **MISMATCH (auth):** every body and response matches B01 (`bookingRequestSchema`, `listBookingsSchema`, `acceptSchema`, `decisionSchema` reasons, `{ id }` 201, `{ items }`, `{ booking }` from `get_booking`, `{ version }`). But the adapter uses `createHttpClient()` with no Bearer token, so every call is 401 | Inject an authenticated client: `createBookingsHttpApi(createHttpClient({ baseUrl: APP_ORIGIN, headers: bearer }))`. This needs a `headers`/`getAccessToken` option on `src/lib/api/http.ts` (fe-a) and the callers to pass the session token: `modules/bookings/journey.ts`, `bookings/api.ts` (fe-q) and `patient-dashboard/session.ts` (fe-d) |
| `bookings` reschedule | adapter **GATED** | B01 `POST /api/bookings/:id/reschedule` | **MISMATCH (when wired):** B01 needs `Idempotency-Key` and returns `{ id }` (the `request_reschedule` result), but the frontend type expects `{ version }` | Change `BookingsApi.reschedule` to send an idempotency key and accept `{ id }`, then refetch the booking (fe-q) |
| `bookings` timeline | **GATED** | none | GATED | Timeline projection contract (backend) |
| `bookings/slots` | **GATED** | B01 `GET /api/availability?provider&service&date` | **MISMATCH (when wired):** query keys differ (`providerId`, `serviceId` with no date, vs `provider`, `service`, `date`), and the response is `{ slots: [{ start_at, end_at, advisory }], advisory: true }` vs `{ items: [{ startAt, endAt }] }` | Map the query and response in `createSlotsHttpApi` and loop over the IST days the wizard shows. Keep "advisory" visible (fe-q) |
| `patient` | **GATED** (`getOverview`, `listMembers`, `listAddresses`, `addAddress`, `getOffer`) | B01 `POST /api/patient/addresses` only (no list) | **MISMATCH (when wired):** B01 body `{ patientId, line1, locality, pin, contactName, phone (+91), expectedVersion, addressId? }` vs frontend `{ label, locality, city, pin }` | Agree one address model (backend + fe-q). Add `GET /api/patient/addresses` and the profile, family and offer reads (R-C2-2) |
| `doctor` | `POST /api/bookings/:id/{accept,decline,en-route,arrive,start}` | B01 PR #4 | **MATCH**: `acceptInputSchema` = B01 `acceptSchema`, decline reasons are identical, `advanceInputSchema` = `{ expectedVersion }`, responses `{ version }`, Bearer via `clinical/http-util`. Lists, visit detail and arrival challenge: **GATED** (no doctor DTO; B01 has no OTP verify route). B01 `POST /:id/complete` is unused | Doctor DTOs and arrival-challenge contract (backend, REQUESTS FE10-12 items 6 and 7) |
| `clinical` | `POST /api/consultations/:id/draft`, `/finalize`; `GET /api/consultations/:id` | **none on any branch** (API_CONTRACTS lists them as proposed) | **MISMATCH:** the routes are called but don't exist (404). Behind `FEATURE_CLINICAL`, which is off | Keep the flag off. Implement DC01 to DC14 with the governance gate (backend) |
| `records` | `GET /api/consultations/:id`; `POST /api/bookings/:id/collection`; `POST /api/bookings/:id/proof` | **none** (proposed in API_CONTRACTS) | **MISMATCH:** routes missing; 13 more methods **GATED** | Same as clinical; P01 for collection (backend) |
| `payments`, `support`, `notifications`, `family-members`, `saved-providers`, `reviews`, `reminder-prefs`, `consultation-notes`, `prescription-drafts`, `proof-of-visit`, `doctor-reviews`, `content`, `audit` | none | none | **GATED** | Contracts in REQUESTS: FE07/08, R-FE01-4, R-FE-D-34, R-FE-P-R7-1..4, R-FE-P-R8-1, R-FE-D-37..39, R-FE-D-33, R-E10, R-E07 (backend) |
| `lab`, `ambulance`, `caretaker`, `lab-orders`, `care-requests`, `ambulance-requests`, `lab-orders/directory` | none | S01 design only (`origin/task/S01-design`) | **GATED** | S01 implementation (backend). The frontend adapters already list the proposed commands (R-E07, PHASE-R6-C, R10-C) |
| any route on PR #5 | — | not local | **UNKNOWN** | Owner names the branch. Then rerun `.context/route-compare.cjs` against it |

## Environment for `FRONTEND_ADAPTER=http`

| Variable | Read by | Value |
|---|---|---|
| `FRONTEND_ADAPTER` | frontend `src/lib/api/mode.ts` | `http`, or leave it unset |
| `APP_ENV` | frontend mode and SEO | `development`/`staging` locally; `production` only in production (fixtures refused, site indexable) |
| `APP_ORIGIN` | frontend `serverApiOrigin()`, `auth/server.ts`, `auth/actions.ts` | The deployment origin, e.g. `http://localhost:3000`. Required for every server-side `/api` call; never derived from headers |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | backend `src/lib/env` (`parsePublicEnv`), `request-client.ts`; also `next.config.ts` (CSP `connect-src`; an `http://` URL is added only under `next dev`, which is harmless because the browser never calls Supabase directly: all calls go through `/api`) | Local Supabase values from `npx supabase status` (project `surecurevisit`). Keep them in `.env` only |
| `SUPABASE_SERVICE_ROLE_KEY` | backend `parseServerEnv` (server-only) | Server-side only; never exposed to the browser; `.env` only |
| `FEATURE_*` | both | All off (the default) unless approved |

## Merge order

1. Owner approval. The PRs are unmerged by rule, and merging them needs the user's explicit "merge them".
2. PR #1 I01 -> `develop`.
3. Retarget PR #2 I02 to `develop`, then merge.
4. Retarget and merge PR #3 C01.
5. Retarget and merge PR #4 B01. **Before merging, decide on B01 review findings H1 (assignment window no-op), H2 (no cancel without a policy) and H3 (non-doctor categories)** from `BACKEND_STATUS.md`; partial fixes are on `wip/B01-fix-round1`.
6. PR #5 when it is identified.
7. Reset the local database before applying migrations 001 to 005 (`npx supabase db reset --local`; they were edited in place during review).
8. Merge `develop` into `feat/fe2-integration` (lead), then make the fixes in the table above, auth first.

The only file both sides changed since their common base `d532f09` is `.gitignore`, so a low conflict risk is expected.

## Risks

- **Auth mismatch blocks the core flow.** Without Bearer injection, bookings and admin review return 401 everywhere. Fix this before any smoke test.
- **Frontend calls routes that don't exist:** `/api/onboarding/patient`, `/api/consultations/*`, `/api/bookings/:id/collection` and `/api/bookings/:id/proof` return 404. Clinical routes are flag-gated. The questionnaire submit is not, so a patient would see a "not found" error after filling it in.
- **B01 open findings:**
  - H1: assigned staff see the patient's address and phone early.
  - H2: patients can't cancel without a policy. This matches the frontend's fail-closed cancel when there are no terms, but it means no cancellation at all.
  - H3: lab, ambulance and caretaker bookings can't complete.
- **Shape mismatches** on addresses, slots and reschedule are already gated in the frontend, but must be reconciled before those features go live.
- **`API_CONTRACTS.md` is stale.** It still proposes `/api/providers?...` for the directory and `/api/onboarding/provider`. Most real routes are listed only as exceptions in `tests/unit/http-routes-contract.test.ts`.
- **Unverified backend areas** (`BACKEND_STATUS.md`): real Auth/MFA flows, Storage cross-org behaviour, signed URLs (503) and staging.
- **PR #5** is unidentified.

## Smoke checklist (after merge and fixes; synthetic data only)

```bash
# 0. Database and env (local only; values in .env, never committed)
npx supabase start && npx supabase db reset --local
export FRONTEND_ADAPTER=http APP_ENV=development APP_ORIGIN=http://localhost:3000
npm run lint && npm run typecheck && npm test        # includes tests/unit/http-routes-contract.test.ts
npx next build && npx next start -p 3000             # the same exported env applies to both commands
# 1. Public catalog (no token): expect 200 { results, nextCursor }
curl -s "http://localhost:3000/api/catalog?category=doctor&pin=500032" | head -c 400
# 2. Sign up and sign in a synthetic account (@example.invalid), then keep the access token in a shell variable only
curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"synthetic.patient@example.invalid","password":"<synthetic>"}'
# 3. Session: expect 200 { profile, roles }
curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
# 4. Booking list without a token: expect 401 { error: { code: "unauthenticated" } }; with the token: 200 { items }
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/bookings
curl -s http://localhost:3000/api/bookings -H "Authorization: Bearer $TOKEN"
```

Then in the browser (`http://localhost:3000`):
- [ ] `/en/doctors` and `/en/lab-tests` show "not connected" (search contracts pending); `/en/login` signs in.
- [ ] `/en/patient/dashboard` lists bookings from B01 after the Bearer fix (before it: an error state, not fake data).
- [ ] A doctor account accepts and declines a synthetic request (`/en/doctor/requests/[id]`); the version conflict on a second tab shows the conflict message.
- [ ] An admin with MFA (`aal2`) reviews a synthetic provider (`/en/admin/providers/[id]`); without MFA the admin role is absent (I01 `identity_roles`).
- [ ] Clinical, records, lab, ambulance, caretaker, family, saved, reviews and notifications pages show their gate notices.
- [ ] `npx playwright test` against this server: the fixture-only specs skip; `doctor-search` "never invents doctors over HTTP" passes.
