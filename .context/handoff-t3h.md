# Handoff t3h (fe-e2, Kiro) - worktree C:/Users/Yashwanth/fe2-e, branch feat/fe2-e @ 0a7ee3d
Task file: C:/Users/Yashwanth/.claude-scratch-tasks/PHASE4-common.md + PHASE4-E2.md. Port 3350. Not pushed.

## DONE
- Step 1: merged feat/fe2-b (64b916f) -> merge commit **0a7ee3d**. One conflict, `docs/frontend/REQUESTS.md`, resolved by keeping both sides (pure additions, 111 lines, LF). No code conflicts.
- No other code changes yet. Working tree clean except `.context/activeContext.md` (excluded) and this file. No WIP to commit.

## IN PROGRESS (analysis only, nothing edited)
Plan for step 2, replacing `getOperationsSession()` (src/modules/admin/session.ts:20-26, returns `{guard:null, admin:null}`):
- Use `requireRole(area, {path})` in frames/gates and `authorizeRole(area)` in server actions (src/modules/auth/server.ts:88-109). Allowed result = `{identity, workspaces}` filtered to the role (auth/guard.ts:13-45). Signed-out -> login with safe `next`; wrong role -> `landingPathFor` (guard.ts:47-62).
- Callers to switch: src/components/admin/ops/server.ts:22,27 (providerAreaAccess, adminPrincipal); src/modules/admin/action-guard.ts:14; src/modules/admin/admin-actions.ts:27; src/modules/admin/server-actions.ts:17.
- Frames: src/components/admin/admin-frame.tsx (AdminFrame, AdminRouteGate incl. CMS route), src/components/{lab,ambulance,caretaker}/*-frame.tsx via providerAreaAccess.
- Mapping needed: auth `Workspace {role,state,providerId?,providerStatus?,membership?}` -> ops `WorkspaceMembership` (membershipId, profileId, providerId, organizationId, area, displayName, membershipRole, status, scopes, resourceId). Admin needs `AdminPrincipal {profileId,status,mfaVerified,grants[]}`. The I01 session has no MFA/grants/resourceId, so in http mode this must fail closed; in fixture mode derive from synthetic data.

## BLOCKERS FOUND
- Identity fixtures (src/fixtures/identity/sessions.ts) have NO active lab/ambulance/caretaker account: lab.owner=pending_review, ambulance.operator=onboarding_incomplete, caregiver.suspended=restricted. canAccessRoute limits non-active workspaces to setup routes, so ops pages are unreachable. Need new active fixture scenarios (lab manager/collector/reviewer, ambulance operator/driver, care agency manager/caregiver, admin with grants+MFA) via fixture accounts.
- ID mismatch: identity fixtures use UUIDs (labProvider ...3001, ambulanceProvider ...4001, caretakerProvider ...5001); ops fixtures (src/fixtures/operations/workspaces.ts) use `fx-lab-provider-1`, `fx-amb-provider-1`, `fx-care-provider-*`, profiles `fx-prof-*`. Must unify (map ops scenarios to identity sessions, keyed on fx-* ids or switch to UUIDs; check KEY_PATTERN `[A-Za-z0-9_-]{1,64}` accepts both).

## REMAINS
1. Step 2 above (+ add active fixture scenarios/accounts to identity fixtures and tests/e2e/support/identity.ts ACCOUNTS).
2. Step 3: un-fixme tests/e2e/{admin-ops,ambulance,caretaker,lab,cms}.spec.ts (check for `// @ts-nocheck` headers), run in chromium on port 3350, fix real failures; add role-isolation browser spec.
3. Step 4: axe on each workspace main page; fix serious/critical.
4. Verify: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`, `npx playwright test --config tests/e2e/playwright.config.ts` (config port/webServer/adapter env var NOT yet read; two configs exist: root playwright.config.ts and tests/e2e/playwright.config.ts). Commit with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
Not yet read: src/components/lab/lab-frame.tsx, src/modules/admin/routes.ts, src/fixtures/operations/admin.ts, the five e2e specs, both Playwright configs.

## Commands/tests status
- No tests or servers run this session. No server running on 3350. No known failures.
