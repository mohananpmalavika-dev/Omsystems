/**
 * Production Data Model for Recorder Fingerprinting, Capability Discovery, and Device Profiles
 */

export type SupportState =
  | "SUPPORTED"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "UNKNOWN";

export type ApiFamily =
  | "ONVIF"
  | "DAHUA_CGI"
  | "HIKVISION_ISAPI"
  | "RTSP"
  | "PROPRIETARY";

export type IdentitySource =
  | "ONVIF"
  | "DAHUA_CGI"
  | "ISAPI"
  | "HTTP"
  | "CONFIG"
  | "RTSP"
  | "PROPRIETARY";

export interface CapabilityEvidence {
  source: ApiFamily | "HTTP";
  probe: string;
  state: SupportState;
  confidence: number; // 0.0 - 1.0
  observedAt: string;
  latencyMs?: number | undefined;
  statusCode?: number | undefined;
  reason?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RecorderCapability {
  state: SupportState;
  confidence: number;
  preferredApi?: ApiFamily | undefined;
  evidence: CapabilityEvidence[];
}

export interface RecorderCapabilities {
  deviceInfo: RecorderCapability;
  channels: RecorderCapability;
  liveStream: RecorderCapability;
  recordingStatus: RecorderCapability;
  playbackSearch: RecorderCapability;
  storageStatus: RecorderCapability;
  smartTelemetry: RecorderCapability;
  deviceTime: RecorderCapability;
  events: RecorderCapability;
  ptz: RecorderCapability;
}

export interface RecorderFingerprint {
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber?: string | undefined;

  detectedApiFamilies: {
    onvif: boolean;
    dahuaCgi: boolean;
    hikvisionIsapi: boolean;
    proprietary: boolean;
    rtsp?: boolean | undefined;
  };

  capabilities: RecorderCapabilities;
  confidence: number;
}

export interface IdentityEvidence {
  source: IdentitySource;
  manufacturer?: string | undefined;
  model?: string | undefined;
  firmwareVersion?: string | undefined;
  serialNumber?: string | undefined;
  confidence: number;
  observedAt?: string | undefined;
}

export interface ApiFamilyEvidence {
  family: ApiFamily;
  probeId: string;
  confirmed: boolean;
  confidence: number;
  statusCode?: number | undefined;
  realm?: string | undefined;
  serverHeader?: string | undefined;
  observedAt: string;
}

export type FingerprintReason =
  | "NEW_DEVICE"
  | "SCHEDULED"
  | "FIRMWARE_CHANGE"
  | "FAILURE_DRIFT"
  | "MANUAL";

export interface RecorderDeviceProfile {
  profileVersion: number;
  recorderId: string;
  tenantId: string;
  branchId: string;

  configuredVendor?: string | undefined; // user/admin input only
  fingerprint: RecorderFingerprint;

  identityEvidence: IdentityEvidence[];
  apiEvidence: ApiFamilyEvidence[];

  preferredApiOrder: ApiFamily[];
  credentialRef: string; // secret reference, never plaintext password

  firstSeenAt: string;
  lastFingerprintedAt: string;
  nextFingerprintAt: string;
  fingerprintReason: FingerprintReason;

  signature: string; // stable hash of identity + supported APIs + firmware
}

export interface ProbeContext {
  recorderId: string;
  tenantId?: string | undefined;
  branchId?: string | undefined;
  host: string;
  port: number;
  httpPorts: number[];
  rtspPort?: number | undefined;
  secure?: boolean | undefined;
  username?: string | undefined;
  password?: string | undefined;
  credentialRef: string;
  configuredVendor?: string | undefined;
  requestTimeoutMs: number;
  maxRequests: number;
  abortSignal: AbortSignal;
}

export interface ProbeEvidence {
  apiFamily: ApiFamily | "HTTP";
  probeId: string;
  outcome: "MATCH" | "NO_MATCH" | "AUTH_REQUIRED" | "INCONCLUSIVE" | "ERROR";
  confidence: number;
  identity?: Partial<{
    manufacturer: string | undefined;
    model: string | undefined;
    firmwareVersion: string | undefined;
    serialNumber: string | undefined;
  }> | undefined;
  capabilities?: Partial<Record<keyof RecorderCapabilities, SupportState>> | undefined;
  preferredApiFor?: Array<keyof RecorderCapabilities> | undefined;
  metadata?: Record<string, unknown> | undefined;
  latencyMs?: number | undefined;
  statusCode?: number | undefined;
  reason?: string | undefined;
  observedAt: string;
}

export interface RecorderProbe {
  readonly id: string;
  readonly cost: number;
  readonly apiFamily: ApiFamily | "HTTP";
  run(ctx: ProbeContext): Promise<ProbeEvidence>;
}

export type RecorderOperation =
  | "GET_DEVICE_INFO"
  | "LIST_CHANNELS"
  | "GET_STREAM_URI"
  | "GET_RECORDING_STATUS"
  | "SEARCH_RECORDINGS"
  | "GET_STORAGE"
  | "GET_DEVICE_TIME"
  | "GET_PTZ"
  | "GET_EVENTS";

export interface AdapterFailure {
  family: ApiFamily;
  operation: RecorderOperation;
  error: string;
  statusCode?: number | undefined;
  retryWithAnotherFamily: boolean;
  isAuthFailure: boolean;
}

export interface CompatibilityCatalogEntry {
  manufacturer: string;
  model: string;
  firmwareRange: string;
  observedCount: number;
  likelyApis: { family: ApiFamily; probability: number }[];
  likelyCapabilities: Partial<Record<keyof RecorderCapabilities, number>>;
  lastObservedAt: string;
}
