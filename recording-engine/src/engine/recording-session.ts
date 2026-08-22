import { EventEmitter } from "node:events";
import { join } from "node:path";
import { SegmentWriter, type ActiveSegment } from "../segments/segment-writer.js";
import { SegmentFinalizer } from "../segments/segment-finalizer.js";
import { StreamSupervisor } from "../supervision/stream-supervisor.js";
import { FfmpegStreamIngest } from "../ingest/ffmpeg-ingest.js";
import type { RecordingJournal } from "../journal/recording-journal.js";
import type { RecordingGapTracker } from "../gaps/recording-gap-tracker.js";
import type { StorageNodeManager } from "../storage/storage-node-manager.js";
import type { SegmentManifest } from "../manifest/segment-manifest.js";

export interface RecordingSessionConfig {
  tenantId: string;
  branchId: string;
  cameraId: string;
  streamId?: string;
  jobId: string;
  sourceUri: string;
  segmentDurationSeconds?: number;
  stagingRoot: string;
  storageRoot: string;
  preferredStorageNode?: string;
}

export class RecordingSession extends EventEmitter {
  public readonly config: Required<RecordingSessionConfig>;
  private readonly writer: SegmentWriter;
  private readonly finalizer: SegmentFinalizer;
  private readonly supervisor: StreamSupervisor;
  private readonly journal: RecordingJournal;
  private readonly gapTracker: RecordingGapTracker;
  private readonly storageManager: StorageNodeManager;

  private ingest?: FfmpegStreamIngest;
  private currentActiveSegment?: ActiveSegment;
  private isRunning = false;

  constructor(
    config: RecordingSessionConfig,
    dependencies: {
      journal: RecordingJournal;
      gapTracker: RecordingGapTracker;
      storageManager: StorageNodeManager;
      finalizer?: SegmentFinalizer;
    },
  ) {
    super();
    this.config = {
      streamId: "main",
      segmentDurationSeconds: 15,
      preferredStorageNode: "local-recorder",
      ...config,
    };

    this.journal = dependencies.journal;
    this.gapTracker = dependencies.gapTracker;
    this.storageManager = dependencies.storageManager;
    this.finalizer = dependencies.finalizer ?? new SegmentFinalizer();

    this.writer = new SegmentWriter({
      stagingDirectory: join(this.config.stagingRoot, this.config.cameraId),
      targetDirectory: join(this.config.storageRoot, this.config.cameraId),
      cameraId: this.config.cameraId,
      segmentDurationSeconds: this.config.segmentDurationSeconds,
      containerFormat: "mkv",
    });

    this.supervisor = new StreamSupervisor({
      cameraId: this.config.cameraId,
      streamId: this.config.streamId,
      expectedSegmentDurationSeconds: this.config.segmentDurationSeconds,
    });

    this.setupSupervisorListeners();
  }

  private setupSupervisorListeners(): void {
    this.supervisor.on("watchdog:packet_timeout", async ({ cameraId, packetAgeMs }) => {
      this.gapTracker.startGap(cameraId, "NETWORK_DOWN", {
        tenantId: this.config.tenantId,
        branchId: this.config.branchId,
        detail: { packetAgeMs },
      });
      await this.restartIngest("packet_timeout");
    });

    this.supervisor.on("watchdog:finalization_delayed", async ({ cameraId, finalizationAgeMs }) => {
      await this.restartIngest(`finalization_delayed_${finalizationAgeMs}ms`);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.supervisor.startSupervision();
    await this.startIngestProcess();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.supervisor.stopSupervision();
    if (this.ingest) {
      await this.ingest.stop();
      this.ingest = undefined;
    }

    // Finalize any in-flight active segment
    if (this.currentActiveSegment) {
      await this.finalizeCurrentSegment();
    }
  }

  private async startIngestProcess(): Promise<void> {
    const activeNode = this.storageManager.selectActiveNode(this.config.preferredStorageNode);
    if (!activeNode || !activeNode.isWritable) {
      this.supervisor.setRecordingHealth("STORAGE_FAILURE");
      this.gapTracker.startGap(this.config.cameraId, "STORAGE_UNAVAILABLE", {
        tenantId: this.config.tenantId,
        branchId: this.config.branchId,
        detail: { reason: "no_writable_storage_node" },
      });
      return;
    }

    // Create initial segment staging
    this.currentActiveSegment = await this.writer.createNewSegment();
    this.supervisor.recordSegmentStarted(this.currentActiveSegment.segmentId, activeNode.nodeId);
    this.storageManager.protectSegment(this.currentActiveSegment.segmentId);

    const stagingPattern = join(
      this.config.stagingRoot,
      this.config.cameraId,
      "%Y%m%d-%H%M%S.mkv.partial",
    );

    this.ingest = new FfmpegStreamIngest({
      cameraId: this.config.cameraId,
      sourceUri: this.config.sourceUri,
      segmentDurationSeconds: this.config.segmentDurationSeconds,
      outputPattern: stagingPattern,
      containerFormat: "mkv",
    });

    this.ingest.on("activity", () => {
      this.supervisor.recordPacketReceived();
      this.gapTracker.resolveGap(this.config.cameraId);
    });

    this.ingest.on("segment_completed", async (event) => {
      await this.handleSegmentCompleted(event.rawPath);
    });

    this.ingest.on("unexpected_exit", async (info) => {
      this.supervisor.recordDecodeError();
      const isAuthError = info.stderr.some((l: string) => /401|403|unauthori[sz]ed|login failed/i.test(l));
      const reason = isAuthError ? "AUTH_FAILURE" : "RTSP_FAILURE";

      this.gapTracker.startGap(this.config.cameraId, reason, {
        tenantId: this.config.tenantId,
        branchId: this.config.branchId,
        detail: { stderr: info.stderr },
      });

      if (this.isRunning) {
        const delay = this.supervisor.getReconnectDelayMs();
        setTimeout(() => {
          if (this.isRunning) void this.startIngestProcess();
        }, delay).unref();
      }
    });

    await this.ingest.start();
  }

  private async handleSegmentCompleted(rawPath: string): Promise<void> {
    if (!this.currentActiveSegment) return;

    const segment = this.currentActiveSegment;
    // Set actual partial path from ingest
    segment.stagingPartialPath = rawPath;

    await this.finalizeCurrentSegment();

    // Prepare next segment for continuous recording
    this.currentActiveSegment = await this.writer.createNewSegment();
    const activeNode = this.storageManager.selectActiveNode(this.config.preferredStorageNode);
    if (activeNode) {
      this.supervisor.recordSegmentStarted(this.currentActiveSegment.segmentId, activeNode.nodeId);
      this.storageManager.protectSegment(this.currentActiveSegment.segmentId);
    }
  }

  private async finalizeCurrentSegment(): Promise<SegmentManifest | undefined> {
    if (!this.currentActiveSegment) return undefined;

    const segment = this.currentActiveSegment;
    const activeNode = this.storageManager.selectActiveNode(this.config.preferredStorageNode);
    const storageNodeId = activeNode?.nodeId ?? this.config.preferredStorageNode;

    const result = await this.finalizer.finalize(
      segment,
      {
        tenantId: this.config.tenantId,
        branchId: this.config.branchId,
        cameraId: this.config.cameraId,
        streamId: this.config.streamId,
        jobId: this.config.jobId,
        storageNode: storageNodeId,
        storageRelativePath: join(this.config.cameraId, `${segment.segmentId}.mkv`),
      },
    );

    this.storageManager.unprotectSegment(segment.segmentId);
    this.supervisor.recordSegmentFinalized(segment.segmentId, result.success);

    if (result.success && result.manifest) {
      // Append to local Write-Ahead Log (WAL)
      await this.journal.append("SEGMENT_FINALIZED", this.config.cameraId, this.config.tenantId, {
        segmentId: segment.segmentId,
        branchId: this.config.branchId,
        manifest: result.manifest,
      });

      this.emit("segment:finalized", result.manifest);
      return result.manifest;
    }

    return undefined;
  }

  private async restartIngest(reason: string): Promise<void> {
    if (this.ingest) {
      await this.ingest.stop();
      this.ingest = undefined;
    }
    if (this.isRunning) {
      await this.startIngestProcess();
    }
  }

  getSupervisor(): StreamSupervisor {
    return this.supervisor;
  }
}
