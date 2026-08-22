/**
 * Recording Continuity & Evidence Availability - Domain Types
 * 
 * Formal domain models representing verified recording continuity,
 * archive gap detection, playback verification, and SLA tracking.
 */

export type RecordingHealthState =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "UNKNOWN";

export type EvidenceConfidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "UNKNOWN";

export type RecordingGapCause =
  | "CAMERA_OFFLINE"
  | "RECORDER_OFFLINE"
  | "STORAGE_FAILURE"
  | "NETWORK_FAILURE"
  | "RECORDING_DISABLED"
  | "SCHEDULED"
  | "RECORDER_REBOOT"
  | "TIME_DISCONTINUITY"
  | "ARCHIVE_MISSING"
  | "UNKNOWN";

export interface RecordingSegment {
  start: Date;
  end: Date;
  type: "CONTINUOUS" | "MOTION" | "EVENT" | "MANUAL" | "UNKNOWN";
  source: string;
  bytes?: number | undefined;
}

export interface RecordingGap {
  id: string;
  organizationId: string;
  branchId: string;
  recorderId: string;
  cameraId: string;
  channelId?: string | undefined;

  start: Date;
  end: Date;
  durationSeconds: number;

  cause: RecordingGapCause;
  causeConfidence: "HIGH" | "MEDIUM" | "LOW";

  detectedAt: Date;
  status: "CONFIRMED" | "SUSPECTED" | "RESOLVED";
  notes?: string | undefined;
}

export interface PlaybackVerification {
  successful: boolean;
  requestedTimestamp: Date;
  recordingFound: boolean;
  playbackOpened: boolean;
  framesDecoded: boolean;
  timestampProgressing: boolean;
  firstFrameAt?: Date | undefined;
  latencyMs?: number | undefined;
  failureReason?: string | undefined;
  verifiedAt: Date;
}

export interface RecordingContinuity {
  cameraId: string;
  cameraName: string;
  recorderId: string;
  channelId: string;
  branchId: string;
  branchName?: string | undefined;

  recordingNow: boolean | null;
  lastRecordedAt?: Date | undefined;
  secondsSinceLastRecording?: number | undefined;

  currentGapStartedAt?: Date | undefined;

  lastGap?: {
    startedAt: Date;
    endedAt: Date;
    durationSeconds: number;
    cause?: RecordingGapCause | undefined;
  } | undefined;

  largestGap24hSeconds: number;
  gapCount24h: number;
  totalGapSeconds24h: number;

  continuity24hPct: number;
  continuity7dPct: number;
  continuity30dPct: number;

  actualRetentionDays: number;
  requiredRetentionDays: number;
  oldestRecordingAt?: Date | undefined;

  playbackVerified: boolean;
  lastPlaybackVerifiedAt?: Date | undefined;
  playbackLatencyMs?: number | undefined;

  evidenceConfidence: EvidenceConfidence;
  state: RecordingHealthState;
  observedAt: Date;
}

export interface BranchRecordingHealth {
  branchId: string;
  branchName: string;
  totalCameras: number;
  currentlyRecording: number;
  continuityCompliant: number;
  playbackVerified: number;
  retentionCompliant: number;
  worstContinuity24hPct: number;
  branchContinuityPct: number;
  largestGapSeconds: number;
  state: RecordingHealthState;
  evaluatedAt: Date;
}
