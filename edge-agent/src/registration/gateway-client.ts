export interface DiscoveredCameraPayload {
  edgeAgentId: string;
  vendor: "hikvision" | "cp-plus" | "other";
  model: string;
  ipAddress: string;
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

export class GatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly developmentUserId: string,
  ) {}

  async register(branchId: string, name: string, version: string) {
    return this.request<{ id: string }>(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/register`,
      { method: "POST", body: JSON.stringify({ name, version }) },
    );
  }

  async heartbeat(id: string, version: string) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(id)}/heartbeat`,
      { method: "POST", body: JSON.stringify({ version }) },
    );
  }

  async submitDiscovery(branchId: string, payload: DiscoveredCameraPayload) {
    return this.request(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-user-id": this.developmentUserId,
      },
    });
    const body = await response.json() as T | { error?: string };
    if (!response.ok) {
      throw new Error(`Control plane ${response.status}: ${JSON.stringify(body)}`);
    }
    return body as T;
  }
}
