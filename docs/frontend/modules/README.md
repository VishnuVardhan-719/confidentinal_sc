# Frontend modules on `feat/fe2-e`

Areas maintained by Kiro fe-b on this branch. It merged the FE13-17 work (Kiro E) and the identity work (Kiro B, FE03-FE06). Last updated 2026-11-20 (R9-E3).

| Area | Module | Pages | Components | Doc |
|---|---|---|---|---|
| CMS and public stories/FAQ | `src/modules/content` | `/admin/cms`, `/stories`, `/stories/[slug]`, FAQ data for `/faq` | `src/components/content`, `src/components/public/stories-*` | [content.md](content.md) |
| Lab workspace | `src/modules/lab` | `/lab/*` | `src/components/lab` | [lab.md](lab.md) |
| Ambulance workspace | `src/modules/ambulance` | `/ambulance/*` | `src/components/ambulance` | module headers, REQUESTS R-E07, R-E08, R-E15 |
| Caretaker workspace | `src/modules/caretaker` | `/caretaker/*` | `src/components/caretaker` | module headers, REQUESTS R-E03, R-E06, R-E07 |
| Admin operations, audit | `src/modules/admin`, `src/modules/audit` | `/admin/*` except CMS | `src/components/admin` | module headers, REQUESTS R-E04, R-E16 |
| Identity, onboarding, verification | `src/modules/auth`, `onboarding`, `verification`, `organizations` | `/login`, `/signup`, `/recover`, `/account/*`, `/workspace/select`, `/patient/profile`, `/patient/health-profile`, `/patient/onboarding` | `src/components/auth`, `src/components/onboarding` | [COMPONENTS-identity.md](../COMPONENTS-identity.md) |

Public pages other than stories, the shared UI kit (`src/components/ui`, `src/components/shared`) and `AppShell` belong to fe-a.

## Patterns every module here follows

- **Adapter mode.** Each module's `index.ts` returns a fixture or http API (`getAdapterMode`, env `FRONTEND_ADAPTER`). Fixture mode throws when `APP_ENV=production`. Fixture data is synthetic and the page shows `<FixtureNotice/>`.
- **Gated http adapters.** An endpoint that is not in `docs/API_CONTRACTS.md` returns the stable `gated` error, and the page renders a "not connected" or "not available yet" state. It never shows invented data. The full list is in REQUESTS R-E07.
- **Guards.** Pages call `requireRole(area)` through `getOperationsSession()` (`src/modules/admin/session.ts`). Then the pure route rules (`<module>/routes.ts`, `admin/access.ts`) decide per workspace. Signed-out users go to `/login?next=`. Wrong-role users go to their own landing page. A workspace that exists but is not usable (pending or suspended provider) renders `AccessDenied` inside `OpsFrame`, which still offers Sign out.
- **Workspaces.** The selected organization is stored in the cookie `scv_ws_<area>` as a key like `lab:<providerId>`. The server re-validates the membership on every request. Multi-organization users see a chooser first.
- **Loaders.** `<module>/loaders.ts` returns a `LoaderResult` (`ok`, `empty`, `denied`, `gated`, `error`) of narrow view models. Raw DTOs never reach components.
- **Server actions.** `<module>/server-actions.ts` re-authorizes the route for the selected workspace, re-validates every argument with the `admin/action-guard.ts` checks (`isId`, `isKey`, `isVersion`, allow-lists; bound arguments are not trusted), and lets the API authorize again. Lab, ambulance and caretaker commands also send an idempotency key.
- **Money and time.** Integer paise end to end. Formatting goes through `src/components/admin/ops/format.ts` (`formatPaise`, `paiseToRupeesString`), and no `toFixed` is used on money. Times are UTC ISO from the server, shown in Asia/Kolkata.
- **Statuses.** `<module>/status.ts` maps server values to label keys and tones. Unknown values map to a neutral "unknown", never to an active, paid, released or verified state.
- **Copy.** All user-facing text lives in `src/messages/{en,te,hi}`. Telugu and Hindi are unreviewed (`src/messages/REVIEW_NEEDED.md`).

## Tests

| Kind | Where | Run |
|---|---|---|
| Unit and view (Vitest, jsdom where needed) | `tests/unit/modules-operations/*`, `tests/unit/**` | `npx vitest run` |
| E2E (Playwright, fixture adapter) | `tests/e2e/{lab,ambulance,caretaker,admin-ops,cms,role-isolation,emergency-e,public,a11y-sweep-e}.spec.ts` and the identity specs `auth`, `navigation`, `onboarding`, `profile`, `admin-verification` | `npx playwright test --project=desktop-1280` (or `mobile-390`) against a fixture build. Lab report release needs `FEATURE_CLINICAL=true` for both the server and Playwright. |

Each spec that is still `fixme` names the route it waits for (REQUESTS R-E9E2-01, R-E9E2-02).
