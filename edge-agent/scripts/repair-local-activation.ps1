[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$PackageConfigPath
)

$ErrorActionPreference = 'Stop'
$installRoot = 'C:\Program Files\Sentinel Grid\Edge Agent'
$configPath = Join-Path $installRoot 'config\edge-agent.env'
$identityPath = Join-Path $installRoot 'data\device-identity.enc'
$identityKeyPath = Join-Path $installRoot 'data\device-identity.key'
$agentPath = Join-Path $installRoot 'edge-agent.exe'
$taskName = 'Sentinel Grid Edge Agent'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this repair script from an elevated Administrator PowerShell window.'
}
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $agentPath -PathType Leaf)) {
  throw 'The Sentinel Grid Edge Agent installation was not found.'
}
if ((Test-Path -LiteralPath $identityPath) -or (Test-Path -LiteralPath $identityKeyPath)) {
  throw 'An encrypted device identity already exists. Do not replace its activation code; diagnose the enrolled agent instead.'
}

function Get-Setting([string]$Content, [string]$Key) {
  $match = [regex]::Match($Content, '(?m)^' + [regex]::Escape($Key) + '=(.*)$')
  if (-not $match.Success) { return '' }
  return $match.Groups[1].Value.Trim().Trim('"')
}

$installedConfig = [IO.File]::ReadAllText($configPath)
$packageConfig = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $PackageConfigPath))
$oldName = Get-Setting $installedConfig 'EDGE_AGENT_NAME'
$newName = Get-Setting $packageConfig 'EDGE_AGENT_NAME'
$oldUrl = Get-Setting $installedConfig 'CONTROL_PLANE_URL'
$newUrl = Get-Setting $packageConfig 'CONTROL_PLANE_URL'
$newCode = Get-Setting $packageConfig 'EDGE_ACTIVATION_CODE'

if (-not $oldName -or $oldName -ne $newName -or -not $oldUrl -or $oldUrl -ne $newUrl) {
  throw 'The fresh package does not match the installed scanner name and control-plane URL.'
}
if ($newCode -notmatch '^sgact_[A-Za-z0-9_-]{40,194}$') {
  throw 'The fresh package does not contain a valid Edge Agent activation code.'
}
if ($newCode -eq (Get-Setting $installedConfig 'EDGE_ACTIVATION_CODE')) {
  throw 'This package contains the same failed activation code. Download a new Repair package.'
}
if ((Get-Setting $installedConfig 'EDGE_IDENTITY_PATH') -and
    (Get-Setting $installedConfig 'EDGE_IDENTITY_PATH') -notin @('./data/device-identity.enc', ($identityPath -replace '\', '/'))) {
  throw 'This installation uses a custom identity path; automatic activation repair was not attempted.'
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskName $taskName }
$backupPath = Join-Path (Split-Path -Parent $configPath) ('edge-agent.env.pre-repair-' + (Get-Date -Format 'yyyyMMddHHmmss'))
Copy-Item -LiteralPath $configPath -Destination $backupPath -ErrorAction Stop
Set-Acl -LiteralPath $backupPath -AclObject (Get-Acl -LiteralPath $configPath)

try {
  $replacement = 'EDGE_ACTIVATION_CODE="' + $newCode + '"'
  $updatedConfig = [regex]::Replace(
    $installedConfig,
    '(?m)^EDGE_ACTIVATION_CODE=.*$',
    [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement }
  )
  if ($updatedConfig -eq $installedConfig) {
    throw 'The installed configuration has no EDGE_ACTIVATION_CODE setting.'
  }
  [IO.File]::WriteAllText($configPath, $updatedConfig, [Text.UTF8Encoding]::new($false))

  $diagnostic = @(& $agentPath --config $configPath --diagnose 2>&1)
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $identityPath) -or
      -not (Test-Path -LiteralPath $identityKeyPath)) {
    $safeDiagnostic = (($diagnostic | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine) `
      -replace 'sgact_[A-Za-z0-9_-]+', 'sgact_[redacted]'
    throw "Enrollment did not complete. $safeDiagnostic"
  }

  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 5
  $state = (Get-ScheduledTask -TaskName $taskName).State
  if ($state -ne 'Running') {
    throw "Enrollment succeeded, but the startup task is $state. Inspect the Edge Agent log."
  }
  Write-Host 'Edge Agent enrolled and running. The dashboard should update after the next heartbeat.'
  Write-Host "Previous protected configuration retained at $backupPath"
} catch {
  if (-not (Test-Path -LiteralPath $identityPath) -and
      -not (Test-Path -LiteralPath $identityKeyPath)) {
    Copy-Item -LiteralPath $backupPath -Destination $configPath -Force
  }
  throw
}
