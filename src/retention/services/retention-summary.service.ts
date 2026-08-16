/**
 * Retention Summary & Multi-Branch Aggregation Service
 * 
 * Aggregates branch-level and fleet-level retention compliance metrics.
 * CRITICAL RULE: NEVER average retention days to determine compliance.
 * Compliance uses worst-case dominance across constituent channels.
 */

import type {
  BranchRetentionSummary,
  RetentionAssessment,
  RetentionState,
  RetentionComplianceState,
  RetentionRiskState,
} from "../domain/retention.types.js";

export class RetentionSummaryService {
  /**
   * Summarizes branch retention state using worst-case dominance
   */
  summarizeBranch(
    branchId: string,
    branchName: string,
    assessments: RetentionAssessment[],
    requiredRetentionDays = 90
  ): BranchRetentionSummary {
    const totalCameras = assessments.length;
    let healthyCount = 0;
    let warningCount = 0;
    let violationCount = 0;
    let criticalCount = 0;
    let unknownCount = 0;

    let worstRetentionDays: number | undefined;
    let totalCoverage = 0;
    let coverageCount = 0;
    let worstDaysUntilViolation: number | undefined;

    for (const a of assessments) {
      if (a.state === "HEALTHY") healthyCount++;
      else if (a.state === "WARNING") warningCount++;
      else if (a.state === "VIOLATION") violationCount++;
      else if (a.state === "CRITICAL") criticalCount++;
      else if (a.state === "UNKNOWN") unknownCount++;

      if (a.actualRetentionDays !== undefined) {
        if (worstRetentionDays === undefined || a.actualRetentionDays < worstRetentionDays) {
          worstRetentionDays = a.actualRetentionDays;
        }
      }

      if (a.coveragePercent !== undefined) {
        totalCoverage += a.coveragePercent;
        coverageCount++;
      }

      if (a.daysUntilPolicyViolation !== undefined) {
        if (worstDaysUntilViolation === undefined || a.daysUntilPolicyViolation < worstDaysUntilViolation) {
          worstDaysUntilViolation = a.daysUntilPolicyViolation;
        }
      }
    }

    // Aggregation Hierarchy: CRITICAL > VIOLATION > UNKNOWN > WARNING > HEALTHY
    let state: RetentionState = "HEALTHY";
    let complianceState: RetentionComplianceState = "COMPLIANT";

    if (criticalCount > 0) {
      state = "CRITICAL";
      complianceState = "VIOLATION";
    } else if (violationCount > 0) {
      state = "VIOLATION";
      complianceState = "VIOLATION";
    } else if (unknownCount > 0) {
      state = "UNKNOWN";
      complianceState = "UNKNOWN";
    } else if (warningCount > 0) {
      state = "WARNING";
      complianceState = "COMPLIANT";
    }

    // Risk state determination
    let riskState: RetentionRiskState = "STABLE";
    if (worstDaysUntilViolation !== undefined && worstDaysUntilViolation <= 2) {
      riskState = "IMMINENT";
    } else if (worstDaysUntilViolation !== undefined && worstDaysUntilViolation <= 7) {
      riskState = "AT_RISK";
    }

    const averageCoveragePercent = coverageCount > 0 ? Number((totalCoverage / coverageCount).toFixed(1)) : 100;

    return {
      branchId,
      branchName,
      cameraCount: totalCameras,
      healthy: healthyCount,
      warning: warningCount,
      violation: violationCount,
      critical: criticalCount,
      unknown: unknownCount,
      worstRetentionDays,
      requiredRetentionDays,
      state,
      complianceState,
      riskState,
      averageCoveragePercent,
      daysUntilViolation: worstDaysUntilViolation,
      lastCheckedAt: new Date(),
    };
  }

  /**
   * Summarizes fleet-wide surveillance retention across all branches
   */
  summarizeFleet(branches: BranchRetentionSummary[]) {
    const totalBranches = branches.length;
    const healthy = branches.filter((b) => b.state === "HEALTHY").length;
    const warning = branches.filter((b) => b.state === "WARNING").length;
    const violation = branches.filter((b) => b.state === "VIOLATION").length;
    const critical = branches.filter((b) => b.state === "CRITICAL").length;
    const unknown = branches.filter((b) => b.state === "UNKNOWN").length;
    const atRisk = branches.filter((b) => b.riskState === "AT_RISK" || b.riskState === "IMMINENT").length;

    return {
      totalBranches,
      healthy,
      warning,
      violation,
      critical,
      unknown,
      atRisk,
      compliantCount: healthy + warning,
      complianceRate: totalBranches > 0 ? Number((((healthy + warning) / totalBranches) * 100).toFixed(1)) : 100,
    };
  }
}

export const retentionSummaryService = new RetentionSummaryService();
