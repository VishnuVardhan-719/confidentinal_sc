#!/bin/bash
# Build a production-style pre-launch bundle (no backend) and run tests/e2e/prelaunch.pl.ts on :3330.
cd /c/Users/Yashwanth/fe2-int
LOG="$TEMP/prelaunch-run.log"; : > "$LOG"
export APP_ENV=production LAUNCH_MODE=prelaunch FRONTEND_ADAPTER=http NEXT_TELEMETRY_DISABLED=1
unset FEATURE_CLINICAL FIXTURE_BOOKING_SCENARIO
echo "== build" >> "$LOG"
npx next build > "$TEMP/prelaunch-build.log" 2>&1; echo "BUILD_EXIT=$?" >> "$LOG"
tail -5 "$TEMP/prelaunch-build.log" >> "$LOG"
node node_modules/next/dist/bin/next start --port 3330 > "$TEMP/prelaunch-server.log" 2>&1 &
SP=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:3330/en && break; sleep 2; done
npx playwright test --config tests/e2e/prelaunch.config.ts 2>&1 | grep -E "✓|✘|passed|failed|Error|expect|Expected|Received" | head -60 >> "$LOG"
kill $SP 2>/dev/null
echo "PL_DONE" >> "$LOG"
