import { randomUUID } from "node:crypto";

export type GapReason =
  | "CAMERA_OFFLINE"
  | "NETWORK_DOWN"
  | "AUTH_FAILURE"
  | "RTSP_FAILURE"
  | "STORAGE_FULL"
  | "STORAGE_UNAVAILABLE"
  | "PROCESS_CRASH"
  | "TIMESTAMP_INVALID"
  | "UNKNOWN";

export interface RecordingGapItem {
  id: string;
  cameraId: string;
  tenantId?: string;
  branchId?: string;
  startTime: Date;
  endTime?: Date;
  reason: GapReason;
  detail: Record<string, unknown>;
  detectedAt: Date;
  resolvedAt?: Date;
}

export class RecordingGapTracker {
  private activeGaps = new Map<string, RecordingGapItem>();
  private lastSegmentEndTimes = new Map<string, Date>();

  /**
   * Evaluates a completed segment against previous segment timing to detect unintended gaps.
   */
  evaluateSegmentTransition(
    cameraId: string,
    segmentStart: Date,
    segmentEnd: Date,
    expectedDurationSeconds: number,
  ): RecordingGapItem | undefined {
    const previousEnd = this.lastSegmentEndTimes.get(cameraId);
    this.lastSegmentEndTimes.set(cameraId, segmentEnd);

    if (!previousEnd) return undefined;

    const gapMs = segmentStart.getTime() - previousEnd.getTime();
    const thresholdMs = Math.max(5000, expectedDurationSeconds * 250); // 25% of segment time or 5s

    if (gapMs > thresholdMs) {
      const gapItem: RecordingGapItem = {
        id: randomUUID(),
        cameraId,
        startTime: previousEnd,
        endTime: segmentStart,
        reason: "UNKNOWN",
        detail: {
          gapDurationSeconds: Number((gapMs / 1000).toFixed(2)),
          previousSegmentEnd: previousEnd.toISOString(),
          currentSegmentStart: segmentStart.toISOString(),
        },
        detectedAt: new Date(),
        resolvedAt: segmentStart,
      };
      return gapItem;
    }

    return undefined;
  }

  /**
   * Starts tracking an active gap when an interruption (e.g. camera offline, storage write error) occurs.
   */
  startGap(
    cameraId: string,
    reason: GapReason,
    context: { tenantId?: string; branchId?: string; detail?: Record<string, unknown> } = {},
    startTime: Date = new Date(),
  ): RecordingGapItem {
    const existing = this.activeGaps.get(cameraId);
    if (existing && !existing.resolvedAt) {
      return existing;
    }

    const gapItem: RecordingGapItem = {
      id: randomUUID(),
      cameraId,
      tenantId: context.tenantId,
      branchId: context.branchId,
      startTime,
      reason,
      detail: context.detail ?? {},
      detectedAt: new Date(),
    };

    this.activeGaps.set(cameraId, gapItem);
    return gapItem;
  }

  /**
   * Resolves an active gap when video acquisition resumes.
   */
  resolveGap(cameraId: string, resolvedAt: Date = new Date()): RecordingGapItem | undefined {
    const gap = this.activeGaps.get(cameraId);
    if (!gap || gap.resolvedAt) return undefined;

    gap.resolvedAt = resolvedAt;
    gap.endTime = resolvedAt;
    this.activeGaps.delete(cameraId);
    return gap;
  }

  getActiveGap(cameraId: string): RecordingGapItem | undefined {
    return this.activeGaps.get(cameraId);
  }
}
