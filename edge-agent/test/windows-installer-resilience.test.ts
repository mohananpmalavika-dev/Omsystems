import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Windows scanner installer resilience", () => {
  it("registers the startup task before a non-fatal connectivity diagnosis", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );
    const taskRegistration = source.indexOf("Register-ScheduledTask");
    const connectivityDiagnosis = source.indexOf("--diagnose");

    expect(taskRegistration).toBeGreaterThan(-1);
    expect(connectivityDiagnosis).toBeGreaterThan(taskRegistration);
    expect(source).toContain("background task will keep retrying automatically");
    expect(source).not.toContain("The startup task was not installed");
  });

  it("restores a previous gateway identity when repair authentication cannot create a replacement", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );
    const stopExistingTask = source.indexOf("Stop-ScheduledTask");
    const copyExecutable = source.indexOf("Copy-Item -LiteralPath $SourceExecutable");
    const archiveIdentity = source.indexOf("Move-Item -LiteralPath $identityFile");
    const connectivityDiagnosis = source.indexOf("--diagnose");

    expect(stopExistingTask).toBeGreaterThan(-1);
    expect(stopExistingTask).toBeLessThan(copyExecutable);
    expect(source).toContain('Join-Path $DataDirectory "device-identity.enc"');
    expect(source).toContain('Join-Path $DataDirectory "device-identity.key"');
    expect(source).toContain('Join-Path $DataDirectory "identity-archive"');
    expect(archiveIdentity).toBeGreaterThan(copyExecutable);
    expect(archiveIdentity).toBeLessThan(connectivityDiagnosis);
    expect(source).not.toContain("Remove-Item -LiteralPath $identityFile");
    expect(source).toContain('$newIdentityFiles.Count -lt $identityFiles.Count');
    expect(source).toContain('Move-Item -LiteralPath $archivedIdentityFile -Destination $identityFile -Force');
    expect(source).toContain("The previous encrypted scanner identity was restored");
  });

  it("accepts an already-used installer when its restored identity is still valid", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );
    const restoreIdentity = source.indexOf("$restoredPreviousIdentity = $true");
    const retryDiagnostic = source.indexOf("$restoredDiagnosticOutput = @(& $Executable --config $ConfigPath --diagnose 2>&1)");
    const clearTerminalFailure = source.indexOf("$terminalDiagnosticFailure = $null", retryDiagnostic);
    const startTask = source.indexOf("Start-ScheduledTask -TaskName $TaskName", retryDiagnostic);

    expect(source).toContain("$activationWasInvalid -and $restoredPreviousIdentity");
    expect(restoreIdentity).toBeGreaterThan(-1);
    expect(retryDiagnostic).toBeGreaterThan(restoreIdentity);
    expect(clearTerminalFailure).toBeGreaterThan(retryDiagnostic);
    expect(startTask).toBeGreaterThan(clearTerminalFailure);
    expect(source).toContain("continuing the repair without re-enrollment");
  });

  it("drains the installed agent process tree before replacing runtime files", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );
    const stopTask = source.indexOf("Stop-ScheduledTask -TaskName $TaskName");
    const drainProcesses = source.indexOf("Stop-InstalledAgentProcesses $InstallDirectory");
    const copyExecutable = source.indexOf("Copy-Item -LiteralPath $SourceExecutable -Destination $Executable -Force");

    expect(source).toContain("[IO.Path]::GetFullPath($processPath).StartsWith($fullRoot");
    expect(source).toContain("Stop-Process -Id $process.Id -Force");
    expect(stopTask).toBeGreaterThan(-1);
    expect(drainProcesses).toBeGreaterThan(stopTask);
    expect(copyExecutable).toBeGreaterThan(drainProcesses);
  });

  it("prevents the old scheduled task from restarting during repair and rolls it back on failure", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );
    const disableTask = source.indexOf("Disable-ScheduledTask -TaskName $TaskName");
    const drainProcesses = source.indexOf("Stop-InstalledAgentProcesses $InstallDirectory");
    const enableOnFailure = source.indexOf("Enable-ScheduledTask -TaskName $TaskName");

    expect(source).toContain("$RestoreExistingTaskOnFailure = $true");
    expect(source).toContain("$RestoreExistingTaskOnFailure = $false");
    expect(disableTask).toBeGreaterThan(-1);
    expect(drainProcesses).toBeGreaterThan(disableTask);
    expect(enableOnFailure).toBeGreaterThan(-1);
    expect(source.indexOf("Start-ScheduledTask -TaskName $TaskName", enableOnFailure)).toBeGreaterThan(enableOnFailure);
  });

  it("verifies that a connected scanner remains running after installation", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );

    expect(source).toContain('$installedTask = Get-ScheduledTask -TaskName $TaskName');
    expect(source).toContain('$connectivityHealthy -and $state -ne "Running"');
    expect(source).toContain('$startupTimeoutSeconds = 60');
    expect(source).toContain('while ((Get-Date) -lt $startupDeadline)');
    expect(source).toContain("did not enter Running within");
    expect(source).not.toContain("Start-Sleep -Seconds 5");
  });

  it("writes Windows dependency paths without dotenv escape corruption", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );

    expect(source).toContain("$Value = $Value.Replace('\\', '/')");
    expect(source).toContain('Set-ConfigValue $ConfigPath "MEDIAMTX_PATH"');
  });

  it("starts the scanner task on battery as well as AC power", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );

    expect(source).toContain("-AllowStartIfOnBatteries");
    expect(source).toContain("-DontStopIfGoingOnBatteries");
    expect(source).toContain("-RestartInterval (New-TimeSpan -Minutes 1)");
    expect(source).toContain("-MultipleInstances IgnoreNew");
    expect(source).not.toContain("-RestartInterval (New-TimeSpan -Seconds 10)");
  });

  it("keeps activation and installation failures visible without exposing the one-time code", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );

    expect(source).toContain("Press Enter to close this installer");
    expect(source).toContain("sgact_[redacted]");
    expect(source).toContain("activation_invalid_or_expired");
    expect(source).toContain("device_already_enrolled");
    expect(source).toContain("background task will keep retrying automatically");
    expect(source).toContain('$previousErrorActionPreference = $ErrorActionPreference');
    expect(source).toContain('$ErrorActionPreference = "Continue"');
  });
});
