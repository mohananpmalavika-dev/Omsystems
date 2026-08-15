/**
 * Stream Scheduler
 * Priority-based stream allocation and scheduling engine
 */

import { logger } from "../utils/logger.js";
import { DecoderBudgetManager } from "./decoder-budget-manager.js";
import type {
  StreamPriority,
  StreamAllocationRequest,
  StreamAllocationResult,
  VideoProfile,
  MediaDegradationLevel,
  SequencePolicy,
  CameraMediaState,
} from "./types.js";

/**
 * Priority scoring weights
 */
const PRIORITY_WEIGHTS = {
  OPERATOR_SELECTED: 1000,
  CRITICAL_ALERT: 800,
  ACTIVE_INCIDENT: 700,
  VISIBLE_VIEWPORT: 500,
  BRANCH_CRITICAL: 300,
  RECENTLY_SELECTED: 100,
};

export interface StreamSchedulerOptions {
  decoderBudgetManager: DecoderBudgetManager;
  sequencePolicy?: SequencePolicy;
}

export class StreamScheduler {
  private priorities: Map<string, StreamPriority> = new Map();
  private allocatedStreams: Map<string, StreamAllocationResult> = new Map();
  private cameraStates: Map<string, CameraMediaState> = new Map();
  private sequenceIndex = 0;

  constructor(private readonly options: StreamSchedulerOptions) {}

  /**
   * Calculate priority score for a camera
   */
  calculatePriority(request: StreamAllocationRequest): StreamPriority {
    const reasons: string[] = [];
    let score = 0;

    // Operator-selected cameras get highest priority
    if (request.purpose === "INVESTIGATION") {
      score += PRIORITY_WEIGHTS.OPERATOR_SELECTED;
      reasons.push("operator selected");
    }

    // Critical alerts
    const cameraState = this.cameraStates.get(request.cameraId);
    const hasCriticalAlert = cameraState?.healthStatus === "DEGRADED"; // Simplified
    if (hasCriticalAlert) {
      score += PRIORITY_WEIGHTS.CRITICAL_ALERT;
      reasons.push("critical alert");
    }

    // Active incident
    if (request.purpose === "INCIDENT") {
      score += PRIORITY_WEIGHTS.ACTIVE_INCIDENT;
      reasons.push("active incident");
    }

    // Visible in viewport
    if (request.visibleInViewport) {
      score += PRIORITY_WEIGHTS.VISIBLE_VIEWPORT;
      reasons.push("visible in viewport");
    }

    // Branch critical status
    // TODO: Link to digital twin branch health
    
    // Manual priority boost
    score += request.priority || 0;

    return {
      cameraId: request.cameraId,
      score,
      reasons,
      operatorSelected: request.purpose === "INVESTIGATION",
      criticalAlert: hasCriticalAlert,
      activeIncident: request.purpose === "INCIDENT",
      visibleInViewport: request.visibleInViewport,
      branchCritical: false, // TODO: Implement
      recentlySelected: false, // TODO: Implement
    };
  }

  /**
   * Update camera media state (called from digital twin / health system)
   */
  updateCameraState(state: CameraMediaState): void {
    this.cameraStates.set(state.cameraId, state);
  }

  /**
   * Request stream allocation
   */
  async requestAllocation(
    request: StreamAllocationRequest,
    capabilities: { main: VideoProfile; sub?: VideoProfile }
  ): Promise<StreamAllocationResult> {
    const priority = this.calculatePriority(request);
    this.priorities.set(request.cameraId, priority);

    // Check if camera can stream now
    const cameraState = this.cameraStates.get(request.cameraId);
    if (cameraState && !cameraState.canStreamNow) {
      logger.debug("Camera cannot stream", {
        cameraId: request.cameraId,
        reason: cameraState.reason,
      });

      return {
        cameraId: request.cameraId,
        allocated: false,
        profile: null,
        degradationLevel: MediaDegradationLevel.METADATA_ONLY,
        reason: cameraState.reason || "Camera offline",
      };
    }

    // Try to allocate based on decoder budget
    const { decoderBudgetManager } = this.options;

    // Select profile based on request and availability
    let profile: VideoProfile | null = null;
    let degradationLevel = MediaDegradationLevel.NONE;

    if (request.requestedQuality === "MAINSTREAM" && capabilities.main) {
      if (decoderBudgetManager.canAllocate(capabilities.main, request.cameraId)) {
        profile = capabilities.main;
      } else if (capabilities.sub && decoderBudgetManager.canAllocate(capabilities.sub, request.cameraId)) {
        // Degrade to substream
        profile = capabilities.sub;
        degradationLevel = MediaDegradationLevel.SUBSTREAM_ONLY;
      }
    } else if (request.requestedQuality === "SUBSTREAM" || request.requestedQuality === "AUTO") {
      if (capabilities.sub && decoderBudgetManager.canAllocate(capabilities.sub, request.cameraId)) {
        profile = capabilities.sub;
      } else if (capabilities.main && decoderBudgetManager.canAllocate(capabilities.main, request.cameraId)) {
        // Unusual case: use mainstream if substream unavailable
        profile = capabilities.main;
      }
    }

    if (!profile) {
      // No decoder capacity - suggest snapshot mode
      return {
        cameraId: request.cameraId,
        allocated: false,
        profile: null,
        degradationLevel: MediaDegradationLevel.SNAPSHOT_ONLY,
        reason: "Decoder budget exhausted",
      };
    }

    // Allocate decoder
    const allocated = decoderBudgetManager.allocate(profile, request.cameraId);
    if (!allocated) {
      return {
        cameraId: request.cameraId,
        allocated: false,
        profile: null,
        degradationLevel: MediaDegradationLevel.SNAPSHOT_ONLY,
        reason: "Failed to allocate decoder",
      };
    }

    const result: StreamAllocationResult = {
      cameraId: request.cameraId,
      allocated: true,
      profile,
      degradationLevel,
      reason: "Allocated successfully",
    };

    this.allocatedStreams.set(request.cameraId, result);

    logger.debug("Stream allocated", {
      cameraId: request.cameraId,
      profile: `${profile.width}x${profile.height}@${profile.fps}fps`,
      priority: priority.score,
      degradationLevel: MediaDegradationLevel[degradationLevel],
    });

    return result;
  }

  /**
   * Release stream allocation
   */
  releaseAllocation(cameraId: string): void {
    const allocation = this.allocatedStreams.get(cameraId);
    if (!allocation || !allocation.allocated) {
      return;
    }

    this.options.decoderBudgetManager.release(cameraId);
    this.allocatedStreams.delete(cameraId);
    this.priorities.delete(cameraId);

    logger.debug("Stream released", { cameraId });
  }

  /**
   * Get sorted cameras by priority
   */
  getSortedByPriority(): StreamPriority[] {
    return Array.from(this.priorities.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Apply sequencing policy to rotate cameras
   */
  applySequencing(
    allCameraIds: string[],
    maxActiveSlots: number
  ): string[] {
    const policy = this.options.sequencePolicy;
    if (!policy || !policy.enabled) {
      return allCameraIds.slice(0, maxActiveSlots);
    }

    // Separate pinned and rotating cameras
    const pinned = allCameraIds.filter((id) =>
      policy.pinnedCameraIds.includes(id)
    );
    const rotating = allCameraIds.filter(
      (id) => !policy.pinnedCameraIds.includes(id)
    );

    // Calculate available slots for rotation
    const availableSlots = maxActiveSlots - pinned.length;
    if (availableSlots <= 0) {
      return pinned;
    }

    // Apply rotation
    let rotatedCameras: string[];
    switch (policy.order) {
      case "PRIORITY": {
        // Already sorted by priority, just take next batch
        const start = this.sequenceIndex % rotating.length;
        rotatedCameras = [
          ...rotating.slice(start, start + availableSlots),
          ...rotating.slice(0, Math.max(0, start + availableSlots - rotating.length)),
        ];
        break;
      }

      case "ROUND_ROBIN":
      default: {
        // Simple round-robin rotation
        const start = this.sequenceIndex % rotating.length;
        rotatedCameras = [
          ...rotating.slice(start, start + availableSlots),
          ...rotating.slice(0, Math.max(0, start + availableSlots - rotating.length)),
        ];
        break;
      }
    }

    return [...pinned, ...rotatedCameras.slice(0, availableSlots)];
  }

  /**
   * Advance sequence index (called by timer)
   */
  advanceSequence(): void {
    const policy = this.options.sequencePolicy;
    if (!policy || !policy.enabled) {
      return;
    }

    this.sequenceIndex += policy.activeSlots;
    logger.debug("Sequence advanced", { index: this.sequenceIndex });
  }

  /**
   * Update sequence policy
   */
  updateSequencePolicy(policy: SequencePolicy): void {
    this.options.sequencePolicy = policy;
    this.sequenceIndex = 0;
    logger.info("Sequence policy updated", { policy });
  }

  /**
   * Get allocation for camera
   */
  getAllocation(cameraId: string): StreamAllocationResult | null {
    return this.allocatedStreams.get(cameraId) || null;
  }

  /**
   * Get all allocated cameras
   */
  getAllocatedCameras(): string[] {
    return Array.from(this.allocatedStreams.keys());
  }

  /**
   * Force reallocation based on changed priorities
   */
  async reallocate(
    requests: StreamAllocationRequest[],
    capabilitiesMap: Map<string, { main: VideoProfile; sub?: VideoProfile }>
  ): Promise<Map<string, StreamAllocationResult>> {
    // Sort requests by priority
    const sorted = requests
      .map((req) => ({
        request: req,
        priority: this.calculatePriority(req),
      }))
      .sort((a, b) => b.priority.score - a.priority.score);

    // Release all current allocations
    const currentAllocations = Array.from(this.allocatedStreams.keys());
    for (const cameraId of currentAllocations) {
      this.releaseAllocation(cameraId);
    }

    // Reallocate in priority order
    const results = new Map<string, StreamAllocationResult>();
    for (const { request } of sorted) {
      const capabilities = capabilitiesMap.get(request.cameraId);
      if (!capabilities) {
        continue;
      }

      const result = await this.requestAllocation(request, capabilities);
      results.set(request.cameraId, result);

      // Stop if decoder budget exhausted
      if (!result.allocated) {
        break;
      }
    }

    logger.info("Stream reallocation complete", {
      requested: requests.length,
      allocated: Array.from(results.values()).filter((r) => r.allocated).length,
    });

    return results;
  }

  /**
   * Get scheduler metrics
   */
  getMetrics(): {
    totalCameras: number;
    allocatedStreams: number;
    priorityBreakdown: Record<string, number>;
    decoderUtilization: number;
  } {
    const priorities = Array.from(this.priorities.values());
    const priorityBreakdown = {
      operatorSelected: priorities.filter((p) => p.operatorSelected).length,
      criticalAlert: priorities.filter((p) => p.criticalAlert).length,
      activeIncident: priorities.filter((p) => p.activeIncident).length,
      visibleViewport: priorities.filter((p) => p.visibleInViewport).length,
    };

    const decoderMetrics = this.options.decoderBudgetManager.getMetrics();

    return {
      totalCameras: this.priorities.size,
      allocatedStreams: this.allocatedStreams.size,
      priorityBreakdown,
      decoderUtilization: decoderMetrics.utilizationPercent,
    };
  }
}
