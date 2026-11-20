# Current project handover

**Pack state:** Master execution instructions and source specifications prepared and verified (v2.2).  
**Application state:** No application implementation has been verified from the supplied specification pack. The real working repository must be inspected at resume.  
**Human controller:** Project owner.  
**Orchestrator:** Claude Code CLI.  
**Delegated CLIs:** Codex and Kiro.  
**Future contributor:** Friend, primarily pending frontend/UI work.

## Resume procedure

1. Open Claude Code in the actual SureCure Visit project root containing this README.
2. Verify the live model picker/effort and CLI versions using `docs/MODEL_SELECTION.md`.
3. Send the short instruction: `Read README.md and resume execution from the current task ledger. Verify the strongest available Claude model and effort, inspect Codex/Kiro capabilities, and continue. I control Claude; you orchestrate the other agents. Do not restart completed work.`
4. Claude must inspect actual Git state, app code, archives, commits, tests and task ledger before modifying files. The separate uploaded project archive and any pre-existing application repository must be inspected before creating a new scaffold.
5. Start with R00/R01, then S00 schema reconciliation before the first migration.

## Current verified documentation work

- Master execution README and current agent governance are prepared.
- Complete v1.5 detailed specification source was recovered from the nested ZIP and extracted under `docs/specs/`.
- Original v1.5, v1.3 and v1.1 source files/archives are preserved under `docs/source/`.
- Model/effort guide and schema crosswalk are included.
- Obsolete active worktree script and stale source-inventory claims have been corrected/archived.

## Not performed

- No app source code was authored as part of pack verification.
- No package install, app build, application test, Supabase project/migration, Vercel deployment, DNS change, payment configuration, data import or external account change was performed.
- No production credentials or real patient data were used.

## Friend handover expectation

The owner begins both frontend and backend. When the friend joins, Claude selects independent pending frontend/UI tickets and creates a self-contained handover with branch/base commit, setup instructions, file scope, UI state, API contracts, mock-vs-real data status, tests, known defects and next actions. Do not send the friend work that depends on unfinished backend contracts without clearly identifying mocks/dependencies.

## N01 implementation handoff — 2026-11-20

Codex authored the notification database/app layer on `feat/N01-notifications`, base `integ/all` `51c7439`. SQL/RLS/concurrency are **DB NOT EXECUTED** under the owner policy; all notification gates remain OFF. Static app checks and a Webpack production build passed. Native category integration, reviewed category-rule reseed, database acceptance and frontend UI acceptance remain pending. Read [the N01 handoff](handoffs/N01_codex_2026-11-20.md) for exact migrations, suite cases, API contracts, category code list and teammate commands. No existing ops/contact route was recreated.
