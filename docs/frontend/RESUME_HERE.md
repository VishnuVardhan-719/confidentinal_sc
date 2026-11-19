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

## Branches and worktrees (all pushed, local = remote)

| Worktree (dir under `C:\Users\Yashwanth\`) | Branch | Head | Kiro window (name, tab) | Last task |
|---|---|---|---|---|
| `fe2-a` | `feat/fe2-a` | 3c72d13 | fe-a / t3z works in **`fe2-d`** | R8-D |
| `fe2-d` | `feat/fe2-d` | f36ff67 | (same window as fe-a) | R7-D, R8-D (consultation editor WIP) |
| `fe2-e` | `feat/fe2-e` | c99a4c7 | fe-b / t40 | R9-E (stories gated state, lab paise fix) |
| `fe2-c` | `feat/fe2-c` | 5b92202 | fe-q / t42 | R10-C done, R9-C2 adversarial review (WIP) |
| `fe2-p` | `feat/fe2-p` | 149a74b | fe-p / t41 | R9-P (merge fe-a, moderation audit view) |
| `fe2-int` | `feat/fe2-integration` | 47b6574 | fe-int2 / t43 | INT3 (WIP) |

Tab ids (`t3z`, `t40`, `t41`, `t42`, `t43`) change after a restart. Re-check with `hc ls`.

## How to restart the agents

```
export MSYS_NO_PATHCONV=1
hc run --bg --name fe-a    --cwd C:/Users/Yashwanth/fe2-d   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-b    --cwd C:/Users/Yashwanth/fe2-e   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-p    --cwd C:/Users/Yashwanth/fe2-p   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-q    --cwd C:/Users/Yashwanth/fe2-c   kiro-cli chat --model claude-opus-5.5
hc run --bg --name fe-int2 --cwd C:/Users/Yashwanth/fe2-int kiro-cli chat --model claude-opus-5.5
```

Then `hc ls` for the new tab ids. Send each a prompt (`hc send tN "..."` then `hc keys tN enter`): "Read .context/activeContext.md PAUSED STATE and continue", plus the task below. Use `cd <worktree> && git ...` for git (not `git -C`) when `MSYS_NO_PATHCONV=1`.

Approver: `C:\Users\Yashwanth\.claude-scratch-approve-full.sh <tab ids>`. It approves every dialog except a deny list (push, reset, clean, rebase, stash, checkout of develop/main, force, secrets, curl and other network, Stop-Process, recursive deletes, writes outside worktrees), which go to `.claude-scratch-hold.log` for manual review. Vet each HOLD (expand with Ctrl+O, check scope is the agent's own port and worktree, collapse, verify "Allow once", then `hc keys tN enter`). "blocked (permission)" notices are mostly stale: always verify with `hc read tN | tail -100 | tail -14 | grep -c "Allow once"`.

Push recipe (never to `develop`/`main`):
`cd <worktree> && GIT_TERMINAL_PROMPT=0 timeout 100 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -q origin <branch>`, then check `git rev-parse --short HEAD` equals `git ls-remote origin <branch>`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

Ports: fe2-a/d 3370 to 3383, fe2-c 3360 to 3369, fe2-e/b 3350 to 3359, fe2-p 3384, integration 3320. All servers are stopped now.

## What to take up first on resume (in order)

1. **fe-int2 (fe2-int), INT3.** Done: re-merge of c/d/e/p, guard codemod, e2e specs moved to real fixture sign-in (`tests/e2e/support/fixture-session.ts`, `workspace-servers.ts`). Not done: smoke mutation flows (booking request, provider accept or decline, cancel, CMS publish) plus axe with dialogs open in `tests/e2e/integration-smoke.spec.ts`. Then rerun smoke on a fresh build (`.context/int2-serve.ps1`, `npx playwright test --config tests/e2e/integration.config.ts`), update `docs/frontend/INTEGRATION_REPORT.md`, re-merge the newest heads of a/c/d/e/p, TASK REPORT.
2. **fe-p (fe2-p), R9-P.** Merge local `feat/fe2-a` (clears 13 shared-suite failures from the Telugu header overflowing 12 px at 1280), rerun shared public and a11y suites, then the read-only moderation audit-log view (no undo) with tests.
3. **fe-b (fe2-e), R9-E.** Gated "not available yet" page for `/stories` in http mode, then a full regression (tsc, lint, unit, build, a11y at 390 and 1280). Lab catalogue paise fix is committed (0500117 path, `paiseToRupeesString`).
4. **fe-q (fe2-c), R9-C2.** Finish `docs/frontend/ADVERSARIAL_REVIEW.md` (so far: 1 HIGH, 1 MEDIUM, 2 LOW against fe2-int 02dc8bf). Then re-scan the new integration head. Fix the HIGH item with the owner of the file.
5. **fe-a (fe2-d), R8-D.** Finish the consultation editor changes (uncommitted edits were committed as WIP), fix the midnight-IST test, doctor/verify a11y sweeps, hydration-reset bug repro. Add `/lab-tests` to the sitemap (fe-a owns it).
6. **Claude:** CodeRabbit on each branch (no secrets or PHI; `/c/Users/Yashwanth/AppData/Local/Programs/coderabbit/coderabbit review --agent --base-commit <sha>` in the background), merge everything into `feat/fe2-integration`, full lint/typecheck/unit/build, full Playwright on the integrated build, update `docs/PROGRESS_REPORT.md`, final adversarial review, PHASE REPORT.

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
R9  Regression / handover  35% [#######.............]   25% [#####...............]
R10 Lab directory (C)      90% [##################..]   80% [################....]
OVERALL                    ~84% [################....]  ~70% [##############......]
```

Remaining: about 3 hours of agent time plus review (about 1,900 more Kiro credits). Test totals at last checks: unit 988/988 (fe2-c), 995/995 (fe2-p); e2e fe2-c 135 passed, fe2-p three modes 0 failures; earlier integration build exit 0 (446 pages) and smoke 84/84 at 390 and 1280 with axe.

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
