# fe-int2: start the built integration app (synthetic fixture adapter). PID -> .context/server-<port>.pid
# usage: powershell -NoProfile -File .context/int2-serve.ps1 [-Port 3320] [-Scenario accepted] [-Clinical true]
param([int]$Port = 3320, [string]$Scenario = "accepted", [string]$Clinical = "true")
$env:FRONTEND_ADAPTER = "fixture"
$env:APP_ENV = "test"
$env:FEATURE_CLINICAL = $Clinical
$env:FIXTURE_BOOKING_SCENARIO = $Scenario
$env:NEXT_TELEMETRY_DISABLED = "1"
$log = Join-Path $env:TEMP "int2-server-$Port.log"
$p = Start-Process -FilePath "node" -ArgumentList "node_modules/next/dist/bin/next", "start", "--port", "$Port" -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -WindowStyle Hidden
$p.Id | Set-Content ".context/server-$Port.pid"
"started pid $($p.Id)"
