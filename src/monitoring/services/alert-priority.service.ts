/**
 * Alert Priority Service
 * 
 * Computes dynamic numeric priority scores for work queue ordering
 * based on base severity, escalation level, SLA urgency, and branch criticality.
 */

import type { DurableAlert } from "../domain/monitoring-queue.types.js";

export class AlertPriorityService {
  static calculatePriority(alert: DurableAlert): number {
    const baseScores: Record<string, number> = {
      P1: 1000,
      P2: 500,
      P3: 100,
      P4: 10,
    };

    let score = baseScores[alert.severity] ?? 100;

    // Escalation boost
    if (alert.escalationLevel > 0) {
      score += alert.escalationLevel * 100;
    }

    // SLA Urgency boost (less than 60s remaining)
    if (alert.slaDueAt) {
      const remainingMs = alert.slaDueAt.getTime() - Date.now();
      if (remainingMs > 0 && remainingMs < 60_000) {
        score += 300;
      } else if (remainingMs <= 0) {
        score += 500; // Overdue SLA
      }
    }

    return score;
  }
}
