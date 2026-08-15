/**
 * Resource-aware scheduler for the browser video wall.
 *
 * UI slots are deliberately independent from decoder capacity. A schedule
 * pass selects live streams within decoder, bitrate, and pixel budgets, then
 * places all remaining cameras into an explicit deferred playback mode.
 */

import type {
  CameraContext,
  CameraPlaybackMode,
  CameraPriorityClass,
  DegradationReason,
  PlaybackLease,
  ScheduledCamera,
  StreamCost,
  StreamProfile,
  ViewerCapacity,
  ViewerResourceBudget,
} from "./types";
import type { TileGeometry } from "./stream-utils";
import {
  calculateStreamCost,
  chooseStreamProfile,
  consumeBudget,
  getCameraPriorityClass,
  scoreCamera,
} from "./stream-utils";
import { getViewerCapacityManager } from "./viewer-capacity-manager";

const ROTATION_INTERVAL_MS = 10_000;
const NORMAL_LEASE_MS = 10_000;
const ALERT_LEASE_MS = 30_000;

export interface StreamSchedulerOptions {
  /** User or embedding-page cap. It can lower, but never raise, detected capacity. */
  maxDecoderLimit?: number;
  rotationEnabled?: boolean;
}

export interface ViewerCapacitySource {
  getCapacity(): Promise<ViewerCapacity>;
  getResourceBudget(): Promise<ViewerResourceBudget>;
}

interface ScoredCamera {
  camera: CameraContext;
  score: number;
  priorityClass: CameraPriorityClass;
}

export class StreamScheduler {
  private lastRotationTime = 0;
  private rotationIndex = 0;
  private currentSchedule = new Map<string, ScheduledCamera>();
  private leases = new Map<string, PlaybackLease>();

  constructor(
    private readonly capacitySource: ViewerCapacitySource = getViewerCapacityManager(),
  ) {}

  async schedule(
    cameras: CameraContext[],
    tileGeometry: TileGeometry,
    visibleCameraIds?: Set<string>,
    options: StreamSchedulerOptions = {},
  ): Promise<Map<string, ScheduledCamera>> {
    const [capacity, detectedBudget] = await Promise.all([
      this.capacitySource.getCapacity(),
      this.capacitySource.getResourceBudget(),
    ]);
    const budget = this.createEffectiveBudget(detectedBudget, options.maxDecoderLimit);
    const now = Date.now();
    const rotationEnabled = options.rotationEnabled !== false;
    const rotationDue = rotationEnabled && this.lastRotationTime > 0 &&
      now - this.lastRotationTime >= ROTATION_INTERVAL_MS;
    if (this.lastRotationTime === 0) this.lastRotationTime = now;

    const unavailable = cameras.filter((camera) => camera.isOnline === false || camera.streamUnavailable);
    const scored = cameras
      .filter((camera) => camera.isOnline !== false && !camera.streamUnavailable)
      .map((camera) => {
        const isVisible = visibleCameraIds?.has(camera.id) ?? camera.isVisible;
        const resolvedCamera = { ...camera, isVisible };
        return {
          camera: resolvedCamera,
          score: scoreCamera(resolvedCamera),
          priorityClass: getCameraPriorityClass(resolvedCamera),
        };
      })
      .sort((a, b) => b.score - a.score || a.camera.id.localeCompare(b.camera.id));

    const priority = scored.filter((entry) => this.isPriority(entry.priorityClass));
    const normal = this.orderNormalCandidates(
      scored.filter((entry) => !this.isPriority(entry.priorityClass)),
      rotationEnabled,
      now,
    );
    const scheduled = new Map<string, ScheduledCamera>();
    let workingBudget = this.emptyUsage(budget);

    // P0/P1/P2 can allocate the priority reserve. Normal wall traffic only
    // consumes reserve as priority work actually needs it.
    for (const entry of priority) {
      const admitted = this.tryScheduleLive(entry, tileGeometry, capacity, workingBudget, budget.decoderBudget);
      if (!admitted) continue;
      scheduled.set(entry.camera.id, admitted.scheduled);
      workingBudget = admitted.budget;
    }

    const normalDecoderCeiling = Math.min(
      budget.decoderBudget,
      budget.normalPoolSize + Math.min(workingBudget.decoderUsage, budget.emergencyReserve),
    );
    for (const entry of normal) {
      const admitted = this.tryScheduleLive(entry, tileGeometry, capacity, workingBudget, normalDecoderCeiling);
      if (!admitted) continue;
      scheduled.set(entry.camera.id, admitted.scheduled);
      workingBudget = admitted.budget;
    }

    const newPriorityAllocations = new Set(
      priority
        .filter((entry) => this.isLive(scheduled.get(entry.camera.id)) && !this.wasLive(entry.camera.id))
        .map((entry) => entry.camera.id),
    );

    for (const entry of [...priority, ...normal]) {
      if (scheduled.has(entry.camera.id)) continue;
      const profile = chooseStreamProfile(entry.camera, tileGeometry, entry.priorityClass, capacity);
      const cost = profile ? calculateStreamCost(profile, capacity) : undefined;
      const wasPreempted = this.wasLive(entry.camera.id) && !this.isPriority(entry.priorityClass) && newPriorityAllocations.size > 0;
      scheduled.set(entry.camera.id, {
        cameraId: entry.camera.id,
        mode: entry.camera.isVisible || !rotationEnabled ? "SNAPSHOT" : "ROTATING",
        priority: entry.priorityClass,
        priorityScore: entry.score,
        reason: this.getScheduleReason(entry.camera),
        streamProfile: profile,
        streamCost: cost,
        degradationReason: wasPreempted
          ? "EVICTED_BY_PRIORITY"
          : this.getDegradationReason(cost, workingBudget, normalDecoderCeiling),
      });
    }

    for (const camera of unavailable) {
      scheduled.set(camera.id, {
        cameraId: camera.id,
        mode: "SUSPENDED",
        priority: "P6_BACKGROUND",
        priorityScore: 0,
        reason: "BACKGROUND",
        degradationReason: camera.isOnline === false ? "DEVICE_OFFLINE" : "STREAM_FAILURE",
      });
    }

    if (rotationDue) {
      this.lastRotationTime = now;
      this.rotationIndex += 1;
    }

    this.updateLeases(scheduled, now);
    this.currentSchedule = scheduled;
    return new Map(scheduled);
  }

  getCurrentSchedule(): Map<string, ScheduledCamera> {
    return new Map(this.currentSchedule);
  }

  getPlaybackLease(cameraId: string): PlaybackLease | undefined {
    return this.leases.get(cameraId);
  }

  private createEffectiveBudget(
    detected: ViewerResourceBudget,
    maxDecoderLimit?: number,
  ): ViewerResourceBudget {
    const decoderBudget = Math.max(
      1,
      Math.min(
        detected.decoderBudget,
        typeof maxDecoderLimit === "number" && Number.isFinite(maxDecoderLimit)
          ? Math.floor(maxDecoderLimit)
          : detected.decoderBudget,
      ),
    );
    const emergencyReserve = decoderBudget > 1
      ? Math.min(decoderBudget - 1, Math.max(1, Math.round(decoderBudget * 0.1)))
      : 0;

    return {
      ...detected,
      decoderBudget,
      emergencyReserve,
      normalPoolSize: Math.max(0, decoderBudget - emergencyReserve),
    };
  }

  private emptyUsage(budget: ViewerResourceBudget): ViewerResourceBudget {
    return {
      ...budget,
      decoderUsage: 0,
      bitrateUsageMbps: 0,
      pixelsPerSecondUsage: 0,
    };
  }

  private tryScheduleLive(
    entry: ScoredCamera,
    tile: TileGeometry,
    capacity: ViewerCapacity,
    budget: ViewerResourceBudget,
    decoderCeiling: number,
  ): { scheduled: ScheduledCamera; budget: ViewerResourceBudget } | null {
    const streamProfile = chooseStreamProfile(entry.camera, tile, entry.priorityClass, capacity);
    if (!streamProfile) return null;

    const streamCost = calculateStreamCost(streamProfile, capacity);
    if (!this.canAdmit(streamCost, budget, decoderCeiling)) return null;

    return {
      scheduled: {
        cameraId: entry.camera.id,
        mode: streamProfile.streamType === "MAIN" ? "MAIN_STREAM" : "SUB_STREAM",
        priority: entry.priorityClass,
        priorityScore: entry.score,
        reason: this.getScheduleReason(entry.camera),
        streamProfile,
        streamCost,
      },
      budget: consumeBudget(budget, streamCost),
    };
  }

  private canAdmit(cost: StreamCost, budget: ViewerResourceBudget, decoderCeiling: number): boolean {
    return budget.decoderUsage + cost.decoderUnits <= decoderCeiling &&
      budget.bitrateUsageMbps + cost.bitrateMbps <= budget.bitrateBudgetMbps &&
      budget.pixelsPerSecondUsage + cost.pixelsPerSecond <= budget.pixelsPerSecondBudget;
  }

  private getDegradationReason(
    cost: StreamCost | undefined,
    budget: ViewerResourceBudget,
    decoderCeiling: number,
  ): DegradationReason {
    if (!cost) return "STREAM_FAILURE";
    if (budget.bitrateUsageMbps + cost.bitrateMbps > budget.bitrateBudgetMbps) return "BITRATE_CAPACITY";
    if (budget.pixelsPerSecondUsage + cost.pixelsPerSecond > budget.pixelsPerSecondBudget) return "PIXEL_CAPACITY";
    if (budget.decoderUsage + cost.decoderUnits > decoderCeiling) return "DECODER_CAPACITY";
    return "EVICTED_BY_PRIORITY";
  }

  private orderNormalCandidates(entries: ScoredCamera[], rotationEnabled: boolean, now: number): ScoredCamera[] {
    const protectedEntries = entries.filter((entry) => {
      const lease = this.leases.get(entry.camera.id);
      return this.wasLive(entry.camera.id) && Boolean(lease?.preemptible) && (lease?.minimumActiveUntil ?? 0) > now;
    });
    const protectedIds = new Set(protectedEntries.map((entry) => entry.camera.id));
    const remaining = entries.filter((entry) => !protectedIds.has(entry.camera.id));
    const stable = remaining.filter((entry) =>
      entry.priorityClass === "P3_INCIDENT" || entry.priorityClass === "P4_VISIBLE",
    );
    const rotating = remaining.filter((entry) =>
      entry.priorityClass === "P5_ROTATION" || entry.priorityClass === "P6_BACKGROUND",
    );
    if (!rotationEnabled || rotating.length === 0) return [...protectedEntries, ...stable, ...rotating];

    const offset = this.rotationIndex % rotating.length;
    return [...protectedEntries, ...stable, ...rotating.slice(offset), ...rotating.slice(0, offset)];
  }

  private updateLeases(schedule: Map<string, ScheduledCamera>, now: number): void {
    const activeIds = new Set<string>();
    for (const scheduled of schedule.values()) {
      if (!this.isLive(scheduled)) continue;
      activeIds.add(scheduled.cameraId);
      if (this.leases.has(scheduled.cameraId)) continue;
      const alert = scheduled.priority === "P1_CRITICAL" || scheduled.priority === "P2_HIGH";
      this.leases.set(scheduled.cameraId, {
        cameraId: scheduled.cameraId,
        activatedAt: now,
        minimumActiveUntil: now + (alert ? ALERT_LEASE_MS : NORMAL_LEASE_MS),
        preemptible: scheduled.priority !== "P0_OPERATOR_PINNED",
        priorityClass: scheduled.priority,
      });
    }
    for (const cameraId of this.leases.keys()) {
      if (!activeIds.has(cameraId)) this.leases.delete(cameraId);
    }
  }

  private wasLive(cameraId: string): boolean {
    return this.isLive(this.currentSchedule.get(cameraId));
  }

  private isLive(scheduled: ScheduledCamera | undefined): boolean {
    return scheduled?.mode === "MAIN_STREAM" || scheduled?.mode === "SUB_STREAM";
  }

  private isPriority(priority: CameraPriorityClass): boolean {
    return priority === "P0_OPERATOR_PINNED" || priority === "P1_CRITICAL" || priority === "P2_HIGH";
  }

  private getScheduleReason(camera: CameraContext): ScheduledCamera["reason"] {
    if (camera.operatorSelected || camera.operatorPinned) return "OPERATOR_SELECTED";
    if (camera.hasCriticalAlert) return "CRITICAL_ALERT";
    if (camera.hasHighAlert) return "HIGH_ALERT";
    if (camera.incidentActive) return "INCIDENT_ACTIVE";
    if (camera.isVisible) return "VISIBLE";
    if (camera.branchSelected) return "BRANCH_PRIORITY";
    if (camera.isRotationallyDue) return "ROTATION";
    return "BACKGROUND";
  }
}

let schedulerInstance: StreamScheduler | null = null;

export function getStreamScheduler(): StreamScheduler {
  if (!schedulerInstance) schedulerInstance = new StreamScheduler();
  return schedulerInstance;
}

export function resetStreamScheduler(): void {
  schedulerInstance = null;
}
