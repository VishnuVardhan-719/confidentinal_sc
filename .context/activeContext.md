# Active context (2026-11-18, FE v2 restart)
Owner rejected the old demo frontend (preserved on wip/frontend-pause-2026-11-18). Fresh build from develop per docs/FRONTEND_MASTER.md. Conventions: docs/frontend/CONVENTIONS.md.
Team (herdr terminals): t2d fe-a Kiro (worktree fe2-a, feat/fe2-a: FE01+FE02 foundation+public), t2f fe-b Kiro (fe2-b: identity/onboarding data layer), t2g fe-c Codex (fe2-c: marketplace data layer). Lead = Claude (commits, integration, review). Task files: C:/Users/Yashwanth/.claude-scratch-tasks/FE-{A,B,C}.md. Approval loop: .claude-scratch-approve.sh t2d t2f t2g.
Base commit 3174196 (feat/fe2-a). Backend PRs #1-#5 unmerged; adapters: http (real contracts) + fixture (labelled, blocked when APP_ENV=production).
Phase 2 (after A merged): auth/onboarding UI (B), directory/booking/patient dash (C), doctor/lab/ambulance/caretaker/admin dashboards, clinical editor, payments/support, i18n/a11y/e2e, adversarial review.

## Kiro B (fe2-b) state, appended
- No browser/e2e runs (user rule). Port 3313 server stopped. RAM rules: vitest --maxWorkers=2, one heavy job at a time, NODE_OPTIONS=--max-old-space-size=1536 for build.
- Done: e2e helpers fixed; profile.spec 6/6 (desktop, before rule); 2 nav tests fixme; profile gate (src/modules/onboarding/profile-gate.ts + profile-gate-server.ts, 5 unit tests); REQUESTS R-FE06-01..09.
- Next: COMPONENTS.md, REVIEW_NEEDED row, delete .playwright-mcp, final lint/typecheck/test/build, report DONE.
- PHASE3-B (Kiro B): committed ed384ee; guard wrong-role -> own landing; getAccountSession (src/modules/auth/account-session.ts + server.ts); /patient/onboarding forwards to health-profile; role-isolation.test.ts; REQUESTS R-FE07-01..03. Pending: tsc, lint, identity vitest, one build, commit.

## Kiro fe-b, PHASE4 (2026-11-19)
- Task A (fe2-b, port 3310): fix 13 e2e failures (handoff-kiro-b.md). IN PROGRESS. Baseline run: 29 pass, 14 fail, 19 did not run. Root causes: spec locators; account page links read before streaming finished.
- Task B (fe2-e, port 3350): PHASE4-E2. TODO
