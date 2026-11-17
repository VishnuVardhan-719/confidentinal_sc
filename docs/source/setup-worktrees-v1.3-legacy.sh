#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"
git rev-parse --verify HEAD >/dev/null
[[ $(git branch --show-current) == main ]] || { echo 'Run from main'; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo 'Commit or safely resolve working changes first'; exit 1; }
[[ -f package.json ]] || { echo 'Scaffold and commit the single application first'; exit 1; }
for branch in feature/claude-ui feature/codex-backend; do
  if git show-ref --verify --quiet "refs/heads/$branch"; then echo "Branch exists: $branch; inspect existing worktrees"; exit 1; fi
done
[[ ! -e "$root/../SureCureVisit-Claude" && ! -e "$root/../SureCureVisit-Codex" ]] || { echo 'Sibling folder exists; inspect before continuing'; exit 1; }
git worktree add -b feature/claude-ui "$root/../SureCureVisit-Claude" main
git worktree add -b feature/codex-backend "$root/../SureCureVisit-Codex" main
git worktree list
