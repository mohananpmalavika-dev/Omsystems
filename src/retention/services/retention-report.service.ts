/**
 * Daily Retention Compliance Report Generator
 */

import type {
  DailyRetentionReport,
  BranchRetentionSummary,
} from "../domain/retention.types.js";

export class RetentionReportService {
  /**
   * Generates a formal daily retention report
   */
  generateDailyReport(
    dateStr: string,
    branches: BranchRetentionSummary[],
    newViolations: string[] = [],
    resolvedViolations: string[] = []
  ): DailyRetentionReport {
    const totalBranches = branches.length;
    const fullyCompliant = branches.filter((b) => b.state === "HEALTHY").length;
    const atRisk = branches.filter((b) => b.riskState === "AT_RISK" || b.riskState === "IMMINENT").length;
    const retentionViolations = branches.filter((b) => b.state === "VIOLATION").length;
    const criticalViolations = branches.filter((b) => b.state === "CRITICAL").length;
    const unableToVerify = branches.filter((b) => b.state === "UNKNOWN").length;

    // Worst offenders (branches with lowest actual retention)
    const offenders = branches
      .filter((b) => b.worstRetentionDays !== undefined && b.worstRetentionDays < b.requiredRetentionDays)
      .map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        requiredDays: b.requiredRetentionDays,
        actualDays: b.worstRetentionDays!,
        deficitDays: Number((b.requiredRetentionDays - b.worstRetentionDays!).toFixed(1)),
        state: b.state,
      }))
      .sort((a, b) => b.deficitDays - a.deficitDays)
      .slice(0, 10);

    const predictedViolations7Days = branches
      .filter((b) => b.daysUntilViolation !== undefined && b.daysUntilViolation <= 7 && b.state !== "CRITICAL" && b.state !== "VIOLATION")
      .map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        predictedDays: b.worstRetentionDays ? Math.max(0, b.worstRetentionDays - 7) : 85,
        daysUntilViolation: b.daysUntilViolation!,
      }))
      .sort((a, b) => a.daysUntilViolation - b.daysUntilViolation);

    const persistentViolations = branches
      .filter((b) => (b.state === "CRITICAL" || b.state === "VIOLATION") && !newViolations.includes(b.branchId))
      .map((b) => b.branchId);

    return {
      date: dateStr,
      totalBranches,
      fullyCompliant,
      atRisk,
      retentionViolations,
      criticalViolations,
      unableToVerify,
      worstOffenders: offenders,
      newViolations,
      resolvedViolations,
      persistentViolations,
      predictedViolations7Days,
      generatedAt: new Date(),
    };
  }
}

export const retentionReportService = new RetentionReportService();
