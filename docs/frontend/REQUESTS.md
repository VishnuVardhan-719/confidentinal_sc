# Frontend requests and contract mismatches (append-only)

Agents append dated sections below. Do not edit or delete other sections.

---

## 2026-11-18 · FE13-17-data (Kiro E, branch feat/fe2-e) · lab, ambulance, caretaker, admin, CMS, audit data layer

Names checked read-only against `origin/task/C01-catalog` (I01/I02/C01 migrations, routes, validation), `origin/task/B01-booking` (booking states) and `origin/task/S01-design` (`docs/S01_DESIGN.md`). Nothing was merged.

### R-E01 Shared HTTP client (owner: src/lib/api)
- `src/modules/admin/http-util.ts` is a private fetch wrapper (status-to-`ApiErrorCode` mapping, Zod response parsing, `no-store`, `redirect: "error"`, `Idempotency-Key`). Replace it with a shared client in `src/lib/api` once one exists.
- Backend error envelope on C01 is `{ error: { code } }` with codes such as `invalid_input`, `invalid_transition`, `credentials_required`, `identity_unavailable`, `catalog_unavailable`. These do not match `ApiErrorCode` (`validation`, `unavailable`, ...). The wrapper maps by HTTP status only and never shows server text. Request: agree one code vocabulary, or a documented mapping, in `docs/API_CONTRACTS.md`.

### R-E02 Shared status kit (owner: src/lib)
- `StatusTone` / `StatusDescriptor` / `describe()` are duplicated in the six `status.ts` files of these modules, because there is no shared location in my owned paths. Request: a shared `src/lib/status` helper; the modules will switch to it.

### R-E03 Feature flags (owner: src/lib/feature-flags)
- S01 defines `FEATURE_LAB`, `FEATURE_SCHEDULED_TRANSPORT`, `FEATURE_CARE` (all OFF). They are not in `FEATURE_FLAGS`. Request: add `lab`, `scheduledTransport`, `care`.
- Advanced recurring care plans have no flag. The caretaker module hard-codes the gate OFF (`RECURRING_CARE_GATE`). Request: add a `recurringCare` flag (default OFF) if the owner wants it switchable.
- Lab report review/release is gated on `isEnabled("clinical")` (release matrix: "Clinical records, prescriptions, lab report release"). S01 puts report upload/review/release in P2. Confirm `clinical` is the right gate, or add `labReports`.

### R-E04 Admin capabilities (owner: backend I01)
- I01 `admin_capabilities.capability` allows only `provider:verify`, `coverage:verify`, `security:audit`, `membership:admin`.
- The frontend model also defines proposed `booking:operate`, `payment:read`, `refund:approve`, `support:operate`, `settings:read`, `content:edit`, `content:publish` (FE spec section 15). No real principal holds them yet, so those areas render denied. Request: backend migration and contract for these, or replacement names.
- I01 RPCs only accept `scope_key = 'global'`. The frontend supports organization-scoped grants (`{ kind: "organization", organizationId }`) for audit; the backend needs an equivalent before org-scoped admins exist.

### R-E05 Provider verification states
- I01 defines `verification_state in ('draft','submitted','verified','rejected','expired','suspended')`; I02 replaces it with `('draft','submitted','under_review','approved','rejected','suspended')`. The frontend uses the I02 set. `verified` and `expired` map to "unknown", not approved.
- The FE spec lists "changes required", "active" and "expired" states, plus a "request changes" decision. I02 has none of these (decisions: `under_review`, `approved`, `rejected`, `suspended`). Request: decide whether "request changes" and expiry are states or derived flags.

### R-E06 Money format
- C01 returns `amount_paise` as a decimal string (`amount_paise::text`, `paiseSchema` string). Frontend view models use integer paise (`number`). `paiseFromServer()` in `admin/http-util.ts` converts and rejects values that are not safe integers. Confirm that the maximum (10,000,000,000 paise) stays within `Number.MAX_SAFE_INTEGER`; it does today.
- C01 `service_price_versions.unit` allows `visit|test|trip|hour|day`. Caretaker pricing per FE spec 14 needs `week` and `month`. The frontend marks those rates `periodSupportedByBackend: false`. Request: owner policy and a C01 unit change, or drop week/month.

### R-E07 Endpoints with no documented contract (http adapters return `gated`)
Documented and wired: `POST /api/admin/providers/:id/review` (body `{ decision, reason, expectedVersion }`, response `{ provider: { id, verification_state, version, ... } }` per C01). The C01 handler does not read `Idempotency-Key`; the frontend sends it anyway.

Not documented, so `fail("gated")`:
- Lab: branches, catalog, staff, order queues, order detail, assigned collections, collection commands (S01 proposes `POST /api/bookings/:id/lab/{start-collection,collected,handoff,collection-failed,handoff-failed}`), recollection request, report list/review/release.
- Ambulance: fleet, crew, request queue/detail, trip queue/detail, driver trip view, trip commands (S01 proposes `POST /api/bookings/:id/trip/{en-route,arrived,picked-up,destination-reached,interrupt}`).
- Caretaker: services/rates, staff, requests, assignments, care commands (S01 proposes `POST /api/bookings/:id/care/{start,end,interrupt}`), shifts, check-in/out, absence, replacement. Recurring plans stay gated by policy.
- Admin: provider review queue and detail (`GET`), document signed URL (I02 has `/api/providers/:id/documents/:documentId/signed-url` but it is not in API_CONTRACTS), coverage queue/review/history (C01 has `GET /api/catalog/admin/coverage` and `POST /api/catalog/admin/coverage/:id/review`; request adding them to API_CONTRACTS so they can be wired), booking ops search, admin invites/scope/suspend, payments, refunds, support queue.
- CMS: admin content CRUD/workflow and the public stories/FAQ read model.
- Audit: event list. I01 `audit_events` has no organization column; org-scoped audit reading needs one (or a join rule).

### R-E08 State-name differences (frontend follows backend/S01)
- Lab: FE spec actions "accepted/arrived/collected/failed/recollect" map to S01 substates `scheduled → collecting → collected → processing_handoff`, failures `collection_failed`, `handoff_failed`. Recollection is a new booking (S01), never a reset. Turnaround claims are stored but not shown (`turnaroundDisplayApproved: false`, S01-Q05).
- Ambulance: FE spec "reached/completed" is S01 `destination_reached` (booking state `completed`). `cancelled` and `no_show` are shared booking states; `no_show` only through support review, never a driver button.
- Caretaker: S01 substates `assigned/started/ended/care_interrupted`. Shift attendance (`scheduled/checked_in/checked_out/absent/replaced`) is a frontend view model; `care_shifts` is deferred in the schema, so the shape needs backend agreement.
- Payment status uses lowercase snake_case (`not_initiated`, `due`, `processing`, `paid`, `partially_paid`, `disputed`, `refunded`) to match the canonical schema; FE spec section 16 writes them in upper case.
- Lab staff roles `manager/collector/reviewer` are not I01 membership roles (`owner/manager/staff/billing`). Request: the scope names the backend will use for collector and reviewer.

### R-E09 Messages (owner: i18n)
- Status label keys are defined in each module's `status.ts` (`lab.status.*`, `ambulance.status.*`, `ambulance.vehicleType.*`, `ambulance.emergency.call112`, `caretaker.status.*`, `caretaker.task.*`, `caretaker.rate.*`, `admin.status.*`, `admin.priority.*`, `admin.settings.*`, `admin.cms.status.*`, `admin.audit.*`). They need en/te/hi entries. Lab completion copy must never say "report ready" (S01-Q08), and no ambulance string may contain minutes or an ETA (S01 A13).

---

## 2026-11-18 · FE13-17 Phase 2 logic (Kiro E, branch feat/fe2-e) · guards, workspaces, loaders, CMS editor

### R-E10 Public stories/FAQ helper (for the public-site owner)
- Import from server components only: `import { getPublishedStories, getPublishedStory, getPublishedFaq } from "@/modules/content/public"`.
- Signatures: `getPublishedStories(locale)`, `getPublishedStory(slug, locale)`, `getPublishedFaq(locale)`. Each returns `{ status: "ok", data, fixture } | { status: "empty", fixture } | { status: "not_found" } | { status: "unavailable" }`.
- Only published snapshots are returned. `fixture: true` means synthetic data, so render `<FixtureNotice/>`. While there is no CMS contract, lists return `empty` and a story detail returns `not_found`, so public pages show their empty or not-found state and never invented copy.
- `servedLocale` differs from the requested locale only on an explicit fallback to `en`; show a "shown in English" note in that case.
- Bodies are structured rich-text nodes (`paragraph`, `heading` 2/3, `list`, text with bold/italic, `link`). Render them with React elements and never as HTML.

### R-E11 Auth guard integration (owner: src/modules/auth)
- Route layouts in the lab, ambulance, caretaker and admin areas will call `requireRole` and then the pure decisions in `src/modules/{lab,ambulance,caretaker}/routes.ts` and `src/modules/admin/routes.ts`.
- They need these session fields from the auth module:
  - `profileId`
  - `memberships: WorkspaceMembership[]`: `membershipId, profileId, providerId, organizationId, area ("lab"|"ambulance"|"caretaker"), displayName, membershipRole ("owner"|"manager"|"staff"|"billing"), status, scopes, resourceId`
  - for admins, an `AdminPrincipal`: `profileId, status, mfaVerified` (server-asserted), `grants[]`
- Request: expose these from the server session, or a mapper, so `GuardSession` and `AdminPrincipal` are not built from client data.
- Workspace selection is stored in the cookie `scv_ws_<area>`. The value is a workspace key such as `lab:<providerId>` (no personal or health data). The server must re-validate the membership on every request.
- Login redirect: `loginRedirectPath(locale, path)` only keeps locale-prefixed internal paths and drops query strings. If auth already has an equivalent helper, the area layouts will use that one instead.

### R-E12 Placement of shared operations helpers
- Workspace/org-switcher logic (`src/modules/admin/workspace.ts`), loader results, metrics and guard decisions (`src/modules/admin/access.ts`) currently live in the admin module (FE spec section 15 covers organization management). An `organizations` module or `src/lib` may be a better home. Moving them is a mechanical import change.

### R-E13 Booking status map (owner: bookings module)
- Admin booking ops (`BookingOpsVM.bookingState`) passes the raw shared booking state through, so that the page renders it with the bookings module's canonical status map. This avoids a second map for the same state machine. Request: export `describeBookingState` (or equivalent) from the bookings module.

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
