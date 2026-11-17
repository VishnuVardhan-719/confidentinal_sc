# SureCure Visit — Master Execution Pack v2.2 Verification Report

**Audit date:** 17 November 2026  
**Result:** PASS — documentation/source pack integrity checks  
**Scope:** Uploaded project documentation archives, extracted specification copies, current execution README and supporting coordination files.

## 1. Source integrity

- Preserved 10 original-source files have valid SHA-256 hashes and byte sizes against `docs/source/SHA256SUMS.md`.
- The supplied outer v1.5 wrapper, v1.3 kit, v1.1 kit, v2.0 README and v2.0 execution ZIP match the available uploaded originals byte-for-byte.
- The nested v1.5 ZIP inside the outer upload is byte-identical to `docs/source/SureCureVisit_v1.5_original_kit.zip`.
- The nested v1.5 archive contains 44 entries and 31 Markdown files, including 20 Markdown files under its `docs/` directory.
- 23 extracted v1.5 specification/instruction files plus four skill files were compared against the corresponding nested ZIP members; all 27 copies match byte-for-byte.

## 2. Master README and workflow audit

Confirmed in the active root `README.md` and supporting files:

- Claude Code is the lead orchestrator; Codex CLI and Kiro CLI are delegated agents.
- The owner initially directs both frontend and backend development; the friend joins later for pending frontend/UI work.
- Antigravity and AI Dev Kit are removed from the active workflow.
- Model/effort selection, CLI/account availability verification and usage-entitlement cautions are present.
- Tooling coverage includes Claude/Codex/Kiro agents, skills, hooks, MCP, documentation tools, testing tools and optional external integrations.
- Git isolation, task assignment, agent handoff, integration, release controls and the friend handover process are documented.
- The initial task ledger starts at `PENDING`; no implementation is falsely marked in progress or complete.
- Each of the 14 consultation capabilities is individually tracked as task `DC01`–`DC14`.
- The conflict between the detailed v1.5 consultation request for the November 23 target and the release-contract deferral of clinical records/prescriptions is documented as an OPEN client decision. No requirement is silently deleted; real-patient activation remains separately gated.
- The design palette in the master README matches `DESIGN.md`.

## 3. Static checks executed

| Check | Result |
|---|---|
| Source SHA-256 manifest | PASS — 10/10 entries |
| Original uploaded files preserved | PASS |
| Nested v1.5 ZIP preserved | PASS |
| v1.5 source inventory counts | PASS — 44 entries / 31 Markdown / 20 docs Markdown |
| Extracted specs and skills byte comparison | PASS — 27 files |
| Master README role/model/tool/integration coverage | PASS |
| 14 consultation capabilities and task IDs | PASS — 14/14 |
| Clinical milestone conflict recorded | PASS |
| Current documentation version labels | PASS — no stale active v2.1 labels |
| Initial task status | PASS — R00 is `PENDING` |
| Claude settings JSON parse | PASS |
| Guarded worktree helper `bash -n` | PASS |
| Obsolete v1.3 worktree helper removed from active scripts | PASS — retained only as historical source |
| Local Markdown links | PASS — zero broken local links |
| README/`DESIGN.md` palette consistency | PASS |
| Required execution and source files present | PASS |

**Static document checks:** 16/16 passed.

## 4. Model and entitlement caveats

The pack records a recommendation, not proof of the owner's account entitlements:

- Claude Fable 5.2 is intended for demanding reasoning and long-horizon agentic work, has adaptive thinking always on and defaults to `high` effort. Claude Code 2.1.321 or later is required to select it. Its plan usage differs: Max/Ultra usage draws on weekly limits (with Fable using those limits faster); Pro usage normally uses credits, subject to any current launch offer. The account's actual Usage/credits page and CLI picker must be checked before substantial use.
- Codex GPT-6 Astra is preferred for the hardest work only if shown in the authenticated CLI; GPT-6.1 Sol is the documented alternative where available.
- Kiro GPT-5.6 Sol is a candidate for its hardest multi-step tasks only if the authenticated Kiro account/region exposes it. Kiro plan naming alone does not prove model/agent/hook/MCP availability.

Official references are listed in `docs/MODEL_SELECTION.md`. Account-specific credits, reset tickets, plan entitlements and live CLI model pickers were not accessible during this pack audit and remain to be checked by the owner/Claude at session start.

## 5. Explicitly not verified

This is a documentation/source-pack verification, not an application verification. The audit did not:

- Run a SureCure Visit application build, unit/integration/E2E tests or browser review.
- Verify a live app repository, actual Git remote or developer worktree; Claude must inspect the actual working directory at resume.
- Run authenticated Claude, Codex or Kiro sessions or prove that one CLI can invoke the others.
- Provision Supabase, execute database migrations, validate RLS against live role tokens or access client records.
- Configure Vercel, DNS, Razorpay, WhatsApp, SMS, Maps, Sentry or Ollama.
- Import real patient data or perform a legal, clinical, privacy or security certification.
- Deploy or enable production functionality.

The inspected project archives are specification/toolkit packs and do not contain a runnable application source tree or package manifest. This does not prove that no application exists elsewhere; inspect the actual repository and all separately supplied project code before scaffolding or editing.

## 6. Resume instruction

Open Claude Code in the actual project root and send the short instruction:

> Read `README.md` and resume SureCure Visit from the current task ledger. Verify the strongest available Claude model and effort, inspect Codex/Kiro capabilities, then continue. I control Claude; you orchestrate the other agents. Do not restart completed work.

The root `README.md` is the sole heavy master prompt. Do not replace it with another long prompt pasted into chat.


## 7. Final distribution package

The final standalone README and execution ZIP were rebuilt from the audited working pack. The final package check confirms:

- The standalone `SureCureVisit_Master_README_v2.2.md` is byte-identical to the pack's root `README.md`.
- The ZIP contains all 69 files in the execution pack, including hidden project configuration and context files.
- The ZIP CRC check passes (`ZipFile.testzip()` returned no damaged member).
- No duplicate ZIP member names, absolute paths or parent-directory traversal entries are present.
- The root `README.md`, startup pointer, agent instructions, verification report, v1.5 specifications and preserved source archives are included.

This verifies the documentation distribution artifact only; it does not verify the application itself or live CLI/account entitlements.
