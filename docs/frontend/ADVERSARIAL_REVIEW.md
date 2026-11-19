# Adversarial review of fe2-int (R9-C2) - WIP, paused for shutdown

Reviewed read-only: `C:/Users/Yashwanth/fe2-int`, branch `feat/fe2-integration`, committed HEAD `02dc8bf` (the worktree had 15 uncommitted changes by another agent; not reviewed). Line numbers are from HEAD.

## Findings so far (ranked)

1. **HIGH - synthetic cancellation policy presented as approved on a real-data page.** `src/app/[locale]/patient/book/[id]/page.tsx:20,42,127,130` imports `SYNTHETIC_CANCELLATION_POLICY` from `@/fixtures/marketplace/booking-store` and passes `{ state: "approved", version: "synthetic-v1" }` to `CancellationDialog` in every adapter mode. In http mode (B01 `GET /api/bookings/:id` works) patients would see a fake "approved" policy and a hard-coded 2-hour window. Fix: read the policy from the server (booking/offer policy) and pass `state: "unavailable"` when none is returned; keep the synthetic constant behind `getAdapterMode() === "fixture"`. Same pattern, lower risk (http adapter gated): `src/components/service-requests/request-controls.tsx:41`.
2. **MEDIUM - inconsistent money formatters.** Four implementations: `src/lib/format/index.ts:8-12` (always 2 decimals, throws on invalid), `src/components/payments/money.ts:13-22` (0 decimals for whole rupees, returns null), `src/components/admin/ops/format.ts:11-13` (accepts negative paise), `src/components/clinical/kit.ts:32` + `server-format.ts:11` (`paise / 100` through next-intl number). Same amount renders as "₹800" and "₹800.00" on different pages; admin shows negative amounts. Fix: one shared `formatPaise` (integer check, nonnegative, Latin digits, fixed 2 decimals) and re-export it.
3. **LOW - float in an editor default.** `src/components/lab/lab-views.tsx:173` uses `(r.pricePaise / 100).toFixed(2)`; exact for integer paise but bypasses the integer helpers. Fix: `paiseToRupeesInput` from `src/modules/onboarding/form-models.ts:21`.
4. **LOW - proof code in URL path by design.** `src/app/[locale]/verify/page.tsx:20` redirects to `/verify/{code}`; mitigated by `referrer: "no-referrer"` and noindex (`src/components/proof-of-visit/verify-page.tsx:29-30`). Keep codes short-lived and revocable (backend).

## Checked, no finding
- Browser storage: no `localStorage`/`sessionStorage`/`indexedDB`/`document.cookie` use in `src`. No `console.*` calls in `src`. No raw `error.message` rendered (visit-actions and error-summary pass localized text only; ticket timeline shows user-entered ticket text by design).
- Role guards: every page under `/doctor /lab /ambulance /caretaker /admin /patient` checks on the server (RouteGate, guardDoctorPage via DoctorStaticPage, requireRole/requirePatient, family `_lib` requirePatientSession, onboarding `requireRole(category)`). Every server action file authorizes through a helper (`authorizeRole`, `authorizeAreaAction`, `authorizeOperationsSession`, `getDoctorSession`, `getPatientSession`). Public search actions are intentionally unauthenticated.
- Fixture in production: `getAdapterMode` throws when `FRONTEND_ADAPTER=fixture` and `APP_ENV=production`; every module fixture constructor calls a guard (lab/care/ambulance requests delegate to the guarded engine). Exception: finding 1 (a fixture constant used outside fixture mode).
- i18n: te/hi have exactly the en keys in every namespace; no copied English (except placeholder-only strings); no hard-coded JSX text or literal aria-label/title/placeholder/alt in 388 .tsx files.

## Not finished
- Line-by-line check of fixture constants imported by non-fixture modules (only `@/fixtures` imports in app/components were checked).
- Review of the 15 uncommitted fe2-int changes once committed.
