import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Windows self-installer release build", () => {
  it("verifies bundled runtime assets before and after packaging", async () => {
    const packageJson = JSON.parse(await readFile("edge-agent/package.json", "utf8"));
    const script = packageJson.scripts["build:exe"] as string;

    expect(script).toContain("verify:windows-installer-assets");
    expect(script).toContain("verify:windows-package");
  });

  it("requires every asset copied by the self-installer", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-installer-assets.mjs", "utf8");

    for (const asset of [
      "vendor/windows/ffmpeg.zip",
      "vendor/windows/mediamtx.zip",
      "vendor/windows/cloudflared.exe",
      "installer/windows/install-edge-agent.ps1",
      "installer/windows/uninstall-edge-agent.ps1",
      "installer/windows/open-dashboard-scan.ps1",
    ]) {
      expect(script).toContain(asset);
    }
  });

  it("does not execute a cross-compiled Windows EXE on the Linux control-plane image", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-package.mjs", "utf8");

    expect(script).toContain('process.platform !== "win32"');
    expect(script).toContain("--verify-bundle");
  });

  it("writes a signed-release manifest for production installer verification", async () => {
    const script = await readFile("edge-agent/scripts/build-signed-windows-release.ps1", "utf8");

    expect(script).toContain("windows-release.json");
    expect(script).toContain("signerThumbprint");
    expect(script).toContain("installerSha256");
  });

  it("has a container-safe production release verifier", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-production-release.mjs", "utf8");

    expect(script).toContain("windows-release.json");
    expect(script).toContain("edge-agent.exe");
    expect(script).toContain("sha256");
  });
});
