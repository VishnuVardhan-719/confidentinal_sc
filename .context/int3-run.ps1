# fe-int2 INT3: run one e2e spec against a FRESH :3320 server per project (synthetic fixture adapter).
# Usage: .context/int3-run.ps1 -Spec booking-journey -Projects mobile-390,desktop-1280 [-Env @{K="V"}] [-Grep "..."] [-ClinicalOff]
param([string]$Spec, [string[]]$Projects, [hashtable]$Env = @{}, [string]$Grep = "", [switch]$ClinicalOff)
$base = @{ FRONTEND_ADAPTER = "fixture"; APP_ENV = "test"; NEXT_TELEMETRY_DISABLED = "1"; FEATURE_CLINICAL = "true"; FIXTURE_BOOKING_SCENARIO = "accepted" }
foreach ($k in $Env.Keys) { $base[$k] = $Env[$k] }
if ($ClinicalOff) { $base.Remove("FEATURE_CLINICAL") }
$log = Join-Path $env:TEMP "int3-server.log"
foreach ($project in $Projects) {
  $old = Get-Content .context/server-3320.pid -ErrorAction SilentlyContinue
  if ($old) { Stop-Process -Id $old -ErrorAction SilentlyContinue; Start-Sleep 2 }
  foreach ($k in @("FEATURE_CLINICAL", "FIXTURE_BOOKING_SCENARIO", "FIXTURE_PROVIDER_RESPONSE_MS", "FIXTURE_NOTIFICATION_SCENARIO")) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
  foreach ($k in $base.Keys) { Set-Item "Env:$k" $base[$k] }
  $p = Start-Process -FilePath "node" -ArgumentList "node_modules/next/dist/bin/next", "start", "--port", "3320" -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru -WindowStyle Hidden
  $p.Id | Set-Content .context/server-3320.pid
  $ok = $false
  for ($i = 0; $i -lt 60 -and -not $ok; $i++) { Start-Sleep 2; try { $ok = (Invoke-WebRequest http://localhost:3320/en -UseBasicParsing -TimeoutSec 20).StatusCode -eq 200 } catch { } }
  if (-not $ok) { "SERVER FAILED"; break }
  $env:PLAYWRIGHT_BASE_URL = "http://localhost:3320"
  if ($ClinicalOff) { $env:E2E_CLINICAL = "off" } else { Remove-Item Env:E2E_CLINICAL -ErrorAction SilentlyContinue }
  $args2 = @("playwright", "test", "tests/e2e/$Spec.spec.ts", "--project", $project, "--workers", "1", "--reporter", "line")
  if ($Grep) { $args2 += @("--grep", $Grep) }
  $out = npx @args2 2>&1
  $summary = $out | Select-String "^\s+\d+ (passed|failed|skipped|flaky|did not run)" | ForEach-Object { $_.Line.Trim() }
  "== $Spec [$project]$(if ($ClinicalOff) {' clinical-off'}) : $($summary -join ', ')"
  $out | Select-String "^\s+\d+\) \[" | ForEach-Object { "   FAIL " + $_.Line.Trim().Substring(0, [Math]::Min(200, $_.Line.Trim().Length)) }
  $out | Set-Content (Join-Path $env:TEMP "int3-$Spec-$project$(if ($ClinicalOff) {'-off'}).log")
}
