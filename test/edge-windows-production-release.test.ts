import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerEdgeAgentPackageRoutes } from "../src/routes/edge-agent-package.routes.js";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const roots: string[] = [];
const executable = Buffer.from("MZ-release-test-fixture");
const nativeInstaller = Buffer.from("MZ-native-installer");
const installerSource = "; edge installer fixture\n";
const manifest = {
  sha256: createHash("sha256").update(executable).digest("hex"),
  installerFile: "KryptonVisionInstaller-v1.0.0-windows.exe",
  installerSha256: createHash("sha256").update(nativeInstaller).digest("hex"),
  installerSourceSha256: createHash("sha256").update(installerSource).digest("hex"),
  signedAt: "2026-09-13T00:00:00.000Z",
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(manifestText?: string, binary?: Buffer) {
  const root = await mkdtemp(join(tmpdir(), "edge-release-verification-"));
  roots.push(root);
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "release"));
  await mkdir(join(root, "installer", "windows", "output"), { recursive: true });
  const script = join(root, "scripts", "verify-windows-production-release.mjs");
  await copyFile(new URL("../edge-agent/scripts/verify-windows-production-release.mjs", import.meta.url), script);
  if (manifestText !== undefined) await writeFile(join(root, "release", "windows-release.json"), manifestText);
  if (binary !== undefined) await writeFile(join(root, "release", "edge-agent.exe"), binary);
  await writeFile(join(root, "installer", "windows", "sentinel-grid.iss"), installerSource);
  await writeFile(join(root, "installer", "windows", "output", "KryptonVisionInstaller-v1.0.0-windows.exe"), nativeInstaller);
  await writeFile(join(root, "release", "OM-Systems-Sentinel-Grid-Signing.cer"), Buffer.from("public-self-signed-certificate"));
  return script;
}

describe("Windows production release build verification", () => {
  it("accepts an unsigned release with a matching checksum manifest", async () => {
    const script = await fixture(JSON.stringify({ ...manifest, signing: "unsigned" }), executable);
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });
  it("verifies a release supplied outside the checkout for GCP upload", async () => {
    const script = await fixture(JSON.stringify(manifest), executable);
    const root = dirname(dirname(script));
    const suppliedRelease = join(root, "uploaded release");
    await rename(join(root, "release"), suppliedRelease);
    const result = spawnSync(process.execPath, [script, suppliedRelease], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });

  it.each(["", "\uFEFF"])("serves a production package with manifest prefix %j", async (prefix) => {
    const script = await fixture(prefix + JSON.stringify(manifest), executable);
    const root = dirname(dirname(script));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
    vi.stubEnv("NODE_ENV", "production");
    const app = Fastify();
    app.addHook("onRequest", async (request) => {
      request.currentUser = { id: "test-user" } as typeof request.currentUser;
    });
    const store = {
      getNode: async () => ({ id: "branch", type: "branch", name: "Test", tenantId: "tenant" }),
      checkAccess: async () => ({ allowed: true }),
      listEdgeAgentsByBranch: async () => [{ id: "agent", branchId: "branch", name: "Test" }],
      writeAudit: async () => {},
    } as unknown as Parameters<typeof registerEdgeAgentPackageRoutes>[1];
    try {
      await registerEdgeAgentPackageRoutes(app, store, {
        artifactRoot: root,
        controlPlanePublicUrl: "https://control.example.com",
        edgeBridgeSharedKey: "test-key",
      });
      const response = await app.inject("/v1/branches/branch/edge-agents/agent/package?platform=windows");
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/zip");
    } finally {
      await app.close();
    }
  });

  it.each([
    ["matching release", JSON.stringify(manifest), executable, 200, undefined],
    ["release missing native-installer binding", JSON.stringify({ sha256: manifest.sha256 }), executable, 503, "edge_agent_native_installer_not_built"],
    ["empty executable", JSON.stringify(manifest), Buffer.alloc(0), 503, "edge_agent_executable_not_built"],
    ["missing executable", JSON.stringify(manifest), undefined, 503, "edge_agent_executable_not_built"],
    ["missing manifest", undefined, executable, 503, "edge_agent_windows_release_unavailable"],
    ["mismatched executable", JSON.stringify(manifest), Buffer.from("MZ-sentinel-edge-agent-placeholder\n"), 503, "edge_agent_windows_release_unavailable"],
  ])("validates the activation installer with %s", async (_name, manifestText, binary, expectedStatus, expectedError) => {
    const script = await fixture(manifestText as string | undefined, binary as Buffer | undefined);
    const root = dirname(dirname(script));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
    vi.stubEnv("NODE_ENV", "production");
    const app = Fastify();
    app.addHook("onRequest", async (request) => {
      request.currentUser = { id: "test-user" } as typeof request.currentUser;
    });
    const writeAudit = vi.fn();
    const store = {
      getNode: async () => ({ id: "branch", type: "branch", name: "Test", tenantId: "tenant" }),
      checkAccess: async () => ({ allowed: true }),
      getActiveEdgeActivation: async () => ({ agentName: "Test" }),
      writeAudit,
    } as unknown as Parameters<typeof registerEdgeAgentPackageRoutes>[1];
    try {
      await registerEdgeAgentPackageRoutes(app, store, {
        artifactRoot: root,
        controlPlanePublicUrl: "https://control.example.com",
      });
      const response = await app.inject({
        method: "POST",
        url: "/v1/branches/branch/edge-agent-installer",
        payload: {
          activationId: "00000000-0000-4000-8000-000000000104",
          activationCode: `sgact_${"a".repeat(48)}`,
          agentName: "Test",
        },
      });
      expect(response.statusCode).toBe(expectedStatus);
      if (expectedStatus === 200) {
        expect(response.headers["content-type"]).toContain("application/zip");
        expect(writeAudit).toHaveBeenCalledOnce();
      } else {
        expect(response.json().error).toBe(expectedError);
        expect(writeAudit).not.toHaveBeenCalled();
      }
    } finally {
      await app.close();
    }
  });

  it.each([
    ["missing manifest", undefined, executable, "A Windows Edge Agent release with a checksum manifest is required"],
    ["malformed manifest", "{", executable, "A Windows Edge Agent release with a checksum manifest is required"],
    ["invalid manifest", "{}", executable, "manifest is invalid"],
    ["missing executable", JSON.stringify(manifest), undefined, "executable is missing"],
    ["empty executable", JSON.stringify(manifest), Buffer.alloc(0), "executable is missing"],
    ["mismatched executable", JSON.stringify(manifest), Buffer.from("different"), "does not match"],
  ])("rejects %s even when the old bypass is set", async (_name, manifestText, binary, message) => {
    const script = await fixture(manifestText, binary);
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, SKIP_WINDOWS_RELEASE_VERIFY: "true", ALLOW_MISSING_WINDOWS_RELEASE: "true" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it.each(["", "\uFEFF"])("accepts a matching release with BOM prefix %j", async (prefix) => {
    const script = await fixture(prefix + JSON.stringify(manifest), executable);
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Verified Windows Edge Agent release and native installer checksums");
  });
});
