import { afterEach, describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function unzipEntries(archive: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    offset = dataStart + compressedSize;
  }
  return entries;
}

describe("branch edge-agent package", () => {
  it("downloads a branch-specific Windows installer instead of a bare EXE", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "sentinel-edge-package-"));
    temporaryRoots.push(artifactRoot);
    await mkdir(join(artifactRoot, "release"), { recursive: true });
    await mkdir(join(artifactRoot, "installer", "windows"), { recursive: true });
    await writeFile(join(artifactRoot, "package.json"), JSON.stringify({ version: "9.8.7" }));
    await writeFile(join(artifactRoot, "release", "edge-agent.exe"), Buffer.from("MZ-test-executable"));
    await writeFile(join(artifactRoot, "installer", "windows", "install-edge-agent.ps1"), "# installer fixture");
    await writeFile(join(artifactRoot, "installer", "windows", "uninstall-edge-agent.ps1"), "# uninstaller fixture");

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
      expect(response.headers["content-type"]).toContain("application/zip");
      expect(response.headers["content-disposition"]).toContain("edge-agent-windows.zip");
      expect(response.headers["cache-control"]).toBe("no-store, private");

      const entries = unzipEntries(response.rawPayload);
      expect([...entries.keys()]).toEqual([
        "edge-agent.exe",
        "config/edge-agent.env",
        "install-edge-agent.ps1",
        "uninstall-edge-agent.ps1",
        "README.txt",
      ]);
      expect(entries.get("edge-agent.exe")?.subarray(0, 2).toString()).toBe("MZ");
      const config = entries.get("config/edge-agent.env")?.toString("utf8") ?? "";
      expect(config).toContain('CONTROL_PLANE_URL="https://control.example.com"');
      expect(config).toContain(`EDGE_AGENT_ID="${agent.id}"`);
      expect(config).toContain(`EDGE_BRIDGE_SHARED_KEY="${edgeKey}"`);
      expect(config).toContain('DEV_USER_ID="user-global-admin"');
      expect(store.auditEvents.at(-1)?.action).toBe("edge_agent.package_downloaded");
    } finally {
      await app.close();
    }
  });
});
