# fe-p: run patient records + bookings e2e in all three fixture server modes on one port (own server only).
param([int]$Port = 3384)
Set-Location C:/Users/Yashwanth/fe2-p
function Stop-Own {
  if (Test-Path ".context/server-$Port.pid") {
    $id = [int](Get-Content ".context/server-$Port.pid")
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
    if ($proc -and $proc.CommandLine -match "start -p $Port") { Stop-Process -Id $id; Start-Sleep 2 }
  }
}
$env:PLAYWRIGHT_BASE_URL = "http://localhost:$Port"
foreach ($m in @(@{ mode = "on"; fep = "session"; clin = "on" }, @{ mode = "off"; fep = "session"; clin = "off" }, @{ mode = "guest"; fep = "guest"; clin = "" })) {
  Stop-Own
  pwsh -NoProfile -File .context/fep-serve.ps1 -Mode $m.mode -Port $Port
  Start-Sleep 7
  $env:E2E_FEP_MODE = $m.fep
  $env:E2E_FEP_CLINICAL = $m.clin
  "=== mode $($m.mode)"
  npx playwright test tests/e2e/patient-records.spec.ts tests/e2e/patient-bookings.spec.ts tests/e2e/patient-family.spec.ts tests/e2e/patient-saved.spec.ts --workers=2 --reporter=line 2>&1 | Select-String -Pattern "Error:|passed|failed|skipped|flaky"
}
Stop-Own
"server stopped"
