/**
 * Central Viewer Capacity Manager
 * 
 * Orchestrates capacity profiling, real-time performance telemetry, stream cost
 * estimation, priority-driven admission control, and preemption workflows.
 */

import { profileWorkstation, WorkstationProfileStore } from "./capacity-profiler.js";
import { detectCodecCapabilities, selectPreferredCodec } from "./codec-capability.js";
import { DecoderScheduler } from "./decoder-scheduler.js";
import { ViewerEventBus } from "./event-bus.js";
import { PerformanceMonitor } from "./performance-monitor.js";
import { calculatePriorityScore, resolvePriorityTier } from "./priority-engine.js";
import { calculateStreamCost } from "./stream-cost-estimator.js";
import type {
  AdmissionDecision,
  AdmissionResult,
  CameraTileState,
  StreamCandidate,
  StreamPriority,
  ViewerCapacity,
  ViewerEntitlement,
  ViewerPerformance,
} from "./types.js";

export const DEFAULT_VIEWER_ENTITLEMENT: ViewerEntitlement = {
  maxGridPositions: 144,
  maxBranchesVisible: 400,
  allowSequencing: true,
  allowPriorityPreemption: true,
  multiMonitorAllowed: true,
};

export class ViewerCapacityManager {
  private capacity: ViewerCapacity;
  private entitlement: ViewerEntitlement;
  private scheduler: DecoderScheduler;
  private performanceMonitor: PerformanceMonitor;
  private eventBus: ViewerEventBus;
  private knownCandidates = new Map<string, StreamCandidate>();

  constructor(
    customCapacity?: Partial<ViewerCapacity>,
    customEntitlement?: Partial<ViewerEntitlement>
  ) {
    // 1. Check if calibrated workstation profile is stored
    const saved = WorkstationProfileStore.loadProfile();
    const baseCapacity = saved?.measuredCapacity ?? profileWorkstation();

    this.capacity = {
      ...baseCapacity,
      ...customCapacity,
    };

    this.entitlement = {
      ...DEFAULT_VIEWER_ENTITLEMENT,
      ...customEntitlement,
    };

    this.scheduler = new DecoderScheduler();
    this.performanceMonitor = new PerformanceMonitor();
    this.eventBus = new ViewerEventBus();

    this.initAsyncProbing();
    this.setupInternalListeners();
  }

  private async initAsyncProbing(): Promise<void> {
    const codecCaps = await detectCodecCapabilities();
    const preferred = selectPreferredCodec(codecCaps);
    this.capacity.preferredCodec = preferred;
    this.capacity.supportedCodecs = codecCaps.filter((c) => c.supported).map((c) => c.codec);
  }

  private setupInternalListeners(): void {
    // Critical alert immediate promotion & preemption hook
    this.eventBus.on("camera.alert.critical", async ({ cameraId, branchId }) => {
      await this.promote(cameraId, "P1", { branchId, alertSeverity: "CRITICAL" });
    });
  }

  getCapacity(): ViewerCapacity {
    return { ...this.capacity };
  }

  getEntitlement(): ViewerEntitlement {
    return { ...this.entitlement };
  }

  getEventBus(): ViewerEventBus {
    return this.eventBus;
  }

  canAdmit(candidate: StreamCandidate): AdmissionDecision {
    return this.scheduler.canAdmit(this.capacity, candidate);
  }

  /**
   * Admits a stream into active decoding. If capacity is saturated, attempts
   * preemption of a lower priority stream.
   */
  async admit(candidate: StreamCandidate): Promise<AdmissionResult> {
    this.knownCandidates.set(candidate.cameraId, candidate);

    const score = calculatePriorityScore(candidate);
    const tier = resolvePriorityTier(candidate, score);
    const cost = calculateStreamCost(candidate.stream);

    const admission = this.canAdmit(candidate);

    if (admission.admitted) {
      this.capacity.activeDecoders += 1;
      this.capacity.activeBitrateMbps = Number(
        (this.capacity.activeBitrateMbps + cost.bitrateMbps).toFixed(2)
      );
      this.capacity.activePixelsPerSecond += cost.pixelsPerSec;

      const lease = this.scheduler.grantLease(candidate, score);

      return {
        success: true,
        streamState: candidate.stream.streamType === "MAIN" ? "MAIN_LIVE" : "SUB_LIVE",
        allocatedDecoder: true,
        lease,
      };
    }

    // Capacity full: attempt preemption
    const isCritical = tier === "P0" || tier === "P1";
    const victim = this.scheduler.findEvictionCandidate(score, isCritical);

    if (victim) {
      // Evict victim stream
      this.release(victim.cameraId);
      this.scheduler.preserveLastFrame(victim.cameraId);

      // Re-admit candidate
      this.capacity.activeDecoders += 1;
      this.capacity.activeBitrateMbps = Number(
        (this.capacity.activeBitrateMbps + cost.bitrateMbps).toFixed(2)
      );
      this.capacity.activePixelsPerSecond += cost.pixelsPerSec;

      const lease = this.scheduler.grantLease(candidate, score);

      return {
        success: true,
        streamState: candidate.stream.streamType === "MAIN" ? "MAIN_LIVE" : "SUB_LIVE",
        allocatedDecoder: true,
        lease,
        evictedCameraIds: [victim.cameraId],
      };
    }

    return {
      success: false,
      streamState: "SNAPSHOT",
      allocatedDecoder: false,
      error: admission.reason,
    };
  }

  /**
   * Releases an active stream and returns hardware resources to the pool.
   */
  release(cameraId: string): void {
    const leases = this.scheduler.getActiveLeases();
    const existing = leases.get(cameraId);

    if (existing) {
      const cost = calculateStreamCost(existing.profile);
      this.capacity.activeDecoders = Math.max(0, this.capacity.activeDecoders - 1);
      this.capacity.activeBitrateMbps = Number(
        Math.max(0, this.capacity.activeBitrateMbps - cost.bitrateMbps).toFixed(2)
      );
      this.capacity.activePixelsPerSecond = Math.max(
        0,
        this.capacity.activePixelsPerSecond - cost.pixelsPerSec
      );

      this.scheduler.releaseLease(cameraId);
    }
  }

  /**
   * Promotes a camera to a higher priority tier with immediate preemption if needed.
   */
  async promote(
    cameraId: string,
    priority: StreamPriority,
    metadata?: Partial<StreamCandidate>
  ): Promise<AdmissionResult> {
    const existing = this.knownCandidates.get(cameraId);
    const candidate: StreamCandidate = {
      cameraId,
      branchId: metadata?.branchId ?? existing?.branchId ?? "default-branch",
      priority,
      requestedQuality: metadata?.requestedQuality ?? (priority === "P0" ? "FOCUSED" : "GRID"),
      stream: metadata?.stream ?? existing?.stream ?? {
        cameraId,
        codec: "H264",
        width: priority === "P0" ? 1920 : 640,
        height: priority === "P0" ? 1080 : 360,
        fps: priority === "P0" ? 25 : 10,
        bitrateMbps: priority === "P0" ? 3.5 : 0.45,
        streamType: priority === "P0" ? "MAIN" : "SUB",
        transport: "WEBRTC",
      },
      visible: true,
      selected: priority === "P0" || Boolean(metadata?.selected),
      alarmActive: priority === "P1" || priority === "P2" || Boolean(metadata?.alarmActive),
      pinned: Boolean(metadata?.pinned ?? existing?.pinned),
      alertSeverity: metadata?.alertSeverity,
    };

    return this.admit(candidate);
  }

  /**
   * Executes full declarative reconciliation across all 144 candidate camera tiles.
   */
  async rebalance(
    candidates: StreamCandidate[]
  ): Promise<{
    allocations: Map<string, CameraTileState>;
    telemetry: ViewerPerformance;
  }> {
    for (const c of candidates) {
      this.knownCandidates.set(c.cameraId, c);
    }

    const { tileStates, activeCount, aggregateBitrateMbps, activePixelsPerSec } =
      this.scheduler.reconcile(candidates, this.capacity);

    // Sync capacity state
    this.capacity.activeDecoders = activeCount;
    this.capacity.activeBitrateMbps = aggregateBitrateMbps;
    this.capacity.activePixelsPerSecond = activePixelsPerSec;

    // Check performance telemetry & evaluate adaptive scaling
    const telemetry = this.performanceMonitor.getSnapshot(activeCount);
    const adjustment = this.performanceMonitor.evaluateCapacityAdjustment(telemetry);

    if (adjustment !== 0) {
      const newLimit = Math.max(8, Math.min(64, this.capacity.maxVideoDecoders + adjustment));
      this.capacity.maxVideoDecoders = newLimit;
      WorkstationProfileStore.saveProfile(this.capacity);
    }

    return {
      allocations: tileStates,
      telemetry,
    };
  }

  recordPlaybackQuality(
    cameraId: string,
    metrics: { totalFrames: number; droppedFrames: number }
  ): void {
    this.performanceMonitor.recordSample({
      cameraId,
      totalVideoFrames: metrics.totalFrames,
      droppedVideoFrames: metrics.droppedFrames,
    });
  }

  captureLastFrame(cameraId: string, frameDataUrl?: string): void {
    this.scheduler.preserveLastFrame(cameraId, frameDataUrl);
  }

  setCustomDecoderLimit(limit: number): void {
    this.capacity.maxVideoDecoders = Math.max(1, Math.min(144, limit));
    WorkstationProfileStore.saveProfile(this.capacity);
  }
}
