param(
  [string]$RequestUri,
  [switch]$RepairStartupTask
)

$ErrorActionPreference = "Stop"
$taskName = "Sentinel Grid Edge Agent"
$serviceNames = @("KryptonVisionEdgeAgent", "SentinelGridEdgeAgent")
$executable = Join-Path $PSScriptRoot "edge-agent.exe"
$configPath = Join-Path $PSScriptRoot "config\edge-agent.env"

function Register-EdgeStartupTask {
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Sentinel Grid Edge Agent executable is missing. Run Repair scanner from Sentinel Grid."
  }
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Sentinel Grid Edge Agent configuration is missing. Run Repair scanner from Sentinel Grid."
  }

  $action = New-ScheduledTaskAction `
    -Execute $executable `
    -Argument "--run --config `"$configPath`"" `
    -WorkingDirectory $PSScriptRoot
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Sentinel Grid branch camera, recorder, storage and network monitoring agent" `
    -Force | Out-Null
}

try {
  if ($RepairStartupTask) {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      throw "Administrator approval is required to repair the Sentinel Grid startup task."
    }
    Register-EdgeStartupTask
    Start-ScheduledTask -TaskName $taskName
    exit 0
  }

  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    if ($task.State -ne "Running") {
      Start-ScheduledTask -TaskName $taskName
    }
    exit 0
  }

  foreach ($serviceName in $serviceNames) {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service) {
      if ($service.Status -ne "Running") {
        Start-Service -Name $serviceName
      }
      exit 0
    }
  }

  # The files can remain installed even when endpoint cleanup software removes
  # the startup task. Repair it only after an explicit operator activation;
  # this path is never invoked automatically by web login.
  if ((Test-Path -LiteralPath $executable -PathType Leaf) -and
      (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    $powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $arguments = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-File", "`"$PSCommandPath`"",
      "-RepairStartupTask"
    )
    $repair = Start-Process `
      -FilePath $powerShell `
      -ArgumentList $arguments `
      -Verb RunAs `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    exit $repair.ExitCode
  }

  throw "Sentinel Grid Scanner is not installed on this computer. Run Install Branch Gateway first."
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
