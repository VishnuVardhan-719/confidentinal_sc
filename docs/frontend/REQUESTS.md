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
