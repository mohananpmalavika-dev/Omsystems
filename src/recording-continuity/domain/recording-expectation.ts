/**
 * Recording Expectation & Planned Maintenance Exclusions
 * Defines the contract for what recording intervals are expected vs excluded.
 */

export type RecordingMode = 'CONTINUOUS' | 'SCHEDULED' | 'EVENT_ONLY';

export interface RecordingScheduleSlot {
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // "09:00"
  endTime: string; // "18:00"
}

export interface RecordingExpectation {
  cameraId: string;
  tenantId: string;
  branchId: string;
  mode: RecordingMode;
  timezone: string; // e.g. "Asia/Kolkata"
  schedule?: RecordingScheduleSlot[];
  minimumCoveragePercent: number; // default 99.99
  maximumAllowedGapSeconds: number; // default 5
  enabledFrom: Date;
  enabledUntil?: Date;
}

export type ExclusionReason =
  | 'PLANNED_MAINTENANCE'
  | 'FIRMWARE_UPGRADE'
  | 'BRANCH_HOLIDAY'
  | 'DECOMMISSIONED';

export interface RecordingExclusion {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  startTime: Date;
  endTime: Date;
  reason: ExclusionReason;
  approvedBy: string;
  approvedAt: Date;
  notes?: string;
}

export const DEFAULT_RECORDING_EXPECTATION = (
  cameraId: string,
  tenantId: string = 'BANK-001',
  branchId: string = 'BR-118'
): RecordingExpectation => ({
  cameraId,
  tenantId,
  branchId,
  mode: 'CONTINUOUS',
  timezone: 'Asia/Kolkata',
  minimumCoveragePercent: 99.99,
  maximumAllowedGapSeconds: 5,
  enabledFrom: new Date(0),
});
