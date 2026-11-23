#!/bin/bash
# emergency 108 copy: re-run emergency-related specs, one project per call
cd /c/Users/Yashwanth/fe2-int
FAILED=0
for spec in auth hydration-race-e emergency-e ambulance public-nav public-service-directories public service-requests; do
  for proj in desktop-1280 mobile-390; do
    E2E_PORT=3320 powershell.exe -NoProfile -Command ".\.context\int3-run.ps1 -Spec $spec -Projects $proj -Config tests/e2e/fixture-all.config.ts" 2>&1 | grep -E "^==|FAIL" || FAILED=1
  done
done
echo "DONE FAILED=$FAILED"
exit $FAILED
