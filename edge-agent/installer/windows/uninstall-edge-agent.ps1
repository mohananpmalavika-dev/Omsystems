[CmdletBinding()]
param(
  [string]$InstallDirectory = (Join-Path $env:ProgramFiles "Sentinel Grid\Edge Agent"),
  [switch]$PurgeData
)

$ErrorActionPreference = "Stop"
$TaskName = "Sentinel Grid Edge Agent"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this uninstaller from an Administrator PowerShell window."
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

if ($PurgeData -and (Test-Path -LiteralPath $InstallDirectory)) {
  $resolvedTarget = (Resolve-Path -LiteralPath $InstallDirectory).Path.TrimEnd('\')
  $programFilesRoot = (Resolve-Path -LiteralPath $env:ProgramFiles).Path.TrimEnd('\')
  if (-not $resolvedTarget.StartsWith("$programFilesRoot\", [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedTarget -Leaf) -ne "Edge Agent") {
    throw "Refusing to purge unexpected path: $resolvedTarget"
  }
  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
  Write-Host "Startup task and local agent data removed." -ForegroundColor Green
} else {
  Write-Host "Startup task removed. Agent files and logs were retained at $InstallDirectory." -ForegroundColor Green
  Write-Host "Run again with -PurgeData to remove them."
}
