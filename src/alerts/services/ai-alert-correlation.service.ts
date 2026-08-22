/**
 * AI Alert Correlation Engine
 * 
 * Correlates multiple co-located security events occurring within a tight temporal window
 * (e.g., Camera Tamper + Vault Intrusion within 30 seconds -> Multi-Sensor Breach Incident).
 */

import type { SurveillanceAlert } from "../domain/surveillance-alert.types.js";

export interface CorrelatedGroup {
  correlationId: string;
  incidentTitle: string;
  branchId: string;
  alertIds: string[];
  firstAlertAt: Date;
  lastAlertAt: Date;
  severity: "P1" | "P2" | "P3" | "P4";
}

export class AiAlertCorrelationService {
  private activeCorrelations: Map<string, CorrelatedGroup> = new Map(); // branchId -> active correlation

  correlate(alert: SurveillanceAlert, timeWindowMs = 60_000, now = new Date()): { correlationId: string; incidentId?: string | undefined } {
    let group = this.activeCorrelations.get(alert.branchId);

    if (group && (now.getTime() - group.lastAlertAt.getTime()) < timeWindowMs) {
      group.alertIds.push(alert.id);
      group.lastAlertAt = now;
      if (alert.severity === "P1") group.severity = "P1";

      const incidentId = group.alertIds.length >= 2 ? `inc-${group.correlationId}` : undefined;
      return {
        correlationId: group.correlationId,
        incidentId,
      };
    }

    // Start a new correlation group for this branch
    const correlationId = `corr-${alert.branchId}-${now.getTime()}`;
    group = {
      correlationId,
      incidentTitle: `Security Incident at ${alert.branchName}`,
      branchId: alert.branchId,
      alertIds: [alert.id],
      firstAlertAt: now,
      lastAlertAt: now,
      severity: alert.severity,
    };
    this.activeCorrelations.set(alert.branchId, group);

    return {
      correlationId,
      incidentId: undefined,
    };
  }

  getActiveCorrelation(branchId: string): CorrelatedGroup | undefined {
    return this.activeCorrelations.get(branchId);
  }

  clear() {
    this.activeCorrelations.clear();
  }
}

export const aiAlertCorrelationService = new AiAlertCorrelationService();
