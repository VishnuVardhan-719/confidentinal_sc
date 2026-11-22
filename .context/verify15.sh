#!/bin/bash
# Sequential per-spec e2e pipeline (one at a time, port 3320). Output: $TEMP/verify15.out
cd /c/Users/Yashwanth/fe2-int
CFG=tests/e2e/fixture-all.config.ts
for s in public-service-directories lab-directory public-directory-smoke admin-verification a11y-sweep-c; do
  for p in desktop-1280 mobile-390; do
    E2E_PORT=3320 powershell.exe -NoProfile -File .context/int3-run.ps1 -Spec $s -Projects $p -Config $CFG 2>&1 | grep --line-buffered -E "^== |^   FAIL|SERVER FAILED"
  done
done
for s in a11y-sweep-p patient-family patient-reminders patient-reviews patient-review-changes patient-saved; do
  for p in desktop-1280 mobile-390; do
    E2E_PORT=3320 powershell.exe -NoProfile -Command ".\.context\int3-run.ps1 -Spec $s -Projects $p -Config $CFG -Env @{E2E_FEP_MODE='session';E2E_FEP_CLINICAL='on'}" 2>&1 | grep --line-buffered -E "^== |^   FAIL|SERVER FAILED"
  done
done
echo "exit=0"
