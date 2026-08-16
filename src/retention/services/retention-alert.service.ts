/**
 * Retention Alert & State Transition Service
 * 
 * Manages compliance alert lifecycles and transitions between states,
 * preventing noisy notification storms while guaranteeing escalation.
 */

import type {
  RetentionAssessment,
  RetentionState,
} from "../domain/retention.types.js";

export interface RetentionAlertEvent {
  id: string;
  tenantId: string;
  branchId: string;
  entityId: string;
  previousState: RetentionState;
  newState: RetentionState;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  createdAt: Date;
}

export class RetentionAlertService {
  private previousStates: Map<string, RetentionState> = new Map();
  private alerts: RetentionAlertEvent[] = [];

  /**
   * Evaluates if state transition occurred and creates alert if necessary
   */
  handleTransition(assessment: RetentionAssessment): RetentionAlertEvent | null {
    const key = `${assessment.branchId}:${assessment.cameraId ?? assessment.recorderId}`;
    const previousState = this.previousStates.get(key) ?? "HEALTHY";
    const currentState = assessment.state;

    this.previousStates.set(key, currentState);

    if (previousState === currentState) {
      return null;
    }

    let severity: "INFO" | "WARNING" | "CRITICAL" = "INFO";
    let title = "";
    let message = "";

    if (currentState === "CRITICAL") {
      severity = "CRITICAL";
      title = `Critical Retention Deficit — ${assessment.cameraName ?? assessment.cameraId ?? "Recorder"}`;
      message = `Actual retention is ${assessment.actualRetentionDays ?? "—"} days (required: ${assessment.requiredRetentionDays} days). Reason: ${assessment.reason}`;
    } else if (currentState === "VIOLATION") {
      severity = "CRITICAL";
      title = `Retention Policy Violation — ${assessment.cameraName ?? assessment.cameraId ?? "Recorder"}`;
      message = `Actual retention (${assessment.actualRetentionDays ?? "—"}d) is below required policy of ${assessment.requiredRetentionDays}d.`;
    } else if (currentState === "WARNING") {
      severity = "WARNING";
      title = `Retention Warning — ${assessment.cameraName ?? assessment.cameraId ?? "Recorder"}`;
      message = `Retention is near violation threshold (${assessment.actualRetentionDays}d vs ${assessment.requiredRetentionDays}d required).`;
    } else if (currentState === "UNKNOWN") {
      severity = "WARNING";
      title = `Retention Verification Unavailable — ${assessment.cameraName ?? assessment.cameraId ?? "Recorder"}`;
      message = `Unable to verify retention evidence. Reason: ${assessment.reason}`;
    } else if (currentState === "HEALTHY" && previousState !== "HEALTHY") {
      severity = "INFO";
      title = `Retention Recovered — ${assessment.cameraName ?? assessment.cameraId ?? "Recorder"}`;
      message = `Retention has recovered to compliant levels (${assessment.actualRetentionDays}d / ${assessment.requiredRetentionDays}d).`;
    }

    const alert: RetentionAlertEvent = {
      id: `alert-ret-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId: assessment.tenantId,
      branchId: assessment.branchId,
      entityId: assessment.cameraId ?? assessment.recorderId,
      previousState,
      newState: currentState,
      severity,
      title,
      message,
      createdAt: new Date(),
    };

    this.alerts.unshift(alert);
    return alert;
  }

  getAlerts(tenantId: string, limit = 50): RetentionAlertEvent[] {
    return this.alerts.filter((a) => a.tenantId === tenantId).slice(0, limit);
  }
}

export const retentionAlertService = new RetentionAlertService();
