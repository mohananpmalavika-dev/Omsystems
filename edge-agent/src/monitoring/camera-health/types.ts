/**
 * Multi-Layer Evidence-Based Camera Health Types
 * 
 * Defines the 7-layer video path observation types, probe states,
 * operational states, and explainable reason codes.
 */

export type ProbeState = "PASS" | "FAIL" | "UNKNOWN";

export type CameraOperationalState =
  | "HEALTHY"
  | "DEGRADED"
  | "CRITICAL"
  | "UNKNOWN";

export type CameraHealthReason =
  | "NETWORK_UNREACHABLE"
  | "RTSP_UNREACHABLE"
  | "STREAM_AUTH_FAILED"
  | "NO_VIDEO_TRACK"
  | "DECODE_FAILED"
  | "VIDEO_FROZEN"
  | "SIGNAL_LOST"
  | "RECORDER_CHANNEL_DISCONNECTED"
  | "RECORDING_STOPPED"
  | "STALE_OBSERVATION"
  | "CORRUPT_STREAM"
  | "UNSUPPORTED_CODEC";

export interface HealthObservation<T = boolean> {
  state: ProbeState;
  value?: T | undefined;
  observedAt: Date;
  source:
    | "TCP"
    | "RTSP"
    | "FFPROBE"
    | "FFMPEG"
    | "ONVIF"
    | "HIKVISION_ISAPI"
    | "DAHUA_CGI"
    | "CP_PLUS"
    | "RECORDER_ARCHIVE"
    | "SYNTHETIC";
  confidence: number;
  latencyMs?: number | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
}

export interface CameraConfiguration {
  id: string;
  name: string;
  branchId: string;
  recorderId: string;
  channelNumber: number;
  ipAddress: string;
  rtspPort?: number | undefined;
  httpPort?: number | undefined;
  username?: string | undefined;
  password?: string | undefined;
  streamPath?: string | undefined;
  isPtz?: boolean | undefined;
}

export interface NetworkProbeResult {
  reachable: boolean;
  port: number;
  latencyMs: number;
  protocol: "TCP" | "HTTP" | "HTTPS";
  error?: string | undefined;
}

export interface StreamProbeResult {
  reachable: boolean;
  videoTrackPresent: boolean;
  codec?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  fps?: number | undefined;
  bitrateKbps?: number | undefined;
  errorCode?: ("TIMEOUT" | "AUTH_FAILED" | "CONNECTION_REFUSED" | "NO_VIDEO_TRACK" | "UNKNOWN") | undefined;
  latencyMs?: number | undefined;
}

export interface DecodeProbeResult {
  decodable: boolean;
  decodedFrames: number;
  firstFrameAt?: Date | undefined;
  lastFrameAt?: Date | undefined;
  decodeErrors: number;
  fpsObserved?: number | undefined;
  errorCode?: ("NO_FRAMES" | "CORRUPT_STREAM" | "UNSUPPORTED_CODEC" | "TIMEOUT" | "DECODER_ERROR") | undefined;
  latencyMs?: number | undefined;
}

export interface FreezeAnalysis {
  frozen: boolean;
  confidence: number;
  durationSeconds: number;
  frameHashVariance?: number | undefined;
  timestampProgressing: boolean;
  packetsFlowing: boolean;
}

export interface RecorderChannelStatus {
  channelId: string;
  channelNumber: number;
  configured: boolean;
  connected: boolean | null;
  signalPresent: boolean | null;
  enabled: boolean | null;
  bitrateKbps?: number | undefined;
  fps?: number | undefined;
  observedAt: Date;
}

export interface RecordingProbeResult {
  activelyWriting: boolean;
  lastRecordedAt?: Date | undefined;
  recentSegmentsCount: number;
  archiveContinuityOk: boolean;
  observedAt: Date;
}

export interface CameraHealth {
  cameraId: string;
  branchId: string;
  cameraName?: string | undefined;
  channelNumber?: number | undefined;

  // 7-Layer Evidence Observations
  network: HealthObservation<boolean>;
  stream: HealthObservation<boolean>;
  decoding: HealthObservation<boolean>;
  freeze: HealthObservation<boolean>;
  signal: HealthObservation<boolean>;
  recorderConnection: HealthObservation<boolean>;
  recording: HealthObservation<boolean>;

  // High-Level Boolean Flags for UI Convenience
  networkReachable: boolean;
  streamReachable: boolean;
  framesDecodable: boolean;
  videoFrozen: boolean;
  signalLost: boolean;
  recorderConnected: boolean;
  recordingActive: boolean;

  // Stream Metrics
  streamLatencyMs?: number | undefined;
  fps?: number | undefined;
  bitrateKbps?: number | undefined;
  resolution?: string | undefined;
  codec?: string | undefined;

  lastFrameAt?: Date | undefined;
  lastRecordingAt?: Date | undefined;
  observedAt: Date;

  state: CameraOperationalState;
  reasonCodes: CameraHealthReason[];
}

export interface BranchCameraHealthSummary {
  branchId: string;
  observedAt: Date;
  totalCameras: number;
  healthyCameras: number;
  degradedCameras: number;
  criticalCameras: number;
  unknownCameras: number;
  streamingCoverage: {
    active: number;
    total: number;
    fraction: string;
  };
  decodableCoverage: {
    active: number;
    total: number;
    fraction: string;
  };
  recordingCoverage: {
    active: number;
    total: number;
    fraction: string;
  };
  cameras: CameraHealth[];
}
