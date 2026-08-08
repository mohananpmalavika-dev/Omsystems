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

  it("archives a previous gateway identity before repair authentication", async () => {
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
  });
});
