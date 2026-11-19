# Active context (2026-11-18, FE v2 restart)
Owner rejected the old demo frontend (preserved on wip/frontend-pause-2026-11-18). Fresh build from develop per docs/FRONTEND_MASTER.md. Conventions: docs/frontend/CONVENTIONS.md.
Team (herdr terminals): t2d fe-a Kiro (worktree fe2-a, feat/fe2-a: FE01+FE02 foundation+public), t2f fe-b Kiro (fe2-b: identity/onboarding data layer), t2g fe-c Codex (fe2-c: marketplace data layer). Lead = Claude (commits, integration, review). Task files: C:/Users/Yashwanth/.claude-scratch-tasks/FE-{A,B,C}.md. Approval loop: .claude-scratch-approve.sh t2d t2f t2g.
Base commit 3174196 (feat/fe2-a). Backend PRs #1-#5 unmerged; adapters: http (real contracts) + fixture (labelled, blocked when APP_ENV=production).
Phase 2 (after A merged): auth/onboarding UI (B), directory/booking/patient dash (C), doctor/lab/ambulance/caretaker/admin dashboards, clinical editor, payments/support, i18n/a11y/e2e, adversarial review.

## T5 fe-p on fe2-a (port 3330)
- 305e48d header 2xl overflow fix (te 175px@1536). public+public-nav+a11y: 131 passed 0 failed before 1536 add; 1536 sweep 3/3.
- Next: R8 usability audit te/hi 390/768/1280 via .context/fep2-audit.mjs, fix CSS/components, small commits, handoff-fe-p2.md.

