import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const edgeRoot = resolve(import.meta.dirname, "..");

describe("Windows Edge Agent native runtime staging", () => {
  it("stages and verifies every direct sharp runtime dependency", () => {
    const staging = readFileSync(resolve(edgeRoot, "scripts", "stage-windows-native-modules.mjs"), "utf8");
    const verification = readFileSync(resolve(edgeRoot, "scripts", "verify-windows-package.mjs"), "utf8");

    for (const dependency of ["sharp", "semver", "detect-libc", "@img/colour", "@img/sharp-win32-x64"]) {
      expect(staging).toContain(`"${dependency}"`);
    }
    for (const dependency of ["sharp", "semver", "detect-libc", "colour"]) {
      expect(verification).toContain(`"${dependency}"`);
    }

    const temporaryRoot = mkdtempSync(resolve(tmpdir(), "edge-native-runtime-"));
    const releaseModules = resolve(temporaryRoot, "node_modules");
    try {
      const result = spawnSync(process.execPath, [resolve(edgeRoot, "scripts", "stage-windows-native-modules.mjs")], {
        encoding: "utf8",
        env: { ...process.env, EDGE_AGENT_RELEASE_MODULES_DIR: releaseModules },
      });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      for (const dependency of ["sharp", "semver", "detect-libc", "@img/colour", "@img/sharp-win32-x64"]) {
        expect(existsSync(resolve(releaseModules, dependency, "package.json"))).toBe(true);
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
