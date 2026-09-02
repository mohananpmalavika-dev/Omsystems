import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { StoragePlacementService } from "../../recording-engine/src/failover/storage-placement.service.js";
import { DurableRetryQueue } from "../../recording-engine/src/failover/durable-retry-queue.js";
import type { StorageBackend } from "../../recording-engine/src/backends/storage-backend.interface.js";

const TEST_DIR = join(process.cwd(), "test-scratch", `test-failover-${Date.now()}`);

describe("Storage Placement & Durable Failover Engine", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe("Storage Placement Service", () => {
    it("selects healthy node with highest headroom and matching tier", async () => {
      const placementService = new StoragePlacementService();

      const primaryNode: Partial<StorageBackend> = {
        id: "node-primary-nas",
        type: "nfs",
        backendKind: "FILESYSTEM",
        getHealth: vi.fn().mockResolvedValue({
          status: "healthy",
          isWritable: true,
          consecutiveFailures: 0,
        }),
        getMetrics: vi.fn().mockResolvedValue({
          status: "healthy",
          capacity: { type: "FIXED", usedPercent: 88, totalBytes: 1000, usedBytes: 880, availableBytes: 120 },
          supportedTiers: ["hot", "warm"],
        }),
        canAcceptWrite: vi.fn().mockResolvedValue({ allowed: true }),
      };

      const secondaryNode: Partial<StorageBackend> = {
        id: "node-secondary-san",
        type: "san",
        backendKind: "FILESYSTEM",
        getHealth: vi.fn().mockResolvedValue({
          status: "healthy",
          isWritable: true,
          consecutiveFailures: 0,
        }),
        getMetrics: vi.fn().mockResolvedValue({
          status: "healthy",
          capacity: { type: "FIXED", usedPercent: 40, totalBytes: 2000, usedBytes: 800, availableBytes: 1200 },
          supportedTiers: ["hot", "warm", "cold"],
        }),
        canAcceptWrite: vi.fn().mockResolvedValue({ allowed: true }),
      };

      const selected = await placementService.selectOptimalNode([primaryNode as any, secondaryNode as any], {
        tier: "hot",
        estimatedBytes: 100,
      });

      // Secondary node has 60% free headroom vs primary's 12%, so secondary is chosen
      expect(selected.id).toBe("node-secondary-san");
    });
  });

  describe("Durable Retry Queue", () => {
    it("enqueues failed jobs, survives re-initialization (process restart), and tracks attempts", async () => {
      const queue1 = new DurableRetryQueue(TEST_DIR);
      await queue1.init();

      const job = await queue1.enqueue({
        segmentId: "seg-fail-01",
        recordingId: "rec-1",
        cameraId: "cam-1",
        tenantId: "t1",
        branchId: "b1",
        sourcePath: "/tmp/staging/seg-fail-01.final",
        targetNodeId: "node-s3-prod",
        targetTier: "archive",
        expectedSha256: "hash123",
        expectedSizeBytes: 2048,
        maxAttempts: 3,
      });

      expect(job.jobId).toBeDefined();
      expect(job.state).toBe("PENDING");

      // Simulate crash and new queue instance loading from disk
      const queue2 = new DurableRetryQueue(TEST_DIR);
      await queue2.init();

      const depth = await queue2.getDepth();
      expect(depth.total).toBe(1);
      expect(depth.pending).toBe(1);

      // Dequeue next job for processing
      const pendingJob = await queue2.getNextPending();
      expect(pendingJob).toBeDefined();
      expect(pendingJob!.jobId).toBe(job.jobId);
      expect(pendingJob!.state).toBe("RUNNING");
      expect(pendingJob!.attempts).toBe(1);

      // Mark success
      await queue2.markSucceeded(pendingJob!.jobId);
      const afterDepth = await queue2.getDepth();
      expect(afterDepth.total).toBe(0);
    });
  });
});
