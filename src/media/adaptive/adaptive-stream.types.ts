/**
 * Adaptive Stream Profile & Multi-Grid Efficiency Domain Types
 * Supports up to 144-camera video walls with dynamic resolution downscaling,
 * hardware decoder slot governance, and instant on-focus maximization.
 */

export type QualityTier =
  | "MAINSTREAM"          // 1080p / 4K @ 25-30fps (~3000-6000 kbps)
  | "MEDIUM"              // 720p @ 20fps (~1200 kbps)
  | "SUBSTREAM"           // 360p / 480p @ 15fps (~400-600 kbps)
  | "LOW_SUBSTREAM"       // 240p @ 10fps (~150-250 kbps)
  | "ULTRA_LOW_THUMBNAIL" // 180p @ 2-5fps keyframes (~50-90 kbps)
  | "PAUSED";             // Off-screen / hidden (0 kbps)

export type GridDensity = 1 | 4 | 9 | 16 | 36 | 64 | 144;

export interface ViewportSize {
  widthPx: number;
  heightPx: number;
}

export interface ClientTelemetry {
  cpuUsagePct: number;
  memoryPressure: "normal" | "moderate" | "critical";
  hardwareDecoderSlots: number;
  activeHardwareDecoders: number;
  gpuUsagePct?: number;
}

export interface NetworkConditions {
  estimatedBandwidthKbps: number;
  rttMs: number;
  packetLossPct: number;
  effectiveType: "4g" | "3g" | "2g" | "slow-2g";
}

export interface OperatorFocus {
  isMaximized: boolean;
  isHovered: boolean;
  isFocused: boolean;
  isInActiveAlarm: boolean;
  priority: "P1" | "P2" | "P3" | "NORMAL";
}

export interface VisibilityState {
  isIntersecting: boolean;
  visibilityRatio: number;
}

export interface CameraStreamContext {
  cameraId: string;
  gridDensity: GridDensity;
  viewportSize: ViewportSize;
  clientTelemetry?: ClientTelemetry;
  networkConditions?: NetworkConditions;
  operatorFocus?: OperatorFocus;
  visibility?: VisibilityState;
}

export interface AdaptiveStreamDecision {
  cameraId: string;
  selectedTier: QualityTier;
  targetResolution: {
    width: number;
    height: number;
  };
  targetFps: number;
  targetBitrateKbps: number;
  codec: "H264" | "H265" | "MJPEG";
  transport: "WEBRTC" | "HLS" | "ANIMATED_KEYFRAME";
  audioEnabled: boolean;
  reason: string;
  bandwidthSavedPct: number; // Against unoptimized 1080p stream
}

export interface GridResolutionSummary {
  gridDensity: GridDensity;
  totalCameras: number;
  tierBreakdown: Record<QualityTier, number>;
  totalEstimatedBandwidthKbps: number;
  unoptimizedBandwidthKbps: number; // e.g. 144 * 3000 kbps = 432 Mbps
  totalBandwidthSavedPct: number;
  hardwareDecodersUsed: number;
  softwareDecodersUsed: number;
  estimatedClientCpuLoadPct: number;
}
