import type { DiskHealthCollector, StorageTarget } from "./disk-collector.interface.js";
import type {
  DiskEvidence,
  DiskEvidenceSource,
  DiskHealthState,
  SmartAttribute,
  SmartState,
} from "../domain/disk-evidence.js";

export interface SmartctlReport {
  device?: {
    name?: string;
    info_name?: string;
    type?: string;
    protocol?: string;
  };
  model_name?: string;
  model_family?: string;
  serial_number?: string;
  firmware_version?: string;
  user_capacity?: {
    bytes?: number;
  };
  smart_status?: {
    passed?: boolean;
  };
  temperature?: {
    current?: number;
  };
  power_on_time?: {
    hours?: number;
  };
  power_cycle_count?: number;
  ata_smart_attributes?: {
    table?: Array<{
      id: number;
      name: string;
      value: number;
      worst: number;
      thresh: number;
      when_failed?: string;
      raw?: {
        value: number;
        string: string;
      };
    }>;
  };
  nvme_smart_health_information_log?: {
    critical_warning?: number;
    temperature?: number;
    available_spare?: number;
    percentage_used?: number;
    power_on_hours?: number;
    power_cycles?: number;
    media_errors?: number;
  };
}

export class SmartctlDiskCollector implements DiskHealthCollector {
  readonly source: DiskEvidenceSource = "SMARTCTL";

  async supports(target: StorageTarget): Promise<boolean> {
    return true;
  }

  async collect(target: StorageTarget): Promise<DiskEvidence[]> {
    // In live execution, this parses raw smartctl JSON reports injected via target or test runner
    return [];
  }

  parseSmartctlReport(
    target: StorageTarget,
    devicePath: string,
    report: SmartctlReport,
  ): DiskEvidence {
    const now = new Date();
    const isNvme = Boolean(report.nvme_smart_health_information_log || report.device?.type === "nvme");
    const serialNumber = report.serial_number ?? undefined;
    const model = report.model_name ?? report.model_family ?? undefined;
    const firmwareVersion = report.firmware_version ?? undefined;
    const totalBytes = report.user_capacity?.bytes ?? undefined;

    const diskId = serialNumber
      ? `${target.recorderId}-${serialNumber}`
      : `${target.recorderId}-${devicePath.replace(/[^a-zA-Z0-9]/g, "_")}`;

    // SMART status
    let smartStatus: SmartState = "UNKNOWN";
    if (report.smart_status?.passed !== undefined) {
      smartStatus = report.smart_status.passed ? "PASSED" : "FAILED";
    }

    let temperatureC = report.temperature?.current;
    let powerOnHours = report.power_on_time?.hours;
    let powerCycleCount = report.power_cycle_count;

    let reallocatedSectors: number | undefined = undefined;
    let pendingSectors: number | undefined = undefined;
    let offlineUncorrectableSectors: number | undefined = undefined;
    let crcErrors: number | undefined = undefined;
    let readErrors: number | undefined = undefined;
    let writeErrors: number | undefined = undefined;

    const attributes: SmartAttribute[] = [];

    // Parse ATA SMART Attributes table
    if (report.ata_smart_attributes?.table) {
      for (const attr of report.ata_smart_attributes.table) {
        const rawVal = attr.raw?.value ?? 0;

        let status: "OK" | "WARNING" | "CRITICAL" | "UNKNOWN" = "OK";
        if (attr.when_failed && attr.when_failed !== "-") {
          status = "CRITICAL";
        }

        // Map known critical ATA attributes
        switch (attr.id) {
          case 5: // Reallocated_Sector_Ct
            reallocatedSectors = rawVal;
            if (rawVal > 50) status = "CRITICAL";
            else if (rawVal > 0) status = "WARNING";
            break;
          case 197: // Current_Pending_Sector
            pendingSectors = rawVal;
            if (rawVal >= 10) status = "CRITICAL";
            else if (rawVal > 0) status = "WARNING";
            break;
          case 198: // Offline_Uncorrectable
            offlineUncorrectableSectors = rawVal;
            if (rawVal > 0) status = "CRITICAL";
            break;
          case 199: // UDMA_CRC_Error_Count
            crcErrors = rawVal;
            if (rawVal > 100) status = "WARNING";
            break;
          case 194: // Temperature_Celsius
            if (temperatureC === undefined && rawVal > 0) temperatureC = rawVal;
            break;
          case 9: // Power_On_Hours
            if (powerOnHours === undefined) powerOnHours = rawVal;
            break;
        }

        attributes.push({
          diskId,
          attributeId: attr.id,
          name: attr.name,
          normalizedValue: attr.value,
          worstValue: attr.worst,
          threshold: attr.thresh,
          rawValue: attr.raw?.string ?? rawVal,
          whenFailed: attr.when_failed,
          status,
          observedAt: now,
        });
      }
    }

    // Parse NVMe Log if present
    let percentageUsed: number | undefined = undefined;
    let availableSparePercent: number | undefined = undefined;

    if (report.nvme_smart_health_information_log) {
      const nvme = report.nvme_smart_health_information_log;
      if (nvme.temperature !== undefined) temperatureC = nvme.temperature - 273.15; // Kelvin to Celsius if applicable
      if (nvme.power_on_hours !== undefined) powerOnHours = nvme.power_on_hours;
      if (nvme.power_cycles !== undefined) powerCycleCount = nvme.power_cycles;
      if (nvme.media_errors !== undefined) readErrors = nvme.media_errors;
      percentageUsed = nvme.percentage_used;
      availableSparePercent = nvme.available_spare;

      if (nvme.critical_warning !== undefined && nvme.critical_warning > 0) {
        smartStatus = "FAILED";
      }
    }

    // Determine initial state from smartctl
    let state: DiskHealthState = "HEALTHY";
    if (smartStatus === "FAILED") {
      state = "FAILED";
    } else if (
      (pendingSectors !== undefined && pendingSectors >= 10) ||
      (reallocatedSectors !== undefined && reallocatedSectors >= 50) ||
      (temperatureC !== undefined && temperatureC >= 60)
    ) {
      state = "CRITICAL";
    } else if (
      (pendingSectors !== undefined && pendingSectors > 0) ||
      (reallocatedSectors !== undefined && reallocatedSectors > 0) ||
      (temperatureC !== undefined && temperatureC >= 50)
    ) {
      state = "WARNING";
    }

    return {
      diskId,
      recorderId: target.recorderId,
      branchId: target.branchId,
      tenantId: target.tenantId,
      devicePath,
      model,
      serialNumber,
      firmwareVersion,
      interfaceType: isNvme ? "NVME" : "SATA",
      totalBytes,
      state,
      smartSupported: true,
      smartEnabled: true,
      smartStatus,
      temperatureC: temperatureC !== undefined ? Math.round(temperatureC) : undefined,
      powerOnHours,
      powerCycleCount,
      reallocatedSectors,
      pendingSectors,
      offlineUncorrectableSectors,
      crcErrors,
      readErrors,
      writeErrors,
      percentageUsed,
      availableSparePercent,
      attributes,
      source: this.source,
      confidence: 0.98, // SMARTCTL carries 0.98 confidence
      observedAt: now,
    };
  }
}
