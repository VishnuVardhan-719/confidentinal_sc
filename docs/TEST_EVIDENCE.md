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



## U01 Kiro QA pass - 2026-11-17 (branch task/U01-a-app-shell, base 07d26d3 plus uncommitted track-alignment CSS and new test)
- `npm run lint` 0, `npm run typecheck` 0, `npm test` 0 (4 files, 18 tests; new `tests/unit/ui-pages.test.ts` covers ButtonLink renders `<a>`, ServiceIndex heading links, and a copy guard against price/rating/verified/paid/ETA/24x7 wording plus ambulance non-emergency and caretaker non-clinical wording), `npm run build` 0 (11 static pages; categories/[slug] partial prerender; warning: no fallback metrics for Atkinson Hyperlegible Next).
- Headless Chromium sweep (`next dev` on :3100) at 390x844 and 1280x900 over /, /how-it-works, /categories, the four category pages and a 404 URL. 16/16 pass: no horizontal scroll, one h1 per page, the first 6 Tab stops each show a 3px solid outline and are on screen. Console errors: none, except the expected 404 document status on the not-found URL. Screenshots are in `C:\Users\Yashwanth\.claude-scratch-fe-shots\`.
- Impeccable detector on the changed UI files: no findings. No axe run (axe is not installed). Run by Kiro.
