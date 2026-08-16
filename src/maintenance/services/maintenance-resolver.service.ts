/**
 * Maintenance Resolver Service
 * 
 * Determines whether a device health observation or alert falls within an active,
 * approved maintenance window. Enforces recovery grace periods and protects life-safety events.
 */

import {
  MaintenanceWindow,
  MaintenanceMatch,
  DeviceOperationalState,
  OperationalStatus,
} from "../domain/maintenance-window.types.js";
import {
  maintenanceWindowRepository,
  MaintenanceWindowRepository,
} from "../repositories/maintenance-window.repository.js";

const NEVER_SUPPRESS_SECURITY_TYPES = new Set([
  "FIRE",
  "SMOKE",
  "WEAPON_DETECTED",
  "VIOLENCE",
  "VAULT_ACCESS",
  "INTRUSION",
  "PANIC",
]);

export class MaintenanceResolverService {
  constructor(private readonly repo: MaintenanceWindowRepository = maintenanceWindowRepository) {}

  /**
   * Check if an observation matches an active approved maintenance window
   */
  async resolveMaintenance(input: {
    tenantId: string;
    branchId: string;
    deviceId?: string | undefined;
    observedAt: Date;
  }): Promise<{ match: MaintenanceMatch | null; isRecoveryPeriod: boolean }> {
    const windows = await this.repo.findActiveByBranch(input.branchId, input.observedAt);
    if (windows.length === 0) {
      return { match: null, isRecoveryPeriod: false };
    }

    for (const win of windows) {
      let isTarget = false;
      if (win.scopeType === "BRANCH") {
        isTarget = true;
      } else if (win.scopeType === "DEVICE" && input.deviceId) {
        isTarget = win.deviceIds?.includes(input.deviceId) ?? false;
      }

      if (isTarget) {
        const recoveryDeadline = new Date(win.endsAt.getTime() + win.recoveryGraceSeconds * 1000);
        const isRecoveryPeriod = input.observedAt >= win.endsAt && input.observedAt < recoveryDeadline;

        return {
          match: {
            maintenanceWindowId: win.id,
            scopeType: win.scopeType,
            reason: win.reason,
            startsAt: win.startsAt,
            endsAt: win.endsAt,
            recoveryDeadline,
            isDirectTarget: true,
            suppressNotifications: win.suppressNotifications,
            suppressIncidentCreation: win.suppressIncidentCreation,
          },
          isRecoveryPeriod,
        };
      }
    }

    return { match: null, isRecoveryPeriod: false };
  }

  /**
   * Resolves effective operational status from raw observed status
   */
  async resolveDeviceOperationalState(params: {
    tenantId: string;
    branchId: string;
    deviceId: string;
    observedStatus: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE" | "UNKNOWN";
    observedAt: Date;
  }): Promise<DeviceOperationalState> {
    const { match, isRecoveryPeriod } = await this.resolveMaintenance({
      tenantId: params.tenantId,
      branchId: params.branchId,
      deviceId: params.deviceId,
      observedAt: params.observedAt,
    });

    let effectiveStatus: OperationalStatus = params.observedStatus;

    if (match) {
      if (isRecoveryPeriod) {
        effectiveStatus = params.observedStatus === "HEALTHY" ? "HEALTHY" : "MAINTENANCE_RECOVERY";
      } else {
        effectiveStatus = "MAINTENANCE";
      }
    }

    return {
      deviceId: params.deviceId,
      observedStatus: params.observedStatus,
      effectiveStatus,
      observedAt: params.observedAt,
      maintenance: match || undefined,
    };
  }

  /**
   * Check if alert should be suppressed by maintenance
   */
  async shouldSuppressAlert(params: {
    tenantId: string;
    branchId: string;
    deviceId?: string | undefined;
    alertType: string;
    observedAt: Date;
  }): Promise<{ suppressed: boolean; reason?: string | undefined; maintenanceWindowId?: string | undefined }> {
    // 1. Life safety and physical security threats are NEVER suppressed by maintenance
    if (NEVER_SUPPRESS_SECURITY_TYPES.has(params.alertType)) {
      return { suppressed: false };
    }

    // 2. Check active maintenance
    const { match } = await this.resolveMaintenance({
      tenantId: params.tenantId,
      branchId: params.branchId,
      deviceId: params.deviceId,
      observedAt: params.observedAt,
    });

    if (match && match.suppressNotifications) {
      return {
        suppressed: true,
        reason: "PLANNED_MAINTENANCE",
        maintenanceWindowId: match.maintenanceWindowId,
      };
    }

    return { suppressed: false };
  }
}

export const maintenanceResolverService = new MaintenanceResolverService();
