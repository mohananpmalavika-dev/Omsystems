import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { CommandCenterError, CommandCenterService } from "../services/command-center/service.js";
import { createCommandCenterState } from "../services/command-center/state.js";
import { RCAStore } from "../services/command-center/rca-store.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const incidentParams = z.object({ incidentId: z.string().min(1) });
const actionParams = z.object({ actionId: z.string().min(1) });
const diagnosisParams = z.object({ diagnosisId: z.string().min(1) });
const timeQuery = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() });

export async function registerCommandCenterRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  const service = new CommandCenterService(store, createCommandCenterState(store));
  const rcaStore = new RCAStore(store);

  app.post("/v1/command-center/query", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const body = z.object({
      branchId: z.string().min(1).optional(),
      conversationId: z.string().uuid().optional(),
      question: z.string().trim().min(2).max(2_000),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(request.body);
    const response = await service.query(user, {
      question: body.question!,
      ...(body.branchId ? { branchId: body.branchId } : {}),
      ...(body.conversationId ? { conversationId: body.conversationId } : {}),
      ...(body.from ? { from: body.from } : {}),
      ...(body.to ? { to: body.to } : {}),
    });
    await audit(store, request, "command_center.query", response.diagnosis.branch.id, "success", {
      conversationId: response.conversationId, caseId: response.diagnosis.caseId, intent: response.intent,
      question: body.question,
    });
    return response;
  }));

  app.get("/v1/command-center/branches/:branchId/diagnosis", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { branchId } = branchParams.parse(request.params);
    const range = timeQuery.parse(request.query);
    const diagnosis = await service.diagnosis(user, branchId, range);
    await audit(store, request, "command_center.diagnosis.read", branchId, "success", { caseId: diagnosis.caseId });
    return diagnosis;
  }));

  app.get("/v1/command-center/branches/:branchId/timeline", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { branchId } = branchParams.parse(request.params);
    const diagnosis = await service.diagnosis(user, branchId, timeQuery.parse(request.query));
    return { branch: diagnosis.branch, caseId: diagnosis.caseId, timeline: diagnosis.timeline, lastUpdatedAt: diagnosis.lastUpdatedAt };
  }));

  app.get("/v1/command-center/branches/:branchId/dependencies", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { branchId } = branchParams.parse(request.params);
    const diagnosis = await service.diagnosis(user, branchId);
    return { branch: diagnosis.branch, entities: diagnosis.graph.entities, dependencies: diagnosis.graph.dependencies, generatedAt: diagnosis.graph.generatedAt };
  }));

  app.get("/v1/command-center/branches/:branchId/recovery-estimate", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { branchId } = branchParams.parse(request.params);
    const diagnosis = await service.diagnosis(user, branchId, timeQuery.parse(request.query));
    return { branch: diagnosis.branch, caseId: diagnosis.caseId, recoveryEstimate: diagnosis.recoveryEstimate, currentRecoveryActivity: diagnosis.currentRecoveryActivity };
  }));

  app.get("/v1/command-center/branches/:branchId/similar-incidents", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { branchId } = branchParams.parse(request.params);
    const query = z.object({ rootCauseCode: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(10) }).parse(request.query);
    return { items: await service.similarCases(user, branchId, query.rootCauseCode, query.limit) };
  }));

  app.get("/v1/command-center/incidents/:incidentId/root-cause", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { incidentId } = incidentParams.parse(request.params);
    const incident = await store.getIncident(incidentId);
    if (!incident || incident.tenantId !== user.tenantId || !incident.branchId) throw new CommandCenterError("incident_not_found", 404);
    const diagnosis = await service.diagnosis(user, incident.branchId, incidentRange(incident));
    return { incidentId, branch: diagnosis.branch, caseId: diagnosis.caseId, rootCause: diagnosis.rootCause, alternatives: diagnosis.alternativeCauses, missingEvidence: diagnosis.missingEvidence };
  }));

  app.get("/v1/command-center/incidents/:incidentId/evidence", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { incidentId } = incidentParams.parse(request.params);
    const incident = await store.getIncident(incidentId);
    if (!incident || incident.tenantId !== user.tenantId || !incident.branchId) throw new CommandCenterError("incident_not_found", 404);
    const diagnosis = await service.diagnosis(user, incident.branchId, incidentRange(incident));
    return { incidentId, caseId: diagnosis.caseId, evidence: diagnosis.evidence, timeline: diagnosis.timeline };
  }));

  app.post("/v1/command-center/actions/:actionId/approve", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { actionId } = actionParams.parse(request.params);
    const action = await service.approveAction(user, actionId);
    await audit(store, request, "command_center.action.approve", action.branchId, "success", { actionId, caseId: action.caseId, actionType: action.actionType });
    return { action };
  }));

  app.post("/v1/command-center/actions/:actionId/execute", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { actionId } = actionParams.parse(request.params);
    const action = await service.executeAction(user, actionId);
    await audit(store, request, "command_center.action.execute", action.branchId, "success", {
      actionId, caseId: action.caseId, actionType: action.actionType, result: action.executionResult,
    });
    return { action };
  }));

  app.get("/v1/command-center/fleet/priorities", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const items = await service.fleetPriorities(user);
    return { items, generatedAt: new Date().toISOString() };
  }));
  
  // === RCA-Specific Endpoints ===
  
  /**
   * Get enhanced RCA diagnosis with multi-branch correlation
   */
  app.get("/v1/command-center/branches/:branchId/rca-diagnosis", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { branchId } = branchParams.parse(request.params);
    const query = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      includeHistorical: z.coerce.boolean().default(true),
    }).parse(request.query);
    
    // Get enhanced diagnosis with RCA engine
    const diagnosis = await service.enhancedDiagnosis(user, branchId, {
      from: query.from,
      to: query.to,
      includeHistorical: query.includeHistorical,
    });
    
    // Store diagnosis for historical analysis
    const stored = await rcaStore.storeDiagnosis(diagnosis, {
      status: "active",
    });
    
    await audit(store, request, "command_center.rca_diagnosis.read", branchId, "success", {
      diagnosisId: stored.id,
      rootCause: diagnosis.primaryCause.code,
      confidence: diagnosis.confidenceScore,
    });
    
    return stored;
  }));
  
  /**
   * Get RCA diagnosis history for a branch
   */
  app.get("/v1/command-center/branches/:branchId/rca-history", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { branchId } = branchParams.parse(request.params);
    const query = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      status: z.enum(["active", "validated", "invalidated", "archived"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);
    
    const diagnoses = await rcaStore.listDiagnosesByBranch(user.tenantId, branchId, {
      from: query.from,
      to: query.to,
      status: query.status,
      limit: query.limit,
    });
    
    return {
      branchId,
      diagnoses,
      total: diagnoses.length,
    };
  }));
  
  /**
   * Get similar historical cases for pattern matching
   */
  app.get("/v1/command-center/rca/similar-cases", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const query = z.object({
      caseFingerprint: z.string().min(1),
      rootCauseCode: z.string().optional(),
      minConfidence: z.coerce.number().min(0).max(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }).parse(request.query);
    
    const similarCases = await rcaStore.findSimilarCases(
      query.caseFingerprint,
      user.tenantId,
      {
        rootCauseCode: query.rootCauseCode,
        minConfidence: query.minConfidence,
        limit: query.limit,
      }
    );
    
    return {
      caseFingerprint: query.caseFingerprint,
      similarCases,
      total: similarCases.length,
    };
  }));
  
  /**
   * Validate RCA diagnosis with actual outcome
   */
  app.post("/v1/command-center/rca/:diagnosisId/validate", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { diagnosisId } = diagnosisParams.parse(request.params);
    const body = z.object({
      actualRootCause: z.string().min(1),
      resolutionAction: z.string().min(1),
      timeToResolveMinutes: z.number().int().min(0),
      notes: z.string().optional(),
    }).parse(request.body);
    
    const validated = await rcaStore.validateDiagnosis(diagnosisId, user.tenantId, {
      actualRootCause: body.actualRootCause,
      resolutionAction: body.resolutionAction,
      timeToResolveMinutes: body.timeToResolveMinutes,
      validatedBy: user.id,
      notes: body.notes,
    });
    
    await audit(store, request, "command_center.rca_diagnosis.validate", validated.branchId, "success", {
      diagnosisId,
      actualRootCause: body.actualRootCause,
      wasCorrect: body.actualRootCause === validated.primaryCause.code,
    });
    
    return {
      diagnosis: validated,
      wasCorrect: body.actualRootCause === validated.primaryCause.code,
      message: body.actualRootCause === validated.primaryCause.code
        ? "RCA prediction was correct"
        : "RCA prediction was incorrect - system will learn from this outcome",
    };
  }));
  
  /**
   * Get RCA accuracy statistics
   */
  app.get("/v1/command-center/rca/accuracy-stats", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const query = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      rootCauseCode: z.string().optional(),
    }).parse(request.query);
    
    const stats = await rcaStore.getAccuracyStats(user.tenantId, {
      from: query.from,
      to: query.to,
      rootCauseCode: query.rootCauseCode,
    });
    
    return {
      stats,
      generatedAt: new Date().toISOString(),
    };
  }));
  
  /**
   * Get detailed evidence matrix for a diagnosis
   */
  app.get("/v1/command-center/rca/:diagnosisId/evidence-matrix", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const { diagnosisId } = diagnosisParams.parse(request.params);
    
    const diagnosis = await rcaStore.getDiagnosis(diagnosisId, user.tenantId);
    
    if (!diagnosis) {
      throw new CommandCenterError("diagnosis_not_found", 404);
    }
    
    return {
      diagnosisId,
      evidenceMatrix: diagnosis.evidenceMatrix,
      primaryCause: {
        code: diagnosis.primaryCause.code,
        label: diagnosis.primaryCause.label,
        confidence: diagnosis.primaryCause.confidence,
        certainty: diagnosis.primaryCause.certainty,
      },
      supportingEvidenceCount: diagnosis.evidenceMatrix.supporting.length,
      contradictingEvidenceCount: diagnosis.evidenceMatrix.contradicting.length,
      missingEvidenceCount: diagnosis.evidenceMatrix.missing.length,
    };
  }));
  
  /**
   * Get multi-branch correlation analysis
   */
  app.get("/v1/command-center/rca/multi-branch-analysis", async (request, reply) => commandReply(reply, async () => {
    const user = authenticated(request);
    const query = z.object({
      branchIds: z.string().min(1).transform(s => s.split(",")),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(request.query);
    
    // This would call a specialized multi-branch analysis function
    // For now, return a placeholder
    return {
      branchIds: query.branchIds,
      analysis: "Multi-branch analysis would be performed here",
      message: "This endpoint requires implementation of cross-branch correlation query",
    };
  }));
}

function authenticated(request: FastifyRequest) {
  if (!request.currentUser?.tenantId) throw new CommandCenterError("unauthorized", 401);
  return request.currentUser;
}

async function commandReply(reply: FastifyReply, work: () => Promise<unknown>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof CommandCenterError) return reply.code(error.statusCode).send({ error: error.code, message: error.message.replaceAll("_", " "), ...error.details });
    throw error;
  }
}

function incidentRange(incident: any) {
  const occurredAt = typeof incident.occurredAt === "string" ? incident.occurredAt : new Date().toISOString();
  return { from: new Date(Date.parse(occurredAt) - 6 * 60 * 60 * 1_000).toISOString(), to: new Date().toISOString() };
}

async function audit(
  store: ControlPlaneStore,
  request: FastifyRequest,
  action: string,
  resourceNodeId: string,
  outcome: "success" | "denied" | "failure",
  details: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser!.tenantId,
    actorUserId: request.currentUser!.id,
    action,
    resourceNodeId,
    outcome,
    sourceIp: request.ip,
    details,
  });
}
