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
