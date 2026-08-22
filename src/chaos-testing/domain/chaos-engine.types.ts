/**
 * Chaos Testing & Resiliency Engine Domain Contracts
 * 
 * Defines 13 failure modes and standard 6-point recovery assertions
 * for enterprise-grade Video Management System (VMS) robustness.
 */

export type ChaosScenarioType =
  | "KILL_RECORDING_SERVICE"
  | "KILL_REDIS"
  | "KILL_POSTGRES"
  | "DISCONNECT_CAMERA"
  | "CHANGE_CAMERA_PASSWORD"
  | "REBOOT_NVR"
  | "FILL_DISK"
  | "REMOVE_STORAGE"
  | "ADD_PACKET_LOSS"
  | "ADD_LATENCY"
  | "DISCONNECT_BRANCH_WAN"
  | "CORRUPT_SEGMENT"
  | "KILL_MEDIA_SERVER";

export interface ChaosExperimentConfig {
  scenario: ChaosScenarioType;
  targetId: string; // e.g. "CAM-118-01", "NVR-01", "gw-edge-118", "redis-primary", "postgres-control-plane"
  branchId: string;
  durationSeconds?: number;
  parameters?: Record<string, unknown>; // e.g. packetLossPercent: 30, latencyMs: 1500, diskUsagePercent: 100
  failoverNodeId?: string;
}

export interface ChaosTimelineEvent {
  timestamp: string;
  phase:
    | "INJECT_FAULT"
    | "DETECTION"
    | "ALERT_DISPATCH"
    | "FAILOVER"
    | "OPERATOR_NOTIFIED"
    | "RECOVERY"
    | "VERIFICATION";
  message: string;
  data?: Record<string, unknown>;
}

export interface ChaosAssertionResult {
  didRecordingRecover: boolean;
  secondsLost: number;
  wasAlertGenerated: boolean;
  alertId?: string;
  alertSeverity?: "P1" | "P2" | "P3" | "P4" | "critical" | "high" | "medium";
  didOwnershipTransfer: boolean;
  newOwnerNodeId?: string;
  didOperatorSeeFailure: boolean;
  operatorNotificationLatencyMs?: number;
  wasIncidentRecorded: boolean;
  incidentId?: string;
  workOrderTicketId?: string;
}

export interface ChaosExperimentReport {
  experimentId: string;
  scenario: ChaosScenarioType;
  targetId: string;
  branchId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "PASSED" | "FAILED" | "DEGRADED";
  assertions: ChaosAssertionResult;
  timeline: ChaosTimelineEvent[];
  forensicSummary: string;
  resilienceScore: number; // 0 to 100
}

export interface ChaosMatrixSummary {
  matrixRunId: string;
  executedAt: string;
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  overallResilienceScore: number;
  totalDowntimeSeconds: number;
  maxDowntimeSeconds: number;
  p1AlertsTriggeredCount: number;
  incidentsCreatedCount: number;
  reports: ChaosExperimentReport[];
}
