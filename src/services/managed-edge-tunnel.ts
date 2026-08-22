import type { ControlPlaneStore } from "../control-plane-store.js";
import type { EdgeManagedTunnel } from "../domain/models.js";
import type { ManagedEdgeTunnelProvider } from "../platform/managed-edge-tunnel.js";

export async function ensureManagedEdgeTunnel(
  store: ControlPlaneStore,
  tunnelProvider: ManagedEdgeTunnelProvider,
  branch: { id: string; tenantId: string; name: string },
): Promise<EdgeManagedTunnel> {
  const current = await store.getEdgeManagedTunnel(branch.id);
  if (current && current.status !== "revoked") return current;

  const provisioned = await tunnelProvider.provision({
    branchId: branch.id,
    branchName: branch.name,
  });
  return store.upsertEdgeManagedTunnel({
    tenantId: branch.tenantId,
    branchId: branch.id,
    provider: provisioned.provider,
    providerTunnelId: provisioned.providerTunnelId,
    hostname: provisioned.hostname,
    status: provisioned.status,
  });
}

export async function managedGatewayMediaBootstrap(
  store: ControlPlaneStore,
  tunnelProvider: ManagedEdgeTunnelProvider | undefined,
  branchId: string,
) {
  const tunnel = await store.getEdgeManagedTunnel(branchId);
  if (!tunnel || tunnel.status === "revoked" || !tunnelProvider) return undefined;

  const [token, status] = await Promise.all([
    tunnelProvider.getToken(tunnel.providerTunnelId),
    tunnelProvider.getStatus(tunnel.providerTunnelId).catch(() => "unknown" as const),
  ]);
  await store.updateEdgeManagedTunnelStatus(branchId, status);
  return {
    enabled: true as const,
    managed: true as const,
    mode: "named" as const,
    publicUrl: `https://${tunnel.hostname}`,
    tunnelToken: token,
    status,
  };
}
