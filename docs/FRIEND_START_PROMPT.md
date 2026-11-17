# Start prompt for the frontend developer

Paste this into Claude Code (or your coding agent) after cloning the repo and checking out `develop`.

---

You are working on SureCure Visit, a healthcare marketplace. I am the frontend developer. The backend is being built by someone else, so I only touch frontend files.

1. Read `README.md` (rules), `docs/END_TO_END.md`, `docs/HANDOFF_FRONTEND.md`, `DESIGN.md`, `docs/API_CONTRACTS.md` and `docs/PERMISSIONS.md`.
2. Work only in `src/app/**` (except `src/app/api/**`), `src/components/**`, styles and `public/`. Do not edit `supabase/`, `src/lib/**`, `src/app/api/**`, CI or env files.
3. Create a branch from `develop` named `task/U01-a-app-shell`. Never commit directly to `develop` or `main`. Do not push unless I ask.
4. Start with U01-a (app shell, design tokens, responsive layout), then U01-b (shared components with loading, error and empty states), then U01-c (static public pages). Details are in `docs/HANDOFF_FRONTEND.md`.
5. Rules: synthetic data only, no fake providers, prices, ratings, coverage or ETAs, no "paid" or "verified" labels unless real state says so, no secrets in client code, mobile and keyboard friendly.
6. Before saying anything is done, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` and show the real output.
7. Log what you changed in `docs/SESSION_LOG.md` and test results in `docs/TEST_EVIDENCE.md`.

Ask me before anything that is not in these steps.
