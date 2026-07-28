import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { IncidentOrchestrator } from '../services/incident-orchestrator.service.js';

/**
 * Investigation Workspace API Routes
 * 
 * Enhanced incident management endpoints that leverage the orchestrator
 * for AI integration, workflow management, and investigation operations.
 */

// ============ VALIDATION SCHEMAS ============

const processAIEventSchema = z.object({
  branchId: z.string().uuid().optional(),
  cameraId: z.string().uuid(),
  detectionType: z.string(),
  detectionTime: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']),
  zone: z.string().optional(),
  trackedObjectId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createManualIncidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  incidentType: z.string(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']),
  branchId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
});

const transitionStatusSchema = z.object({
  toStatus: z.string(),
  notes: z.string().max(2000).optional(),
});

const markFalsePositiveSchema = z.object({
  reason: z.string().trim().min(10).max(500),
  category: z.enum([
    'shadow',
    'animal',
    'reflection',
    'weather',
    'camera-movement',
    'known-employee',
    'expected-activity',
    'incorrect-zone',
    'low-quality',
    'duplicate',
    'other',
  ]),
  improveModel: z.boolean().default(true),
});

const extendPreservationSchema = z.object({
  cameraId: z.string().uuid(),
  additionalMinutes: z.number().int().min(1).max(60),
  direction: z.enum(['pre', 'post']),
});

const createDefaultReportSchema = z.object({
  reportType: z.enum(['preliminary', 'investigation', 'final']).default('investigation'),
  autoGenerateSummary: z.boolean().default(true),
});

export async function registerInvestigationWorkspaceRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const orchestrator = new IncidentOrchestrator(store, console);
  
  // ============ AI EVENT PROCESSING ============
  
  /**
   * POST /v1/incidents/ai-events
   * Process AI detection event and create/update incident
   */
  app.post('/v1/incidents/ai-events', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = processAIEventSchema.parse(request.body);
    
    const result = await orchestrator.processAIEvent({
      tenantId: request.currentUser.tenantId,
      cameraId: body.cameraId,
      detectionType: body.detectionType,
      detectionTime: body.detectionTime,
      confidence: body.confidence,
      severity: body.severity,
      ...(body.branchId !== undefined && { branchId: body.branchId }),
      ...(body.zone !== undefined && { zone: body.zone }),
      ...(body.trackedObjectId !== undefined && { trackedObjectId: body.trackedObjectId }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: 'system',
      action: 'incident:ai-event-processed',
      resourceNodeId: body.branchId ?? null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { 
        action: result.action,
        detectionType: body.detectionType,
        incidentId: result.incidentId,
      },
    });
    
    return result;
  });
  
  /**
   * POST /v1/incidents/create-manual
   * Create incident with full workflow (manual/operator-verified)
   */
  app.post('/v1/incidents/create-manual', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createManualIncidentSchema.parse(request.body);
    
    const result = await orchestrator.createIncidentManual({
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
      title: body.title,
      incidentType: body.incidentType,
      severity: body.severity,
      ...(body.description !== undefined && { description: body.description }),
      ...(body.branchId !== undefined && { branchId: body.branchId }),
      ...(body.cameraId !== undefined && { cameraId: body.cameraId }),
      ...(body.occurredAt !== undefined && { occurredAt: body.occurredAt }),
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:create',
      resourceNodeId: body.branchId ?? null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { 
        incidentId: result.incident.id,
        incidentNumber: result.incident.incidentNumber,
      },
    });
    
    return reply.code(201).send(result);
  });
  
  // ============ INVESTIGATION WORKSPACE ============
  
  /**
   * GET /v1/incidents/:id/workspace
   * Get complete investigation workspace data
   */
  app.get('/v1/incidents/:id/workspace', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const workspace = await orchestrator.getInvestigationWorkspace(id);
    
    if (workspace.incident.tenantId !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: 'access_denied' });
    }
    
    return workspace;
  });
  
  /**
   * POST /v1/incidents/:id/transition
   * Transition incident status with validation
   */
  app.post('/v1/incidents/:id/transition', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = transitionStatusSchema.parse(request.body);
    
    const result = await orchestrator.transitionIncident({
      incidentId: id,
      toStatus: body.toStatus,
      performedBy: request.currentUser.id,
      userRole: request.currentUser.role,
      notes: body.notes,
    });
    
    if (!result.success) {
      return reply.code(400).send({
        error: 'transition_failed',
        errors: result.errors,
        warnings: result.warnings,
      });
    }
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:status-transition',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, toStatus: body.toStatus },
    });
    
    return {
      success: true,
      incident: result.incident,
      warnings: result.warnings,
    };
  });
  
  /**
   * POST /v1/incidents/:id/mark-false-positive
   * Mark incident as false positive
   */
  app.post('/v1/incidents/:id/mark-false-positive', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = markFalsePositiveSchema.parse(request.body);
    
    await orchestrator.markFalsePositive({
      incidentId: id,
      reason: body.reason,
      category: body.category,
      markedBy: request.currentUser.id,
      improveModel: body.improveModel,
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:mark-false-positive',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, reason: body.reason, category: body.category },
    });
    
    return { success: true };
  });
  
  // ============ EVIDENCE OPERATIONS ============
  
  /**
   * POST /v1/incidents/:id/extend-preservation
   * Extend evidence preservation period
   */
  app.post('/v1/incidents/:id/extend-preservation', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = extendPreservationSchema.parse(request.body);
    
    // Access preservation service through orchestrator
    const preservationService = (orchestrator as any).preservationService;
    
    await preservationService.extendPreservation(
      id,
      body.cameraId,
      body.additionalMinutes,
      body.direction,
      request.currentUser.id
    );
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:extend-preservation',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { 
        incidentId: id,
        cameraId: body.cameraId,
        additionalMinutes: body.additionalMinutes,
        direction: body.direction,
      },
    });
    
    return { success: true };
  });
  
  /**
   * POST /v1/incidents/:id/release-legal-hold
   * Release legal hold on evidence
   */
  app.post('/v1/incidents/:id/release-legal-hold', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      cameraId: z.string().uuid(),
      reason: z.string().trim().min(10).max(500),
    }).parse(request.body);
    
    const preservationService = (orchestrator as any).preservationService;
    
    await preservationService.releaseLegalHold(
      id,
      body.cameraId,
      request.currentUser.id,
      body.reason
    );
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:release-legal-hold',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, cameraId: body.cameraId, reason: body.reason },
    });
    
    return { success: true };
  });
  
  // ============ WORKFLOW OPERATIONS ============
  
  /**
   * GET /v1/incidents/:id/available-transitions
   * Get available status transitions for current state
   */
  app.get('/v1/incidents/:id/available-transitions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const incident = await store.getIncident(id);
    if (!incident || incident.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    const workflowService = (orchestrator as any).workflowService;
    const transitions = workflowService.getAvailableTransitions(
      incident.status,
      request.currentUser.role
    );
    
    return { 
      currentStatus: incident.status,
      availableTransitions: transitions,
    };
  });
  
  /**
   * GET /v1/incidents/:id/closure-validation
   * Validate if incident can be closed
   */
  app.get('/v1/incidents/:id/closure-validation', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const workflowService = (orchestrator as any).workflowService;
    const validation = await workflowService.validateClosure(id);
    
    return validation;
  });
  
  // ============ SLA OPERATIONS ============
  
  /**
   * GET /v1/incidents/:id/sla-status
   * Get SLA status and deadlines
   */
  app.get('/v1/incidents/:id/sla-status', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const slaService = (orchestrator as any).slaService;
    const status = await slaService.getSLAStatus(id);
    
    if (!status) {
      return { error: 'incident_not_found' };
    }
    
    return status;
  });
  
  // ============ REPORT GENERATION ============
  
  /**
   * POST /v1/incidents/:id/generate-report
   * Auto-generate investigation report
   */
  app.post('/v1/incidents/:id/generate-report', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createDefaultReportSchema.parse(request.body);
    
    const workspace = await orchestrator.getInvestigationWorkspace(id);
    const incident = workspace.incident;
    
    // Auto-generate report content
    const executiveSummary = body.autoGenerateSummary 
      ? await generateExecutiveSummary(workspace)
      : undefined;
    
    const detailedChronology = await generateChronology(workspace);
    const findings = await generateFindings(workspace);
    
    const report = await store.createIncidentReport({
      incidentId: id,
      reportType: body.reportType,
      executiveSummary,
      detailedChronology,
      findings,
      createdBy: request.currentUser.id,
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:generate-report',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, reportId: report.id, reportType: body.reportType },
    });
    
    return reply.code(201).send(report);
  });
  
  // ============ STATISTICS AND MONITORING ============
  
  /**
   * GET /v1/incidents/system-statistics
   * Get incident system statistics
   */
  app.get('/v1/incidents/system-statistics', async (request: FastifyRequest) => {
    const stats = orchestrator.getStatistics();
    
    return stats;
  });
  
  /**
   * GET /v1/incidents/workflow-diagram
   * Get workflow state machine diagram
   */
  app.get('/v1/incidents/workflow-diagram', async (request: FastifyRequest) => {
    const stats = orchestrator.getStatistics();
    
    return {
      diagram: stats.workflow,
    };
  });
}

// ============ HELPER FUNCTIONS ============

async function generateExecutiveSummary(workspace: any): Promise<string> {
  const incident = workspace.incident;
  const tasks = workspace.tasks;
  const evidence = workspace.evidenceItems;
  
  const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
  const totalTasks = tasks.length;
  
  return `Incident ${incident.incidentNumber} - ${incident.title}

Type: ${incident.incidentType}
Severity: ${incident.severity}
Status: ${incident.status}
Occurred: ${new Date(incident.occurredAt).toLocaleString()}

Evidence Collected: ${evidence.length} items
Tasks Completed: ${completedTasks}/${totalTasks}

${incident.description || 'No additional details.'}`;
}

async function generateChronology(workspace: any): Promise<string> {
  const timeline = workspace.timeline;
  
  const lines = ['Incident Timeline:', ''];
  
  for (const event of timeline) {
    const time = new Date(event.createdAt).toLocaleString();
    const actor = event.createdBy || 'System';
    lines.push(`[${time}] ${actor}: ${event.description}`);
  }
  
  return lines.join('\n');
}

async function generateFindings(workspace: any): Promise<string> {
  const incident = workspace.incident;
  const evidence = workspace.evidenceItems;
  const cameras = workspace.cameras;
  
  const lines = ['Investigation Findings:', ''];
  
  lines.push(`Detection Method: ${incident.detectionSource}`);
  
  if (incident.aiConfidence) {
    lines.push(`AI Confidence: ${Math.round(incident.aiConfidence * 100)}%`);
  }
  
  lines.push(`Cameras Involved: ${cameras.length}`);
  lines.push(`Evidence Items: ${evidence.length}`);
  
  if (workspace.policeIntimations.length > 0) {
    lines.push(`Police Intimated: Yes`);
  }
  
  if (workspace.insuranceClaims.length > 0) {
    lines.push(`Insurance Claim Filed: Yes`);
  }
  
  return lines.join('\n');
}
