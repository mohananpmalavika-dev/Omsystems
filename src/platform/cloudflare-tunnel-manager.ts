import type {
  ManagedEdgeTunnelProvider,
  ManagedEdgeTunnelProvisioning,
  ManagedEdgeTunnelStatus,
} from "./managed-edge-tunnel.js";

type FetchLike = typeof fetch;
type ApiEnvelope<T> = { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> };

export interface CloudflareTunnelManagerOptions {
  accountId: string;
  zoneId: string;
  apiToken: string;
  mediaBaseDomain: string;
  originService?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export class CloudflareTunnelManager implements ManagedEdgeTunnelProvider {
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: CloudflareTunnelManagerOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.cloudflare.com/client/v4";
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async provision(input: { branchId: string; branchName: string }): Promise<ManagedEdgeTunnelProvisioning> {
    const suffix = input.branchId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
    const branchSlug = slug(input.branchName).slice(0, 42) || "branch";
    const tunnelName = `sentinel-${branchSlug}-${suffix}`;
    const hostname = `${branchSlug}-${suffix}.${this.options.mediaBaseDomain}`.toLowerCase();
    const created = await this.api<{ id?: string; status?: string }>(
      `/accounts/${encodeURIComponent(this.options.accountId)}/cfd_tunnel`,
      { method: "POST", body: JSON.stringify({ name: tunnelName, config_src: "cloudflare" }) },
    );
    if (!created.id) throw new Error("cloudflare_tunnel_id_missing");
    try {
      await this.api(
        `/accounts/${encodeURIComponent(this.options.accountId)}/cfd_tunnel/${encodeURIComponent(created.id)}/configurations`,
        {
          method: "PUT",
          body: JSON.stringify({
            config: {
              ingress: [
                { hostname, service: this.options.originService ?? "http://127.0.0.1:8090" },
                { service: "http_status:404" },
              ],
            },
          }),
        },
      );
      await this.api(
        `/zones/${encodeURIComponent(this.options.zoneId)}/dns_records`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "CNAME",
            name: hostname,
            content: `${created.id}.cfargotunnel.com`,
            proxied: true,
            ttl: 1,
            comment: `Sentinel Grid managed branch tunnel ${input.branchId}`,
          }),
        },
      );
      return {
        provider: "cloudflare",
        providerTunnelId: created.id,
        hostname,
        status: tunnelStatus(created.status),
      };
    } catch (error) {
      await this.deleteTunnel(created.id).catch(() => undefined);
      throw error;
    }
  }

  async getToken(providerTunnelId: string) {
    const token = await this.api<string>(
      `/accounts/${encodeURIComponent(this.options.accountId)}/cfd_tunnel/${encodeURIComponent(providerTunnelId)}/token`,
      { method: "GET" },
    );
    if (typeof token !== "string" || token.length < 20) throw new Error("cloudflare_tunnel_token_missing");
    return token;
  }

  async getStatus(providerTunnelId: string) {
    const tunnel = await this.api<{ status?: string }>(
      `/accounts/${encodeURIComponent(this.options.accountId)}/cfd_tunnel/${encodeURIComponent(providerTunnelId)}`,
      { method: "GET" },
    );
    return tunnelStatus(tunnel.status);
  }

  async revoke(providerTunnelId: string, hostname: string) {
    const records = await this.api<Array<{ id?: string }>>(
      `/zones/${encodeURIComponent(this.options.zoneId)}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
      { method: "GET" },
    );
    for (const record of records) {
      if (record.id) {
        await this.api(
          `/zones/${encodeURIComponent(this.options.zoneId)}/dns_records/${encodeURIComponent(record.id)}`,
          { method: "DELETE" },
        );
      }
    }
    await this.deleteTunnel(providerTunnelId);
  }

  private async deleteTunnel(providerTunnelId: string) {
    await this.api(
      `/accounts/${encodeURIComponent(this.options.accountId)}/cfd_tunnel/${encodeURIComponent(providerTunnelId)}`,
      { method: "DELETE" },
    );
  }

  private async api<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      const base = `${this.apiBaseUrl.replace(/\/$/, "")}/`;
      const response = await this.fetchImpl(new URL(path.replace(/^\//, ""), base), {
        ...init,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.options.apiToken}`,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      const envelope = await response.json().catch(() => ({})) as ApiEnvelope<T>;
      if (!response.ok || envelope.success === false || envelope.result === undefined) {
        const providerCode = envelope.errors?.[0]?.code;
        throw new Error(`cloudflare_api_failed:${response.status}${providerCode ? `:${providerCode}` : ""}`);
      }
      return envelope.result;
    } finally {
      clearTimeout(timer);
    }
  }
}

function slug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function tunnelStatus(value: string | undefined): ManagedEdgeTunnelStatus {
  return value === "inactive" || value === "healthy" || value === "degraded" || value === "down"
    ? value
    : "unknown";
}
