import { describe, it, expect, beforeEach, vi } from "vitest";
import { EdgeStoreForwardJournal } from "../../src/edge-sync/edge-store-forward-journal.js";
import { WANStatusMonitor } from "../../src/edge-sync/wan-status-monitor.js";
import { EdgeBackfillReconciliationEngine } from "../../src/edge-sync/edge-backfill-reconciliation.js";
import { createHash } from "node:crypto";
import type { Pool } from "pg";

describe("Edge Store-and-Forward Sync Engine & WAN Disconnection Hardening", () => {
  let committedSegments: any[] = [];

  function createMockCentralPool() {
    return {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (sql.includes("SELECT id, camera_id, started_at, ended_at")) {
          const cameraId = params?.[0];
          const filtered = committedSegments.filter((s) => s.camera_id === cameraId);
          return { rows: filtered, rowCount: filtered.length };
        }

        if (sql.includes("INSERT INTO recording_segments")) {
          const row = {
            id: params?.[0],
            tenant_id: params?.[1],
            node_id: params?.[2],
            camera_id: params?.[3],
            started_at: params?.[4],
            ended_at: params?.[5],
            duration_seconds: params?.[6],
            size_bytes: params?.[7],
            storage_path: params?.[8],
            storage_uri: params?.[9],
            checksum_sha256: params?.[10],
          };
          committedSegments.push(row);
          return { rows: [row], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
    } as unknown as Pool;
  }

  beforeEach(() => {
    committedSegments = [];
  });

  it("buffers recordings during 30 days of offline WAN isolation and enforces smart quota pruning", () => {
    const journal = new EdgeStoreForwardJournal({
      maxStorageBytes: 10 * 1024 * 1024, // 10 MB test quota
      retentionDays: 30,
    });

    const now = Date.now();
    const dayMs = 86400 * 1000;

    // Simulate 30 days of recording (1 segment per day, 500 KB each = 15 MB total)
    for (let day = 30; day >= 1; day--) {
      const segStart = new Date(now - day * dayMs).toISOString();
      const segEnd = new Date(now - day * dayMs + 3600 * 1000).toISOString();

      journal.registerSegment({
        tenantId: "00000000-0000-0000-0000-000000000001",
        branchId: "branch-alpha-01",
        cameraId: "CAM-NORTH-01",
        startTime: segStart,
        endTime: segEnd,
        durationMs: 3600 * 1000,
        fileSize: 500 * 1024, // 500 KB
        sha256: createHash("sha256").update(`seg-day-${day}`).digest("hex"),
        storagePath: `local/recordings/day_${day}.mp4`,
      });
    }

    const stats = journal.getStats();
    expect(stats.totalSegments).toBe(30);
    expect(stats.pendingCount).toBe(30);
    expect(stats.syncedCount).toBe(0);

    // Simulate synchronizing the first 10 days
    const pending = journal.getPendingSyncSegments();
    const firstTenIds = pending.slice(0, 10).map((s) => s.id);
    journal.markSegmentsSynced(firstTenIds);

    expect(journal.getStats().syncedCount).toBe(10);
    expect(journal.getStats().pendingCount).toBe(20);

    // Register a new large segment to exceed the 10 MB quota
    journal.registerSegment({
      tenantId: "00000000-0000-0000-0000-000000000001",
      branchId: "branch-alpha-01",
      cameraId: "CAM-NORTH-01",
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 60000).toISOString(),
      durationMs: 60000,
      fileSize: 2 * 1024 * 1024,
      sha256: "hash-new-burst",
      storagePath: "local/burst.mp4",
    });

    // Old SYNCED segments should be pruned to free headroom, while PENDING segments are strictly preserved!
    const updatedStats = journal.getStats();
    expect(updatedStats.pendingCount).toBe(21); // All unsynced segments preserved
    expect(updatedStats.syncedCount).toBeLessThan(10); // Old synced segments pruned
  });

  it("WANStatusMonitor tracks connection failure and triggers state transitions", async () => {
    let linkAlive = true;
    const monitor = new WANStatusMonitor({
      heartbeatIntervalMs: 0,
      failureThreshold: 2,
      recoveryThreshold: 2,
      probeFn: async () => linkAlive,
    });

    expect(monitor.isOnline()).toBe(true);

    let disconnectedEmitted = false;
    let recoveredEmitted = false;

    monitor.on("wan_disconnected", () => { disconnectedEmitted = true; });
    monitor.on("wan_recovered", () => { recoveredEmitted = true; });

    // Probe 1 fails -> DEGRADED
    linkAlive = false;
    await monitor.probe();
    expect(monitor.getState()).toBe("DEGRADED");
    expect(disconnectedEmitted).toBe(false);

    // Probe 2 fails -> ISOLATED_OFFLINE
    await monitor.probe();
    expect(monitor.isIsolated()).toBe(true);
    expect(disconnectedEmitted).toBe(true);

    // Link recovers: 1st success keeps in recovery
    linkAlive = true;
    await monitor.probe();
    expect(monitor.getState()).toBe("ISOLATED_OFFLINE");

    // 2nd consecutive success -> recovers to ONLINE
    await monitor.probe();
    expect(monitor.isOnline()).toBe(true);
    expect(recoveredEmitted).toBe(true);
  });

  it("reconciles offline buffered recordings with Zero-Duplicate Frame algorithm", async () => {
    const journal = new EdgeStoreForwardJournal();
    const mockPool = createMockCentralPool();
    const engine = new EdgeBackfillReconciliationEngine(mockPool, journal);

    const baseTime = 1700000000000;
    const tenMin = 600 * 1000;

    // Simulate an existing central segment (already recorded before WAN failure)
    committedSegments.push({
      id: "seg-central-pre-failure",
      camera_id: "CAM-SOUTH-01",
      started_at: new Date(baseTime).toISOString(),
      ended_at: new Date(baseTime + tenMin).toISOString(),
      storage_path: "central/seg_0.mp4",
      checksum_sha256: "hash-seg-0",
      duration_seconds: 600,
    });

    // 1. Edge has exact duplicate of seg 0 (already synced previously)
    journal.registerSegment({
      id: "edge-seg-0",
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-SOUTH-01",
      startTime: new Date(baseTime).toISOString(),
      endTime: new Date(baseTime + tenMin).toISOString(),
      durationMs: tenMin,
      fileSize: 1000,
      sha256: "hash-seg-0",
      storagePath: "edge/seg_0.mp4",
    });

    // 2. Edge has segment 1 that was partially uploaded when WAN cut at minute 12 (overlaps minute 10..12)
    journal.registerSegment({
      id: "edge-seg-1-overlapping",
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-SOUTH-01",
      startTime: new Date(baseTime + 8 * 60 * 1000).toISOString(), // Starts at min 8 (overlap with min 10)
      endTime: new Date(baseTime + 20 * 60 * 1000).toISOString(),  // Ends at min 20
      durationMs: 12 * 60 * 1000,
      fileSize: 2000,
      sha256: "hash-seg-1",
      storagePath: "edge/seg_1.mp4",
    });

    // 3. Edge has segment 2: completely new recording during WAN isolation (min 20..30)
    journal.registerSegment({
      id: "edge-seg-2-new",
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-SOUTH-01",
      startTime: new Date(baseTime + 20 * 60 * 1000).toISOString(),
      endTime: new Date(baseTime + 30 * 60 * 1000).toISOString(),
      durationMs: tenMin,
      fileSize: 1500,
      sha256: "hash-seg-2",
      storagePath: "edge/seg_2.mp4",
    });

    // Execute backfill reconciliation
    const summary = await engine.reconcile("CAM-SOUTH-01");

    expect(summary.scannedEdgeSegments).toBe(3);
    expect(summary.skippedDuplicates).toBe(1);      // seg 0 exact duplicate skipped
    expect(summary.reconciledOverlaps).toBe(1);    // seg 1 boundary adjusted to min 10
    expect(summary.syncedCount).toBe(2);           // seg 1 + seg 2 committed
    expect(summary.failedCount).toBe(0);

    // Verify all journal entries are now marked SYNCED
    expect(journal.getPendingSyncSegments().length).toBe(0);

    // Verify committed segments in central: no duplicate intervals
    expect(committedSegments.length).toBe(3);

    // Check adjusted boundary of the overlapping segment
    const adjustedSeg = committedSegments.find((s) => s.id === "edge-seg-1-overlapping");
    expect(adjustedSeg).toBeDefined();
    // Start time must have been adjusted to min 10 (baseTime + tenMin) to avoid double frames
    expect(new Date(adjustedSeg.started_at).getTime()).toBe(baseTime + tenMin);
  });
});
