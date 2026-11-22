#!/bin/bash
# Guest (signed-out) variants of the patient specs. One pipeline at a time.
cd /c/Users/Yashwanth/fe2-int
FAILED=0
CFG=tests/e2e/fixture-all.config.ts
GUEST="@{E2E_FEP_MODE='guest'}"
for s in patient-family patient-reminders patient-reviews patient-saved; do
  for p in desktop-1280 mobile-390; do
    E2E_PORT=3320 powershell.exe -NoProfile -Command ".\.context\int3-run.ps1 -Spec $s -Projects $p -Config $CFG -ClinicalOff -Env $GUEST" 2>&1 | grep --line-buffered -E "^== |^   FAIL|SERVER FAILED"
    [ "${PIPESTATUS[0]}" -eq 0 ] || FAILED=1
  done
done
echo "exit=$FAILED"
exit $FAILED
