import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { EnterpriseStoragePool } from "../../src/storage/enterprise-storage-pool.js";
import { StorageFailoverRouter } from "../../src/storage/storage-failover-router.js";
import { StorageFailoverService } from "../../src/storage/storage-failover.service.js";
import { LocalDiskStorageProvider } from "../../src/storage/providers/local-disk-storage.provider.js";
import { NasStorageProvider } from "../../src/storage/providers/nas-storage.provider.js";
import { SanStorageProvider } from "../../src/storage/providers/san-storage.provider.js";
import { registerStorageFailoverRoutes } from "../../src/routes/storage-failover.routes.js";

describe("Production-Ready Automatic Storage Failover Integration Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-failover-e2e-"));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("seamlessly switches to secondary NAS mount on primary disk ENOSPC without dropping video chunks", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);
    const service = new StorageFailoverService(undefined as any, router, storagePool);

    const primaryDir = join(tempDir, "primary-nvme");
    const secondaryDir = join(tempDir, "secondary-nas");

    const primaryDisk = new LocalDiskStorageProvider({
      nodeId: "primary-nvme-01",
      basePath: primaryDir,
      storageTier: "hot",
    });

    const secondaryNas = new NasStorageProvider({
      nodeId: "secondary-nas-01",
      sharePath: secondaryDir,
      storageTier: "warm",
      protocol: "nfs",
      serverHost: "nas01.corp.internal",
    });

    storagePool.registerNode(primaryDisk);
    storagePool.registerNode(secondaryNas);

    // Register Target 1: Primary NVMe (Priority 1)
    await service.configureTarget({
      mediaNodeId: "vault-recorder-node-01",
      storageNodeId: "primary-nvme-01",
      targetName: "Primary Local NVMe",
      targetPath: primaryDir,
      storageType: "local-disk",
      priority: 1,
      spilloverThresholdPercent: 95,
    });

    // Register Target 2: Secondary NAS (Priority 2)
    await service.configureTarget({
      mediaNodeId: "vault-recorder-node-01",
      storageNodeId: "secondary-nas-01",
      targetName: "Enterprise Synology NAS",
      targetPath: secondaryDir,
      storageType: "nas",
      priority: 2,
      spilloverThresholdPercent: 95,
    });

    // Verify initial active target is Primary
    let active = await service.getActiveTarget("vault-recorder-node-01");
    expect(active.storageNodeId).toBe("primary-nvme-01");
    expect(active.priority).toBe(1);

    // Write chunk 1 to Primary successfully
    const chunk1Key = "camera-01/2026/09/12/segment-0001.mp4";
    const chunk1Data = Buffer.from("H264_VIDEO_FRAME_HEADER_KEYFRAME_TIMESTAMP_1000");
    const write1 = await router.writeSegmentWithFailover(
      "vault-recorder-node-01",
      chunk1Key,
      chunk1Data,
    );
    expect(write1.bytesWritten).toBe(chunk1Data.length);
    expect(write1.activeTarget.storageNodeId).toBe("primary-nvme-01");
    expect(await primaryDisk.exists(chunk1Key)).toBe(true);

    // Now simulate Primary NVMe becoming full / read-only (ENOSPC / EROFS)
    primaryDisk.setForceReadOnly(true);

    // Write chunk 2: Must NOT fail! Router should catch error, failover to secondary NAS, and write seamlessly
    const chunk2Key = "camera-01/2026/09/12/segment-0002.mp4";
    const chunk2Data = Buffer.from("H264_VIDEO_FRAME_HEADER_P_FRAME_TIMESTAMP_2000");
    const write2 = await router.writeSegmentWithFailover(
      "vault-recorder-node-01",
      chunk2Key,
      chunk2Data,
    );

    expect(write2.bytesWritten).toBe(chunk2Data.length);
    expect(write2.activeTarget.storageNodeId).toBe("secondary-nas-01");
    expect(write2.activeTarget.priority).toBe(2);

    // Verify the segment was written to the secondary NAS mount
    expect(await secondaryNas.exists(chunk2Key)).toBe(true);
    const readBack = await secondaryNas.readSegment(chunk2Key);
    expect(Buffer.isBuffer(readBack) ? readBack.toString() : "").toBe(chunk2Data.toString());

    // Active target should now remain secondary NAS for subsequent chunks
    active = await service.getActiveTarget("vault-recorder-node-01");
    expect(active.storageNodeId).toBe("secondary-nas-01");
  });

  it("cascades from Primary to Secondary NAS, and then to Tertiary SAN on ESTALE stale mount", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);
    const service = new StorageFailoverService(undefined as any, router, storagePool);

    const primaryDir = join(tempDir, "nvme");
    const nasDir = join(tempDir, "nas");
    const sanDir = join(tempDir, "san");

    const primary = new LocalDiskStorageProvider({
      nodeId: "tier1-nvme",
      basePath: primaryDir,
      forceOffline: true, // Primary dropped
    });

    const secondaryNas = new NasStorageProvider({
      nodeId: "tier2-nas",
      sharePath: nasDir,
      forceStaleHandle: true, // Secondary NAS has ESTALE stale file handle!
    });

    const tertiarySan = new SanStorageProvider({
      nodeId: "tier3-san",
      volumeMountPath: sanDir,
      sanProtocol: "iscsi",
    });

    storagePool.registerNode(primary);
    storagePool.registerNode(secondaryNas);
    storagePool.registerNode(tertiarySan);

    await service.configureTarget({
      mediaNodeId: "cluster-media-02",
      storageNodeId: "tier1-nvme",
      targetName: "Primary NVMe",
      targetPath: primaryDir,
      priority: 1,
    });
    await service.configureTarget({
      mediaNodeId: "cluster-media-02",
      storageNodeId: "tier2-nas",
      targetName: "NFS Backup Share",
      targetPath: nasDir,
      priority: 2,
    });
    await service.configureTarget({
      mediaNodeId: "cluster-media-02",
      storageNodeId: "tier3-san",
      targetName: "iSCSI SAN LUN",
      targetPath: sanDir,
      priority: 3,
    });

    const chunkKey = "cam-perimeter/chunk-999.mkv";
    const chunkData = Buffer.from("HIGH_RES_PERIMETER_SURVEILLANCE_STREAM");

    // Execution must cascade past Tier 1 (Offline) and Tier 2 (Stale NFS) to Tier 3 (SAN)
    const result = await router.writeSegmentWithFailover("cluster-media-02", chunkKey, chunkData);

    expect(result.bytesWritten).toBe(chunkData.length);
    expect(result.activeTarget.storageNodeId).toBe("tier3-san");
    expect(result.activeTarget.priority).toBe(3);
    expect(await tertiarySan.exists(chunkKey)).toBe(true);
  });

  it("proactively triggers failover via probeTargetHealth when disk usage exceeds spillover threshold", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);
    const service = new StorageFailoverService(undefined as any, router, storagePool);

    const primaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-almost-full",
      basePath: join(tempDir, "disk-full"),
      simulatedCapacityBytes: 100_000_000_000,
      simulatedUsedBytes: 96_000_000_000, // 96% full (exceeds 95%)
    });

    const secondaryNas = new NasStorageProvider({
      nodeId: "nas-backup-ready",
      sharePath: join(tempDir, "nas-ready"),
      simulatedCapacityBytes: 500_000_000_000,
      simulatedUsedBytes: 50_000_000_000, // 10% used
    });

    storagePool.registerNode(primaryDisk);
    storagePool.registerNode(secondaryNas);

    const target1 = await service.configureTarget({
      mediaNodeId: "node-health-check",
      storageNodeId: "disk-almost-full",
      targetName: "Nearly Full Disk",
      targetPath: join(tempDir, "disk-full"),
      priority: 1,
      spilloverThresholdPercent: 95.0,
    });

    await service.configureTarget({
      mediaNodeId: "node-health-check",
      storageNodeId: "nas-backup-ready",
      targetName: "Secondary NAS Storage",
      targetPath: join(tempDir, "nas-ready"),
      priority: 2,
      spilloverThresholdPercent: 95.0,
    });

    // Run proactive health probe
    const probe = await service.probeTargetHealth("node-health-check");

    // The probe should detect 96% > 95% threshold and proactively switch to secondary NAS!
    expect(probe.activeTarget.storageNodeId).toBe("nas-backup-ready");
    expect(probe.activeTarget.priority).toBe(2);

    const target1Status = probe.targets.find((t) => t.id === target1.id);
    expect(target1Status?.healthState).toBe("FULL");
    expect(target1Status?.actionTaken).toBe("FAILOVER_TRIGGERED");
  });

  it("automatically recovers and restores higher priority target when primary space is freed", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);
    const mockEvents: any[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("INSERT INTO storage_failover_events")) {
          mockEvents.push(params);
        }
        if (sql.includes("UPDATE storage_failover_events")) {
          return { rowCount: 1 };
        }
        if (sql.includes("SELECT * FROM storage_failover_events")) {
          return {
            rows: [
              {
                id: "ev-01",
                tenant_id: "00000000-0000-0000-0000-000000000000",
                media_node_id: "node-recover-test",
                from_storage_node_id: "disk-primary",
                from_target_path: "/mnt/disk1",
                to_storage_node_id: "nas-secondary",
                to_target_path: "/mnt/nas2",
                reason: "DISK_FULL",
                occurred_at: new Date(Date.now() - 60000).toISOString(),
                recovered_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as any;

    const service = new StorageFailoverService(mockPool, router, storagePool);

    const primaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-primary",
      basePath: join(tempDir, "disk1"),
    });

    const secondaryNas = new NasStorageProvider({
      nodeId: "nas-secondary",
      sharePath: join(tempDir, "nas2"),
    });

    storagePool.registerNode(primaryDisk);
    storagePool.registerNode(secondaryNas);

    const t1 = await service.configureTarget({
      mediaNodeId: "node-recover-test",
      storageNodeId: "disk-primary",
      targetName: "Primary Disk",
      targetPath: join(tempDir, "disk1"),
      priority: 1,
    });

    const t2 = await service.configureTarget({
      mediaNodeId: "node-recover-test",
      storageNodeId: "nas-secondary",
      targetName: "Secondary NAS",
      targetPath: join(tempDir, "nas2"),
      priority: 2,
    });

    // 1. Failover primary
    await service.triggerFailover("node-recover-test", t1.id, "DISK_FULL");
    let active = await service.getActiveTarget("node-recover-test");
    expect(active.storageNodeId).toBe("nas-secondary");

    // 2. Recover primary
    const recoveryResult = await service.recoverTarget("node-recover-test", t1.id);
    expect(recoveryResult.recovered).toBe(true);
    expect(recoveryResult.activeTarget?.storageNodeId).toBe("disk-primary");
    expect(recoveryResult.activeTarget?.priority).toBe(1);

    // 3. Verify metrics report MTTR
    const metrics = await service.getFailoverMetrics("node-recover-test");
    expect(metrics.totalEvents).toBe(1);
    expect(metrics.meanTimeToRecoveryMs).toBeGreaterThanOrEqual(0);
  });

  it("handles the complete end-to-end REST lifecycle via Fastify", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);
    const service = new StorageFailoverService(undefined as any, router, storagePool);

    const app = Fastify();
    await registerStorageFailoverRoutes(app, {
      failoverService: service,
      failoverRouter: router,
    });
    await app.ready();

    // 1. POST Configure Primary
    const c1 = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/targets",
      payload: {
        mediaNodeId: "edge-gateway-99",
        storageNodeId: "local-vault",
        targetName: "NVMe Vault",
        targetPath: join(tempDir, "local-vault"),
        storageType: "local-disk",
        priority: 1,
      },
    });
    expect(c1.statusCode).toBe(201);
    const target1 = c1.json().data;

    // 2. POST Configure Secondary NAS
    const c2 = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/targets",
      payload: {
        mediaNodeId: "edge-gateway-99",
        storageNodeId: "nas-vault",
        targetName: "Synology NAS Backup",
        targetPath: join(tempDir, "nas-vault"),
        storageType: "nas",
        priority: 2,
      },
    });
    expect(c2.statusCode).toBe(201);
    const target2 = c2.json().data;

    // 3. GET Targets
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/failover/targets?mediaNodeId=edge-gateway-99",
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.permittedTargets.length).toBe(2);
    expect(listRes.json().data.activeTarget.storageNodeId).toBe("local-vault");

    // 4. POST Trigger Failover (Emergency Switchover)
    const triggerRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/trigger",
      payload: {
        mediaNodeId: "edge-gateway-99",
        targetId: target1.id,
        reason: "MOUNT_DISCONNECTED",
        errorDetail: "FibreChannel controller offline",
      },
    });
    expect(triggerRes.statusCode).toBe(200);
    expect(triggerRes.json().data.failoverOccurred).toBe(true);
    expect(triggerRes.json().data.newTarget.storageNodeId).toBe("nas-vault");

    // 5. POST Probe Health
    const probeRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/probe",
      payload: { mediaNodeId: "edge-gateway-99" },
    });
    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json().data.targets.length).toBe(2);

    // 6. POST Recover Target
    const recRes = await app.inject({
      method: "POST",
      url: "/api/v1/storage/failover/recover",
      payload: {
        mediaNodeId: "edge-gateway-99",
        targetId: target1.id,
      },
    });
    expect(recRes.statusCode).toBe(200);
    expect(recRes.json().data.recovered).toBe(true);
    expect(recRes.json().data.activeTarget.storageNodeId).toBe("local-vault");

    // 7. PATCH Target
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/storage/failover/targets/${target2.id}`,
      payload: {
        mediaNodeId: "edge-gateway-99",
        targetName: "Synology NAS High Availability",
        spilloverThresholdPercent: 92,
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.targetName).toBe("Synology NAS High Availability");
    expect(patchRes.json().data.spilloverThresholdPercent).toBe(92);

    // 8. DELETE Target
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/storage/failover/targets/${target2.id}?mediaNodeId=edge-gateway-99`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data.removed).toBe(true);

    await app.close();
  });
});
