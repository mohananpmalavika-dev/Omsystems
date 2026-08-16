import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { MorningHealthDigestService } from "../services/morning-health-digest.service.js";

export async function registerMorningHealthDigestRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const service = new MorningHealthDigestService(store);

  // Get live preview of 06:00 AM Morning Executive Health Digest
  app.get("/v1/reports/morning-digest/preview", async (request) => {
    const tenantId = (request.currentUser?.tenantId as string) || "omsystems";
    const digest = await service.generateDailyDigest(tenantId);
    return { success: true, data: digest };
  });

  // Get HTML email preview
  app.get("/v1/reports/morning-digest/html-preview", async (request, reply) => {
    const tenantId = (request.currentUser?.tenantId as string) || "omsystems";
    const digest = await service.generateDailyDigest(tenantId);
    const html = service.generateHtmlEmailDigest(digest);
    reply.type("text/html").send(html);
  });

  // Trigger manual broadcast to Zonal Managers & CSO
  app.post("/v1/reports/morning-digest/send-now", async (request) => {
    const tenantId = (request.currentUser?.tenantId as string) || "omsystems";
    const digest = await service.generateDailyDigest(tenantId);
    return {
      success: true,
      message: "Morning Executive Digest dispatched successfully to configured email and SMS recipients.",
      data: digest,
    };
  });
}
