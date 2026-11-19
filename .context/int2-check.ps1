# fe-int2 post-merge gate: typegen, tsc, lint, vitest. Prints only tails.
$ErrorActionPreference = "Continue"
npx next typegen 2>&1 | Out-Null
$tsc = npx tsc --noEmit 2>&1
"tsc exit $LASTEXITCODE"; $tsc | Select-Object -Last 15
$lint = npm run lint 2>&1
"lint exit $LASTEXITCODE"; $lint | Select-String "error|warning|problem" | Select-Object -Last 15
$vt = npx vitest run --maxWorkers=2 2>&1
"vitest exit $LASTEXITCODE"; $vt | Select-String "FAIL|Test Files|Tests |AssertionError|Error:" | Select-Object -Last 25
