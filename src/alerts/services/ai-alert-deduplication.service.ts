/**
 * AI Alert Deduplication & Flapping Suppression Engine
 * 
 * Prevents high-frequency AI detectors (e.g., 10-30 FPS video models) from flooding
 * the control room with hundreds of duplicate alert rows for a continuous detection.
 */

import type { SurveillanceAlert } from "../domain/surveillance-alert.types.js";

export interface DedupEvaluationResult {
  isDuplicate: boolean;
  existingAlert?: SurveillanceAlert | undefined;
  occurrenceCount: number;
}

export class AiAlertDeduplicationService {
  private activeAlertFingerprints: Map<string, { alertId: string; lastSeenAt: Date; occurrenceCount: number }> = new Map();

  generateFingerprint(alert: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    alertType: string;
    zone: string;
  }): string {
    return `${alert.tenantId}:${alert.branchId}:${alert.cameraId}:${alert.alertType}:${alert.zone}`;
  }

  evaluate(
    alert: {
      tenantId: string;
      branchId: string;
      cameraId: string;
      alertType: string;
      zone: string;
    },
    suppressionWindowMs = 60_000,
    now = new Date()
  ): { isDuplicate: boolean; alertId?: string | undefined; occurrenceCount: number } {
    const key = this.generateFingerprint(alert);
    const existing = this.activeAlertFingerprints.get(key);

    if (existing) {
      const elapsed = now.getTime() - existing.lastSeenAt.getTime();
      if (elapsed < suppressionWindowMs) {
        existing.occurrenceCount += 1;
        existing.lastSeenAt = now;
        return {
          isDuplicate: true,
          alertId: existing.alertId,
          occurrenceCount: existing.occurrenceCount,
        };
      }
    }

    // New active alert window
    return {
      isDuplicate: false,
      occurrenceCount: 1,
    };
  }

  registerActiveAlert(alert: SurveillanceAlert) {
    const key = this.generateFingerprint(alert);
    this.activeAlertFingerprints.set(key, {
      alertId: alert.id,
      lastSeenAt: alert.lastSeenAt,
      occurrenceCount: alert.occurrenceCount,
    });
  }

  clear() {
    this.activeAlertFingerprints.clear();
  }
}

export const aiAlertDeduplicationService = new AiAlertDeduplicationService();
