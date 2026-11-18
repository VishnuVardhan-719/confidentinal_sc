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

---

## 2026-11-18 · Kiro A (fe2-a) · phase 2 + USER-REQ-1 A

### R-FE01-6 (to fe-b, auth) — session for the public header, sign-out, return path
`src/components/shared/session-seam.ts` `getPublicAccount()` returns `null` until wired. Please provide from `@/modules/auth/server`: the signed-in account's display name (optional), its authorized workspaces (role + dashboard or onboarding href) and a POST sign-out route that clears the httpOnly cookies and redirects to `/{locale}`. Then replace the seam body. The header Sign in link sends `?next=<public path>` (built by `safeReturnPath`: internal, no query/hash). The login page must still validate `next` server-side.

### R-FE01-7 (to fe-c2, providers/search) — doctor search URL and suggestions
- Landing hero search navigates to `/{locale}/doctors?q=<text>&pin=<6 digits>` or `&city=<text, max 60>`; no JS goes through `/{locale}/find?search=doctors&q=&location=` (303 to the same URL). Please honour `q`, `pin`, `city` on the results page.
- Suggestions: `src/components/public/search-suggest.ts` (server action) returns `gated`. On integration call the providers module and return `SuggestionGroup[]` with groups `specialities | symptoms | doctors | clinics`, localized labels, locale-less hrefs, published verified providers only. No suggest endpoint exists in API_CONTRACTS; this needs a backend contract (not invented here).
- The shared `LocationPicker` (USER-REQ-1 C) should be added to the `@/components/shared` barrel when it lands; fe2-a will review the export.

### R-FE01-8 (to all) — shared kit changes that affect consumers
- Status tones now include `progress`; module maps can keep `{ labelKey, tone }` and render via `KeyedStatusBadge` / `toStatusDescriptor`. Full `labelKey`s must exist in en messages: `tests/unit/messages.test.ts` scans `labelKey: "..."` literals. Payment status keys (`payment.status.*`) were added to match fe2-c's map; please send any other namespace keys you need (booking, clinical, ...) so fe2-a can add en/te/hi.
- `GateNotice` accepts `reason="contract_pending"` for gates without a feature flag.
- `normalizeIndianMobile` no longer truncates; over-long input fails `isValidIndianMobile`.

### R-FE01-9 (to lead) — config files touched outside listed paths
- `vitest.config.mts`: `server.deps.inline: ["next-intl"]` (lets jsdom tests render components using the locale `Link`) and `testTimeout: 20000`.
- `next.config.ts`: security headers + CSP (`script-src 'self' 'unsafe-inline'`, no third-party origins; Supabase origin from `NEXT_PUBLIC_SUPABASE_URL` in `connect-src`), `poweredByHeader: false`. Approved vendors (Razorpay, Maps) must be added explicitly when their gates open.

### R-FE01-10 (to lead) — runtime 404 shell (known limitation)
For URLs not prerendered (unknown `/{locale}/...` and story slugs), Next 16 + Cache Components streams an error shell (`<html id="__next_error__">`, status 404) that the client replaces with the localized not-found page. Without JS that shell has no `lang`, title or text. The documented fix for a dynamic root layout is the experimental `app/global-not-found.tsx` (`experimental.globalNotFound`), which needs a decision because it is experimental and must resolve the locale without root params. The first request for a new story slug also returns 200 (noindex) before later requests return 404.

### R-FE01-11 (to lead / ex-fe-c2 code on feat/fe2-c) — doctor search integration and a script bug
- Landing hero placement for R-C2-4 is ready: `src/app/[locale]/(public)/page.tsx` renders fe2-a's `DoctorSearch` today and carries the exact swap to `<BookingIntl><DoctorSearchBar idPrefix="hero" /></BookingIntl>` after the merge. Header primary nav now has "Find doctors" -> `/doctors` (desktop + mobile), alongside the Services menu and footer links.
- Bug on feat/fe2-c `src/modules/providers/doctor-search.ts`: `querySchema` and `citySchema` use `\p{L}` without `\p{M}`, so most Telugu/Hindi words (vowel signs are combining marks) fail validation and the results page rejects the URL. Add `\p{M}` to both character classes (`cleanSearchText` in `doctor-search-bar.tsx` too). fe2-a's `doctorSearchHref` already keeps combining marks and otherwise mirrors the schema.

### R-FE01-12 (to lead) — browser e2e deferred by user rule
Per the owner's instruction, Playwright/browser e2e is not run from this worktree any more. These specs are written but DEFERRED (not verified in their final form): `tests/e2e/public.spec.ts`, `tests/e2e/public-nav.spec.ts` (nav walk, signed-out header, hero doctor search, no-JS search), `tests/e2e/a11y.spec.ts` (axe at 360/768/1024/1440 x en/te/hi, 200%/400% zoom reflow, keyboard focus, security headers), `tests/e2e/perf.spec.ts` (lab metrics, gated by `E2E_PERF=1`). The last partial run before the rule (on a stale server, then a single-worker run stopped by the orchestrator) showed failures that were being fixed: 360px header overflow (fixed: compact "112" emergency label), Telugu story-page overflow (fixed: buttons and headings wrap), axe on the runtime 404 error shell (see R-FE01-10). Run them once on the integration branch with `--workers=1` before release; `NAV_WALK_STRICT=1` there.
Last measured lab numbers (mobile 390, 1.6 Mbps / 150 ms RTT / 4x CPU, run alone): `/en` FCP=LCP 1.3 s, CLS 0.000, JS 201 KB compressed; `/te` 2.0 s, CLS 0.007; `/en/faq` 0.9 s; `/en/emergency` 1.0 s. These are lab indicators, not Lighthouse or real-user numbers (Lighthouse was not installed and was not added).

### R-FE01-13 (to lead) — PHASE3-A gaps in src/app (outside fe-a's edit scope)
- Add `src/app/[locale]/(public)/stories/[slug]/loading.tsx` with `export { PublicPageLoading as default } from "@/components/public/page-loading";` (the only public route rendered at request time; the others are prerendered).
- `stories/[slug]/page.tsx` "unavailable" branch renders no `<h1>`; wrap it in `<PublicPageIntro title={t("unavailableTitle")}>` or call `notFound()` and add a key, then update `tests/unit/a11y-static.test.ts`.
- Route-link check (`tests/unit/route-links.test.ts`): 0 dead links; 73 pending routes owned by fe2-b (login/signup), fe2-c (doctors, lab-tests, ambulances, caretakers, patient), fe2-d (doctor) and fe2-e (lab, ambulance, caretaker, admin). Remove entries from its `PENDING` map as each branch merges.
