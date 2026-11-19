# Active context (2026-11-19, FE v2 Phase 4)
Owner rejected the old demo frontend (preserved on wip/frontend-pause-2026-11-18). Fresh build per docs/FRONTEND_MASTER.md. Conventions: docs/frontend/CONVENTIONS.md.
Lead = Claude (commits/push, integration, review). Task files: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE4-common.md + PHASE4-E2.md.

## fe-e2 Phase 4 (feat/fe2-e, base 05ba88a, port 3350)
Task: merge feat/fe2-b (64b916f) -> replace getOperationsSession/interim guards with requireRole -> un-fixme e2e admin-ops/ambulance/caretaker/lab/cms -> role-isolation browser test -> axe on each workspace -> tsc/lint/vitest/build/playwright -> commit.
Progress:
- [ ] merge fe2-b

## fe-b (Kiro) PHASE4-E2, 2026-11-19
- 6e70397: real guards (requireOperationsSession/authorizeOperationsSession in src/modules/admin/session.ts), ops personas in src/fixtures/identity/operations.ts.
- Next: run ops e2e on 3350 (.context/run-e2e.ps1 uses root playwright.config.ts), role-isolation spec, axe.

- Ops specs un-fixme'd; signInAs wired (support/operations.ts, hard reload after sign-in). Discovery copies (serial removed) in tests/e2e/zz-discover (DO NOT COMMIT; delete at end). First discovery: 26 fail / 15 pass desktop, list in .context/ops-e2e-discovery-desktop.txt.

