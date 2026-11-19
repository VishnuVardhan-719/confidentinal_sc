# Handoff fe-p (feat/fe2-p), task t4: patient records, notifications, public loading.tsx

## Done
- `/[locale]/patient/records`: the signed records list (listMyRecords). It shows the visit time in IST, the signer, the booking reference, the version, the last signed time and an amended marker. It has gated (FEATURE_CLINICAL off), denied, error-with-retry and empty states, plus loading.tsx and error.tsx.
- `/[locale]/patient/records/[id]`: getMyRecord renders the read-only SignedRecordView. The PdfPanel gets its link from the server action `requestMyRecordPdfLinkAction` (uuid validation, session re-check, short-lived link, rel=noreferrer). Unknown, draft, other-patient and malformed ids all show the same "not available" state. The guest login return path is `/patient/records`, never the id.
- `/[locale]/patient/notifications`: the module exists, so the page uses it. The NotificationList shows only the kind and the time. "Mark as read" is optimistic, version-checked by `markNotificationReadAction` and rolls back on error. When the http adapter returns gated, the page shows a "not available yet" notice that links to bookings. `FIXTURE_NOTIFICATION_SCENARIO=empty` (server env) shows the empty inbox. Route-local selector: `notifications/api.ts`.
- Nav: Records and Notifications were added to PatientShell and to the dashboard nav.
- Strings: en/te/hi for records, record and notifications. The 92 te/hi English placeholders left by t38 (bookings) are now machine-written translations. This fixes 2 failing `messages.test.ts` tests. `patient.booking.timeline.actor.system` ("SureCure Visit") is allow-listed as a brand. All of this is listed in docs/frontend/REVIEW_NEEDED.md.
- Public loading.tsx: only `(public)/doctors/[id]/loading.tsx` (plus `components/public/route-loading.tsx`). Two other approaches were tried and reverted:
  - A group-level `(public)/loading.tsx` breaks `next build`: the `[...rest]` catch-all calls notFound() inside the boundary during prerender.
  - Per-route loading.tsx on the static pages makes no-JS visitors see only the skeleton. This failed the public no-JS e2e for `/hi/emergency` (tel:112) and `/en/faq`.
  - Lead to confirm this decision (REVIEW_NEEDED.md).
- e2e: new `tests/e2e/patient-records.spec.ts` (axe and no-horizontal-scroll at 390 and 1280). Fixed flaky locators in `patient-bookings.spec.ts`: they are scoped to `main`, because React 19.2 throttles Suspense reveals and briefly holds a hidden copy outside main. The mobile menu helper now retries until the page has hydrated.

## Verification
- tsc exit 0, eslint exit 0, vitest 59 files / 946 tests pass, `npm run build` exit 0.
- Playwright on port 3384, both projects (mobile-390, desktop-1280), via `.context/fep-e2e-all.ps1`:
  - clinical on: 30 passed (records 12 + bookings 18)
  - clinical off + empty inbox: 22 passed (records 4 + bookings 18)
  - guest: 4 passed
- public.spec + a11y.spec (guest server): 106 passed, 13 failed. All 13 are `te` pages at desktop-1280 with a 12px horizontal overflow, including the home page, which this task did not touch. This was not caused by this task (fe-a header area).
- Screenshots at 390 and 1280 checked by eye, with 0 console errors.

## Port conflict (lead please note)
Port 3380 is held by a `next start -p 3380` from **fe2-d** (pid 12828, started 17:34). fe-d's port range 3370-3383 overlaps fe-p's 3380. I did not touch it and used **3384** instead.

## Known limitations
- The fixture notifications inbox is not patient-scoped and is rebuilt on every request, so a mark-as-read does not persist after a reload.
- The records empty state is not covered by e2e, because the fixture patientA always has one signed record.
- The http adapter for patient records and notifications is gated (no contracts yet).
- The patient pages' loading.tsx shows a skeleton without JS. This matches the existing bookings pages; the workspace already needs JS.

## Commands
- Server: `pwsh .context/fep-serve.ps1 -Mode on|off|guest -Port 3384` (records its PID in `.context/server-3384.pid`)
- Everything: `pwsh .context/fep-e2e-all.ps1` (after `npm run build` with FRONTEND_ADAPTER=fixture APP_ENV=test)
