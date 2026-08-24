import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const params = z.object({ edgeAgentId: z.string().min(1) });

export async function registerEdgeDiscoveryBootstrapRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  pool?: Pool,
) {
  app.get("/v1/edge-agents/:edgeAgentId/discovery-bootstrap", async (request, reply) => {
    const { edgeAgentId } = params.parse(request.params);
    const agent = await store.getEdgeAgent(edgeAgentId);
    if (!agent) {
      return reply.code(404).send({ error: "edge_agent_not_found" });
    }
    const connectivity = await store.getBranchConnectivityProfile(agent.branchId);
    if (!pool) {
      return {
        credentials: [],
        vpnScanNetworks: connectivity?.vpnRemoteNetworks ?? [],
        transport: connectivity?.primaryTransport ?? null,
      };
    }

    const result = await pool.query<{
      ip_address: string | null;
      username: string;
      password: string | null;
      updated_at: Date;
    }>(
      `SELECT ip_address, username, password, updated_at
       FROM camera_credentials
       WHERE branch_id = $1
         AND scope = 'host-specific'
         AND ip_address IS NOT NULL
       ORDER BY updated_at DESC`,
      [agent.branchId],
    );
    await store.writeAudit({
      tenantId: (await store.getNode(agent.branchId))!.tenantId,
      actorUserId: null,
      action: "edge_agent.discovery_bootstrap_requested",
      resourceNodeId: agent.branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { edgeAgentId, credentialCount: result.rows.length },
    });
    return {
      credentials: result.rows.map((credential) => ({
        host: credential.ip_address ?? undefined,
        username: credential.username,
        password: credential.password ?? "",
        updatedAt: credential.updated_at.toISOString(),
      })),
      vpnScanNetworks: connectivity?.vpnRemoteNetworks ?? [],
      transport: connectivity?.primaryTransport ?? null,
    };
  });
}
