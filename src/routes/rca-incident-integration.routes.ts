/**
 * RCA-Incident Integration Routes
 * 
 * API endpoints for RCA-driven incident enrichment and remediation.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
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
      
      const result = await service.enrichIncidentWithRCA(incidentId, user);
      
      await audit(store, request, "incident.rca_enrichment.create", incidentId, "success", {
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
      
      // Get enrichment
      const enrichment = await store.getMetadata(
        `rca:enrichment:${incidentId}`,
        user.tenantId
      );
      
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
      
      const action = await service.updateActionStatus(
        actionId,
        user.tenantId,
        "approved"
      );
      
      await audit(store, request, "incident.remediation_action.approve", action.incidentId || "", "success", {
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
      
      const action = await service.updateActionStatus(
        actionId,
        user.tenantId,
        "in_progress"
      );
      
      await audit(store, request, "incident.remediation_action.start", action.incidentId || "", "success", {
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
        notes: z.string().optional(),
        successful: z.boolean().default(true),
      }).parse(request.body);
      
      const action = await service.updateActionStatus(
        actionId,
        user.tenantId,
        body.successful ? "completed" : "failed",
        body.notes
      );
      
      await audit(store, request, "incident.remediation_action.complete", action.incidentId || "", "success", {
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
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        rootCauseCode: z.string().optional(),
      }).parse(request.query);
      
      // This would aggregate RCA enrichment data across incidents
      // For now, return a placeholder
      return {
        summary: {
          totalIncidentsEnriched: 0,
          byRootCause: {},
          averageConfidence: 0,
          multiBranchIncidents: 0,
        },
        message: "RCA summary aggregation to be implemented",
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
    if (error instanceof Error) {
      const statusCode = error.message === "unauthorized" ? 401
        : error.message.includes("not_found") ? 404
        : 500;
      
      return reply.code(statusCode).send({
        error: error.message,
        message: error.message.replace(/_/g, " "),
      });
    }
    throw error;
  }
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
    console.error("Failed to write audit log:", error);
  }
}
