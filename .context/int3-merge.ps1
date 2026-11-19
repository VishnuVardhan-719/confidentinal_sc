# fe-int2 INT3: merge advanced branch heads one by one. Docs: keep both sides; message JSON:
# deep-merge (prefer the merged branch on leaf conflicts). Stops on any other conflict.
param([string[]]$Branches)
foreach ($b in $Branches) {
  $tip = git rev-parse --short "feat/fe2-$b"
  if ((git rev-list --count "HEAD..feat/fe2-$b") -eq "0") { "== $b up to date"; continue }
  git merge --no-ff "feat/fe2-$b" -m "Merge branch 'feat/fe2-$b' ($tip) into feat/fe2-integration" 2>&1 | Out-Null
  $u = @(git diff --name-only --diff-filter=U)
  $docs = $u | Where-Object { $_ -match '\.md$' }
  $json = $u | Where-Object { $_ -match '^src/messages/.*\.json$' }
  $other = $u | Where-Object { $_ -notmatch '\.md$' -and $_ -notmatch '^src/messages/.*\.json$' }
  if ($docs) { node .context/union-resolve.mjs @docs | Out-Null }
  if ($json) { node .context/json-merge.mjs theirs @json }
  "== $b $tip docs:$($docs.Count) json:$($json.Count) other: $($other -join ', ')"
  if ($other) { "STOP: resolve manually"; break }
  git add -A
  $tsc = npx tsc --noEmit 2>&1; $code = $LASTEXITCODE; $tsc | Select-Object -First 8
  if ($code -ne 0) { "STOP: tsc failed (merge staged, not committed)"; break }
  git commit -q -m "Merge branch 'feat/fe2-$b' ($tip) into feat/fe2-integration" -m "Docs kept both sides; message JSON deep-merged. tsc clean." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
  git log --oneline -1
}
