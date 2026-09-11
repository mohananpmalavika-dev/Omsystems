import { describe, expect, it } from "vitest";
import { StorageFailoverManager } from "../../recording-engine/src/storage-failover-manager.js";
import type { StorageDestinationAdapter } from "../../recording-engine/src/storage-adapter.js";

const localOnlyAdapter: StorageDestinationAdapter = {
  getMetrics: async () => ({ capacityBytes: 1, usedBytes: 0, availableBytes: 1, status: "healthy", supportedTiers: ["hot"], storageType: "local-disk", supportedProtocols: [], mountPath: "/recordings" }),
  getStagingPath: async () => "/recordings",
  resolveSegmentTargetPath: () => "/recordings/segment.mp4",
  deleteSegmentFile: async () => {},
  runWriteProbe: async () => ({ status: "passed", latencyMs: 1, bytesWritten: 1, checksum: "a" }),
};

describe("storage failover retry queue", () => {
  it("rejects unregistered or non-export-capable retry targets before queueing data", () => {
    const manager = new StorageFailoverManager();
    manager.registerTier("local", localOnlyAdapter, 1);
    const item = { localPath: "/tmp/a", targetTier: "local", targetPath: "a", maxAttempts: 3, recordingId: "recording-a", cameraId: "camera-a", sizeBytes: 1 };

    expect(() => manager.addToRetryQueue(item)).toThrow("storage_retry_target_not_export_capable:local");
    expect(() => manager.addToRetryQueue({ ...item, targetTier: "missing" })).toThrow("storage_retry_target_not_registered:missing");
    expect(manager.getRetryQueue()).toHaveLength(0);
  });
});
