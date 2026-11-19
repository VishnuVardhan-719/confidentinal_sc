# fe-p (T5) fixture server for fe2-a. Usage: pwsh .context/fep2-serve.ps1 [-Port 3330] [-Stop]
param([int]$Port = 3330, [switch]$Stop)
Set-Location C:/Users/Yashwanth/fe2-a
$pidFile = ".context/server-$Port.pid"
if (Test-Path $pidFile) {
  $id = [int](Get-Content $pidFile)
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
  if ($proc -and $proc.CommandLine -match "start -p $Port") { Stop-Process -Id $id; Start-Sleep 2; "stopped $id" }
  Remove-Item $pidFile
}
if ($Stop) { return }
$env:FRONTEND_ADAPTER = "fixture"
$env:APP_ENV = "test"
$p = Start-Process -FilePath node -ArgumentList "node_modules/next/dist/bin/next", "start", "-p", "$Port" -PassThru -NoNewWindow -RedirectStandardOutput ".context/server-$Port.log" -RedirectStandardError ".context/server-$Port.err.log"
Set-Content $pidFile $p.Id
"started pid $($p.Id) port $Port"
