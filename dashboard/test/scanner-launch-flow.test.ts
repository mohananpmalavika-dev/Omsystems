import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("website scanner launch flow", () => {
  it("uses gateway readiness and installer fallback instead of an unregistered browser protocol", async () => {
    const source = await readFile("dashboard/components/device-manager.tsx", "utf8");

    expect(source).not.toContain("sentinel-grid-scanner://");
    expect(source).not.toContain("window.location.assign");
    expect(source).toContain("const scannerStartupTimeoutMs = 12_000");
    expect(source).toContain("The installed Sentinel Grid Scanner is offline");
    expect(source).toContain('"Repair scanner" : "Install scanner"');
  });

  it("opens a login prompt for discovered devices that reject saved credentials", async () => {
    const source = await readFile("dashboard/components/device-manager.tsx", "utf8");

    expect(source).toContain("const activationCandidate = mappedResults.find((camera) => camera.credentialsRequired)");
    expect(source).toContain("setCredentialActivation(activationCandidate)");
    expect(source).toContain("Device login required");
    expect(source).toContain("Enter login & password");
    expect(source).toContain("Save login & rescan");
    expect(source).toContain("cameraInventoryApi.activateDiscovery");
  });
});
