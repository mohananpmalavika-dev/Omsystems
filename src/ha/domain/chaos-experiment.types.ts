/**
 * Chaos Engineering Experiment Types
 * 
 * Production-safe chaos testing with approval workflow, pre-checks,
 * RTO/RPO measurement, and comprehensive audit trails.
 */

export type ChaosExperimentType =
  | "KILL_API_NODE"
  | "KILL_REDIS_MASTER"
  | "KILL_POSTGRES_PRIMARY"
  | "KILL_MEDIA_GATEWAY"
  | "DISCONNECT_BRANCH"
  | "RESTART_EDGE_GATEWAY"
  | "REMOVE_STORAGE_DISK"
  | "FAIL_PRIMARY_ISP";

export type ChaosExperimentStatus =
  | "pending-approval"
  | "approved"
  | "rejected"
  | "pre-check-running"
  | "pre-check-failed"
  | "ready"
  | "running"
  | "measuring"
  | "completed"
  | "failed"
  | "cancelled";

export interface ChaosExperimentRequest {
  experimentType: ChaosExperimentType;
  targetComponent: string;
  reason: string;
  requestedBy: string;
  maintenanceWindow?: {
    startTime: string;
    endTime: string;
  };
  expectedImpact?: {
    affectedCameras?: number;
    affectedBranches?: number;
    estimatedDowntimeSeconds?: number;
  };
  rollbackPlan?: string;
}

export interface ChaosPreCheckResult {
  passed: boolean;
  checkName: string;
  status: "pass" | "fail" | "warning";
  message: string;
  details?: Record<string, unknown>;
}

export interface ChaosPreChecks {
  allPassed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warnings: number;
  checks: ChaosPreCheckResult[];
  executedAt: string;
  durationMs: number;
}

export interface ChaosExperimentApproval {
  approvedBy: string;
  approvedAt: string;
  approvalNotes?: string;
  conditions?: string[];
}

export interface ChaosExperimentRejection {
  rejectedBy: string;
  rejectedAt: string;
  rejectionReason: string;
}

export interface ChaosExperimentMetrics {
  // Detection metrics
  detectionTimeMs: number;
  detectionMethod: "heartbeat" | "health-check" | "manual";
  
  // Failover metrics
  failoverInitiatedAt: string;
  failoverCompletedAt?: string;
  failoverDurationMs?: number;
  
  // RTO (Recovery Time Objective)
  rtoTargetMs: number;
  rtoActualMs?: number;
  rtoMet?: boolean;
  
  // RPO (Recovery Point Objective)
  rpoTargetBytes: number;
  rpoActualBytes?: number;
  dataLossBytes?: number;
  rpoMet?: boolean;
  
  // Impact metrics
  affectedComponents: string[];
  affectedCameras: number;
  affectedBranches: number;
  
  // Recording continuity
  recordingGapMs?: number;
  recordingGapTarget: number;
  recordingContinuityMet?: boolean;
  
  // System recovery
  servicesRestarted: number;
  leasesTransferred: number;
  reconnectAttempts: number;
  reconnectSuccessRate?: number;
}

export interface ChaosExperimentStep {
  stepNumber: number;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: string;
  error?: string;
  metrics?: Record<string, unknown>;
}

export interface ChaosExperiment {
  id: string;
  tenantId: string;
  experimentType: ChaosExperimentType;
  status: ChaosExperimentStatus;
  
  // Request info
  request: ChaosExperimentRequest;
  
  // Approval workflow
  approval?: ChaosExperimentApproval;
  rejection?: ChaosExperimentRejection;
  
  // Pre-checks
  preChecks?: ChaosPreChecks;
  
  // Execution
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  
  // Steps
  steps: ChaosExperimentStep[];
  currentStep?: number;
  
  // Metrics
  metrics?: ChaosExperimentMetrics;
  
  // Evidence and audit
  evidenceUrls: string[];
  auditTrail: Array<{
    timestamp: string;
    action: string;
    actor: string;
    details: Record<string, unknown>;
  }>;
  
  // Results
  result?: "pass" | "fail" | "partial";
  summary?: string;
  recommendations?: string[];
  
  // System state snapshots
  preExperimentSnapshot?: Record<string, unknown>;
  postExperimentSnapshot?: Record<string, unknown>;
  
  createdAt: string;
  updatedAt: string;
}

export interface ChaosExperimentReport {
  experimentId: string;
  experimentType: ChaosExperimentType;
  executedAt: string;
  executedBy: string;
  
  // Summary
  result: "pass" | "fail" | "partial";
  rtoMet: boolean;
  rpoMet: boolean;
  recordingContinuityMet: boolean;
  
  // Metrics
  detectionTimeMs: number;
  failoverDurationMs: number;
  recordingGapMs: number;
  dataLossBytes: number;
  affectedCameras: number;
  successRate: number;
  
  // Details
  targetComponent: string;
  failoverMethod: string;
  recoverySteps: string[];
  
  // Issues found
  issues: Array<{
    severity: "critical" | "high" | "medium" | "low";
    description: string;
    recommendation: string;
  }>;
  
  // Recommendations
  recommendations: string[];
  
  // Compliance
  meetsSLA: boolean;
  meetsRegulatoryRequirements: boolean;
  evidenceCollected: boolean;
  
  generatedAt: string;
}

export interface ChaosExperimentHistory {
  total: number;
  experiments: Array<{
    id: string;
    type: ChaosExperimentType;
    executedAt: string;
    result: "pass" | "fail" | "partial";
    rtoMs: number;
    rpoBytes: number;
    affectedCameras: number;
  }>;
  statistics: {
    totalPassed: number;
    totalFailed: number;
    totalPartial: number;
    averageRtoMs: number;
    averageRecordingGapMs: number;
    totalAffectedCameras: number;
    last24h: number;
    last7d: number;
    last30d: number;
  };
}
