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
    expect(source).toContain("async function openPendingCredentials()");
    expect(source).toContain("const response = await cameraInventoryApi.listDiscovered(selectedBranch)");
    expect(source).toContain("onProvideCredentials={() => void openPendingCredentials()}");
    expect(source).toContain("const credentialCandidates = discoveries.filter((camera) => camera.credentialsRequired)");
    expect(source).toContain("Device login required");
    expect(source).toContain("Enter login & password");
    expect(source).toContain("Save & verify this device");
    expect(source).toContain("discoveryModelLabel(credentialActivation)");
    expect(source).toContain("discoveryDeviceTypeLabel(credentialActivation)");
    expect(source).toContain("IP address:");
    expect(source).toContain("Model:");
    expect(source).toContain("Type:");
    expect(source).toContain("No broadcast discovery, subnet scan, or other camera probe will run.");
    expect(source).toContain('job.scope !== "device" && readyToProvision');
    expect(source).toContain("cameraInventoryApi.activateDiscovery");
  });

  it("keeps pending-camera data when another branch panel fails to load", async () => {
    const source = await readFile("dashboard/components/device-manager.tsx", "utf8");

    expect(source).toContain("await Promise.allSettled([");
    expect(source).toContain('if (discoveredResult.status === "fulfilled")');
    expect(source).toContain("setDiscoveredCameras(discoveredResult.value.data)");
    expect(source).toContain("Loading devices that require credentials");
  });

  it("scopes gateway credentials to one camera or recorder address", async () => {
    const source = await readFile("dashboard/components/camera-credential-manager.tsx", "utf8");

    expect(source).toContain("cameraIp: cameraIp.trim()");
    expect(source).toContain("This login is used only for this address");
    expect(source).not.toContain("Branch default");
  });
});
