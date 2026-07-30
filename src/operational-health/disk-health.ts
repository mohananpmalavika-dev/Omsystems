import type { OperationalTelemetryEnvelope, TelemetryValue } from "./types.js";

export type DiskSmartStatus = "healthy" | "warning" | "degraded" | "failure_predicted" | "failed" | "missing" | "unknown";
export type DiskSlotStatus = "present" | "missing" | "uninitialized" | "read_only" | "failed" | "unknown";
export type DiskRaidStatus = "healthy" | "degraded" | "rebuilding" | "failed" | "not_configured" | "unknown";
export type DiskWriteVerification = "verified" | "failed" | "unverified";
export type DiskOperationalStatus = "healthy" | "warning" | "critical" | "unknown";
export type DiskPredictionBasis = "historical_delta" | "threshold_only" | "unavailable";

export interface NormalizedDiskHealth {
  id: string;
  devicePath: string;
  serialNumber: string;
  model: string;
  detected: boolean;
  slotStatus: DiskSlotStatus;
  smartAvailable: boolean;
  smartStatus: DiskSmartStatus;
  temperature: number;
  powerOnHours: number;
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  readErrors: number;
  writeErrors: number;
  capacityBytes: number;
  availableBytes: number;
  usedBytes: number;
  usagePercent: number;
  raidStatus: DiskRaidStatus;
  raidLevel: string;
  raidMemberCount: number;
  raidFailedMemberCount: number;
  raidRebuildPercent: number;
  writeVerification: DiskWriteVerification;
  writeVerifiedAt: string;
  writeLatencyMs: number;
  failureProbability: number;
  predictionBasis: DiskPredictionBasis;
  sectorGrowth: number;
  ioErrorGrowth: number;
  replacementDetected: boolean;
  previousSerialNumber: string;
  operationalStatus: DiskOperationalStatus;
  reasonCodes: string[];
}

const aliases = {
  id: ["id", "diskId", "diskNo", "slot", "slotId", "index", "name"],
  devicePath: ["devicePath", "path", "disk", "device", "name"],
  serialNumber: ["serialNumber", "serial", "sn"],
  model: ["model", "modelName", "product"],
  state: ["slotStatus", "diskStatus", "status", "state", "health"],
  detected: ["detected", "present", "installed"],
  smartStatus: ["smartStatus", "smartHealth", "smartOverallStatus"],
  smartPassed: ["smartPassed", "smartPass", "passed"],
  smartAvailable: ["smartAvailable", "smartSupported"],
  telemetryCapability: ["telemetryCapability", "capability"],
  temperature: ["temperature", "temperatureC", "temp"],
  powerOnHours: ["powerOnHours", "power_on_hours", "hours"],
  reallocatedSectors: ["reallocatedSectors", "reallocatedSectorCount", "reallocated_sector_ct"],
  pendingSectors: ["pendingSectors", "currentPendingSector", "current_pending_sector"],
  uncorrectableSectors: ["uncorrectableSectors", "uncorrectableErrorCount", "offlineUncorrectable"],
  readErrors: ["readErrors", "readErrorRate"],
  writeErrors: ["writeErrors", "writeErrorRate"],
  capacityBytes: ["capacityBytes", "totalBytes", "capacity", "totalSpace"],
  usedBytes: ["usedBytes", "usedSpace", "used"],
  freeBytes: ["freeBytes", "freeSpace", "availableBytes", "available"],
  usagePercent: ["usagePercent", "usedPercent", "utilizationPercent"],
  raidStatus: ["raidStatus", "raidState", "arrayStatus", "arrayState"],
  raidLevel: ["raidLevel", "arrayLevel"],
  raidMemberCount: ["raidMemberCount", "memberCount", "members"],
  raidFailedMemberCount: ["raidFailedMemberCount", "failedMemberCount", "failedMembers"],
  raidRebuildPercent: ["raidRebuildPercent", "rebuildPercent", "rebuildProgress"],
  writeVerification: ["writeVerification", "writeProbeStatus", "recordingWriteStatus"],
  writeVerified: ["writeVerified", "writeProbePassed", "recordingWriteVerified"],
  writeVerifiedAt: ["writeVerifiedAt", "lastWriteVerifiedAt", "lastWriteProbeAt"],
  writeLatencyMs: ["writeLatencyMs", "writeProbeLatencyMs"],
  failureProbability: ["failureProbability", "failureRisk", "riskScore"],
  predictionBasis: ["predictionBasis"],
  sectorGrowth: ["sectorGrowth"],
  ioErrorGrowth: ["ioErrorGrowth"],
  replacementDetected: ["replacementDetected"],
  previousSerialNumber: ["previousSerialNumber"],
  operationalStatus: ["operationalStatus", "statusSummary"],
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
    status: disk.operationalStatus,
    operationalStatus: disk.operationalStatus,
    detected: disk.detected,
    slotStatus: disk.slotStatus,
    smartAvailable: disk.smartAvailable,
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
    availableBytes: disk.availableBytes,
    usedBytes: disk.usedBytes,
    usagePercent: disk.usagePercent,
    raidStatus: disk.raidStatus,
    raidLevel: disk.raidLevel,
    raidMemberCount: disk.raidMemberCount,
    raidFailedMemberCount: disk.raidFailedMemberCount,
    raidRebuildPercent: disk.raidRebuildPercent,
    writeVerification: disk.writeVerification,
    writeVerifiedAt: disk.writeVerifiedAt,
    writeLatencyMs: disk.writeLatencyMs,
    failureProbability: disk.failureProbability,
    predictionBasis: disk.predictionBasis,
    sectorGrowth: disk.sectorGrowth,
    ioErrorGrowth: disk.ioErrorGrowth,
    replacementDetected: disk.replacementDetected,
    previousSerialNumber: disk.previousSerialNumber,
  };
}

/** Enrich a new immutable sample with deltas from the prior sample for the same slot. */
export function applyDiskHistory(
  current: NormalizedDiskHealth,
  previousMetrics: Record<string, TelemetryValue> | undefined,
): NormalizedDiskHealth {
  if (!previousMetrics) return current;
  const previous = normalizeDisk(previousMetrics as Record<string, unknown>, 0);
  const hasCurrentSerial = isKnownSerial(current.serialNumber);
  const hasPreviousSerial = isKnownSerial(previous.serialNumber);
  if (hasCurrentSerial && hasPreviousSerial && current.serialNumber !== previous.serialNumber) {
    return finalize({
      ...current,
      replacementDetected: true,
      previousSerialNumber: previous.serialNumber,
      reasonCodes: [...current.reasonCodes, "disk_replacement_detected"],
    });
  }

  const sectorGrowth = Math.max(0,
    current.reallocatedSectors + current.pendingSectors + current.uncorrectableSectors
      - previous.reallocatedSectors - previous.pendingSectors - previous.uncorrectableSectors,
  );
  const ioErrorGrowth = Math.max(0,
    current.readErrors + current.writeErrors - previous.readErrors - previous.writeErrors,
  );
  if (sectorGrowth === 0 && ioErrorGrowth === 0) return current;
  const addedRisk = Math.min(35, sectorGrowth * 5 + Math.log10(ioErrorGrowth + 1) * 8);
  return finalize({
    ...current,
    failureProbability: round(Math.min(100, current.failureProbability + addedRisk)),
    predictionBasis: "historical_delta",
    sectorGrowth,
    ioErrorGrowth,
    reasonCodes: [
      ...current.reasonCodes,
      ...(sectorGrowth > 0 ? ["smart_sector_count_increasing"] : []),
      ...(ioErrorGrowth > 0 ? ["disk_io_errors_increasing"] : []),
    ],
  });
}

export function projectDiskHealth(
  envelope: OperationalTelemetryEnvelope,
  branch: { id: string; name: string; code?: string },
) {
  const normalized = normalizeDisk(envelope.metrics, 0);
  return {
    id: envelope.deviceId,
    branchId: branch.id,
    branchName: branch.name,
    branchCode: branch.code ?? branch.id.slice(0, 8),
    ...normalized,
    reasonCodes: envelope.reasonCodes.length ? envelope.reasonCodes : normalized.reasonCodes,
    lastCheck: envelope.observedAt,
  };
}

function normalizeDisk(input: Record<string, unknown>, index: number): NormalizedDiskHealth {
  const state = textValue(input, aliases.state).toLowerCase();
  const explicitSmart = textValue(input, aliases.smartStatus).toLowerCase();
  const smartPassed = booleanValue(input, aliases.smartPassed);
  const capability = textValue(input, aliases.telemetryCapability).toLowerCase();
  const smartAttributeNames: readonly string[] = [
    ...aliases.temperature, ...aliases.powerOnHours, ...aliases.reallocatedSectors,
    ...aliases.pendingSectors, ...aliases.uncorrectableSectors, ...aliases.readErrors,
    ...aliases.writeErrors,
  ];
  const hasSmartAttributes = smartAttributeNames.some((name) => valueFor(input, [name]) !== undefined);
  const smartAvailable = booleanValue(input, aliases.smartAvailable)
    ?? (capability === "smart" || smartPassed !== undefined || Boolean(explicitSmart && explicitSmart !== "unknown") || hasSmartAttributes);
  const temperature = numberValue(input, aliases.temperature);
  const powerOnHours = numberValue(input, aliases.powerOnHours);
  const reallocatedSectors = numberValue(input, aliases.reallocatedSectors);
  const pendingSectors = numberValue(input, aliases.pendingSectors);
  const uncorrectableSectors = numberValue(input, aliases.uncorrectableSectors);
  const readErrors = numberValue(input, aliases.readErrors);
  const writeErrors = numberValue(input, aliases.writeErrors);
  const capacityBytes = byteValue(input, aliases.capacityBytes);
  let usedBytes = byteValue(input, aliases.usedBytes);
  let availableBytes = byteValue(input, aliases.freeBytes);
  if (usedBytes === 0 && capacityBytes > 0 && availableBytes > 0) usedBytes = Math.max(0, capacityBytes - availableBytes);
  if (availableBytes === 0 && capacityBytes > 0 && usedBytes > 0) availableBytes = Math.max(0, capacityBytes - usedBytes);
  const usagePercent = numberValue(input, aliases.usagePercent)
    || (capacityBytes > 0 ? round((usedBytes / capacityBytes) * 100) : 0);

  const detectedFlag = booleanValue(input, aliases.detected);
  const missing = detectedFlag === false || /missing|absent|not.?present|no.?disk/.test(state);
  const uninitialized = /uninitial|not.?initial|unformatted|not.?format/.test(state);
  const readOnly = /read.?only|write.?protect/.test(state);
  const slotFailed = /fail|error|bad|fault|offline/.test(state) && !/smart/.test(state);
  const slotStatus: DiskSlotStatus = missing ? "missing" : uninitialized ? "uninitialized"
    : readOnly ? "read_only" : slotFailed ? "failed" : state || detectedFlag === true ? "present" : "unknown";
  const detected = !missing && (detectedFlag === true || slotStatus !== "unknown" || capacityBytes > 0 || isKnownSerial(textValue(input, aliases.serialNumber)));

  const reasons: string[] = [];
  let risk = smartAvailable ? 5 : 0;
  const explicitlyFailed = /critical|fail|error|bad|fault/.test(explicitSmart);
  if (explicitlyFailed || smartPassed === false) { risk += 75; reasons.push("smart_self_test_failed"); }
  if (missing) reasons.push("disk_missing");
  else if (uninitialized) reasons.push("disk_uninitialized");
  else if (readOnly) reasons.push("disk_read_only");
  else if (slotFailed) reasons.push("disk_slot_failed");
  else if (detected) reasons.push("disk_detected");
  else reasons.push("disk_detection_unknown");
  if (!smartAvailable) reasons.push("smart_telemetry_unavailable");
  if (uncorrectableSectors > 0) { risk += Math.min(35, 15 + uncorrectableSectors * 3); reasons.push("uncorrectable_sectors_detected"); }
  if (pendingSectors > 0) { risk += Math.min(25, 8 + pendingSectors * 2); reasons.push("pending_sectors_detected"); }
  if (reallocatedSectors > 0) { risk += Math.min(25, 5 + reallocatedSectors / 2); reasons.push("reallocated_sectors_detected"); }
  if (temperature >= 65) { risk += 30; reasons.push("disk_temperature_critical"); }
  else if (temperature >= 55) { risk += 15; reasons.push("disk_temperature_high"); }
  if (readErrors + writeErrors > 0) { risk += Math.min(20, 5 + Math.log10(readErrors + writeErrors + 1) * 5); reasons.push("disk_io_errors_detected"); }
  if (powerOnHours >= 43_800) { risk += 12; reasons.push("disk_service_age_high"); }
  if (usagePercent >= 95) { risk += 12; reasons.push("disk_capacity_critical"); }
  else if (usagePercent >= 85) { risk += 5; reasons.push("disk_capacity_high"); }
  if (capacityBytes === 0) reasons.push("disk_capacity_unavailable");

  const suppliedRisk = numberValue(input, aliases.failureProbability);
  const failureProbability = round(Math.min(100, Math.max(risk, suppliedRisk)));
  let smartStatus: DiskSmartStatus = !detected && missing ? "missing" : !smartAvailable ? "unknown"
    : explicitlyFailed || smartPassed === false ? "failed"
      : failureProbability >= 80 ? "failure_predicted"
        : failureProbability >= 55 ? "degraded"
          : failureProbability >= 25 || /warn|degrad|abnormal/.test(explicitSmart) ? "warning" : "healthy";

  const raidText = textValue(input, aliases.raidStatus).toLowerCase();
  const raidLevel = textValue(input, aliases.raidLevel);
  const raidStatus: DiskRaidStatus = /fail|offline|broken/.test(raidText) ? "failed"
    : /degrad/.test(raidText) ? "degraded"
      : /rebuild|recover|resync/.test(raidText) ? "rebuilding"
        : /healthy|normal|optimal|online/.test(raidText) ? "healthy"
          : /none|not.?config|single|jbod/.test(raidText) ? "not_configured" : "unknown";
  if (raidStatus === "failed") reasons.push("raid_failed");
  else if (raidStatus === "degraded") reasons.push("raid_degraded");
  else if (raidStatus === "rebuilding") reasons.push("raid_rebuilding");
  else if (raidStatus === "unknown") reasons.push("raid_health_unavailable");

  const writeText = textValue(input, aliases.writeVerification).toLowerCase();
  const writeFlag = booleanValue(input, aliases.writeVerified);
  const writeVerification: DiskWriteVerification = writeFlag === true || /pass|verified|success|writing|normal/.test(writeText) ? "verified"
    : writeFlag === false || /fail|error|blocked|read.?only/.test(writeText) ? "failed" : "unverified";
  if (writeVerification === "failed") reasons.push("recording_write_failed");
  else if (writeVerification === "unverified") reasons.push("recording_write_unverified");

  const predictionBasisText = textValue(input, aliases.predictionBasis).toLowerCase();
  const predictionBasis: DiskPredictionBasis = predictionBasisText === "historical_delta" ? "historical_delta"
    : smartAvailable ? "threshold_only" : "unavailable";
  smartStatus = missing ? "missing" : smartStatus;
  return finalize({
    id: textValue(input, aliases.id) || String(index + 1),
    devicePath: textValue(input, aliases.devicePath) || `Disk ${index + 1}`,
    serialNumber: textValue(input, aliases.serialNumber) || "Unavailable",
    model: textValue(input, aliases.model) || "Unknown disk",
    detected, slotStatus, smartAvailable, smartStatus, temperature, powerOnHours,
    reallocatedSectors, pendingSectors, uncorrectableSectors, readErrors, writeErrors,
    capacityBytes, availableBytes, usedBytes, usagePercent,
    raidStatus, raidLevel, raidMemberCount: numberValue(input, aliases.raidMemberCount),
    raidFailedMemberCount: numberValue(input, aliases.raidFailedMemberCount),
    raidRebuildPercent: numberValue(input, aliases.raidRebuildPercent),
    writeVerification, writeVerifiedAt: textValue(input, aliases.writeVerifiedAt),
    writeLatencyMs: numberValue(input, aliases.writeLatencyMs), failureProbability,
    predictionBasis, sectorGrowth: numberValue(input, aliases.sectorGrowth),
    ioErrorGrowth: numberValue(input, aliases.ioErrorGrowth),
    replacementDetected: booleanValue(input, aliases.replacementDetected) ?? false,
    previousSerialNumber: textValue(input, aliases.previousSerialNumber),
    operationalStatus: "unknown", reasonCodes: reasons,
  });
}

function finalize(disk: NormalizedDiskHealth): NormalizedDiskHealth {
  let smartStatus = disk.smartStatus;
  if (disk.smartAvailable && !["failed", "missing"].includes(smartStatus)) {
    smartStatus = disk.failureProbability >= 80 ? "failure_predicted"
      : disk.failureProbability >= 55 ? "degraded"
        : disk.failureProbability >= 25 ? "warning" : smartStatus;
  }
  const critical = !disk.detected || ["missing", "failed"].includes(disk.slotStatus)
    || ["failed", "failure_predicted", "missing"].includes(smartStatus)
    || disk.raidStatus === "failed" || disk.writeVerification === "failed" || disk.usagePercent >= 95;
  const warning = ["uninitialized", "read_only"].includes(disk.slotStatus)
    || ["warning", "degraded"].includes(smartStatus)
    || ["degraded", "rebuilding"].includes(disk.raidStatus) || disk.usagePercent >= 85;
  const evidenceAvailable = disk.detected && (disk.smartAvailable || disk.capacityBytes > 0
    || disk.raidStatus !== "unknown" || disk.writeVerification !== "unverified");
  return {
    ...disk,
    smartStatus,
    operationalStatus: critical ? "critical" : warning ? "warning" : evidenceAvailable ? "healthy" : "unknown",
    reasonCodes: [...new Set(disk.reasonCodes)],
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
function byteValue(input: Record<string, unknown>, names: readonly string[]) {
  const value = valueFor(input, names);
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : 0;
  const text = String(value ?? "").trim();
  const parsed = Number.parseFloat(text.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const unit = text.match(/(kib|mib|gib|tib|pib|kb|mb|gb|tb|pb|bytes?|b)\s*$/i)?.[1]?.toLowerCase();
  const powers: Record<string, number> = { b: 0, byte: 0, bytes: 0, kb: 1, mb: 2, gb: 3, tb: 4, pb: 5, kib: 1, mib: 2, gib: 3, tib: 4, pib: 5 };
  return unit ? Math.round(parsed * Math.pow(unit.endsWith("ib") ? 1024 : 1000, powers[unit] ?? 0)) : parsed;
}
function textValue(input: Record<string, unknown>, names: readonly string[]) {
  const value = valueFor(input, names);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function booleanValue(input: Record<string, unknown>, names: readonly string[]) {
  const value = valueFor(input, names);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  if (["true", "yes", "1", "present", "passed", "healthy"].includes(value.toLowerCase())) return true;
  if (["false", "no", "0", "absent", "failed", "missing"].includes(value.toLowerCase())) return false;
  return undefined;
}
function isKnownSerial(value: string) { return Boolean(value && !/^(?:unavailable|unknown|n\/a|-)$/.test(value.toLowerCase())); }
function round(value: number) { return Math.round(value * 10) / 10; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
