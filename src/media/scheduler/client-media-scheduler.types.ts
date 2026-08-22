/**
 * Authoritative Client Media Scheduler Domain Types & Contracts
 * 
 * Provides end-to-end data contracts for client hardware capability profiling,
 * empirical decode session benchmarks, and dynamic stream resolution/bitrate/FPS calculations.
 */

export type HardwareDecoderEngine =
  | "NVDEC"          // NVIDIA GPU Dedicated Video Decoder
  | "QUICKSYNC"      // Intel Quick Sync Video
  | "VAAPI"          // Linux Video Acceleration API / AMD / Intel
  | "VIDEOTOOLBOX"   // Apple Silicon / Metal Hardware Acceleration
  | "D3D11VA"        // Microsoft Direct3D 11 Video Acceleration
  | "SOFTWARE"       // CPU software decoder fallback (dav1d, libvpx, openh264)
  | "UNKNOWN";

export type SupportedVideoCodec = "H264" | "H265" | "AV1" | "VP9" | "VP8" | "MJPEG";

export type StreamQualityTier =
  | "MAINSTREAM_4K"       // 3840x2160 @ 30fps (~8000-12000 kbps)
  | "MAINSTREAM_1080P"    // 1920x1080 @ 25-30fps (~2500-4000 kbps)
  | "MEDIUM_720P"         // 1280x720  @ 20fps    (~1000-1600 kbps)
  | "SUBSTREAM_360P"      // 640x360   @ 15fps    (~350-600 kbps)
  | "LOW_SUBSTREAM_240P"  // 426x240   @ 10fps    (~150-250 kbps)
  | "KEYFRAME_180P"       // 320x180   @ 1-3fps   (~30-60 kbps)
  | "PAUSED";             // 0x0       @ 0fps     (0 kbps - off-screen)

export type StreamTransport = "WEBRTC" | "HLS" | "ANIMATED_KEYFRAME" | "WEBSOCKET_RAW";

export type PlaybackMode =
  | "LIVE_DECODE"         // Full continuous video decode via hardware/software decoder slot
  | "LOW_FPS_KEYFRAME"    // Synchronized low-rate keyframe stream (1-3 fps, 0 hardware decoder slots)
  | "STATIC_SNAPSHOT"     // Periodic on-demand image fetch (e.g. every 5-10 seconds)
  | "PAUSED";             // Stream suspended (camera scrolled out of view)

export type DecoderSlotType = "HARDWARE" | "SOFTWARE" | "NONE";

export interface CodecCapability {
  codec: SupportedVideoCodec;
  mimeType: string;
  isHardwareAccelerated: boolean;
  maxSupportedResolution: { width: number; height: number };
  maxFps: number;
}

/**
 * Measured hardware profile captured directly on the client machine
 */
export interface ClientHardwareProfile {
  fingerprint: string;
  gpuModel: string;
  rendererString: string;
  hardwareDecoder: HardwareDecoderEngine;
  supportedCodecs: CodecCapability[];
  preferredCodec: SupportedVideoCodec;
  
  // Empirical Benchmark Measurements (Measured, not guessed)
  measuredMaxDecodeSessions: number;
  benchmarkAverageLatencyMs: number;
  benchmarkDroppedFramePct: number;
  benchmarkTimestamp: string;
  
  // CPU & Memory Hardware Specifications
  cpuCores: number;
  memoryGb: number;
  
  // Network Baseline Measurement
  measuredDownlinkMbps: number;
  measuredRttMs: number;
  measuredPacketLossPct: number;
}

/**
 * Real-time dynamic telemetry reported by the client during active playback
 */
export interface ClientLiveTelemetry {
  sessionId: string;
  clientTimestamp: number;
  
  // CPU & Event Loop Real-Time Metrics
  cpuUsagePct: number;
  eventLoopLagMs: number;
  
  // Memory Real-Time Metrics
  heapUsedMb?: number;
  heapLimitMb?: number;
  memoryPressure: "normal" | "moderate" | "critical";
  
  // Network Real-Time Metrics
  currentDownlinkMbps: number;
  currentRttMs: number;
  currentPacketLossPct: number;
  
  // Playback Health Metrics
  activeDecodedStreams: number;
  totalRenderedFps: number;
  droppedFramesPerSec: number;
  decodeLatencyP95Ms: number;
}

export interface TileViewportDimension {
  cameraId: string;
  widthPx: number;
  heightPx: number;
  tileIndex: number;
  isIntersecting: boolean;
}

export interface ViewportGridContext {
  sessionId: string;
  gridRows: number;
  gridCols: number;
  totalTiles: number;
  
  // Specific camera layout & geometry
  tiles: TileViewportDimension[];
  visibleCameraIds: string[];
  
  // Operator focal interactions & alert states
  focusedCameraId?: string;
  hoveredCameraId?: string;
  activeAlarmCameraIds: string[];
  p1IncidentCameraIds?: string[];
}

export interface ScheduledCameraDecision {
  cameraId: string;
  streamTier: StreamQualityTier;
  targetResolution: {
    width: number;
    height: number;
  };
  targetFps: number;
  targetBitrateKbps: number;
  codec: SupportedVideoCodec;
  transport: StreamTransport;
  playbackMode: PlaybackMode;
  decoderSlotType: DecoderSlotType;
  priorityScore: number;
  tileIndex: number;
  audioEnabled: boolean;
  reason: string;
  bandwidthSavedPct: number; // Percentage saved against unoptimized 1080p stream
}

export interface ClientMediaScheduleResult {
  sessionId: string;
  scheduledAt: string;
  
  // Overall Schedule Matrix
  schedules: Record<string, ScheduledCameraDecision>;
  
  // Aggregate Metrics & Budgets
  totalCameras: number;
  activeLiveDecodes: number;
  activeKeyframeStreams: number;
  pausedStreams: number;
  
  // Decoder Budget Consumption
  hardwareDecodersUsed: number;
  hardwareDecodersLimit: number;
  softwareDecodersUsed: number;
  softwareDecodersLimit: number;
  
  // Bandwidth Budget Consumption
  totalAllocatedBandwidthKbps: number;
  measuredDownlinkBandwidthKbps: number;
  bandwidthHeadroomPct: number;
  totalBandwidthSavedPct: number;
  
  // System Health & Diagnostics
  systemHealthStatus: "OPTIMAL" | "THROTTLED" | "CONGESTED" | "CRITICAL_OVERLOAD";
  diagnostics: {
    gpuModel: string;
    hardwareDecoderEngine: HardwareDecoderEngine;
    measuredMaxSessions: number;
    limitingFactor: "DECODER_SESSIONS" | "BANDWIDTH" | "CPU_EVENT_LOOP" | "VIEWPORT_GEOMETRY" | "NONE";
    adaptationActionApplied?: string;
  };
}

export interface HardwarePresetBaseline {
  tierName: string;
  deviceExamples: string[];
  hardwareDecoder: HardwareDecoderEngine;
  measuredMaxDecodeSessions: number;
  recommendedMaxGrid: string;
  maxAggregateBitrateMbps: number;
}
