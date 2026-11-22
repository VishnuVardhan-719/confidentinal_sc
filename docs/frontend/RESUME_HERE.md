## >>> FRONTEND COMPLETE 2026-11-22: WAIT FOR THE OWNER <<<

Frontend (phases 1 to 8) is built, verified and pushed on `feat/fe2-integration`. Results: `docs/frontend/INTEGRATION_REPORT.md` 6.10 (unit 131 files / 1980 tests, tsc 0, eslint clean, all e2e specs green on desktop-1280 and mobile-390, CodeRabbit 5 minor findings fixed).

Do now: nothing except answer the owner. Steps 1 to 8 of the checklist below are DONE (the session env in step 5 is obsolete: patient specs sign in through `tests/e2e/support/fixture-session.ts`).
1. The owner reviews the frontend and sends change requests: implement them on feature branches, rerun the affected specs (one project per `int3-run.ps1` call), CodeRabbit, push.
2. Only when the owner says "start backend": build the backend (do NOT connect it), see `docs/frontend/BACKEND_VERIFICATION_DECISIONS.md`.
3. Only after the backend is complete: merge backend PRs and frontend, switch to `FRONTEND_ADAPTER=http` (`docs/frontend/BACKEND_CONNECT_PLAN.md`).
Open product call: the signed-out patient guard drops the `providerId` query on login redirect.

## >>> START HERE: CHECKPOINT 2026-11-22 (user shut the laptop down; everything pushed) <<<

**Say "LETS RESUME" and Claude restarts on its own. Claude is the only builder now: Kiro is gone, agy is dropped, there are no agent windows to reopen.** CodeRabbit CLI reviews diffs. Codex is rate-limited until 2026-11-23 17:23 and may be used after that.

### Where things stand (frontend, all on the synthetic fixture adapter)
- Branch `feat/fe2-integration` in worktree `C:/Users/Yashwanth/fe2-int`, head pushed (see `git log -1`). The other worktrees are pushed too; none touches `develop`/`main`.
- Everything is coded: foundation and public site, auth and onboarding, directories (doctors, labs, ambulances, caretakers), patient workspace and booking, doctor workspace and clinical, lab/ambulance/caretaker workspaces, admin and CMS. The latest production build exits 0 with 551 pages (TypeScript inside the build passed).
- Latest e2e (build before the new routes): desktop-1280 all green except `a11y-sweep-c` (spec fixture fixed since, not rerun). mobile-390 all green except three that are now fixed in code or specs but NOT yet rerun: `admin-verification` (fixed with `scroll-padding-bottom` behind the mobile bottom bar), `lab-directory` and `public-directory-smoke` (stale link name, now "View lab: Synthetic lab N").
- Done this session: public `/ambulances`, `/ambulances/[id]`, `/caretakers`, `/caretakers/[id]` (en/te/hi, fixture only, gated over http), keyboard + time-zone guards, provider-frame deferral.
- NOT yet verified: the new `public-service-directories` e2e spec; a full unit rerun after the a11y-static fix (last full run: 1976 of 1980 passed, the 4 failures were fixed and that file passes 32/32); CodeRabbit on the final diff (last run, before the new routes: 0 findings).

### Do this, in order, without asking
1. `cd C:/Users/Yashwanth/fe2-int && git status && git log -1 --oneline`; read `.context/activeContext.md` (last section).
2. Unit gate: `npx vitest run --maxWorkers=2` (background if slow), then `npx next typegen && npx tsc --noEmit -p .` (background, over 90 s) and `npx eslint src tests`.
3. Build is already current (551 pages). If any source changes: `FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true NEXT_TELEMETRY_DISABLED=1 npx next build`.
4. One e2e pipeline at a time (port 3320), fresh server per spec: `E2E_PORT=3320 powershell.exe -NoProfile -File .context/int3-run.ps1 -Spec <name> -Projects desktop-1280,mobile-390 -Config tests/e2e/fixture-all.config.ts`. Log: `$TEMP/int3-<spec>-<project>.log`. Run, in this order: `public-service-directories`, `lab-directory`, `public-directory-smoke`, `admin-verification`, `a11y-sweep-c`. Triage failures. Spec assumptions in `public-service-directories` (link names like "View operator: ...") are untested and may need fixes.
5. fe-p session specs (skip without session mode): `-Env @{E2E_FEP_MODE="session";E2E_FEP_CLINICAL="on"}` for `a11y-sweep-p`, `patient-family`, `patient-reminders`, `patient-reviews`, `patient-review-changes`, `patient-saved`; then the `-ClinicalOff` and `FIXTURE_FAMILY_SCENARIO=empty` variants.
6. CodeRabbit on the final diff: `/c/Users/Yashwanth/AppData/Local/Programs/coderabbit/coderabbit review --agent --base-commit 77ff974` (background; last JSON line has `findings`). Fix valid findings.
7. Commit with trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, push with: `GIT_TERMINAL_PROMPT=0 timeout 80 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -q origin feat/fe2-integration`, verify `git rev-parse --short HEAD` equals `git ls-remote origin feat/fe2-integration | cut -c1-7`.
8. Update `docs/PROGRESS_REPORT.md`, `docs/frontend/INTEGRATION_REPORT.md` (add 6.9 with the results of steps 2 to 6) and this file. Then notify the user and WAIT for their approval and change requests (owner flow of 2026-11-23: frontend done, user changes, then the BACKEND is completed, and only then merge and connect). Do not merge backend PRs or switch to `FRONTEND_ADAPTER=http` before the backend is complete. Provider decisions (OTP, email, invoices, Supabase plan): `docs/frontend/BACKEND_VERIFICATION_DECISIONS.md`.
9. After the user says "start backend" and the backend is complete: merge and connect (phase 9). Read `docs/frontend/BACKEND_CONNECT_PLAN.md`; `feat/fe2-c` holds ready-to-enable B01 wiring (`src/modules/bookings/b01-http.ts`, `src/modules/patient/b01-http.ts`, unverified WIP).

### Tooling notes (hard-won)
- Bash tool calls die near 95 s: background anything slow (`nohup bash -c '...' & disown`) and watch with Monitor. Do not run tsc/vitest while an e2e pipeline runs (false timeouts).
- `PageProps<"/[locale]/x">` needs `npx next typegen` after new routes, else TS2344.
- `tests/e2e/fixture-all.config.ts` is the multi-spec config (mobile = Pixel 5 with `isMobile`; the layout viewport is 873 px tall but the visible one is 844, which exposed the bottom-bar overlap).
- Windows: Git Bash, POSIX syntax. Python needs `PYTHONUTF8=1`. `taskkill //PID` needs the Windows pid.
- Scratch probes and screenshots live untracked in `.context/` of the other worktrees (fe2-a/b/c/d/e/p); they are on disk, not on GitHub, and safe to ignore.

### Worktrees at checkpoint (all pushed; `docs/backend-handoff` is deliberately NOT pushed)
`fe2-int feat/fe2-integration` (this branch) | `fe2-a 3c72d13` | `fe2-b 5ee66b5` | `fe2-c 58f881f` | `fe2-d 6b91412` | `fe2-e d356e97` | `fe2-p 334d54b` | `fe2-x feat/fe2-connect 347419a` | `fe2-y feat/fe2-money 23e1f09` | `fe2-z feat/fe2-a11y 23e1f09` | older `task/U0*` and `wip/frontend-pause-2026-11-18` branches already on GitHub.

### Waiting on the user or backend (do not guess)
Backend routes; product decisions (reviews flag, family limit, reminder defaults, fe2-d/fe2-p overlap R-INT6-01); te/hi human translation review; proof-of-visit QR (needs a dependency approval); legal copy (draft); approval to merge backend PRs #1 to #5.

### Progress at checkpoint (my estimates; build = coded, test = passing)
```
1 Foundation + public site        build ██████████ 100%  test █████████░ 95%
2 Auth, onboarding, verification  build ██████████ 100%  test █████████░ 90%
3 Directories (4 kinds)           build ██████████ 100%  test ███████░░░ 70%
4 Patient workspace + booking     build ██████████ 100%  test ████████░░ 80%
5 Doctor workspace + clinical     build ██████████ 100%  test █████████░ 90%
6 Lab/ambulance/caretaker spaces  build ██████████ 100%  test █████████░ 95%
7 Admin + CMS                     build ██████████ 100%  test ████████░░ 85%
8 Final QA, review, docs, push    ████░░░░░░ 40%
9 Backend connection              ░░░░░░░░░░  0%  (blocked on merge approval)
Frontend (1 to 8): ~97% built, ~85% tested. About 2 to 2.5 h of work left, then phase 9 about half a day.
```

---

## (older) CURRENT STATE (2026-11-21, supersedes Kiro notes below)
- Builders: Claude only (agy dropped, Kiro gone). Codex is rate-limited until 2026-11-23 17:23. CodeRabbit CLI reviews diffs (run in background, takes a few minutes).
- Work happens directly in `fe2-int` on `feat/fe2-integration`; push after each verified step.
- Done this session: Bearer-token injection for bookings + admin http adapters (CodeRabbit findings fixed); money formatters unified on `src/lib/money` (R-E9E6-01..03); static a11y test for lab/ambulance/caretaker; integration smoke 102/102 passing; unit suite green.
- Also done: `patient-reminders.spec.ts` verified 14/14 (session) + guest, now signing in via fixture-session helper; R-FE-P-R9-6 return-path patch and C14-2 onboarding fail-closed applied; smoke 102/102 on 4c264db.
- Remaining: R9-D10 public/legal/404/500/offline polish checks; R9-E7 remainder (keyboard + axe on list pages); `patient-reminders.spec.ts` verification; R-FE-Q-C14 patches + address/slots/reschedule mapping from BACKEND_CONNECT_PLAN.md; final adversarial pass; full lint/tsc/unit/build/Playwright on the head; te/hi human translation review.
- After frontend complete: wait for the user's changes, then complete the backend on their word, then merge and connect (FRONTEND_ADAPTER=http).

# SureCure Visit frontend: RESUME HERE

Checkpoint written 2026-11-20 ~02:20 IST, when the user shut the laptop down. Everything below is pushed to GitHub (repo `VishnuVardhan-719/confidentinal_sc`, feature branches only).

## The trigger

When the user says **"LETS RESUME"**, resume autonomously, with no questions:

1. Read this file, then `.context/activeContext.md` in each worktree (each has a `PAUSED STATE` section with exact next steps).
2. Check memory is free enough (`~0.6 GB` free on this laptop; one dev server per window).
3. Restart the five Kiro windows (below), re-run the approver, re-arm the monitors, and give each agent its next task.
4. Claude also writes code, runs CodeRabbit, and monitors. Nobody sits idle. The user is away and gave full permissions (see memory `feedback_full_autonomy_frontend`).

## Hard rules (unchanged)

- Feature branches only. Never commit or push to `develop` or `main`. No force-push, no `--no-verify`.
- Backend PRs #1 to #5 stay unmerged unless the user says "merge them". `docs/backend-handoff` stays unpushed.
- Never commit or push unless authorised: agents commit on their feature branch, the lead pushes feature branches only.
- Secrets only in `.env` (gitignored) or `~/.secrets/`.
- Money in integer paise (en-IN). UTC stored, shown Asia/Kolkata. Separate booking, payment and clinical badges. No PHI in URLs or storage. Live payments disabled. Clinical flag OFF in production.
- Ask the user only for: purchases, production deploy, DNS, destructive git/db ops, big schema or architecture changes, real patient data, live payments, clinical production activation, emergency dispatch, security bypass, binding legal or business policy.
- Kiro only, Codex is OFF, no paid API billing. Kiro credits are a shared pool: warn the user near ~7,500 used (about 4,000 to 4,300 used now, estimate; the user last saw 3,125 of 10,000).

## Branches and worktrees (checkpoint 2026-11-20 ~23:30 IST, all pushed, local = remote)

| Worktree (under `C:/Users/Yashwanth/`) | Branch | Window name | Notes |
|---|---|---|---|
| `fe2-a` | `feat/fe2-a` | (shares fe-a) | 3c72d13, old |
| `fe2-d` | `feat/fe2-d` | fe-a | R9-D10 committed (6b91412). To do: public content/legal pages, 404/500/offline pages |
| `fe2-e` | `feat/fe2-e` | fe-b | R9-E7 committed (8ffed22) |
| `fe2-c` | `feat/fe2-c` | fe-q | cbd9b5f, R9-C14, BACKEND_CONNECT_PLAN |
| `fe2-p` | `feat/fe2-p` | fe-p | f7a860c, R9-P6 |
| `fe2-int` | `feat/fe2-integration` | fe-int2 | merged c, d (R9-D10), e (R9-E7), p. tsc, eslint, 1815 unit tests and `next build` were green at 009d4b7 (before the d/e re-merge) |

Tab ids change after a restart; re-check with `hc ls`. Ports: a/d 3370-3383, c 3360-3369, e 3350-3359, p 3384, int 3320. All servers are stopped.

## STATE AT SHUTDOWN (read first)

- **The Kiro monthly limit was hit on all five windows (~22:45 IST).** Agents cannot work until credits return or the plan resets. A top-up is the user's purchase decision. Until then the lead (Claude) does the work directly on feature branches.
- The integration smoke (`npx playwright test --config tests/e2e/integration.config.ts` on a fresh build, started with `.context/int2-serve.ps1`) was **interrupted at test 48 of 102 with 8 failures**: `/en`, `/en/how-it-works`, `/en/lab-tests`, `/en/patient/book`, `/en/lab/dashboard` at 390 px (about 6 s each, so probably axe or overflow; the reason was not captured) and the patient booking mutation flow. The previous full run (a63d1c4) was 102 passed. **First task on resume: rebuild integration (`FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true npx next build`), rerun the smoke, read the failure messages, fix.** Suspects: the d/e/p merges (finder, reminders page, auth-flow `HydrationStatus` on the signup role group, public pages).
- Integration merge decisions: fe-p's notifications page kept the integration version (`guardPatientPage`); fe-p's `notifications-body` is merged but unused (open decision R-INT6-01). fe-e's stories-source and its states test were dropped because integration already has the unavailable state in `content-source`. See `INTEGRATION_REPORT.md` 6.8.
- `docs/backend-handoff` stays unpushed. Backend PRs #1 to #5 stay unmerged.

## What to take up first on resume (in order)

1. Triage the smoke failures above on `fe2-int`; fix; push.
2. If Kiro credits are back, restart the five windows (below) and give each its next task: fe-a public content/legal + 404/500/offline pages (R9-D10 remainder); fe-b R9-E7 remainder (keyboard + axe pass on owned list pages, date/time guard test); fe-p rerun `tests/e2e/patient-reminders.spec.ts` and lab/ambulance/caretaker a11y (R-FE-P-R9-7); fe-q apply the R-FE-Q-C14 patches; fe-int2 re-merge heads and rerun the smoke. If credits are not back, Claude does these itself.
3. Backend-connect prep (Claude), from `docs/frontend/BACKEND_CONNECT_PLAN.md`: Bearer-token injection in the bookings and admin http adapters (top priority, they return 401 today), then reconcile address/slots/reschedule shapes. Apply the R-E9E6 money-formatter patches in other owners' call sites.
4. CodeRabbit on each branch (no secrets or PHI), final adversarial pass on the integrated head, full lint/typecheck/unit/build/Playwright, update `docs/PROGRESS_REPORT.md`, final PHASE REPORT.
5. When the frontend is complete, ask the user to approve merging backend PRs #1 to #5, then connect with `FRONTEND_ADAPTER=http` (Docker only for local Supabase) and carry out the user's change requests.

## How to restart the agents

```
export MSYS_NO_PATHCONV=1
hc run --bg --name fe-a    --cwd C:/Users/Yashwanth/fe2-d   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-b    --cwd C:/Users/Yashwanth/fe2-e   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-p    --cwd C:/Users/Yashwanth/fe2-p   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-q    --cwd C:/Users/Yashwanth/fe2-c   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-int2 --cwd C:/Users/Yashwanth/fe2-int kiro-cli chat --model claude-opus-5.5
```

Then `hc ls`, and send each "Read .context/activeContext.md and docs/frontend/RESUME_HERE.md, then continue with: <task>" (`hc send tN "..."`, then `hc keys tN enter`). Approver: `C:/Users/Yashwanth/.claude-scratch-approve-full.sh <tab ids>` (denies push, reset, clean, rebase, stash, develop/main checkout, force, secrets, network, kills, recursive deletes and writes outside worktrees; HOLDs go to `.claude-scratch-hold.log`). Push recipe: `cd <worktree> && GIT_TERMINAL_PROMPT=0 timeout 100 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -q origin <branch>`, then verify with `git ls-remote`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Progress (estimates, not measured percentages from CI)

```
Phase                          Built                    Tested
R0  Recover agents        100% [####################]  100% [####################]
R1  Foundation             98% [###################.]   90% [##################..]
R2  Roles / onboarding     95% [###################.]   80% [################....]
R3  Search / discovery     95% [###################.]   85% [#################...]
R4  Patient booking        92% [##################..]   80% [################....]
R5  Provider ops           88% [#################...]   70% [##############......]
R6  Other workflows        82% [################....]   65% [#############.......]
R7  Clinical expansion     82% [################....]   60% [############........]
R8  Design / lang / UX     78% [###############.....]   60% [############........]
R9  Regression / handover  62% [############........]   45% [#########...........]
R10 Lab directory (C)      90% [##################..]   80% [################....]
OVERALL                    ~91% [##################..]  ~80% [################....]
```

Remaining: about 3 hours of agent or lead time plus review, about 700 Kiro credits (needs the monthly limit to reset or a top-up) or the same work done by Claude directly.

## Open items and known gaps

- Telugu and Hindi strings are machine-written and need a fluent human review (`docs/frontend/REVIEW_NEEDED.md`, `REQUESTS.md` R-FE-D-36 to 39).
- Proof-of-visit QR is not built (no approved QR library).
- Possible hydration-reset bug in shared form controls (fe-a to reproduce, propose a patch in `REQUESTS.md`).
- Reviews flag question (separate flag or clinical flag) is a user decision. Overlap between fe2-d and fe2-p (4aa02f8) needs a decision.
- Unused leftovers to delete once owners agree: fe-p notifications api/actions/inbox, fe-d `myRecordPdfLinkAction`.
- Product decisions still open: family limit 10, saved doctors 50, default reminder settings, safety messages vs quiet hours, WhatsApp/SMS opt-in wording.
- Proposed backend endpoints are in `docs/frontend/REQUESTS.md` (R-FE-P-R7-1 to 4, R-FE-P-R8-1, R-FE-D-36 to 39).

## After the frontend is complete

Connect to the backend with `FRONTEND_ADAPTER=http` (Docker is needed only for local Supabase), then carry out the user's change requests.
