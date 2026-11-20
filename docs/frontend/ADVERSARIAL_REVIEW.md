# Adversarial review of fe2-int (R9-C2)

Reviewed read-only: `C:/Users/Yashwanth/fe2-int`, branch `feat/fe2-integration`, committed HEAD `b8e6215` (2026-11-20). No fe2-int file was edited. The review started at `02dc8bf`; the two commits after it (`47b6574`, `b8e6215`) change only `tests/e2e/**`, `playwright.config.ts`, `.context/**` and docs, with no change under `src/` (`git diff --stat 02dc8bf b8e6215 -- src` is empty), so every `src` line number below is valid at `b8e6215`.

Scope: PHI in URLs, storage and logs; role-guard gaps; non-integer money maths; fixture adapter reachable in production; i18n key parity te/hi vs en; hard-coded strings.

## Status on feat/fe2-c (R9-C3)

- Finding 1 is fixed on eat/fe2-c. journeyApis() returns cancellationTerms (synthetic terms in fixture mode, 
ull in http mode). The page passes { state: "unavailable" } when there are no terms, hides the closed-window notice and no longer imports @/fixtures. equest-controls.tsx:41 (service requests, http adapters gated) is not changed yet.
- Findings 1, 3, 4 and 6 now have static guards in 	ests/unit/adversarial-guards.test.ts. Known defects in other owners' files are exempt and listed in docs/frontend/REQUESTS.md R-FE-Q-R9C3-1 and -2. te/hi key parity was already guarded by 	ests/unit/messages.test.ts.

## Findings (ranked by severity)

| # | Severity | Area | Where | Owner |
|---|---|---|---|---|
| 1 | HIGH | Fixture data on a real-data page | `src/app/[locale]/patient/book/[id]/page.tsx:20,127,130` | fe-q (C) |
| 2 | MEDIUM | Fixture in production | `src/lib/api/mode.ts:9`, `src/modules/auth/fixture-guard.ts:7` | fe-a (foundation) |
| 3 | MEDIUM | Money formatting | four `formatPaise` implementations | fe-a + owners |
| 4 | MEDIUM | i18n (Hindi plural for zero) | `src/messages/hi/{ambulance,auth,common,lab}.json` | each namespace owner |
| 5 | LOW | PHI-adjacent data in URLs | `src/modules/providers/doctor-search.ts:23-26`, `src/app/[locale]/patient/{lab-tests,caretakers,ambulance}/page.tsx` | fe-q (C) |
| 6 | LOW | Float in a money editor default | `src/components/lab/lab-views.tsx:173` | fe-b (E), fixed on branch |
| 7 | LOW | Proof code in URL path | `src/app/[locale]/verify/page.tsx:20` | fe-d / backend |

### 1. HIGH: synthetic cancellation policy shown as "approved" in every adapter mode

`src/app/[locale]/patient/book/[id]/page.tsx:20` imports `SYNTHETIC_CANCELLATION_POLICY` from `@/fixtures/marketplace/booking-store`. Line 127 passes `policy={{ state: "approved", version: "synthetic-v1", summary: t("policySummary", { hours: SYNTHETIC_CANCELLATION_POLICY.cancelWindowMinutes / 60 }), feePaise: 0, refundPaise: null }}` to `RequestActions`. Line 130 uses the same constant for the "changes closed" notice. Neither line checks the adapter mode. B01 `GET /api/bookings/:id` exists, so in http mode a real patient would see an invented 2-hour window, labelled as an approved policy with no fee, for a real booking. That is a fake business term, which AGENTS.md forbids.

Same pattern, lower risk: `src/components/service-requests/request-controls.tsx:41` hard-codes `{ state: "approved", version: "synthetic-v1", ... }`. The lab, care and ambulance http adapters are gated today, so no real booking reaches it yet.

Fix: build the policy from the server (booking or offer policy snapshot). When none is returned, pass `{ state: "unavailable" }` so `CancellationDialog` shows its unavailable state, and hide the "changes closed" hours. Use `SYNTHETIC_CANCELLATION_POLICY` only when `isFixtureAdapter()` is true, ideally inside `journeyApis()` (`src/modules/bookings/journey.ts:30` already does this for the fixture bookings API), so the page never imports from `@/fixtures`. Add a unit test that the page model gives `state: "unavailable"` in http mode.

### 2. MEDIUM: the fixture production guard only reads `APP_ENV`

`getAdapterMode()` (`src/lib/api/mode.ts:9`) and `assertFixtureAllowed()` (`src/modules/auth/fixture-guard.ts:7`) refuse fixture mode only when `APP_ENV === "production"`. A production deploy with `FRONTEND_ADAPTER=fixture` and `APP_ENV` unset or mistyped (copied from a preview environment, for example) would serve the fixture auth adapter. That adapter accepts any 1-128 character password and the fixed OTP `246810` (`tests/e2e/support/fixture-session.ts:8-9`, `src/modules/auth/fixture.ts`), and the fixture identities include admin and operations principals (`src/modules/admin/session.ts:3-5,40-56`). The default is http, so this needs a configuration mistake. The failure would be serious, though, and nothing at runtime catches it.

Fix (one function, both call sites): use an allowlist. Allow fixture only when `APP_ENV` is `development`, `test` or `preview`, and also refuse when `VERCEL_ENV === "production"`. The e2e servers run `next start` with `APP_ENV=test`, so they keep working. Add unit cases for an unset `APP_ENV`, `APP_ENV=prod` and `VERCEL_ENV=production`.

### 3. MEDIUM: four different paise formatters

- `src/lib/format/index.ts:8-12`: always 2 decimals; throws on a negative or non-integer value.
- `src/components/payments/money.ts:13-22`: 0 decimals for whole rupees, otherwise 2; returns null when invalid; forces Latin digits.
- `src/components/admin/ops/format.ts:11-13`: 2 decimals; accepts negative paise (`Number.isSafeInteger` only), so admin pages can show "-₹…".
- `src/components/clinical/kit.ts:32` with `server-format.ts:11`: `paise / 100` passed through next-intl `number()` with currency style (2 decimals, verified "₹800.00"). It has no integer or nonnegative check and does not force Latin digits.

None of these adds or subtracts rupee floats (no totals are computed from `paise / 100`; the repo-wide grep found only display conversions). The problem is that one amount renders as "₹800" on payment pages (`money.ts`) and "₹800.00" everywhere else, and only two of the four formatters reject negative values.

Fix: keep one shared `formatPaise` in `src/lib/format` (safe-integer check, nonnegative, `numberingSystem: "latn"`, fixed 2 decimals, en-IN grouping). Make the other three re-export or call it, and give admin an explicit signed variant if refunds need a sign.

### 4. MEDIUM: Hindi plurals show "1" for zero

CLDR puts 0 in the Hindi `one` category (`new Intl.PluralRules("hi-IN").select(0) === "one"`; Telugu gives `other`). These Hindi messages hard-code `1` in the `one` branch and have no `=0` case, so a count of 0 renders as "1":

- `src/messages/hi/ambulance.json` `dashboard.daysLeft`: `one {1 दिन बाकी}`. `src/modules/ambulance/view-models.ts:92,96` emits `daysLeft: 0` for a vehicle or driver licence that expires today, which shows as "1 day left".
- `src/messages/hi/auth.json` `otp.attemptsLeft`: `one {1 प्रयास बाकी}` (`src/components/auth/otp-step.tsx:82`). With no attempts left it reads "1 attempt left".
- `src/messages/hi/common.json` `errorSummary.title`, `src/messages/hi/lab.json` `orders.testCount`: same defect, lower impact.

Fix: use `#` in the Hindi `one` branch (`one {# दिन बाकी}`), or add an explicit `=0 {...}` case as the en file does for other counts. Add a check to the i18n parity test: for `hi`, a `one` branch must contain `#` or the message must have `=0`.

### 5. LOW: free-text search and patient PIN in URLs

- `src/modules/providers/doctor-search.ts:23-26` puts `q` in the URL (up to 80 letters, digits and punctuation). The comment on line 24 says "never ... free symptom text", but `q` accepts any typed text, so "chest pain" typed into the search box ends up in browser history and server access logs. Symptoms chosen from suggestions use the `symptom` enum, which is fine. `next.config.ts:49` sets `Referrer-Policy: strict-origin-when-cross-origin`, so the text does not leak to other sites.
- `src/app/[locale]/patient/lab-tests/page.tsx:29`, `caretakers/page.tsx:29` and `ambulance/page.tsx:30` read `?pin=` on signed-in patient routes. A PIN is coarse location data, not PHI on its own.

Fix: when submitted text matches a known symptom or speciality, map it to `symptom=` or `speciality=` and drop `q`. Otherwise keep `q` and state the trade-off in the privacy notice. No change is needed for PIN.

### 6. LOW: float conversion in the lab catalogue editor (already fixed on fe2-e)

`src/components/lab/lab-views.tsx:173` sets the default with `(r.pricePaise / 100).toFixed(2)`. The result is exact for integer paise, but it skips the shared helpers. `feat/fe2-e` (`c99a4c7`) already uses `paiseToRupeesString(r.pricePaise)` on that line, but that commit has not been merged into `b8e6215` yet. Fix: merge fe2-e.

### 7. LOW: proof-of-visit code in the URL path (by design)

`src/app/[locale]/verify/page.tsx:20` redirects to `/verify/{code}`. Mitigations: `referrer: "no-referrer"` and noindex (`src/components/proof-of-visit/verify-page.tsx:29-30`), and `rel="noreferrer"` on the link in `src/components/clinical/proof-card.tsx:102`. The backend should keep codes short-lived and revocable.

## Checked, no finding

- **Browser storage and logs:** `src` has no `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` use and no `console.*` calls. No raw `error.message` is rendered. Signed URLs open with `rel="noreferrer"` (`signed-record.tsx:121`, `payments/document-link.tsx:32`).
- **URLs:** private-route query strings carry only enums, cursors, opaque UUIDs and PIN (admin audit `category`/`outcome`/`cursor`, lab/ambulance `queue`, request `providerId` validated with `z.uuid()`, family/saved/reviews `status`). The admin booking lookup goes through a server action, so the reference never enters the URL (`src/modules/admin/admin-actions.ts:35-38`). Login `next` and `reason=session_expired` carry no personal data. No coordinates, phone numbers, names or reasons appear in any URL builder.
- **Role guards:** every page under `/doctor /lab /ambulance /caretaker /admin /patient` checks on the server. Every server action authorizes per call, either inline or through a file-local helper: doctor `getDoctorSession` (`doctor/actions.ts` `apis`, `consultations/actions.ts` `notesApi`/`draftsApi`), patient `getPatientSession` (`patient/actions.ts`, `family`, `saved`), admin `authorizeOperationsSession("admin")`, lab/care/ambulance `authorizeAreaAction`, verification `authorizeRole("admin")`. Doctor search and suggest actions, and the auth actions, are public by design.
- **Fixture imports outside `src/fixtures`:** every value import is gated. `journey.ts:25` checks `getAdapterMode`, the slots and doctor-search fixture factories call `fixtureGuard()`, admin `operationsViewFor` gets `isFixtureAdapter()`, `auth/server.ts:48-61` passes a fixture actor that the http adapter ignores, and the dashboard `DEFAULT_PATIENT_ACTOR` sits behind `isFixtureAdapter()`. The other imports are types or the `NO_ACTOR` sentinel. The only exception is finding 1.
- **New e2e support at `b8e6215`:** `tests/e2e/support/fixture-session.ts` uses synthetic `@example.invalid` accounts and writes Playwright storage state to the OS temp directory. It contains no secrets or real data.
- **i18n parity:** in every namespace, te and hi have exactly the en key set. Values copied unchanged from English are placeholder-only strings (`meta.titleTemplate`, `locales.en`, `adminReview.decision.dialogTitle` = `{action}: {name}`). The other placeholder-mismatch hits come from te/hi ICU plurals and word order using the same variables, so they are not defects (finding 4 is the exception). Every namespace listed in `messages.ts` exists on disk.
- **Hard-coded strings:** the scan of all `.tsx` files under `src` found no JSX text and no literal `aria-label`, `title`, `placeholder` or `alt` (0 hits).

## Method

Read-only commands against fe2-int's committed tree (`git show`, `git grep`, `git ls-tree` at `b8e6215`). Scripts are kept in this worktree under `.context/`: `i18n-audit.cjs` (key parity, copied English, placeholders), `str-audit.cjs` (hard-coded JSX strings), `act-audit.cjs` and `helpers.cjs` (server-action authorization), `hi-plural-audit.cjs` (Hindi `one` branches that hard-code 1). The Hindi plural rule was confirmed with `Intl.PluralRules`. No app server or browser was run, and no fe2-int file was edited.

## Limitations

- This is static review only. No finding was reproduced in a running app, and finding 2 was not exercised with a production build.
- The uncommitted working-tree changes in fe2-int were not reviewed; only committed history was.
- Branch heads not yet merged into fe2-int (for example fe2-e `c99a4c7`) were not reviewed, apart from the single line noted in finding 6.

## R9-C4 (2026-11-20): booking e2e after the finding 1 fix

Production build of `feat/fe2-c` (`next build`, then `next start -p 3365`) in fixture mode: `FRONTEND_ADAPTER=fixture APP_ENV=test FIXTURE_PATIENT_SESSION=self FIXTURE_PROVIDER_RESPONSE_MS=3000`.

- `tests/e2e/booking-journey.spec.ts`, 390 and 1280 (`--workers=2`): **10 passed, 0 failed**. These runs cover the happy path (search, profile, request, doctor accepts, reschedule, cancel through the dialog), the decline path, the paid receipt, wizard refusals and the keyboard-only request and cancel. axe (wcag2a/aa) was clean on every state checked, including `request/pending`, `confirmed`, `reschedule` and `cancelled`.
- `tests/e2e/a11y-sweep-c.spec.ts --grep book`, 390 and 1280: **12 passed, 0 failed** (no doctor, wizard, not bookable, completed request, receipt).
- No test expectation changed. In fixture mode the page still receives the synthetic terms, so the visible behaviour is identical. The http-mode fail-closed path is covered by unit tests (`tests/unit/adversarial-guards.test.ts`) and was not exercised in a browser.

## R9-C4 (2026-11-20): read-only review of feat/fe2-e and feat/fe2-p

Reviewed with `git show`/`git diff` only; neither worktree was edited. Bases are the commits fe2-int last merged from each branch.

### feat/fe2-e `0813f7b..9fc525c` (error boundaries, stories gated state, lab paise fix, a11y sweep)

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| E1 | LOW | `src/app/[locale]/(public)/stories/[slug]/page.tsx:15-21`, `src/modules/content/public.ts` (`getPublishedStory`) | In http mode (CMS gated) every `/stories/<anything>` now answers HTTP 200 with "not available yet". The page has no `generateMetadata`, so these URLs are indexable soft-404s. | Return `robots: { index: false }` while gated, or 404 any slug that fails the slug schema before the gated check. |
| E2 | LOW | `src/components/admin/ops/format.ts` `paiseToRupeesString` | It has no integer check (`10.5` gives `"0.10.5"`). Today it is only called after `Number.isSafeInteger` (`formatPaise`) or on Zod-validated `pricePaise` (`src/modules/lab/rules.ts:182`), so nothing renders wrong yet. Negative values keep their sign (finding 3 is still open). | Throw a `RangeError` or return `DASH` unless the value is a safe integer. |
| E3 | MEDIUM (carried) | `src/messages/hi/ambulance.json` `dashboard.daysLeft`, `hi/lab.json` `orders.testCount` | Still wrong for 0 at `9fc525c` (finding 4). | Patch in REQUESTS R-FE-Q-R9C3-1. |

Checked, no finding:
- The new `error.tsx` boundaries (`(auth)`, `(public)`) render only the digest, never `error.message`. They use the `retry` prop, which Next 16.4.6 provides.
- The lab catalogue default now uses `paiseToRupeesString`. That clears finding 6, and the `MONEY_EXEMPT` entry in `adversarial-guards.test.ts` can be deleted after merge.
- `formatPaise` now formats the exact decimal string, not `paise / 100`.
- No changes to role guards, server actions, storage, logs or URLs.
- `public` and `errors` te/hi have exactly the en keys, with nothing copied from English and the same placeholders. `admin`, `caretaker`, `ambulance`, `lab` and `common` parity is clean apart from E3 and the known `common.errorSummary.title`.

### feat/fe2-p `8f7ca31..8dc301a` (review edit/withdraw, moderation queue, moderation decision log)

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| P1 | MEDIUM (integration) | `src/modules/admin/session.ts` (`fixtureAdminPrincipal`, `FIXTURE_MODERATOR`) | In fixture mode, `FIXTURE_ADMIN_SESSION=moderator` makes `getOperationsSession()` return a moderator for every request, including signed-out ones. This is fixture-only (`getAdapterMode` and `assertFixtureMode` refuse production), but on a shared fixture preview anyone can moderate. It also conflicts with fe2-int, which replaced such server switches with real fixture sign-in (`operationsViewFor`, present at `b8e6215`). | When merging, drop the env switch and add a `review:moderate` grant to a fixture admin principal in `src/fixtures/operations/admin`, reached through the normal sign-in. |
| P2 | LOW | `src/modules/reviews/api.ts` `listQueue`, `listDecisions`; REQUESTS `GET /api/admin/reviews/decisions` | The queue and the log return every row with no cursor or limit, so a real backend would send the whole history. | Add `cursor` and `limit` to the proposed contract, the same way `/admin/audit` uses `readCursor`. |
| P3 | LOW | `src/app/[locale]/admin/reviews/actions.ts` `decideReviewAction(reviewId: string, ..., expectedVersion: number)` | Server-action arguments are untrusted, but the TypeScript types imply validation that happens only inside the fixture adapter. The http adapter is gated, so nothing reaches a backend yet. | Parse `reviewId` (`z.uuid()`) and `expectedVersion` (int ≥ 1) in the action before calling the adapter. |

Checked, no finding:
- **Guards:** `/admin/reviews` and `/admin/reviews/log` sit behind `AdminRouteGate route="reviews"` (`review:moderate`). `decideReviewAction` re-checks the principal and the capability on every call, and the adapter refuses when `moderator` is false. A decision with no attributable decider is refused, and log rows are append-only. Patient review edit and withdraw re-resolve `getPatientSession()` and are version-checked.
- **PHI:** queue items and log rows carry only the booking reference, provider, rating, outcome, reason and time, with no patient identity. The log has no review text or moderator id (only `decidedBySelf`). URLs carry only enums (`?status=`, `?done=`). There is no browser storage and no logging. Moderators see the review text by design, and submissions with contact details are refused (`text_contact`).
- **Money:** no paise code touched.
- **i18n:** `admin`, `patientAccount` and `support` te/hi have exactly the en keys, nothing copied, the same placeholders and no Hindi `one`-for-zero issue. No hard-coded JSX strings in the new components.
- **Open question raised by fe-p (REQUESTS):** should moderation decisions also go to the `/admin/audit` stream? My recommendation is yes: the server should write them to the security audit trail as well, because they are admin actions on user content. The separate read-only log can stay as the moderator-facing view.
## R9-C5 (2026-11-20): read-only review of feat/fe2-d head `f36ff67`

Diff reviewed: `b8e6215...feat/fe2-d`, i.e. the five commits fe2-int does not have yet (`835b02a` doctor reviews view, `82d151c` IST-day fixture anchoring, `34cf3aa` hydration gate and `/verify/check`, and two WIP/chore commits). I also re-checked the parts of the consultation editor these commits touch. Line numbers are at `feat/fe2-d`. Read-only: the fe2-d worktree was not touched. None of these commits touches `/lab-tests` or the sitemap; `src/app/sitemap.ts` still has no `/lab-tests` entry on fe2-d or fe2-int (fe-a's open item).

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| D1 | MEDIUM | `src/modules/doctor-reviews/types.ts:10,23` | The doctor view parses only `pending_moderation`, `published` and `rejected`. fe2-p added `withdrawn` (`src/modules/reviews/types.ts`, `fd37da2`), and the doctor schema is a strict discriminated union, so a single withdrawn review makes `doctorReviewListSchema` fail and the whole `/doctor/reviews` page shows "unavailable". This fails closed, so there is no leak, but the page breaks as soon as a patient withdraws. | Contract: the server omits withdrawn reviews from the doctor feed (they are final and hidden). Client: drop `withdrawn` rows before parsing, so one unknown row does not hide the rest. Proposal in REQUESTS R-FE-Q-R9C5-1. |
| D2 | MEDIUM (privacy) | `src/app/[locale]/doctor/reviews/page.tsx:100-101,131-133` | Pending and rejected reviews get their own card with the exact submission date ("Submitted 13 Nov 2026") and the visit month. A doctor with few visits can tell which patient wrote a review that is still waiting or that moderation rejected. This is a home-visit service, so the doctor knows that patient's address. The rating and text are hidden correctly. | Do not render per-row cards for unpublished reviews. Show only counts ("2 waiting for moderation, 1 not published"), or the month at most. Keep the exact date only on published reviews. |
| D3 | LOW | `src/app/[locale]/verify/check/route.ts:16,19` | The redirect target is built from `req.nextUrl.origin` (from the Host header), so a proxy that forwards a different Host produces an absolute `Location` on that host. The route also echoes invalid input (up to 80 characters) back into `?code=`. That text was already in the GET form's URL, so this adds no new exposure. | Use a relative `Location`, or `serverApiOrigin`/`APP_ORIGIN`. Keep the 80-character cap. |
| D4 | LOW (a11y) | `src/components/clinical/use-hydrated.ts:16`; `consultation-editor.tsx:113-114`, `note-editor.tsx`, `collection-form.tsx`, `visit-actions.tsx`, `health-facts-panel.tsx`, `photo-consent-panel.tsx`, `prescription-draft-editor.tsx` | Every control is `disabled` in the server HTML and until hydration finishes. Screen readers announce "dimmed" or "unavailable" with no reason, and on a slow phone the doctor sees a dead form for a moment. The fix itself is right: it stops typed values being lost before hydration (R-FE-D-40). | While `!hydrated`, set `aria-busy="true"` on the form or editor root and show a short visually-hidden status (the existing `common.working` string). The shared-control patch proposed in R-FE-D-40 is the long-term fix. |

Checked, no finding:
- **PHI in URLs, storage and logs:** fe2-d `src` has no `localStorage`, `sessionStorage`, `indexedDB` or `console.*`. Doctor routes use only `?status=<enum>` (reviews filter) and the login `next`/`reason`. Proof codes are 32 characters (`src/modules/proof-of-visit/types.ts:12`), so `/verify/check` cannot collide with `/verify/[code]`. The redirect sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The consultation editor shows the patient's name and age only to the assigned doctor, in the sticky header, which is by design.
- **Role guards:** `/doctor/reviews` calls `guardDoctorPage` and sits behind the clinical flag (`isClinicalEnabled`, off in production). The fixture adapter refuses any actor that is not a doctor and returns only that doctor's rows. `assertFixtureAllowed` runs in the constructor. The http adapter is gated.
- **Unmoderated content:** the projection gives rating and text only for published rows that have `publishedAt`. The strict schema rejects rating or text on pending or rejected rows, and seeded unmoderated text never reaches the doctor.
- **Money:** `parseRupeesToPaise` (`src/components/clinical/kit.ts`) parses the rupee and paise digits as integers with a regex (no floats, at most 7 digits, positive only). No new paise code.
- **i18n:** `doctorReviews`, `doctor`, `clinical` and `verify` te/hi have exactly the en keys, nothing copied, the same placeholders and no Hindi `one`-for-zero issue.
- **Fixture world rolling (`src/fixtures/clinical/world.ts:292`):** only ISO timestamp strings shift, by whole IST days. IDs, tokens and text are unchanged, and it runs only in fixture mode.

Static guards added in `tests/unit/peer-guards.test.ts`. Each block skips until its files exist on the branch and guards automatically after integration:
- **D1:** every `REVIEW_STATUSES` value in `modules/reviews/types.ts` is either parsed by `modules/doctor-reviews/types.ts` or listed in `DOCTOR_OMITS` with a decision. `withdrawn` is listed and points at R-FE-Q-R9C5-1.
- **D2 (content half):** the doctor schema rejects rating or text on pending and rejected rows, and rejects a published row with no `publishedAt`.
- **D3 (headers):** every `/verify/**/route.ts` that redirects sets `no-referrer` and `no-store`.
- **Proof:** I ran the guards with `GUARD_SRC` pointing at an export of `feat/fe2-d` src, with fe2-p's `src/modules/reviews` laid over it. Result: 4 of 4 passed. With `DOCTOR_OMITS` empty, a non-strict doctor schema and the `no-referrer` header removed (each change only in the temporary export), 3 failed as intended. The export was deleted afterwards.
- **Not guarded statically:** D2's layout half (cards for unpublished rows) and D4 need a UI decision first.
## R9-C6 (2026-11-20): re-review of the newest heads

Heads: `feat/fe2-d` `7c0065d`, `feat/fe2-p` `8dc301a` (unchanged since R9-C4), `feat/fe2-e` `87bfb6b`. Read-only (`git archive`/`git show`; no worktree edited). Each full head was scanned with `.context/rev-audit.cjs`, plus a manual read of the new commits (`14f6292`, `7c0065d`, `87bfb6b`).

| Rule | fe2-d `7c0065d` | fe2-p `8dc301a` | fe2-e `87bfb6b` |
|---|---|---|---|
| Hard-coded English in `.tsx` (JSX text, text-only lines, literal `aria-label`/`title`/`placeholder`/`alt`/`label`) | 0 | 0 | 0 |
| `toFixed`/`parseFloat` on money | 0 | 1: `src/components/lab/lab-views.tsx:173`, an old copy brought in by an earlier fe2-e merge; fixed on fe2-e `0500117` (finding 6) | 0 |
| Browser storage, cookies, `console.*` | 0 | 0 | 0 |
| Personal data in query keys | none (keys: `code`, `error`, `next`, `reason`, `role`, `status`) | none (adds `category`, `city`, `done`, `kind`, `locale`, `pin`, `providerId`, `q`, `queue`, `serviceId`, `sort`) | none (adds `provider`, `step`) |
| Private pages without noindex | 1 of 21, redirect-only | 5 of 76, all redirect-only | 4 of 51, all redirect-only |

Findings:

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| R6-1 | LOW | fe2-e `src/components/auth/auth-flow.tsx:62,128` (`87bfb6b`) | The signup role is now a controlled `RadioGroup` (`value={role \|\| values.role \|\| ""}`). A role picked before hydration is replaced by the state value (`initialRole` or empty) once React hydrates. This is the same input-loss pattern fe-d fixed with `useHydrated` (R-FE-D-40), on a public page. The server still validates the role (`signupRoleSchema`, `src/modules/auth/roles.ts:9-11`), and admin cannot be chosen. | Disable the radios until hydrated (`useHydrated`), or use the shared-control patch from R-FE-D-40. |
| R6-2 | LOW | Every private area layout on all three heads (`src/app/[locale]/{patient,doctor,lab,ambulance,caretaker,admin}/layout.tsx`) | noindex is set page by page (`privateMetadata(...)` or `robots: { index: false }`). Every page with content has it today, but no area layout sets it by default, so a new page that forgets it would be indexable. The only backstop is `robots.txt`, which disallows private paths in production only. Indexing also needs a crawler to get past auth, so the impact is low. | Add `robots: { index: false, follow: false }` to each private area layout's metadata. Pages may still add their own. |

Checked, no finding:
- The five role-root pages without noindex (`/{admin,ambulance,caretaker,doctor,lab}` on fe2-p, four on fe2-e, `/doctor` on fe2-d) only call `redirect()` and render nothing.
- `?role=` (`src/components/public/routes.ts:41`) is a signup preselect, validated server-side against `SIGNUP_ROLES`, which excludes admin. `?provider=` (`src/modules/onboarding/flows.ts:153,165,213`) is an opaque provider UUID. `?q=` is the known free-text search (finding 5). `?code=` is the proof code (finding 7).
- fe2-e `87bfb6b` adds Sign out to the ops shells and denied pages, with labels from `auth.session.signOut`.
- fe2-d `14f6292` (consultation editor a11y at 360/390) adds no strings or URL params.
- **Correction to R9-C5:** fe2-d `7c0065d` now lists `/lab-tests` in the sitemap (`src/components/public/routes.ts`, `src/components/public/sitemap-entries.ts`, with `tests/unit/sitemap.test.ts`), so that open item is closed on fe2-d.

Guards added in `tests/unit/site-guards.test.ts` (9 tests). These apply to every agent's files; earlier guards covered fe-c's files only (`invariants-c.test.ts`) or only paise-named values (`adversarial-guards.test.ts`):
- No hard-coded English in any `.tsx` under `src`.
- No `indexedDB`, `document.cookie` or `console.*` in `src`.
- No personal-data query key (name, phone, email, DOB, age, address, coordinates, notes, OTP, token, Aadhaar and similar) in any template URL, `searchParams.set` or `URLSearchParams` object.
- No `toFixed`/`parseFloat` on a line about price, amount, fee, rupee, paise or total. `lab-views.tsx` is exempt until fe2-e's fix merges.
- Every private page is noindex itself or through a layout, unless it only redirects.
- `robots.txt` lists every private area that exists under `src/app/[locale]`.
- Each detector has a self-test.

Proof: all 9 pass on `feat/fe2-c` and on exports of all three heads, with `GUARD_SRC` pointed at each export. On a broken copy of the fe2-e export, 6 failed as intended. The breakages were: a content page with no noindex and English text, a `?phone=` URL, `toFixed` on paise, `console.log`, and `caretaker` removed from `PRIVATE_SEGMENTS`. The exports were deleted afterwards.
## R9-C7 (2026-11-20): all fe-c guards against the integration head

Clean export of `feat/fe2-integration` `ab6bedb` (`git archive ab6bedb src`, made in `.context/guard-int` and deleted afterwards). It merges c `1a0db4f`, d `7c0065d`, e `87bfb6b` and p `8dc301a`. I ran `site-guards`, `peer-guards` and `adversarial-guards` from `feat/fe2-c` against it with a throwaway vitest config.

- `site-guards.test.ts`: **9/9 passed**. Repo-wide: no hard-coded English, storage, console or personal query keys, no float money, every private page noindex, and robots.txt covers every private area.
- `peer-guards.test.ts`: **4/4 passed**, none skipped. The review status sets match apart from the recorded `withdrawn` decision, the doctor projection hides unmoderated content, and the `/verify` redirects have no-referrer and no-store.
- `adversarial-guards.test.ts`, first run: **3 failed, 10 passed**. All three are known items rather than regressions:
  1. `app/[locale]/patient/dashboard/page.tsx` imports `DEFAULT_PATIENT_ACTOR` (fe-d, behind `isFixtureAdapter()`; R-FE-Q-R9C3-2).
  2. `modules/auth/fixture-actors.ts` (integration's identity -> fixture actor mapper) has no mode check of its own. Its only importers, `modules/doctor/session.ts` and `modules/patient-dashboard/session.ts`, call it only when `isFixtureAdapter()` is true.
  3. `hi:auth.otp.attemptsLeft` (fe-b) hard-codes "1" in the Hindi `one` branch (R-FE-Q-R9C3-1).
- **Change on `feat/fe2-c`:** the guard now records the dashboard page in `UI_ALLOWED`, still requiring a mode check in that file, and `fixture-actors.ts` in a new `GATED_BY_CALLER` list. A new test requires every importer of a caller-gated mapper to check the adapter mode. `hi:auth.otp.attemptsLeft` is added to `HI_PLURAL_EXEMPT`. Rerun on the same export: **27/27 passed** across the three files, and 14/14 for `adversarial-guards` on `feat/fe2-c`.
- The integration branch does not carry `site-guards.test.ts` yet; it has the older `adversarial-guards` and `peer-guards`, which are byte-identical to `1a0db4f`. It will pick up this version at the next merge of `feat/fe2-c`.
## R9-C8 (2026-11-20): final adversarial pass on the integration head

**Head:** `feat/fe2-integration` `ab6bedb`. It contains INT3 `72d42cd` and the merges of c `1a0db4f`, d `7c0065d`, e `87bfb6b` and p `8dc301a`. I made a full `git archive` export in `.context/final-int`, used a junction to fe2-c's `node_modules` (same `package.json` and lock), and deleted the export afterwards.

**Scope:** committed code only. fe2-int has uncommitted edits by fe-int2 to `patient/dashboard/page.tsx`, `hi/auth.json`, `modules/auth/fixture-actors.ts` and two tests, and I did not review them.

### What was run

| Check | Result |
|---|---|
| fe-c guards from `feat/fe2-c` `fb7465a` (`site-guards`, `peer-guards`, `adversarial-guards`) on the export | **27/27 passed** |
| The integration branch's own `vitest run` on the export | **104 files passed, 1 failed; 1457 tests passed, 3 failed.** The 3 failures are in `adversarial-guards.test.ts` as carried on the integration branch (the R9-C3 version from `1a0db4f`). They are the three known items that `fb7465a` records (dashboard fixture import, caller-gated `fixture-actors.ts`, Hindi `auth.otp.attemptsLeft`). **The integration head is red until it merges `feat/fe2-c` `fb7465a` or fe-int2 commits the fixes in progress.** |
| Role gating on every `/admin`, `/doctor`, `/lab`, `/ambulance`, `/caretaker` page (`.context/gate-audit.cjs`) | **72 of 72 pages gated on the server.** 69 call the gate directly, through a gate component (`AdminRouteGate`, area `RouteGate`, `guardDoctorPage`, `DoctorStaticPage`) or through the doctor layout. The 3 provider onboarding pages (lab, ambulance, caretaker) gate through `ProviderOnboarding` -> `requireRole(category)`. The redirect-only role roots are counted as gated. No route handlers sit under these areas. |
| Every exported `"use server"` action in `src` | **92 actions; 83 reach a session or role check** (`authorizeRole`, `requireRole`, `authorizeAreaAction`, `authorizeOperationsSession`, `getDoctorSession`, `getPatientSession`) directly or through a local helper. The other **9 are public by design**: doctor search and suggest (3) and the sign-in, sign-up and OTP flow (6). |
| Production build of the export in **http mode** (`FRONTEND_ADAPTER=http APP_ENV=test`, no backend, clinical flag off), `next start` on port 3366, rendered in headless Chromium at 1280 | `next build` exit 0. Every signed-out private URL (patient, doctor, lab, ambulance, caretaker, admin, account) redirects to `/{locale}/login?next=<safe internal path>`. The admin and ambulance sub-routes fall back to their area dashboard as `next`. Public pages with no contract show honest notices with no data: doctor search and profile ("Doctor search is not connected yet ... No doctor information is made up"), lab directory and detail ("This service is not connected yet ... No providers or prices are assumed"), stories ("Stories are not available yet"). `data-gate` is set on `/emergency` (`emergencyDispatch`), `/memberships` (`subscriptions`) and `/verify`, `/verify/[code]` (`clinical`). te/hi pages are fully localized. Local and session storage stayed at 0 entries, with no console errors. The server was stopped afterwards (PID and command line checked). |
| PHI in URLs, storage and logs | Guarded repo-wide by `site-guards` (no personal query keys, no storage, cookie or console use): passed. Runtime storage was 0 on every probed page. |
| Paise | `site-guards` and `adversarial-guards` money rules passed. `lab-views.tsx` now uses `paiseToRupeesString` (finding 6 fixed). |
| i18n parity en/te/hi | **22 namespaces:** te and hi have exactly the en keys with the same placeholders. Strings identical to English are brand-only (`common.brand`, `meta.titleTemplate`, `locales.en`, `footer.columns.company`, `patient.booking.timeline.actor.system` = "SureCure Visit"). The only defects are the four Hindi zero plurals (finding 4). |

### New in this pass

| # | Severity | Where | Finding | Status |
|---|---|---|---|---|
| F8-1 | LOW (a11y) | `src/components/directory/doctor-profile.tsx` (fe-q) | In http mode the doctor profile's gated and error states had no `h1` (seen in the http-mode probe: `h1=""`). | **Fixed on `feat/fe2-c`** in this commit: the "Find a doctor" `h1` now renders on both states. Not yet in integration. Not re-run in a browser: only http mode reaches this state, and tsc/lint/unit pass. |
| F8-2 | LOW (consistency) | `doctor-profile.tsx`, `doctor-search-page.tsx` (via `results.gated*`), `lab-directory.tsx:89,155` (fe-q) | The public directory "not connected" states use a plain `Notice`, not `GateNotice reason="contract_pending"`, so they carry no `data-gate` attribute and the shared gate copy and e2e selectors don't apply. The lab directory's gated state links "Back to doctors". | Open (fe-q). |
| F8-3 | MEDIUM (process) | Integration head `ab6bedb` | The integration branch's own unit suite fails 3 tests (see above). | Open (fe-int2/lead): merge `feat/fe2-c` `fb7465a`, or commit the in-progress fixes. |

### Final verdict

| # | Finding | Severity | Owner | Status at `ab6bedb` |
|---|---|---|---|---|
| 1 | Synthetic cancellation policy shown as approved on the real-data booking page | HIGH | fe-q | **Fixed** (`1e604fc`, in integration via `1a0db4f`; http mode gives `state: "unavailable"`) |
| 1b | `service-requests/request-controls.tsx:41` still hard-codes an approved synthetic policy (http adapters gated) | LOW | fe-q | **Fixed on `feat/fe2-c`** (R9-C9): terms come from `cancellationTermsFor(request)`; real requests get `{ state: "unavailable" }` |
| 2 | Fixture adapter production guard checks only `APP_ENV` (`lib/api/mode.ts:9`, `auth/fixture-guard.ts`) | MEDIUM | fe-a | Open |
| 3 | Four paise formatters disagree ("₹800" vs "₹800.00"; admin and clinical accept negative values) | MEDIUM | fe-a + fe-e, fe-d, payments | Open |
| 4 | Hindi `one` plural hard-codes "1" for zero (`ambulance.dashboard.daysLeft`, `lab.orders.testCount`, `common.errorSummary.title`, `auth.otp.attemptsLeft`) | MEDIUM | fe-e, fe-a, fe-b | Open (patch in R-FE-Q-R9C3-1; fe-int2 has an uncommitted `hi/auth.json` edit) |
| 5 | Free-text `q` search in the URL (history and logs) | LOW | fe-q | **Partly fixed on `feat/fe2-c`** (R9-C9): typed text that exactly matches a symptom or speciality label becomes `symptom=`/`speciality=`. Still `q`: doctor and clinic names, partial or mixed text, the no-JS form post, and fe-a's hero `/find` route |
| 6 | `toFixed` on paise in the lab catalogue editor | LOW | fe-e | **Fixed** (`0500117`) |
| 7 | Proof-of-visit code in the URL path | LOW | fe-d, backend | Accepted by design (no-referrer, noindex, no-store; backend keeps codes short-lived and revocable) |
| E1 | Gated story URLs answer 200 and are indexable | LOW | fe-e | **Fixed** (non-ok story sets `robots: { index: false }`) |
| E2 | `paiseToRupeesString` has no integer check | LOW | fe-e | Open (all current callers pass validated integers) |
| P1 | `FIXTURE_ADMIN_SESSION=moderator` made every fixture request a moderator | MEDIUM | fe-p, fe-int2 | **Fixed in integration** (switch dropped; the lead admin fixture holds `review:moderate`; `real-guards.test.ts`) |
| P2 | Moderation queue and decision log have no pagination | LOW | fe-p, backend | Open (contract) |
| P3 | `decideReviewAction` does not validate `reviewId`/`expectedVersion` itself | LOW | fe-p | Open |
| D1 | Doctor reviews schema lacks `withdrawn`; one withdrawn review breaks `/doctor/reviews` | MEDIUM | fe-d | Open (R-FE-Q-R9C5-1; recorded in `peer-guards`) |
| D2 | Pending and rejected reviews shown to the doctor with exact submission date (re-identification risk) | MEDIUM | fe-d | Open |
| D3 | `/verify/check` builds an absolute redirect from the Host header | LOW | fe-d | Open |
| D4 | Controls disabled until hydration with no busy state or status | LOW (a11y) | fe-d | Open |
| R6-1 | Signup role radio is controlled before hydration, so an early pick is reset | LOW | fe-b, fe-e | Open |
| R6-2 | No private area layout sets noindex by default (every page sets it today; guarded by `site-guards`) | LOW | area owners | Open (guarded) |
| C3-2 | Patient dashboard page imports a fixture actor (behind `isFixtureAdapter()`) | LOW | fe-d | Open (recorded in `UI_ALLOWED`; fe-int2 fix uncommitted) |
| F8-1 | Doctor profile gated/error state without `h1` | LOW (a11y) | fe-q | **Fixed on `feat/fe2-c`**, pending merge |
| F8-2 | Public directory gated states don't use `GateNotice` | LOW | fe-q | **Fixed on `feat/fe2-c`** (R9-C9) |
| F8-3 | Integration head unit suite red (3 known guard items) | MEDIUM (process) | fe-int2, lead | Open: merge `fb7465a` or commit the in-progress fixes |

**Verdict:**
- Of the 23 findings, **no CRITICAL or HIGH finding is open**. The HIGH item (1) and three others (6, E1, P1) are fixed in integration, F8-1 is fixed on `feat/fe2-c`, and 7 is accepted by design.
- 17 were open at `ab6bedb`: 6 MEDIUM (2, 3, 4, D1, D2, F8-3) and 11 LOW (1b, 5, E2, P2, P3, D3, D4, R6-1, R6-2, C3-2, F8-2). R9-C9 later fixed 1b and F8-2 and partly fixed 5 on `feat/fe2-c` (see R9-C9 below).
- **Fixture staging:** the integration head is fit for synthetic staging once F8-3 is cleared.
- **Before real data or production,** these must close:
  - Finding 2: the production guard must not depend on one env var.
  - D2: patient privacy toward providers.
  - Finding 4: wrong counts in Hindi safety-relevant text (licence expiry, OTP attempts).
  - D1: the page breaks on a valid status.
- Everything else may follow, with the backend enforcing the same rules server-side.

## R9-C9 (2026-11-20): fe-q fixes for its own open findings

All on `feat/fe2-c`, pending merge into integration.

| # | Change | Files |
|---|---|---|
| 1b | Service-request cancellation now takes the policy from the page. `cancellationTermsFor(request)` returns the labelled sample terms (`synthetic-v1`, 120 minutes) only when `request.synthetic` is true, and `null` otherwise. With no terms, `RequestStatusView` passes `{ state: "unavailable" }`, so the dialog refuses and never calls the server. `cancelState(..., null)` guesses no window, and the "changes closed" notice is hidden. The fixture engine still enforces its own 120-minute window. | `src/modules/service-requests/core.ts`, `src/components/service-requests/request-controls.tsx`, `src/components/service-requests/request-status.tsx` |
| F8-2 | Every directory "not connected" state renders `GateNotice reason="contract_pending"` (so `data-gate="contract_pending"`), keeping its specific title and body: doctor search, doctor profile, lab directory list and detail, and the patient lab, care and ambulance provider lists. The lab directory's gated action is now "Find a doctor" -> `/doctors`, and the lab detail offers "Back to labs". | `src/components/directory/{doctor-search-page,doctor-profile,lab-directory}.tsx`, `src/components/service-requests/provider-directory.tsx` |
| 5 (partial) | `structuredSearchFor(text, labels)` maps search-box text that exactly matches (after `normalize`) a symptom or speciality label in the active language to `symptom=`/`speciality=` taxonomy keys, which are already allowlisted enums. Anything else stays `q`. This mapping is safe because the taxonomy is fixed, and every symptom and speciality label is distinct after normalize in en, te and hi (a test asserts this). The search bar's submit uses it. **Still free text:** doctor and clinic names, partial or mixed phrases ("fever and cough"), the no-JS GET form, and fe-a's public hero `/find` route. These remain documented. | `src/modules/providers/doctor-search.ts`, `src/components/directory/doctor-search-bar.tsx` |

**Tests:** `tests/unit/modules-services/r9c9-fixes.test.ts` (11):
- the terms rule, and `cancelState` with no window;
- a jsdom render of `CancelRequest` with an unavailable policy (the dialog never calls `cancel`);
- no component hard-codes `state: "approved", version: "<literal>"`;
- every gated branch in the four directory files uses `GateNotice`, with no hand-made lock `Notice`;
- en/te/hi label mapping, `q` fallback and label uniqueness;
- the search bar is wired to the mapping.

**Proof:**
- Against the pre-fix sources (temporary copies, restored afterwards): **10 failed, 1 passed**.
- With the fixes: 11/11 passed.
- Fixture production build on port 3367 (stopped afterwards, PID and command line checked): `doctor-search` + `service-requests` + `lab-directory` at 390 and 1280 gave 41 passed, 3 skipped on two consecutive reruns. The first run reported 26 passed, 3 skipped and exit 1, with no failure shown in the output tail; the next two runs were clean.