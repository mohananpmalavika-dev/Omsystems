import type { OperationalTelemetryEnvelope, TelemetryValue } from "./types.js";

export type DiskSmartStatus = "healthy" | "warning" | "degraded" | "failure_predicted" | "failed" | "missing";

export interface NormalizedDiskHealth {
  id: string;
  devicePath: string;
  serialNumber: string;
  model: string;
  smartStatus: DiskSmartStatus;
  temperature: number;
  powerOnHours: number;
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  readErrors: number;
  writeErrors: number;
  capacityBytes: number;
  usedBytes: number;
  usagePercent: number;
  failureProbability: number;
  reasonCodes: string[];
}

const aliases = {
  id: ["id", "diskId", "diskNo", "slot", "index", "name"],
  devicePath: ["devicePath", "path", "disk", "device", "name"],
  serialNumber: ["serialNumber", "serial", "sn"],
  model: ["model", "modelName", "product"],
  status: ["smartStatus", "status", "state", "health"],
  smartPassed: ["smartPassed", "smartPass", "passed"],
  temperature: ["temperature", "temperatureC", "temp"],
  powerOnHours: ["powerOnHours", "power_on_hours", "hours"],
  reallocatedSectors: ["reallocatedSectors", "reallocatedSectorCount", "reallocated_sector_ct"],
  pendingSectors: ["pendingSectors", "currentPendingSector", "current_pending_sector"],
  uncorrectableSectors: ["uncorrectableSectors", "uncorrectableErrorCount", "offlineUncorrectable"],
  readErrors: ["readErrors", "readErrorRate"],
  writeErrors: ["writeErrors", "writeErrorRate"],
  capacityBytes: ["capacityBytes", "totalBytes", "capacity"],
  usedBytes: ["usedBytes", "usedSpace", "used"],
  freeBytes: ["freeBytes", "freeSpace", "availableBytes", "available"],
  usagePercent: ["usagePercent", "usedPercent", "utilizationPercent"],
} as const;

export function normalizeRecorderHddStatus(payload: unknown): NormalizedDiskHealth[] {
  return unwrapDisks(payload).map((item, index) => normalizeDisk(item, index));
}

export function normalizeDiskMetrics(
  metrics: Record<string, TelemetryValue>,
  fallbackId = "disk",
): { metrics: Record<string, TelemetryValue>; reasonCodes: string[] } {
  const disk = normalizeDisk({ id: fallbackId, ...metrics }, 0);
  return { metrics: diskToMetrics(disk), reasonCodes: disk.reasonCodes };
}

export function diskToMetrics(disk: NormalizedDiskHealth): Record<string, TelemetryValue> {
  return {
    status: disk.smartStatus === "healthy" ? "healthy"
      : disk.smartStatus === "warning" || disk.smartStatus === "degraded" ? "warning" : "critical",
    smartStatus: disk.smartStatus,
    devicePath: disk.devicePath,
    serialNumber: disk.serialNumber,
    model: disk.model,
    temperature: disk.temperature,
    powerOnHours: disk.powerOnHours,
    reallocatedSectors: disk.reallocatedSectors,
    pendingSectors: disk.pendingSectors,
    uncorrectableSectors: disk.uncorrectableSectors,
    readErrors: disk.readErrors,
    writeErrors: disk.writeErrors,
    capacityBytes: disk.capacityBytes,
    usedBytes: disk.usedBytes,
    usagePercent: disk.usagePercent,
    failureProbability: disk.failureProbability,
  };
}

export function projectDiskHealth(
  envelope: OperationalTelemetryEnvelope,
  branch: { id: string; name: string },
) {
  const normalized = normalizeDisk(envelope.metrics, 0);
  return {
    id: envelope.deviceId,
    branchId: branch.id,
    branchName: branch.name,
    branchCode: branch.id.slice(0, 8),
    devicePath: normalized.devicePath || envelope.deviceId,
    serialNumber: normalized.serialNumber,
    model: normalized.model,
    smartStatus: normalized.smartStatus,
    temperature: normalized.temperature,
    powerOnHours: normalized.powerOnHours,
    reallocatedSectors: normalized.reallocatedSectors,
    pendingSectors: normalized.pendingSectors,
    uncorrectableSectors: normalized.uncorrectableSectors,
    failureProbability: normalized.failureProbability,
    capacityBytes: normalized.capacityBytes,
    usedBytes: normalized.usedBytes,
    usagePercent: normalized.usagePercent,
    reasonCodes: envelope.reasonCodes.length ? envelope.reasonCodes : normalized.reasonCodes,
    lastCheck: envelope.observedAt,
  };
}

function normalizeDisk(input: Record<string, unknown>, index: number): NormalizedDiskHealth {
  const explicit = textValue(input, aliases.status).toLowerCase();
  const smartPassed = booleanValue(input, aliases.smartPassed);
  const temperature = numberValue(input, aliases.temperature);
  const powerOnHours = numberValue(input, aliases.powerOnHours);
  const reallocatedSectors = numberValue(input, aliases.reallocatedSectors);
  const pendingSectors = numberValue(input, aliases.pendingSectors);
  const uncorrectableSectors = numberValue(input, aliases.uncorrectableSectors);
  const readErrors = numberValue(input, aliases.readErrors);
  const writeErrors = numberValue(input, aliases.writeErrors);
  const capacityBytes = numberValue(input, aliases.capacityBytes);
  let usedBytes = numberValue(input, aliases.usedBytes);
  const freeBytes = numberValue(input, aliases.freeBytes);
  if (!usedBytes && capacityBytes && freeBytes) usedBytes = Math.max(0, capacityBytes - freeBytes);
  const usagePercent = numberValue(input, aliases.usagePercent)
    || (capacityBytes > 0 ? Math.round((usedBytes / capacityBytes) * 1000) / 10 : 0);
  const reasons: string[] = [];
  let risk = 5;

  const explicitlyFailed = /fail|error|bad|fault/.test(explicit);
  const missing = /missing|absent|not.present|uninitialized/.test(explicit);
  if (explicitlyFailed || smartPassed === false) { risk += 75; reasons.push("smart_self_test_failed"); }
  if (missing) { risk = 100; reasons.push("disk_missing"); }
  if (uncorrectableSectors > 0) { risk += Math.min(35, 15 + uncorrectableSectors * 3); reasons.push("uncorrectable_sectors_detected"); }
  if (pendingSectors > 0) { risk += Math.min(25, 8 + pendingSectors * 2); reasons.push("pending_sectors_detected"); }
  if (reallocatedSectors > 0) { risk += Math.min(25, 5 + reallocatedSectors / 2); reasons.push("reallocated_sectors_detected"); }
  if (temperature >= 65) { risk += 30; reasons.push("disk_temperature_critical"); }
  else if (temperature >= 55) { risk += 15; reasons.push("disk_temperature_high"); }
  if (readErrors + writeErrors > 0) { risk += Math.min(20, 5 + Math.log10(readErrors + writeErrors + 1) * 5); reasons.push("disk_io_errors_detected"); }
  if (powerOnHours >= 43_800) { risk += 12; reasons.push("disk_service_age_high"); }
  if (usagePercent >= 95) { risk += 12; reasons.push("disk_capacity_critical"); }
  else if (usagePercent >= 85) { risk += 5; reasons.push("disk_capacity_high"); }

  const failureProbability = Math.round(Math.min(100, risk) * 10) / 10;
  const smartStatus: DiskSmartStatus = missing ? "missing"
    : explicitlyFailed ? "failed"
      : failureProbability >= 80 ? "failure_predicted"
        : failureProbability >= 55 ? "degraded"
          : failureProbability >= 25 ? "warning" : "healthy";
  return {
    id: textValue(input, aliases.id) || String(index + 1),
    devicePath: textValue(input, aliases.devicePath) || `Disk ${index + 1}`,
    serialNumber: textValue(input, aliases.serialNumber) || "Unavailable",
    model: textValue(input, aliases.model) || "Unknown disk",
    smartStatus, temperature, powerOnHours, reallocatedSectors, pendingSectors,
    uncorrectableSectors, readErrors, writeErrors, capacityBytes, usedBytes,
    usagePercent, failureProbability,
    reasonCodes: reasons.length ? reasons : ["smart_metrics_normal"],
  };
}

function unwrapDisks(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ["hddStatus", "hdd_status", "disks", "storage", "drives", "items"]) {
    const nested = payload[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
    if (isRecord(nested)) return Object.values(nested).filter(isRecord);
  }
  return [payload];
}

function normalizedKey(value: string) { return value.replace(/[^a-z0-9]/gi, "").toLowerCase(); }
function valueFor(input: Record<string, unknown>, names: readonly string[]) {
  const entries = new Map(Object.entries(input).map(([key, value]) => [normalizedKey(key), value]));
  for (const name of names) if (entries.has(normalizedKey(name))) return entries.get(normalizedKey(name));
  return undefined;
}
function numberValue(input: Record<string, unknown>, names: readonly string[]) {
  const value = valueFor(input, names);
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function textValue(input: Record<string, unknown>, names: readonly string[]) {
  const value = valueFor(input, names);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function booleanValue(input: Record<string, unknown>, names: readonly string[]) {
  const value = valueFor(input, names);
  return typeof value === "boolean" ? value : typeof value === "string" ? value.toLowerCase() === "true" : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
