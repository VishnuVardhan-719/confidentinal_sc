# Deploying the frontend to Vercel (surecurevisit.in)

Status 2026-11-24: prepared, NOT deployed. A production deploy, the DNS change and the Vercel login need the owner.

## The copy
Branch `deploy/vercel-frontend` is a frozen copy of the finished frontend. Vercel builds from it. All further work continues on
`feat/fe2-integration`; when you want a change live, fast-forward the deploy branch to the commit you approve
(`git push origin <commit>:deploy/vercel-frontend`). Nothing is auto-deployed from the working branch.

## One decision the owner must make first
The site has no backend yet, so the only data source is the **fixture adapter** (synthetic doctors, labs, reviews, prices).
`APP_ENV=production` refuses to start with the fixture adapter, by design, so no fake listings can go live by accident.

Two ways to go:
1. **Preview / staging on the domain (demo mode).** Set `APP_ENV=staging`, `FRONTEND_ADAPTER=fixture`. The site works end to end
   (sign-up, booking requests, admin approval) on synthetic data, shows a "synthetic data" notice, and is noindex (search engines
   skip it). Good for showing investors/leaders and testing. Do not collect real patient data.
2. **Public launch.** Needs the backend (starts on the words "START BACKEND"), then `FRONTEND_ADAPTER=http`, `APP_ENV=production`.

## Vercel project settings
- Framework: Next.js. Install: `npm ci`. Build: `npx next build`. Node 22+ (the repo is tested on 26).
- Fixtures are refused whenever `VERCEL_ENV=production`, so the demo must run as a Vercel **Preview** deployment, not Production.
  Leave Production Branch as `main`, and let `deploy/vercel-frontend` deploy as a Preview.
- Env vars (Project -> Settings -> Environment Variables, scope = Preview), never in git:
  - Demo mode: `FRONTEND_ADAPTER=fixture`, `APP_ENV=staging`, `FEATURE_CLINICAL=true`, `NEXT_TELEMETRY_DISABLED=1`.
  - Later (real): `FRONTEND_ADAPTER=http`, `APP_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY` (server only), and the `FEATURE_*` flags that have passed their gates.
  - Optional: `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`.
- The fixture world lives in server memory. On Vercel each serverless instance has its own copy, so demo sign-ups and admin
  approvals can differ between requests. Fine for a look-around, not for a real test; use `next start` locally for that.

## Domain
Vercel -> Project -> Domains -> add `surecurevisit.in` and `www.surecurevisit.in`, and under "Git Branch" point them at
`deploy/vercel-frontend` (so the Preview deployment is served on the domain). Then set the DNS records Vercel shows at the
registrar (A `76.76.21.21` for the apex, CNAME `cname.vercel-dns.com` for www; confirm against the values Vercel displays).
Only the owner should change DNS.

## Launch splash and target repo (2026-11-24)
- The "Launching soon" welcome screen shows when `APP_ENV` is `staging` or `production`. `LAUNCH_SPLASH=off` removes it, `LAUNCH_SPLASH=on` forces it. It is dismissed with the button or Escape and returns on a full page load.
- Target repo: https://github.com/surecurevisit/SureCureVisit-Frontend (frontend only, no backend branches). The access token lives in `~/.secrets/github_surecurevisit_frontend_token`. It was pasted into a chat, so revoke or rotate it after the deploy.
- Strong search ranking needs `APP_ENV=production` (indexable). A fixture-backed production deploy is refused by design, so either connect the backend or add a reviewed pre-launch mode. Decide at "lets deploy".

## Pre-launch mode (2026-11-26): the safe way to go live before the backend exists

Set these Production env vars and nothing else (no `FRONTEND_ADAPTER=fixture`, no backend URL):

```
APP_ENV=production
LAUNCH_MODE=prelaunch
FRONTEND_ADAPTER=http
```

What it serves: the splash, home, About, Our story, leadership, contact, FAQ, how-it-works, privacy, terms, refunds, memberships and emergency pages, the footer, and all search-engine data (sitemap, robots, llms.txt, JSON-LD) for those pages only.
What it gates: every other route (sign-up, login, booking, dashboards, directories, stories, become-a-provider, `/find`) shows the "This part opens at launch" holding page (HTTP 200, `noindex` by header and meta; the page cannot carry a 503 under Cache Components). Anything but GET/HEAD gets a real 503, so no form or server action runs. No fixture data is ever served: `assertFixtureEnvironment` still refuses fixtures in production.
Deny by default: a new route is closed until it is added to `PRELAUNCH_OPEN_PAGES` in `src/lib/launch-mode.ts`. The decision runs on the percent-decoded path (`/%65n/login` is held) and dotted paths under a locale are held too.
Going live for real: remove `LAUNCH_MODE`, set `FRONTEND_ADAPTER=http` with the connected backend (see BACKEND_CONNECT_PLAN.md).
Verify before each release: `bash .context/prelaunch-run.sh` (production build with no backend, then `tests/e2e/prelaunch.pl.ts`).

