
## 2026-11-18 — FE07/08-data / Codex C — backend contract reconciliation

Inspected read-only: origin/task/B01-booking e8a71ede046ec88cde71cf243adc54b1e64460ac and origin/task/C01-catalog 373251fd40d596a66767bdef934b71e8f69558a7, relative to origin/develop, using diff --stat and git show. No merge, fetch, migration or branch change performed.

- Public directory is GET /api/catalog and /api/catalog/:providerId with required category + PIN, not /api/providers (private onboarding). Implemented allowlisted snake_case-to-view-model mapping; decimal-string paise validated then converted within backend ceiling 10,000,000,000. No private address/contact, invented public provider ID, availability guarantee or verification badge. Please reconcile API_CONTRACTS.md/FRONTEND_MASTER.md routes centrally.
- C01 supports ascending-price cursor pagination only; price_desc is representable in public filter schema but HTTP returns gated until backend supports it. Specialty/language/distance/review/availability filtering has no verified contract. Public provider reference and detailed credentials/profile content are absent from the inspected public projection; do not fabricate them.
- B01 create accepts ONLY patientId, serviceId, addressId, startAt plus UUID Idempotency-Key and returns {id}; list returns {items}; detail {booking}; accept/decline/cancel return {version}. Adapters use these actual shapes, never submit browser price/role/status. Creation transitions draft to requested (version 2), acceptance transitions accepted then confirmed (two version increments). Resources are required for acceptance (one person; ambulance person + vehicle). Refetch on conflict; no blind retries or optimistic booking status.
- Missing: approved policy/price review and consent acknowledgment contract, expected offer version at create, category-specific booking details, selection of multiple lab service lines, approved online-payment selection. The eight-step wizard schemas represent these needs; HTTP create does NOT claim to integrate the complete wizard. Backend must preserve price/policy reapproval before real transactional UI activation.
- B01 doctor substates scheduled/en_route/arrived/service_started/service_completed are operational. They do not prove ARRIVAL_VERIFIED, IN_CONSULTATION, final clinical records, or payment state. These remain separate types. Arrival verification and clinical flows remain gated.
- Missing backend authorized-action grants: permittedActions requires explicit serverAllowedActions plus matching role/state; absent grants disable all. The current B01 projection has no grants; no UI should derive authorization from an account role alone. Need scoped grants incorporating assignment, org membership, verification and policy checks.
- Missing verified booking timeline endpoint; BookingsApi.timeline HTTP returns gated, fixture supplies minimal events. Please supply approved minimal event projection and pagination/version contract.
- Missing verified payment summary/provider collection, support list/detail/create DTO and ownership, and in-app notification list/mark-read endpoints. Proposed docs alone do not establish implemented contracts; corresponding HTTP adapters return gated without network calls. Collection schema models provider cash/direct-UPI claims only, no card data or local paid transition. Need approved reconciliation, ownership, finance/policy gates, and idempotency semantics before replacing gated adapters.
- Future locale owner: add/review keys booking.status.*, booking.action.*, payment.status.* when Phase 2 UI consumes the status maps. No translations or UI files changed in this task.

Lead action: integrate reviewed data layer, update shared task/status/evidence ledgers from src/modules/catalog/FE07-08-HANDOFF.md, assign backend contract deltas, then authorize Phase 2 UI. Fixture-only coverage is not real integration/RLS/concurrency proof.


## 2026-11-18 — Phase 2 C non-UI integration boundaries

- Owner instructed non-UI work first until fe2-a foundation merge notification. Wizard/controllers/view-models/request-scoped loaders are implemented; route pages and binding to real patient guard remain pending that notification. No fake authorization fallback or new speculative API route was added.
- Submission prepare callback deliberately gates without the missing server offer/policy/consent acknowledgment contract noted above. Later denials after unknown POST outcomes do not authorize a fresh key/intent; reconciliation retains the original key/body or known booking ID.
- B01 list is a cursor page, not a complete upcoming-bookings query. Patient loader exposes explicit page completeness and withholds global nextVisit if truncated or cursor-scoped. Backend should supply a bounded upcoming/next-visit query or a reviewed ordering/filter contract before dashboard can claim a complete next visit without fetching all pages.
- Lead can transfer non-UI verification evidence and file map from the Phase 2 section of src/modules/catalog/FE07-08-HANDOFF.md into shared task/status ledgers. Remaining Phase 1 backend capability gaps and UI integration gates still apply.

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

## 2026-11-18 - USER-REQ-1 B/C/D / Kiro fe-c2 (feat/fe2-c) - doctor search, LocationPicker, booking gate
- **R-C2-1 (backend, catalog/C01): doctor search contract.** `/doctors` needs a public search endpoint with: text query (doctor/clinic name), city/PIN, speciality, language, gender, consultation mode, max fee (paise), availability window (today/tomorrow/week, IST), minimum experience, include-fully-booked, sort (`availability`, `nearest` from a POST-body origin, `fee_asc`) and page/total. Per result: provider/service IDs, display name, https photo URL or null, specialities (taxonomy slugs), degrees, experience years, languages, gender, modes, server-aggregated rating `{average,count}` or null, fee paise + unit, open-slot count, next slot UTC, clinic name, locality/city/PIN, distance km. Plus a suggestions endpoint (doctor and clinic names). Until then `createDoctorSearchHttpApi` returns `gated` and the page says search is not connected. Shape: `src/modules/providers/doctor-search.ts`.
- **R-C2-2 (backend, profile owner fe-b): profile completion + family grants + addresses + offer/policy reads.** The booking gate counts the server's required items (`{key, required, done}` per member, keys in `src/modules/patient/schemas.ts`). The owner said "13 required"; the fixture assumes name, email, verified mobile, DOB, gender, address, city, state, PIN, pinned location, allergies, medical history, current medicines. **Owner to confirm the exact 13.** Also needed: members with `canBook`/`canViewRecords`, address list, and a server price/policy offer for a schedule. HTTP adapters are `gated` (`src/modules/patient/api.ts`).
- **R-C2-3 (fe-b): profile form anchors.** Missing-item links go to `/patient/profile#field-<key>` and `/patient/health-profile#field-<key>` (`profileItemHref`). Please give the matching form controls those IDs. Inline editing of missing items in booking step 1 needs fe-b's save API.
- **R-C2-4 (fe-a): placement and export.** Put `DoctorSearchBar` (`src/components/directory/doctor-search-bar.tsx`) on the landing page, wrapped in `BookingIntl` or with the `booking` namespace supplied, and export `LocationPicker` (`src/components/booking/location-picker.tsx`) from shared if wanted. Both are client components that need `booking.search.*` / `booking.location.*`. Deviation from R-FE01-5: doctor pages use a nested `NextIntlClientProvider` (`BookingIntl`) that ships the `booking` namespace to the browser instead of passing strings as props; reason: the combobox/filters/picker need many ICU strings. Lead to accept or ask for props.
- **R-C2-5 (owner/lead): map provider and photo domain.** "Show on map" and map pin adjustment are gated notices: no approved map vendor (sending coordinates to a third party needs approval). Doctor photos render as initials until an approved image host/`next/image` domain exists.
- **R-C2-6 (lead): patient guard.** `src/modules/auth` (requireRole) is not on this branch; patient routes stay unbuilt/fail-closed until fe2-b merges.
- **R-C2-7 (clinical review):** symptom to speciality hints (`SYMPTOMS` in doctor-search.ts) need clinical review before launch.
