# Handoff: Kiro B (fe2-b, branch feat/fe2-b)

## Done (committed)
- `ed384ee` auth pages, patient profile + health profile, profile gate (USER-REQ-1 A+D).
- `64b916f` PHASE3-B: requireRole wrong role -> own landing; getAccountSession (`@/modules/auth/server`, shape in REQUESTS R-FE07-01); role-isolation unit tests; R-FE07-01..03 migration targets.
- Checkpoint commit (this shutdown): remaining PHASE2-B pages, WIP, see below.

## In the checkpoint commit (built, partly e2e-verified)
- Patient questionnaire `/[locale]/patient/(intake)/onboarding` (?step=, server-saved, review + consent + submit).
- Provider onboarding `/{doctor,lab,ambulance,caretaker}/onboarding` via `src/components/onboarding/provider-onboarding.tsx` (start application, status + still needed, locked when not editable, documents step honest "upload unavailable", review preview + submit).
- Admin `/admin/providers` (URL filters), `/admin/providers/[id]` (decisions in reason+confirm dialog, gated doc viewer), `/admin/coverage`.
- New components: wizard-form, wizard-steps, wizard-actions, admin-decision, admin-filters, admin-states, onboarding-layout. New message keys `onboarding.{wizard,patientWizard,providerWizard,adminReview}` in en/te/hi (te/hi unreviewed).
- e2e specs un-fixme'd (auth, onboarding, admin-verification, navigation).
- Checks at checkpoint: tsc 0, lint 0, `npm run build` 0. Unit tests not re-run after the page work (last: 224/224 identity).

## Last e2e run (desktop-1280, port 3310): 36 passed, 13 failed, 6 skipped, 13 did not run (serial)
Known failures to fix (mostly spec locators, not app bugs):
1. admin access control + profile "other roles" + auth "patient cannot open admin": still assert the old denied page in places; wrong role now redirects to own landing (assert URL instead).
2. auth wrong-credentials: `getByRole("alert")` matches Next route announcer -> filter by text.
3. auth sign-out: Sign out button not found on /en/account/security after signIn (check AccountFrame header / visible()).
4. auth expired session: spec still on /en/patient/bookings in one place (regex replace missed it) -> use /en/patient/profile.
5. signup: radio /patient/i also matches "Ambulance operator ... patients" -> exact names; phone label matches tabpanel -> getByRole("textbox").
6. emergency: two links match /112/ -> name "Call 112" exact.
7. navigation auth-pages walk: `/en/lab-tests` 404 (public chrome, fe-a) -> add to OWNED_ELSEWHERE + REQUESTS.
8. onboarding "Unknown answers": `.check()` timed out at onboarding.spec.ts:43 (surgeries Listed radio) -> inspect screenshot in %TEMP%\scv-e2e-identity.
Logs: `%TEMP%\scv-e2e-all.log`.

## Remaining
- Fix the failures above, rerun e2e (desktop + mobile-360), run full vitest, axe/360px check of new pages.
- REQUESTS: R-FE07-04 (other-workstream routes skipped in e2e: dashboards, bookings, /lab/orders, /doctors, /lab-tests), AccountFrame to drop under role shells.
- COMPONENTS-identity.md: add new components.

## Commands / ports
- My port: 3310 (stopped). Start: `Start-Process cmd.exe -ArgumentList '/c','set FRONTEND_ADAPTER=fixture&& set APP_ENV=development&& npx next start -p 3310 > "%TEMP%\scv-fe2b-3310.log" 2>&1' -WorkingDirectory C:\Users\Yashwanth\fe2-b -WindowStyle Hidden`
- e2e: `$env:E2E_PORT="3310"; npx playwright test --config tests/e2e/playwright.config.ts --project=desktop-1280 --workers=1` (needs a fresh server: fixture state is process memory).
- Never push; never commit to develop/main.

## Note
- Root .gitignore `coverage/` also matches the route folder `src/app/[locale]/admin/coverage/`. Its files were force-added (git add -f). Lead: consider anchoring the rule to `/coverage/`.
