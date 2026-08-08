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
});
