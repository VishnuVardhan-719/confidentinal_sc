# Frontend change requests (append-only)

Agents append entries here for changes outside their owned paths or for missing/unclear contracts. Do not edit or delete other entries.

---

## FE10-12-data (Kiro D, feat/fe2-d, base 3174196) - 2026-11-18

Source compared: `origin/task/B01-booking` @ e8a71ed (read-only inspection, not merged).

### Booking state mismatches (B01 vs docs/specs/BOOKING_AND_CONSULTATION.md + FRONTEND_MASTER section 9/11)
1. **Case and names.** B01 `bookings.state` is lowercase: `draft, requested, accepted, confirmed, in_progress, completed, declined, expired, cancelled, no_show, interrupted`. Spec uses uppercase and `IN_PROGRESS` vs `IN_CONSULTATION`. Frontend `src/modules/doctor/types.ts` follows B01 lowercase.
2. **Doctor visit overlay is a substate, not booking states.** B01 has `substate in (scheduled, en_route, arrived, service_started, service_completed)` while booking stays `confirmed`/`in_progress`. Spec lists `EN_ROUTE, ARRIVED, ARRIVAL_VERIFIED, IN_CONSULTATION` as lifecycle states. Frontend models a `phase` using B01 substate names.
3. **`ARRIVAL_VERIFIED` missing in B01.** No substate, no OTP challenge table, no `POST /api/bookings/:id/verify-arrival`. B01 `/arrive` only advances substate; it does not start a challenge. B01 `/start` (`service_started`) does not require arrival verification, so the server does not enforce "OTP before consultation". Frontend adds `arrival_verified` as a proposed phase. Backend request: add challenge + verify route + substate, and make `/start` require it.
4. **Error codes.** B01 returns `{ error: { code } }` with `invalid_input`, `booking_unavailable`, `identity_unavailable` (not the frontend `validation`/`unavailable`). Frontend maps by HTTP status via `codeFromStatus`, so this works, but the body code names should be aligned or documented.
5. **Responses carry only `{ version }`.** Commands (`accept, en-route, arrive, start`) return just the new version. Frontend refetches; fine, but a doctor-view DTO is needed to refetch (see 6).

### Missing/unclear contracts (http adapter returns `fail("gated")` until agreed)
6. **Doctor views:** no doctor-scoped DTO for request list (minimal pre-accept fields), assigned visit list, or visit detail. `GET /api/bookings` and `GET /api/bookings/:id` return raw RPC rows of unspecified shape. Needed: `DoctorRequestView` / `AssignedVisitView` shapes in `src/modules/doctor/types.ts`.
7. **Arrival challenge:** need read (`GET` challenge state: expiry, attempts left, resends left, resend-available-at; never the code), resend, and verify (`{ challengeId, code }` -> verified / rejected with reason `invalid_code|expired|replayed|attempts_exhausted`; wrong doctor -> 403).
8. **Clinical:** `GET` draft route missing (needed for conflict recovery); response shapes for `POST /draft` (`{ version, savedAt }`), `POST /finalize` (signed consultation) and `GET /consultations/:id` (draft vs final discriminated by `status`) are frontend proposals in `src/modules/clinical/types.ts`. No amendment route exists in API_CONTRACTS at all (`POST /api/consultations/:id/amend` proposed).
9. **PDF:** `GET /api/consultations/:id/pdf` is described as file delivery. Frontend needs a link-issuing DTO `{ consultationId, version, url, expiresAt }` (or confirmation that the route streams the file with auth and the UI should link to it directly).
10. **Records/patient:** no patient record list endpoint (final-only), no health-fact list/confirm endpoints, no proof revoke or public verify endpoint, no photo consent / upload-URL / view-link endpoints. `POST /bookings/:id/collection` and `POST /bookings/:id/proof` response shapes are frontend proposals in `src/modules/records/types.ts` / `http.ts`.
11. **Clinical policy values not approved:** OTP validity (5 min), attempts (5), resends (3) and resend cooldown (30 s); proof lifetime (24 h); signed link lifetime (300 s); photo max size (10 MB); vital warning thresholds (none shipped; `VitalWarningRule[]` must come from approved clinical governance config); required-field minimum for finalization (`missingForFinalize`). All are fixture/proposed values only.

### Shared code requests
12. `src/modules/clinical/http-util.ts` is a private fetch wrapper (no-store, same-origin, Idempotency-Key, status->code mapping, zod-validated responses). Replace with the shared client in `src/lib/api/**` when its owner publishes one.
13. `StatusTone`/`StatusDescriptor` live in `src/modules/clinical/status-core.ts`. If a shared status/tone type is added under `src/lib` or `src/components/shared`, these maps should switch to it.
14. Message keys referenced by status maps (`doctor.*`, `clinical.*`, `payment.collection.*`, `common.status.unknown`) need entries in `src/messages/{en,te,hi}` by the i18n owner (phase 2 UI ticket).

## FE10-12 phase 2 pre-UI logic (Kiro D, feat/fe2-d) - 2026-11-18
15. **Auth guard.** `src/modules/auth` (requireRole) is not on this branch yet. `src/modules/doctor/routing.ts` holds pure guard decision logic (`decideDoctorAccess`, `loginRedirect` with doctor-path-only `next`). The doctor layout will call `requireRole` once fe2-b auth is merged; please confirm its result shape (unauthenticated / forbidden / restricted).
16. **Backend (B01):** need `GET` list of the doctor's own bookable resources so Accept can send `resourceIds` (B01 only has `POST /api/provider/booking/resources`). `DoctorApi.listAcceptResources` returns `gated` over http until then.
17. **Backend (B01):** decline reasons. The frontend offers doctors `provider_unavailable | unable_to_service | other` (B01 `reasonSchema`); `patient_request` is not offered to doctors. Confirm whether "other" needs a free-text note.
18. **Shared UI (fe2-a):** the consultation editor needs a step rail/stepper, sticky mobile action bar, conflict review dialog (side-by-side changed steps) and a DraftStatus live-region badge. Will compose locally in `src/components/clinical/**` if not provided.

## FE10-12 DC01-DC14 gap review (Kiro D, feat/fe2-d) - 2026-11-18
19. **DC11 correction route:** added `RecordsApi.correctHealthFact` (attributed new version with mandatory reason + evidence; prior value kept). No contract exists: http returns `gated`. Backend: please add `POST /api/bookings/:id/health-facts/:factId/correct` or equivalent.
20. **DC02/DC03 patient side:** the patient arrival view (doctor identity/photo, code shown only after ARRIVED, "check doctor in person, do not share" copy) and patient timeline belong to the patient area, not doctor routes. Owner of `src/app/[locale]/patient/**` should reuse `src/modules/doctor/timeline.ts` (`timelineReducer`) and `status.ts` maps. Needs a patient-scoped challenge DTO that includes the code for the patient only.
21. **DC02 support-assisted fallback** (two-party, audited, doctor cannot self-approve) is a staff/backend flow: not modelled in the doctor module.
22. **DC09 family grants:** fixture denies everyone except the record's own patient. Family/guardian grant model and contract are needed before any shared-record view.
23. **Dashboard verification banner:** needs the provider verification status from the verification module (fe2-b). `loadDoctorDashboard` will take it as an extra injected dependency once that API is on this branch.
24. **E2E:** `tests/e2e/doctor-workspace.spec.cts` is a skipped skeleton. It uses `.cts` so typecheck stays green until fe2-a adds `@playwright/test`; rename to `.spec.ts` after that merge. Needs a fixture sign-in helper from the auth owner.
25. **E2E fixture reset:** the doctor e2e specs mutate the process-wide synthetic world (`sharedClinicalWorld`). A dev/fixture-only reset hook (e.g. a route that exists only when `FRONTEND_ADAPTER=fixture` and `APP_ENV!=production`, owned by the lead/foundation) would make suites independent. Until then specs run serially per booking.

## XREVIEW-b D1-D8 follow-ups (Kiro D, feat/fe2-d) - 2026-11-18
26. **fe2-b auth:** the doctor/clinical/records getters now take `ApiContext { http: { baseUrl, getAccessToken }, fixtureActor }` per request (`src/modules/clinical/context.ts`). Need from fe2-b after merge: a server helper that returns the bearer token from the httpOnly session cookie, and a mapping from the fixture session (`FIXTURE_SESSIONS[scenario].identity.userId`) to `FixtureActor` (doctor -> `FIXTURE_IDS.doctorAssigned`, patient -> `FIXTURE_IDS.patientA`). Unmapped/no session = `NO_ACTOR` (deny all).
27. **Ops:** `APP_ORIGIN` env var (bare https origin) is required for server-side http adapters (`appOrigin()` throws if missing/invalid). Add to `.env.example` (lead owns it).
28. **X1 status tones (fe2-a):** doctor/clinical/records maps use `progress`; fe2-a `StatusBadge` has `brand` and no `progress`. Proposal: fe2-a adds `progress` (clock icon); otherwise pages map `progress` -> `info`. Not changed here (not D1-D8; needs the fe2-a owner).

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

## R-FE-D-29 (from fe-d owner) - server intent id for sign/amend recovery (XREVIEW-c P1)
Amendment/finalize responses can be lost. The frontend now accepts a readback as success only if the CURRENT signed version is an amendment of the submitted base, with the same reason, reasonText and exactly the submitted content (finalize: first signing only, same consultationId); otherwise it shows conflict/review. That is still inference. Request: the clinical contract echoes the Idempotency-Key (or a server mutation id) on each signed version/amendment record, so recovery can bind the result to this intent and signer exactly. Until then a byte-identical amendment from another clinician would be indistinguishable (attribution still shows the server signer).

## R-FE-D-30 (from fe-d owner) - autosave terminal failures (XREVIEW-c P2)
Reconnect no longer lifts forbidden/unauthenticated/validation/gated autosave blocks or refills the retry budget. Only an explicit "Try saving again" (draft machine `retry_requested`) clears it. Backend note: the draft PUT must still re-check authorization on every write.

## R-FE-D-31 (from fe-d owner) - patient dashboard built in fe2-d (FE-C2 handover)
- `/[locale]/patient/dashboard` (page/loading/error) + `src/modules/patient-dashboard/{loader,session}.ts` + messages `patient.json` (en/te/hi).
- Byte-identical copies from feat/fe2-c@0331c6b so fe2-d builds: `src/modules/{bookings,patient,payments,catalog,providers}/*` (import closure only), `src/lib/api/{fixture,http}.ts`, `src/lib/format/index.ts`, `src/fixtures/marketplace/{bookings,doctors,patient,payments,providers}.ts`, `src/messages/*/booking.json`. On merge take fe2-c's version of every one of these; fe2-d made no edits to them.
- Interim patient session: http mode = unauthenticated -> login; fixture mode needs server env FIXTURE_PATIENT_SESSION=self. Replace with fe2-b requireRole("patient").
- The fe2-c bookings fixture seeds nothing by default; server env FIXTURE_BOOKING_SCENARIO (e.g. accepted) selects a synthetic booking in fixture mode.
- Missing routes linked from the dashboard: `/patient/bookings`, `/patient/bookings/[id]`, `/patient/profile`, `/patient/health-profile` (owners: fe-c / fe-b).
- `payment.status.*` keys are referenced by fe2-c `payments/status.ts` but `payment.json` is empty; dashboard uses its own `patient.dashboard.payment.*` labels.
- Clinical badge matches patient records by booking reference; it shows "Clinical records are off" while FEATURE_CLINICAL is off. A per-booking clinical-status field in the booking DTO would be better.

## R-FE-D-32 (from fe-d owner) - browser e2e deferred
Per user rule, no Playwright/browser runs from agents. `tests/e2e/doctor-workspace.spec.cts` stays `test.fixme` and the patient dashboard has no e2e spec yet; both are deferred to a run the owner starts. Evidence for fe2-d is lint, typecheck, unit tests and build only.


## R-FE-D-32 update (fe-d3, 2026-11-19) - browser e2e now run
The restriction was lifted. `tests/e2e/doctor-workspace.spec.ts` (un-fixme'd) and the new `tests/e2e/patient-workspace.spec.ts` run in Chromium on the ws-desktop-1280 and ws-mobile-390 projects (ports 3370-3383): 110 passed, 0 failed (see .context/handoff-fe-a.md on feat/fe2-d).

## R-FE-D-33 (fe-d3) - proof-of-visit QR and public check page
No QR library is approved and there is no public verification route, so the proof card shows the proof code, expiry and an honest "QR display and the public check page are not connected yet" line. Needed: lead approval of a QR dependency (or server-rendered QR image) and a public `/verify/[token]` page backed by `RecordsApi.verifyProof` that shows no PHI.

## R-FE-D-34 (fe-d3) - patient notifications contract
`docs/API_CONTRACTS.md` has no notifications endpoint. `src/modules/notifications` holds kind + IDs + in-app path only (text comes from localized templates, so no PHI or free text can travel). Fixture adapter is synthetic; http adapter returns `gated` and the page says "not connected yet". Suggested contract: `GET /api/me/notifications` (newest first, `{ id, kind, createdAt, readAt, bookingReference, href }`), `POST /api/me/notifications/read` `{ ids }`.
**Overlap:** feat/fe2-p 4aa02f8 also built `/patient/records*`, `/patient/notifications` and `src/modules/notifications` with a different API. Lead must pick one before integration.

## R-FE-D-35 (fe-d3) - doctor weekly hours
`/doctor/availability` now shows a read-only 7-day IST schedule built from `listVisits` (accepted/confirmed/in-progress only) and the pending request count. Editing weekly hours needs a backend contract (e.g. `GET/PUT /api/providers/me/availability` with versioned weekly windows and exceptions).

## R-FE-D-36 (fe-d3) - te/hi strings to review
Machine-written te/hi for: `patient.records.*`, `patient.notifications.*`, `patient.dashboard.notifications.*`, `patient.dashboard.actions.records*`, `patient.shell.nav.records|notifications`, `doctor.pages.availability.*`, `doctor.common.offlineSince`, `clinical.vitals.incompleteTitle`. Unchanged te/hi for edited en copy: `doctor.common.notFound`, `clinical.gate.consultation`, `clinical.collection.recorded`, `clinical.record.notFound`, `common.gate.features.clinical` (en now "Clinical record keeping").

## R-FE-D-33 update (fe-a, PHASE R7-D task 1) - public proof check built
`/[locale]/verify` (code entry, plain GET form, works without JS) and `/[locale]/verify/[code]` (valid / expired / withdrawn / unknown) over `src/modules/proof-of-visit`. Shows only the IST visit date, "Doctor home visit" and the doctor display name; malformed and unknown codes look the same; canonical lowercase URL; `noindex` and `referrer: no-referrer`. Behind FEATURE_CLINICAL; the http adapter returns `gated` because there is no public verification endpoint in docs/API_CONTRACTS.md (suggested: `GET /api/proofs/:code` returning exactly `{ status, serviceDate?, serviceCategory?, providerDisplayName? }`, rate limited). The doctor proof card links to the check page. Still open: drawing a QR (no approved library). New namespace `verify` (te/hi machine-written, need review); shared edits: `src/i18n/messages.ts`, `src/i18n/global.d.ts`, `playwright.config.ts` WORKSPACE_SPECS.

## R-FE-D-37 (fe-a, R7-D task 2) - consultation notes contract
`/[locale]/doctor/consultations/[bookingId]` + `src/modules/consultation-notes`: assigned doctor, completed bookings only, draft -> sign-off (summary + advice required, attestation), optimistic `expectedVersion`, read-only after sign-off, no autosave and no browser storage. Fixture only behind FEATURE_CLINICAL; http adapter returns `gated`. Suggested contract: `GET /api/bookings/:id/consultation-notes`, `PUT .../consultation-notes` `{ expectedVersion, sections }`, `POST .../consultation-notes/sign-off` `{ expectedVersion, attest: true }` (409 on stale/signed/not-completed). New namespace `consultationNotes` (te/hi machine-written, need review). Also: visit page "After the visit" link (completed bookings).
Test notes: two doctor-workspace tests hardened (IST-midnight boundary on fixture-relative times; wait for hydration before changing a controlled select). The second points at a real slow-device risk: a select changed before hydration is reset by React (worth a look in fe2-a form controls).

## R-FE-D-38 (fe-a, R7-D task 3) - prescription drafts contract
`/[locale]/doctor/consultations/[bookingId]/prescription` + `src/modules/prescription-drafts`: template-only (typed medicine name, no drug database or suggestions; fixed form / schedule / instruction templates; 1-90 days; max 10 lines), completed bookings only, `expectedVersion`, discard with confirmation, no autosave or browser storage. Status is always `draft`; there is no issue/send action and the page says "Draft - not issued ... not a valid prescription". Fixture only behind FEATURE_CLINICAL; http `gated`. Issuing needs owner approval (clinical production + legal e-prescription rules) and a backend contract. New namespace `prescriptionDrafts` (te/hi machine-written, need clinical-language review).

## R-FE-D-39 (fe-a, R7-D task 4) - doctor reviews view
`/[locale]/doctor/reviews` + `src/modules/doctor-reviews` (own fixture; statuses and limits aligned with feat/fe2-p `src/modules/reviews`: pending_moderation | published | rejected, rating 1-5, text <= 1000). Read-only; filter links (`?status=`); summary over published reviews only. Privacy: no patient name, booking reference or exact date (visit month only), and rating/text are returned ONLY for moderation-published reviews (projection in the adapter; schema rejects text on unpublished). Behind FEATURE_CLINICAL per PHASE-R7-D (reviews are not clinical; lead may move this to its own flag), http `gated`. Suggested contract: `GET /api/providers/me/reviews` returning the projected shape. Doctor nav gains "Reviews". New namespace `doctorReviews` (te/hi need review).

## R-FE-D-40 (fe-a, R8-D step 2) - input before hydration is silently lost (reproduced)
**Repro:** `tests/e2e/hydration-race.spec.ts` serves the HTML but holds every `/_next/static/chunks/*.js` until released (a very slow phone, deterministically), types/chooses, then lets React hydrate.
**Findings (before the fix, 3 of 3 controlled forms failed):**
- React 19 keeps the DOM value the person typed or chose, but component state keeps its initial value (`""`). The screen shows "Cash" / "800" / the typed note while state is empty.
- Collection form: "Record collection" then reported "Choose a method" and "Enter an amount" next to fields that visibly held them; the next render reset the select to the placeholder. Consultation notes: the typed text showed, but the status said "Not saved yet" and Save would have saved an empty note. Prescription draft: "Enter the name of medicine 1" with the name visible.
- Uncontrolled forms (`defaultValue`, plain HTML submit) are not affected.
- Separate finding: `redirect()` from a page inside a Suspense boundary (any route with `loading.tsx`) is streamed as `<meta http-equiv="refresh" content="1;url=...">` plus a script. Chrome only acts on it after the load event, so with JS still loading the GET form for `/verify` never moved on. Fixed for /verify with a route handler (`/[locale]/verify/check`, HTTP 303), which works with no JavaScript.
**Fix applied in fe-d's own files:** `src/components/clinical/use-hydrated.ts` (`useSyncExternalStore`, false in server HTML and during hydration) disables controlled inputs until hydration in the collection form, arrival-code form, consultation editor, health-facts and photo-consent panels, consultation notes and prescription drafts. After the fix the spec passes at 390px and 1280px.
**Proposed patch for shared controls (not applied; owner fe2-a `src/components/ui/input.tsx`, plus controlled forms in fe2-b auth/onboarding, fe2-c booking wizard, fe2-e ops):**
```tsx
// src/lib/use-hydrated.ts  (move fe-d's hook here)
export const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);

// src/components/ui/input.tsx ("use client"): protect controlled inputs only; uncontrolled/no-JS forms unchanged.
export function Input({ disabled, ...props }: ComponentPropsWithRef<"input">) {
  const hydrated = useHydrated();
  const lock = props.value !== undefined && !hydrated;
  return <input {...props} disabled={disabled || lock} aria-disabled={lock || undefined} /* existing classes */ />;
}
// Same for Textarea, and add a shared <Select> wrapper (native <select> elements are used directly today).
```
Alternative where a form must work before hydration: make it uncontrolled (`defaultValue` + `FormData` on submit), like the /verify form. Avoid `redirect()` for no-JS GET forms under `loading.tsx`; use a route handler.

## R-FE-D-41 (fe-a, R8-D6) - shared form controls lose input typed before hydration (reproduced in one shared form; others ruled out or probable)
**Repro:** `tests/e2e/hydration-race.spec.ts` "shared controls" (JS chunks held back, same harness as R-FE-D-40). Home page `ServiceFinder` (`src/components/public/service-finder.tsx`, owner fe2-a): PIN `500001` typed and "Lab tests" chosen before hydration are visibly CLEARED when React hydrates (state `""` wins), then Find shows "Enter your 6-digit PIN code" and "Choose a service". Fails at 390 and 1280. Marked `test.fail()` so the suite stays green; delete that line once fixed (the test then has to pass).
**Shared controls checked:**
| Control | Result |
|---|---|
| `src/components/ui/input.tsx` `Input`/`Textarea` | Pass-through `<input>`/`<textarea>`. Affected only when used controlled (`value=`) without a hydration gate; uncontrolled use is safe (proof check passes with no JS). |
| `ServiceFinder` (controlled `value`/`checked`) | **Reproduced** (above). |
| `FaqSearch` | Ruled out: the search box is hidden until hydrated (`enhanced`). |
| `PhoneInput`, `OtpInput` (`src/components/shared`) | Controlled by design (`value` + `onValueChange`). Not used by any page on feat/fe2-d, so not run here. On fe2-int `auth-flow.tsx:232` uses `PhoneInput` controlled: **probably affected**, needs the same harness on fe2-int. |
| Radix `Select`/`Checkbox`/`RadioGroup` (`src/components/ui`) | Ruled out by structure: they render `<button>`s with state in React only, so a click before hydration changes nothing on screen (unresponsive, but no hidden mismatch). On this branch they are used only in fe-d forms, which are already hydration-gated (R-FE-D-40), so not browser-tested here. |
**Proposed fix for ServiceFinder (not applied; fe2-a owns it):** keep it a progressive GET form, but make the fields uncontrolled so React never overwrites what the person entered:
```tsx
// pin: drop value/onChange state; normalise in place.
<input name="pin" defaultValue="" onInput={(e) => { e.currentTarget.value = normalizePin(e.currentTarget.value); clearPinError(); }} ... />
// radios: drop checked={...}; keep onChange only to clear the error.
<input type="radio" name="service" value={s.key} onChange={clearServiceError} ... />
// submit: read what is on screen.
function onSubmit(e) { e.preventDefault(); const fd = new FormData(e.currentTarget);
  const result = validateFinder({ pin: normalizePin(String(fd.get("pin") ?? "")), service: String(fd.get("service") ?? "") as ServiceKey | "" }); ... }
```
The same pattern (or R-FE-D-40's `useHydrated` gate) applies to `PhoneInput`/`OtpInput` users.

## R-FE-D-42 (fe-a, R8-D6) - fixture production guard is now an allowlist (ADVERSARIAL_REVIEW finding 2); integration notes
- `src/lib/api/mode.ts`: `fixtureRefusal()` / `assertFixtureEnvironment()`. Fixtures are allowed only when `APP_ENV` is `development`, `test`, `preview` or `staging`, or when `APP_ENV` is unset under `next dev`/vitest (`NODE_ENV` development/test). `VERCEL_ENV=production` always refuses. The real process env is authoritative; an injected env can add a refusal, never lift one. `getAdapterMode`, `assertFixtureMode` (`src/lib/api/fixture.ts`) and `assertFixtureAllowed` (`src/fixtures/clinical/world.ts`) all use it. Tests: `tests/unit/fixture-production-guard.test.ts`.
- **Lead decision:** `staging` is on the allowlist because fe2-c/e/p/int e2e specs document `APP_ENV=staging` with fixtures. The review proposed development/test/preview only; remove `staging` if staging must never serve synthetic data, and update those specs.
- **Breaking for e2e:** `next start` runs with `NODE_ENV=production`, so a fixture server with `APP_ENV` unset is now refused (checked: `/en/doctor/dashboard` logs "Synthetic fixtures are disabled here (APP_ENV is not set)" and renders no fixture data). fe2-d's `wsEnv()` now sets `APP_ENV=test`. Integration (`.context/int2-serve.ps1`, `tests/e2e/integration.config.ts`) and any other fixture server must set `APP_ENV` too.
- **fe2-int merge:** `src/modules/auth/fixture-guard.ts` (fe-b) still checks only `APP_ENV === "production"`. Patch: `export function assertFixtureAllowed(env = process.env) { assertFixtureEnvironment(env); }` (import from `@/lib/api/mode`).
- **R-FE-Q-R9C3-2:** on feat/fe2-d the patient dashboard already takes the actor from `getPatientSession().fixtureActor` and imports nothing from `@/fixtures`; `tests/unit/no-fixture-imports-d.test.ts` now fails on any fixture value import in `src/app` or `src/components`. The `DEFAULT_PATIENT_ACTOR` import at fe2-int `page.tsx:20` came from the merge resolution. Patch for fe2-int: replace `requireRole(...)` + `DEFAULT_PATIENT_ACTOR` with `const s = await requirePatientSession(locale, path); if (s.status === "denied") return <AccessDenied reason={s.reason} />; const fixtureActor = s.fixtureActor ?? undefined; const synthetic = s.synthetic;` (`requirePatientSession` is in fe2-int `src/modules/patient-dashboard/session.ts`), and pass `authorizePatient: authorizerFor()`.

## R-FE-D-43 (fe-a, R8-D7) - R-FE-D-41 fixed: shared controls adopt input typed before hydration
- New `src/components/shared/use-early-input.ts`: `useOnHydrated(capture)` (runs once in a layout effect right after hydration, before paint and before any re-render), `useEarlyInputRef(value, adopt)` for single inputs, and `mergeRefs`.
- `ServiceFinder` reads the form's `FormData` at hydration and adopts the PIN (normalised) and the service. It stays a controlled, progressive GET form; no disabled gate, so it still works with no JS.
- `PhoneInput` and `OTPInput` adopt an early DOM value through `onValueChange` (normalised/sanitised). Props and API are unchanged (callers' `ref` still works), so fe2-b's `auth-flow.tsx` needs no change.
- Tests: `tests/e2e/hydration-race.spec.ts` finder case is a normal passing test at 390 and 1280 (`test.fail` removed; it now also requires the form to accept early input). `tests/unit/early-input.test.ts` hydrates real server HTML in jsdom: a plain controlled input loses the text (baseline), `PhoneInput`/`OTPInput` keep it (these 2 fail on the previous code), no change reported when nothing was typed or the DOM equals state.
- Still different by design: fe-d's own clinical forms use the R-FE-D-40 `useHydrated` disable gate (a clinician must not act on a half-hydrated clinical form). Radix Select/Checkbox/RadioGroup need nothing (no DOM state before hydration).

## R-FE-D-44 (fe-a, R9-D8) - first request for each unknown story slug returns HTTP 200 (soft 404); owner of `stories/[slug]` (fe-a public, now edited on fe2-e)
**Diagnosis (not a load race; a cold-cache race):** reproduced on a scratch build of `952c069` (before R8-D7), so it predates the finder change.
- Combined run on `952c069` (all 4 projects): 449 passed / 2 failed / 1 skipped; the 2 failures are this test at 390 and 1280, same as on `234ec90`.
- Direct probe on a freshly started `next start`: the FIRST request for each new slug (`/en/stories/anything`, then `/en/stories/other-slug`) is HTTP 200 with the localized not-found page and `<meta name="robots" content="noindex">`; every later request for that slug is 404. `/te/no-such-page` (catch-all, which never reads params) is always 404. Concurrency (1/8/24 parallel requests on a warm server) does not change it.
- Cause: with `cacheComponents`, `stories/[slug]/page.tsx` awaits `params` for a slug outside `generateStaticParams`, so Next serves the prerendered fallback shell (200) and streams `notFound()` afterwards; the result is then cached as 404.
- `export const dynamicParams = false` is rejected by the build ("not compatible with nextConfig.cacheComponents"), checked on the scratch copy.
**Test change (fe2-d `tests/e2e/public.spec.ts`):** a 200 on a `/stories/` URL is accepted only if it is the localized not-found page AND noindex; the test then reloads and requires 404 (annotation `cold-soft-404`). Unknown non-story routes must still be 404 on the first request.
**Proposed fix for the owner (not applied, not verified):** answer unknown story slugs with a real 404 before rendering, e.g. in `src/proxy.ts` rewrite `/{locale}/stories/<slug>` to the static catch-all not-found when the slug is not in the published list (nothing is published today), or call `notFound()` before reading `params` while no story is published. Re-check after the CMS lands. Crawlers currently see one 200+noindex per new URL; users see the correct page.

## R-FE-D-45 (fe-a, R9-D8) - ADVERSARIAL_REVIEW D1-D4 and C3-2 fixed on feat/fe2-d
- **D1:** `parseDoctorReviewFeed()` drops `DOCTOR_OMITTED_STATUSES` (`withdrawn`) before the strict parse; any other unknown status still fails closed. The fixture now emits a bare withdrawn row so the drop is exercised. Server contract stays R-FE-Q-R9C5-1 (omit withdrawn). fe2-c `peer-guards` still passes: `REVIEW_STATUSES` is unchanged.
- **D2:** `/doctor/reviews` shows cards (with date and visit month) for published reviews only; pending and rejected reviews are counts only ("1 review waiting for moderation", "1 review not published by moderation") with no date, month or id. The status filters are removed (an old `?status=` link is ignored). New en/te/hi strings `unpublished.*`, `list.nonePublished` (te/hi machine-written; REVIEW_NEEDED).
- **D3:** `/verify/check` returns 303 with a relative `Location` from `proofCheckLocation()`; it never reads the Host header. 80-character echo cap, `no-referrer` and `no-store` kept.
- **D4:** every `useHydrated()` form/panel sets `aria-busy` while not hydrated and renders `HydrationStatus` (visually hidden `role="status"` "Please wait." from `common.actions.working`), empty after hydration. A unit guard fails if a new `useHydrated()` user omits them.
- **C3-2:** no change needed on fe2-d (the dashboard reads `getPatientSession().fixtureActor`; `no-fixture-imports-d.test.ts`). The fe2-int import comes from the merge; patch in R-FE-D-42.
