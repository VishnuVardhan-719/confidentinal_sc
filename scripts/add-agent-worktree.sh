#!/usr/bin/env bash
set -euo pipefail

# Usage: bash scripts/add-agent-worktree.sh <agent-name> <branch-name> [path]
# Example: bash scripts/add-agent-worktree.sh codex feature/codex-auth ../SureCureVisit-codex-auth
# Run only after the shared foundation/branch exists. This script never resets, cleans or deletes data.

agent="${1:-}"
branch="${2:-}"
path="${3:-}"

if [[ -z "$agent" || -z "$branch" ]]; then
  echo "Usage: $0 <agent-name> <branch-name> [path]" >&2
  exit 2
fi

root=$(git rev-parse --show-toplevel)
cd "$root"
base_branch="${SCV_WORKTREE_BASE:-develop}"

git show-ref --verify --quiet "refs/heads/$base_branch" || {
  echo "Base branch '$base_branch' does not exist. Create/review the shared foundation first." >&2
  exit 1
}

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or safely preserve changes before creating a worktree." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Branch '$branch' already exists. Inspect it; refusing to reuse it automatically." >&2
  exit 1
fi

if [[ -z "$path" ]]; then
  safe_agent=$(printf '%s' "$agent" | tr -cs '[:alnum:]._-' '-')
  safe_branch=$(printf '%s' "$branch" | tr '/:' '--' | tr -cs '[:alnum:]._-' '-')
  path="$root/../SureCureVisit-${safe_agent}-${safe_branch}"
fi

if [[ -e "$path" ]]; then
  echo "Target path '$path' already exists. Inspect it; refusing to overwrite." >&2
  exit 1
fi

git worktree add -b "$branch" "$path" "$base_branch"
echo "Created worktree for $agent at $path on $branch from $base_branch"
git worktree list
