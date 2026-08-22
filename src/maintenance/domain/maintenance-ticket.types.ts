/**
 * Enterprise Surveillance Maintenance & Field Service Subsystem Domain Types
 * (Full Fault Lifecycle, Automated Diagnostics, Root Cause Taxonomy, SLA Engine, Verification & Spare Tracking)
 */

export type MaintenanceAssetType =
  | "CAMERA"
  | "NVR"
  | "DVR"
  | "EDGE_GATEWAY"
  | "DISK"
  | "NETWORK"
  | "UPS"
  | "SWITCH"
  | "OTHER";

export type MaintenanceTicketStatus =
  | "DIAGNOSING"
  | "OPEN"
  | "ASSIGNED"
  | "REMOTE_WORK"
  | "VISIT_REQUIRED"
  | "ENGINEER_EN_ROUTE"
  | "ON_SITE"
  | "AWAITING_PART"
  | "AWAITING_VENDOR"
  | "FIXED"
  | "VERIFYING"
  | "CLOSED"
  | "CANCELLED";

export type TicketPriority = "P1" | "P2" | "P3" | "P4";

export type RootCauseTaxonomy =
  | "POWER_FAILURE"
  | "NETWORK_FAILURE"
  | "ISP_OUTAGE"
  | "SWITCH_FAILURE"
  | "POE_FAILURE"
  | "CAMERA_HARDWARE"
  | "CAMERA_FIRMWARE"
  | "CAMERA_CONFIGURATION"
  | "CAMERA_CREDENTIALS"
  | "RECORDER_HARDWARE"
  | "RECORDER_STORAGE"
  | "RECORDER_CONFIGURATION"
  | "DISK_FAILURE"
  | "CABLING"
  | "CONNECTOR"
  | "ENVIRONMENTAL_DAMAGE"
  | "EDGE_AGENT_FAILURE"
  | "CONFIGURATION_DRIFT"
  | "CERTIFICATE_FAILURE"
  | "UNKNOWN";

export type MaintenanceEventType =
  | "CREATED"
  | "DIAGNOSTIC_STARTED"
  | "DIAGNOSTIC_COMPLETED"
  | "ASSIGNED"
  | "ENGINEER_ACCEPTED"
  | "REMOTE_SESSION_STARTED"
  | "VISIT_SCHEDULED"
  | "ENGINEER_ARRIVED"
  | "PART_REPLACED"
  | "FIX_REPORTED"
  | "VERIFICATION_STARTED"
  | "VERIFICATION_FAILED"
  | "VERIFICATION_PASSED"
  | "CLOSED"
  | "REOPENED"
  | "SLA_BREACHED";

export interface MaintenanceEvent {
  id: string;
  ticketId: string;
  type: MaintenanceEventType;
  actorType: "SYSTEM" | "USER" | "EDGE_AGENT";
  actorId?: string;
  timestamp: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface MaintenancePart {
  type: string;
  oldSerial?: string;
  oldModel?: string;
  newSerial?: string;
  newModel?: string;
  vendor?: string;
  reason?: string;
}

export interface MaintenanceVisit {
  id: string;
  ticketId: string;
  engineerId: string;
  engineerName: string;
  visitType: "REMOTE" | "ONSITE";
  scheduledAt?: string;
  startedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  notes?: string;
  workPerformed?: string;
  partsUsed?: MaintenancePart[];
}

export interface DiagnosticResult {
  jobId: string;
  assetId: string;
  branchId: string;
  executedAt: string;
  gatewayReachable: boolean;
  internetReachable: boolean;
  recorderReachable: boolean;
  cameraIcmpReachable: boolean;
  cameraTcp554Reachable: boolean;
  onvifReachable: boolean;
  rtspHandshakeOk: boolean;
  recentFramesPresent: boolean;
  poePortStatus: "UP" | "DOWN" | "CYCLING" | "UNKNOWN";
  suspectedCause: string;
  recovered: boolean;
}

export interface MaintenanceTicket {
  id: string;
  ticketNumber: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  regionId?: string;

  assetType: MaintenanceAssetType;
  assetId: string;
  assetName: string;

  sourceAlertId?: string;
  sourceIncidentId?: string;

  faultCode: string;
  faultDescription: string;
  detectedAt: string;

  priority: TicketPriority;
  status: MaintenanceTicketStatus;

  impact: {
    affectedCameras: number;
    recordingUnavailable: boolean;
    liveViewUnavailable: boolean;
    retentionAffected: boolean;
    securityCoverageLost: boolean;
  };

  assignedEngineer?: {
    engineerId: string;
    name: string;
    contactNumber: string;
    vendorName?: string;
    skills?: string[];
  };

  slaPolicy: {
    priority: TicketPriority;
    responseDueAt: string;
    resolutionDueAt: string;
    isBreached: boolean;
  };

  diagnostics?: DiagnosticResult;
  history: MaintenanceEvent[];
  visits: MaintenanceVisit[];

  rootCause?: RootCauseTaxonomy;
  rootCauseNotes?: string;
  resolutionCode?: string;
  workPerformed?: string;

  replacement?: MaintenancePart;

  evidence: {
    beforePhotos: string[];
    afterPhotos: string[];
  };

  closureVerification: {
    pingPass: boolean;
    rtspPass: boolean;
    onvifPass: boolean;
    framePass: boolean;
    recordingPass: boolean;
    verifiedBy: string;
    verifiedAt?: string;
  };

  repeatFaultOf?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  verifiedAt?: string;
  closedAt?: string;
}

export interface DeviceHardwareInventory {
  serialNumber: string;
  model: string;
  firmwareVersion: string;
  installationDate: string;
  warrantyExpiry: string;
  branchId: string;
  positionName: string;
  hardwareStatus: "ACTIVE" | "IN_REPAIR" | "SPARE_DEPOT" | "RETIRED";
  replacementHistory: Array<{
    replacedAt: string;
    oldSerial: string;
    newSerial: string;
    reason: string;
    workOrderTicketId: string;
  }>;
}

export interface MaintenanceMetrics {
  totalTickets: number;
  openTickets: number;
  assignedTickets: number;
  inVerificationTickets: number;
  closedTickets: number;
  priorityBreakdown: Record<TicketPriority, number>;
  slaBreachCount: number;
  meanTimeToRepairHours: number;
  firstTimeFixRatePct: number;
  repeatFailureRatePct: number;
  topFailingBranches: Array<{ branchId: string; branchName: string; ticketCount: number }>;
  rootCauseDistribution: Record<string, number>;
}
