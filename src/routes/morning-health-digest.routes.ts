import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { MorningHealthDigestService } from "../services/morning-health-digest.service.js";

export async function registerMorningHealthDigestRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const service = new MorningHealthDigestService(store);

  // Get live preview of 06:00 AM Morning Executive Health Digest
  app.get("/v1/reports/morning-digest/preview", async (request, reply) => {
    if (!request.currentUser) return reply.code(401).send({ success: false, error: "Authentication required" });
    const digest = await service.generateDailyDigest(request.currentUser);
    return { success: true, data: digest };
  });

  // Get HTML email preview
  app.get("/v1/reports/morning-digest/html-preview", async (request, reply) => {
    if (!request.currentUser) return reply.code(401).send({ success: false, error: "Authentication required" });
    const digest = await service.generateDailyDigest(request.currentUser);
    const html = service.generateHtmlEmailDigest(digest);
    reply.type("text/html").send(html);
  });

  // Trigger manual broadcast to Zonal Managers & CSO
  app.post("/v1/reports/morning-digest/send-now", async (request, reply) => {
    if (!request.currentUser) return reply.code(401).send({ success: false, error: "Authentication required" });
    return reply.code(501).send({
      success: false,
      error: "morning_digest_delivery_not_configured",
      message: "Configure the operational report delivery provider and schedule to send this digest.",
    });
  });
}
