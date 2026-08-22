import type { ArchiveRetentionEvidence } from "../monitoring/recorder-probe.js";
import type { EncryptedOutbox } from "../offline/encrypted-outbox.js";

export interface DiscoveredCameraPayload {
  edgeAgentId: string;
  discoveryMethod?: "onvif-ws-discovery" | "nvr-dvr-channel-discovery" | "edge-agent-reported-inventory";
  vendor: "hikvision" | "cp-plus" | "other";
  manufacturer?: string;
  model: string;
  ipAddress: string;
  macAddress?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  onvifEndpointReference?: string;
  onvifUuid?: string;
  certificateRef?: string;
  certificateFingerprint?: string;
  displayName?: string;
  statusReason?: string;
  credentialsRequired?: boolean;
  streamVerified?: boolean;
  rtspValidated?: boolean;
  compatibility?: string;
  duplicateStatus?: "unique" | "duplicate" | "review-required";
  compatibilityStatus?: "compatible" | "incompatible" | "review-required";
  hardwareId?: string;
  existingDeviceAssociation?: string;
  timeSynchronization?: "synchronized" | "drifted" | "unknown";
  onvifSupport?: boolean;
  onvifServices?: string[];
  onvifCapabilityTests?: Array<{ name: string; status: "pass" | "fail" | "unsupported" | "vendor-specific"; detail?: string }>;
  discoveryLayers?: Array<{
    layer: "network-discovery" | "onvif-discovery" | "onvif-authentication" |
      "get-capabilities" | "get-profiles" | "get-stream-uri" |
      "rtsp-verification" | "vendor-adapter" | "fingerprint";
    status: "passed" | "failed" | "fallback" | "skipped";
    detail: string;
  }>;
  onvifPort: number;
  rtspPort: number;
  profiles: Array<{
    name: string;
    codec: "H264" | "H265" | "MJPEG" | "unknown";
    width: number;
    height: number;
    role?: "main" | "sub" | "unknown";
    frameRate?: number;
    bitrateKbps?: number;
    preferredFor?: Array<"recording" | "live" | "analytics">;
  }>;
  capabilities: {
    ptz: boolean;
    audio: boolean;
    events: boolean;
    talkback?: {
      supported: boolean;
      transport: "onvif-rtsp-backchannel" | "vendor-adapter" | "none" | "unknown";
      codecs?: Array<"PCMA" | "PCMU" | "AAC" | "OPUS" | "unknown">;
      sampleRates?: number[];
      verifiedAt?: string;
      reason?: string;
    };
  };
  sourceType?: "ip-camera" | "analog-dvr-channel" | "nvr-channel";
  recorderId?: string;
  recorderChannel?: number;
  recorderSerialNumber?: string;
}

export interface EdgeScanJob {
  id: string;
  branchId: string;
  edgeAgentId: string;
  scope?: "branch" | "device";
  targetDiscoveryId?: string;
  targetIpAddress?: string;
  targetOnvifPort?: number;
  status: "running";
}

export interface TelemetryPayload {
  branchId: string;
  edgeAgentId: string;
  deviceType:
    | "branch" | "edge-agent" | "recorder" | "recorder-channel" | "archive" | "camera" | "disk" | "network" | "ups"
    | "switch" | "firewall" | "router" | "sdwan" | "generator" | "environment" | "sensor";
  deviceId: string;
  observedAt: string;
  source:
    | "onvif" | "cp-plus-adapter" | "rtsp" | "system" | "recording-engine"
    | "snmp" | "modbus" | "bacnet" | "mqtt" | "vendor-api";
  quality: "verified" | "estimated" | "unsupported" | "unavailable";
  idempotencyKey: string;
  metrics: Record<string, string | number | boolean | null>;
  reasonCodes: string[];
}

export interface AnalyticsFramePayload {
  cameraId: string;
  capturedAt: string;
  width: number;
  height: number;
  imageBase64: string;
  metadata?: Record<string, unknown>;
}

export interface MonitoringCamera {
  id: string;
  name: string;
  connectionSecretRef: string;
  profiles: Array<{
    name: string;
    codec: "H264" | "H265" | "MJPEG" | "unknown";
    width: number;
    height: number;
    role?: "main" | "sub" | "unknown";
    frameRate?: number;
    bitrateKbps?: number;
    preferredFor?: Array<"recording" | "live" | "analytics">;
  }>;
  sourceType?: "ip-camera" | "analog-dvr-channel" | "nvr-channel";
  recorderId?: string;
  recorderChannel?: number;
}

export interface ConsumedLiveSession {
  id: string;
  cameraId: string;
  cameraNodeId: string;
  userId: string;
  tenantId: string;
  connectionSecretRef: string;
  profiles: Array<{ name: string; codec: string; width: number; height: number }>;
  purpose?: "view" | "talk";
  vendor?: "hikvision" | "cp-plus" | "other";
  model?: string;
  protocol?: "onvif-t" | "onvif-s" | "rtsp" | "vendor-adapter";
  sourceType?: "ip-camera" | "analog-dvr-channel" | "nvr-channel";
  channel?: number;
  recorderChannel?: number;
  capabilities?: {
    ptz: boolean;
    audio: boolean;
    events: boolean;
    talkback?: {
      supported: boolean;
      transport: "onvif-rtsp-backchannel" | "vendor-adapter" | "none" | "unknown";
      codecs?: Array<"PCMA" | "PCMU" | "AAC" | "OPUS" | "unknown">;
      sampleRates?: number[];
      reason?: string;
    };
  };
}

export interface EdgeCommand {
  id: string;
  type: "rediscover" | "restart-media" | "restart-agent" | "probe-camera" | "recover-camera" | "probe-recorder" | "collect-logs" | "update-credentials" | "apply-update";
  payload: Record<string, unknown>;
}

export interface EdgeUpdateRelease {
  id: string;
  version: string;
  artifactUrl: string;
  sha256: string;
  notes: string;
  signature: string;
}

export interface DiscoveryBootstrap {
  credentials: Array<{ host?: string; username: string; password: string; updatedAt: string }>;
  vpnScanNetworks: string[];
  transport: "vpn" | "cloudflare-tunnel" | null;
}

export interface GatewayMediaBootstrap {
  enabled: true;
  managed: true;
  mode: "named";
  publicUrl: string;
  tunnelToken: string;
  status: "inactive" | "healthy" | "degraded" | "down" | "unknown";
}

export class GatewayClient {
  private edgeCredential?: string;

  constructor(
    private readonly baseUrl: string,
    private readonly developmentUserId: string | undefined,
    private readonly edgeBridgeSharedKey?: string,
    private readonly timeoutMs = 15_000,
    private readonly outbox?: EncryptedOutbox,
  ) {}

  useEdgeCredential(credential: string) { this.edgeCredential = credential; }

  async activate(activationCode: string, deviceUuid: string, version: string, commandPublicKey: string) {
    return this.request<{
      agentId: string; branchId: string; agentName: string; credential: string;
      updatePublicKey?: string; media?: GatewayMediaBootstrap;
    }>("/v1/edge-enrollment/activate", {
      method: "POST", body: JSON.stringify({ activationCode, deviceUuid, version, commandPublicKey }),
    }, true);
  }

  async getBootstrap(agentId: string) {
    return this.request<{ controlPlaneUrl: string; media?: GatewayMediaBootstrap }>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/bootstrap`,
      { method: "GET" },
    );
  }

  async getDiscoveryBootstrap(agentId: string) {
    return this.request<DiscoveryBootstrap>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/discovery-bootstrap`,
      { method: "GET" },
    );
  }

  async register(branchId: string, name: string, version: string) {
    return this.request<{ id: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/register`,
      { method: "POST", body: JSON.stringify({ name, version }) },
    );
  }

  async heartbeat(id: string, version: string, publicMediaUrl?: string) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(id)}/heartbeat`,
      {
        method: "POST",
        body: JSON.stringify({
          version,
          ...(publicMediaUrl ? { publicMediaUrl } : {}),
        }),
      },
    );
  }

  async listMonitoringCameras(agentId: string, version: string) {
    const response = await this.request<{ data: MonitoringCamera[] }>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/cameras/monitoring`,
      { method: "GET", headers: { "x-edge-agent-version": version } },
    );
    return response.data;
  }

  async submitTelemetry(agentId: string, payload: TelemetryPayload) {
    return this.requestOrQueue<{ accepted: boolean; duplicate: boolean; receivedAt: string }>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/telemetry`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async submitAnalyticsFrame(agentId: string, payload: AnalyticsFramePayload) {
    return this.request<{ accepted: boolean; eventsGenerated?: number; reason?: string }>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/analytics/frames`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async submitRecorderHdd(agentId: string, payload: {
    branchId: string; recorderId: string; observedAt: string;
    source: "onvif" | "cp-plus-adapter" | "system";
    quality: "verified" | "estimated" | "unsupported" | "unavailable";
    idempotencyKey: string; hddStatus: Array<Record<string, unknown>>;
  }) {
    return this.requestOrQueue(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/recorder-hdd`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async submitRecorderArchive(agentId: string, payload: {
    branchId: string; recorderId: string; observedAt: string;
    source: "onvif" | "cp-plus-adapter" | "system";
    quality: "verified" | "estimated" | "unsupported" | "unavailable";
    idempotencyKey: string; entries: ArchiveRetentionEvidence[];
  }) {
    return this.requestOrQueue(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/recorder-archive`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async submitDiscovery(branchId: string, payload: DiscoveredCameraPayload) {
    return this.request<{ id: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async claimScanJob(agentId: string, version: string) {
    return this.request<EdgeScanJob | undefined>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/scan-jobs/next`,
      { method: "GET", headers: { "x-edge-agent-version": version } },
    );
  }

  async completeScanJob(
    agentId: string,
    jobId: string,
    result: { status: "completed" | "failed"; resultCount: number; error?: string },
  ) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/scan-jobs/${encodeURIComponent(jobId)}/complete`,
      { method: "POST", body: JSON.stringify(result) },
    );
  }

  async consumeLiveSession(agentId: string, token: string) {
    return this.request<ConsumedLiveSession>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/live-sessions/consume`,
      { method: "POST", body: JSON.stringify({ token }) },
    );
  }

  async completeTalkSession(agentId: string, sessionId: string, payload: {
    cameraId: string;
    userId: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    outcome: "success" | "failure";
    adapter: string;
    codec?: string;
    bytesSent?: number;
    error?: string;
  }) {
    return this.requestOrQueue<{ accepted: boolean }>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/talk-sessions/${encodeURIComponent(sessionId)}/complete`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  async claimCommand(agentId: string) {
    return this.request<EdgeCommand | null>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/commands/next`,
      { method: "GET" },
    );
  }

  async completeCommand(
    agentId: string,
    commandId: string,
    result: { status: "succeeded" | "failed"; result?: Record<string, unknown>; error?: string },
  ) {
    return this.requestOrQueue(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/commands/${encodeURIComponent(commandId)}/complete`,
      { method: "POST", body: JSON.stringify(result) },
    );
  }

  async getUpdate(agentId: string, version: string) {
    return this.request<EdgeUpdateRelease | null>(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/updates/next?version=${encodeURIComponent(version)}`,
      { method: "GET" },
    );
  }

  async flushOutbox() {
    if (!this.outbox) return { delivered: 0, pending: 0 };
    return this.outbox.flush(async (queued) => {
      await this.request(queued.path, {
        method: queued.method, body: queued.body,
        ...(queued.headers ? { headers: queued.headers } : {}),
      });
    });
  }

  private async requestOrQueue<T>(path: string, init: RequestInit): Promise<T> {
    try { return await this.request<T>(path, init); }
    catch (error) {
      if (!this.outbox || (error instanceof GatewayRequestError && error.status < 500)) throw error;
      const pending = await this.outbox.enqueue({
        path, method: "POST", body: String(init.body ?? ""),
        ...(init.headers ? { headers: init.headers as Record<string, string> } : {}),
      });
      return { accepted: true, duplicate: false, queued: true, pending } as T;
    }
  }

  private async request<T = unknown>(path: string, init: RequestInit, skipAuth = false): Promise<T> {
    const url = controlPlaneEndpoint(this.baseUrl, path);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          "content-type": "application/json",
          ...(this.developmentUserId ? { "x-user-id": this.developmentUserId } : {}),
          ...(!skipAuth && this.edgeCredential ? { "x-edge-agent-token": this.edgeCredential } : {}),
          ...(!skipAuth && !this.edgeCredential && this.edgeBridgeSharedKey ? { "x-edge-bridge-key": this.edgeBridgeSharedKey } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new Error(`Cannot reach control plane ${url.origin}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const text = await response.text();
    let body: T | { error?: string } | string | undefined;
    try { body = text ? JSON.parse(text) as T | { error?: string } : undefined; }
    catch { body = text.slice(0, 1_000); }
    if (!response.ok) {
      throw new GatewayRequestError(response.status, `Control plane ${response.status}: ${JSON.stringify(body)}`);
    }
    return body as T;
  }
}

function controlPlaneEndpoint(baseUrl: string, path: string) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  const requestPath = path.replace(/^\/+/, "");
  url.pathname = `${basePath}/${requestPath}`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url;
}

export class GatewayRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
