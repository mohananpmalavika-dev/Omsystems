export type ProtectionStatus = 'PROTECTED' | 'AT_RISK' | 'UNKNOWN';
export class ProtectionError extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); }
}
export interface ProtectionPolicy {
  enabled: boolean;
  verificationIntervalMinutes: number;
  verificationFreshMinutes: number;
  maxGapSeconds: number;
  requiredRetentionDays: number;
  criticalCameraIds: string[];
  bandwidthMode: 'normal' | 'low';
  maxConcurrentStreams: number;
  sopRules: SopRule[];
}
export interface SopRule {
  id: string;
  title: string;
  kind: 'OPENING' | 'CLOSING' | 'RESTRICTED_ACCESS' | 'AFTER_HOURS';
  cameraIds: string[];
  timeZone: string;
  startMinute: number;
  endMinute: number;
  mandatory: boolean;
}
export interface RecordingCheck {
  cameraId: string;
  status: 'VERIFIED' | 'FAILED' | 'UNKNOWN';
  checkedAt: string;
  sampleAt: string;
  segmentId?: string;
  framesDecoded: number;
  timestampProgressing: boolean;
  reason: string;
  gaps: Array<{ from: string; to: string; seconds: number }>;
  indexedRetentionDays: number | null;
  incidentId?: string;
}
export interface SopReview {
  id: string;
  ruleId: string;
  occurredAt: string;
  cameraId: string;
  evidenceId: string;
  outcome: 'PENDING' | 'PASS' | 'FAIL';
  reviewerId?: string;
  reviewedAt?: string;
  notes?: string;
}
export interface ProtectionState {
  policy: ProtectionPolicy;
  checks: Record<string, RecordingCheck>;
  reviews: SopReview[];
  lastRunAt?: string;
  lastRunError?: string;
  verificationLease?: { id: string; expiresAt: string };
}
export const defaultProtectionPolicy: ProtectionPolicy = {
  enabled: false, verificationIntervalMinutes: 15, verificationFreshMinutes: 30,
  maxGapSeconds: 60, requiredRetentionDays: 90, criticalCameraIds: [],
  bandwidthMode: 'normal', maxConcurrentStreams: 144, sopRules: [],
};
export function initialProtectionState(): ProtectionState {
  return { policy: structuredClone(defaultProtectionPolicy), checks: {}, reviews: [] };
}
