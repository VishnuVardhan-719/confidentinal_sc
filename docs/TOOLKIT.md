# Engineering toolkit — inspect before use

Use existing installations when available. Do not bulk-install tools or copy global configuration. Verify versions, licenses, permissions, CLI commands and current compatibility before relying on a tool.

| Tool / capability | Intended use | Rule |
|---|---|---|
| Claude Code CLI | Primary orchestrator and implementation | Verify model/effort and supported delegation; owner controls Claude |
| OpenAI Codex CLI | Delegated coding, tests, backend/security work, independent review | Verify model/reasoning options; isolated worktree |
| Kiro CLI Ultra | Specs, architecture, implementation, tests and reviews | Verify actual Ultra capabilities, agents and hooks |
| Superpowers | Planning, TDD, debugging and review | Use if installed; one ticket at a time |
| Impeccable / design skills | Design critique and UI polish | Use if installed; do not replace approved design decisions |
| shadcn/ui | Accessible component foundation | Customize; avoid default template appearance |
| Context7 | Version-specific official docs | Use when APIs/versions are uncertain |
| Playwright | Real browser tests | Tests must run and evidence be recorded |
| OWASP/security skills | Security review | Review is not certification |
| React best practices | Performance/accessibility review | Use only if source/skill is actually available |
| Supabase CLI | Local migrations and database tests | Synthetic data only; inspect before reset/push |
| GitHub Actions | CI | One shared lockfile and reproducible checks |
| Sentry/equivalent | Monitoring | Optional; cost and client account approval first |

Antigravity is removed from the active workflow. AI Dev Kit is disbanded and must not be required. Do not add unofficial model proxies, unnecessary orchestrators, paid tools, clinical AI/RAG or unneeded libraries. Check license before reusing code/components. Keep session history and credentials private.
