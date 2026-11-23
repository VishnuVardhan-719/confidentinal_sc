#!/bin/bash
# usage: e2e-seq.sh "<spec>:<project>" ["<spec>:<project>" ...]  (one quoted pair per argument)
cd /c/Users/Yashwanth/fe2-int
: > "$TEMP/e2e-seq.log"
for item in "$@"; do
  spec="${item%%:*}"; proj="${item##*:}"
  E2E_PORT=3320 powershell.exe -NoProfile -Command ".\.context\int3-run.ps1 -Spec $spec -Projects $proj -Config tests/e2e/fixture-all.config.ts" 2>&1 | grep -E "^==|FAIL" >> "$TEMP/e2e-seq.log"
done
echo "SEQ_DONE" >> "$TEMP/e2e-seq.log"
