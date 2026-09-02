import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { NfsStorageBackend, MountIdentityVerifier } from "../../recording-engine/src/backends/nfs-storage.backend.js";
import { MountDisappearedError } from "../../packages/contracts/src/storage/storage-errors.js";

const TEST_DIR = join(process.cwd(), "test-scratch", `test-nfs-${Date.now()}`);

describe("NFS Storage Backend & Mount Identity Verification", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
    vi.restoreAllMocks();
  });

  it("verifies mount identity and allows write operations when mount is verified", async () => {
    const backend = new NfsStorageBackend({
      id: "node-nfs-prod",
      recordingRoot: TEST_DIR,
      nfsConfig: {
        mountPath: TEST_DIR,
        expectedFsType: "nfs4",
        expectedRemote: "10.1.20.5:/recordings",
      },
    });

    const metrics = await backend.getMetrics();
    expect(metrics.storageType).toBe("nfs");
    expect(metrics.status).toBe("healthy");

    const probe = await backend.runWriteProbe();
    expect(probe.status).toBe("passed");
  });

  it("fails closed with MountDisappearedError when mount drops to prevent writing to root disk", async () => {
    const backend = new NfsStorageBackend({
      id: "node-nfs-dropped",
      recordingRoot: TEST_DIR,
      nfsConfig: {
        mountPath: "/mnt/remote/nfs-unmounted",
        expectedFsType: "nfs4",
        expectedRemote: "10.1.20.5:/recordings",
      },
    });

    // Mock MountIdentityVerifier to simulate dropped mount on Linux
    vi.spyOn(MountIdentityVerifier, "verifyMount").mockResolvedValueOnce({
      mounted: false,
      error: "Mount point '/mnt/remote/nfs-unmounted' not found in /proc/mounts",
    });

    const check = await backend.canAcceptWrite({ estimatedBytes: 500 });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("NFS Mount Verification Failed");

    // Write attempt fails closed with MountDisappearedError
    const testFile = join(TEST_DIR, "source.mkv");
    await writeFile(testFile, Buffer.from("test-content"));

    vi.spyOn(MountIdentityVerifier, "verifyMount").mockResolvedValueOnce({
      mounted: false,
      error: "Mount disappeared",
    });

    await expect(
      backend.write({
        recordingId: "rec-1",
        segmentId: "seg-1",
        tenantId: "t1",
        branchId: "b1",
        cameraId: "cam-1",
        sourcePath: testFile,
        expectedSizeBytes: 12,
        expectedSha256: createHash("sha256").update("test-content").digest("hex"),
        startedAt: new Date(),
        endedAt: new Date(),
        contentType: "video/mp4",
      }),
    ).rejects.toThrow(MountDisappearedError);
  });
});
