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
    const index = this.feedbacks.findIndex(item => item.alertId === feedback.alertId
      && item.detectorId === feedback.detectorId && item.modelVersionId === feedback.modelVersionId);
    if (index >= 0) this.feedbacks[index] = fullFeedback;
    else this.feedbacks.push(fullFeedback);
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
    baselineRate?: number,
    modelVersionId?: string,
  ): Promise<DetectorRuntimeQuality> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const relevant = this.feedbacks.filter((f) => f.detectorId === detectorId
      && (!modelVersionId || f.modelVersionId === modelVersionId) && Date.parse(f.recordedAt) >= cutoff);
    const tpCount = relevant.filter((f) => f.classification === "true_positive").length;
    const fpCount = relevant.filter((f) => f.classification === "false_positive").length;
    // Reviewed alert counts cannot establish a per-camera-hour rate without
    // monitored camera exposure and complete alert coverage.

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
      totalAlertsLast7Days: relevant.length,
      operatorConfirmedTPCount: tpCount,
      operatorConfirmedFPCount: fpCount,
      observedFalseAlertRatePerHour: null,
      baselineFalseAlertRatePerHour: baselineRate !== undefined && Number.isFinite(baselineRate) && baselineRate >= 0 ? baselineRate : null,
      driftPercentage: null,
      driftStatus: "INSUFFICIENT_DATA",
      highFalseAlarmCameraIds: highFalseAlarmCameras,
    };
  }
}
