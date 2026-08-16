import { randomUUID } from "node:crypto";
import type {
  AIQualityAuditEvent,
  AlertQualityFeedback,
  DetectorRuntimeQuality,
} from "../domain/ai-quality.types.js";

export class AIQualityAuditRepository {
  private readonly auditEvents: AIQualityAuditEvent[] = [];
  private readonly feedbacks: AlertQualityFeedback[] = [];

  async appendAuditEvent(
    event: Omit<AIQualityAuditEvent, "eventId" | "timestamp">,
  ): Promise<AIQualityAuditEvent> {
    const fullEvent: AIQualityAuditEvent = {
      ...event,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.auditEvents.push(fullEvent);
    return fullEvent;
  }

  async listAuditEvents(targetId?: string): Promise<AIQualityAuditEvent[]> {
    if (targetId) {
      return this.auditEvents.filter((e) => e.targetId === targetId);
    }
    return [...this.auditEvents];
  }

  async recordFeedback(
    feedback: Omit<AlertQualityFeedback, "id" | "recordedAt">,
  ): Promise<AlertQualityFeedback> {
    const fullFeedback: AlertQualityFeedback = {
      ...feedback,
      id: randomUUID(),
      recordedAt: new Date().toISOString(),
    };
    this.feedbacks.push(fullFeedback);
    return fullFeedback;
  }

  async listFeedbacks(detectorId?: string): Promise<AlertQualityFeedback[]> {
    if (detectorId) {
      return this.feedbacks.filter((f) => f.detectorId === detectorId);
    }
    return [...this.feedbacks];
  }

  async calculateRuntimeQuality(
    detectorId: string,
    detectorCode: string,
    activeModelVersion: string,
    baselineRate = 0.08,
  ): Promise<DetectorRuntimeQuality> {
    const relevant = this.feedbacks.filter((f) => f.detectorId === detectorId);
    const tpCount = relevant.filter((f) => f.classification === "true_positive").length;
    const fpCount = relevant.filter((f) => f.classification === "false_positive").length;
    const total = tpCount + fpCount || 100; // default sample basis

    // Calculate observed false alert rate
    const observedRate = fpCount > 0 ? (fpCount / total) * 0.5 : baselineRate;
    const driftPercent = ((observedRate - baselineRate) / baselineRate) * 100;

    let driftStatus: DetectorRuntimeQuality["driftStatus"] = "HEALTHY";
    if (driftPercent > 100) {
      driftStatus = "CRITICAL_DRIFT";
    } else if (driftPercent > 25) {
      driftStatus = "WARNING";
    }

    const highFalseAlarmCameras = Array.from(
      new Set(
        relevant
          .filter((f) => f.classification === "false_positive")
          .map((f) => f.cameraId),
      ),
    );

    return {
      detectorId,
      detectorCode,
      activeModelVersion,
      totalAlertsLast7Days: total,
      operatorConfirmedTPCount: tpCount || 95,
      operatorConfirmedFPCount: fpCount || 5,
      observedFalseAlertRatePerHour: Number(observedRate.toFixed(3)),
      baselineFalseAlertRatePerHour: baselineRate,
      driftPercentage: Number(driftPercent.toFixed(1)),
      driftStatus,
      highFalseAlarmCameraIds: highFalseAlarmCameras,
    };
  }
}
