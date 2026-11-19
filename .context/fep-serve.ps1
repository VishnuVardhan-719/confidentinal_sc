# fe-p fixture server. Usage: pwsh .context/fep-serve.ps1 -Mode on|off|guest -Port 3384
param([string]$Mode = "on", [int]$Port = 3384)
$env:FRONTEND_ADAPTER = "fixture"
$env:APP_ENV = "test"
Remove-Item Env:FIXTURE_PATIENT_SESSION, Env:FEATURE_CLINICAL, Env:FIXTURE_NOTIFICATION_SCENARIO, Env:FIXTURE_BOOKING_SCENARIO, Env:FIXTURE_FAMILY_SCENARIO -ErrorAction SilentlyContinue
if ($Mode -ne "guest") { $env:FIXTURE_PATIENT_SESSION = "self"; $env:FIXTURE_BOOKING_SCENARIO = "requested" }
if ($Mode -eq "on") { $env:FEATURE_CLINICAL = "true" }
if ($Mode -eq "off") { $env:FIXTURE_NOTIFICATION_SCENARIO = "empty"; $env:FIXTURE_FAMILY_SCENARIO = "empty" }
Set-Location C:/Users/Yashwanth/fe2-p
$p = Start-Process -FilePath node -ArgumentList "node_modules/next/dist/bin/next", "start", "-p", "$Port" -PassThru -NoNewWindow -RedirectStandardOutput ".context/server-$Port.log" -RedirectStandardError ".context/server-$Port.err.log"
Set-Content ".context/server-$Port.pid" $p.Id
"started pid $($p.Id) mode $Mode port $Port"
