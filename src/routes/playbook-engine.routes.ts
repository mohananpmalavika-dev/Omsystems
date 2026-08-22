import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { PlaybookEngineService } from "../incidents/services/playbook-engine.service.js";
import type { ControlPlaneStore } from "../control-plane-store.js";

const completeStepSchema = z.object({
  result: z.record(z.unknown()).optional(),
  evidence: z
    .object({
      clipId: z.string().optional(),
      snapshotId: z.string().optional(),
      cameraId: z.string().optional(),
      viewDurationSeconds: z.number().optional(),
    })
    .optional(),
});

const overrideStepSchema = z.object({
  reasonCode: z.enum([
    "CONTACT_UNREACHABLE",
    "AUTHORIZED_MAINTENANCE",
    "FALSE_SENSOR_TRIGGER",
    "WEATHER_EVENT",
    "SUPERVISOR_DIRECT_ORDER",
  ]),
  justification: z.string().min(10).max(1000),
});

const decisionSchema = z.object({
  stepId: z.string(),
  decisionType: z.enum([
    "FALSE_POSITIVE",
    "AUTHORIZED_ACTIVITY",
    "SUSPICIOUS",
    "CONFIRMED_INTRUSION",
    "ESCALATE_POLICE",
    "ESCALATE_QRT",
    "NORMAL_HOURS_EXCEPTION",
  ]),
  chosenOption: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH", "CONFIRMED"]),
  operatorNotes: z.string().min(5).max(2000),
  evidenceId: z.string().optional(),
});

const resolveIncidentSchema = z.object({
  resolutionNotes: z.string().optional(),
});

export async function registerPlaybookEngineRoutes(
  app: FastifyInstance,
  engine: PlaybookEngineService,
  store?: ControlPlaneStore,
) {
  // 1. Get complete operator incident workspace
  app.get("/v1/incidents/:id/workspace", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (!store || typeof (store as any).getIncident !== "function") {
      return reply.code(503).send({ error: "incident_store_unavailable" });
    }
    const incidentData = await (store as any).getIncident(id);
    if (!incidentData) return reply.code(404).send({ error: "incident_not_found" });
    const workspace = await engine.getIncidentWorkspace(incidentData);
    return { data: workspace };
  });

  // 2. Start Playbook SOP for incident
  app.post("/v1/incidents/:id/playbook/start", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as any) || {};

    const instance = await engine.startPlaybook({
      id,
      tenantId: (request as any).currentUser?.tenantId,
      incidentType: body.incidentType,
      severity: body.severity,
      title: body.title,
      branchId: body.branchId,
    });

    return { instance };
  });

  // 3. Mark step IN_PROGRESS
  app.post("/v1/incidents/:id/playbook/steps/:stepId/start", async (request: FastifyRequest) => {
    const { id, stepId } = request.params as { id: string; stepId: string };
    const user = (request as any).currentUser;
    if (!user) throw new Error("authenticated_operator_required");

    const instance = await engine.startStep(id, stepId, {
      userId: user.id,
      userName: user.displayName || user.username || "SOC Operator",
    });

    return { instance };
  });

  // 4. Complete SOP step with domain validation
  app.post("/v1/incidents/:id/playbook/steps/:stepId/complete", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, stepId } = request.params as { id: string; stepId: string };
    const body = completeStepSchema.parse(request.body || {});
    const user = (request as any).currentUser || { id: "usr-operator-1", displayName: "SOC Operator", role: "operator" };

    try {
      const instance = await engine.completeStep(id, stepId, {
        stepId,
        actor: {
          userId: user.id,
          userName: user.displayName || user.username || "SOC Operator",
          role: user.role,
        },
        result: body.result,
        evidence: body.evidence,
      });

      return { status: "step_completed", instance };
    } catch (err: any) {
      return reply.code(400).send({
        error: "step_completion_failed",
        message: err.message || "Failed to complete SOP step",
      });
    }
  });

  // 5. Authorized Supervisor Step Override
  app.post("/v1/incidents/:id/playbook/steps/:stepId/override", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, stepId } = request.params as { id: string; stepId: string };
    const body = overrideStepSchema.parse(request.body);
    const user = (request as any).currentUser || { id: "usr-supervisor-1", displayName: "Security Supervisor", role: "supervisor" };

    try {
      const instance = await engine.overrideStep(id, stepId, {
        stepId,
        requestedBy: user.displayName || user.username || "SOC Operator",
        approvedBy: user.displayName || user.username || "Security Supervisor",
        reasonCode: body.reasonCode,
        justification: body.justification,
      });

      return { status: "step_overridden", instance };
    } catch (err: any) {
      return reply.code(400).send({
        error: "step_override_failed",
        message: err.message || "Failed to override SOP step",
      });
    }
  });

  // 6. Record Structured Operator Decision
  app.post("/v1/incidents/:id/playbook/decision", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = decisionSchema.parse(request.body);
    const user = (request as any).currentUser || { id: "usr-operator-1", displayName: "SOC Operator" };

    try {
      const decision = await engine.recordDecision(id, body.stepId, {
        decisionType: body.decisionType,
        chosenOption: body.chosenOption,
        confidence: body.confidence,
        operatorNotes: body.operatorNotes,
        evidenceId: body.evidenceId,
        actor: {
          userId: user.id,
          userName: user.displayName || user.username || "SOC Operator",
        },
      });

      return { status: "decision_recorded", decision };
    } catch (err: any) {
      return reply.code(400).send({
        error: "decision_recording_failed",
        message: err.message || "Failed to record decision",
      });
    }
  });

  // 7. Enforce Resolution Gate (Strict Server-Side Resolution Validation)
  app.post("/v1/incidents/:id/resolve", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = resolveIncidentSchema.parse(request.body || {});
    const user = (request as any).currentUser || { id: "usr-operator-1", displayName: "SOC Operator", role: "operator" };

    try {
      await engine.resolveIncident(
        id,
        {
          userId: user.id,
          userName: user.displayName || user.username || "SOC Operator",
          role: user.role,
        },
        body.resolutionNotes,
      );

      // Update incident status in store if available
      if (store && typeof (store as any).updateIncident === "function") {
        await (store as any).updateIncident(id, {
          status: "RESOLVED",
          resolvedAt: new Date().toISOString(),
          resolutionNotes: body.resolutionNotes,
        });
      }

      return { status: "incident_resolved", incidentId: id };
    } catch (err: any) {
      if (err.name === "IncidentResolutionBlockedError") {
        return reply.code(409).send({
          error: "incident_resolution_blocked",
          message: err.message,
          incompleteMandatorySteps: err.incompleteSteps,
        });
      }

      return reply.code(400).send({
        error: "resolution_failed",
        message: err.message || "Failed to resolve incident",
      });
    }
  });

  // 8. Get Immutable Incident Audit Timeline
  app.get("/v1/incidents/:id/playbook/audit", async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const timeline = await engine.audit.getTimeline(id);
    return { data: timeline };
  });

  // 9. List all available Playbook Definitions
  app.get("/v1/playbooks", async () => {
    const list = await engine.definitions.listAll();
    return { data: list };
  });

  // 10. Get Playbook Definition details
  app.get("/v1/playbooks/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const playbook = await engine.definitions.getById(id);
    if (!playbook) {
      return reply.code(404).send({ error: "playbook_not_found" });
    }
    return { data: playbook };
  });
}
