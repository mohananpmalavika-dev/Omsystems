import type { FastifyInstance } from "fastify";
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
  });
}
