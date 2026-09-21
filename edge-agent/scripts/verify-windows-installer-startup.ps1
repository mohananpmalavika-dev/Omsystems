[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Compiler,
  [string]$InstallerScript,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $InstallerScript) { $InstallerScript = Join-Path $scriptRoot '../installer/windows/sentinel-grid.iss' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $scriptRoot '../build/installer-startup-test' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$source = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $InstallerScript))
$code = ($source -split '\[Code\]', 2)[1]
if (-not $code.Contains('procedure InitializeWizard;') -or
    -not $code.Contains('procedure CurStepChanged(CurStep: TSetupStep);')) {
  throw 'Installer startup callbacks were not found; update the startup test before releasing.'
}
if ($code.Contains("ExpandConstant('{app}')")) {
  throw 'Installer Pascal code must never expand {app}; use WizardDirValue during setup and {srcexe} during uninstall.'
}
$code = $code.Replace('procedure InitializeWizard;', 'procedure InitializeAgentWizard;')
$code = $code.Replace('procedure CurStepChanged(CurStep: TSetupStep);', 'procedure DisabledInstallStep(CurStep: TSetupStep);')
# The probe must be deterministic even when the build workstation has a failed
# or complete Edge Agent installation. Existing-install recovery is covered by
# the source assertions; this smoke test only verifies clean wizard startup.
$code = $code.Replace('ExistingInstall := DetectExistingInstall;', 'ExistingInstall := False;')
# Run the real startup callbacks without payload files, elevation, task changes,
# or installation. Let InitializeWizard return normally, then abort from
# PrepareToInstall. This exercises Inno's application-directory initialization;
# aborting from InitializeWizard itself produced a false-positive smoke test.
$header = @"
[Setup]
AppName=Edge Installer Startup Verification
AppVersion=1
DefaultDirName={autopf}\Sentinel Grid\Edge Agent
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CreateAppDir=no
Uninstallable=no
OutputDir=$OutputDirectory
OutputBaseFilename=startup-test
[Code]
"@
$wrapper = @'
procedure InitializeWizard;
begin
  InitializeAgentWizard;
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Log('EDGE_INSTALLER_STARTUP_PASSED');
  Abort;
  Result := '';
end;
procedure CurStepChanged(CurStep: TSetupStep);
begin
  RaiseException('Startup test must never install files');
end;
'@
$probeScript = Join-Path $OutputDirectory 'startup-test.iss'
$probeLog = Join-Path $OutputDirectory 'startup-test.log'
$probeConfig = Join-Path $OutputDirectory 'edge-agent.env'
[IO.File]::WriteAllText($probeScript, $header + "`r`n" + $code + "`r`n" + $wrapper)
& $Compiler /Q $probeScript
if ($LASTEXITCODE -ne 0) { throw 'Installer startup test failed to compile.' }
[IO.File]::WriteAllText($probeConfig, @"
CONTROL_PLANE_URL="https://startup-test.invalid"
EDGE_AGENT_NAME="Installer Startup Test"
EDGE_ACTIVATION_CODE="sgact_0000000000000000000000000000000000000000"
"@)
if (Test-Path -LiteralPath $probeLog) { Remove-Item -LiteralPath $probeLog }
$probe = Start-Process -FilePath (Join-Path $OutputDirectory 'startup-test.exe') -WindowStyle Hidden -PassThru -ArgumentList @(
  '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ('/LOG="{0}"' -f $probeLog)
)
if (-not $probe.WaitForExit(30000)) {
  & "$env:SystemRoot\System32\taskkill.exe" /PID $probe.Id /T /F 2>$null | Out-Null
  throw 'Installer startup test timed out.'
}
$log = [IO.File]::ReadAllText($probeLog)
if (-not $log.Contains('EDGE_INSTALLER_STARTUP_PASSED') -or $log.Contains('before it was initialized')) {
  throw "Installer startup test failed. See $probeLog"
}
Write-Host 'Installer startup test passed (no installation performed).'
