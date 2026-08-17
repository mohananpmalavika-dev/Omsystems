import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { EnterpriseStoragePool } from "../../src/storage/enterprise-storage-pool.js";
import { LocalDiskStorageProvider } from "../../src/storage/providers/local-disk-storage.provider.js";
import { SanStorageProvider } from "../../src/storage/providers/san-storage.provider.js";
import { DigitalTwinStorageService } from "../../src/digital-twin/digital-twin-storage.service.js";
import { registerEnterpriseStorageRoutes } from "../../src/routes/enterprise-storage.routes.js";

describe("Digital Twin Storage Integration Suite", () => {
  it("generates comprehensive Digital Twin topology, diagnostics, and spatial alerts", async () => {
    const storagePool = new EnterpriseStoragePool();

    // 1. Healthy NVMe node
    const healthyNode = new LocalDiskStorageProvider({
      nodeId: "vault-nvme-01",
      basePath: "./data/mock-vault-01",
      storageTier: "hot",
      simulatedCapacityBytes: 2_000_000_000_000,
      simulatedUsedBytes: 400_000_000_000, // 20%
    });

    // 2. Degraded SAN node (Multipath degraded)
    const degradedNode = new SanStorageProvider({
      nodeId: "core-san-01",
      volumeMountPath: "./data/mock-san-01",
      storageTier: "hot",
      multipathActivePaths: 2,
      multipathTotalPaths: 4,
    });

    // 3. Full node
    const fullNode = new LocalDiskStorageProvider({
      nodeId: "atm-local-01",
      basePath: "./data/mock-atm-01",
      storageTier: "hot",
      simulatedCapacityBytes: 1_000_000_000_000,
      simulatedUsedBytes: 970_000_000_000, // 97%
    });

    // 4. Offline node
    const offlineNode = new LocalDiskStorageProvider({
      nodeId: "branch-backup-01",
      basePath: "./data/mock-backup-01",
      storageTier: "warm",
      forceOffline: true,
    });

    storagePool.registerNode(healthyNode);
    storagePool.registerNode(degradedNode);
    storagePool.registerNode(fullNode);
    storagePool.registerNode(offlineNode);

    const twinService = new DigitalTwinStorageService(undefined as any, storagePool);
    const topology = await twinService.getStorageTopology();

    expect(topology.totalNodes).toBe(4);
    expect(topology.healthyNodes).toBe(1);
    expect(topology.degradedNodes).toBe(1);
    expect(topology.fullNodes).toBe(1);
    expect(topology.offlineNodes).toBe(1);

    expect(topology.nodes.length).toBe(4);

    // Verify Active Alerts
    expect(topology.activeAlerts.length).toBeGreaterThanOrEqual(3);
    expect(topology.activeAlerts.some((a) => a.code === "STORAGE_OFFLINE")).toBe(true);
    expect(topology.activeAlerts.some((a) => a.code === "STORAGE_FULL")).toBe(true);
    expect(topology.activeAlerts.some((a) => a.code === "STORAGE_DEGRADED")).toBe(true);
  });

  it("serves REST API endpoints for Digital Twin and Storage Nodes", async () => {
    const storagePool = new EnterpriseStoragePool();
    const node = new LocalDiskStorageProvider({
      nodeId: "node-test-01",
      basePath: "./data/test-01",
      storageTier: "hot",
    });
    storagePool.registerNode(node);

    const twinService = new DigitalTwinStorageService(undefined as any, storagePool);

    const app = Fastify();
    await registerEnterpriseStorageRoutes(app, {
      storagePool,
      twinStorageService: twinService,
    });
    await app.ready();

    // 1. GET /api/v1/storage/nodes
    const nodesResp = await app.inject({
      method: "GET",
      url: "/api/v1/storage/nodes",
    });
    expect(nodesResp.statusCode).toBe(200);
    const nodesData = JSON.parse(nodesResp.body).data;
    expect(nodesData.length).toBe(1);
    expect(nodesData[0].nodeId).toBe("node-test-01");

    // 2. GET /api/v1/storage/nodes/:nodeId/health
    const healthResp = await app.inject({
      method: "GET",
      url: "/api/v1/storage/nodes/node-test-01/health",
    });
    expect(healthResp.statusCode).toBe(200);
    const healthData = JSON.parse(healthResp.body).data;
    expect(healthData.healthState).toBe("HEALTHY");

    // 3. GET /api/v1/storage/digital-twin/topology
    const topoResp = await app.inject({
      method: "GET",
      url: "/api/v1/storage/digital-twin/topology",
    });
    expect(topoResp.statusCode).toBe(200);
    const topoData = JSON.parse(topoResp.body).data;
    expect(topoData.totalNodes).toBe(1);
    expect(topoData.healthyNodes).toBe(1);
  });
});
