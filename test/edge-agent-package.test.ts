import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
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

function zipEntry(zip: Buffer, expectedName: string) {
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const contentStart = nameStart + nameLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    if (name === expectedName) return inflateRawSync(zip.subarray(contentStart, contentEnd));
    offset = contentEnd;
  }
  throw new Error(`ZIP entry not found: ${expectedName}`);
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
      expect(config).toContain('EDGE_MANAGED_MEDIA_BOOTSTRAP="true"');
      expect(config).toContain('MEDIA_TUNNEL_MODE="named"');
      expect(config).not.toContain('CAMERA_USERNAME="admin"');
      expect(config).not.toContain('REPLACE_WITH_CAMERA_PASSWORD');
      expect(store.auditEvents.at(-1)?.action).toBe("edge_agent.package_downloaded");
    } finally {
      await app.close();
    }
  });

  it("downloads a temporary Windows local-network scanner without media or tunnel runtime", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "sentinel-local-scanner-package-"));
    temporaryRoots.push(artifactRoot);
    await mkdir(join(artifactRoot, "release"), { recursive: true });
    await writeFile(join(artifactRoot, "package.json"), JSON.stringify({ version: "9.8.7" }));
    await writeFile(join(artifactRoot, "release", "edge-agent.exe"), Buffer.from("MZ-test-executable"));

    const store = new MemoryStore();
    const agent = await store.registerEdgeAgent("branch-blr-001", "Temporary scanner", "9.8.7");
    const app = await buildApp({
      store,
      edgeAgentArtifactRoot: artifactRoot,
      controlPlanePublicUrl: "https://control.example.com",
      edgeBridgeSharedKey: "k".repeat(43),
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: `/v1/branches/branch-blr-001/edge-agents/${agent.id}/package?platform=windows&mode=scan-once`,
        headers: { "x-user-id": "user-global-admin" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/zip");
      expect(response.headers["content-disposition"]).toContain("local-network-scanner.zip");
      expect(response.rawPayload.subarray(0, 2).toString()).toBe("PK");
      const scanner = zipEntry(response.rawPayload, "Bengaluru-Branch-001-local-network-scanner.exe");
      expect(embeddedConfig(scanner)).toContain('LIVE_MEDIA_ENABLED="false"');
      expect(embeddedConfig(scanner)).toContain('MEDIA_TUNNEL_MODE="disabled"');
      expect(zipEntry(response.rawPayload, "Run Local Discovery.cmd").toString("utf8"))
        .toContain('Run Local Discovery.ps1');
      const runner = zipEntry(response.rawPayload, "Run Local Discovery.ps1").toString("utf8");
      expect(runner).toContain("Get-Credential");
      expect(runner).toContain("Bengaluru-Branch-001-local-network-scanner.exe') --scan-once");
      expect(runner).toContain("Remove-Item Env:CAMERA_PASSWORD");
      expect(store.auditEvents.at(-1)?.action).toBe("edge_agent.local_scanner_downloaded");
    } finally {
      await app.close();
    }
  });
});
