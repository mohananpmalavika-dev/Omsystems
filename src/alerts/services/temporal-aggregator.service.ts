import type { DetectionEvent, NormalizedDetection } from "../domain/detection-event.types.js";
import { DeduplicationPolicyService, deduplicationPolicyService } from "./deduplication-policy.service.js";

export class TemporalAggregatorService {
  private readonly activeStreams = new Map<string, DetectionEvent>(); // key: stream aggregation key

  constructor(private readonly policyService: DeduplicationPolicyService = deduplicationPolicyService) {}

  buildStreamKey(detection: NormalizedDetection): string {
    const policy = this.policyService.getPolicy(detection.detectionType);
    if (policy.strategy === "TRACKED_OBJECT" && detection.trackId) {
      return `${detection.tenantId}:${detection.branchId}:${detection.cameraId}:${detection.detectionType}:${detection.trackId}`;
    }
    if (policy.strategy === "CAMERA_ZONE" && detection.zoneId) {
      return `${detection.tenantId}:${detection.branchId}:${detection.cameraId}:${detection.detectionType}:${detection.zoneId}`;
    }
    if (policy.strategy === "LICENSE_PLATE" && detection.metadata?.licensePlate) {
      return `${detection.tenantId}:${detection.branchId}:${detection.metadata.licensePlate}`;
    }
    if (policy.strategy === "IDENTITY" && detection.metadata?.personId) {
      return `${detection.tenantId}:${detection.branchId}:${detection.metadata.personId}`;
    }
    return `${detection.tenantId}:${detection.branchId}:${detection.cameraId}:${detection.detectionType}:${detection.zoneId ?? "ALL"}`;
  }

  aggregate(detection: NormalizedDetection, windowThresholdMs = 2000): { event: DetectionEvent; isNewEvent: boolean } {
    const key = this.buildStreamKey(detection);
    const existing = this.activeStreams.get(key);
    const now = detection.detectedAt;

    if (existing && existing.state === "ACTIVE") {
      const elapsed = now.getTime() - existing.lastDetectedAt.getTime();
      if (elapsed <= windowThresholdMs) {
        // Continue aggregating within rapid frame window
        existing.detectionCount += 1;
        existing.lastDetectedAt = now;
        if (detection.confidence) {
          existing.maxConfidence = Math.max(existing.maxConfidence ?? 0, detection.confidence);
          existing.averageConfidence =
            ((existing.averageConfidence ?? detection.confidence) * (existing.detectionCount - 1) + detection.confidence) /
            existing.detectionCount;
        }
        return { event: existing, isNewEvent: false };
      }
    }

    // New temporal event window
    const newEvent: DetectionEvent = {
      eventId: `devt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId: detection.tenantId,
      branchId: detection.branchId,
      cameraId: detection.cameraId,
      eventType: detection.detectionType,
      trackId: detection.trackId,
      zoneId: detection.zoneId,
      firstDetectedAt: now,
      lastDetectedAt: now,
      detectionCount: 1,
      maxConfidence: detection.confidence,
      averageConfidence: detection.confidence,
      deduplicationKey: key,
      state: "ACTIVE",
    };

    this.activeStreams.set(key, newEvent);
    return { event: newEvent, isNewEvent: true };
  }

  getActiveEvent(key: string): DetectionEvent | null {
    return this.activeStreams.get(key) ?? null;
  }
}

export const temporalAggregatorService = new TemporalAggregatorService();
