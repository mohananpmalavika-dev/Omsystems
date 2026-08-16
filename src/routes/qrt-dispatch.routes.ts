import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { QrtDispatchService } from "../services/qrt-dispatch.service.js";

const qrtService = new QrtDispatchService();

export async function registerQrtDispatchRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // Generate a tokenized incident link for field responders
  app.post("/v1/incidents/:incidentId/generate-qrt-link", async (request) => {
    const { incidentId } = request.params as { incidentId: string };
    const body = (request.body as any) || {};

    const dispatch = qrtService.generateIncidentToken({
      incidentId,
      branchName: body.branchName || "Kochi Hub",
      branchAddress: body.branchAddress || "MG Road, Kochi 682016",
      gps: body.gps || { lat: 9.9312, lng: 76.2673 },
      alertType: body.alertType || "VAULT_INTRUSION_DETECTED",
      severity: body.severity || "P1",
      liveStreamUrl: body.liveStreamUrl,
      snapshotUrl: body.snapshotUrl,
      ttlMinutes: 30,
    });

    return { success: true, data: dispatch };
  });

  // Public endpoint for mobile field officers (no auth token required, secured by HMAC token)
  app.get(
    "/v1/public/live-incident/:token",
    { config: { noAuth: true } },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const incident = qrtService.getIncidentByToken(token);

      if (!incident) {
        return reply.status(404).send({
          success: false,
          error: "TOKEN_EXPIRED_OR_INVALID",
          message: "This QRT incident dispatch link has expired or is invalid.",
        });
      }

      return { success: true, data: incident };
    },
  );

  // Field officer acknowledges arrival on scene
  app.post(
    "/v1/public/live-incident/:token/arrive",
    { config: { noAuth: true } },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const body = (request.body as any) || {};
      const success = qrtService.acknowledgeOnScene(token, body.responderName || "Police / QRT Unit 1");

      if (!success) {
        return reply.status(404).send({ success: false, error: "INVALID_TOKEN" });
      }

      return {
        success: true,
        message: "Status updated to ACKNOWLEDGED_ON_SCENE. SOC operator notified.",
      };
    },
  );
}
