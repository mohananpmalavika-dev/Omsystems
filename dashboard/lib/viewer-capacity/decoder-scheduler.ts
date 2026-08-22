/**
 * Decoder Scheduler & Preemption Engine
 * 
 * Performs declarative multi-dimensional resource admission, priority ranking,
 * deterministic eviction, lease hold-time management, and unallocated tile rotation.
 */

import { calculateStreamCost, pixelsPerSecond } from "./stream-cost-estimator";
import { calculatePriorityScore, resolvePriorityTier } from "./priority-engine";
import type {
  AdmissionDecision,
  AdmissionResult,
  CameraTileState,
  DecoderLease,
  DecoderPoolPolicy,
  StreamCandidate,
  StreamPriority,
  StreamState,
  ViewerCapacity,
} from "./types";

export const DEFAULT_POOL_POLICY: DecoderPoolPolicy = {
  targetInteractiveSlots: 4,
  targetPrioritySlots: 8,
  minimumRotationSlots: 8,
};

export class DecoderScheduler {
  private activeLeases = new Map<string, DecoderLease>();
  private lastCapturedFrames = new Map<string, { dataUrl?: string; timestamp: number }>();
  private rotationOffset = 0;

  constructor(
    private readonly poolPolicy: DecoderPoolPolicy = DEFAULT_POOL_POLICY,
    private readonly minHoldMs = 5000,
    private readonly leaseDurationMs = 30000
  ) {}

  /**
   * Tests whether a candidate stream can be admitted into the current capacity budget.
   */
  canAdmit(capacity: ViewerCapacity, candidate: StreamCandidate): AdmissionDecision {
    const cost = calculateStreamCost(candidate.stream);
    const pps = cost.pixelsPerSec;

    // 1. Decoder slot budget
    if (capacity.activeDecoders + 1 > capacity.maxVideoDecoders) {
      return {
        admitted: false,
        reason: `Exceeds max video decoders (${capacity.activeDecoders + 1} > ${capacity.maxVideoDecoders})`,
      };
    }

    // 2. Aggregate bitrate budget
    if (capacity.activeBitrateMbps + cost.bitrateMbps > capacity.maxAggregateBitrateMbps) {
      return {
        admitted: false,
        reason: `Exceeds bandwidth budget (${(capacity.activeBitrateMbps + cost.bitrateMbps).toFixed(1)} > ${capacity.maxAggregateBitrateMbps} Mbps)`,
      };
    }

    // 3. Pixel throughput budget
    if (capacity.activePixelsPerSecond + pps > capacity.maxPixelsPerSecond) {
      return {
        admitted: false,
        reason: `Exceeds pixel budget (${capacity.activePixelsPerSecond + pps} > ${capacity.maxPixelsPerSecond} pps)`,
      };
    }

    return {
      admitted: true,
      reason: "Within decoding, bitrate, and pixel budgets",
      effectiveProfile: candidate.stream,
    };
  }

  /**
   * Selects candidate stream for eviction when capacity is saturated.
   * Priority: P0 and P1 events may preempt non-held or lowest priority P4/P3 streams.
   */
  findEvictionCandidate(
    requestingPriorityScore: number,
    isCriticalAlert = false
  ): DecoderLease | undefined {
    const now = Date.now();

    const candidates = Array.from(this.activeLeases.values()).filter((lease) => {
      if (!lease.preemptible) return false;
      // Protected by minHoldUntil unless preemption is critical (P0/P1)
      if (now < lease.minHoldUntil && !isCriticalAlert) return false;
      return lease.priorityScore < requestingPriorityScore;
    });

    if (candidates.length === 0) return undefined;

    // Evict the lowest score stream
    candidates.sort((a, b) => a.priorityScore - b.priorityScore);
    return candidates[0];
  }

  /**
   * Allocates a decoder lease to a camera.
   */
  grantLease(candidate: StreamCandidate, priorityScore: number): DecoderLease {
    const now = Date.now();
    const lease: DecoderLease = {
      cameraId: candidate.cameraId,
      acquiredAt: now,
      minHoldUntil: now + this.minHoldMs,
      expiresAt: now + this.leaseDurationMs,
      priorityScore,
      preemptible: !candidate.selected && !candidate.pinned && candidate.requestedQuality !== "FOCUSED",
      profile: candidate.stream,
    };

    this.activeLeases.set(candidate.cameraId, lease);
    return lease;
  }

  /**
   * Releases an active decoder lease.
   */
  releaseLease(cameraId: string): boolean {
    return this.activeLeases.delete(cameraId);
  }

  /**
   * Records a snapshot/cached frame for a camera when it is evicted.
   */
  preserveLastFrame(cameraId: string, dataUrl?: string): void {
    this.lastCapturedFrames.set(cameraId, {
      dataUrl,
      timestamp: Date.now(),
    });
  }

  /**
   * Generates global reconciliation plan for all candidate tiles.
   */
  reconcile(
    candidates: StreamCandidate[],
    capacity: ViewerCapacity
  ): {
    tileStates: Map<string, CameraTileState>;
    activeCount: number;
    aggregateBitrateMbps: number;
    activePixelsPerSec: number;
  } {
    const now = Date.now();
    const scored = candidates.map((c) => {
      const score = calculatePriorityScore(c);
      const tier = resolvePriorityTier(c, score);
      return { candidate: c, score, tier };
    });

    // Sort descending by priority score
    scored.sort((a, b) => b.score - a.score);

    const tileStates = new Map<string, CameraTileState>();
    const allocatedLeases = new Map<string, DecoderLease>();

    let currentDecoders = 0;
    let currentBitrate = 0;
    let currentPixels = 0;

    for (const item of scored) {
      const { candidate, score, tier } = item;
      const cost = calculateStreamCost(candidate.stream);

      // Check if offline
      if (candidate.healthState === "OFFLINE") {
        tileStates.set(candidate.cameraId, {
          cameraId: candidate.cameraId,
          branchId: candidate.branchId,
          presentation: "OFFLINE",
          priority: tier,
          decoderAllocated: false,
          reason: "Camera offline",
        });
        continue;
      }

      // Check multi-dimensional budget
      const canFit =
        currentDecoders + 1 <= capacity.maxVideoDecoders &&
        currentBitrate + cost.bitrateMbps <= capacity.maxAggregateBitrateMbps &&
        currentPixels + cost.pixelsPerSec <= capacity.maxPixelsPerSecond;

      if (canFit && (candidate.visible || tier === "P0" || tier === "P1" || tier === "P2")) {
        currentDecoders += 1;
        currentBitrate += cost.bitrateMbps;
        currentPixels += cost.pixelsPerSec;

        const lease = this.grantLease(candidate, score);
        allocatedLeases.set(candidate.cameraId, lease);

        tileStates.set(candidate.cameraId, {
          cameraId: candidate.cameraId,
          branchId: candidate.branchId,
          presentation: "LIVE",
          streamQuality: candidate.stream.streamType === "MAIN" ? "MAIN" : "SUB",
          priority: tier,
          decoderAllocated: true,
          streamUrl: `/api/media/streams/${encodeURIComponent(candidate.cameraId)}/sub/index.m3u8`,
          reason: `Admitted under priority ${tier} (${score} pts)`,
        });
      } else {
        // Fallback to SNAPSHOT / ROTATING presentation
        const lastFrame = this.lastCapturedFrames.get(candidate.cameraId);
        tileStates.set(candidate.cameraId, {
          cameraId: candidate.cameraId,
          branchId: candidate.branchId,
          presentation: candidate.visible ? "SNAPSHOT" : "ROTATING",
          priority: tier,
          decoderAllocated: false,
          lastFrameAt: lastFrame?.timestamp,
          lastFrameDataUrl: lastFrame?.dataUrl,
          snapshotUrl: `/api/media/snapshots/${encodeURIComponent(candidate.cameraId)}.jpg`,
          reason: "Decoder capacity reached; fallback to snapshot",
        });
      }
    }

    // Synchronize internal active leases
    this.activeLeases = allocatedLeases;

    return {
      tileStates,
      activeCount: currentDecoders,
      aggregateBitrateMbps: Number(currentBitrate.toFixed(2)),
      activePixelsPerSec: currentPixels,
    };
  }

  getActiveLeases(): Map<string, DecoderLease> {
    return new Map(this.activeLeases);
  }

  advanceRotation(step = 8): number {
    this.rotationOffset = (this.rotationOffset + step) % 144;
    return this.rotationOffset;
  }
}
