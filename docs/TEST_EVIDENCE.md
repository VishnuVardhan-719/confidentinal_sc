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

## N01 — 2026-11-20, feat/N01-notifications

Codex; base `integ/all` `51c7439`. Current implementation is identified by feature-branch HEAD. Synthetic fixtures only. **All N01 SQL is authored, DB NOT EXECUTED.** Owner prohibits Docker/Supabase/DB execution on this laptop; no installation or `.env` access occurred.

| Check | Result |
|---|---|
| `node node_modules/next/dist/bin/next typegen` | Exit 0; generated route types |
| `node node_modules/vitest/vitest.mjs run --configLoader runner --cache=false` | Exit 0; **278 passed, 2 pre-existing skipped; 21 files passed, 2 skipped** |
| N01 targeted Vitest, same loader/cache flags | Exit 0; **39 passed in 5 files** |
| `node node_modules/typescript/bin/tsc --noEmit` | Exit 0, no diagnostics |
| `node node_modules/eslint/bin/eslint.js .` | Exit 0, no diagnostics |
| `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack` | Exit 0; Next16.4.6; all six new notification paths marked `ƒ` dynamic |
| Python runner AST/import/TOC sample checks, `--help`, missing-flags refusal | Passed static/safe checks; no DB helper import or Docker/DB execution without flags |
| pgTAP100–109, four real races, scheduler registration, UI/Playwright | **NOT EXECUTED** |

The exact plain Vitest command was attempted first and failed EPERM while writing Vite's temp config through the dependency junction. The passing runner-loader/no-cache form avoids that write. Initial TypeScript issues in tests/BigInt literals were corrected. The new dispatcher concurrency regression first failed with one timed-out delivery under sequential processing, then passed with the awaited concurrent batch. The two pre-existing skipped tests remain skipped; no database acceptance is inferred.

Independent read-only SQL/app reviews checked actual definitions and corrected recipient parity, expansion lock order, test oracles/fixture ordering, a duplicated staff setup, managed-schema restoration and leased-batch timing. Coverage proposal/withdrawal behavior was reconciled with actual C01 command/audit definitions and checked statically. This is not executed SQL/RLS/security or production acceptance. See [N01 handoff](handoffs/N01_codex_2026-11-20.md) for full cases, pending category codes, scope limitations and exact teammate commands.
