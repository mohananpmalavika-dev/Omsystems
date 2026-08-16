/**
 * Priority Scoring Engine & Branch Fairness Controller
 * 
 * Computes deterministic security-driven priority scores and enforces
 * fairness across multi-branch deployments.
 */

import type { FairnessPolicy, StreamCandidate, StreamPriority } from "./types";

export const DEFAULT_FAIRNESS_POLICY: FairnessPolicy = {
  maxNormalStreamsPerBranch: 4,
  maxAlarmStreamsPerBranch: 16,
};

/**
 * Calculates absolute numeric priority score for a stream candidate.
 */
export function calculatePriorityScore(
  candidate: StreamCandidate,
  branchHealth?: "HEALTHY" | "WARNING" | "CRITICAL"
): number {
  if (candidate.healthState === "OFFLINE") {
    return 0; // Offline cameras should not consume decode resources
  }

  let score = 0;

  // 1. Operator Intent (Highest Precedence)
  if (candidate.selected) score += 10_000;
  if (candidate.pinned) score += 5_000;
  if (candidate.requestedQuality === "FOCUSED") score += 1_000;

  // 2. Security & AI Alarms
  if (candidate.alertSeverity === "CRITICAL") {
    score += 9_000;
  } else if (candidate.alertSeverity === "HIGH" || candidate.alarmActive) {
    score += 6_000;
  } else if (candidate.alertSeverity === "MEDIUM") {
    score += 3_000;
  } else if (candidate.alarmActive) {
    score += 8_000;
  }

  // 3. Viewport Visibility
  if (candidate.visible) {
    score += 2_000;
  }

  // 4. Branch Health Context
  const effectiveBranchHealth = branchHealth ?? (candidate.healthState === "CRITICAL" ? "CRITICAL" : candidate.healthState === "WARNING" ? "WARNING" : "HEALTHY");
  if (effectiveBranchHealth === "CRITICAL") {
    score += 1_500;
  } else if (effectiveBranchHealth === "WARNING") {
    score += 750;
  }

  // 5. Recency Bonus
  if (candidate.lastViewedAt) {
    const ageSec = (Date.now() - candidate.lastViewedAt) / 1000;
    if (ageSec < 60) score += 300;
  }

  return score;
}

/**
 * Maps numeric score to standard priority tier (P0..P4).
 */
export function resolvePriorityTier(candidate: StreamCandidate, score: number): StreamPriority {
  if (candidate.selected || candidate.requestedQuality === "FOCUSED") return "P0";
  if (candidate.alertSeverity === "CRITICAL" || score >= 9000) return "P1";
  if (candidate.alertSeverity === "HIGH" || candidate.alarmActive || score >= 6000) return "P2";
  if (candidate.visible || candidate.pinned || score >= 2000) return "P3";
  return "P4";
}

/**
 * Applies multi-branch fairness constraints to candidate list.
 * Critical alerts (P1) bypass normal branch quota constraints.
 */
export function filterByFairnessPolicy(
  candidates: StreamCandidate[],
  policy: FairnessPolicy = DEFAULT_FAIRNESS_POLICY
): StreamCandidate[] {
  const branchCounts = new Map<string, { normal: number; alarm: number }>();

  return candidates.filter((c) => {
    // P0 and P1 bypass fairness limits
    if (c.selected || c.alertSeverity === "CRITICAL" || c.priority === "P0" || c.priority === "P1") {
      return true;
    }

    const current = branchCounts.get(c.branchId) || { normal: 0, alarm: 0 };
    const isAlarm = Boolean(c.alarmActive || c.alertSeverity);

    if (isAlarm) {
      if (current.alarm >= policy.maxAlarmStreamsPerBranch) return false;
      current.alarm++;
    } else {
      if (current.normal >= policy.maxNormalStreamsPerBranch) return false;
      current.normal++;
    }

    branchCounts.set(c.branchId, current);
    return true;
  });
}
