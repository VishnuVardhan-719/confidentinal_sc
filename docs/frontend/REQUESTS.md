# Frontend requests (append-only)

Requests for changes outside an agent's owned paths, and contract mismatches found while building against the backend. Append new entries at the end; never edit or delete earlier ones.

---

## FE03-data (Kiro B, `feat/fe2-b`, base `3174196`), 2026-11-18

Backend inspected read-only: `origin/task/I01-auth-rls` @ `1efbab0`, `origin/task/I02-provider-onboarding` @ `34811b8`. Rule applied in the HTTP adapters: call an endpoint only if it is in `docs/API_CONTRACTS.md` or implemented on I01/I02; otherwise the method exists and returns `fail("gated")`.

### Contract mismatches

| ID | Area | Frontend spec | Backend in flight | Frontend handling | Needs |
|---|---|---|---|---|---|
| R-FE03-01 | Signup/login method | FRONTEND_MASTER s8: phone + OTP, resend countdown and throttle from server | I01: email + password only (`/api/auth/signup`, `/api/auth/login`); no OTP endpoints | `signupSchema`/`loginSchema` support both; `phone_otp`, `verifyOtp`, `resendOtp` return `gated` over HTTP | Backend/owner decision on auth method; if OTP: start/verify/resend contract returning `challengeId, maskedDestination, status, expiresAt, resendAvailableAt, resendsRemaining, attemptsRemaining, serverNow` (shape in `src/modules/auth/schemas.ts` `otpChallengeSchema`) |
| R-FE03-02 | Token transport | No tokens in browser storage (CONVENTIONS, s19) | I01 login/refresh return `accessToken`/`refreshToken` in JSON; API routes accept bearer only (`requestClient`) | `AuthApi.login/refresh` marked SERVER-ONLY; HTTP adapter takes an injected `getAccessToken()` | `src/lib/auth` owner: httpOnly Secure SameSite cookie session (or BFF) that converts cookie to bearer server-side |
| R-FE03-03 | Session view | Identity with workspaces, incomplete/restricted states, memberships | `GET /api/auth/me` returns `profile` + `roles[]` only. I02 `identity_roles()` lists a provider category only when approved + active + publishable, so draft/submitted/suspended providers are invisible; patient returned for every active account with no questionnaire status | Patient workspace mapped to `unknown`, which `canAccessRoute` treats like incomplete (fails closed: setup pages only). Unknown role strings dropped | `/api/auth/me` (or new endpoint) returning `workspaces[]`: `{ role, state, providerId?, providerStatus?, membership? }` including non-active providers and patient onboarding completion |
| R-FE03-04 | Provider status enum | draft, submitted, under_review, changes_required, approved, active, suspended, expired | I02 `verification_state`: draft, submitted, under_review, approved, rejected, suspended; `status`: active, inactive, suspended. I02 migration folds legacy `expired` into `suspended` | Frontend enum = task list + `rejected` (needed for the reject decision). `active` derived only from approved + status active. Unknown values -> `unknown` (never active) | Backend: add `changes_required` and a distinct `expired` (credential expiry), or owner confirms they are dropped |
| R-FE03-05 | Admin review decision | approve, reject, changes_required, suspend + reason | I02 `review_provider` decisions: under_review, approved, rejected, suspended; approve only from under_review | Decisions mapped approve->approved, reject->rejected, suspend->suspended; `changes_required` returns `gated`; `startReview()` sends `under_review` | Backend: `changes_required` transition (back to editable) with reason |
| R-FE03-06 | Membership roles | Spec: owner, manager, doctor, technician, driver, caregiver, billing | I01: owner, manager, staff, billing | Frontend uses I01 values (`src/modules/organizations/types.ts`) | Owner confirms whether staff sub-roles are needed |
| R-FE03-07 | Provider onboarding routes | API_CONTRACTS: `POST /api/onboarding/provider` | I02: `POST /api/providers`, `GET/PATCH /api/providers/:id`, `POST /api/providers/:id/submit`, `POST /api/providers/:id/documents` | Frontend uses the I02 routes | Docs owner: update `docs/API_CONTRACTS.md` to the I02 routes (or backend aliases the contract route) |
| R-FE03-08 | Category onboarding data | s8 fields: doctor registration/fee/PINs/radius/start/hours/photo; lab org/branches/catalog/coverage/staff; ambulance operator/fleet/crew/pricing; caretaker skills/coverage/pricing | I02 persists only `provider_profiles(display_name, description)` and document metadata | Full Zod section schemas exist (`src/modules/onboarding/provider.ts`); `saveProviderSection` persists only `listing` and returns `gated` for every other section | Backend contract(s) for category profile sections, server-saved partial drafts and versioning; public photo asset upload contract (`photoAssetId`) |
| R-FE03-09 | Required evidence | s8 also lists ID evidence for doctors/caregivers | I02 `required_kind`: doctor registration, lab licence, ambulance vehicle_permit, caretaker background_check | Frontend requires exactly the I02 kind per category; other kinds optional | Owner/verification lead confirms evidence list per category |
| R-FE03-10 | Patient questionnaire | `POST /api/onboarding/patient`, no request schema in API_CONTRACTS | Not implemented. I01 has `POST /api/auth/patient {policyVersion, consent:true}` (self patient + consent) | `submitPatientQuestionnaire` POSTs `patientQuestionnaireSchema` (sections with `state: known/none/unknown`); `createSelfPatient` uses the I01 route; draft read/save return `gated` | Backend agrees the body shape (proposal in `src/modules/onboarding/patient.ts`) and adds draft GET + per-section save with `expectedVersion` |
| R-FE03-11 | Error specificity | Map stable codes to actionable messages | I02 `databaseError` collapses `credentials_required`, `provider_profile_required`, `document_limit`, `invalid_transition` into `invalid_input` | UI can only say "invalid" on submit/review failures | Backend: return the specific stable `error.code` (and field) for these cases |
| R-FE03-12 | Review queue | s15 queue with filters | No list endpoint for verifiers | `listReviewQueue` returns `gated` | `GET /api/admin/providers?state=&category=` with pagination |
| R-FE03-13 | Private document viewer | Signed URL per issuance, short expiry | I02 `signed-url` route deliberately returns 503 `provider_signed_urls_unavailable` | Mapped to `gated`; fixture also returns `gated` (no fake URLs) | Reviewed signer that enforces lifetime |
| R-FE03-14 | Activation flags | "Record which sections are required for activation" | Not defined server-side | `requiredForActivation` flags in `PROVIDER_STEPS`/`PATIENT_STEPS` are frontend proposals; lab `staff` is optional | Owner/backend confirm per category |
| R-FE03-15 | Minors | Minor flows need governance approval | No minor/guardian flow | Personal step rejects age < 18 (`minor_flow_not_approved`) | Governance decision (canonical schema Q01) |
| R-FE03-16 | Admin MFA | Invite + MFA sign-in | Admin role only appears with `aal2`; no MFA challenge contract | Not modelled in `LoginOutcome` | Backend MFA step-up contract |

### Requests outside owned paths

- R-FE03-17 `src/messages/{en,te,hi}/onboarding.json` (i18n owner): add keys `onboarding.providerStatus.{draft,submitted,under_review,changes_required,approved,active,rejected,suspended,expired,unknown}` and step labels `onboarding.{patient,doctor,lab,ambulance,caretaker}.steps.<stepId>` as listed in `src/modules/onboarding/{patient,provider}.ts`; validation codes used in `fields` (e.g. `otp_invalid`, `otp_expired`, `pin_invalid`, `required_document_missing`, `clinical_task_requires_nursing_credential`, `minor_flow_not_approved`, `hours_overlap`) need `errors` namespace keys.
- R-FE03-18 `src/lib/auth` (owner TBD): server-side `getAccessToken()` from the cookie session, passed to `getAuthApi/getOnboardingApi/getVerificationApi({ http: { getAccessToken, baseUrl } })`.

---

## FE04-FE06 groundwork (Kiro B, `feat/fe2-b`, on `e4715d1`), 2026-11-18

| ID | Area | Finding | Frontend handling | Needs |
|---|---|---|---|---|
| R-FE04-01 | Env | Server-side calls to our own `/api/*` need an absolute origin. Deriving it from the `Host` header would let a forged header send the user's bearer token elsewhere | `src/modules/auth/server.ts` reads `APP_ORIGIN` (http/https only). If unset, HTTP-mode server calls fail as `unavailable` | Env owner: add `APP_ORIGIN=` (name only) to `.env.example` and deployment config |
| R-FE04-02 | Session refresh | Server Components cannot set cookies, so an expired access token cannot be refreshed during render | Expired session -> login with `reason=session_expired` (refresh cookie still present). `AuthApi.refresh` exists for a refresher | Owner of `src/proxy.ts` (or route handler): refresh using the `scv_rt` cookie and rewrite `scv_at` before render |
| R-FE04-03 | My providers | No endpoint lists the caller's own providers (draft/submitted ones are hidden from `/api/auth/me`, R-FE03-03) | Onboarding loader uses the workspace `providerId`, else a validated `?provider=<uuid>` lookup key returned by create (API authorizes the read; category re-checked) | Backend: `GET /api/providers?mine=true` or include non-active providers in the session workspaces |
| R-FE04-04 | `server-only` | `server-only` is not installed; Vitest cannot resolve it | Server modules (`auth/server.ts`, `*/actions.ts`) import `next/headers`, which already fails in client bundles | Package owner: optionally add `server-only` + a Vitest alias |
| R-FE04-05 | Coverage admin | No coverage list/decision contract (canonical `provider_service_areas`) | `VerificationApi.listCoverage/decideCoverage`; HTTP returns `gated`, fixture is synthetic | Backend: `GET /api/admin/coverage?category=&state=&pin=` and `POST /api/admin/coverage/:id/decision {decision, reason, expectedVersion}` |
| R-FE04-06 | i18n keys | New keys used by flow states: `auth.errors.{invalidCredentials,accountRestricted,accountExists,rateLimited,methodUnavailable,otpInvalid,otpExpired,checkFields,sessionExpired}`, `onboarding.errors.{checkFields,draftConflict,saveUnavailable}`, `admin.review.errors.{checkFields,staleVersion,unavailable,confirmRequired}`, `common.roles.*`, `common.workspaceState.*`, `errors.<ApiErrorCode>`, `errors.fields.<code>` | Returned as keys only | Added with the pages after the fe2-a i18n foundation is merged (my namespaces) or by the i18n owner (shared namespaces) |

---

## FE05 e2e scaffolding and spec-gap review (Kiro B, `feat/fe2-b`, on `4120d8f`), 2026-11-18

| ID | Area | Finding | Frontend handling | Needs |
|---|---|---|---|---|
| R-FE05-01 | Playwright | `@playwright/test` and `@axe-core/playwright` are not installed on this branch (they arrive with `feat/fe2-a`). `tsconfig` includes `**/*.ts`, so specs importing them would fail typecheck | `tests/e2e/*.ts` carry a TEMPORARY `// @ts-nocheck` (with an eslint-disable for that rule only). All suites are `test.describe.fixme` until pages exist | After the fe2-a merge: remove the two header lines from each `tests/e2e/*.ts` file and run `npx playwright test --config tests/e2e/playwright.config.ts` |
| R-FE05-02 | Playwright config | No repo-level `playwright.config.ts` exists | Area config in `tests/e2e/playwright.config.ts` (fixture adapter, port 3100, serial, artifacts in OS temp dir) | Package/CI owner: decide on a root config, or keep per-area configs |
| R-FE05-03 | Invitations | I01 `list_organization_invites` returns `organization_id, scopes, version` only; there is no organization name or role to show the invitee | `OrganizationsApi.listInvitations` shows scopes only; unknown scope strings are dropped | Backend: include organization display name and `membership_role` in the invitation list |

# Frontend cross-workstream requests (append-only)

Add new entries at the bottom. Do not edit or delete other agents' entries; reply with a new entry.

---

## R-FE01-1 (from Kiro A, FE01/FE02, feat/fe2-a) — routes linked from public pages, owned by other workstreams
Public pages link to these routes. They return the localized 404 until phase 2 builds them. The e2e link check (`tests/e2e/public.spec.ts`) skips only these prefixes.

| Route (under `/{locale}`) | Linked from | Expected owner |
|---|---|---|
| `/login` | header "Sign in" (desktop + mobile menu) | auth (FE03) |
| `/signup` | header "Sign up" | auth (FE03) |
| `/signup?role=patient` | /become-a-provider "Create a patient account" | auth (FE03) |
| `/signup?role=doctor`, `?role=lab`, `?role=ambulance`, `?role=caretaker` | landing "Offer your services" list, /become-a-provider | auth (FE03) |
| `/doctors?pin=NNNNNN` | finder, header Services menu, footer, landing doctor section | directory (FE07) |
| `/lab-tests?pin=NNNNNN` | same as above | directory (FE07) |
| `/ambulances?pin=NNNNNN` | same as above | directory (FE07) |
| `/caretakers?pin=NNNNNN` | same as above | directory (FE07) |

Contract the finder relies on: `?pin=` is a 6-digit shape-validated PIN (first digit 1-9, ASCII digits). The directory must still validate it server-side and show "no verified providers for this PIN" honestly.

## R-FE01-2 (from Kiro A) — files touched outside the listed owned paths
Necessary for FE01; please review in the diff:
- `next.config.ts`: wrapped with `createNextIntlPlugin("./src/i18n/request.ts")` (next-intl needs it). No other change.
- `src/proxy.ts`: the locale routing proxy (Next 16 name for middleware). Only next-intl locale redirects, no auth logic. Auth workstream must compose with it rather than add a second proxy file.
- `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/icon.svg` (replaces the create-next-app `favicon.ico`).
- `src/app/layout.tsx` and `src/app/page.tsx` were deleted: the root layout is now `src/app/[locale]/layout.tsx` (required by `next/root-params`, which next-intl 4.15 uses). Do not re-add a pass-through `src/app/layout.tsx`; it would become the root layout and break locale resolution.
- `package.json`: added script `test:e2e` (`playwright test`).

## R-FE01-3 (from Kiro A) — content/CMS module needed for stories
`/stories` and `/stories/[slug]` read from `src/components/public/stories-source.ts`, which returns no content (no CMS or approved content exists). Request: a `src/modules/content` API (http + fixture adapters) returning only approved, published, consented stories per locale. Swap the two functions in `stories-source.ts` to call it. Fixture stories must never render on a public production page.

## R-FE01-4 (from Kiro A) — support/contact endpoint
`/contact` has no form, because there is no approved support endpoint or staffed channel and a form that goes nowhere would be a fake CTA. When `support` exposes a public contact endpoint (with anti-abuse and no health-detail fields), add the form to `/contact`, and publish the approved phone/email/WhatsApp in `public.contact`.

## R-FE01-5 (from Kiro A) — notes for other workstreams using shared components
- Strings: add keys to `src/messages/en/<namespace>.json` first, then real te/hi translations; `tests/unit/ui-messages.test.ts` fails on missing keys, empty values, changed ICU placeholders or English copied into te/hi. Namespace files for every role already exist (empty `{}`).
- Only `common`, `errors`, `accessibility` are sent to the browser. Client components needing other namespaces should receive translated strings as props from a server parent (see `ServiceFinder`, `FaqSearch`).
- `AppShell` takes `nav: ShellNavItem[]` with already-localized labels and an icon key; `count` must be server-derived. Put role pages inside it from your role layout.
- Status badges: keep one canonical map per state machine in `src/modules/<name>/status.ts` and resolve through `resolveStatus` from `src/components/shared/status.ts` so unknown statuses render neutral.
- Import `Link`/`useRouter`/`usePathname` from `@/i18n/navigation`, not from `next/link` or `next/navigation`.
