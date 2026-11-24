#!/bin/bash
cd /c/Users/Yashwanth/fe2-int
L="$TEMP/verify23.log"; : > "$L"
npx tsc --noEmit -p . >> "$L" 2>&1; echo "TSC_EXIT=$?" >> "$L"
npx eslint src tests/unit tests/e2e/provider-approval.spec.ts >> "$L" 2>&1; echo "ESLINT_EXIT=$?" >> "$L"
npx vitest run --maxWorkers=2 > "$L.unit" 2>&1; echo "UNIT_EXIT=$?" >> "$L"; grep -E "FAIL|Error|Test Files|Tests " "$L.unit" >> "$L"; echo "UNIT_DONE" >> "$L"
FRONTEND_ADAPTER=fixture APP_ENV=test FEATURE_CLINICAL=true NEXT_TELEMETRY_DISABLED=1 npx next build 2>&1 | grep -E "rror|Failed|Compiled" >> "$L"; echo "BUILD_EXIT=${PIPESTATUS[0]}" >> "$L"
echo "GATE_DONE" >> "$L"
