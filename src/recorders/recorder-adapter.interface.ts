/**
 * Canonical Recorder Adapter Interface
 * 
 * Vendor-independent abstraction for querying NVR/DVR health, channels, streams,
 * playback, search, storage, time, and events.
 * 
 * Invariants:
 * - Never expose fake capabilities.
 * - Unsupported capabilities must return UNSUPPORTED or throw UnsupportedOperationError.
 * - Unverifiable status must return UNKNOWN, never healthy.
 */

export type FeatureSupportStatus = "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";

export type CompatibilityLevel =
  | "KV-C1"  // Live Video
  | "KV-C2"  // Recording
  | "KV-C3"  // Playback
  | "KV-C4"  // Snapshot
  | "KV-C5"  // PTZ
  | "KV-C6"  // Events
  | "KV-C7"  // Time/NTP
  | "KV-C8"  // Storage health
  | "KV-C9"  // Configuration
  | "KV-C10" // Firmware/security operations
  | "KV-C11" // Evidence extraction
  | "KV-C12"; // Failover/reconnect

export interface RecorderDeviceInfo {
  vendor: string;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  macAddress?: string;
  ipAddress: string;
  port: number;
  totalChannels: number;
}

export interface RecorderChannel {
  channelNumber: number;
  name: string;
  online: boolean;
  recording: boolean;
  streamUrl?: string;
  codec?: string;
  resolution?: string;
}

export interface RecordingSearchResult {
  channelNumber: number;
  startTime: Date;
  endTime: Date;
  fileSizeBytes?: number;
  storageDiskId?: string;
  mediaType?: "continuous" | "motion" | "alarm";
}

export interface PtzCommand {
  action: "pan" | "tilt" | "zoom" | "stop" | "preset";
  speed?: number;
  presetIndex?: number;
}

export interface DeviceTimeInfo {
  deviceTime: Date;
  timezone: string;
  ntpEnabled: boolean;
  ntpServer?: string;
  offsetSeconds: number;
}

export interface StorageStatusInfo {
  diskIndex: number;
  totalBytes: number;
  freeBytes: number;
  status: "NORMAL" | "FULL" | "ERROR" | "REBUILDING" | "UNKNOWN";
  smartStatus?: "PASS" | "WARN" | "FAIL";
}

export interface RecorderHealthInfo {
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  activeChannels: number;
  totalChannels: number;
  storageHealthy: boolean;
  networkLatencyMs?: number;
}

export interface RecorderEvent {
  eventId: string;
  eventType: string;
  channelNumber?: number;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export interface RecorderAdapter {
  readonly vendor: string;
  readonly model: string;

  discoverCapabilities(): Promise<Record<CompatibilityLevel, FeatureSupportStatus>>;
  getDeviceInfo(): Promise<RecorderDeviceInfo>;
  getChannels(): Promise<RecorderChannel[]>;
  getLiveStream(channelNumber: number): Promise<{ streamUrl: string }>;
  getPlaybackStream(channelNumber: number, startTime: Date, endTime: Date): Promise<{ streamUrl: string }>;
  searchRecording(channelNumber: number, startTime: Date, endTime: Date): Promise<RecordingSearchResult[]>;
  getSnapshot(channelNumber: number): Promise<Buffer>;
  ptz(channelNumber: number, command: PtzCommand): Promise<boolean>;
  getTime(): Promise<DeviceTimeInfo>;
  setTime(time: Date, timezone?: string): Promise<boolean>;
  getStorageStatus(): Promise<StorageStatusInfo[]>;
  getHealth(): Promise<RecorderHealthInfo>;
  getEvents(startTime?: Date): Promise<RecorderEvent[]>;
}
