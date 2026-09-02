import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FilesystemStorageBackend } from "../../recording-engine/src/backends/filesystem-storage.backend.js";
import { RecordingStagingService } from "../../recording-engine/src/staging/recording-staging.service.js";
import { writeAtomic } from "../../recording-engine/src/staging/atomic-write-helper.js";
import { StorageFullError } from "../../packages/contracts/src/storage/storage-errors.js";

const TEST_DIR = join(process.cwd(), "test-scratch", `test-fs-storage-${Date.now()}`);

describe("Local Filesystem Storage & Atomic Write Engine", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("performs crash-safe atomic write with checksum verification and directory flush", async () => {
    const targetFile = join(TEST_DIR, "atomic-test.mkv");
    const payload = Buffer.from("VIDEO_STREAM_BYTES_SAMPLE_DATA_12345");
    const expectedSha256 = createHash("sha256").update(payload).digest("hex");

    const result = await writeAtomic(targetFile, payload, { expectedSha256 });
    expect(result.sizeBytes).toBe(payload.length);
    expect(result.sha256).toBe(expectedSha256);

    const readBack = await readFile(targetFile);
    expect(readBack.equals(payload)).toBe(true);
  });

  it("runs write probe and verifies latency, payload, and SHA-256", async () => {
    const backend = new FilesystemStorageBackend({
      id: "node-local-test",
      recordingRoot: join(TEST_DIR, "recordings"),
    });

    const probe = await backend.runWriteProbe();
    expect(probe.status).toBe("passed");
    expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
    expect(probe.bytesWritten).toBeGreaterThan(0);
    expect(probe.checksum).toHaveLength(64);
  });

  it("stages and commits segment from RecordingStagingService to FilesystemStorageBackend", async () => {
    const stagingRoot = join(TEST_DIR, "staging");
    const recordingRoot = join(TEST_DIR, "storage");

    const stagingService = new RecordingStagingService(stagingRoot);
    const backend = new FilesystemStorageBackend({
      id: "node-local-test-2",
      recordingRoot,
    });

    // 1. Allocate staging
    const allocation = await stagingService.allocate("cam-front-gate", "seg-001");
    expect(allocation.partialPath.endsWith(".mkv.partial")).toBe(true);

    // 2. Write media content to partial file
    const mediaBytes = Buffer.from("SAMPLE_MEDIA_PACKET_CONTENT_999");
    await writeFile(allocation.partialPath, mediaBytes);

    // 3. Finalize local staging
    const finalized = await stagingService.finalize(allocation);
    expect(finalized.sizeBytes).toBe(mediaBytes.length);
    expect(finalized.sha256).toBeDefined();

    // 4. Commit to backend
    const writeResult = await backend.write({
      recordingId: "rec-101",
      segmentId: finalized.segmentId,
      tenantId: "tenant-bank",
      branchId: "branch-main",
      cameraId: finalized.cameraId,
      sourcePath: finalized.localFinalPath,
      expectedSizeBytes: finalized.sizeBytes,
      expectedSha256: finalized.sha256,
      startedAt: new Date("2026-09-02T10:00:00Z"),
      endedAt: new Date("2026-09-02T10:00:15Z"),
      contentType: "video/mp4",
    });

    expect(writeResult.status).toBe("COMMITTED");
    expect(writeResult.locator?.kind).toBe("FILESYSTEM");
    expect(writeResult.verified).toBe(true);
    expect(writeResult.sha256).toBe(finalized.sha256);

    // 5. Verify file exists on backend
    const exists = await backend.exists(writeResult.locator!);
    expect(exists).toBe(true);

    // 6. Clean up staging
    await stagingService.cleanup(finalized);
  });

  it("blocks writes when capacity threshold is reached (simulated disk-full protection)", async () => {
    const backend = new FilesystemStorageBackend({
      id: "node-full-test",
      recordingRoot: TEST_DIR,
      capacityPolicy: {
        stopWritePercent: 50, // artificially low for testing
        warningPercent: 40,
        criticalPercent: 45,
      },
    });

    // Artificially configure policy to stop write
    backend.setCapacityPolicy({
      minimumFreeBytes: Number.MAX_SAFE_INTEGER, // forces check to fail
    });

    const check = await backend.canAcceptWrite({ estimatedBytes: 1000 });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("capacity critical");

    // Attempting to write throws StorageFullError
    const testFile = join(TEST_DIR, "dummy.mkv");
    await writeFile(testFile, Buffer.from("dummy"));

    await expect(
      backend.write({
        recordingId: "rec-full",
        segmentId: "seg-full",
        tenantId: "t1",
        branchId: "b1",
        cameraId: "c1",
        sourcePath: testFile,
        expectedSizeBytes: 5,
        expectedSha256: "abc",
        startedAt: new Date(),
        endedAt: new Date(),
        contentType: "video/mp4",
      }),
    ).rejects.toThrow(StorageFullError);
  });
});
