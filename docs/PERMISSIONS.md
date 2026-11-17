# Autonomy and permissions

The owner authorizes autonomous routine local engineering within this repository. This does not grant client authority, production credentials or permission to perform unsafe/irreversible operations.

| Action | Rule |
|---|---|
| Read project files, inspect Git, edit assigned source/docs | Autonomous; preserve unrelated work |
| Install project dependencies | Autonomous after inspecting package scripts/lockfile and avoiding unnecessary or paid services |
| Run lint, typecheck, unit/integration/E2E tests and local builds | Autonomous |
| Local synthetic DB migrations | Autonomous in isolated local/dev environment after reviewing SQL and target |
| Git feature branches and commits | Autonomous on assigned branch; no force push |
| Push feature branches | Allowed when configured and within owner-authorized repository; never push secrets |
| Merge to develop/main | Claude coordinates; review required; main protected/stable |
| Shared staging migration/deployment | Coordinated by Claude only after checking target, backup and agreed workflow |
| Production deployment, production migrations, DNS cutover | Requires explicit client authorization and green release gates |
| Real patient records/data export | Never expose to AI agents; separate authorized human-controlled process only |
| Live charges/refunds/merchant settlement | Requires client authorization and verified operational process |
| Destructive production deletion, secret export, disabling security controls | Not autonomous; require separately authorized safe process; do not bypass tool safeguards |
| Paid vendor/service purchase | Requires budget approval |
| Enabling emergency, clinical, pharmacy, subscription or live-payment features | Requires their specific documented gates and owner/client approval |

Actual CLI permissions are not changed by this document. If a tool asks for approval, do not bypass its safety controls. Use least-privilege credentials. `.env.example` contains variable names only. Never paste secrets into prompts, handoffs, logs or commits.
