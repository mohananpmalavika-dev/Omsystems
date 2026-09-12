import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AIQualityAuditEvent,
  AlertQualityFeedback,
  DetectorRuntimeQuality,
} from "../domain/ai-quality.types.js";

export class PostgresAIQualityAuditRepository {
  private readonly memoryAuditEvents: AIQualityAuditEvent[] = [];
  private readonly memoryFeedbacks: AlertQualityFeedback[] = [];

  constructor(private readonly pool?: Pool) {
    if (!this.pool && process.env.NODE_ENV === "production") {
      throw new Error("AI_QUALITY_STORE_UNAVAILABLE: PostgresAIQualityAuditRepository requires a PostgreSQL pool in production");
    }
  }

  async appendAuditEvent(
    event: Omit<AIQualityAuditEvent, "eventId" | "timestamp">,
  ): Promise<AIQualityAuditEvent> {
    const fullEvent: AIQualityAuditEvent = {
      ...event,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO ai_quality_audit (
             id, tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state, reason, occurred_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            fullEvent.eventId,
            event.details?.tenantId || "global",
            event.actor?.userId || "system",
            event.eventType,
            event.details?.targetType || "MODEL",
            event.targetId,
            event.details?.beforeState ? JSON.stringify(event.details.beforeState) : null,
            event.details?.afterState ? JSON.stringify(event.details.afterState) : null,
            event.details?.reason || null,
            new Date(fullEvent.timestamp),
          ],
        );
        return fullEvent;
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`AI_QUALITY_STORE_UNAVAILABLE: Failed to write AI quality audit event: ${(err as Error).message}`);
        }
        console.warn("[PostgresAIQualityAuditRepo] appendAuditEvent DB error:", err);
      }
    }

    this.memoryAuditEvents.push(fullEvent);
    return fullEvent;
  }

  async listAuditEvents(targetId?: string): Promise<AIQualityAuditEvent[]> {
    if (this.pool) {
      try {
        const query = targetId
          ? `SELECT id, tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state, reason, occurred_at
             FROM ai_quality_audit WHERE entity_id = $1 ORDER BY occurred_at DESC`
          : `SELECT id, tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state, reason, occurred_at
             FROM ai_quality_audit ORDER BY occurred_at DESC LIMIT 500`;
        const params = targetId ? [targetId] : [];
        const res = await this.pool.query(query, params);
        return res.rows.map((r) => ({
          eventId: r.id,
          eventType: r.action as any,
          targetId: r.entity_id,
          actor: { userId: r.actor_id, userName: r.actor_id },
          details: {
            tenantId: r.tenant_id,
            targetType: r.entity_type,
            beforeState: r.before_state,
            afterState: r.after_state,
            reason: r.reason,
          },
          timestamp: new Date(r.occurred_at).toISOString(),
        }));
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`AI_QUALITY_STORE_UNAVAILABLE: Failed to list AI quality audit events: ${(err as Error).message}`);
        }
      }
    }
    if (targetId) {
      return this.memoryAuditEvents.filter((e) => e.targetId === targetId);
    }
    return [...this.memoryAuditEvents];
  }

  async recordFeedback(
    feedback: Omit<AlertQualityFeedback, "id" | "recordedAt">,
  ): Promise<AlertQualityFeedback> {
    const fullFeedback: AlertQualityFeedback = {
      ...feedback,
      id: randomUUID(),
      recordedAt: new Date().toISOString(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO ai_false_positive_reports (
             id, tenant_id, alert_id, camera_id, detector_id, model_version_id, operator_id, false_positive_category, notes, reported_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            fullFeedback.id,
            "global",
            feedback.alertId,
            feedback.cameraId,
            feedback.detectorId,
            feedback.modelVersionId,
            feedback.operatorId,
            (feedback.reasonCategory?.toUpperCase() || "OTHER"),
            feedback.notes || null,
            new Date(fullFeedback.recordedAt),
          ],
        );
        return fullFeedback;
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`AI_QUALITY_STORE_UNAVAILABLE: Failed to record feedback: ${(err as Error).message}`);
        }
      }
    }

    const index = this.memoryFeedbacks.findIndex(
      (item) =>
        item.alertId === feedback.alertId &&
        item.detectorId === feedback.detectorId &&
        item.modelVersionId === feedback.modelVersionId,
    );
    if (index >= 0) this.memoryFeedbacks[index] = fullFeedback;
    else this.memoryFeedbacks.push(fullFeedback);
    return fullFeedback;
  }

  async listFeedbacks(detectorId?: string): Promise<AlertQualityFeedback[]> {
    if (detectorId) {
      return this.memoryFeedbacks.filter((f) => f.detectorId === detectorId);
    }
    return [...this.memoryFeedbacks];
  }

  async calculateRuntimeQuality(
    detectorId: string,
    detectorCode: string,
    activeModelVersion: string,
    baselineRate?: number,
    modelVersionId?: string,
  ): Promise<DetectorRuntimeQuality> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const relevant = this.memoryFeedbacks.filter((f) => {
      const matchDetector = f.detectorId === detectorId;
      const matchModel = modelVersionId ? f.modelVersionId === modelVersionId : true;
      const matchTime = new Date(f.recordedAt).getTime() >= cutoff;
      return matchDetector && matchModel && matchTime;
    });

    const tpCount = relevant.filter((f) => f.classification === "true_positive").length;
    const fpCount = relevant.filter((f) => f.classification === "false_positive").length;
    const total = relevant.length;

    let observedRate = baselineRate ?? null;
    if (total > 0 && observedRate !== null) {
      const multiplier = 1 + (fpCount - tpCount) / total;
      observedRate = Math.max(0.01, +(observedRate * multiplier).toFixed(3));
    }

    return {
      detectorId,
      detectorCode,
      activeModelVersion,
      totalAlertsLast7Days: total,
      operatorConfirmedTPCount: tpCount,
      operatorConfirmedFPCount: fpCount,
      observedFalseAlertRatePerHour: observedRate,
      baselineFalseAlertRatePerHour: baselineRate ?? null,
      driftPercentage: null,
      driftStatus: "HEALTHY" as const,
      highFalseAlarmCameraIds: [],
    };
  }
}
