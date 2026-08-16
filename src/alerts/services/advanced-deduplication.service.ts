import type {
  DeduplicationMetrics,
  DeduplicationResult,
  DetectionEvent,
} from "../domain/detection-event.types.js";
import type { SurveillanceAlert } from "../domain/surveillance-alert.types.js";
import { DeduplicationPolicyService, deduplicationPolicyService } from "./deduplication-policy.service.js";

export interface ActiveDedupEntry {
  eventId: string;
  alertId: string;
  dedupKey: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  occurrenceCount: number;
  maxConfidence?: number | undefined;
  cooldownExpiresAt?: Date | undefined;
  state: "ACTIVE" | "COOLDOWN" | "RESOLVED";
}

export class AdvancedDeduplicationService {
  private readonly activeWindows = new Map<string, ActiveDedupEntry>(); // key: dedupKey
  private readonly metrics: DeduplicationMetrics = {
    detectionsReceivedTotal: 0,
    eventsCreatedTotal: 0,
    detectionsDeduplicatedTotal: 0,
    eventsCorrelatedTotal: 0,
    alertsCreatedTotal: 0,
    suppressionRatioPercent: 0,
  };

  constructor(private readonly policyService: DeduplicationPolicyService = deduplicationPolicyService) {}

  processEvent(event: DetectionEvent, now = new Date()): DeduplicationResult {
    this.metrics.detectionsReceivedTotal += 1;
    const policy = this.policyService.getPolicy(event.eventType);
    const key = event.deduplicationKey;
    const existing = this.activeWindows.get(key);

    if (existing) {
      const windowMs = policy.windowSeconds * 1000;
      const elapsedSinceLast = now.getTime() - existing.lastSeenAt.getTime();

      // 1. Within Active Sliding Window -> MERGE
      if (existing.state === "ACTIVE" && elapsedSinceLast <= windowMs) {
        existing.occurrenceCount = event.detectionCount;
        existing.lastSeenAt = now;
        if (event.maxConfidence) {
          existing.maxConfidence = Math.max(existing.maxConfidence ?? 0, event.maxConfidence);
        }

        this.metrics.detectionsDeduplicatedTotal += 1;
        this.updateSuppressionRatio();

        const durationSeconds = Math.round((now.getTime() - existing.firstSeenAt.getTime()) / 1000);
        return {
          action: "MERGED",
          eventId: existing.eventId,
          alertId: existing.alertId,
          occurrenceCount: existing.occurrenceCount,
          durationSeconds,
          deduplicationKey: key,
          reason: `Merged into active alert ${existing.alertId} (${existing.occurrenceCount} occurrences over ${durationSeconds}s)`,
        };
      }

      // 2. Within Cooldown -> REOPEN or SUPPRESS
      if (existing.state === "COOLDOWN" || (existing.state === "ACTIVE" && elapsedSinceLast > windowMs)) {
        const cooldownMs = policy.cooldownSeconds * 1000;
        if (elapsedSinceLast <= windowMs + cooldownMs) {
          // Reopen existing alert
          existing.state = "ACTIVE";
          existing.occurrenceCount += event.detectionCount;
          existing.lastSeenAt = now;

          this.metrics.detectionsDeduplicatedTotal += event.detectionCount;
          this.updateSuppressionRatio();

          const durationSeconds = Math.round((now.getTime() - existing.firstSeenAt.getTime()) / 1000);
          return {
            action: "REOPENED",
            eventId: existing.eventId,
            alertId: existing.alertId,
            occurrenceCount: existing.occurrenceCount,
            durationSeconds,
            deduplicationKey: key,
            reason: `Reopened during ${policy.cooldownSeconds}s cooldown period`,
          };
        }
      }
    }

    // 3. New Independent Alert Window -> CREATE
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newEntry: ActiveDedupEntry = {
      eventId: event.eventId,
      alertId,
      dedupKey: key,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: event.detectionCount,
      maxConfidence: event.maxConfidence,
      state: "ACTIVE",
    };

    this.activeWindows.set(key, newEntry);
    this.metrics.eventsCreatedTotal += 1;
    this.metrics.alertsCreatedTotal += 1;
    this.updateSuppressionRatio();

    return {
      action: "CREATED",
      eventId: event.eventId,
      alertId,
      occurrenceCount: event.detectionCount,
      durationSeconds: 0,
      deduplicationKey: key,
      reason: "Initial detection created new alert",
    };
  }

  resolveAlert(dedupKey: string, now = new Date()): void {
    const entry = this.activeWindows.get(dedupKey);
    if (entry) {
      entry.state = "COOLDOWN";
      const policy = this.policyService.getPolicy("INTRUSION");
      entry.cooldownExpiresAt = new Date(now.getTime() + policy.cooldownSeconds * 1000);
    }
  }

  getActiveWindows(): ActiveDedupEntry[] {
    return Array.from(this.activeWindows.values());
  }

  getMetrics(): DeduplicationMetrics {
    return { ...this.metrics };
  }

  private updateSuppressionRatio(): void {
    if (this.metrics.detectionsReceivedTotal === 0) {
      this.metrics.suppressionRatioPercent = 0;
      return;
    }
    const suppressed = this.metrics.detectionsReceivedTotal - this.metrics.alertsCreatedTotal;
    this.metrics.suppressionRatioPercent =
      Math.round((suppressed / this.metrics.detectionsReceivedTotal) * 10000) / 100;
  }
}

export const advancedDeduplicationService = new AdvancedDeduplicationService();
