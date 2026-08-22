/**
 * Branch Command Center Component Domain Types
 */

export interface BranchOperationalState {
  branchId: string;
  branchCode: string;
  branchName: string;
  overallStatus: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
  internet: {
    status: "ONLINE" | "DEGRADED" | "FAILOVER" | "OFFLINE" | "UNKNOWN";
    latencyMs?: number;
    packetLossPercent?: number;
    activeWan?: string;
    lastSeenAt?: string;
  };
  gateway: {
    status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";
    lastHeartbeatAt?: string;
    version?: string;
  };
  recorder: {
    total: number;
    online: number;
    offline: number;
    status: "ONLINE" | "WARNING" | "OFFLINE" | "UNKNOWN";
  };
  cameras: {
    total: number;
    online: number;
    offline: number;
    recording: number;
    notRecording: number;
    unknown: number;
  };
  storage: {
    status: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
    totalBytes?: number;
    freeBytes?: number;
    disksHealthy: number;
    disksWarning: number;
    disksFailed: number;
  };
  retention: {
    requiredDays: number;
    actualDays?: number;
    status: "COMPLIANT" | "WARNING" | "VIOLATION" | "UNKNOWN";
    oldestRecordingAt?: string;
    newestRecordingAt?: string;
    coveragePercent?: number;
    missingIntervals?: number;
  };
  lastHealthPollAt: string;
}

export interface BranchCameraOperationalState {
  cameraId: string;
  name: string;
  channelNumber: number;
  health: {
    connectivity: "ONLINE" | "OFFLINE" | "UNKNOWN";
    recording: "RECORDING" | "NOT_RECORDING" | "UNKNOWN";
    stream: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
    tamper?: "NORMAL" | "DETECTED" | "UNKNOWN";
    videoLoss?: "NORMAL" | "DETECTED" | "UNKNOWN";
  };
  streamProfiles?: {
    main?: any;
    sub?: any;
  };
  lastSeenAt?: string;
  ptzSupported?: boolean;
  retentionDays?: number;
  alertActive?: boolean;
  alertSeverity?: "INFO" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export type CameraFilter = "ALL" | "LIVE" | "OFFLINE" | "NO_RECORD" | "ALERTING" | "PINNED";

export interface BranchAlert {
  id: string;
  cameraId?: string;
  cameraName?: string;
  severity: "P1" | "P2" | "P3" | "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  title: string;
  message: string;
  detectedAt: string;
  acknowledged: boolean;
}
