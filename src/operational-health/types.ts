export type HealthStatus = "healthy" | "warning" | "critical" | "unknown";
export type TelemetryDeviceType =
  | "branch"
  | "edge-agent"
  | "recorder"
  | "camera"
  | "disk"
  | "network"
  | "ups";
export type TelemetrySource = "onvif" | "cp-plus-adapter" | "rtsp" | "system" | "recording-engine";
export type TelemetryQuality = "verified" | "estimated" | "unsupported" | "unavailable";
export type TelemetryValue = string | number | boolean | null;

export interface OperationalTelemetryEnvelope {
  tenantId: string;
  branchId: string;
  edgeAgentId: string;
  deviceType: TelemetryDeviceType;
  deviceId: string;
  observedAt: string;
  receivedAt: string;
  source: TelemetrySource;
  quality: TelemetryQuality;
  idempotencyKey: string;
  metrics: Record<string, TelemetryValue>;
  reasonCodes: string[];
}

export type OperationalTelemetryInput = Omit<
  OperationalTelemetryEnvelope,
  "tenantId" | "receivedAt"
>;

export interface OperationalHealthPolicy {
  staleAfterSeconds: number;
  offlineAfterSeconds: number;
  retentionDays: number;
  retentionWarningDays: number;
  maxRecordingGapSeconds: number;
  cameraWarningPercent: number;
  cameraCriticalPercent: number;
  latencyWarningMs: number;
  latencyCriticalMs: number;
  jitterWarningMs: number;
  jitterCriticalMs: number;
  packetLossWarningPercent: number;
  packetLossCriticalPercent: number;
  bandwidthUtilizationWarningPercent: number;
  bandwidthUtilizationCriticalPercent: number;
}

export const defaultOperationalHealthPolicy: OperationalHealthPolicy = {
  staleAfterSeconds: 90,
  offlineAfterSeconds: 300,
  retentionDays: 90,
  retentionWarningDays: 7,
  maxRecordingGapSeconds: 120,
  cameraWarningPercent: 5,
  cameraCriticalPercent: 10,
  latencyWarningMs: 150,
  latencyCriticalMs: 300,
  jitterWarningMs: 30,
  jitterCriticalMs: 60,
  packetLossWarningPercent: 2,
  packetLossCriticalPercent: 5,
  bandwidthUtilizationWarningPercent: 80,
  bandwidthUtilizationCriticalPercent: 95,
};

export type VideoWallGridSize = "1x1" | "2x2" | "3x3" | "4x4" | "5x5" | "6x6" |
  "7x7" | "8x8" | "9x9" | "10x10" | "11x11" | "12x12";
export interface VideoWallLayout {
  id: string;
  tenantId: string;
  name: string;
  gridSize: VideoWallGridSize;
  cameraPositions: Array<{ position: number; cameraId: string; stream: "main" | "sub" }>;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
