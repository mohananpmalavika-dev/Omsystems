param(
  [string]$Executable = (Join-Path $PSScriptRoot "..\..\release\edge-agent.exe"),
  [string]$ConfigPath = (Join-Path $PSScriptRoot "..\..\release\config\edge-agent.env")
)

$ErrorActionPreference = "Stop"
$resolvedExecutable = [IO.Path]::GetFullPath($Executable)
$resolvedConfig = [IO.Path]::GetFullPath($ConfigPath)
$workingDirectory = Split-Path -Parent $resolvedExecutable

if (-not (Test-Path -LiteralPath $resolvedExecutable -PathType Leaf)) {
  throw "Sentinel Grid Edge Agent executable is missing: $resolvedExecutable"
}
if (-not (Test-Path -LiteralPath $resolvedConfig -PathType Leaf)) {
  throw "Sentinel Grid Edge Agent configuration is missing: $resolvedConfig"
}

$existing = Get-CimInstance Win32_Process -Filter "Name = 'edge-agent.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.ExecutablePath -and
    [IO.Path]::GetFullPath($_.ExecutablePath).Equals($resolvedExecutable, [StringComparison]::OrdinalIgnoreCase)
  } |
  Select-Object -First 1
if ($existing) {
  Write-Output "AGENT_PID=$($existing.ProcessId)"
  exit 0
}

$process = Start-Process `
  -FilePath $resolvedExecutable `
  -ArgumentList @("--run", "--config", "`"$resolvedConfig`"") `
  -WorkingDirectory $workingDirectory `
  -WindowStyle Hidden `
  -PassThru
Write-Output "AGENT_PID=$($process.Id)"
