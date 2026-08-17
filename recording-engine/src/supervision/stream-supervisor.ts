import { EventEmitter } from "node:events";
import { StreamStateMachine, type StreamState } from "./stream-state-machine.js";
import { ReconnectPolicy } from "./reconnect-policy.js";

export type RecordingHealth =
  | "HEALTHY"
  | "GAPPED"
  | "WRITE_FAILURE"
  | "INDEX_FAILURE"
  | "STORAGE_FAILURE"
  | "CORRUPT";

export interface StreamSupervisorMetrics {
  cameraId: string;
  streamId: string;
  desiredRecordingState: "RECORDING" | "STOPPED";
  actualStreamState: StreamState;
  actualRecordingHealth: RecordingHealth;
  lastPacketAt?: Date;
  lastFrameAt?: Date;
  lastKeyframeAt?: Date;
  lastSegmentStartedAt?: Date;
  lastSegmentFinalizedAt?: Date;
  segmentWriteLatencyMs?: number;
  recordingBitrateKbps?: number;
  recordingFps?: number;
  packetsReceived: number;
  decodeErrors: number;
  segmentsCreated: number;
  segmentsFailed: number;
  segmentsRecovered: number;
  currentStorageNode?: string;
  currentSegmentId?: string;
}

export interface StreamSupervisorConfig {
  cameraId: string;
  streamId?: string;
  packetTimeoutMs?: number;
  segmentFinalizationTimeoutMs?: number;
  expectedSegmentDurationSeconds?: number;
}

export class StreamSupervisor extends EventEmitter {
  public readonly config: Required<StreamSupervisorConfig>;
  private readonly stateMachine: StreamStateMachine;
  private readonly reconnectPolicy: ReconnectPolicy;

  private desiredState: "RECORDING" | "STOPPED" = "STOPPED";
  private recordingHealth: RecordingHealth = "HEALTHY";
  private lastPacketAt?: Date;
  private lastKeyframeAt?: Date;
  private lastSegmentStartedAt?: Date;
  private lastSegmentFinalizedAt?: Date;
  private packetsReceived = 0;
  private decodeErrors = 0;
  private segmentsCreated = 0;
  private segmentsFailed = 0;
  private segmentsRecovered = 0;
  private currentStorageNode?: string;
  private currentSegmentId?: string;

  private watchdogTimer?: NodeJS.Timeout;

  constructor(config: StreamSupervisorConfig) {
    super();
    this.config = {
      streamId: "main",
      packetTimeoutMs: 15000,
      segmentFinalizationTimeoutMs: (config.expectedSegmentDurationSeconds ?? 15) * 2000,
      expectedSegmentDurationSeconds: 15,
      ...config,
    };

    this.stateMachine = new StreamStateMachine("STOPPED");
    this.reconnectPolicy = new ReconnectPolicy();
  }

  startSupervision(): void {
    this.desiredState = "RECORDING";
    this.stateMachine.transition("STARTING", "supervision_started");
    this.startWatchdog();
  }

  stopSupervision(): void {
    this.desiredState = "STOPPED";
    this.stateMachine.transition("STOPPED", "supervision_stopped");
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
  }

  recordPacketReceived(isKeyframe = false): void {
    const now = new Date();
    this.lastPacketAt = now;
    this.packetsReceived += 1;
    if (isKeyframe) {
      this.lastKeyframeAt = now;
    }

    if (this.stateMachine.getState() === "STARTING" || this.stateMachine.getState() === "RECONNECTING") {
      this.stateMachine.transition("RECORDING", "packets_arriving");
      this.reconnectPolicy.recordConnectionSuccess(now);
    }
  }

  recordSegmentStarted(segmentId: string, storageNode: string): void {
    this.currentSegmentId = segmentId;
    this.currentStorageNode = storageNode;
    this.lastSegmentStartedAt = new Date();
    this.segmentsCreated += 1;
  }

  recordSegmentFinalized(segmentId: string, success: boolean): void {
    const now = new Date();
    this.lastSegmentFinalizedAt = now;
    if (success) {
      this.recordingHealth = "HEALTHY";
    } else {
      this.segmentsFailed += 1;
      this.recordingHealth = "WRITE_FAILURE";
    }
  }

  recordSegmentRecovered(): void {
    this.segmentsRecovered += 1;
  }

  recordDecodeError(): void {
    this.decodeErrors += 1;
  }

  setRecordingHealth(health: RecordingHealth): void {
    this.recordingHealth = health;
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);

    this.watchdogTimer = setInterval(() => {
      this.checkWatchdog();
    }, 2000);
    this.watchdogTimer.unref();
  }

  private checkWatchdog(): void {
    if (this.desiredState !== "RECORDING") return;

    const now = Date.now();

    // Check 1: Packet Arrival Timeout (Hung / Dead Stream)
    if (this.stateMachine.getState() === "RECORDING" && this.lastPacketAt) {
      const packetAgeMs = now - this.lastPacketAt.getTime();
      if (packetAgeMs > this.config.packetTimeoutMs) {
        this.stateMachine.transition("DEGRADED", `packet_timeout_${packetAgeMs}ms`);
        this.emit("watchdog:packet_timeout", {
          cameraId: this.config.cameraId,
          packetAgeMs,
        });
      }
    }

    // Check 2: Segment Finalization Delay (e.g. > 2x segment duration without finalized segment)
    if (this.lastSegmentFinalizedAt) {
      const finalizationAgeMs = now - this.lastSegmentFinalizedAt.getTime();
      if (finalizationAgeMs > this.config.segmentFinalizationTimeoutMs) {
        this.emit("watchdog:finalization_delayed", {
          cameraId: this.config.cameraId,
          finalizationAgeMs,
        });
      }
    }
  }

  getMetrics(): StreamSupervisorMetrics {
    return {
      cameraId: this.config.cameraId,
      streamId: this.config.streamId,
      desiredRecordingState: this.desiredState,
      actualStreamState: this.stateMachine.getState(),
      actualRecordingHealth: this.recordingHealth,
      lastPacketAt: this.lastPacketAt,
      lastKeyframeAt: this.lastKeyframeAt,
      lastSegmentStartedAt: this.lastSegmentStartedAt,
      lastSegmentFinalizedAt: this.lastSegmentFinalizedAt,
      packetsReceived: this.packetsReceived,
      decodeErrors: this.decodeErrors,
      segmentsCreated: this.segmentsCreated,
      segmentsFailed: this.segmentsFailed,
      segmentsRecovered: this.segmentsRecovered,
      currentStorageNode: this.currentStorageNode,
      currentSegmentId: this.currentSegmentId,
    };
  }

  getState(): StreamState {
    return this.stateMachine.getState();
  }

  getReconnectDelayMs(): number {
    return this.reconnectPolicy.getNextDelayMs();
  }
}
