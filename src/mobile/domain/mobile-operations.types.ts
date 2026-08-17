/**
 * Mobile / PWA Operations Domain Types
 * (Modeled after Milestone Mobile & Banking SOC Fast Response UX)
 */

export interface MobileIncidentSummary {
  id: string;
  severity: "P1" | "P2" | "P3" | "P4" | "P5";
  type: string;
  title: string;
  branch: {
    id: string;
    name: string;
    code: string;
    phone: string;
    managerName?: string;
  };
  camera?: {
    id: string;
    name: string;
    status: "ONLINE" | "DEGRADED" | "OFFLINE";
    recordingStatus: "HEALTHY" | "FAILED";
  };
  occurredAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  assignedTo?: string;
  assignedAt?: string;
  slaRemainingSeconds: number;
  slaBreached?: boolean;
  snapshotUrl?: string;
  clipUrl?: string;
  clipDurationSeconds?: number;
  availableActions: string[];
  timeline: Array<{
    timestamp: string;
    type: string;
    actor: string;
    message: string;
  }>;
  aiConfidence?: number;
  aiDiagnosis?: string;
}

export interface MobileOperatorInfo {
  id: string;
  name: string;
  role: string;
  shift: string;
  onCall: boolean;
}

export interface MobilePredictedRisk {
  id: string;
  branchId: string;
  branchName: string;
  riskType: string;
  probability: number;
  timeframe: string;
  reason: string[];
  recommendedAction: string;
}

export interface MobileLiveEvent {
  id: string;
  timestamp: string;
  type: string;
  severity: "P1" | "P2" | "P3" | "P4" | "P5";
  branchId?: string;
  branchName?: string;
  cameraId?: string;
  cameraName?: string;
  message: string;
}

export interface MobileHomePayload {
  criticalIncidentCount: number;
  unacknowledgedCount: number;
  myIncidentsCount: number;
  operator: MobileOperatorInfo;
  branchHealthSummary: {
    healthy: number;
    warning: number;
    critical: number;
    total: number;
  };
  incidents: MobileIncidentSummary[];
  predictedRisks: MobilePredictedRisk[];
  liveEvents: MobileLiveEvent[];
  lastUpdated: string;
}

export interface MobileBranchHealth {
  branchId: string;
  branchName: string;
  branchCode: string;
  managerContact: {
    name: string;
    phone: string;
    role: string;
  };
  overallStatus: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE";
  internet: {
    primary: "HEALTHY" | "OFFLINE";
    backup5G: "HEALTHY" | "STANDBY" | "OFFLINE";
  };
  gateway: "HEALTHY" | "DEGRADED" | "OFFLINE";
  nvr: "HEALTHY" | "WARNING" | "OFFLINE";
  cameras: {
    online: number;
    total: number;
  };
  recording: {
    healthy: number;
    total: number;
  };
  storageUsedPct: number;
  clockOffsetMs: number;
  activeIncidents: {
    p1Count: number;
    p2Count: number;
  };
}

export type StructuredNoteType =
  | "FALSE_ALARM"
  | "BRANCH_CONTACTED"
  | "POLICE_CONTACTED"
  | "SECURITY_DISPATCHED"
  | "MAINTENANCE_ACTIVITY"
  | "PERSON_CONFIRMED"
  | "CAMERA_FAILURE"
  | "CUSTOM_NOTE";

export interface MobileCommandResult {
  success: boolean;
  commandId: string;
  incidentId: string;
  action: string;
  operatorId: string;
  timestamp: string;
  newStatus?: string;
  message: string;
}
