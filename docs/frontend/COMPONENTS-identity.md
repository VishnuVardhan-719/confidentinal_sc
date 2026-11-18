# Identity components and server helpers (fe2-b, Kiro B)

Kept separate from `COMPONENTS.md` (which lives on fe2-c) to avoid a merge conflict. The lead can fold this into `COMPONENTS.md` at integration.

## Server helpers (server-only, never import in client components)
| Helper | File | Use |
|---|---|---|
| `requireRole(role, { locale, path })` | `src/modules/auth/server.ts` | Role pages/layouts, all six roles (`locale`/`path` optional). Signed out -> `/login?next=` (safe path only); wrong role -> the user's own landing page; unusable workspace or disabled account -> `denied` (render `<AccessDenied/>`). |
| `requireSession({ locale, path })` | same | Any signed-in page (account pages). |
| `authorizeRole(role, opts)` | same | Server actions. Never redirects; refuse unless `kind === "allowed"`. |
| `getRequestApis()` | same | Request-bound `auth`/`onboarding`/`verification`/`organizations` APIs (cookie token, fixture or http adapter). |
| `getAccountSession(locale?)` | same | Non-PHI header view: `anonymous` / `unavailable` / `restricted` / `signed_in { displayName, role, roles, dashboardHref, workspaces }`. Shape in REQUESTS R-FE07-01. |
| `requireCompleteProfile({ locale, path })` | `src/modules/onboarding/profile-gate-server.ts` | Booking pages. Patient role + 13-item profile; redirects incomplete profiles to `/patient/onboarding`; only `kind === "complete"` may book. |
| `authorizeCompleteProfile({ locale })` | same | Booking server actions. Never redirects; refuse unless `complete`. Backend must enforce too (REQUESTS R-FE06-08). |
| `decideProfileGate` / `checkProfileGate` | `src/modules/onboarding/profile-gate.ts` | Pure gate logic for tests and custom flows. Fails closed on load errors. |

## Components
| Component | File | Notes |
|---|---|---|
| `AuthFlow`, `OtpStep` | `src/components/auth/auth-flow.tsx`, `otp-step.tsx` | Sign-in/sign-up state machine UI; resend countdown from server throttle. |
| `AccessDenied` | `src/components/auth/access-denied.tsx` | Denied state for guard outcomes. |
| `SignOutButton`, `SessionLinks` | `src/components/auth/sign-out-button.tsx`, `session-links.tsx` | Session-aware header links (Sign in / My workspace / Sign out). |
| `AccountFrame`, `AccountNav` | `src/components/auth/account-frame.tsx`, `account-nav.tsx` | Minimal frame for account and intake pages until role AppShells exist. |
| `ProfileGlance`, readiness banner | `src/components/onboarding/profile-glance.tsx` | Profile at a glance; health record marked unverified; "n of 13" banner with jump links (`data-testid="profile-completion"`). |
| `ProfileForm` | `src/components/onboarding/profile-form.tsx` | 13-item health profile form; Zod errors inline plus focused summary. |
| `LocationField` | `src/components/onboarding/location-field.tsx` | Geolocation on button press, manual lat/lng fallback. Local stand-in for a shared LocationPicker. |
| `FieldRenderer`, `SectionBlock` | `src/components/onboarding/field-renderer.tsx`, `section-block.tsx` | Spec-driven fields from `form-spec.ts` / `section-specs.ts`. |

Strings: `auth` and `onboarding` namespaces (en/te/hi; te/hi unreviewed, see `src/messages/REVIEW_NEEDED.md`).
