[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repairScript = Join-Path $PSScriptRoot "repair-installed-edge-agent.ps1"
$replacementExecutable = Join-Path $PSScriptRoot "edge-agent.exe"
$statusPath = Join-Path $env:ProgramData "Sentinel Grid\edge-agent-repair-status.json"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $PSCommandPath)
  )
  $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  exit $process.ExitCode
}

if (-not (Test-Path -LiteralPath $repairScript -PathType Leaf)) {
  throw "The repair package is incomplete: repair-installed-edge-agent.ps1 is missing."
}
if (-not (Test-Path -LiteralPath $replacementExecutable -PathType Leaf)) {
  throw "The repair package is incomplete: edge-agent.exe is missing."
}

& $repairScript `
  -SourceExecutable $replacementExecutable `
  -StatusPath $statusPath

if ($LASTEXITCODE -ne 0) {
  Write-Host "" 
  Write-Host "Sentinel Grid repair failed." -ForegroundColor Red
  Write-Host "Status: $statusPath" -ForegroundColor Yellow
  try { [void](Read-Host "Press Enter to close") } catch { }
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Sentinel Grid Edge Agent repair completed successfully." -ForegroundColor Green
Write-Host "The scanner will now stay running and reconnect automatically after network outages." -ForegroundColor Green
Write-Host "Status: $statusPath" -ForegroundColor Cyan
try { [void](Read-Host "Press Enter to close") } catch { }
