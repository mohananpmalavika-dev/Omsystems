import type { ArchiveRetentionEvidence } from "../monitoring/recorder-probe.js";

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
  deviceType: "branch" | "edge-agent" | "recorder" | "camera" | "disk" | "network" | "ups";
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

export class GatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly developmentUserId: string,
    private readonly edgeBridgeSharedKey?: string,
  ) {}

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
    return this.request<{ accepted: boolean; duplicate: boolean; receivedAt: string }>(
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
    return this.request(
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
    return this.request(
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

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-user-id": this.developmentUserId,
        ...(this.edgeBridgeSharedKey
          ? { "x-edge-bridge-key": this.edgeBridgeSharedKey }
          : {}),
        ...init.headers,
      },
    });
    const text = await response.text();
    const body = (text ? JSON.parse(text) : undefined) as T | { error?: string };
    if (!response.ok) {
      throw new Error(`Control plane ${response.status}: ${JSON.stringify(body)}`);
    }
    return body as T;
  }
}
