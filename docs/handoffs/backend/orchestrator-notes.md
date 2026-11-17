# Orchestrator state (2026-11-17, Claude) — uncommitted local note
Repo: VishnuVardhan-719/confidentinal_sc. Worktrees in C:\Users\Yashwanth\SureCureVisit-codex-{I01,I02,C01,B01}.
PR #1 I01 (task/I01-auth-rls->develop) pushed incl. follow-ups 1efbab0. PR #2 I02 (->task/I01-auth-rls) pushed 34811b8.
C01 branch task/C01-catalog: committed+merged I02/I01 (802a8bd), NOT pushed; Codex t1f applying Kiro review fixes (uncommitted); CodeRabbit cr_C01.json pending read.
B01 branch task/B01-booking (off C01) Codex t1g running; Kiro B01/P01 brief at C:\Users\Yashwanth\.claude-scratch-B01-P01-design.md.
Terminals: t1f codex-c01, t1g codex-b01, t14 codex-i02, t7 codex-i01, t16 kiro (read-only reviews). Approval loop: vet prompt, reject git commit/push/reset/rm -rf/curl/service-role/.env.
Local Supabase surecurevisit ports 584xx, DB reset on C01 branch (migrations 001-004). Run suites: docker exec -i supabase_db_surecurevisit psql -U postgres -v ON_ERROR_STOP=1 < tests/rls/X.sql
TODO: verify+commit+push C01 -> PR (base I02 branch); Kiro/CR on B01; P01; Q01; docs ledger PR; owner decisions list (renewal, four-eyes, signing design, price 0, caps).
