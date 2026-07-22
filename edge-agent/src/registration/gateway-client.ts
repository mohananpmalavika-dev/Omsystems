export interface DiscoveredCameraPayload {
  edgeAgentId: string;
  vendor: "hikvision" | "cp-plus" | "other";
  manufacturer?: string;
  model: string;
  ipAddress: string;
  serialNumber?: string;
  firmwareVersion?: string;
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
