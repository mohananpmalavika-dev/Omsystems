export type ManagedEdgeTunnelStatus = "inactive" | "healthy" | "degraded" | "down" | "unknown";

export interface ManagedEdgeTunnelProvisioning {
  provider: "cloudflare";
  providerTunnelId: string;
  hostname: string;
  status: ManagedEdgeTunnelStatus;
}

export interface ManagedEdgeTunnelProvider {
  provision(input: { branchId: string; branchName: string }): Promise<ManagedEdgeTunnelProvisioning>;
  getToken(providerTunnelId: string): Promise<string>;
  getStatus(providerTunnelId: string): Promise<ManagedEdgeTunnelStatus>;
  revoke(providerTunnelId: string, hostname: string): Promise<void>;
}
