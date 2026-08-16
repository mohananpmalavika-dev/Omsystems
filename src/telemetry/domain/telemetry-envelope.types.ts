/**
 * Canonical Branch Telemetry Envelope & Edge Protocol Contracts
 */

export interface InternetHealthSummary {
  state: "HEALTHY" | "DEGRADED" | "FAILOVER" | "OFFLINE";
  latencyMs: number;
  packetLossPct: number;
  mode: "PRIMARY" | "FAILOVER" | "OFFLINE";
  uploadMbps?: number | undefined;
}

export interface RecorderHealthSummary {
  recorderId: string;
  model: string;
  state: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE";
  reachable: boolean;
  recording: boolean;
  channelsTotal: number;
  channelsRecording: number;
  clockOffsetSeconds: number;
}

export interface CameraHealthSummary {
  cameraId: string;
  channelNumber: number;
  state: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE" | "UNKNOWN";
  reachable: boolean;
  streamAvailable: boolean;
  recording: boolean;
  fps?: number | undefined;
  bitrateKbps?: number | undefined;
  lastRecordedAt?: string | undefined;
}

export interface DiskHealthSummary {
  diskId: string;
  slotNumber: number;
  state: "HEALTHY" | "WARNING" | "FAILED";
  capacityBytes: number;
  freeBytes: number;
  smartStatus: "PASSED" | "WARNING" | "FAILED";
  temperatureC: number;
  retentionDays: number;
}

export interface EdgeAgentHealthSummary {
  version: string;
  uptimeSeconds: number;
  queueDepth: number;
  cpuPct?: number | undefined;
  memoryPct?: number | undefined;
  lastSuccessfulUploadAt?: string | undefined;
}

export interface BranchTelemetryEnvelope {
  schemaVersion: 1;
  messageId: string;
  tenantId: string;
  branchId: string;
  agentId: string;
  sequenceNumber: number;

  observedAt: string;
  sentAt: string;

  type: "FULL" | "DELTA";

  internet: InternetHealthSummary;
  recorders: RecorderHealthSummary[];
  cameras: CameraHealthSummary[];
  disks: DiskHealthSummary[];
  agent: EdgeAgentHealthSummary;
}

export interface DeviceHealthChangedEvent {
  eventType: "DEVICE_HEALTH_CHANGED";
  messageId: string;
  tenantId: string;
  branchId: string;
  agentId: string;
  deviceId: string;
  deviceType: "CAMERA" | "RECORDER" | "STORAGE" | "INTERNET" | "ROUTER";
  previousState: string;
  currentState: string;
  reason: string;
  observedAt: string;
}
