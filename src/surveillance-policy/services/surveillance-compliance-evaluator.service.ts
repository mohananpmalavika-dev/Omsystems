import type {
  BranchComplianceReport,
  ComplianceResult,
  ComplianceRule,
  ComplianceStatus,
  DeviceComplianceSummary,
  EffectiveSurveillancePolicy,
} from "../domain/surveillance-policy.types.js";

export interface CameraComplianceInput {
  cameraId: string;
  branchId: string;
  online?: boolean;
  recording?: boolean;
  retentionDaysObserved?: number;
  maxRecordingGapSeconds?: number;
  timeDriftSeconds?: number;
  availabilityPercent?: number;
  heartbeatAgeSeconds?: number;
  isUnderMaintenance?: boolean;
}

export interface RecorderComplianceInput {
  recorderId: string;
  branchId: string;
  online?: boolean;
  recording?: boolean;
  retentionDaysObserved?: number;
  maxRecordingGapSeconds?: number;
  diskFreePercent?: number;
  timeDriftSeconds?: number;
  availabilityPercent?: number;
  heartbeatAgeSeconds?: number;
  isUnderMaintenance?: boolean;
}

export class SurveillanceComplianceEvaluatorService {
  // ==================== DISCRETE RULE EVALUATORS ====================

  evaluateRetention(
    observedDays: number | undefined,
    policy: EffectiveSurveillancePolicy,
    evaluatedAt: string = new Date().toISOString(),
  ): ComplianceResult {
    if (observedDays === undefined) {
      return {
        rule: "RETENTION",
        status: "UNKNOWN",
        expected: policy.retentionDays,
        unit: "days",
        reason: "Retention evidence is currently unavailable or unverified",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    const diff = Number((observedDays - policy.retentionDays).toFixed(1));
    const isCompliant = observedDays >= policy.retentionDays;

    return {
      rule: "RETENTION",
      status: isCompliant ? "COMPLIANT" : "NON_COMPLIANT",
      expected: policy.retentionDays,
      actual: Number(observedDays.toFixed(1)),
      difference: diff,
      unit: "days",
      reason: isCompliant
        ? `Retention ${observedDays.toFixed(1)} days satisfies required ${policy.retentionDays} days`
        : `Retention ${observedDays.toFixed(1)} days is below required ${policy.retentionDays} days (${diff} days gap)`,
      policyVersion: policy.policyVersion,
      evaluatedAt,
    };
  }

  evaluateRecordingRequired(
    recording: boolean | undefined,
    policy: EffectiveSurveillancePolicy,
    evaluatedAt: string = new Date().toISOString(),
  ): ComplianceResult {
    if (!policy.recordingRequired) {
      return {
        rule: "RECORDING_REQUIRED",
        status: "NOT_APPLICABLE",
        expected: false,
        actual: recording,
        reason: "Recording is not mandatory under this policy scope",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    if (recording === undefined) {
      return {
        rule: "RECORDING_REQUIRED",
        status: "UNKNOWN",
        expected: true,
        reason: "Recording telemetry state is unverified",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    return {
      rule: "RECORDING_REQUIRED",
      status: recording ? "COMPLIANT" : "NON_COMPLIANT",
      expected: true,
      actual: recording,
      reason: recording
        ? "Active video recording confirmed"
        : "Video recording is stopped or unavailable",
      policyVersion: policy.policyVersion,
      evaluatedAt,
    };
  }

  evaluateRecordingGap(
    maxGapSeconds: number | undefined,
    policy: EffectiveSurveillancePolicy,
    evaluatedAt: string = new Date().toISOString(),
  ): ComplianceResult {
    if (maxGapSeconds === undefined) {
      return {
        rule: "RECORDING_GAP",
        status: "UNKNOWN",
        expected: policy.maxRecordingGapSeconds,
        unit: "seconds",
        reason: "Recording continuity telemetry is unverified",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    const isCompliant = maxGapSeconds <= policy.maxRecordingGapSeconds;

    return {
      rule: "RECORDING_GAP",
      status: isCompliant ? "COMPLIANT" : "NON_COMPLIANT",
      expected: policy.maxRecordingGapSeconds,
      actual: maxGapSeconds,
      unit: "seconds",
      difference: maxGapSeconds - policy.maxRecordingGapSeconds,
      reason: isCompliant
        ? `Maximum recording gap ${maxGapSeconds}s is within tolerance (${policy.maxRecordingGapSeconds}s)`
        : `Maximum recording gap ${maxGapSeconds}s exceeds allowed ${policy.maxRecordingGapSeconds}s threshold`,
      policyVersion: policy.policyVersion,
      evaluatedAt,
    };
  }

  evaluateTimeDrift(
    driftSeconds: number | undefined,
    policy: EffectiveSurveillancePolicy,
    evaluatedAt: string = new Date().toISOString(),
  ): ComplianceResult {
    if (driftSeconds === undefined) {
      return {
        rule: "TIME_DRIFT",
        status: "UNKNOWN",
        expected: policy.timeDriftToleranceSeconds,
        unit: "seconds",
        reason: "NTP time synchronization telemetry is unavailable",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    const absDrift = Math.abs(driftSeconds);
    let status: ComplianceStatus = "COMPLIANT";
    let reason = `Clock drift ${driftSeconds.toFixed(1)}s is within tolerance (${policy.timeDriftToleranceSeconds}s)`;

    if (absDrift > policy.timeDriftCriticalSeconds) {
      status = "NON_COMPLIANT";
      reason = `Critical clock drift ${driftSeconds.toFixed(1)}s exceeds ${policy.timeDriftCriticalSeconds}s`;
    } else if (absDrift > policy.timeDriftToleranceSeconds) {
      status = "WARNING";
      reason = `Clock drift ${driftSeconds.toFixed(1)}s exceeds warning tolerance (${policy.timeDriftToleranceSeconds}s)`;
    }

    return {
      rule: "TIME_DRIFT",
      status,
      expected: policy.timeDriftToleranceSeconds,
      actual: Number(driftSeconds.toFixed(1)),
      unit: "seconds",
      difference: absDrift - policy.timeDriftToleranceSeconds,
      reason,
      policyVersion: policy.policyVersion,
      evaluatedAt,
    };
  }

  evaluateDiskFree(
    diskFreePercent: number | undefined,
    policy: EffectiveSurveillancePolicy,
    evaluatedAt: string = new Date().toISOString(),
  ): ComplianceResult {
    if (diskFreePercent === undefined) {
      return {
        rule: "DISK_FREE",
        status: "UNKNOWN",
        expected: policy.diskFreeWarningPercent,
        unit: "%",
        reason: "Storage capacity telemetry is unverified",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    let status: ComplianceStatus = "COMPLIANT";
    let reason = `Available storage ${diskFreePercent.toFixed(1)}% is healthy (warning threshold: ${policy.diskFreeWarningPercent}%)`;

    if (diskFreePercent <= policy.diskFreeCriticalPercent) {
      status = "NON_COMPLIANT";
      reason = `Critical storage capacity! Free space ${diskFreePercent.toFixed(1)}% <= ${policy.diskFreeCriticalPercent}% critical limit`;
    } else if (diskFreePercent <= policy.diskFreeWarningPercent) {
      status = "WARNING";
      reason = `Low storage warning: Free space ${diskFreePercent.toFixed(1)}% <= ${policy.diskFreeWarningPercent}% threshold`;
    }

    return {
      rule: "DISK_FREE",
      status,
      expected: policy.diskFreeWarningPercent,
      actual: Number(diskFreePercent.toFixed(1)),
      unit: "%",
      reason,
      policyVersion: policy.policyVersion,
      evaluatedAt,
    };
  }

  evaluateCameraAvailability(
    availabilityPercent: number | undefined,
    policy: EffectiveSurveillancePolicy,
    isUnderMaintenance: boolean = false,
    evaluatedAt: string = new Date().toISOString(),
  ): ComplianceResult {
    if (isUnderMaintenance) {
      return {
        rule: "CAMERA_AVAILABILITY",
        status: "MAINTENANCE_EXCLUDED",
        expected: policy.cameraAvailabilityTarget,
        actual: availabilityPercent,
        unit: "%",
        reason: "Excluded from SLA availability calculation due to active approved maintenance window",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    if (availabilityPercent === undefined) {
      return {
        rule: "CAMERA_AVAILABILITY",
        status: "UNKNOWN",
        expected: policy.cameraAvailabilityTarget,
        unit: "%",
        reason: "Historical availability telemetry is pending computation",
        policyVersion: policy.policyVersion,
        evaluatedAt,
      };
    }

    const isCompliant = availabilityPercent >= policy.cameraAvailabilityTarget;

    return {
      rule: "CAMERA_AVAILABILITY",
      status: isCompliant ? "COMPLIANT" : "NON_COMPLIANT",
      expected: policy.cameraAvailabilityTarget,
      actual: Number(availabilityPercent.toFixed(2)),
      difference: Number((availabilityPercent - policy.cameraAvailabilityTarget).toFixed(2)),
      unit: "%",
      reason: isCompliant
        ? `Availability ${availabilityPercent.toFixed(2)}% meets target (${policy.cameraAvailabilityTarget}%)`
        : `Availability ${availabilityPercent.toFixed(2)}% breached SLA target (${policy.cameraAvailabilityTarget}%)`,
      policyVersion: policy.policyVersion,
      evaluatedAt,
    };
  }

  // ==================== DEVICE & BRANCH AGGREGATORS ====================

  evaluateCamera(
    input: CameraComplianceInput,
    policy: EffectiveSurveillancePolicy,
    now: string = new Date().toISOString(),
  ): DeviceComplianceSummary {
    const results: ComplianceResult[] = [
      this.evaluateRecordingRequired(input.recording, policy, now),
      this.evaluateRetention(input.retentionDaysObserved, policy, now),
      this.evaluateRecordingGap(input.maxRecordingGapSeconds, policy, now),
      this.evaluateTimeDrift(input.timeDriftSeconds, policy, now),
      this.evaluateCameraAvailability(input.availabilityPercent, policy, input.isUnderMaintenance, now),
    ];

    const nonCompliantCount = results.filter((r) => r.status === "NON_COMPLIANT").length;
    const warningCount = results.filter((r) => r.status === "WARNING").length;
    const unknownCount = results.filter((r) => r.status === "UNKNOWN").length;

    let overallStatus: ComplianceStatus = "COMPLIANT";
    if (nonCompliantCount > 0) overallStatus = "NON_COMPLIANT";
    else if (warningCount > 0) overallStatus = "WARNING";
    else if (unknownCount > 0) overallStatus = "UNKNOWN";

    const applicable = results.filter((r) => r.status !== "NOT_APPLICABLE" && r.status !== "MAINTENANCE_EXCLUDED");
    const compliant = applicable.filter((r) => r.status === "COMPLIANT").length;
    const complianceScore = applicable.length > 0 ? Math.round((compliant / applicable.length) * 100) : 100;

    return {
      deviceId: input.cameraId,
      deviceType: "CAMERA",
      branchId: input.branchId,
      overallStatus,
      complianceScore,
      rules: results,
      evaluatedAt: now,
    };
  }

  evaluateRecorder(
    input: RecorderComplianceInput,
    policy: EffectiveSurveillancePolicy,
    now: string = new Date().toISOString(),
  ): DeviceComplianceSummary {
    const results: ComplianceResult[] = [
      this.evaluateRecordingRequired(input.recording, policy, now),
      this.evaluateRetention(input.retentionDaysObserved, policy, now),
      this.evaluateDiskFree(input.diskFreePercent, policy, now),
      this.evaluateTimeDrift(input.timeDriftSeconds, policy, now),
      this.evaluateRecordingGap(input.maxRecordingGapSeconds, policy, now),
    ];

    const nonCompliantCount = results.filter((r) => r.status === "NON_COMPLIANT").length;
    const warningCount = results.filter((r) => r.status === "WARNING").length;

    let overallStatus: ComplianceStatus = "COMPLIANT";
    if (nonCompliantCount > 0) overallStatus = "NON_COMPLIANT";
    else if (warningCount > 0) overallStatus = "WARNING";

    const applicable = results.filter((r) => r.status !== "NOT_APPLICABLE");
    const compliant = applicable.filter((r) => r.status === "COMPLIANT").length;
    const complianceScore = applicable.length > 0 ? Math.round((compliant / applicable.length) * 100) : 100;

    return {
      deviceId: input.recorderId,
      deviceType: "RECORDER",
      branchId: input.branchId,
      overallStatus,
      complianceScore,
      rules: results,
      evaluatedAt: now,
    };
  }

  evaluateBranch(
    branchData: {
      branchId: string;
      branchName?: string;
      recorders: RecorderComplianceInput[];
      cameras: CameraComplianceInput[];
    },
    policy: EffectiveSurveillancePolicy,
    now: string = new Date().toISOString(),
  ): BranchComplianceReport {
    const devices: DeviceComplianceSummary[] = [];

    for (const rec of branchData.recorders) {
      devices.push(this.evaluateRecorder(rec, policy, now));
    }

    for (const cam of branchData.cameras) {
      devices.push(this.evaluateCamera(cam, policy, now));
    }

    const allRules = devices.flatMap((d) => d.rules);
    const compliantCount = allRules.filter((r) => r.status === "COMPLIANT").length;
    const warningCount = allRules.filter((r) => r.status === "WARNING").length;
    const nonCompliantCount = allRules.filter((r) => r.status === "NON_COMPLIANT").length;
    const unknownCount = allRules.filter((r) => r.status === "UNKNOWN").length;
    const maintenanceExcludedCount = allRules.filter((r) => r.status === "MAINTENANCE_EXCLUDED").length;

    const criticalViolations: BranchComplianceReport["criticalViolations"] = [];
    for (const dev of devices) {
      for (const rule of dev.rules) {
        if (rule.status === "NON_COMPLIANT") {
          criticalViolations.push({
            deviceId: dev.deviceId,
            rule: rule.rule,
            expected: rule.expected ?? "",
            actual: rule.actual ?? "",
            reason: rule.reason ?? "Non-compliant with policy threshold",
          });
        }
      }
    }

    // Calculate per-rule summaries
    const distinctRules: ComplianceRule[] = [
      "CAMERA_AVAILABILITY",
      "RECORDING_REQUIRED",
      "RETENTION",
      "RECORDING_GAP",
      "RECORDER_HEARTBEAT",
      "CAMERA_HEARTBEAT",
      "INTERNET_HEARTBEAT",
      "TIME_DRIFT",
      "DISK_FREE",
    ];

    const ruleSummaries = {} as BranchComplianceReport["ruleSummaries"];
    for (const ruleName of distinctRules) {
      const match = allRules.filter((r) => r.rule === ruleName && r.status !== "NOT_APPLICABLE");
      const comp = match.filter((r) => r.status === "COMPLIANT").length;
      ruleSummaries[ruleName] = {
        compliantCount: comp,
        totalCount: match.length,
        compliancePercent: match.length > 0 ? Math.round((comp / match.length) * 100) : 100,
      };
    }

    let status: ComplianceStatus = "COMPLIANT";
    if (nonCompliantCount > 0) status = "NON_COMPLIANT";
    else if (warningCount > 0) status = "WARNING";
    else if (unknownCount > 0) status = "UNKNOWN";

    const applicableTotal = allRules.filter((r) => r.status !== "NOT_APPLICABLE" && r.status !== "MAINTENANCE_EXCLUDED").length;
    const overallScore = applicableTotal > 0 ? Math.round((compliantCount / applicableTotal) * 100) : 100;

    return {
      branchId: branchData.branchId,
      branchName: branchData.branchName ?? `Branch ${branchData.branchId}`,
      overallComplianceScore: overallScore,
      status,
      summary: {
        totalEvaluations: allRules.length,
        compliantCount,
        warningCount,
        nonCompliantCount,
        unknownCount,
        maintenanceExcludedCount,
      },
      ruleSummaries,
      criticalViolations,
      devices,
      generatedAt: now,
    };
  }
}

export const surveillanceComplianceEvaluator = new SurveillanceComplianceEvaluatorService();
