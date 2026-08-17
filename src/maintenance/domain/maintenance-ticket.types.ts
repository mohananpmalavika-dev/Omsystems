/**
 * Maintenance Ticketing & Spare Lifecycle Domain Types
 */

export type TicketPriority = "P1_URGENT" | "P2_HIGH" | "P3_STANDARD";

export type TicketStatus =
  | "OPEN"
  | "ASSIGNED"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "RESOLVED"
  | "CLOSED";

export interface MaintenanceTicket {
  id: string;
  ticketNumber: string;
  branchId: string;
  deviceId: string;
  deviceName: string;
  deviceType: "CAMERA" | "RECORDER" | "GATEWAY" | "SWITCH" | "ROUTER" | "UPS";
  faultType:
    | "DEVICE_OFFLINE"
    | "STORAGE_DISK_FAILURE"
    | "VIDEO_TAMPER"
    | "CLOCK_DRIFT_CRITICAL"
    | "POWER_FLUCTUATION";
  rootCause?: string;
  impactLevel: "CRITICAL_SECURITY" | "PARTIAL_COVERAGE" | "NON_CRITICAL";
  priority: TicketPriority;
  assignedEngineer?: {
    engineerId: string;
    name: string;
    contactNumber: string;
    vendorName?: string;
  };
  slaDueAt: string;
  workPerformedNotes?: string;
  evidenceBeforePhotoUrl?: string;
  evidenceAfterPhotoUrl?: string;
  replacementDevice?: {
    oldSerialNumber: string;
    newSerialNumber: string;
    modelName: string;
    replacedAt: string;
  };
  closureVerification: {
    streamOnlineVerified: boolean;
    recordingVerified: boolean;
    verifiedByOperatorId?: string;
    verifiedAt?: string;
  };
  status: TicketStatus;
  createdAt: string;
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
