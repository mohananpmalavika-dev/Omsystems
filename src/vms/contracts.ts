import type { Camera } from "../domain/models.js";

/**
 * Public VMS observation states. A failed observation is never represented as
 * an observed `false` value.
 */
export type VmsCapabilityResult<T> =
  | {
      state: "AVAILABLE";
      value: T;
      source: "DEVICE" | "CACHE" | "PLATFORM_INDEX";
      observedAt: string;
      latencyMs?: number;
      confidence: number;
      freshness: "FRESH" | "STALE";
    }
  | {
      state: "UNAVAILABLE";
      reason:
        | "DEVICE_OFFLINE"
        | "AUTHENTICATION_FAILED"
        | "TIMEOUT"
        | "NETWORK_ERROR"
        | "MALFORMED_RESPONSE"
        | "DEPENDENCY_UNAVAILABLE"
        | "NOT_CONFIGURED"
        | "UNKNOWN";
      message: string;
      observedAt: string;
      retryable: boolean;
    }
  | {
      state: "UNSUPPORTED";
      reason: string;
    };

export type VmsCapabilitySupport = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED";

export interface VmsCapabilityDescriptor {
  support: VmsCapabilitySupport;
  reason?: string;
}

export type VmsCapabilityName =
  | "discovery"
  | "deviceInfo"
  | "channels"
  | "liveStream"
  | "streamVerification"
  | "recordingStatus"
  | "recordingSearch"
  | "timeline"
  | "playback"
  | "export"
  | "storage"
  | "clock"
  | "events"
  | "ptz"
  | "health"
  | "firmware";

export type VmsCapabilityMatrix = Record<VmsCapabilityName, VmsCapabilityDescriptor>;

export interface VmsDeviceInfo {
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  serialNumber: string | null;
  hardwareId: string | null;
}

export interface VmsStreamProfile {
  id: string;
  nativeProfileToken?: string;
  purpose: "MAIN" | "SUB" | "THIRD" | "UNKNOWN";
  codec: "H264" | "H265" | "MJPEG" | "UNKNOWN";
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
}

export interface VmsChannel {
  id: string;
  recorderId: string;
  nativeChannelId: string;
  name: string;
  enabled: boolean;
  streams: VmsStreamProfile[];
}

export interface VmsStreamEndpoint {
  transport: "HLS" | "WEBRTC" | "DIRECT";
  url: string;
  expiresAt: string;
  verified: boolean;
  verifiedAt: string | null;
}

export interface VmsRecordingStatus {
  configured: boolean | null;
  active: boolean | null;
  latestSegmentAt: string | null;
  mode: "CONTINUOUS" | "MOTION" | "EVENT" | "SCHEDULED" | "UNKNOWN";
  evidence: Array<{
    type: "DEVICE_STATUS" | "ARCHIVE_SEGMENT" | "PLAYBACK_PROBE" | "PLATFORM_JOB";
    observedAt: string;
  }>;
}

export interface VmsRecordingSegment {
  id: string;
  cameraId: string;
  recorderId?: string;
  nativeRecordingId?: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  type: "CONTINUOUS" | "MOTION" | "ALARM" | "MANUAL" | "UNKNOWN";
  hasAudio?: boolean;
  playbackAvailable: boolean;
  source: "RECORDER" | "PLATFORM";
  platformSegmentId?: string;
}

export interface VmsRecordingSearchQuery {
  cameraId: string;
  recorderId?: string;
  nativeChannelId?: string;
  from: string;
  to: string;
  limit?: number;
  cursor?: string;
}

export interface VmsRecordingSearchResult {
  segments: VmsRecordingSegment[];
  /** False means gaps cannot be classified as missing. */
  coverageComplete: boolean;
  cursor?: string;
  summary?: {
    oldestContinuousAt: string | null;
    newestPlayableAt: string | null;
    gapCount: number;
    largestGapSeconds: number;
    playbackVerified: boolean | null;
    reasonCodes: string[];
  };
}

export interface VmsTimelineInterval {
  start: string;
  end: string;
  state: "RECORDED" | "MISSING" | "UNKNOWN";
  segmentId?: string;
  reason?: string;
}

export interface VmsRecordingTimeline {
  from: string;
  to: string;
  intervals: VmsTimelineInterval[];
  coverageComplete: boolean;
}

export interface VmsPlaybackRequest {
  cameraId: string;
  recorderId?: string;
  nativeChannelId?: string;
  start: string;
  end?: string;
  speed?: number;
}

export interface VmsPlaybackSession {
  id: string;
  transport: "HLS" | "WEBRTC" | "DIRECT";
  url: string;
  expiresAt: string;
  sourceStartTime: string;
  supports: { seek: boolean; pause: boolean; variableSpeed: boolean };
}

export interface VmsRecordingExportRequest {
  cameraIds: string[];
  from: string;
  to: string;
  format: "MP4" | "MKV";
  includeAudio: boolean;
  requestedBy: string;
  incidentId?: string;
}

export interface VmsRecordingExportJob {
  id: string;
  state: "REQUESTED" | "LOCATING_RECORDINGS" | "FETCHING" | "TRANSCODING" | "HASHING" | "READY" | "FAILED";
  sha256?: string;
  downloadUrl?: string;
  failureReason?: "RECORDING_NOT_FOUND" | "RECORDER_OFFLINE" | "AUTHENTICATION_FAILED" | "CORRUPT_MEDIA" | "EXPORT_FAILED";
}

export interface VmsStorageInfo {
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  state: "NORMAL" | "DEGRADED" | "FAILED" | "UNKNOWN";
}

export interface VmsDeviceClock {
  recorderTime: string;
  observedAt: string;
  offsetMs: number;
  ntpEnabled: boolean | null;
  timezone: string | null;
}

export interface VmsRecorderHealth {
  reachable: boolean | null;
  authenticated: boolean | null;
  recording: boolean | null;
  storageHealthy: boolean | null;
  clockSynchronized: boolean | null;
}

/** Vendor adapters and edge bridges implement this single normalized contract. */
export interface RecorderProvider {
  readonly vendor: string;
  capabilities(): Promise<VmsCapabilityResult<VmsCapabilityMatrix>>;
  getDeviceInfo(): Promise<VmsCapabilityResult<VmsDeviceInfo>>;
  listChannels(): Promise<VmsCapabilityResult<VmsChannel[]>>;
  getLiveStream(channelId: string): Promise<VmsCapabilityResult<VmsStreamEndpoint>>;
  getRecordingStatus(channelId: string): Promise<VmsCapabilityResult<VmsRecordingStatus>>;
  searchRecordings(query: VmsRecordingSearchQuery): Promise<VmsCapabilityResult<VmsRecordingSearchResult>>;
  startPlayback(request: VmsPlaybackRequest): Promise<VmsCapabilityResult<VmsPlaybackSession>>;
  exportRecording(request: VmsRecordingExportRequest): Promise<VmsCapabilityResult<VmsRecordingExportJob>>;
  getStorage(): Promise<VmsCapabilityResult<VmsStorageInfo[]>>;
  getTime(): Promise<VmsCapabilityResult<VmsDeviceClock>>;
  getHealth(): Promise<VmsCapabilityResult<VmsRecorderHealth>>;
}

export type RecorderProviderResolver = (
  camera: Camera,
) => RecorderProvider | undefined | Promise<RecorderProvider | undefined>;

export interface VmsCameraRecordingView {
  cameraId: string;
  recorderId: string | null;
  source: "RECORDER" | "PLATFORM";
  capabilities: VmsCapabilityMatrix;
  recordingStatus: VmsCapabilityResult<VmsRecordingStatus>;
  recordingSearch: VmsCapabilityResult<VmsRecordingSearchResult>;
  timeline: VmsCapabilityResult<VmsRecordingTimeline>;
}

