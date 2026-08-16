/**
 * Deterministic Retention Policy Evaluator & Resolution Engine
 */

import type {
  RetentionPolicy,
  RetentionPolicyAssignment,
  RetentionState,
  RetentionComplianceState,
  RetentionRiskState,
  RetentionReason,
} from "./retention.types.js";

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  requiredDays: 90,
  warningDays: 5,
  criticalDeficitDays: 15,
  unknownAfterMinutes: 60,
  minimumCoveragePercent: 98,
};

export interface PolicyEvaluationResult {
  state: RetentionState;
  complianceState: RetentionComplianceState;
  reason: RetentionReason;
  deficitDays: number;
}

/**
 * Deterministic policy evaluator
 * 
 * CORE INVARIANT: Missing evidence MUST yield UNKNOWN, never HEALTHY.
 * 90/90 is compliant (HEALTHY).
 */
export function evaluateRetention(
  actualDays: number | undefined,
  coveragePercent: number | undefined,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
  evidencePresent = true
): PolicyEvaluationResult {
  // Rule 1: Missing or unverified evidence -> UNKNOWN (NEVER HEALTHY)
  if (!evidencePresent || actualDays === undefined || Number.isNaN(actualDays)) {
    return {
      state: "UNKNOWN",
      complianceState: "UNKNOWN",
      reason: "INSUFFICIENT_EVIDENCE",
      deficitDays: policy.requiredDays,
    };
  }

  const deficitDays = policy.requiredDays - actualDays;

  // Rule 2: Coverage gap check (below minimum threshold e.g. 98%)
  const hasSevereCoverageGaps = coveragePercent !== undefined && coveragePercent < policy.minimumCoveragePercent;

  // Rule 3: Severe deficit (e.g. 61 days vs 90 days required)
  if (actualDays < policy.requiredDays - policy.criticalDeficitDays) {
    return {
      state: "CRITICAL",
      complianceState: "VIOLATION",
      reason: "SEVERE_RETENTION_SHORTFALL",
      deficitDays,
    };
  }

  // Rule 4: Standard violation (e.g. 88 days vs 90 days required)
  if (actualDays < policy.requiredDays) {
    return {
      state: "VIOLATION",
      complianceState: "VIOLATION",
      reason: "BELOW_REQUIRED_RETENTION",
      deficitDays,
    };
  }

  // Rule 5: Recording gap violation even if total archive span matches
  if (hasSevereCoverageGaps) {
    return {
      state: "VIOLATION",
      complianceState: "VIOLATION",
      reason: "RECORDING_GAPS",
      deficitDays: 0,
    };
  }

  // Rule 6: Warning threshold (e.g. 90 to 95 days when warningDays = 5)
  if (actualDays < policy.requiredDays + policy.warningDays) {
    return {
      state: "WARNING",
      complianceState: "COMPLIANT",
      reason: "NEAR_THRESHOLD",
      deficitDays: 0,
    };
  }

  // Rule 7: Fully compliant & healthy
  return {
    state: "HEALTHY",
    complianceState: "COMPLIANT",
    reason: "MEETS_POLICY",
    deficitDays: 0,
  };
}

/**
 * Scoped Policy Resolver
 * 
 * Resolves retention requirements through the inheritance hierarchy:
 * Camera override (P100) -> Camera Group (P80) -> Recorder (P60) -> Branch (P40) -> Region (P20) -> Tenant Default (P0)
 */
export function resolveScopedRetentionPolicy(
  context: {
    tenantId: string;
    regionId?: string;
    branchId?: string;
    recorderId?: string;
    cameraGroupId?: string;
    cameraId?: string;
  },
  assignments: RetentionPolicyAssignment[]
): RetentionPolicy {
  const matched = assignments
    .filter((a) => a.tenantId === context.tenantId)
    .filter((a) => {
      if (a.scopeType === "CAMERA" && context.cameraId && a.scopeId === context.cameraId) return true;
      if (a.scopeType === "CAMERA_GROUP" && context.cameraGroupId && a.scopeId === context.cameraGroupId) return true;
      if (a.scopeType === "RECORDER" && context.recorderId && a.scopeId === context.recorderId) return true;
      if (a.scopeType === "BRANCH" && context.branchId && a.scopeId === context.branchId) return true;
      if (a.scopeType === "REGION" && context.regionId && a.scopeId === context.regionId) return true;
      if (a.scopeType === "TENANT" && a.scopeId === context.tenantId) return true;
      return false;
    })
    .sort((a, b) => b.priority - a.priority);

  if (matched.length > 0 && matched[0]) {
    const top = matched[0];
    return {
      requiredDays: top.requiredRetentionDays,
      warningDays: top.warningThresholdDays ?? DEFAULT_RETENTION_POLICY.warningDays,
      criticalDeficitDays: DEFAULT_RETENTION_POLICY.criticalDeficitDays,
      unknownAfterMinutes: DEFAULT_RETENTION_POLICY.unknownAfterMinutes,
      minimumCoveragePercent: top.minimumCoveragePercent ?? DEFAULT_RETENTION_POLICY.minimumCoveragePercent,
    };
  }

  return DEFAULT_RETENTION_POLICY;
}
