import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { registerSignedConfigRoutes } from "../config-management/routes/signed-config.routes.js";
import { registerSocAnalyticsRoutes } from "../analytics/routes/soc-analytics.routes.js";
import { SocOperatorAnalyticsService } from "../analytics/services/soc-operator-analytics.service.js";

/**
 * Registers the remaining enterprise SOC routes in an authenticated Fastify
 * scope. Legacy in-memory maintenance, clock, playback, and investigation
 * routes were removed; their authoritative implementations live in the main
 * maintenance, recording, evidence, and operational-health APIs.
 */
export async function registerEnterpriseSocOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const socAnalytics = new SocOperatorAnalyticsService();
  await app.register(async (scope) => {
    scope.addHook("preHandler", async (request, reply) => {
      if (!request.currentUser) {
        return reply.code(401).send({ success: false, error: "Authentication required" });
      }
    });

    await registerSignedConfigRoutes(scope);
    await registerSocAnalyticsRoutes(scope, store, socAnalytics);
  });
}
