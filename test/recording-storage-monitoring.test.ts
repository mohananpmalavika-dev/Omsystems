import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalDiskStorageAdapter } from "../recording-engine/src/storage-adapter.js";

describe("LocalDiskStorageAdapter write probe", () => {
  it("writes, flushes, reads, validates checksum, and deletes the probe payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-probe-"));
    try {
      const adapter = new LocalDiskStorageAdapter({
        recordingRoot: root,
        supportedTiers: ["hot"],
        storageType: "local-disk",
        supportedProtocols: ["fs"],
      });

      const result = await adapter.runWriteProbe();

      expect(result.status).toBe("passed");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.bytesWritten).toBeGreaterThan(0);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
