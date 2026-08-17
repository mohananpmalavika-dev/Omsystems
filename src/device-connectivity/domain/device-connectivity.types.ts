/**
 * Enterprise Device Connectivity & Capability Registry Domain Types
 * (Full DeviceAdapter contract, Progressive Fingerprinting, Connection State Machine, 8-Factor Stream Verification, Error Taxonomy)
 */

export type ConnectionState =
  | "UNKNOWN"
  | "DISCOVERED"
  | "PROBING"
  | "IDENTIFIED"
  | "AUTHENTICATING"
  | "CONNECTED"
  | "VERIFYING"
  | "HEALTHY"
  | "AUTH_FAILED"
  | "UNREACHABLE"
  | "PARTIALLY_AVAILABLE"
  | "DEGRADED"
  | "INCOMPATIBLE"
  | "LOCKED_OUT";

export type FailureCategory =
  | "network"
  | "authentication"
  | "protocol"
  | "device"
  | "media"
  | "configuration";

export interface ConnectivityFailure {
  category: FailureCategory;
  code: string;
  retryable: boolean;
  operatorActionRequired: boolean;
  vendorCode?: string;
  message: string;
  occurredAt: string;
}

export interface DeviceTarget {
  host: string;
  port?: number;
  protocol?: string;
  branchId?: string;
  expectedManufacturer?: string;
}

export interface DeviceCredential {
  credentialRef: string;
  username?: string;
  password?: string;
}

export interface DeviceSession {
  deviceId: string;
  adapterType: string;
  adapterVersion: string;
  endpoint: {
    host: string;
    port: number;
    protocol: string;
  };
  credentialRef: string;
  authenticatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceIdentity {
  manufacturer: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  hardwareRevision?: string;
  macAddress?: string;
}

export interface ProbeResult {
  matched: boolean;
  confidence: number; // 0.0 - 1.0
  manufacturer?: string;
  model?: string;
  firmware?: string;
  protocols: string[];
  evidence: Array<{ check: string; result: string; weight: number }>;
}

export interface AuthResult {
  success: boolean;
  session?: DeviceSession;
  error?: ConnectivityFailure;
}

export interface StreamProfile {
  id: string; // "main", "sub", "mobile"
  channelId: string;
  role: "main" | "sub" | "mobile" | "custom";
  codec: "h264" | "h265" | "mjpeg" | "unknown";
  resolution: { width: number; height: number };
  fps: number;
  bitrateKbps: number;
  audioCodec?: string;
  verified: boolean;
}

export interface ChannelCapability {
  channelId: string;
  name: string;
  streamProfiles: StreamProfile[];
  ptzSupported: boolean;
  audioSupported: boolean;
  status: "STREAMING" | "VIDEO_LOSS" | "AUTH_ERROR" | "OFFLINE";
}

export interface DeviceCapabilities {
  channelCount: number;
  channels: ChannelCapability[];
  live: {
    supported: boolean;
    transports: Array<"rtsp" | "rtsps">;
  };
  recording: {
    supported: boolean;
    nativePlayback: boolean;
  };
  storage: {
    supported: boolean;
    healthAvailable: boolean;
  };
  ptz: {
    supported: boolean;
  };
  audio: {
    input: boolean;
    output: boolean;
  };
  snapshot: {
    supported: boolean;
  };
  events: {
    supported: boolean;
    mechanisms: Array<"onvif-pullpoint" | "webhook" | "long-poll" | "vendor-api">;
  };
  clock: {
    readable: boolean;
    writable: boolean;
    ntpConfigurable: boolean;
  };
}

export interface MediaSource {
  protocol: "rtsp" | "rtsps";
  uri: string;
  transport: "tcp" | "udp" | "auto";
  codec: "h264" | "h265" | "mjpeg";
  authRef: string;
  deviceTimestamp?: string;
}

export interface EightFactorStreamVerification {
  dnsIpResolved: boolean;
  tcpConnected: boolean;
  rtspOptionsDescribeOk: boolean;
  authValidated: boolean;
  sdpParsed: boolean;
  setupPlayOk: boolean;
  rtpPacketsReceived: boolean;
  videoKeyframeDecoded: boolean;
  overallHealthy: boolean;
  verificationLatencyMs: number;
}

export interface ConnectivityScoreBreakdown {
  network: number; // /20
  authentication: number; // /20
  videoStream: number; // /30
  events: number; // /10
  storageApi: number; // /10
  clock: number; // /10
  totalScore: number; // /100
  grade: "A_EXCELLENT" | "B_GOOD" | "C_DEGRADED" | "F_CRITICAL";
}

export interface ModelCertificationResult {
  manufacturer: string;
  model: string;
  firmwareTested: string;
  adapterUsed: string;
  certificationStatus: "CERTIFIED" | "PARTIAL" | "FAILED";
  testMatrix: {
    probe: boolean;
    authentication: boolean;
    channelDiscovery: boolean;
    mainStream: boolean;
    subStream: boolean;
    snapshot: boolean;
    playback: boolean;
    recordingStatus: boolean;
    storageHealth: boolean;
    clockSync: boolean;
    events: boolean;
  };
  quirksRequired: string[];
  testedAt: string;
}
