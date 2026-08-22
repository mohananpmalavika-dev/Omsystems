import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnterpriseStoragePool } from "../../src/storage/enterprise-storage-pool.js";
import { LocalDiskStorageProvider } from "../../src/storage/providers/local-disk-storage.provider.js";
import { NasStorageProvider } from "../../src/storage/providers/nas-storage.provider.js";
import { S3StorageProvider } from "../../src/storage/providers/s3-storage.provider.js";
import { ArchiveStorageProvider } from "../../src/storage/providers/archive-storage.provider.js";

describe("EnterpriseStoragePool Multi-Tier & Spillover Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vms-pool-test-"));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("selects healthy primary HOT node for initial writes", async () => {
    const pool = new EnterpriseStoragePool();

    const hotDisk = new LocalDiskStorageProvider({
      nodeId: "nvme-hot-01",
      basePath: join(tempDir, "nvme-hot-01"),
      storageTier: "hot",
      simulatedCapacityBytes: 1_000_000_000,
      simulatedUsedBytes: 100_000_000, // 10%
    });

    const warmNas = new NasStorageProvider({
      nodeId: "nas-warm-01",
      sharePath: join(tempDir, "nas-warm-01"),
      storageTier: "warm",
    });

    pool.registerNode(hotDisk);
    pool.registerNode(warmNas);

    const selected = await pool.selectWritableNode("hot");
    expect(selected.nodeId).toBe("nvme-hot-01");
    expect(selected.storageTier).toBe("hot");
  });

  it("spills over to secondary tier when primary HOT storage is FULL (>95%)", async () => {
    const pool = new EnterpriseStoragePool();

    const fullHotDisk = new LocalDiskStorageProvider({
      nodeId: "nvme-hot-full",
      basePath: join(tempDir, "nvme-hot-full"),
      storageTier: "hot",
      simulatedCapacityBytes: 1_000_000_000,
      simulatedUsedBytes: 980_000_000, // 98% FULL
    });

    const healthyWarmNas = new NasStorageProvider({
      nodeId: "nas-warm-backup",
      sharePath: join(tempDir, "nas-warm-backup"),
      storageTier: "warm",
      simulatedCapacityBytes: 10_000_000_000,
      simulatedUsedBytes: 1_000_000_000, // 10%
    });

    pool.registerNode(fullHotDisk);
    pool.registerNode(healthyWarmNas);

    // Requesting hot tier should automatically spill over to healthy warm tier
    const selected = await pool.selectWritableNode("hot");
    expect(selected.nodeId).toBe("nas-warm-backup");
    expect(selected.storageTier).toBe("warm");
  });

  it("fails over when primary HOT storage goes OFFLINE", async () => {
    const pool = new EnterpriseStoragePool();

    const offlineHotDisk = new LocalDiskStorageProvider({
      nodeId: "nvme-offline",
      basePath: join(tempDir, "nvme-offline"),
      storageTier: "hot",
      forceOffline: true,
    });

    const cloudS3 = new S3StorageProvider({
      nodeId: "s3-warm-failover",
      bucket: "sentinel-failover-bucket",
      storageTier: "warm",
    });

    pool.registerNode(offlineHotDisk);
    pool.registerNode(cloudS3);

    const selected = await pool.selectWritableNode("hot");
    expect(selected.nodeId).toBe("s3-warm-failover");
  });

  it("migrates segments seamlessly across tiers (HOT -> WARM -> ARCHIVE)", async () => {
    const pool = new EnterpriseStoragePool();

    const hotDisk = new LocalDiskStorageProvider({
      nodeId: "nvme-hot",
      basePath: join(tempDir, "nvme-hot"),
      storageTier: "hot",
    });

    const warmS3 = new S3StorageProvider({
      nodeId: "s3-warm",
      bucket: "sentinel-warm-vault",
      storageTier: "warm",
    });

    const deepArchive = new ArchiveStorageProvider({
      nodeId: "glacier-archive",
      vaultOrBucketName: "sentinel-glacier",
    });

    pool.registerNode(hotDisk);
    pool.registerNode(warmS3);
    pool.registerNode(deepArchive);

    const segmentKey = "cam-vault/2026/08/17/segment-99.mkv";
    const segmentData = Buffer.from("CRITICAL_FINANCIAL_TRANSACTION_FOOTAGE");

    // 1. Initial write to HOT tier
    const writeResult = await hotDisk.writeSegment(segmentKey, segmentData);
    expect(writeResult.bytesWritten).toBe(segmentData.length);
    expect(await hotDisk.exists(segmentKey)).toBe(true);

    // 2. Lifecycle Migration: HOT -> WARM (S3)
    const migrateResult = await pool.migrateSegment(segmentKey, "nvme-hot", "s3-warm");
    expect(migrateResult.bytesWritten).toBe(segmentData.length);
    expect(await warmS3.exists(segmentKey)).toBe(true);
    expect(await hotDisk.exists(segmentKey)).toBe(false); // Deleted from hot tier

    // 3. Lifecycle Migration: WARM (S3) -> ARCHIVE (Glacier)
    const archiveResult = await pool.migrateSegment(segmentKey, "s3-warm", "glacier-archive");
    expect(archiveResult.bytesWritten).toBe(segmentData.length);
    expect(await deepArchive.exists(segmentKey)).toBe(true);
    expect(await warmS3.exists(segmentKey)).toBe(false); // Deleted from warm tier
  });
});
