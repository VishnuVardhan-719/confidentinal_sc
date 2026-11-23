#!/usr/bin/env bash
# About page + logo gate: tsc, unit, build, then e2e (one project at a time).
cd /c/Users/Yashwanth/fe2-int
L="$TEMP/verify21.log"; : > "$L"
echo "== tsc" >> "$L"; npx next typegen >/dev/null 2>&1; npx tsc --noEmit -p . >> "$L" 2>&1; T=$?; echo "tsc_exit=$T" >> "$L"
echo "== unit" >> "$L"; npx vitest run --maxWorkers=2 2>&1 | tail -8 >> "$L"
echo "== build" >> "$L"
FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true NEXT_TELEMETRY_DISABLED=1 npx next build > "$TEMP/build-about2.log" 2>&1; B=$?; echo "build_exit=$B" >> "$L"
FAILED=$((T!=0)); [ $B -ne 0 ] && FAILED=$((FAILED+1))
for spec in leadership public-nav public a11y public-a11y a11y-sweep-e; do
  for proj in desktop-1280 mobile-390; do
    out=$(E2E_PORT=3320 powershell.exe -NoProfile -Command ".\.context\int3-run.ps1 -Spec $spec -Projects $proj -Config tests/e2e/fixture-all.config.ts" 2>&1)
    echo "$out" | grep -E "^==|FAIL" >> "$L"
    echo "$out" | grep -qE "failed|SERVER FAILED" && FAILED=$((FAILED+1))
  done
done
echo "DONE FAILED=$FAILED" >> "$L"
[ "$FAILED" -eq 0 ]
