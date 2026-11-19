# fe-int2: start the built integration app on :3320 (synthetic fixture adapter). PID -> .context/server-3320.pid
$env:FRONTEND_ADAPTER = "fixture"
$env:APP_ENV = "test"
$env:FEATURE_CLINICAL = "true"
$env:FIXTURE_BOOKING_SCENARIO = "accepted"
$env:NEXT_TELEMETRY_DISABLED = "1"
$log = Join-Path $env:TEMP "int2-server.log"
$p = Start-Process -FilePath "node" -ArgumentList "node_modules/next/dist/bin/next", "start", "--port", "3320" -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -WindowStyle Hidden
$p.Id | Set-Content .context/server-3320.pid
"started pid $($p.Id)"
