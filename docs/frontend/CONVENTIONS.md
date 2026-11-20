# Frontend conventions (FE v2) — binding for every agent

Source of truth: `docs/FRONTEND_MASTER.md` (read the section for your ticket), `DESIGN.md`, `AGENTS.md`, `docs/API_CONTRACTS.md`, `docs/BUSINESS_RULES_AND_APPROVAL_MATRIX.md`.
This is a **real product build**, not a demo. There is no "demo mode", no demo accounts, no cookie-faked roles, no "Try as <role>" buttons.

## Data honesty (non-negotiable)
- Every screen talks to a typed **module API** (`src/modules/<name>/api.ts`) that has two adapters: `http` (calls the `/api/...` contracts) and `fixture` (synthetic data in `src/fixtures/**`).
- Adapter chosen by `getAdapterMode()` in `src/lib/api/mode.ts` (env `FRONTEND_ADAPTER=http|fixture`, default `http`). Fixture is **allowed only for `APP_ENV` development/test/preview/staging** (or `APP_ENV` unset under `next dev`/vitest) and never when `VERCEL_ENV=production` (REQUESTS R-FE-D-42). Fixture-backed pages show the shared `<FixtureNotice/>` ("Synthetic data — not live"). Never present fixture output as real.
- No invented providers, ratings, reviews, prices shown as real, ETAs, "verified" badges, counts or testimonials. Empty states instead.
- Money = integer paise (format with `Intl`, INR). Times = UTC ISO from server, rendered in Asia/Kolkata. Reference IDs come from the server only.
- Statuses: one canonical status→label/tone map per state machine (`src/modules/<name>/status.ts`). Unknown server status never maps to "active"/"approved". Booking, clinical and payment statuses are separate badges.
- No PHI in URLs, query strings, titles, localStorage/sessionStorage, cookies, analytics. Server enforces authz; hiding UI is never the only guard.
- Gated features (clinical, live payments, emergency dispatch, GPS, subscriptions, pharmacy, payouts) use `isEnabled()` from `src/lib/feature-flags` and render `<GateNotice/>` when off. `/emergency` + "Call 112" works with no auth/JS/motion.

## Stack / structure
- Next.js 16 App Router, React 19, strict TS, Tailwind 4 (tokens in `src/styles/tokens.css`), Zod 4, next-intl (`en`,`te`,`hi`, prefix always: `/en/...`). Vitest + Playwright (+axe).
- `src/app/[locale]/(public|auth)/...`, `src/app/[locale]/{patient,doctor,lab,ambulance,caretaker,admin}/...`, `src/components/{ui,shared,public,dashboards}`, `src/modules/<name>`, `src/lib`, `src/i18n`, `src/messages/{en,te,hi}/<namespace>.json`, `src/fixtures`.
- Server components by default; `"use client"` only for forms/interaction. Components take narrow view-model props, never raw DB rows.
- **No literal user-facing strings in JSX**: use message keys (namespaces: common, public, auth, onboarding, patient, doctor, lab, ambulance, caretaker, admin, booking, clinical, payment, support, errors, accessibility). Add keys to en first; te/hi values must be real translations (flag unreviewed ones in `src/messages/REVIEW_NEEDED.md`), never copies of English and never raw keys.
- Each page: loading / empty / error / denied / disabled states. Forms: labelled fields, error summary, focus first invalid, 44px targets, visible focus, aria-live for async status, reduced motion respected. Light theme only.
- Errors: use `ApiResult<T>` from `src/lib/api/result.ts`; map codes to localized messages; never render raw backend errors.
- Design: apply `design-taste-frontend` + `surecure-design` skills. DESIGN.md palette only (forest #0F5F59, focus teal #0A857C, ink #17282B, paper #FAF8F2, mist #E9F3F0, warning #B36D20). No generic AI-card-grid look, no purple gradients.

## Process rules for agents
- Work ONLY in your worktree/branch and ONLY in your owned paths. Need a change elsewhere? Write it in `docs/frontend/REQUESTS.md` (append-only) — do not edit.
- **Never `git commit`, `git push`, `git merge`, `git checkout`, `git stash`, `git reset`, `git clean`.** The lead commits. Never touch `.env*`, secrets, Supabase projects, or install global tools. Only `package.json`/lockfile owner may run `npm install <pkg>`.
- Before reporting done run and paste real output of: `npm run lint`, `npm run typecheck`, `npm test`, and (if you touched routes) `npm run build`. Zero errors/warnings you introduced.
- Final report uses the handoff template in `docs/AGENT_COORDINATION.md` (task ID, files, implemented, NOT implemented, test output, blockers).
