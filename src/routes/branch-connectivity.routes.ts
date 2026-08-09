import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { BranchConnectivityTransport } from "../domain/models.js";
import type { ManagedEdgeTunnelProvider } from "../platform/managed-edge-tunnel.js";
import { ensureManagedEdgeTunnel } from "../services/managed-edge-tunnel.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const transportSchema = z.enum(["vpn", "cloudflare-tunnel"]);
const profileSchema = z.object({
  primaryTransport: transportSchema,
  fallbackTransport: transportSchema.optional(),
  vpnProtocol: z.enum(["ipsec", "wireguard", "openvpn", "ssl-vpn"]).optional(),
  vpnRemoteNetworks: z.array(z.string().trim().min(1).max(43)).max(32).optional(),
}).superRefine((value, context) => {
  if (value.fallbackTransport === value.primaryTransport) {
    context.addIssue({ code: "custom", path: ["fallbackTransport"], message: "must differ from primaryTransport" });
  }
  const needsVpn = value.primaryTransport === "vpn" || value.fallbackTransport === "vpn";
  if (needsVpn && !value.vpnProtocol) {
    context.addIssue({ code: "custom", path: ["vpnProtocol"], message: "required when VPN is selected" });
  }
  if (needsVpn && (!value.vpnRemoteNetworks || value.vpnRemoteNetworks.length === 0)) {
    context.addIssue({ code: "custom", path: ["vpnRemoteNetworks"], message: "at least one private routed network is required" });
  }
  for (const [index, cidr] of (value.vpnRemoteNetworks ?? []).entries()) {
    if (!isPrivateIpv4Cidr(cidr)) {
      context.addIssue({
        code: "custom", path: ["vpnRemoteNetworks", index],
        message: "must be an RFC1918 IPv4 CIDR routed through the branch VPN",
      });
    }
  }
});

export async function registerBranchConnectivityRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  options: { tunnelProvider?: ManagedEdgeTunnelProvider } = {},
) {
  app.get("/v1/branches/:branchId/connectivity", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const [profile, managedTunnel] = await Promise.all([
      store.getBranchConnectivityProfile(branchId),
      store.getEdgeManagedTunnel(branchId),
    ]);
    return {
      profile: profile ?? null,
      managedTunnel: managedTunnel ? {
        provider: managedTunnel.provider,
        hostname: managedTunnel.hostname,
        status: managedTunnel.status,
      } : null,
      supported: {
        vpn: {
          protocols: ["ipsec", "wireguard", "openvpn", "ssl-vpn"],
          cameraTypes: ["ip-camera", "analog-dvr-channel", "nvr-channel"],
          requirements: ["router VPN route", "private DVR/camera address", "central stream secret reference"],
        },
        tunnel: {
          provider: "cloudflare",
          available: true,
          managedAvailable: Boolean(options.tunnelProvider),
          cameraTypes: ["ip-camera", "analog-dvr-channel", "nvr-channel"],
          requirements: ["enrolled Sentinel gateway running the connector", "outbound TCP or UDP port 7844"],
          productionRequirements: ["Cloudflare domain and API credentials configured in Sentinel Grid"],
        },
      },
    };
  });

  app.put("/v1/branches/:branchId/connectivity", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const body = profileSchema.parse(request.body);
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });
    const usesInternetTunnel = body.primaryTransport === "cloudflare-tunnel" || body.fallbackTransport === "cloudflare-tunnel";
    let managedTunnel = await store.getEdgeManagedTunnel(branchId);
    if (usesInternetTunnel && options.tunnelProvider) {
      try {
        managedTunnel = await ensureManagedEdgeTunnel(store, options.tunnelProvider, branch);
      } catch (error) {
        app.log.error({ err: error, branchId }, "Managed branch internet tunnel provisioning failed");
        return reply.code(502).send({
          error: "internet_tunnel_provisioning_failed",
          message: "Sentinel Grid could not create the secure branch internet tunnel. Check the Cloudflare credentials and DNS zone.",
        });
      }
    }
    const profile = await store.upsertBranchConnectivityProfile({
      branchId,
      tenantId: branch.tenantId,
      primaryTransport: body.primaryTransport,
      ...(body.fallbackTransport ? { fallbackTransport: body.fallbackTransport } : {}),
      ...(body.vpnProtocol ? { vpnProtocol: body.vpnProtocol } : {}),
      ...(body.vpnRemoteNetworks ? { vpnRemoteNetworks: body.vpnRemoteNetworks } : {}),
      status: "configured",
    });
    await writeAudit(request, store, branchId, "branch_connectivity.configured", {
      primaryTransport: profile.primaryTransport,
      fallbackTransport: profile.fallbackTransport,
      vpnProtocol: profile.vpnProtocol,
      remoteNetworkCount: profile.vpnRemoteNetworks?.length ?? 0,
      managedInternetHostname: managedTunnel?.hostname,
    });
    const restartCommands = usesInternetTunnel
      ? await Promise.all((await store.listEdgeAgentsByBranch(branchId))
          .filter((agent) => agent.credentialStatus !== "revoked")
          .map((agent) => store.createEdgeCommand({
            edgeAgentId: agent.id,
            type: "restart-media",
            payload: { reason: "managed_internet_enabled" },
            requestedBy: request.currentUser.id,
          })))
      : [];
    return reply.code(200).send({
      profile,
      managedTunnel: managedTunnel ? {
        provider: managedTunnel.provider,
        hostname: managedTunnel.hostname,
        publicUrl: `https://${managedTunnel.hostname}`,
        status: managedTunnel.status,
      } : null,
      internetMode: managedTunnel ? "managed" : usesInternetTunnel ? "temporary-test" : "disabled",
      scannerRefreshQueued: restartCommands.length,
      message: profile.primaryTransport === "vpn"
        ? "VPN selected. Register IP cameras or DVR channels with their private VPN-routable addresses."
        : managedTunnel
          ? "Stable secure internet access is provisioned. The branch scanner will receive the outbound tunnel automatically; no router port forwarding is required."
          : "Temporary secure internet access is enabled for testing. Repair the scanner to version 0.1.6; its endpoint refreshes automatically after each restart.",
    });
  });

  app.post("/v1/branches/:branchId/connectivity/status", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const { status } = z.object({ status: z.enum(["healthy", "degraded", "offline"]) }).parse(request.body);
    const profile = await store.updateBranchConnectivityStatus(branchId, status);
    if (!profile) return reply.code(404).send({ error: "connectivity_profile_not_found" });
    await writeAudit(request, store, branchId, "branch_connectivity.status_updated", { status });
    return profile;
  });
}

export function isPrivateIpv4Address(value: string) {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  return octets[0] === 10 || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

export function isPrivateIpv4Cidr(value: string) {
  const [ip, prefix, ...extra] = value.split("/");
  return extra.length === 0 && isPrivateIpv4Address(ip ?? "") &&
    /^\d+$/.test(prefix ?? "") && Number(prefix) >= 0 && Number(prefix) <= 32;
}

export function isAddressWithinAnyCidr(address: string, networks: string[]) {
  const target = ipv4ToNumber(address);
  if (target === undefined) return false;
  return networks.some((network) => {
    const [base, prefix] = network.split("/");
    const baseValue = ipv4ToNumber(base ?? "");
    const bits = Number(prefix);
    if (baseValue === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (target & mask) === (baseValue & mask);
  });
}

export function transportIsAllowed(
  requested: BranchConnectivityTransport,
  profile: { primaryTransport: BranchConnectivityTransport; fallbackTransport?: BranchConnectivityTransport },
) {
  return requested === profile.primaryTransport || requested === profile.fallbackTransport;
}

function ipv4ToNumber(value: string) {
  if (!isPrivateIpv4Address(value)) return undefined;
  return value.split(".").map(Number).reduce((result, item) => ((result << 8) | item) >>> 0, 0);
}

async function requireDeviceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchId: string,
) {
  const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
  if (decision?.allowed) return true;
  await reply.code(403).send({ error: "forbidden", reason: decision?.reason ?? "no_matching_grant" });
  return false;
}

async function writeAudit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  branchId: string,
  action: string,
  details: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser.tenantId,
    actorUserId: request.currentUser.id,
    action,
    resourceNodeId: branchId,
    outcome: "success",
    sourceIp: request.ip,
    details,
  });
}
