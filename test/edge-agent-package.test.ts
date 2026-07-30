import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function embeddedConfig(executable: Buffer) {
  const marker = Buffer.from("SENTINEL_EDGE_CONFIG_V1", "ascii");
  expect(executable.subarray(-marker.length).equals(marker)).toBe(true);
  const lengthOffset = executable.length - marker.length - 4;
  const length = executable.readUInt32LE(lengthOffset);
  return executable.subarray(lengthOffset - length, lengthOffset).toString("utf8");
}

describe("branch edge-agent package", () => {
  it("downloads one branch-specific Windows installer EXE with embedded configuration", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "sentinel-edge-package-"));
    temporaryRoots.push(artifactRoot);
    await mkdir(join(artifactRoot, "release"), { recursive: true });
    await writeFile(join(artifactRoot, "package.json"), JSON.stringify({ version: "9.8.7" }));
    await writeFile(join(artifactRoot, "release", "edge-agent.exe"), Buffer.from("MZ-test-executable"));

    const store = new MemoryStore();
    const agent = await store.registerEdgeAgent("branch-blr-001", "BLR Branch Edge", "9.8.7");
    const edgeKey = "k".repeat(43);
    const app = await buildApp({
      store,
      edgeAgentArtifactRoot: artifactRoot,
      controlPlanePublicUrl: "https://control.example.com",
      edgeBridgeSharedKey: edgeKey,
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: `/v1/branches/branch-blr-001/edge-agents/${agent.id}/package?platform=windows`,
        headers: { "x-user-id": "user-global-admin" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/vnd.microsoft.portable-executable");
      expect(response.headers["content-disposition"]).toContain("edge-agent-setup.exe");
      expect(response.headers["cache-control"]).toBe("no-store, private");
      expect(response.rawPayload.subarray(0, 2).toString()).toBe("MZ");
      const config = embeddedConfig(response.rawPayload);
      expect(config).toContain('CONTROL_PLANE_URL="https://control.example.com"');
      expect(config).toContain(`EDGE_AGENT_ID="${agent.id}"`);
      expect(config).toContain(`EDGE_BRIDGE_SHARED_KEY="${edgeKey}"`);
      expect(config).toContain('DEV_USER_ID="user-global-admin"');
      expect(config).toContain('LIVE_MEDIA_ENABLED="true"');
      expect(config).toContain('MEDIA_TUNNEL_MODE="quick"');
      expect(store.auditEvents.at(-1)?.action).toBe("edge_agent.package_downloaded");
    } finally {
      await app.close();
    }
  });
});
