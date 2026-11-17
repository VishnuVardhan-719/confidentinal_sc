# Test evidence

No application tests have been run as part of preparing this documentation pack. Do not interpret the documentation ZIP inspection as application verification.

For each test run, record:
- Date/time and commit SHA.
- Environment (local/staging; synthetic data only).
- Command.
- Exit code.
- Pass/fail counts and relevant output summary.
- Known skipped tests and reason.
- Owner/agent who ran it.

Never record credentials, patient data or secret values.

## F01 foundation — 2026-11-17 (branch task/F01-foundation, uncommitted, awaiting review)
- Next.js 16.4.6, React 19.3, strict TS, Tailwind 4, Zod 4, Vitest 5, Supabase JS/SSR clients installed; one lockfile (npm).
- `npm run lint`, `npm run typecheck`, `npm test` (2 files, 5 tests), `npm run build`: all exit 0 on Node 26.7.
- Covers env validation and feature flags (all OFF by default). No auth, DB or UI features yet. Not independently reviewed.

## U01-a/U01-c - 2026-11-17 (branch task/U01-a-app-shell, uncommitted)
- 
- `npx eslint src/app src/components`: exit 0. `npm run build`: exit 0, routes /, /how-it-works, /categories, /categories/{doctor,lab,scheduled-ambulance,caretaker} prerendered.
- Full repo after U01-b landed: `npm run lint` 0, `npm run typecheck` 0, `npm test` 0 (3 files, 13 tests). No visual/browser or axe check run yet. Run by Kiro.


