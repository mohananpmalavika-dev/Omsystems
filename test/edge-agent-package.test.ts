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
      expect(runner).toContain("Bengaluru-Branch-001-local-network-scanner.exe') --scan-once");
      expect(runner).not.toContain("Get-Credential");
      expect(embeddedConfig(scanner)).not.toContain("CAMERA_PASSWORD=");
      expect(store.auditEvents.at(-1)?.action).toBe("edge_agent.local_scanner_downloaded");
    } finally {
      await app.close();
    }
  });

  it("downloads a one-click branch scanner installer from a website activation", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "sentinel-activation-installer-"));
    temporaryRoots.push(artifactRoot);
    await mkdir(join(artifactRoot, "release"), { recursive: true });
    await writeFile(join(artifactRoot, "package.json"), JSON.stringify({ version: "9.8.7" }));
    await writeFile(join(artifactRoot, "release", "edge-agent.exe"), Buffer.from("MZ-test-executable"));

    const store = new MemoryStore();
    const activation = await store.createEdgeActivation({
      branchId: "branch-blr-001",
      agentName: "Bengaluru Scanner",
      createdBy: "user-global-admin",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      tokenHash: "activation-token-hash",
    });
    const app = await buildApp({
      store,
      edgeAgentArtifactRoot: artifactRoot,
      controlPlanePublicUrl: "https://control.example.com",
    });
    try {
      const activationCode = `sgact_${"a".repeat(48)}`;
      const response = await app.inject({
        method: "POST",
        url: "/v1/branches/branch-blr-001/edge-agent-installer",
        headers: { "x-user-id": "user-global-admin" },
        payload: {
          activationId: activation.id,
          activationCode,
          agentName: "Bengaluru Scanner",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-disposition"]).toContain("scanner-setup.exe");
      const config = embeddedConfig(response.rawPayload);
      expect(config).toContain(`EDGE_ACTIVATION_CODE=${JSON.stringify(activationCode)}`);
      expect(config).toContain('EDGE_BRIDGE_SHARED_KEY=""');
      expect(config).toContain('EDGE_AGENT_NAME="Bengaluru Scanner"');
      expect(store.auditEvents.at(-1)?.action).toBe("edge_agent.installer_downloaded");
    } finally {
      await app.close();
    }
  });

  it("automatically embeds the website API base when no public URL is configured", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "sentinel-automatic-installer-url-"));
    temporaryRoots.push(artifactRoot);
    await mkdir(join(artifactRoot, "release"), { recursive: true });
    await writeFile(join(artifactRoot, "package.json"), JSON.stringify({ version: "9.8.7" }));
    await writeFile(join(artifactRoot, "release", "edge-agent.exe"), Buffer.from("MZ-test-executable"));

    const store = new MemoryStore();
    const activation = await store.createEdgeActivation({
      branchId: "branch-blr-001",
      agentName: "Automatic Scanner",
      createdBy: "user-global-admin",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      tokenHash: "activation-token-hash",
    });
    const app = await buildApp({ store, edgeAgentArtifactRoot: artifactRoot });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/branches/branch-blr-001/edge-agent-installer",
        headers: {
          "x-user-id": "user-global-admin",
          "x-sentinel-public-api-base": "https://dashboard.example.com/api/control",
        },
        payload: {
          activationId: activation.id,
          activationCode: `sgact_${"a".repeat(48)}`,
          agentName: "Automatic Scanner",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(embeddedConfig(response.rawPayload)).toContain(
        'CONTROL_PLANE_URL="https://dashboard.example.com/api/control"',
      );
    } finally {
      await app.close();
    }
  });

  it("uses a short-lived enrollment code when legacy edge keys are disabled", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "sentinel-secure-local-scanner-package-"));
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
      allowLegacyEdgeBridgeKey: false,
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: `/v1/branches/branch-blr-001/edge-agents/${agent.id}/package?platform=windows&mode=scan-once`,
        headers: { "x-user-id": "user-global-admin" },
      });

      expect(response.statusCode).toBe(200);
      const scanner = zipEntry(response.rawPayload, "Bengaluru-Branch-001-local-network-scanner.exe");
      const config = embeddedConfig(scanner);
      expect(config).toContain('EDGE_BRIDGE_SHARED_KEY=""');
      const activationMatch = config.match(/^EDGE_ACTIVATION_CODE=(.+)$/m);
      expect(activationMatch).toBeTruthy();
      const activationCode = JSON.parse(activationMatch![1]);
      expect(activationCode).toMatch(/^sgact_/);

      const enrollment = await app.inject({
        method: "POST",
        url: "/v1/edge-enrollment/activate",
        payload: {
          activationCode,
          deviceUuid: "11111111-1111-4111-8111-111111111111",
          version: "9.8.7",
        },
      });
      expect(enrollment.statusCode).toBe(201);
      expect(enrollment.json()).toMatchObject({ branchId: "branch-blr-001" });
      const bootstrap = await app.inject({
        method: "GET",
        url: `/v1/edge-agents/${enrollment.json().agentId}/discovery-bootstrap`,
        headers: { "x-edge-agent-token": enrollment.json().credential },
      });
      expect(bootstrap.statusCode).toBe(200);
      expect(bootstrap.json()).toMatchObject({ credentials: [], vpnScanNetworks: [] });
      expect(store.auditEvents.some((event) => event.action === "edge_agent.local_scanner_downloaded")).toBe(true);
    } finally {
      await app.close();
    }
  });
});
