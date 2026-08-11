/**
 * Recording Verification Types
 * Evidence-based verification result structures
 */

/**
 * Three-state verification status
 * - VERIFIED: Positive evidence of working recording capability
 * - FAILED: Evidence that recording or stream is broken
 * - UNKNOWN: Verification infrastructure unavailable or inconclusive
 */
export type VerificationStatus = 'VERIFIED' | 'FAILED' | 'UNKNOWN';

/**
 * Verification pipeline stages
 */
export type VerificationStage =
  | 'URI_VALIDATION'
  | 'LIVE_PROBE'
  | 'PACKET_OBSERVATION'
  | 'SAMPLE_RECORDING'
  | 'RECORDED_FILE_PROBE'
  | 'COMPLETE';

/**
 * Standardized reason codes for verification failures
 */
export enum RecordingVerificationReason {
  // URI validation failures
  INVALID_STREAM_URI = 'INVALID_STREAM_URI',
  UNSUPPORTED_PROTOCOL = 'UNSUPPORTED_PROTOCOL',
  MISSING_HOSTNAME = 'MISSING_HOSTNAME',

  // Network and connectivity failures
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  NETWORK_UNREACHABLE = 'NETWORK_UNREACHABLE',
  HOST_UNREACHABLE = 'HOST_UNREACHABLE',

  // Authentication failures
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',

  // RTSP protocol failures
  RTSP_ENDPOINT_NOT_FOUND = 'RTSP_ENDPOINT_NOT_FOUND',
  RTSP_METHOD_NOT_ALLOWED = 'RTSP_METHOD_NOT_ALLOWED',
  RTSP_SERVER_ERROR = 'RTSP_SERVER_ERROR',
  RTSP_NEGOTIATION_FAILED = 'RTSP_NEGOTIATION_FAILED',

  // Stream content failures
  NO_VIDEO_STREAM = 'NO_VIDEO_STREAM',
  NO_MEDIA_PACKETS = 'NO_MEDIA_PACKETS',
  NO_DECODABLE_FRAMES = 'NO_DECODABLE_FRAMES',
  UNSUPPORTED_CODEC = 'UNSUPPORTED_CODEC',
  CORRUPTED_STREAM = 'CORRUPTED_STREAM',

  // Recording failures
  RECORDING_FAILED = 'RECORDING_FAILED',
  RECORDING_PROCESS_FAILED = 'RECORDING_PROCESS_FAILED',
  RECORDING_TIMEOUT = 'RECORDING_TIMEOUT',
  RECORDED_FILE_EMPTY = 'RECORDED_FILE_EMPTY',
  RECORDED_FILE_INVALID = 'RECORDED_FILE_INVALID',
  RECORDED_FILE_TOO_SHORT = 'RECORDED_FILE_TOO_SHORT',
  RECORDED_FILE_CORRUPT = 'RECORDED_FILE_CORRUPT',
  STORAGE_WRITE_FAILED = 'STORAGE_WRITE_FAILED',

  // Infrastructure unavailability (UNKNOWN state)
  FFMPEG_UNAVAILABLE = 'FFMPEG_UNAVAILABLE',
  FFPROBE_UNAVAILABLE = 'FFPROBE_UNAVAILABLE',
  VERIFICATION_INFRASTRUCTURE_UNAVAILABLE = 'VERIFICATION_INFRASTRUCTURE_UNAVAILABLE',
  TEMP_STORAGE_UNAVAILABLE = 'TEMP_STORAGE_UNAVAILABLE',
  VERIFIER_DISABLED = 'VERIFIER_DISABLED',

  // Internal errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  PROCESS_SPAWN_FAILED = 'PROCESS_SPAWN_FAILED',
  VERIFICATION_TIMEOUT_INTERNAL = 'VERIFICATION_TIMEOUT_INTERNAL',
}

/**
 * Complete verification result with evidence
 */
export interface RecordingVerificationResult {
  /** Verification status */
  status: VerificationStatus;

  /** Stage where verification stopped */
  stage: VerificationStage;

  /** Human-readable reason (safe for operator display) */
  reason?: string;

  /** Machine-readable reason code */
  reasonCode?: RecordingVerificationReason;

  /** Live stream evidence (from ffprobe) */
  liveStream?: LiveStreamEvidence;

  /** Recording evidence (from sample recording) */
  recording?: RecordingEvidence;

  /** Technical evidence and diagnostics */
  evidence: VerificationEvidence;

  /** Timestamp when verification completed successfully */
  verifiedAt: Date | null;

  /** Warnings that don't prevent verification */
  warnings?: VerificationWarning[];
}

/**
 * Live stream metadata and characteristics
 */
export interface LiveStreamEvidence {
  /** Video codec (e.g., h264, h265, mjpeg) */
  codec?: string;

  /** Video width in pixels */
  width?: number;

  /** Video height in pixels */
  height?: number;

  /** Frames per second */
  fps?: number;

  /** Pixel format (e.g., yuv420p) */
  pixelFormat?: string;

  /** Bitrate in bits per second */
  bitrate?: number;

  /** Number of packets observed */
  packetCount?: number;

  /** Number of frames decoded */
  frameCount?: number;

  /** RTSP transport used (tcp/udp) */
  transport?: 'tcp' | 'udp';
}

/**
 * Recorded artifact evidence
 */
export interface RecordingEvidence {
  /** Path to recorded sample file */
  path?: string;

  /** File size in bytes */
  sizeBytes?: number;

  /** Recording duration in seconds */
  durationSeconds?: number;

  /** Number of video frames in recording */
  videoFrames?: number;

  /** Video codec in recorded file */
  codec?: string;

  /** Video width in recorded file */
  width?: number;

  /** Video height in recorded file */
  height?: number;

  /** FPS in recorded file */
  fps?: number;

  /** Container format */
  format?: string;
}

/**
 * Technical verification evidence and diagnostics
 */
export interface VerificationEvidence {
  /** Live probe duration in milliseconds */
  probeDurationMs?: number;

  /** Observation duration in milliseconds */
  observationDurationMs?: number;

  /** Recording duration in milliseconds */
  recordingDurationMs?: number;

  /** FFprobe exit code */
  ffprobeExitCode?: number;

  /** FFmpeg exit code */
  ffmpegExitCode?: number;

  /** Sanitized stderr excerpt (credentials removed) */
  stderrExcerpt?: string;

  /** Process that failed (if applicable) */
  failedProcess?: 'ffprobe' | 'ffmpeg';

  /** Whether stream URL was syntactically valid */
  uriValid?: boolean;

  /** RTSP transport attempted */
  transportAttempted?: string[];
}

/**
 * Non-fatal verification warnings
 */
export interface VerificationWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Verification policy configuration
 */
export interface RecordingVerificationPolicy {
  /** Probe timeout in milliseconds */
  probeTimeoutMs: number;

  /** How long to observe live stream (seconds) */
  observationSeconds: number;

  /** How long to record sample (seconds) */
  sampleSeconds: number;

  /** Minimum frames to observe in live stream */
  minObservedFrames: number;

  /** Minimum recording duration (seconds) */
  minRecordingDurationSeconds: number;

  /** Minimum frames in recorded file */
  minRecordingFrames: number;

  /** Minimum recording file size (bytes) */
  minRecordingBytes: number;

  /** Require decodable video (not just packets) */
  requireDecodableVideo: boolean;

  /** RTSP transports to try (in order) */
  transports: Array<'tcp' | 'udp'>;

  /** Maximum concurrent verifications */
  maxConcurrentVerifications: number;

  /** Retry policy for transient failures */
  retryPolicy: {
    enabled: boolean;
    maxAttempts: number;
    retryableReasons: RecordingVerificationReason[];
    backoffMs: number[];
  };
}

/**
 * Default verification policy
 */
export const DEFAULT_VERIFICATION_POLICY: RecordingVerificationPolicy = {
  probeTimeoutMs: 10_000,
  observationSeconds: 5,
  sampleSeconds: 8,
  minObservedFrames: 3,
  minRecordingDurationSeconds: 3,
  minRecordingFrames: 3,
  minRecordingBytes: 10_000,
  requireDecodableVideo: true,
  transports: ['tcp'],
  maxConcurrentVerifications: 4,
  retryPolicy: {
    enabled: true,
    maxAttempts: 3,
    retryableReasons: [
      RecordingVerificationReason.CONNECTION_TIMEOUT,
      RecordingVerificationReason.RECORDING_TIMEOUT,
      RecordingVerificationReason.RTSP_SERVER_ERROR,
    ],
    backoffMs: [2000, 5000, 10000],
  },
};

/**
 * URI validation result
 */
export interface UriValidationResult {
  valid: boolean;
  reason?: string;
  protocol?: string;
  hostname?: string;
  port?: number;
}

/**
 * Stream probe result (from ffprobe)
 */
export interface StreamProbeResult {
  success: boolean;
  exitCode: number | null;
  durationMs: number;
  streams: ProbeStream[];
  format?: ProbeFormat;
  stderr: string;
}

/**
 * FFprobe stream information
 */
export interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  has_b_frames?: number;
  pix_fmt?: string;
  level?: number;
  color_range?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  chroma_location?: string;
  refs?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  time_base?: string;
  start_pts?: number;
  start_time?: string;
  duration_ts?: number;
  duration?: string;
  bit_rate?: string;
  max_bit_rate?: string;
  bits_per_raw_sample?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  nb_read_packets?: string;
}

/**
 * FFprobe format information
 */
export interface ProbeFormat {
  filename?: string;
  nb_streams?: number;
  nb_programs?: number;
  format_name?: string;
  format_long_name?: string;
  start_time?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  probe_score?: number;
}

/**
 * Frame observation result
 */
export interface FrameObservationResult {
  success: boolean;
  framesObserved: number;
  packetsObserved: number;
  observationDurationMs: number;
  exitCode: number | null;
  stderr: string;
  avgFps?: number;
}

/**
 * Sample recording result
 */
export interface SampleRecordingResult {
  success: boolean;
  path: string;
  durationMs: number;
  exitCode: number | null;
  stderr: string;
  reason?: string;
}

/**
 * Recorded file inspection result
 */
export interface FileInspectionResult {
  valid: boolean;
  reason?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  frameCount?: number;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  format?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
}

/**
 * Media tooling capabilities
 */
export interface MediaToolingCapabilities {
  ffmpeg: {
    available: boolean;
    version?: string;
    path?: string;
  };
  ffprobe: {
    available: boolean;
    version?: string;
    path?: string;
  };
}

/**
 * Verification metrics for monitoring
 */
export interface VerificationMetrics {
  totalAttempts: number;
  verified: number;
  failed: number;
  unknown: number;
  avgDurationMs: number;
  failureReasons: Record<string, number>;
}
