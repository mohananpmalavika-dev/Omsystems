/**
 * First-Class Playback Subsystem - Domain Types
 */

export type PlaybackState = 'LOADING' | 'PLAYING' | 'PAUSED' | 'SEEKING' | 'BUFFERING' | 'ENDED';
export type PlaybackMode = 'SINGLE' | 'SYNCHRONIZED' | 'INCIDENT';
export type PlaybackDirection = 'FORWARD' | 'REVERSE';
export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16 | 32 | 64;

export interface KeyframePoint {
  timestampMs: number;
  byteOffset: number;
  frameNumber: number;
}

export interface ResolvedSegment {
  segmentId: string;
  cameraId: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  storagePath: string;
  storageNode: string;
  codec: string;
  keyframes: KeyframePoint[];
  discontinuityBefore: boolean;
}

export interface PlaybackCameraTrack {
  cameraId: string;
  cameraName: string;
  channel?: number;
  requestedTime: string;
  actualTime?: string;
  streamUrl?: string;
  clockOffsetMs?: number;
  driftMs: number;
  status: 'READY' | 'BUFFERING' | 'NO_RECORDING' | 'OFFLINE' | 'ERROR';
}

export interface PlaybackSession {
  id: string;
  tenantId: string;
  userId: string;
  cameras: PlaybackCameraTrack[];
  mode: PlaybackMode;
  currentTime: string; // ISO timestamp
  speed: PlaybackSpeed;
  direction: PlaybackDirection;
  state: PlaybackState;
  masterCameraId?: string;
  resolvedSegmentsCount: number;
  createdAt: string;
  expiresAt: string;
}

export type TimelineTrack =
  | 'RECORDING'
  | 'MOTION'
  | 'AI'
  | 'ACCESS'
  | 'ALERT'
  | 'BOOKMARK'
  | 'INCIDENT'
  | 'HEALTH';

export interface TimelineItem {
  id: string;
  track: TimelineTrack;
  startTime: string;
  endTime?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  type: string; // e.g. "PERSON", "VEHICLE", "DOOR_OPENED", "INTRUSION_ALARM"
  cameraId?: string;
  sourceId?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface TimelineBucket {
  bucketStart: string;
  bucketEnd: string;
  recordingSeconds: number;
  motionCount: number;
  personCount: number;
  vehicleCount: number;
  accessCount: number;
  alertCount: number;
  bookmarkCount: number;
}

export interface PlaybackBookmark {
  id: string;
  tenantId: string;
  cameraId: string;
  incidentId?: string;
  timestamp: string;
  title: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  snapshotId?: string;
}

export interface IncidentPlaybackContext {
  incidentId: string;
  anchorTimestamp: string;
  preRollSeconds: number;
  postRollSeconds: number;
  cameras: {
    cameraId: string;
    cameraName: string;
    reason: string;
    priority: number;
  }[];
  events: TimelineItem[];
}
