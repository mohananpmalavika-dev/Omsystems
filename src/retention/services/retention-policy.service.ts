/**
 * Retention Policy & Assessment Orchestrator Service
 * 
 * Generates auditable RetentionAssessment records combining evidence verification,
 * exact span calculations, deterministic policy thresholds, and predictive forecasting.
 */

import type {
  RetentionAssessment,
  RetentionEvidence,
  RetentionPolicyAssignment,
  RetentionPolicy,
} from "../domain/retention.types.js";
import {
  DEFAULT_RETENTION_POLICY,
  evaluateRetention,
  resolveScopedRetentionPolicy,
} from "../domain/retention-policy.js";
import { retentionCalculatorService } from "./retention-calculator.service.js";
import { retentionEvidenceService } from "./retention-evidence.service.js";
import { retentionPredictionService, type StorageMetricsInput } from "./retention-prediction.service.js";

export interface AssessmentRequest {
  tenantId: string;
  branchId: string;
  recorderId: string;
  cameraId?: string | undefined;
  cameraName?: string | undefined;
  evidenceList: RetentionEvidence[];
  storageMetrics?: StorageMetricsInput | undefined;
  now?: Date | undefined;
}

export class RetentionPolicyService {
  private policyAssignments: RetentionPolicyAssignment[] = [];
  private assessments: Map<string, RetentionAssessment> = new Map();

  addPolicyAssignment(assignment: RetentionPolicyAssignment) {
    this.policyAssignments.push(assignment);
  }

  getPolicyAssignments(tenantId: string): RetentionPolicyAssignment[] {
    return this.policyAssignments.filter((p) => p.tenantId === tenantId);
  }

  /**
   * Assesses a camera or recorder against active policy
   */
  assess(request: AssessmentRequest): RetentionAssessment {
    const now = request.now ?? new Date();

    // 1. Resolve Policy
    const policy = resolveScopedRetentionPolicy(
      {
        tenantId: request.tenantId,
        branchId: request.branchId,
        recorderId: request.recorderId,
        cameraId: request.cameraId,
      },
      this.policyAssignments
    );

    // 2. Evaluate Evidence Agreement & Quality
    const freshEvidence = request.evidenceList.filter((e) =>
      retentionEvidenceService.isEvidenceFresh(e, now, policy.unknownAfterMinutes)
    );

    const agreementResult = retentionEvidenceService.evaluateAgreement(freshEvidence);
    const hasEvidence = freshEvidence.length > 0 && agreementResult.agreement !== "NO_EVIDENCE";

    // 3. Compute Actual Retention Days & Window
    let actualRetentionDays: number | undefined;
    let recordingWindow;
    let coveragePercent: number | undefined = 100;

    if (hasEvidence && agreementResult.effectiveOldestAt && agreementResult.effectiveNewestAt) {
      recordingWindow = retentionCalculatorService.calculateRecordingWindow(
        agreementResult.effectiveOldestAt,
        agreementResult.effectiveNewestAt,
        now
      );
      actualRetentionDays = recordingWindow.archiveSpanDays;

      // Extract gaps if available on evidence
      const withGaps = freshEvidence.find((e) => e.recordingGapMinutes !== undefined && e.recordingGapMinutes > 0);
      if (withGaps && withGaps.recordingGapMinutes) {
        const totalSpanMins = Math.max(1, actualRetentionDays * 1440);
        coveragePercent = Number((((totalSpanMins - withGaps.recordingGapMinutes) / totalSpanMins) * 100).toFixed(2));
      }
    }

    // 4. Deterministic Policy Evaluation
    const evaluation = evaluateRetention(actualRetentionDays, coveragePercent, policy, hasEvidence);

    // 5. Predictive Storage Risk Analysis
    const prediction = retentionPredictionService.predict(
      {
        totalBytes: request.storageMetrics?.totalBytes ?? 16 * 1024 * 1024 * 1024 * 1024,
        freeBytes: request.storageMetrics?.freeBytes ?? 380 * 1024 * 1024 * 1024,
        dailyWriteRateBytes: request.storageMetrics?.dailyWriteRateBytes ?? 190 * 1024 * 1024 * 1024,
        disksWarningCount: request.storageMetrics?.disksWarningCount ?? 0,
        disksFailedCount: request.storageMetrics?.disksFailedCount ?? 0,
        currentActualRetentionDays: actualRetentionDays,
        requiredRetentionDays: policy.requiredDays,
      },
      now
    );

    // Check evidence conflict override
    let finalState = evaluation.state;
    let finalReason = evaluation.reason;
    if (agreementResult.agreement === "CONFLICTING") {
      finalState = "UNKNOWN";
      finalReason = "EVIDENCE_CONFLICT";
    }

    const assessmentId = `assess-${request.branchId}-${request.cameraId ?? request.recorderId}-${Date.now()}`;
    const assessment: RetentionAssessment = {
      id: assessmentId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      recorderId: request.recorderId,
      cameraId: request.cameraId,
      cameraName: request.cameraName,

      requiredRetentionDays: policy.requiredDays,
      actualRetentionDays,
      projectedRetentionDays: prediction.projectedRetentionDays,
      daysUntilPolicyViolation: prediction.daysUntilPolicyViolation,
      coveragePercent,

      state: finalState,
      complianceState: evaluation.complianceState,
      riskState: prediction.riskState,
      reason: finalReason,

      confidence: agreementResult.effectiveConfidence,
      evidenceAgreement: agreementResult.agreement,
      evaluatedAt: now,
      evidenceIds: freshEvidence.map((e) => e.id),
      recordingWindow,
    };

    this.assessments.set(assessment.id, assessment);
    return assessment;
  }

  getAssessment(id: string): RetentionAssessment | undefined {
    return this.assessments.get(id);
  }
}

export const retentionPolicyService = new RetentionPolicyService();
