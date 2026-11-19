# Handoff fe-p R7-P (feat/fe2-p): patient account features

## Commits (not pushed)
- ecf6f05 family members: `/patient/family`, `/new`, `/[memberId]`
- 20f0f2c saved doctors: `/patient/saved`
- 275c9da post-visit reviews: `/patient/reviews`, `/[bookingId]` (also a records e2e timeout fix)
- 317ed72 reminder preferences: `/patient/settings/reminders` (also a 15s expect timeout in the patient e2e specs)
- 284684d progress checkpoint

## What each feature does
- **Family members.** Name, relation and DOB only. DOB is validated in IST: not in the future, not more than 120 years ago. The name allows Telugu/Hindi letters. Add is idempotent; edit and remove are version-checked. Unknown, malformed and other-account ids show the same "not available" state. Limit of 10 (needs confirmation).
- **Saved doctors.** Stores provider ids only. Directory details are read live, so an unlisted doctor shows as "no longer listed" and can still be removed. Save and unsave are idempotent. The page also lists directory doctors to save from, with a status message after each change.
- **Reviews.** Only completed bookings that are not yet reviewed are eligible. The rating is a native radio group with arrow keys and text labels. Text is 10-1000 characters, with phone numbers, emails and links refused. A new review shows "Waiting for moderation". One review per booking: a retry returns the first review, and a second review returns a conflict. Not-completed, reviewed and unknown bookings get a notice instead of the form.
- **Reminder preferences.**
  - SMS, WhatsApp and email checkboxes, with a warning when all are off.
  - Quiet hours are IST HH:MM and may run past midnight; `inQuietHours()` is unit-tested.
  - Saves are version-checked. A conflict shows a notice with a reload button, and the form remounts on the new version.
- **Common to all four.**
  - States: loading, empty, error with retry, gated (http mode), denied and success.
  - Forms: Zod validation shared by client and server, with stable field codes. ErrorSummary takes focus and links to each field. 44px targets.
  - Data: synthetic stores live on `globalThis` per patient (they persist across requests). No PHI in URLs or browser storage. A guest's login return path never contains an id.

## Shared-file edits (outside the brief's path list, needed)
- `src/i18n/messages.ts` and `src/i18n/global.d.ts`: registered the new namespace `patientAccount`.
- `docs/frontend/REQUESTS.md`: R-FE-P-R7-1..4 (contracts) and R-FE-P-R7-NAV. The nav links for /patient/family, /saved, /reviews and /settings/reminders are not added, because the PatientShell belongs to fe2-d.
- `docs/frontend/REVIEW_NEEDED.md`: te/hi under `patientAccount.*` are machine-written.
- e2e specs from earlier tasks (records, bookings): the expect timeout is now 15s. These runs are on a heavily loaded machine; at 5s, tests failed intermittently and passed on rerun.

## Verification (final)
- `npx tsc --noEmit` 0, `npx eslint` 0, vitest 63 files / 994 tests pass (unit: family 19, saved 7, reviews 10, reminders 14).
- `npm run build` 0.
- Playwright on port 3384, both projects (mobile-390 and desktop-1280), all patient specs, run with `pwsh .context/fep-e2e-all.ps1`:
  - mode on (clinical on, seeded stores): 68 passed
  - mode off (empty stores): 38 passed
  - guest: in the full run, 2 redirect tests timed out at 390 under load. After the timeout change, a guest-only rerun of all patient specs: 12 passed.

## Known limitations
- No backend contracts exist; the http adapters return `gated`.
- Saved: no save button on the doctor directory or profile pages (owned by fe2-c).
- Reviews: no edit or withdraw, and no admin moderation queue.
- Reminders: sending is server-side; quiet-hours bypass rules for safety messages need a product decision.
- Fixture stores are shared by everything on one server. Rerunning the reviews spec against the same server fails, because each booking can be reviewed once. Restart the server between runs (the script does this).
- Port 3380 is still held by fe2-d's server; everything ran on 3384.
