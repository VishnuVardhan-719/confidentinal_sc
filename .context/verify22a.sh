#!/bin/bash
cd /c/Users/Yashwanth/fe2-int
L="$TEMP/verify22a.log"; : > "$L"
npx next typegen >> "$L" 2>&1
npx tsc --noEmit -p . >> "$L" 2>&1; echo "TSC_EXIT=$?" >> "$L"
npx eslint src/modules/auth src/modules/onboarding src/modules/verification "src/app/[locale]/workspace" src/components/onboarding tests/unit/modules-identity tests/e2e/provider-approval.spec.ts tests/e2e/onboarding.spec.ts tests/e2e/leadership.spec.ts src/components/public/leadership.ts >> "$L" 2>&1; echo "ESLINT_EXIT=$?" >> "$L"
