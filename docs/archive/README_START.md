> **Superseded (2026-11-20):** start at [`START_HERE.md`](../../START_HERE.md) on branch `main`. This file is kept for history; where it disagrees with `START_HERE.md`, that page wins.

**Pre-start review v2.3:** Before implementation, read `docs/PRESTART_AUDIT_v2.3.md`. Opening this package or requesting a review does not authorize coding.

# Start / Resume SureCure Visit

This is a pointer file. The complete master startup prompt lives in the root **`README.md`**. Do not paste a large prompt from chat.

## To start or resume

1. Open Claude Code in the actual SureCure Visit project root.
2. Send this short instruction:

   > Read README.md and resume execution from the current task ledger. Verify the strongest available Claude model and effort, inspect Codex/Kiro capabilities, and continue. I control Claude; you orchestrate the other agents. Do not restart completed work.

3. Claude must read `README.md`, `docs/MODEL_SELECTION.md`, the current task ledger and handover, and inspect actual Git/application state before editing.

## Current arrangement

- Claude Code is the orchestrator controlled by the owner.
- Codex CLI and Kiro CLI are delegated agents.
- The owner initially handles both frontend and backend.
- The friend joins later for pending frontend/UI work.
- Antigravity and AI Dev Kit are not used.
- Heavy prompts belong in the README/docs, not in chat.
- Never overwrite existing work, expose secrets or claim tests pass without running them.
