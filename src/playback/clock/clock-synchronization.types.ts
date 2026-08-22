/**
 * Clock Synchronization & Canonical Timeline Types
 */

export type ClockSource = 'NTP' | 'ONVIF' | 'RTSP' | 'RECORDER_API' | 'EDGE_AGENT';

export type ClockEpochReason =
  | 'NTP_CORRECTION'
  | 'DEVICE_REBOOT'
  | 'MANUAL_TIME_CHANGE'
  | 'TIMEZONE_CHANGE'
  | 'DST_CHANGE'
  | 'UNKNOWN_JUMP';

export type SyncQualityGrade = 'EXCELLENT' | 'GOOD' | 'DEGRADED' | 'UNRELIABLE' | 'UNKNOWN';

export interface ClockObservation {
  deviceId: string;
  measuredAtUtc: number; // Unix Epoch MS
  deviceTimestamp: number;
  serverTimestamp: number;
  offsetMs: number;
  roundTripMs?: number;
  source: ClockSource;
  confidence: number;
}

export interface ClockEpoch {
  id: string;
  deviceId: string;
  validFromServerUtc: number;
  validToServerUtc?: number;
  deviceTimeStart: number;
  deviceTimeEnd?: number;
  offsetStartMs: number;
  offsetEndMs?: number;
  driftPpm: number;
  reason: ClockEpochReason;
  confidence: number;
}

export interface MediaPosition {
  cameraId: string;
  segmentId: string;
  canonicalUtcMs: number;
  mediaOffsetMs: number;
  targetPts: bigint;
  nearestKeyframePts: bigint;
  nearestKeyframeOffsetBytes: number;
  synchronizationErrorMs: number;
  clockConfidence: number;
}

export interface InvestigationClockState {
  currentUtcMs: number;
  state: 'PAUSED' | 'PLAYING' | 'SCRUBBING' | 'SEEKING' | 'FRAME_STEP';
  playbackRate: number;
  generation: number;
}

export interface SynchronizedCameraState {
  cameraId: string;
  deviceTimestamp: number;
  canonicalUtcMs: number;
  syncDriftMs: number;
  syncQuality: SyncQualityGrade;
  isReadyAtBarrier: boolean;
  hasRecordingCoverage: boolean;
  statusText: string;
  activeSegmentId?: string;
  targetPts?: bigint;
}
