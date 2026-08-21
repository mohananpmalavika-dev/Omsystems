import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { HAClusterManagerService } from "../ha/services/ha-cluster-manager.service.js";

const haService = new HAClusterManagerService();

export async function registerHAClusterRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // Get complete HA Cluster Topology, live nodes, and active failover state
  app.get("/v1/ha/topology", async () => {
    return {
      success: true,
      data: haService.getClusterTopology(),
    };
  });

  // Execute one of the 8 Chaos Engineering / Failure injection simulations
  app.post("/v1/ha/simulate-failure", async (request, reply) => {
    return reply.code(410).send({
      success: false,
      error: "chaos_endpoints_disabled",
      message: "Failure injection is not exposed by the production control plane.",
    });
    const body = z
      .object({
        scenario: z.enum([
          "KILL_API_NODE",
          "KILL_REDIS_NODE",
          "KILL_POSTGRES_PRIMARY",
          "KILL_MEDIA_GATEWAY",
          "DISCONNECT_BRANCH",
          "RESTART_EDGE_GATEWAY",
          "REMOVE_DISK",
          "FAIL_PRIMARY_ISP",
        ]),
      })
      .parse(request.body);

    const result = await haService.runChaosSimulation(body.scenario);
    return {
      success: true,
      message: `Chaos simulation '${body.scenario}' executed successfully with verified automatic recovery.`,
      data: result,
    };
  });
}
