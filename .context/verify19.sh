#!/bin/bash
# keyboard-lists re-check after the focus-ring test change (CodeRabbit). One pipeline at a time.
cd /c/Users/Yashwanth/fe2-int
FAILED=0
for p in desktop-1280 mobile-390; do
  E2E_PORT=3320 powershell.exe -NoProfile -Command ".\.context\int3-run.ps1 -Spec keyboard-lists -Projects $p -Config tests/e2e/fixture-all.config.ts" 2>&1 | grep --line-buffered -E "^== |^   FAIL|SERVER FAILED"
  [ "${PIPESTATUS[0]}" -eq 0 ] || FAILED=1
done
echo "exit=$FAILED"
