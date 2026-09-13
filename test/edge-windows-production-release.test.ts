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
const manifest = {
  sha256: createHash("sha256").update(executable).digest("hex"),
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
  const script = join(root, "scripts", "verify-windows-production-release.mjs");
  await copyFile(new URL("../edge-agent/scripts/verify-windows-production-release.mjs", import.meta.url), script);
  if (manifestText !== undefined) await writeFile(join(root, "release", "windows-release.json"), manifestText);
  if (binary !== undefined) await writeFile(join(root, "release", "edge-agent.exe"), binary);
  return script;
}

describe("Windows production release build verification", () => {
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
    ["missing manifest", undefined, executable, "A Windows-signed Edge Agent release is required"],
    ["malformed manifest", "{", executable, "A Windows-signed Edge Agent release is required"],
    ["invalid manifest", "{}", executable, "manifest is invalid"],
    ["missing executable", JSON.stringify(manifest), undefined, "executable is missing"],
    ["empty executable", JSON.stringify(manifest), Buffer.alloc(0), "executable is missing"],
    ["mismatched executable", JSON.stringify(manifest), Buffer.from("different"), "does not match"],
  ])("rejects %s even when the old bypass is set", async (_name, manifestText, binary, message) => {
    const script = await fixture(manifestText, binary);
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, SKIP_WINDOWS_RELEASE_VERIFY: "true" },
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
    expect(result.stdout).toContain("Verified Windows-signed Edge Agent release artifact");
  });
});
