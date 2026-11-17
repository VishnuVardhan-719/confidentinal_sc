# SureCure Visit — detailed v1.5 specifications

These files were extracted from the nested `SureCureVisit/SureCureVisit.zip` archive inside the original `SureCureVisit.zip` upload. The complete original archive is preserved at `docs/source/SureCureVisit_v1.5_original_kit.zip`.

The current `README.md` at the project root is the governing v2.2 execution contract. Current owner/agent decisions in the root README, `CLAUDE.md`, `AGENTS.md`, `docs/DECISIONS.md`, `docs/AGENT_COORDINATION.md` and `docs/PERMISSIONS.md` override older v1.5 team assignments and startup restrictions.

The detailed files here preserve the original product requirements and design depth. Treat them as source specifications, not proof of implementation or client/legal approval. Proposed routes, data structures, pricing, cancellation terms, provider coverage, clinical workflows and integrations must be validated before use.

## Detailed specifications

- `PRODUCT_REQUIREMENTS.md` — pages and workflows across the six roles.
- `SYSTEM_ARCHITECTURE.md` — application boundaries, deployment and performance/security principles.
- `DATABASE_SCHEMA.md` — proposed logical data model; not migrated SQL.
- `ROLE_ONBOARDING_AND_PERMISSIONS.md` — role onboarding and access details.
- `BOOKING_AND_CONSULTATION.md` — booking lifecycle, arrival OTP, consultation, realtime, documents and the requested 14 consultation capabilities.
- `TECH_STACK_AND_SUBSCRIPTIONS.md` — vendor, tool and budget assumptions; verify current prices before purchase.
- `AI_WHATSAPP_AND_CLOUD.md` — assistant, messaging, cloud operations and emergency gates.
- `DESIGN_ANIMATION_I18N.md` — design, animation, accessibility and English/Telugu/Hindi.
- `EXISTING_SITE_AND_MIGRATION.md` — existing CureVist site and safe migration questions.
- `CLIENT_HANDOVER_AND_OPERATIONS.md` — account ownership, operating roles and handover.
- `RISKS_OPEN_DECISIONS.md` — risk register and required client decisions.
- `DAY_BY_DAY_PLAN.md` — original November 17–23 target schedule; rebaseline if execution begins after the stated dates.
- `FILE_INDEX.md` — original source pack index.
- `MASTER_BLUEPRINT_V1_5_ORIGINAL.md` — original nested v1.5 consolidation notice and inherited technical blueprint; superseded for current agent governance by the root README.

Original decision, API, release, permission, toolkit, agent coordination, task-board, design, master-blueprint and README files are preserved with `_V1_5_ORIGINAL` names in this folder or in the exact original archive. Current versions live at the project root/docs.

## Required reconciliation before migrations

The v1.5 `DATABASE_SCHEMA.md`, the inherited v1.3/v1.1 master blueprint and the v2.2 root README use overlapping but non-identical table names and groupings. Do not merge these blindly. Before the first database migration, prepare one normalized ERD and one approved canonical schema, map old names to final names, record trade-offs in `docs/DECISIONS.md`, and update `docs/API_CONTRACTS.md`. One migration author at a time.
