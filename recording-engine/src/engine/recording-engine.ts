import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { RecordingJournal } from "../journal/recording-journal.js";
import { JournalReplayer, type ControlPlaneClient } from "../journal/journal-replayer.js";
import { RecoveryScanner, type RecoveryScanSummary } from "../recovery/recovery-scanner.js";
import { StorageNodeManager } from "../storage/storage-node-manager.js";
import { RecordingGapTracker, type RecordingGapItem } from "../gaps/recording-gap-tracker.js";
import { CheckpointManager } from "../state/checkpoint-manager.js";
import { RecordingWorkerPool, type ManagedWorker } from "./recording-worker.js";
import { RangeExporter, type RangeExportRequest, type RangeExportResult, type SegmentCoverageItem } from "../evidence/range-exporter.js";
import type { RecordingSessionConfig } from "./recording-session.js";

export interface RecordingEngineConfig {
  rootDirectory: string;
  storageNodeExternalId: string;
  controlPlaneClient?: ControlPlaneClient;
}

export class RecordingEngine {
  public readonly config: RecordingEngineConfig;
  public readonly journal: RecordingJournal;
  public readonly replayer?: JournalReplayer;
  public readonly recoveryScanner: RecoveryScanner;
  public readonly storageManager: StorageNodeManager;
  public readonly gapTracker: RecordingGapTracker;
  public readonly checkpointManager: CheckpointManager;
  public readonly workerPool: RecordingWorkerPool;

  private isStarted = false;
  private readonly stagingRoot: string;
  private readonly storageRoot: string;
  private readonly quarantineRoot: string;
  private readonly journalDir: string;

  constructor(config: RecordingEngineConfig) {
    this.config = config;
    this.stagingRoot = join(config.rootDirectory, "staging");
    this.storageRoot = join(config.rootDirectory, "segments");
    this.quarantineRoot = join(config.rootDirectory, "quarantine");
    this.journalDir = join(config.rootDirectory, "journal");

    this.journal = new RecordingJournal(this.journalDir);
    if (config.controlPlaneClient) {
      this.replayer = new JournalReplayer(this.journal, config.controlPlaneClient);
    }

    this.recoveryScanner = new RecoveryScanner({ journal: this.journal });
    this.storageManager = new StorageNodeManager();
    this.gapTracker = new RecordingGapTracker();
    this.checkpointManager = new CheckpointManager(config.rootDirectory);

    this.workerPool = new RecordingWorkerPool({
      journal: this.journal,
      gapTracker: this.gapTracker,
      storageManager: this.storageManager,
    });
  }

  /**
   * Boot sequence for the Authoritative RecordingEngine:
   * 1. Initialize CheckpointManager & Journal
   * 2. If crash detected or unindexed partials exist -> Run Phase 1 Fast Recovery
   * 3. Replay unplayed WAL entries
   * 4. Resume camera recording workers
   * 5. Trigger Phase 2 Deep Scan in the background
   */
  async start(): Promise<{ recoverySummary?: RecoveryScanSummary }> {
    if (this.isStarted) return {};
    this.isStarted = true;

    await mkdir(this.stagingRoot, { recursive: true });
    await mkdir(this.storageRoot, { recursive: true });
    await mkdir(this.quarantineRoot, { recursive: true });
    await mkdir(this.journalDir, { recursive: true });

    await this.journal.init();
    const { wasCleanShutdown } = await this.checkpointManager.init();

    let recoverySummary: RecoveryScanSummary | undefined;

    // Fast Phase 1 Recovery Scan
    recoverySummary = await this.recoveryScanner.runPhase1FastRecovery({
      stagingRoot: this.stagingRoot,
      storageRoot: this.storageRoot,
      quarantineRoot: this.quarantineRoot,
      tenantId: "system",
      branchId: "main",
      storageNode: this.config.storageNodeExternalId,
    });

    // Replay pending WAL
    if (this.replayer) {
      await this.replayer.replayPending().catch(() => {});
    }

    // Schedule background Phase 2 deep scan
    setTimeout(() => {
      void this.recoveryScanner.runPhase2DeepScan(
        {
          stagingRoot: this.stagingRoot,
          storageRoot: this.storageRoot,
          quarantineRoot: this.quarantineRoot,
          tenantId: "system",
          branchId: "main",
          storageNode: this.config.storageNodeExternalId,
        },
        new Set<string>(),
      ).catch(() => {});
    }, 1000).unref();

    return { recoverySummary };
  }

  /**
   * Starts recording a camera session.
   */
  async startCameraRecording(input: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    streamId?: string;
    jobId: string;
    sourceUri: string;
    segmentDurationSeconds?: number;
  }): Promise<ManagedWorker> {
    const sessionConfig: RecordingSessionConfig = {
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      streamId: input.streamId ?? "main",
      jobId: input.jobId,
      sourceUri: input.sourceUri,
      segmentDurationSeconds: input.segmentDurationSeconds ?? 15,
      stagingRoot: this.stagingRoot,
      storageRoot: this.storageRoot,
      preferredStorageNode: this.config.storageNodeExternalId,
    };

    return this.workerPool.startWorker(sessionConfig);
  }

  /**
   * Stops recording a camera session.
   */
  async stopCameraRecording(cameraId: string): Promise<void> {
    await this.workerPool.stopWorker(cameraId);
  }

  /**
   * Slices and exports a video range from existing immutable recording segments.
   */
  async exportRange(
    request: RangeExportRequest,
    matchingSegments: SegmentCoverageItem[],
  ): Promise<RangeExportResult> {
    return RangeExporter.exportRange(request, matchingSegments);
  }

  /**
   * Graceful shutdown:
   * 1. Stops all camera workers and finalizes current segments
   * 2. Flushes WAL
   * 3. Records clean shutdown marker in engine-state.json
   */
  async shutdown(): Promise<void> {
    if (!this.isStarted) return;
    this.isStarted = false;

    await this.workerPool.stopAll();

    if (this.replayer) {
      await this.replayer.replayPending().catch(() => {});
    }

    await this.checkpointManager.recordGracefulShutdown();
  }

  getActiveGaps(): RecordingGapItem[] {
    const gaps: RecordingGapItem[] = [];
    for (const worker of this.workerPool.getAllWorkers()) {
      const gap = this.gapTracker.getActiveGap(worker.config.cameraId);
      if (gap) gaps.push(gap);
    }
    return gaps;
  }
}
