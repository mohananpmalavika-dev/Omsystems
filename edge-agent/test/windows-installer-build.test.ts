import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Native Windows installer release build", () => {
  it("verifies bundled runtime assets before and after packaging", async () => {
    const packageJson = JSON.parse(await readFile("edge-agent/package.json", "utf8"));
    const script = packageJson.scripts["build:exe"] as string;

    expect(script).toContain("verify:windows-installer-assets");
    expect(script).toContain("verify:windows-package");
  });

  it("requires every asset consumed by the native installer", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-installer-assets.mjs", "utf8");

    for (const asset of [
      "vendor/windows/ffmpeg.zip",
      "vendor/windows/mediamtx.zip",
      "vendor/windows/cloudflared.exe",
      "installer/windows/sentinel-grid.iss",
      "models/secure-face/manifest.json",
      "models/secure-face/detector.onnx",
      "models/secure-face/recognizer.onnx",
      "models/secure-face/liveness.onnx",
    ]) {
      expect(script).toContain(asset);
    }
  });

  it("does not invoke PowerShell for install, upgrade, or uninstall", async () => {
    const installer = await readFile("edge-agent/installer/windows/sentinel-grid.iss", "utf8");

    expect(installer.toLowerCase()).not.toContain("powershell");
    expect(installer).toContain("schtasks.exe");
    expect(installer).toContain("netsh.exe");
    expect(installer).toContain("StopOldAgent");
    expect(installer).toContain("UpdateConfigSetting('EDGE_AGENT_VERSION', '0.1.21')");
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

  it("requires the checksum-verified Windows release while building the control-plane image", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");

    expect(dockerfile).toContain("RUN node edge-agent/scripts/verify-windows-production-release.mjs");
    expect(dockerfile).not.toContain("verify-windows-production-release.mjs || true");
    expect(dockerfile).not.toContain("mkdir -p /app/edge-agent/build /app/edge-agent/release");
  });
});
