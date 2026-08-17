import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { MobileOperationsService } from "../mobile/services/mobile-operations.service.js";

const mobileService = new MobileOperationsService();

export async function registerMobileOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // Mobile Operations BFF Home Endpoint: Single round-trip for P1 alerts, branch health summary & on-call operator
  app.get("/api/mobile/v1/home", async (request) => {
    const operator = {
      id: request.currentUser?.id || "USR-42",
      name: request.currentUser?.username || "Rajesh Kumar",
      role: request.currentUser?.role || "SOC Regional Operator",
      shift: "Active Shift (12:00 - 20:00)",
      onCall: true,
    };
    return {
      success: true,
      data: mobileService.getMobileHome(operator),
    };
  });

  // Get specific incident details for Mobile Action Screen
  app.get("/api/mobile/v1/incidents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const incident = mobileService.getIncidentById(id);
    if (!incident) {
      return reply.code(404).send({ success: false, error: "INCIDENT_NOT_FOUND" });
    }
    return { success: true, data: incident };
  });

  // 1-Tap Incident Acknowledgement
  app.post("/api/mobile/v1/incidents/:id/acknowledge", async (request, reply) => {
    const { id } = request.params as { id: string };
    const operator = {
      id: request.currentUser?.id || "USR-42",
      name: request.currentUser?.username || "Rajesh Kumar",
    };
    try {
      const result = mobileService.acknowledgeIncident(id, operator);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 1-Tap Branch Phone Call Trigger
  app.post("/api/mobile/v1/incidents/:id/call-branch", async (request, reply) => {
    const { id } = request.params as { id: string };
    const operator = {
      id: request.currentUser?.id || "USR-42",
      name: request.currentUser?.username || "Rajesh Kumar",
    };
    try {
      const result = mobileService.initiateBranchCall(id, operator);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Add Structured Action Chip or Custom Note to Incident Timeline
  app.post("/api/mobile/v1/incidents/:id/notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        noteType: z.enum([
          "FALSE_ALARM",
          "BRANCH_CONTACTED",
          "POLICE_CONTACTED",
          "SECURITY_DISPATCHED",
          "MAINTENANCE_ACTIVITY",
          "PERSON_CONFIRMED",
          "CAMERA_FAILURE",
          "CUSTOM_NOTE",
        ]),
        text: z.string().optional(),
      })
      .parse(request.body);

    const operator = {
      id: request.currentUser?.id || "USR-42",
      name: request.currentUser?.username || "Rajesh Kumar",
    };

    try {
      const result = mobileService.addIncidentNote(id, operator, body.noteType, body.text);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Policy-Driven Escalation to Regional Security Manager / National Head Office SOC
  app.post("/api/mobile/v1/incidents/:id/escalate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as any) || {};
    const operator = {
      id: request.currentUser?.id || "USR-42",
      name: request.currentUser?.username || "Rajesh Kumar",
    };
    try {
      const result = mobileService.escalateIncident(id, operator, body.reason);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Compact Mobile Branch Health Summary
  app.get("/api/mobile/v1/branches/:id/health", async (request) => {
    const { id } = request.params as { id: string };
    const health = mobileService.getBranchHealth(id);
    return { success: true, data: health };
  });

  // Low-latency Adaptive 720p Substream Live Session
  app.post("/api/mobile/v1/cameras/:id/live-session", async (request) => {
    const { id } = request.params as { id: string };
    const session = mobileService.createMobileLiveSession(id, {
      id: request.currentUser?.id || "USR-42",
    });
    return { success: true, data: session };
  });
}
