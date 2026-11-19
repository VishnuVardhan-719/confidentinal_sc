# Handoff: Kiro B / fe-b (fe2-b, branch feat/fe2-b)

## Done (committed)
- `ed384ee` auth pages, patient profile + health profile, profile gate.
- `64b916f` role guards for all six roles (wrong role -> own landing), getAccountSession, role-isolation unit tests.
- `015a4d6`, `a6fd92b` PHASE2-B pages checkpoint (questionnaire, provider onboarding, admin providers/coverage).
- PHASE4 Task A (this pass): the 13 identity e2e failures fixed; see below.

## PHASE4 Task A: what changed
App fixes (real bugs found by e2e):
- `src/components/auth/auth-flow.tsx`: signup role choice was lost when switching Email / Mobile tab (uncontrolled RadioGroup per tab). Now controlled state shared by both tabs.
- `src/components/shared/error-summary.tsx` (shared, fe-a area, needed for a real failure): summary links that point at a fieldset/list (e.g. medical conditions list) focused nothing. Now focus the first form control inside the group.
- `src/components/auth/session-links.tsx`: "My workspace" link was `hidden` below 640 px, so mobile users had no way back to their workspace from account pages. Now icon-only with an sr-only label below `sm`.
- `src/fixtures/identity/providers.ts`: lab.owner had a pending-review workspace but no application draft ("Nothing to show yet"). Added a synthetic under_review lab draft.
Spec fixes (locators / changed behaviour):
- Wrong role now redirects to own landing: auth, admin-verification, profile assert URL instead of the old denied page.
- Alerts filtered by text (Next route announcer is also role=alert); radios by `^name`; phone by textbox role; "Call 112" exact; "None" answer regex covers per-step wording; error summary takes focus, then its link focuses the field (GOV.UK pattern).
- Pages on other branches avoided: sign-out from /account/security, expiry check on /patient/profile, `/lab-tests` in OWNED_ELSEWHERE, dot-segment test tolerates an aborted navigation from the guard redirect.
- `tests/unit/ui-messages.test.ts`: `onboarding.adminReview.decision.dialogTitle` ("{action}: {name}") allowed identical in all locales.

## Test results (port 3310, `next build` + `next start`, fixture adapter)
- e2e, each spec file on a freshly started server (fixture state is process memory):
  - desktop-1280: admin-verification 10/10, auth 28/28, navigation 4 pass + 4 skipped (fixme: role walk, other branches), onboarding 14 pass + 2 fixme, profile 6/6.
  - mobile-360: same counts, all passing.
  - One desktop auth run under heavy machine load had 2 timeouts; rerun 28/28.
- vitest 386/386, tsc 0, eslint 0, build 0.

## Open
- R-FE07-04 in docs/frontend/REQUESTS.md: other-workstream routes still skipped/fixme here; re-run on integration.
- Root .gitignore `coverage/` also matches `src/app/[locale]/admin/coverage/` (files force-added). Lead: anchor the rule to `/coverage/`.
- COMPONENTS-identity.md not yet updated for the new onboarding components.

## Commands
- Clean build: stop the 3310 server first; building under a running `next start` makes it serve 500 chunks.
- Run: `$env:E2E_PORT="3310"; npx playwright test --config tests/e2e/playwright.config.ts --project=desktop-1280 --workers=1 <spec>` with a fresh server per spec file.
