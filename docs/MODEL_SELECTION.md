# Model and Effort Selection — SureCure Visit

**Verification date:** 17 November 2026  
**Purpose:** Starting recommendations for the owner's Claude Code + Codex CLI + Kiro CLI workflow. Vendor model catalogs are not proof of account/CLI availability; the live authenticated CLI model picker is authoritative.

## Recommended configuration

| Tool | Project choice | Baseline effort/mode | Escalation | Verification |
|---|---|---|---|---|
| Claude Code (orchestrator) | **Claude Fable 5.2** (`claude-fable-5-2`) for the owner's current reset window and long-horizon project orchestration, if exposed | **High** | `xhigh` for genuinely difficult long-running engineering where a measured benefit exists; `max` is rare, expensive and not a default | `claude --version`, `/model`, `/effort`, `/status` |
| Codex CLI (delegated engineer/reviewer) | **GPT-6 Astra** (`gpt-6-astra`) if it appears in the authenticated Codex picker; otherwise use the strongest stable model listed there. **GPT-6.1 Sol** (`gpt-6.1-sol`) is a strong documented fallback when exposed | **High** for substantial code/review work | `xhigh` for especially difficult schema/security/concurrency tasks when useful; `max` only if exposed and justified by evidence | `codex --version`, `codex --help`, interactive `/model`/settings supported by that installed build |
| Kiro CLI Ultra | Strongest stable model exposed to this account/CLI; do not infer model from the plan name | Highest practical setting supported for the assigned difficult task; use Auto for routine routing if available | Escalate only when available and appropriate | CLI version, live model picker, plan entitlement, available agents/specs/hooks/MCP and permissions |

## Claude Code — current Fable reset-window choice

Anthropic's official model overview describes Claude Fable 5.2 as intended for demanding reasoning and long-horizon agentic work. Fable 5.2 has adaptive thinking always on and `high` as its default effort. Use `high` as the baseline; raise to `xhigh` only for the hardest engineering tasks when the current CLI supports it and the expected benefit justifies the extra usage. Do not set maximum effort for every turn. This project has a genuine long-horizon orchestration workload, and the owner specifically wants to use the currently available Fable reset/allowance.

Claude Code Fable 5.2 requires **Claude Code v2.1.321 or later** according to Anthropic's Help Center. Verify the installed version, then select it only if the authenticated CLI exposes it:

```bash
claude --version
claude --model claude-fable-5-2
```

Within an existing session, use `/model` to select Fable 5.2 if listed, `/effort` to inspect supported settings, and `/status` to verify the active model. If it is absent, do not waste the session repeatedly retrying it: check version/account access, then use the strongest available supported model. Anthropic's guidance is to use the latest Opus for most workloads and consider Fable 5.2 for demanding reasoning and long-horizon agentic work. Use Fable for this project's highest-value orchestration, deep specification reconciliation, complex implementation and review; do not burn it on repeated status prose or routine mechanical tasks.

### Verify what the owner's Fable allowance actually means

Do not assume a remembered "reset ticket" or historical promotion automatically means Fable 5.2 is free. Anthropic's current plan article says:
- On Max/Ultra and eligible premium seats, Fable models count toward the regular weekly usage limit; up to 50% of that limit may be used on Fable, and Fable consumes the limit faster than other Claude models.
- On Pro and eligible standard seats, Fable 5.2 uses usage credits rather than the regular included plan limit, except where a currently applicable launch offer explicitly says otherwise.
- The older Fable 5 promotion ended on 19 July 2026 and did not include Fable 5.2 or 5.1.

Before substantial Fable use, inspect the account's current Usage/credits page and verify the exact model, allowance, expiry and whether the benefit is a reset, included weekly usage or paid usage credits. The pack cannot inspect the owner's private account entitlements. If the allowance is not clear, ask the owner before causing paid credit usage.

## Codex CLI

OpenAI describes GPT-6 Astra as its most capable model for demanding reasoning and coding. GPT-6.1 Sol is a near-Astra option at lower cost and is explicitly suitable for complex coding and professional work. The API model catalog is not proof that a model is available in every Codex CLI account or plan. The authenticated Codex CLI picker is the source of truth.

If Astra is actually listed in this Codex CLI account, use it for difficult independent engineering/review. Otherwise select the strongest stable model the installed CLI exposes; prefer GPT-6.1 Sol when available and suitable. Begin at `high` for substantial tasks. Move to `xhigh` only for especially complex, high-consequence tasks when needed; reserve `max` for rare work where the added reasoning budget is justified. Do not set xhigh/max on every task. For simple formatting, summaries or scoped mechanical work, use a lower available effort to conserve usage.

Check the installed `codex --help` and interactive `/model` interface before using flags. Do not assume API model IDs or API parameters automatically work in a subscription-based Codex CLI session.

## Kiro CLI Ultra

The owner states that they have Kiro Ultra. A plan label alone does not prove which models, regional endpoints, effort controls, agents, hooks, specs or MCP integrations are enabled in the installed CLI. Inspect the live model picker and account capabilities. Kiro's current model guide describes GPT-5.6 Sol as a strong choice for its hardest multi-step work and long-horizon refactors, but availability is plan/region/account dependent. If GPT-5.6 Sol is actually offered to this account, use it for Kiro's hardest independent architecture, implementation or review tasks; otherwise choose the strongest stable model visible in the authenticated CLI. Use Auto for routine routing only if available and consistent with the owner's privacy/region requirements. Record exact model, effort, geography, version and any credit multiplier shown; avoid experimental models for critical healthcare/security work unless specifically evaluated and approved.

## Usage discipline

- Use the expiring Fable reset on high-value orchestration, project-wide reasoning and hard implementation/review work, not repeated status prose.
- Delegate independent implementation and testing to Codex/Kiro with bounded tasks, isolated worktrees and explicit acceptance criteria.
- Do not run multiple expensive agents on the same task just to create activity. Parallelize only independent work.
- Do not assume higher effort always produces a better result. Escalate only when task risk/complexity warrants it.
- Record exact model IDs, effort, CLI versions and observed availability in `docs/SESSION_LOG.md`; never record secrets, account identifiers or private billing data.

## Official documentation checked (17 November 2026)

- Anthropic model overview: https://platform.claude.com/docs/en/models/overview
- Claude Fable 5.2 overview: https://platform.claude.com/docs/en/models/fable-5-2/overview
- Anthropic effort guidance: https://platform.claude.com/docs/en/build-with-claude/effort
- Claude Fable models and plan usage: https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan
- Claude Code model configuration and supported Fable 5.2 model ID: https://support.claude.com/en/articles/11940350-claude-code-model-configuration (Fable 5.2 requires Claude Code v2.1.321 or later; the plan/usage article above covers entitlements).
- OpenAI GPT-6 Astra: https://developers.openai.com/api/docs/models/gpt-6-astra
- OpenAI GPT-6.1 Sol: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- OpenAI Codex / model selection guide: https://learn.chatgpt.com/docs/models?surface=cli
- Kiro model selection: https://kiro.dev/docs/models/
- Kiro available models: https://kiro.dev/docs/models/available-models/

**Recheck this page at every execution session.** Model IDs, account entitlements, CLI syntax, pricing and availability can change. Live account/CLI evidence wins over this dated recommendation.
