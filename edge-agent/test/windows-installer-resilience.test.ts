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

  it("verifies that a connected scanner remains running after installation", async () => {
    const source = await readFile(
      "edge-agent/installer/windows/install-edge-agent.ps1",
      "utf8",
    );

    expect(source).toContain('$installedTask = Get-ScheduledTask -TaskName $TaskName');
    expect(source).toContain('$connectivityHealthy -and $state -ne "Running"');
    expect(source).toContain("startup task did not remain running");
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
  });
});
