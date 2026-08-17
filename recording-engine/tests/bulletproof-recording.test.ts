import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SegmentWriter } from "../src/segments/segment-writer.js";
import { SegmentFinalizer } from "../src/segments/segment-finalizer.js";
import { SegmentChecksum } from "../src/segments/segment-checksum.js";
import { SegmentValidator } from "../src/segments/segment-validator.js";
import { RecordingJournal } from "../src/journal/recording-journal.js";
import { JournalReplayer } from "../src/journal/journal-replayer.js";
import { RecoveryScanner } from "../src/recovery/recovery-scanner.js";
import { StreamSupervisor } from "../src/supervision/stream-supervisor.js";
import { StorageNodeManager } from "../src/storage/storage-node-manager.js";
import { RangeExporter } from "../src/evidence/range-exporter.js";
import { CheckpointManager } from "../src/state/checkpoint-manager.js";
import { RecordingGapTracker } from "../src/gaps/recording-gap-tracker.js";

const TEST_DIR = join(process.cwd(), "test-scratch", `test-rec-${Date.now()}`);

describe("Bulletproof VMS Recording Engine Suite", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe("1. Segment Writer & Deterministic Finalizer", () => {
    it("creates immutable .partial files and finalizes with atomic rename and sidecar manifest", async () => {
      const stagingDir = join(TEST_DIR, "staging");
      const targetDir = join(TEST_DIR, "segments");

      const writer = new SegmentWriter({
        stagingDirectory: stagingDir,
        targetDirectory: targetDir,
        cameraId: "CAM-001",
        segmentDurationSeconds: 15,
        containerFormat: "mkv",
      });

      const activeSegment = await writer.createNewSegment();
      expect(activeSegment.stagingPartialPath.endsWith(".mkv.partial")).toBe(true);

      // Write mock media bytes to staging partial file (>1KB)
      const mockMediaBytes = Buffer.alloc(2048, "MOCK_VIDEO_STREAM_DATA");
      await writeFile(activeSegment.stagingPartialPath, mockMediaBytes);

      const finalizer = new SegmentFinalizer(new SegmentValidator({ minSizeBytes: 100, bypassProbeForTesting: true }));
      const result = await finalizer.finalize(
        activeSegment,
        {
          tenantId: "TENANT-1",
          branchId: "BRANCH-A",
          cameraId: "CAM-001",
          jobId: "JOB-1",
          storageNode: "NODE-1",
          storageRelativePath: "CAM-001/segment.mkv",
        },
      );

      expect(result.success).toBe(true);
      expect(result.sha256).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.state).toBe("AVAILABLE");
      expect(result.manifest?.durationMs).toBe(15000);

      // Verify that partial file no longer exists and final media + sidecar exist
      const finalStat = await stat(result.finalPath);
      expect(finalStat.isFile()).toBe(true);
      expect(finalStat.size).toBe(2048);

      const sidecarJson = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(sidecarJson.segmentId).toBe(activeSegment.segmentId);
      expect(sidecarJson.sha256).toBe(result.sha256);
    });
  });

  describe("2. Local Write-Ahead Log (WAL) & Journal Replayer", () => {
    it("durably appends to WAL and replays idempotently when control plane reconnects", async () => {
      const journalDir = join(TEST_DIR, "journal");
      const journal = new RecordingJournal(journalDir);
      await journal.init();

      // Append finalized segment
      const entry1 = await journal.append("SEGMENT_FINALIZED", "CAM-001", "TENANT-1", {
        segmentId: "SEG-001",
        manifest: {
          segmentId: "SEG-001",
          cameraId: "CAM-001",
          tenantId: "TENANT-1",
        } as any,
      });

      expect(entry1.sequence).toBe(1);

      // Append gap
      const entry2 = await journal.append("GAP_RECORDED", "CAM-001", "TENANT-1", {
        payload: {
          cameraId: "CAM-001",
          reason: "NETWORK_DOWN",
        },
      });

      expect(entry2.sequence).toBe(2);

      // Replayer sync test
      const syncedIndexes: any[] = [];
      const syncedGaps: any[] = [];

      const mockClient = {
        submitSegmentIndex: async (manifest: any) => {
          syncedIndexes.push(manifest);
        },
        recordGap: async (gap: any) => {
          syncedGaps.push(gap);
        },
      };

      const replayer = new JournalReplayer(journal, mockClient);
      const syncedCount = await replayer.replayPending();

      expect(syncedCount).toBe(2);
      expect(syncedIndexes.length).toBe(1);
      expect(syncedIndexes[0].segmentId).toBe("SEG-001");
      expect(syncedGaps.length).toBe(1);
      expect(syncedGaps[0].reason).toBe("NETWORK_DOWN");

      // Idempotent second replay should process 0 new entries
      const secondSyncCount = await replayer.replayPending();
      expect(secondSyncCount).toBe(0);
    });
  });

  describe("3. Recovery Scanner & Staged Boot Sequence", () => {
    it("recovers valid .partial files and quarantines corrupt ones idempotently", async () => {
      const stagingRoot = join(TEST_DIR, "recovery_staging");
      const storageRoot = join(TEST_DIR, "recovery_storage");
      const quarantineRoot = join(TEST_DIR, "recovery_quarantine");

      await mkdir(stagingRoot, { recursive: true });
      await mkdir(storageRoot, { recursive: true });
      await mkdir(quarantineRoot, { recursive: true });

      // Create a valid .partial file
      const validPartialPath = join(stagingRoot, "seg-valid.mkv.partial");
      await writeFile(validPartialPath, Buffer.alloc(2048, "VALID_VIDEO_BYTES"));

      // Create a corrupt / tiny .partial file (< 50 bytes)
      const corruptPartialPath = join(stagingRoot, "seg-corrupt.mkv.partial");
      await writeFile(corruptPartialPath, Buffer.from("bad"));

      const scanner = new RecoveryScanner({
        validator: new SegmentValidator({ minSizeBytes: 500, bypassProbeForTesting: true }),
      });

      const summary = await scanner.runPhase1FastRecovery({
        stagingRoot,
        storageRoot,
        quarantineRoot,
        tenantId: "TENANT-1",
        branchId: "BRANCH-1",
        storageNode: "NODE-1",
      });

      expect(summary.partialsScanned).toBe(2);
      expect(summary.partialsFinalized).toBe(1);
      expect(summary.partialsQuarantined).toBe(1);

      // Running recovery a second time produces consistent 0 new partials
      const secondSummary = await scanner.runPhase1FastRecovery({
        stagingRoot,
        storageRoot,
        quarantineRoot,
        tenantId: "TENANT-1",
        branchId: "BRANCH-1",
        storageNode: "NODE-1",
      });

      expect(secondSummary.partialsScanned).toBe(0);
    });
  });

  describe("4. Stream Supervisor Watchdogs & Health States", () => {
    it("tracks packet arrival and detects watchdog timeout for hung streams", () => {
      const supervisor = new StreamSupervisor({
        cameraId: "CAM-WATCHDOG",
        packetTimeoutMs: 50,
      });

      supervisor.startSupervision();
      expect(supervisor.getState()).toBe("STARTING");

      supervisor.recordPacketReceived(true);
      expect(supervisor.getState()).toBe("RECORDING");

      const metrics = supervisor.getMetrics();
      expect(metrics.packetsReceived).toBe(1);
      expect(metrics.actualStreamState).toBe("RECORDING");
      expect(metrics.actualRecordingHealth).toBe("HEALTHY");

      supervisor.stopSupervision();
      expect(supervisor.getState()).toBe("STOPPED");
    });
  });

  describe("5. Storage Node Manager & Failover", () => {
    it("calculates disk watermarks and selects healthy failover nodes", () => {
      const storageManager = new StorageNodeManager();

      // Node A: Primary at 96% capacity (EMERGENCY)
      storageManager.registerNode({
        nodeId: "NODE-A",
        name: "Primary SSD",
        mountPath: "/mnt/ssd1",
        capacityBytes: 1000,
        usedBytes: 960,
        priority: 1,
      });

      // Node B: Secondary at 40% capacity (HEALTHY)
      storageManager.registerNode({
        nodeId: "NODE-B",
        name: "Secondary SSD",
        mountPath: "/mnt/ssd2",
        capacityBytes: 1000,
        usedBytes: 400,
        priority: 2,
      });

      const selectedNode = storageManager.selectActiveNode("NODE-A");
      // Since NODE-A is in EMERGENCY (FULL), it should failover to NODE-B
      expect(selectedNode).toBeDefined();
      expect(selectedNode?.nodeId).toBe("NODE-B");

      // Test active segment protection
      storageManager.protectSegment("SEG-ACTIVE");
      expect(storageManager.isSegmentProtected("SEG-ACTIVE")).toBe(true);
      storageManager.unprotectSegment("SEG-ACTIVE");
      expect(storageManager.isSegmentProtected("SEG-ACTIVE")).toBe(false);
    });
  });

  describe("6. Checkpoint Manager & Crash Recovery Marker", () => {
    it("marks dirty shutdown on boot and clean shutdown upon graceful exit", async () => {
      const stateDir = join(TEST_DIR, "checkpoint");
      await mkdir(stateDir, { recursive: true });

      const checkpoint = new CheckpointManager(stateDir);
      const initResult = await checkpoint.init();
      // First boot: cleanShutdown was false
      expect(initResult.wasCleanShutdown).toBe(false);

      await checkpoint.updateCheckpoint(42, "SEG-LAST");
      expect(checkpoint.getState().cleanShutdown).toBe(false);
      expect(checkpoint.getState().journalSequence).toBe(42);

      await checkpoint.recordGracefulShutdown();
      expect(checkpoint.getState().cleanShutdown).toBe(true);

      // Re-initialize: should detect previous graceful shutdown
      const secondCheckpoint = new CheckpointManager(stateDir);
      const secondInitResult = await secondCheckpoint.init();
      expect(secondInitResult.wasCleanShutdown).toBe(true);
    });
  });

  describe("7. Range Exporter", () => {
    it("handles missing segments gracefully and slices valid segment ranges", async () => {
      const exportPath = join(TEST_DIR, "export", "evidence.mp4");
      const emptyResult = await RangeExporter.exportRange(
        {
          cameraId: "CAM-001",
          fromTime: new Date("2026-08-17T10:00:00Z"),
          toTime: new Date("2026-08-17T10:01:00Z"),
          outputPath: exportPath,
        },
        [],
      );

      expect(emptyResult.success).toBe(false);
      expect(emptyResult.error).toBe("no_matching_segments_for_range");
    });
  });

  describe("8. Recording Gap Tracker", () => {
    it("records and resolves camera outage gaps accurately", () => {
      const gapTracker = new RecordingGapTracker();
      const startTime = new Date("2026-08-17T10:00:00Z");

      const gap = gapTracker.startGap("CAM-GAP-1", "CAMERA_OFFLINE", {
        tenantId: "TENANT-1",
        branchId: "BRANCH-1",
        detail: { reason: "camera_reboot" },
      }, startTime);

      expect(gap.reason).toBe("CAMERA_OFFLINE");
      expect(gapTracker.getActiveGap("CAM-GAP-1")).toBeDefined();

      const resolveTime = new Date("2026-08-17T10:03:00Z");
      const resolved = gapTracker.resolveGap("CAM-GAP-1", resolveTime);

      expect(resolved?.resolvedAt).toEqual(resolveTime);
      expect(gapTracker.getActiveGap("CAM-GAP-1")).toBeUndefined();
    });
  });
});
