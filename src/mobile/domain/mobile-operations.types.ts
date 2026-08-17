/**
 * Mobile / PWA Operations Domain Types
 * (Modeled after Milestone Mobile & Banking SOC Fast Response UX)
 */

export interface MobileIncidentSummary {
  id: string;
  severity: "P1" | "P2" | "P3";
  type: string;
  title: string;
  branch: {
    id: string;
    name: string;
    code: string;
    phone: string;
    managerName?: string;
  };
  camera: {
    id: string;
    name: string;
    status: "ONLINE" | "DEGRADED" | "OFFLINE";
    recordingStatus: "HEALTHY" | "FAILED";
  };
  occurredAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  slaRemainingSeconds: number;
  snapshotUrl: string;
  clipUrl?: string;
  clipDurationSeconds?: number;
  availableActions: ("ACKNOWLEDGE" | "LIVE_VIEW" | "VIEW_CLIP" | "CALL_BRANCH" | "ESCALATE")[];
  timeline: Array<{
    timestamp: string;
    type: string;
    actor: string;
    message: string;
  }>;
}

export interface MobileHomePayload {
  criticalIncidentCount: number;
  unacknowledgedCount: number;
  operator: {
    id: string;
    name: string;
    role: string;
    shift: string;
    onCall: boolean;
  };
  branchHealthSummary: {
    healthy: number;
    warning: number;
    critical: number;
    total: number;
  };
  incidents: MobileIncidentSummary[];
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
