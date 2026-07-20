export interface StorageCalculationInput {
  cameraCount: number;
  bitrateMbps: number;
  recordingHoursPerDay: number;
  retentionDays: number;
  metadataAndIndexPercent: number;
  safetyReservePercent: number;
  raidUsablePercent: number;
  backupCopies: number;
}

export interface StorageCalculation {
  rawVideoTb: number;
  metadataAndIndexTb: number;
  safetyReserveTb: number;
  primaryUsableTb: number;
  raidOverheadTb: number;
  primaryRawCapacityTb: number;
  backupCapacityTb: number;
  totalPlannedCapacityTb: number;
  perCameraPerDayGb: number;
}

/**
 * Uses decimal units (1 TB = 1,000,000,000,000 bytes), which matches storage
 * vendor capacity labels. Redundancy and backup are intentionally shown as
 * separate costs so RAID is never presented as a backup.
 */
export function calculateRecordingStorage(
  input: StorageCalculationInput,
): StorageCalculation {
  const rawVideoTb = input.bitrateMbps * 3_600 * input.recordingHoursPerDay *
    input.retentionDays * input.cameraCount / 8 / 1_000_000;
  const metadataAndIndexTb = rawVideoTb * input.metadataAndIndexPercent / 100;
  const safetyReserveTb = rawVideoTb * input.safetyReservePercent / 100;
  const primaryUsableTb = rawVideoTb + metadataAndIndexTb + safetyReserveTb;
  const primaryRawCapacityTb = primaryUsableTb / (input.raidUsablePercent / 100);
  const raidOverheadTb = primaryRawCapacityTb - primaryUsableTb;
  const backupCapacityTb = primaryUsableTb * input.backupCopies;

  return roundValues({
    rawVideoTb,
    metadataAndIndexTb,
    safetyReserveTb,
    primaryUsableTb,
    raidOverheadTb,
    primaryRawCapacityTb,
    backupCapacityTb,
    totalPlannedCapacityTb: primaryRawCapacityTb + backupCapacityTb,
    perCameraPerDayGb: input.bitrateMbps * 3_600 *
      input.recordingHoursPerDay / 8 / 1_000,
  });
}

function roundValues(value: StorageCalculation): StorageCalculation {
  return Object.fromEntries(
    Object.entries(value).map(([key, amount]) => [key, Number(amount.toFixed(3))]),
  ) as unknown as StorageCalculation;
}
