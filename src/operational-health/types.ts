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
  maxRecordingGapSeconds: number;
  cameraWarningPercent: number;
  cameraCriticalPercent: number;
  latencyWarningMs: number;
  latencyCriticalMs: number;
  packetLossWarningPercent: number;
  packetLossCriticalPercent: number;
}

export const defaultOperationalHealthPolicy: OperationalHealthPolicy = {
  staleAfterSeconds: 90,
  offlineAfterSeconds: 300,
  retentionDays: 90,
  maxRecordingGapSeconds: 120,
  cameraWarningPercent: 5,
  cameraCriticalPercent: 10,
  latencyWarningMs: 150,
  latencyCriticalMs: 300,
  packetLossWarningPercent: 2,
  packetLossCriticalPercent: 5,
};

