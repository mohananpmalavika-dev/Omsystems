/**
 * Edge Agent SMARTCTL Parser
 * Structured parser for smartctl JSON outputs (-a -j)
 */

export interface ParsedSmartctlOutput {
  devicePath: string;
  model?: string | undefined;
  serialNumber?: string | undefined;
  firmwareVersion?: string | undefined;
  userCapacityBytes?: number | undefined;
  smartStatusPassed?: boolean | undefined;
  temperatureCelsius?: number | undefined;
  powerOnHours?: number | undefined;
  powerCycleCount?: number | undefined;
  reallocatedSectors?: number | undefined;
  pendingSectors?: number | undefined;
  offlineUncorrectableSectors?: number | undefined;
  crcErrors?: number | undefined;
  attributes: Array<{
    id: number;
    name: string;
    normalizedValue: number;
    worstValue: number;
    threshold: number;
    rawValue: number | string;
    whenFailed?: string | undefined;
  }>;
}

export function parseSmartctlJson(rawJson: string | object, devicePath: string): ParsedSmartctlOutput {
  const data: any = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;

  let temperatureCelsius = data.temperature?.current;
  let powerOnHours = data.power_on_time?.hours;
  let powerCycleCount = data.power_cycle_count;

  let reallocatedSectors: number | undefined = undefined;
  let pendingSectors: number | undefined = undefined;
  let offlineUncorrectableSectors: number | undefined = undefined;
  let crcErrors: number | undefined = undefined;

  const attributes: Array<{
    id: number;
    name: string;
    normalizedValue: number;
    worstValue: number;
    threshold: number;
    rawValue: number | string;
    whenFailed?: string | undefined;
  }> = [];

  if (data.ata_smart_attributes?.table && Array.isArray(data.ata_smart_attributes.table)) {
    for (const item of data.ata_smart_attributes.table) {
      const rawVal = item.raw?.value ?? 0;

      switch (item.id) {
        case 5:
          reallocatedSectors = rawVal;
          break;
        case 194:
          if (temperatureCelsius === undefined) temperatureCelsius = rawVal;
          break;
        case 197:
          pendingSectors = rawVal;
          break;
        case 198:
          offlineUncorrectableSectors = rawVal;
          break;
        case 199:
          crcErrors = rawVal;
          break;
        case 9:
          if (powerOnHours === undefined) powerOnHours = rawVal;
          break;
      }

      attributes.push({
        id: item.id,
        name: item.name,
        normalizedValue: item.value,
        worstValue: item.worst,
        threshold: item.thresh,
        rawValue: item.raw?.string ?? rawVal,
        whenFailed: item.when_failed,
      });
    }
  }

  // Handle NVMe SMART Log
  if (data.nvme_smart_health_information_log) {
    const nvme = data.nvme_smart_health_information_log;
    if (nvme.temperature !== undefined) temperatureCelsius = nvme.temperature - 273.15;
    if (nvme.power_on_hours !== undefined) powerOnHours = nvme.power_on_hours;
    if (nvme.power_cycles !== undefined) powerCycleCount = nvme.power_cycles;
  }

  return {
    devicePath,
    model: data.model_name ?? data.model_family,
    serialNumber: data.serial_number,
    firmwareVersion: data.firmware_version,
    userCapacityBytes: data.user_capacity?.bytes,
    smartStatusPassed: data.smart_status?.passed,
    temperatureCelsius: temperatureCelsius !== undefined ? Math.round(temperatureCelsius) : undefined,
    powerOnHours,
    powerCycleCount,
    reallocatedSectors,
    pendingSectors,
    offlineUncorrectableSectors,
    crcErrors,
    attributes,
  };
}
