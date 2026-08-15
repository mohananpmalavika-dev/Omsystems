/**
 * Stream Scheduler
 * 
 * Priority-based scheduler that selects which cameras to actively decode
 * based on viewer capacity, camera priorities, alerts, and operator focus.
 */

import type {
  CameraContext,
  ScheduledCamera,
  CameraPlaybackMode,
  CameraPriorityClass,
  ViewerResourceBudget,
  StreamProfile,
  StreamCost,
  TileGeometry,
} from "./types";
import {
  scoreCamera,
  getCameraPriorityClass,
  calculateStreamCost,
  canAdmitStream,
  canAdmitToEmergencyPool,
  consumeBudget,
  chooseStreamProfile,
  canPreempt,
} from "./stream-utils";
import { getViewerCapacityManager } from "./viewer-capacity-manager";

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROTATION_INTERVAL_MS = 10000; // Rotate cameras every 10 seconds
const SNAPSHOT_INTERVAL_MS = 5000; // Snapshot refresh every 5 seconds

// ============================================================================
// STREAM SCHEDULER
// ============================================================================

export class StreamScheduler {
  private lastRotationTime: number = 0;
  private rotationIndex: number = 0;
  private currentSchedule: Map<string, ScheduledCamera> = new Map();
  private emergencyPoolUsage: number = 0;

  /**
   * Schedule cameras for playback based on priority and capacity
   */
  async schedule(
    cameras: CameraContext[],
    tileGeometry: TileGeometry,
    visibleCameraIds?: Set<string>
  ): Promise<Map<string, ScheduledCamera>> {
    const capacityManager = getViewerCapacityManager();
    const budget = await capacityManager.getResourceBudget();
    const capacity = await capacityManager.getCapacity();

    // Mark visible cameras
    cameras.forEach((camera) => {
      camera.isVisible = visibleCameraIds?.has(camera.id) ?? true;
    });

    // Check if rotation is due
    const now = Date.now();
    const rotationDue = now - this.lastRotationTime > ROTATION_INTERVAL_MS;

    // Score and sort cameras by priority
    const scoredCameras = cameras.map((camera) => ({
      camera,
      score: scoreCamera(camera),
      priorityClass: getCameraPriorityClass(camera),
    }));

    scoredCameras.sort((a, b) => b.score - a.score);

    // Separate into priority pools
    const pinnedCameras = scoredCameras.filter(
      (c) => c.priorityClass === "P0_OPERATOR_PINNED"
    );
    const criticalCameras = scoredCameras.filter(
      (c) => c.priorityClass === "P1_CRITICAL" || c.priorityClass === "P2_HIGH"
    );
    const normalCameras = scoredCameras.filter(
      (c) =>
        c.priorityClass !== "P0_OPERATOR_PINNED" &&
        c.priorityClass !== "P1_CRITICAL" &&
        c.priorityClass !== "P2_HIGH"
    );

    // Initialize working budget
    let workingBudget = { ...budget };
    const scheduled: Map<string, ScheduledCamera> = new Map();
    this.emergencyPoolUsage = 0;

    // Phase 1: Always allocate P0 (operator pinned)
    for (const { camera, score, priorityClass } of pinnedCameras) {
      const streamProfile = chooseStreamProfile(camera, tileGeometry, priorityClass);
      if (!streamProfile) continue;

      const cost = calculateStreamCost(streamProfile, capacity);

      if (canAdmitStream(cost, workingBudget)) {
        scheduled.set(camera.id, {
          cameraId: camera.id,
          mode: this.getModeForStream(streamProfile),
          priority: priorityClass,
          priorityScore: score,
          reason: "OPERATOR_SELECTED",
          streamProfile,
          streamCost: cost,
        });

        workingBudget = consumeBudget(workingBudget, cost);
      }
    }

    // Phase 2: Allocate P1/P2 (critical/high alerts) using emergency reserve
    for (const { camera, score, priorityClass } of criticalCameras) {
      const streamProfile = chooseStreamProfile(camera, tileGeometry, priorityClass);
      if (!streamProfile) continue;

      const cost = calculateStreamCost(streamProfile, capacity);

      // Try normal pool first
      if (canAdmitStream(cost, workingBudget)) {
        scheduled.set(camera.id, {
          cameraId: camera.id,
          mode: this.getModeForStream(streamProfile),
          priority: priorityClass,
          priorityScore: score,
          reason: "CRITICAL_ALERT",
          streamProfile,
          streamCost: cost,
        });

        workingBudget = consumeBudget(workingBudget, cost);
      }
      // Try emergency pool
      else if (canAdmitToEmergencyPool(cost, workingBudget, this.emergencyPoolUsage)) {
        // Check if we can preempt a lower priority stream
        const preemptCandidate = this.findPreemptionCandidate(
          scheduled,
          score,
          priorityClass,
          now
        );

        if (preemptCandidate) {
          console.log(
            `[Scheduler] Preempting ${preemptCandidate.cameraId} for critical ${camera.id}`
          );
          scheduled.delete(preemptCandidate.cameraId);
          // Budget freed by preemption
        }

        scheduled.set(camera.id, {
          cameraId: camera.id,
          mode: this.getModeForStream(streamProfile),
          priority: priorityClass,
          priorityScore: score,
          reason: "CRITICAL_ALERT",
          streamProfile,
          streamCost: cost,
        });

        this.emergencyPoolUsage += cost.decoderUnits;
        workingBudget = consumeBudget(workingBudget, cost);
      }
    }

    // Phase 3: Fill normal pool with highest priority cameras
    const normalPoolSize = budget.normalPoolSize;
    let normalAllocated = 0;

    for (const { camera, score, priorityClass } of normalCameras) {
      if (normalAllocated >= normalPoolSize) {
        break;
      }

      const streamProfile = chooseStreamProfile(camera, tileGeometry, priorityClass);
      if (!streamProfile) continue;

      const cost = calculateStreamCost(streamProfile, capacity);

      if (canAdmitStream(cost, workingBudget)) {
        const reason = this.getScheduleReason(camera);

        scheduled.set(camera.id, {
          cameraId: camera.id,
          mode: this.getModeForStream(streamProfile),
          priority: priorityClass,
          priorityScore: score,
          reason,
          streamProfile,
          streamCost: cost,
        });

        workingBudget = consumeBudget(workingBudget, cost);
        normalAllocated++;
      }
    }

    // Phase 4: Assign degraded modes to remaining cameras
    for (const { camera, score, priorityClass } of scoredCameras) {
      if (scheduled.has(camera.id)) {
        continue; // Already scheduled for live
      }

      // Determine degraded mode
      let mode: CameraPlaybackMode = "SNAPSHOT";

      // Rotation logic for visible cameras
      if (camera.isVisible && rotationDue) {
        if (this.shouldRotate(camera, normalCameras.length)) {
          mode = "ROTATING";
        }
      }

      scheduled.set(camera.id, {
        cameraId: camera.id,
        mode,
        priority: priorityClass,
        priorityScore: score,
        reason: "BACKGROUND",
      });
    }

    // Update rotation state
    if (rotationDue) {
      this.lastRotationTime = now;
      this.rotationIndex = (this.rotationIndex + 1) % normalCameras.length;
    }

    this.currentSchedule = scheduled;

    console.log(`[Scheduler] Scheduled ${scheduled.size} cameras:`, {
      live: Array.from(scheduled.values()).filter(
        (s) => s.mode === "MAIN_STREAM" || s.mode === "SUB_STREAM"
      ).length,
      snapshot: Array.from(scheduled.values()).filter((s) => s.mode === "SNAPSHOT")
        .length,
      rotating: Array.from(scheduled.values()).filter((s) => s.mode === "ROTATING")
        .length,
      emergencyUsage: this.emergencyPoolUsage,
    });

    return scheduled;
  }

  /**
   * Find a camera that can be preempted for higher priority stream
   */
  private findPreemptionCandidate(
    scheduled: Map<string, ScheduledCamera>,
    candidatePriority: number,
    candidatePriorityClass: CameraPriorityClass,
    now: number
  ): ScheduledCamera | null {
    let lowestPriority = Infinity;
    let candidate: ScheduledCamera | null = null;

    for (const scheduled_camera of scheduled.values()) {
      // Skip P0
      if (scheduled_camera.priority === "P0_OPERATOR_PINNED") {
        continue;
      }

      // Check if can be preempted
      const currentState = this.currentSchedule.get(scheduled_camera.cameraId);
      const activatedAt = currentState ? Date.now() - 5000 : now; // Estimate if unknown

      if (
        canPreempt(
          candidatePriority,
          candidatePriorityClass,
          scheduled_camera.priorityScore,
          scheduled_camera.priority,
          activatedAt,
          now
        )
      ) {
        if (scheduled_camera.priorityScore < lowestPriority) {
          lowestPriority = scheduled_camera.priorityScore;
          candidate = scheduled_camera;
        }
      }
    }

    return candidate;
  }

  /**
   * Determine if camera should be in rotation this cycle
   */
  private shouldRotate(camera: CameraContext, totalNormalCameras: number): boolean {
    // Simple hash-based rotation
    const cameraHash = this.hashString(camera.id);
    const bucket = cameraHash % 10;
    const rotationBucket = this.rotationIndex % 10;

    return bucket === rotationBucket;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get playback mode from stream profile
   */
  private getModeForStream(profile: StreamProfile): CameraPlaybackMode {
    switch (profile.streamType) {
      case "MAIN":
        return "MAIN_STREAM";
      case "SUB":
        return "SUB_STREAM";
      case "THUMBNAIL":
        return "SNAPSHOT";
      default:
        return "SUB_STREAM";
    }
  }

  /**
   * Determine schedule reason from camera context
   */
  private getScheduleReason(camera: CameraContext): ScheduledCamera["reason"] {
    if (camera.operatorSelected) return "OPERATOR_SELECTED";
    if (camera.hasCriticalAlert) return "CRITICAL_ALERT";
    if (camera.hasHighAlert) return "HIGH_ALERT";
    if (camera.incidentActive) return "INCIDENT_ACTIVE";
    if (camera.isVisible) return "VISIBLE";
    if (camera.branchSelected) return "BRANCH_PRIORITY";
    if (camera.isRotationallyDue) return "ROTATION";
    return "BACKGROUND";
  }

  /**
   * Get current schedule
   */
  getCurrentSchedule(): Map<string, ScheduledCamera> {
    return this.currentSchedule;
  }

  /**
   * Get emergency pool usage
   */
  getEmergencyPoolUsage(): number {
    return this.emergencyPoolUsage;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let schedulerInstance: StreamScheduler | null = null;

export function getStreamScheduler(): StreamScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new StreamScheduler();
  }
  return schedulerInstance;
}

export function resetStreamScheduler(): void {
  schedulerInstance = null;
}
