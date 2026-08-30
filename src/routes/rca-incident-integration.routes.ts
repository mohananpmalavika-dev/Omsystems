/**
 * RCA-Incident Integration Routes
 * 
 * API endpoints for RCA-driven incident enrichment and remediation.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Action } from "../domain/models.js";
import { RCAIncidentIntegrationService } from "../services/rca-incident-integration.service.js";

const incidentParams = z.object({ incidentId: z.string().min(1) });
const actionParams = z.object({ actionId: z.string().min(1) });

export async function registerRCAIncidentIntegrationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const service = new RCAIncidentIntegrationService(store);
  
  /**
   * Enrich incident with RCA analysis
   */
  app.post("/v1/incidents/:incidentId/rca-enrichment", async (request, reply) => {
    return handleRequest(reply, async () => {
      const user = authenticated(request);
      const { incidentId } = incidentParams.parse(request.params);
      const incident = await authorizedIncident(request, reply, store, incidentId, "incident:update");
      if (!incident) return;
      const result = await service.enrichIncidentWithRCA(incidentId, user);
      
      await audit(store, request, "incident.rca_enrichment.create", incident.branchId, "success", {
        diagnosisId: result.diagnosis.diagnosisId,
        rootCause: result.enrichment.rootCauseCode,
        confidence: result.enrichment.confidence,
        actionsGenerated: result.remediationActions.length,
      });
      
      return {
        incident: { id: incidentId },
        diagnosis: {
          id: result.diagnosis.diagnosisId,
          rootCause: result.diagnosis.primaryCause.label,
          confidence: result.diagnosis.confidenceScore,
          certainty: result.diagnosis.certainty,
        },
        enrichment: result.enrichment,
        remediationActions: result.remediationActions,
      };
    });
  });
  
  /**
   * Get RCA enrichment for an incident
   */
  app.get("/v1/incidents/:incidentId/rca-enrichment", async (request, reply) => {
    return handleRequest(reply, async () => {
      const user = authenticated(request);
      const { incidentId } = incidentParams.parse(request.params);
      const incident = await authorizedIncident(request, reply, store, incidentId, "incident:view");
      if (!incident) return;
      const enrichment = await service.getEnrichment(incidentId, user.tenantId);
      
      if (!enrichment) {
        return reply.code(404).send({ error: "enrichment_not_found" });
      }
      
      // Get remediation actions
      const actions = await service.getRemediationActions(incidentId, user.tenantId);
      
      return {
        incidentId,
        enrichment,
        remediationActions: actions,
      };
    });
  });
  
  /**
   * Get remediation actions for an incident
   */
  app.get("/v1/incidents/:incidentId/remediation-actions", async (request, reply) => {
    return handleRequest(reply, async () => {
      const user = authenticated(request);
      const { incidentId } = incidentParams.parse(request.params);
      const incident = await authorizedIncident(request, reply, store, incidentId, "incident:view");
      if (!incident) return;
      const actions = await service.getRemediationActions(incidentId, user.tenantId);
      
      return {
        incidentId,
        actions,
        total: actions.length,
        byPriority: {
          immediate: actions.filter(a => a.priority === "immediate").length,
          high: actions.filter(a => a.priority === "high").length,
          medium: actions.filter(a => a.priority === "medium").length,
          low: actions.filter(a => a.priority === "low").length,
        },
        byStatus: {
          proposed: actions.filter(a => a.status === "proposed").length,
          approved: actions.filter(a => a.status === "approved").length,
          in_progress: actions.filter(a => a.status === "in_progress").length,
          completed: actions.filter(a => a.status === "completed").length,
          failed: actions.filter(a => a.status === "failed").length,
        },
      };
    });
  });
  
  /**
   * Approve a remediation action
   */
  app.post("/v1/incidents/remediation-actions/:actionId/approve", async (request, reply) => {
    return handleRequest(reply, async () => {
      const user = authenticated(request);
      const { actionId } = actionParams.parse(request.params);
      const existing = await service.getRemediationAction(actionId, user.tenantId);
      if (!existing?.incidentId) return reply.code(404).send({ error: "remediation_action_not_found" });
      const incident = await authorizedIncident(request, reply, store, existing.incidentId, "incident:update");
      if (!incident) return;
      const action = await service.updateActionStatus(
        actionId,
        user.tenantId,
        "approved"
      );
      
      await audit(store, request, "incident.remediation_action.approve", incident.branchId, "success", {
        actionId,
        actionType: action.actionType,
      });
      
      return { action };
    });
  });
  
  /**
   * Mark remediation action as in progress
   */
  app.post("/v1/incidents/remediation-actions/:actionId/start", async (request, reply) => {
    return handleRequest(reply, async () => {
      const user = authenticated(request);
      const { actionId } = actionParams.parse(request.params);
      const existing = await service.getRemediationAction(actionId, user.tenantId);
      if (!existing?.incidentId) return reply.code(404).send({ error: "remediation_action_not_found" });
      const incident = await authorizedIncident(request, reply, store, existing.incidentId, "incident:update");
      if (!incident) return;
      const action = await service.updateActionStatus(
        actionId,
        user.tenantId,
        "in_progress"
      );
      
      await audit(store, request, "incident.remediation_action.start", incident.branchId, "success", {
        actionId,
        actionType: action.actionType,
      });
      
      return { action };
    });
  });
  
  /**
   * Mark remediation action as completed
   */
  app.post("/v1/incidents/remediation-actions/:actionId/complete", async (request, reply) => {
    return handleRequest(reply, async () => {
      const user = authenticated(request);
      const { actionId } = actionParams.parse(request.params);
      const body = z.object({
        notes: z.string().trim().max(5_000).optional(),
        successful: z.boolean().default(true),
      }).parse(request.body);
      const existing = await service.getRemediationAction(actionId, user.tenantId);
      if (!existing?.incidentId) return reply.code(404).send({ error: "remediation_action_not_found" });
      const incident = await authorizedIncident(request, reply, store, existing.incidentId, "incident:update");
      if (!incident) return;
      const action = await service.updateActionStatus(
        actionId,
        user.tenantId,
        body.successful ? "completed" : "failed",
        body.notes
      );
      
      await audit(store, request, "incident.remediation_action.complete", incident.branchId, "success", {
        actionId,
        actionType: action.actionType,
        successful: body.successful,
      });
      
      return { action, successful: body.successful };
    });
  });
  
  /**
   * Get RCA-driven incident summary (for dashboards)
   */
  app.get("/v1/incidents/rca-summary", async (request, reply) => {
    return handleRequest(reply, async () => {
      const user = authenticated(request);
      const query = z.object({
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        rootCauseCode: z.string().trim().min(1).max(120).optional(),
      }).superRefine((value, context) => {
        if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
          context.addIssue({ code: "custom", path: ["from"], message: "from must not be after to" });
        }
      }).parse(request.query);
      const branches = await store.listAccessibleNodes(user, "incident:view", "branch");
      const summary = await service.getSummary(user.tenantId, {
        ...query,
        allowedBranchIds: new Set(branches.map((branch) => branch.id)),
      });
      return {
        summary,
        generatedAt: new Date().toISOString(),
      };
    });
  });
}

function authenticated(request: FastifyRequest) {
  if (!request.currentUser?.tenantId) {
    throw new Error("unauthorized");
  }
  return request.currentUser;
}

async function handleRequest(
  reply: FastifyReply,
  work: () => Promise<unknown>
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: "invalid_request", issues: error.issues });
    }
    if (error instanceof Error) {
      const statusCode = error.message === "unauthorized" ? 401
        : error.message.includes("not_found") ? 404
        : error.message.includes("invalid_remediation_action_transition") ||
          error.message.includes("incident_missing_branch") ? 409
        : 500;
      
      return reply.code(statusCode).send({
        error: error.message,
        message: error.message.replace(/_/g, " "),
      });
    }
    throw error;
  }
}

async function authorizedIncident(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  incidentId: string,
  action: Extract<Action, "incident:view" | "incident:update">,
) {
  const user = authenticated(request);
  const incident = await store.getIncident(incidentId);
  if (!incident || incident.tenantId !== user.tenantId) {
    await reply.code(404).send({ error: "incident_not_found" });
    return undefined;
  }
  if (!incident.branchId) {
    await reply.code(409).send({ error: "incident_missing_branch" });
    return undefined;
  }
  const decision = await store.checkAccess(user, action, incident.branchId);
  if (!decision) {
    await reply.code(404).send({ error: "branch_not_found" });
    return undefined;
  }
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return undefined;
  }
  return incident;
}

async function audit(
  store: ControlPlaneStore,
  request: FastifyRequest,
  action: string,
  resourceNodeId: string,
  outcome: "success" | "denied" | "failure",
  details: Record<string, unknown>
) {
  try {
    await store.writeAudit({
      tenantId: request.currentUser!.tenantId,
      actorUserId: request.currentUser!.id,
      action,
      resourceNodeId,
      outcome,
      sourceIp: request.ip,
      details,
    });
  } catch (error) {
    request.log.error({ error, action, resourceNodeId }, "Failed to write RCA incident audit log");
  }
}
