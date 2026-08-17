import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageFailoverRouter } from "../../src/storage/storage-failover-router.js";
import { EnterpriseStoragePool } from "../../src/storage/enterprise-storage-pool.js";
import { LocalDiskStorageProvider } from "../../src/storage/providers/local-disk-storage.provider.js";
import { NasStorageProvider } from "../../src/storage/providers/nas-storage.provider.js";

describe("Automatic Storage Failover Router Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vms-failover-test-"));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("prioritizes targets by priority order (Priority 1 before Priority 2)", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);

    const primaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video1",
      basePath: join(tempDir, "video1"),
      storageTier: "hot",
    });

    const secondaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video2",
      basePath: join(tempDir, "video2"),
      storageTier: "hot",
    });

    storagePool.registerNode(primaryDisk);
    storagePool.registerNode(secondaryDisk);

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video1",
      targetName: "Primary Video1 Mount",
      targetPath: "/mnt/video1",
      priority: 1,
    });

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video2",
      targetName: "Secondary Video2 Mount",
      targetPath: "/mnt/video2",
      priority: 2,
    });

    const activeTarget = await router.getActiveTarget("edge-media-01");
    expect(activeTarget.storageNodeId).toBe("disk-video1");
    expect(activeTarget.priority).toBe(1);
  });

  it("automatically fails over to secondary storage when primary mount is OFFLINE / ENOENT", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);

    const primaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video1",
      basePath: join(tempDir, "video1"),
      storageTier: "hot",
      forceOffline: true, // /mnt/video1 dropped
    });

    const secondaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video2",
      basePath: join(tempDir, "video2"),
      storageTier: "hot",
    });

    storagePool.registerNode(primaryDisk);
    storagePool.registerNode(secondaryDisk);

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video1",
      targetName: "Primary Video1",
      targetPath: "/mnt/video1",
      priority: 1,
    });

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video2",
      targetName: "Secondary Video2",
      targetPath: "/mnt/video2",
      priority: 2,
    });

    const segmentKey = "cam-vault-01/2026/08/17/seg-001.mkv";
    const segmentData = Buffer.from("CRITICAL_VAULT_RECORDING_CHUNK");

    // Seamless write with failover
    const writeResult = await router.writeSegmentWithFailover(
      "edge-media-01",
      segmentKey,
      segmentData,
    );

    // Recording continued without failing!
    expect(writeResult.bytesWritten).toBe(segmentData.length);
    expect(writeResult.activeTarget.storageNodeId).toBe("disk-video2");
    expect(writeResult.activeTarget.priority).toBe(2);
    expect(await secondaryDisk.exists(segmentKey)).toBe(true);
  });

  it("handles multi-tier failover: Primary -> Secondary -> Tertiary (NAS)", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);

    const primaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video1",
      basePath: join(tempDir, "video1"),
      storageTier: "hot",
      forceOffline: true,
    });

    const secondaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video2",
      basePath: join(tempDir, "video2"),
      storageTier: "hot",
      forceReadOnly: true, // Read only!
    });

    const tertiaryNas = new NasStorageProvider({
      nodeId: "nas-emergency",
      sharePath: join(tempDir, "nas-backup"),
      storageTier: "warm",
    });

    storagePool.registerNode(primaryDisk);
    storagePool.registerNode(secondaryDisk);
    storagePool.registerNode(tertiaryNas);

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video1",
      targetName: "Primary Video1",
      targetPath: "/mnt/video1",
      priority: 1,
    });

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video2",
      targetName: "Secondary Video2",
      targetPath: "/mnt/video2",
      priority: 2,
    });

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "nas-emergency",
      targetName: "Tertiary NAS",
      targetPath: "nfs://nas.local/emergency",
      priority: 3,
    });

    const segmentKey = "cam-atm/seg-99.mkv";
    const segmentData = Buffer.from("ATM_TRANSACTION_FOOTAGE");

    const writeResult = await router.writeSegmentWithFailover(
      "edge-media-01",
      segmentKey,
      segmentData,
    );

    expect(writeResult.activeTarget.storageNodeId).toBe("nas-emergency");
    expect(writeResult.activeTarget.priority).toBe(3);
    expect(await tertiaryNas.exists(segmentKey)).toBe(true);
  });

  it("restores Primary storage when it recovers", async () => {
    const storagePool = new EnterpriseStoragePool();
    const router = new StorageFailoverRouter(storagePool);

    const primaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video1",
      basePath: join(tempDir, "video1"),
      storageTier: "hot",
    });

    const secondaryDisk = new LocalDiskStorageProvider({
      nodeId: "disk-video2",
      basePath: join(tempDir, "video2"),
      storageTier: "hot",
    });

    storagePool.registerNode(primaryDisk);
    storagePool.registerNode(secondaryDisk);

    const target1 = router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video1",
      targetName: "Primary Video1",
      targetPath: "/mnt/video1",
      priority: 1,
    });

    router.registerTarget({
      mediaNodeId: "edge-media-01",
      storageNodeId: "disk-video2",
      targetName: "Secondary Video2",
      targetPath: "/mnt/video2",
      priority: 2,
    });

    // Simulate failure on target1
    await router.reportTargetFailure("edge-media-01", target1.id, "DISK_FULL");

    let active = await router.getActiveTarget("edge-media-01");
    expect(active.storageNodeId).toBe("disk-video2");

    // Recover target1
    router.reportTargetRecovered("edge-media-01", target1.id);

    active = await router.getActiveTarget("edge-media-01");
    expect(active.storageNodeId).toBe("disk-video1");
    expect(active.priority).toBe(1);
  });
});
