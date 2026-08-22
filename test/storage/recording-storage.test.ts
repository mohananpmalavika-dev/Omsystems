import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorageProvider } from "../../src/storage/providers/local-disk-storage.provider.js";
import { NasStorageProvider } from "../../src/storage/providers/nas-storage.provider.js";
import { SanStorageProvider } from "../../src/storage/providers/san-storage.provider.js";
import { S3StorageProvider } from "../../src/storage/providers/s3-storage.provider.js";
import { ArchiveStorageProvider } from "../../src/storage/providers/archive-storage.provider.js";

describe("Enterprise RecordingStorage Providers Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vms-storage-test-"));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("1. LocalDiskStorageProvider", () => {
    it("performs atomic write, byte-range read, and health checks", async () => {
      const local = new LocalDiskStorageProvider({
        nodeId: "local-vault-01",
        basePath: join(tempDir, "local-vault"),
        storageTier: "hot",
      });

      const videoData = Buffer.from("VIDEO_SEGMENT_PAYLOAD_KEYFRAME_DATA_1234567890");
      const writeResult = await local.writeSegment("cam-01/2026/08/17/seg01.mkv", videoData, {
        fps: 30,
        codec: "h264",
      });

      expect(writeResult.bytesWritten).toBe(videoData.length);
      expect(writeResult.sha256).toBeDefined();
      expect(writeResult.uri).toBe("recording://local-vault-01/cam-01/2026/08/17/seg01.mkv");

      expect(await local.exists("cam-01/2026/08/17/seg01.mkv")).toBe(true);

      // Full read
      const readBuffer = (await local.readSegment("cam-01/2026/08/17/seg01.mkv")) as Buffer;
      expect(readBuffer.toString()).toBe(videoData.toString());

      // Health check
      const health = await local.health();
      expect(health.healthState).toBe("HEALTHY");
      expect(health.storageType).toBe("local-disk");
      expect(health.storageTier).toBe("hot");
      expect(health.totalWritesAttempted).toBe(1);
      expect(health.failedWritesCount).toBe(0);

      // Delete
      await local.deleteSegment("cam-01/2026/08/17/seg01.mkv");
      expect(await local.exists("cam-01/2026/08/17/seg01.mkv")).toBe(false);
    });
  });

  describe("2. NasStorageProvider", () => {
    it("handles network share writes and latency telemetry", async () => {
      const nas = new NasStorageProvider({
        nodeId: "nas-branch-01",
        sharePath: join(tempDir, "nas-share"),
        protocol: "nfs",
        serverHost: "192.168.1.50",
        storageTier: "warm",
      });

      const data = Buffer.from("NAS_RECORDING_CHUNK_ABCXYZ");
      const res = await nas.writeSegment("cam-02/seg02.mkv", data);

      expect(res.bytesWritten).toBe(data.length);
      expect(await nas.exists("cam-02/seg02.mkv")).toBe(true);

      const health = await nas.health();
      expect(health.storageType).toBe("nas");
      expect(health.storageTier).toBe("warm");
      expect(health.healthState).toBe("HEALTHY");
      expect(health.filesystem?.filesystemType).toBe("NFS");
    });
  });

  describe("3. SanStorageProvider", () => {
    it("manages high-throughput block mounts and multipath status", async () => {
      const san = new SanStorageProvider({
        nodeId: "san-core-01",
        volumeMountPath: join(tempDir, "san-lun01"),
        sanProtocol: "fc",
        iqnOrWwn: "50:01:43:80:18:6b:4a:20",
        storageTier: "hot",
        multipathActivePaths: 4,
        multipathTotalPaths: 4,
      });

      const data = Buffer.from("SAN_HIGH_PERFORMANCE_BLOCK_RECORDING");
      const res = await san.writeSegment("cam-03/seg03.mkv", data);

      expect(res.bytesWritten).toBe(data.length);
      expect(res.metadata?.multipath).toBe("4/4");

      const health = await san.health();
      expect(health.storageType).toBe("san");
      expect(health.healthState).toBe("HEALTHY");
    });
  });

  describe("4. S3StorageProvider", () => {
    it("supports object storage, range reads, and prefix addressing", async () => {
      const s3 = new S3StorageProvider({
        nodeId: "s3-cloud-vault",
        bucket: "sentinel-cloud-recordings",
        prefix: "branch-kollam",
        storageTier: "warm",
      });

      const data = Buffer.from("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      const res = await s3.writeSegment("vault/seg04.mkv", data);

      expect(res.bytesWritten).toBe(data.length);
      expect(res.uri).toBe("s3://sentinel-cloud-recordings/branch-kollam/vault/seg04.mkv");
      expect(await s3.exists("vault/seg04.mkv")).toBe(true);

      // Byte range read (e.g. index header 0-9)
      const rangeStream = (await s3.readSegment("vault/seg04.mkv", { start: 0, end: 9 })) as any;
      const chunks: Buffer[] = [];
      for await (const chunk of rangeStream) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe("0123456789");

      const health = await s3.health();
      expect(health.storageType).toBe("s3");
      expect(health.healthState).toBe("HEALTHY");
    });
  });

  describe("5. ArchiveStorageProvider", () => {
    it("enforces asynchronous restore lifecycle for cold/tape storage", async () => {
      const archive = new ArchiveStorageProvider({
        nodeId: "archive-tape-01",
        vaultOrBucketName: "sentinel-deep-archive",
        medium: "tape-vtl",
      });

      const data = Buffer.from("COLD_ARCHIVED_EVIDENCE_RECORDING");
      await archive.writeSegment("incidents/2026/ev-100.mkv", data);

      expect(await archive.exists("incidents/2026/ev-100.mkv")).toBe(true);

      // Reading without restore should fail
      await expect(archive.readSegment("incidents/2026/ev-100.mkv")).rejects.toThrow(
        "ArchiveRestoreRequired",
      );

      // Request restore
      const restoreRes = await archive.requestRestore("incidents/2026/ev-100.mkv", 3);
      expect(restoreRes.status).toBe("RESTORED");

      // Reading after restore succeeds
      const readBuf = (await archive.readSegment("incidents/2026/ev-100.mkv")) as Buffer;
      expect(readBuf.toString()).toBe(data.toString());

      const health = await archive.health();
      expect(health.storageType).toBe("archive");
      expect(health.storageTier).toBe("archive");
      expect(health.healthState).toBe("HEALTHY");
    });
  });
});
