import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { readCameraPassword } from "../security/vault/camera-credential-codec.js";
import { edgeAgentServesBranch, edgeAgentBranchIds } from "../edge-agent/branch-assignments.js";

const params = z.object({ edgeAgentId: z.string().min(1) });

export async function registerEdgeDiscoveryBootstrapRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  pool?: Pool,
) {
  app.get("/v1/edge-agents/:edgeAgentId/discovery-bootstrap", async (request, reply) => {
    const { edgeAgentId } = params.parse(request.params);
    if (!request.edgeAgentAuthenticated || request.edgeAgentId !== edgeAgentId ||
        (!request.headers["x-edge-agent-token"] && !(request as any).clientCertFingerprint)) {
      return reply.code(401).send({ error: "invalid_gateway_identity" });
    }
    const agent = await store.getEdgeAgent(edgeAgentId);
    if (!agent) {
      return reply.code(404).send({ error: "edge_agent_not_found" });
    }
    const { branchId: requestedBranchId } = z.object({ branchId: z.string().min(1).optional() }).parse(request.query);
    const branchId = requestedBranchId ?? agent.branchId;
    if (!edgeAgentServesBranch(agent, branchId)) return reply.code(403).send({ error: "edge_agent_branch_mismatch" });
    const connectivity = await store.getBranchConnectivityProfile(branchId);
    const assignment = agent.branchAssignments?.find(a => a.branchId === branchId);
    const branchIds = edgeAgentBranchIds(agent);
    reply.header("cache-control", "no-store");
    if (!pool) {
      return {
        credentials: [],
        branchId, branchIds, branchAssignments: agent.branchAssignments ?? [],
        vpnScanNetworks: assignment?.vpnNetworks ?? connectivity?.vpnRemoteNetworks ?? [],
        transport: assignment ? "vpn" : connectivity?.primaryTransport ?? null,
      };
    }

    const result = await pool.query<{
      id: string;
      ip_address: string | null;
      username: string;
      password: string | null;
      password_encrypted: string | null;
      updated_at: Date;
    }>(
      `SELECT id::text, ip_address, username, password, password_encrypted, updated_at
       FROM camera_credentials
       WHERE branch_id = $1
         AND scope = 'host-specific'
         AND ip_address IS NOT NULL
       ORDER BY updated_at DESC`,
      [branchId],
    );
    const centralCredentials = store.listCentralDeviceCredentials
      ? await store.listCentralDeviceCredentials(branchId)
      : [];
    await store.writeAudit({
      tenantId: (await store.getNode(branchId))!.tenantId,
      actorUserId: null,
      action: "edge_agent.discovery_bootstrap_requested",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { edgeAgentId, credentialCount: result.rows.length + centralCredentials.length },
    });
    return {
      credentials: [...result.rows.map((credential) => ({
        host: credential.ip_address ?? undefined,
        username: credential.username,
        password: readCameraPassword(credential),
        updatedAt: credential.updated_at.toISOString(),
      })), ...centralCredentials],
      branchId, branchIds, branchAssignments: agent.branchAssignments ?? [],
      vpnScanNetworks: assignment?.vpnNetworks ?? connectivity?.vpnRemoteNetworks ?? [],
      transport: assignment ? "vpn" : connectivity?.primaryTransport ?? null,
    };
  });
}
