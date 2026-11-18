# Active context (2026-11-17 night)

- develop (local only, NOT pushed): foundation + our I01 + I01b. Do not push; friend's stack is the likely base.
- Friend's stack on origin: task/I01..B01 (stacked), wip/*; worktree .worktrees/kiro-integ-friend (integ/friend-backend).
- Our lineage pushed as ours/I02-provider-onboarding (+ docs/LINEAGE_COMPARISON.md, docs/reviews/I02_CODERABBIT.md); task/P01-design, task/S01-design pushed.
- Decision (delegated): adopt friend's stack as base, port our I02 hardening as forward migrations (kiro-i02 is sole migration author there). Fallback: keep ours.
- Running: t1j (friend-stack verification), kiro-i02 (port), kiro-ui (U01-a review -> C:\tmp\scv_logs\review_U01a.md), kiro-p01 (S01 review -> review_S01.md), cr-friend (-> cr_friend.txt). Codex 5h limit exhausted.
- Next: read results, fix findings, commit port on integ/friend-backend, CodeRabbit it, then ask owner before pushing/merging.
- Open owner items: Q02-Q05, Q07, Q09, Q10; repo still public.

## 2026-11-18 resume
- Docker + Stack A up; db reset applies all 12 migrations on integ/friend-backend (kiro agents dead; work uncommitted there).
- pgTAP: added supabase/tests/_tap_helpers.inc + TAP plan lines; 001,002,005 pass. 003 fails (owner download now denied by 000660?), 004 fails (search_providers redesigned in 000640: provider_reference replaces provider_id). Need to update tests to the new contract; check callers in B01/app code.
- Missing: review_U01a.md, cr_friend.txt incomplete. Nothing committed/pushed.
- (later 2026-11-18) pgTAP 001-005 all pass on integ/friend-backend; TS catalog layer moved to provider_reference (tsc/vitest 148/lint clean). Running: codex-b01 (Q06+B01 fixes, tests 010-012 in friend worktree failing = Codex WIP), kiro-ui (review_U01a). Approver: /c/tmp/scv_logs/aa2.sh (aa4_out.txt).

## HANDOFF 2026-11-18 ~15:40 (owner shutting down; resume at home)
State on disk (all UNCOMMITTED, nothing pushed):
- kiro-integ-friend (integ/friend-backend): migrations 20261117000600..660 (i02h_*), supabase/tests 001-005 + _tap_helpers.inc (pass 5/5 vs Stack A), TS catalog layer moved to provider_reference (tsc, vitest 148, lint clean; npm run build NOT run). Codex copies 010-014 tests + 001000/001100 migrations here for test runs (010-012 were failing = Codex WIP).
- codex-integ-b01fix (integ/b01-fixes): Codex WIP Q06 staff credentials + B01 fixes H1,H2,H3,M1,M3 (migrations 20261117001000, 001100; suites 010-014). Open finding: restrictive Storage policy blocks staff credential uploads; legacy booking suite expects contacts visible 2 days early.
- Agents (kiro-ui review, codex-b01, kiro-port) were KILLED by my terminal.keep/pane move mistake, then shutdown. Relaunch needed. Prompts: C:\tmp\scv_logs\codex_b01_resume2.txt, kiro_ui_task.txt (-> review_U01a.md), kiro_port_finish.txt. Launcher: bash /c/tmp/scv_logs/launch_kiro.sh <name> <cwd> <promptfile>; codex: hc run --bg --keep --no-parent --name codex-b01 --cwd <wt> -- codex --approve-for-me. Approver: bash /c/tmp/scv_logs/aa2.sh <names>.
- DO NOT use herdr-app terminal.keep to show agents (it ends them). Use tab.new + pane.split then `hc send <pane-terminal> "hc attach <name>"`.
- After reboot: start Docker Desktop (C:\Users\vishn\AppData\Local\Programs\DockerDesktop), `npx supabase start` minimal stack in kiro-integ-friend (-x studio,imgproxy,edge-runtime,vector,logflare,realtime,postgres-meta,mailpit), db lock protocol C:\tmp\scv_logs\db.lock. Only ONE stack (6GB RAM).
- Still to do: S01 design revision vs review_S01.md findings (Codex, after B01), CodeRabbit re-run on friend stack, review_U01a.md, npm run build, then ask owner before commit/push/merge. Open owner items: Q02-Q05,Q07,Q09,Q10; repo still public.
