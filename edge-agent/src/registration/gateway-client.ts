import type { ArchiveRetentionEvidence } from "../monitoring/recorder-probe.js";
import type { EncryptedOutbox } from "../offline/encrypted-outbox.js";

export interface DiscoveredCameraPayload {
  edgeAgentId: string;
  discoveryMethod?: "onvif-ws-discovery" | "edge-agent-reported-inventory";
  vendor: "hikvision" | "cp-plus" | "other";
  manufacturer?: string;
  model: string;
  ipAddress: string;
  serialNumber?: string;
  firmwareVersion?: string;
  displayName?: string;
  statusReason?: string;
  credentialsRequired?: boolean;
  streamVerified?: boolean;
  rtspValidated?: boolean;
  compatibility?: string;
  duplicateStatus?: "unique" | "duplicate" | "review-required";
  compatibilityStatus?: "compatible" | "incompatible" | "review-required";
  onvifSupport?: boolean;
  onvifServices?: string[];
  onvifCapabilityTests?: Array<{ name: string; status: "pass" | "fail" | "unsupported" | "vendor-specific"; detail?: string }>;
  onvifPort: number;
  rtspPort: number;
  profiles: Array<{
    name: string;
    codec: "H264" | "H265" | "MJPEG" | "unknown";
    width: number;
    height: number;
  }>;
  capabilities: { ptz: boolean; audio: boolean; events: boolean };
}

export interface EdgeScanJob {
  id: string;
  branchId: string;
  edgeAgentId: string;
  status: "running";
}

export interface TelemetryPayload {
  branchId: string;
  edgeAgentId: string;
  deviceType: "branch" | "edge-agent" | "recorder" | "recorder-channel" | "camera" | "disk" | "network" | "ups";
  deviceId: string;
  observedAt: string;
  source: "onvif" | "cp-plus-adapter" | "rtsp" | "system" | "recording-engine";
  quality: "verified" | "estimated" | "unsupported" | "unavailable";
  idempotencyKey: string;
  metrics: Record<string, string | number | boolean | null>;
  reasonCodes: string[];
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
  }>;
}

export interface ConsumedLiveSession {
  id: string;
  cameraId: string;
  cameraNodeId: string;
  userId: string;
  tenantId: string;
  connectionSecretRef: string;
  profiles: Array<{ name: string; codec: string; width: number; height: number }>;
}

export interface EdgeCommand {
  id: string;
  type: "rediscover" | "restart-media" | "restart-agent" | "probe-camera" | "probe-recorder" | "collect-logs" | "update-credentials" | "apply-update";
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
      agentId: string; branchId: string; agentName: string; credential: string; updatePublicKey?: string;
    }>("/v1/edge-enrollment/activate", {
      method: "POST", body: JSON.stringify({ activationCode, deviceUuid, version, commandPublicKey }),
    }, true);
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
    const url = new URL(path, this.baseUrl);
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

export class GatewayRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
