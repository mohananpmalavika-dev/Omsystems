/**
 * Policy-Driven Surveillance SLA & Compliance Domain Contracts
 *
 * Separates raw telemetry observation from requirements and compliance evaluation.
 * Supports multi-tier hierarchical inheritance (Tenant -> Region -> Branch -> Device Type -> Device).
 */

export interface SurveillancePolicy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  version: string;

  // Availability SLA
  cameraAvailabilityTarget: number; // e.g. 99.5%

  // Recording Continuity & Retention
  recordingRequired: boolean;
  retentionDays: number; // e.g. 90 or 180 days
  maxRecordingGapSeconds: number; // e.g. 60 seconds

  // Heartbeat & Freshness Thresholds
  recorderHeartbeatSeconds: number; // e.g. 30 seconds
  cameraHeartbeatSeconds: number; // e.g. 30 seconds
  internetHeartbeatSeconds: number; // e.g. 30 seconds

  // Clock & Time Drift
  timeDriftToleranceSeconds: number; // e.g. 5 seconds
  timeDriftCriticalSeconds?: number; // e.g. 30 seconds

  // Storage Capacity Thresholds
  diskFreeWarningPercent: number; // e.g. 15%
  diskFreeCriticalPercent: number; // e.g. 5%

  // Grace Periods
  offlineGraceSeconds?: number; // e.g. 15 seconds

  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SurveillancePolicyOverride = Partial<
  Omit<SurveillancePolicy, "id" | "tenantId" | "name" | "description" | "version" | "enabled" | "createdAt" | "updatedAt">
>;

export type PolicyScopeType = "TENANT" | "REGION" | "BRANCH" | "DEVICE_TYPE" | "DEVICE";

export interface SurveillancePolicyAssignment {
  id: string;
  tenantId: string;
  scopeType: PolicyScopeType;
  scopeId: string;
  policyId?: string;
  overrides?: SurveillancePolicyOverride;
  priority: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyFieldProvenance<T = any> {
  value: T;
  sourceScope: PolicyScopeType;
  sourceScopeId: string;
  policyId?: string;
}

export interface EffectiveSurveillancePolicy {
  tenantId: string;
  branchId: string;
  deviceId?: string;
  deviceType?: string;

  cameraAvailabilityTarget: number;
  recordingRequired: boolean;
  retentionDays: number;
  maxRecordingGapSeconds: number;
  recorderHeartbeatSeconds: number;
  cameraHeartbeatSeconds: number;
  internetHeartbeatSeconds: number;
  timeDriftToleranceSeconds: number;
  timeDriftCriticalSeconds: number;
  diskFreeWarningPercent: number;
  diskFreeCriticalPercent: number;
  offlineGraceSeconds: number;

  provenance: Record<string, PolicyFieldProvenance>;
  policyVersion: string;
  resolvedAt: string;
}

export type ComplianceRule =
  | "CAMERA_AVAILABILITY"
  | "RECORDING_REQUIRED"
  | "RETENTION"
  | "RECORDING_GAP"
  | "RECORDER_HEARTBEAT"
  | "CAMERA_HEARTBEAT"
  | "INTERNET_HEARTBEAT"
  | "TIME_DRIFT"
  | "DISK_FREE";

export type ComplianceStatus =
  | "COMPLIANT"
  | "WARNING"
  | "NON_COMPLIANT"
  | "UNKNOWN"
  | "NOT_APPLICABLE"
  | "MAINTENANCE_EXCLUDED";

export interface ComplianceResult {
  rule: ComplianceRule;
  status: ComplianceStatus;
  expected?: number | boolean | string;
  actual?: number | boolean | string;
  unit?: string;
  difference?: number | string;
  reason?: string;
  policyId?: string;
  policyVersion: string;
  evaluatedAt: string;
}

export interface DeviceComplianceSummary {
  deviceId: string;
  deviceType: string;
  branchId: string;
  overallStatus: ComplianceStatus;
  complianceScore: number;
  rules: ComplianceResult[];
  evaluatedAt: string;
}

export interface BranchComplianceReport {
  branchId: string;
  branchName?: string;
  overallComplianceScore: number;
  status: ComplianceStatus;
  summary: {
    totalEvaluations: number;
    compliantCount: number;
    warningCount: number;
    nonCompliantCount: number;
    unknownCount: number;
    maintenanceExcludedCount: number;
  };
  ruleSummaries: Record<
    ComplianceRule,
    {
      compliantCount: number;
      totalCount: number;
      compliancePercent: number;
    }
  >;
  criticalViolations: Array<{
    deviceId: string;
    rule: ComplianceRule;
    expected: string | number | boolean;
    actual: string | number | boolean;
    reason: string;
  }>;
  devices: DeviceComplianceSummary[];
  generatedAt: string;
}

export const BANK_STANDARD_TEMPLATE: Omit<SurveillancePolicy, "id" | "tenantId" | "createdAt" | "updatedAt"> = {
  name: "Bank Standard Surveillance Policy",
  description: "Standard regulatory surveillance policy for standard banking branches",
  version: "1.0.0",
  cameraAvailabilityTarget: 99.5,
  recordingRequired: true,
  retentionDays: 90,
  maxRecordingGapSeconds: 60,
  recorderHeartbeatSeconds: 30,
  cameraHeartbeatSeconds: 30,
  internetHeartbeatSeconds: 30,
  timeDriftToleranceSeconds: 5,
  timeDriftCriticalSeconds: 30,
  diskFreeWarningPercent: 15,
  diskFreeCriticalPercent: 5,
  offlineGraceSeconds: 15,
  enabled: true,
};

export const VAULT_CRITICAL_TEMPLATE: SurveillancePolicyOverride = {
  cameraAvailabilityTarget: 99.99,
  recordingRequired: true,
  retentionDays: 180,
  maxRecordingGapSeconds: 10,
  timeDriftToleranceSeconds: 2,
  timeDriftCriticalSeconds: 10,
  diskFreeWarningPercent: 20,
  diskFreeCriticalPercent: 10,
};

export const ATM_SURVEILLANCE_TEMPLATE: SurveillancePolicyOverride = {
  cameraAvailabilityTarget: 99.9,
  recordingRequired: true,
  retentionDays: 120,
  maxRecordingGapSeconds: 30,
  timeDriftToleranceSeconds: 3,
};
