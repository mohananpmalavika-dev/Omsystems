import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Windows self-installer release build", () => {
  it("verifies bundled runtime assets before and after packaging", async () => {
    const packageJson = JSON.parse(await readFile("edge-agent/package.json", "utf8"));
    const script = packageJson.scripts["build:exe"] as string;

    expect(script).toContain("verify:windows-installer-assets");
    expect(script).toContain("release\\edge-agent.exe --verify-bundle");
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
});
