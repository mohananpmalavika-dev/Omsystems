/**
 * Maintenance Window Domain Contracts
 * 
 * Defines first-class operational maintenance states, scopes, approval lifecycles,
 * recovery grace periods, and suppression policies.
 */

export type MaintenanceScopeType = "BRANCH" | "DEVICE" | "DEVICE_GROUP";

export type MaintenanceWindowStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type OperationalStatus =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "OFFLINE"
  | "UNKNOWN"
  | "STALE"
  | "MAINTENANCE"
  | "MAINTENANCE_RECOVERY";

export interface MaintenanceWindow {
  id: string;
  tenantId: string;
  scopeType: MaintenanceScopeType;
  branchId: string;
  deviceIds?: string[] | undefined;
  deviceGroupId?: string | undefined;

  startsAt: Date;
  endsAt: Date;
  recoveryGraceSeconds: number; // default: 300s (5m)

  reason: string;
  requestedByUserId: string;
  approvedByUserId?: string | undefined;
  approvedAt?: Date | undefined;

  status: MaintenanceWindowStatus;

  suppressNotifications: boolean;
  suppressIncidentCreation: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceMatch {
  maintenanceWindowId: string;
  scopeType: MaintenanceScopeType;
  reason: string;
  startsAt: Date;
  endsAt: Date;
  recoveryDeadline: Date;
  isDirectTarget: boolean;
  suppressNotifications: boolean;
  suppressIncidentCreation: boolean;
}

export interface DeviceOperationalState {
  deviceId: string;
  observedStatus: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE" | "UNKNOWN";
  effectiveStatus: OperationalStatus;
  observedAt: Date;
  maintenance?: MaintenanceMatch | undefined;
  stalenessReason?: string | undefined;
}
