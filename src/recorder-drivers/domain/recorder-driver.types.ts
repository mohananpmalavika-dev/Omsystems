/**
 * Canonical Recorder Driver & Authoritative Evidence Domain Types
 */

export type RecorderVendor = "CP_PLUS" | "DAHUA" | "HIKVISION" | "ONVIF" | "GENERIC" | "UNKNOWN";

export type EvidenceSource =
  | "CP_PLUS_API"
  | "DAHUA_API"
  | "HIKVISION_API"
  | "ONVIF"
  | "RTSP"
  | "EDGE_AGENT"
  | "PING"
  | "DERIVED";

export type HealthState = "HEALTHY" | "UNHEALTHY" | "DEGRADED" | "WARNING" | "CRITICAL" | "OFFLINE" | "UNKNOWN" | "STALE" | "MAINTENANCE";

export interface Evidence<T = unknown> {
  state: HealthState;
  value?: T;
  source: EvidenceSource;
  observedAt: string;
  expiresAt: string;
  confidence?: number;
  reason?: string;
  errorCode?: string;
}

export interface RecorderDeviceInfo {
  vendor: RecorderVendor;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  channelCount: number;
  analogChannels?: number;
  ipChannels?: number;
}

export interface DeviceTimeInfo {
  recorderTime: string;
  centralTime: string;
  offsetSeconds: number;
  isNtpSynchronized?: boolean;
}

export interface RecorderChannelState {
  channelId: string;
  channelNumber: number;
  name: string;
  connected: boolean;
  signalLoss: boolean;
  streamUri?: string;
  recording: boolean;
  sourceType?: "ANALOG" | "IP";
}

export interface RecorderStorageEvidence {
  diskIndex: number;
  name?: string;
  serialNumber?: string;
  totalBytes: number;
  freeBytes: number;
  freePercent: number;
  status: "NORMAL" | "WARNING" | "CRITICAL" | "ERROR" | "UNKNOWN";
  smartSupported: boolean;
  temperatureCelsius?: number;
  reallocatedSectors?: number;
}

export interface RetentionEvidence {
  channelId: string;
  oldestRecordingAt?: string;
  newestRecordingAt?: string;
  retentionDaysObserved?: number;
  targetRetentionDays?: number;
  isCompliant: boolean;
  evidenceSource: string;
}

export interface RecorderHealthObservation {
  recorderId: string;
  branchId: string;
  vendor: RecorderVendor;
  model: string;
  firmwareVersion?: string;

  connectivity: Evidence<{
    reachable: boolean;
    latencyMs?: number;
  }>;

  channels: Evidence<{
    total: number;
    online: number;
    offline: number;
    channelDetails?: RecorderChannelState[];
  }>;

  disks: Evidence<RecorderStorageEvidence[]>;

  recording: Evidence<{
    expectedChannels: number;
    recordingChannels: number;
    isAllRecording: boolean;
  }>;

  retention: Evidence<{
    minimumDays: number;
    targetDays: number;
    isCompliant: boolean;
  }>;

  deviceTime: Evidence<DeviceTimeInfo>;

  observedAt: string;
  expiresAt: string;
}

export interface RecorderDriverConfig {
  recorderId: string;
  branchId: string;
  vendor: RecorderVendor;
  host: string;
  port: number;
  username?: string;
  passwordRef?: string;
  protocol?: "http" | "https" | "onvif" | "rtsp";
}

export interface RecorderDriver {
  readonly vendor: RecorderVendor;
  readonly config: RecorderDriverConfig;

  probeConnectivity(): Promise<Evidence<{ reachable: boolean; latencyMs: number }>>;
  getDeviceInfo(): Promise<Evidence<RecorderDeviceInfo>>;
  getDeviceTime(): Promise<Evidence<DeviceTimeInfo>>;
  getChannels(): Promise<Evidence<RecorderChannelState[]>>;
  getRecordingState(channelId?: string): Promise<Evidence<{ recording: boolean; recordingChannels: number; totalChannels: number }>>;
  getStorage(): Promise<Evidence<RecorderStorageEvidence[]>>;
  getRetentionEvidence(channelId?: string, targetDays?: number): Promise<Evidence<RetentionEvidence>>;
  buildAuthoritativeObservation(targetRetentionDays?: number): Promise<RecorderHealthObservation>;
}
