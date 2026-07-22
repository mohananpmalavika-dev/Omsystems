import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

// ============ VALIDATION SCHEMAS ============

const createIncidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  incidentType: z.string().optional(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']).default('P3'),
  branchId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
  detectionSource: z.string().optional(),
  estimatedLoss: z.number().nonnegative().optional(),
  injuryDetails: z.string().max(1000).optional(),
  confidentialityLevel: z.enum(['public', 'internal', 'confidential', 'restricted', 'highly-restricted']).default('internal'),
  policeRequired: z.boolean().default(false),
  insuranceRequired: z.boolean().default(false),
});

const listIncidentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  status: z.string().optional(),
  incidentType: z.string().optional(),
  severity: z.string().optional(),
  branchId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const updateIncidentSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  incidentType: z.string().optional(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']).optional(),
  estimatedLoss: z.number().nonnegative().optional(),
  injuryDetails: z.string().max(1000).optional(),
  confidentialityLevel: z.enum(['public', 'internal', 'confidential', 'restricted', 'highly-restricted']).optional(),
  policeRequired: z.boolean().optional(),
  insuranceRequired: z.boolean().optional(),
});

const updateStatusSchema = z.object({
  status: z.string(),
  notes: z.string().max(2000).optional(),
});

const assignSchema = z.object({
  userId: z.string().uuid(),
});

const escalateSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  recipients: z.array(z.string().email()).min(1),
});


const addParticipantSchema = z.object({
  role: z.string(),
  personType: z.enum(['customer', 'employee', 'vendor', 'visitor', 'unknown']),
  name: z.string().max(200).optional(),
  employeeId: z.string().max(50).optional(),
  customerId: z.string().max(50).optional(),
  contactPhone: z.string().max(20).optional(),
  contactEmail: z.string().email().optional(),
  notes: z.string().max(1000).optional(),
});

const addCameraSchema = z.object({
  cameraId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

const addVideoRangeSchema = z.object({
  cameraId: z.string().uuid(),
  fromAt: z.string().datetime(),
  toAt: z.string().datetime(),
  applyLegalHold: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

const preserveVideoAutomaticSchema = z.object({
  cameraId: z.string().uuid(),
  incidentTime: z.string().datetime(),
  preRollMinutes: z.number().int().min(1).max(60).default(5),
  postRollMinutes: z.number().int().min(1).max(120).default(10),
});

const createClipSchema = z.object({
  cameraId: z.string().uuid(),
  sourceSegmentIds: z.array(z.string().uuid()),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  clipType: z.enum(['original-segment', 'investigation-copy', 'export-copy']),
  hasWatermark: z.boolean().default(false),
  hasTimestamp: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

const createSnapshotSchema = z.object({
  cameraId: z.string().uuid(),
  segmentId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  snapshotType: z.enum(['original', 'annotated', 'cropped', 'enhanced']),
  description: z.string().max(500).optional(),
  annotations: z.record(z.unknown()).optional(),
  enhancementDetails: z.record(z.unknown()).optional(),
});

const addEvidenceItemSchema = z.object({
  itemType: z.string(),
  title: z.string().trim().min(3).max(200),
  description: z.string().max(1000).optional(),
  referenceId: z.string().max(100).optional(),
  storagePath: z.string().max(500).optional(),
  checksumSha256: z.string().length(64).optional(),
});

const createEvidencePackageSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(1000).optional(),
  includeOriginalVideo: z.boolean().default(true),
  includeInvestigationClips: z.boolean().default(true),
  includeSnapshots: z.boolean().default(true),
  includeTimeline: z.boolean().default(true),
  includeAlertLogs: z.boolean().default(true),
  includeDocuments: z.boolean().default(true),
});


const createPoliceIntimationSchema = z.object({
  policeStation: z.string().trim().min(3).max(200),
  policeStationAddress: z.string().max(500).optional(),
  intimationMethod: z.enum(['in-person', 'email', 'phone', 'portal', 'other']),
  intimatedAt: z.string().datetime(),
  officerName: z.string().max(100).optional(),
  officerDesignation: z.string().max(100).optional(),
  officerContact: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

const updatePoliceIntimationSchema = z.object({
  gdNumber: z.string().max(100).optional(),
  firNumber: z.string().max(100).optional(),
  firDate: z.string().datetime().optional(),
  status: z.string().optional(),
  investigationOfficer: z.string().max(100).optional(),
  investigationOfficerContact: z.string().max(50).optional(),
  followUpDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

const recordPoliceTransferSchema = z.object({
  policeIntimationId: z.string().uuid(),
  transferDate: z.string().datetime(),
  evidencePackageId: z.string().uuid().optional(),
  evidenceDescription: z.string().trim().min(10).max(1000),
  recipientName: z.string().trim().min(3).max(100),
  recipientDesignation: z.string().max(100).optional(),
  transferMethod: z.enum(['physical-media', 'secure-link', 'portal', 'in-person', 'other']),
  notes: z.string().max(1000).optional(),
});

const createInsuranceClaimSchema = z.object({
  insuranceCompany: z.string().trim().min(3).max(200),
  policyNumber: z.string().trim().min(3).max(100),
  dateOfLoss: z.string().datetime(),
  estimatedLoss: z.number().nonnegative(),
  claimAmount: z.number().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
});

const updateInsuranceClaimSchema = z.object({
  claimNumber: z.string().max(100).optional(),
  submittedDate: z.string().datetime().optional(),
  submittedBy: z.string().uuid().optional(),
  surveyorName: z.string().max(100).optional(),
  surveyorContact: z.string().max(50).optional(),
  surveyDate: z.string().datetime().optional(),
  status: z.string().optional(),
  settlementAmount: z.number().nonnegative().optional(),
  settlementDate: z.string().datetime().optional(),
  rejectionReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const addInsuranceDocumentSchema = z.object({
  claimId: z.string().uuid(),
  documentType: z.string().trim().min(3).max(100),
  documentTitle: z.string().trim().min(3).max(200),
  documentPath: z.string().max(500).optional(),
});


const createTaskSchema = z.object({
  taskName: z.string().trim().min(3).max(200),
  description: z.string().max(1000).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  isMandatory: z.boolean().default(false),
});

const updateTaskSchema = z.object({
  taskName: z.string().trim().min(3).max(200).optional(),
  description: z.string().max(1000).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']).optional(),
});

const completeTaskSchema = z.object({
  completionNotes: z.string().max(1000).optional(),
});

const addNoteSchema = z.object({
  noteType: z.enum(['general', 'investigation', 'management', 'legal', 'confidential']).default('general'),
  content: z.string().trim().min(10).max(5000),
});

const createSecureShareSchema = z.object({
  evidencePackageId: z.string().uuid().optional(),
  recipientName: z.string().trim().min(3).max(100),
  recipientOrganization: z.string().trim().min(3).max(200),
  recipientEmail: z.string().email().optional(),
  purpose: z.string().trim().min(10).max(500),
  maxDownloads: z.number().int().min(1).max(10).default(1),
  expiresAt: z.string().datetime(),
  watermarked: z.boolean().default(true),
  encrypted: z.boolean().default(true),
});

const verifySecureShareSchema = z.object({
  token: z.string(),
  oneTimePassword: z.string().optional(),
});

const revokeSecureShareSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

const createReportSchema = z.object({
  reportType: z.enum(['preliminary', 'investigation', 'final', 'executive-summary']),
  executiveSummary: z.string().max(2000).optional(),
  detailedChronology: z.string().max(10000).optional(),
  findings: z.string().max(5000).optional(),
  rootCause: z.string().max(2000).optional(),
  controlFailures: z.string().max(2000).optional(),
  correctiveActions: z.string().max(2000).optional(),
  preventiveActions: z.string().max(2000).optional(),
  recommendations: z.string().max(2000).optional(),
  conclusions: z.string().max(2000).optional(),
  unresolvedQuestions: z.string().max(2000).optional(),
});

const dashboardQuery = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});


// ============ ROUTE HANDLERS ============

export async function registerIncidentsRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  
  // ============ CORE INCIDENT OPERATIONS ============
  
  app.post('/v1/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createIncidentSchema.parse(request.body);
    
    const incident = await store.createIncident({
      tenantId: request.currentUser.tenantId,
      branchId: body.branchId,
      title: body.title,
      description: body.description,
      incidentType: body.incidentType ?? 'other',
      severity: body.severity,
      detectionSource: body.detectionSource ?? 'manual-operator',
      occurredAt: body.occurredAt,
      reportedBy: request.currentUser.id,
      estimatedLoss: body.estimatedLoss,
      injuryDetails: body.injuryDetails,
      confidentialityLevel: body.confidentialityLevel,
      policeRequired: body.policeRequired,
      insuranceRequired: body.insuranceRequired,
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:create',
      resourceNodeId: body.branchId ?? null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: incident.id, incidentNumber: incident.incidentNumber },
    });
    
    return reply.code(201).send(incident);
  });

  app.get('/v1/incidents', async (request: FastifyRequest) => {
    const query = listIncidentsQuery.parse(request.query);
    
    const incidents = await store.listIncidents(request.currentUser.tenantId, {
      limit: query.limit,
      status: query.status,
      incidentType: query.incidentType,
      severity: query.severity,
      branchId: query.branchId,
      assignedTo: query.assignedTo,
      from: query.from,
      to: query.to,
    });
    
    return { data: incidents };
  });

  app.get('/v1/incidents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const incident = await store.getIncident(id);
    if (!incident || incident.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    return incident;
  });

  app.patch('/v1/incidents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateIncidentSchema.parse(request.body);
    
    const updated = await store.updateIncident(id, body);
    if (!updated) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:update',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id },
    });
    
    return updated;
  });


  app.patch('/v1/incidents/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateStatusSchema.parse(request.body);
    
    const updated = await store.updateIncidentStatus(id, body.status, request.currentUser.id, body.notes);
    if (!updated) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident:update',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, status: body.status },
    });
    
    return updated;
  });

  app.post('/v1/incidents/:id/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = assignSchema.parse(request.body);
    
    const updated = await store.assignIncident(id, body.userId, request.currentUser.id);
    if (!updated) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/incidents/:id/escalate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = escalateSchema.parse(request.body);
    
    const updated = await store.escalateIncident(id, request.currentUser.id, body.reason, body.recipients);
    if (!updated) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/incidents/:id/close', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ notes: z.string().max(2000).optional() }).parse(request.body);
    
    const updated = await store.closeIncident(id, request.currentUser.id, body.notes);
    if (!updated) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/incidents/:id/reopen', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ reason: z.string().trim().min(10).max(1000) }).parse(request.body);
    
    const updated = await store.reopenIncident(id, request.currentUser.id, body.reason);
    if (!updated) {
      return reply.code(404).send({ error: 'incident_not_found' });
    }
    
    return updated;
  });


  // ============ PARTICIPANTS ============
  
  app.post('/v1/incidents/:id/participants', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = addParticipantSchema.parse(request.body);
    
    const participant = await store.addIncidentParticipant({
      incidentId: id,
      role: body.role,
      personType: body.personType,
      name: body.name,
      employeeId: body.employeeId,
      customerId: body.customerId,
      contactPhone: body.contactPhone,
      contactEmail: body.contactEmail,
      notes: body.notes,
      addedBy: request.currentUser.id,
    });
    
    return reply.code(201).send(participant);
  });

  app.get('/v1/incidents/:id/participants', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const participants = await store.listIncidentParticipants(id);
    return { data: participants };
  });

  // ============ CAMERAS AND VIDEO ============
  
  app.post('/v1/incidents/:id/cameras', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = addCameraSchema.parse(request.body);
    
    await store.addIncidentCamera(id, body.cameraId, body.isPrimary, request.currentUser.id);
    
    return reply.code(201).send({ success: true });
  });

  app.get('/v1/incidents/:id/cameras', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const cameras = await store.listIncidentCameras(id);
    return { data: cameras };
  });

  app.post('/v1/incidents/:id/video-ranges', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = addVideoRangeSchema.parse(request.body);
    
    const range = await store.addIncidentVideoRange({
      incidentId: id,
      cameraId: body.cameraId,
      fromAt: body.fromAt,
      toAt: body.toAt,
      preservedBy: request.currentUser.id,
      applyLegalHold: body.applyLegalHold,
      notes: body.notes,
    });
    
    return reply.code(201).send(range);
  });

  app.post('/v1/incidents/:id/preserve-video', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = preserveVideoAutomaticSchema.parse(request.body);
    
    const range = await store.preserveIncidentVideoAutomatic({
      incidentId: id,
      cameraId: body.cameraId,
      incidentTime: body.incidentTime,
      preRollMinutes: body.preRollMinutes,
      postRollMinutes: body.postRollMinutes,
      preservedBy: request.currentUser.id,
    });
    
    return reply.code(201).send(range);
  });

  app.get('/v1/incidents/:id/video-ranges', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const ranges = await store.listIncidentVideoRanges(id);
    return { data: ranges };
  });


  // ============ TIMELINE ============
  
  app.get('/v1/incidents/:id/timeline', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const timeline = await store.listIncidentTimeline(id);
    return { data: timeline };
  });

  // ============ CLIPS AND SNAPSHOTS ============
  
  app.post('/v1/incidents/:id/clips', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createClipSchema.parse(request.body);
    
    const clip = await store.createIncidentClip({
      incidentId: id,
      cameraId: body.cameraId,
      sourceSegmentIds: body.sourceSegmentIds,
      startTime: body.startTime,
      endTime: body.endTime,
      clipType: body.clipType,
      hasWatermark: body.hasWatermark,
      hasTimestamp: body.hasTimestamp,
      createdBy: request.currentUser.id,
      notes: body.notes,
    });
    
    return reply.code(201).send(clip);
  });

  app.get('/v1/incidents/:id/clips', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const clips = await store.listIncidentClips(id);
    return { data: clips };
  });

  app.post('/v1/incidents/:id/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createSnapshotSchema.parse(request.body);
    
    const snapshot = await store.createIncidentSnapshot({
      incidentId: id,
      cameraId: body.cameraId,
      segmentId: body.segmentId,
      timestamp: body.timestamp,
      snapshotType: body.snapshotType,
      description: body.description,
      annotations: body.annotations,
      enhancementDetails: body.enhancementDetails,
      createdBy: request.currentUser.id,
    });
    
    return reply.code(201).send(snapshot);
  });

  app.get('/v1/incidents/:id/snapshots', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const snapshots = await store.listIncidentSnapshots(id);
    return { data: snapshots };
  });


  // ============ EVIDENCE ITEMS AND PACKAGES ============
  
  app.post('/v1/incidents/:id/evidence-items', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = addEvidenceItemSchema.parse(request.body);
    
    const item = await store.addIncidentEvidenceItem({
      incidentId: id,
      itemType: body.itemType,
      title: body.title,
      description: body.description,
      referenceId: body.referenceId,
      storagePath: body.storagePath,
      checksumSha256: body.checksumSha256,
      addedBy: request.currentUser.id,
    });
    
    return reply.code(201).send(item);
  });

  app.get('/v1/incidents/:id/evidence-items', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const items = await store.listIncidentEvidenceItems(id);
    return { data: items };
  });

  app.post('/v1/incidents/:id/evidence-packages', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createEvidencePackageSchema.parse(request.body);
    
    const pkg = await store.createIncidentEvidencePackage({
      incidentId: id,
      title: body.title,
      description: body.description,
      includeOriginalVideo: body.includeOriginalVideo,
      includeInvestigationClips: body.includeInvestigationClips,
      includeSnapshots: body.includeSnapshots,
      includeTimeline: body.includeTimeline,
      includeAlertLogs: body.includeAlertLogs,
      includeDocuments: body.includeDocuments,
      createdBy: request.currentUser.id,
    });
    
    return reply.code(201).send(pkg);
  });

  app.get('/v1/incidents/:id/evidence-packages', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const packages = await store.listIncidentEvidencePackages(id);
    return { data: packages };
  });

  app.get('/v1/evidence-packages/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const pkg = await store.getIncidentEvidencePackage(id);
    
    if (!pkg) {
      return reply.code(404).send({ error: 'package_not_found' });
    }
    
    return pkg;
  });

  app.post('/v1/evidence-packages/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const pkg = await store.approveEvidencePackage(id, request.currentUser.id);
    if (!pkg) {
      return reply.code(404).send({ error: 'package_not_found' });
    }
    
    return pkg;
  });

  app.post('/v1/evidence-packages/:id/download', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const pkg = await store.recordEvidencePackageDownload(id, request.currentUser.id);
    if (!pkg) {
      return reply.code(404).send({ error: 'package_not_found' });
    }
    
    return pkg;
  });


  // ============ POLICE INTIMATION ============
  
  app.post('/v1/incidents/:id/police-intimations', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createPoliceIntimationSchema.parse(request.body);
    
    const intimation = await store.createPoliceIntimation({
      incidentId: id,
      policeStation: body.policeStation,
      policeStationAddress: body.policeStationAddress,
      intimationMethod: body.intimationMethod,
      intimatedAt: body.intimatedAt,
      intimatedBy: request.currentUser.id,
      officerName: body.officerName,
      officerDesignation: body.officerDesignation,
      officerContact: body.officerContact,
      notes: body.notes,
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'police:update',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, intimationId: intimation.id },
    });
    
    return reply.code(201).send(intimation);
  });

  app.get('/v1/incidents/:id/police-intimations', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const intimations = await store.listPoliceIntimations(id);
    return { data: intimations };
  });

  app.patch('/v1/police-intimations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updatePoliceIntimationSchema.parse(request.body);
    
    const updated = await store.updatePoliceIntimation(id, body);
    if (!updated) {
      return reply.code(404).send({ error: 'intimation_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/incidents/:id/police-evidence-transfers', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = recordPoliceTransferSchema.parse(request.body);
    
    const transfer = await store.recordPoliceEvidenceTransfer({
      incidentId: id,
      policeIntimationId: body.policeIntimationId,
      transferDate: body.transferDate,
      transferredBy: request.currentUser.id,
      evidencePackageId: body.evidencePackageId,
      evidenceDescription: body.evidenceDescription,
      recipientName: body.recipientName,
      recipientDesignation: body.recipientDesignation,
      transferMethod: body.transferMethod,
      notes: body.notes,
    });
    
    return reply.code(201).send(transfer);
  });

  app.get('/v1/incidents/:id/police-evidence-transfers', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const transfers = await store.listPoliceEvidenceTransfers(id);
    return { data: transfers };
  });


  // ============ INSURANCE CLAIMS ============
  
  app.post('/v1/incidents/:id/insurance-claims', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createInsuranceClaimSchema.parse(request.body);
    
    const claim = await store.createInsuranceClaim({
      incidentId: id,
      insuranceCompany: body.insuranceCompany,
      policyNumber: body.policyNumber,
      dateOfLoss: body.dateOfLoss,
      estimatedLoss: body.estimatedLoss,
      claimAmount: body.claimAmount,
      notes: body.notes,
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'insurance:update',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, claimId: claim.id },
    });
    
    return reply.code(201).send(claim);
  });

  app.get('/v1/incidents/:id/insurance-claims', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const claims = await store.listInsuranceClaims(id);
    return { data: claims };
  });

  app.patch('/v1/insurance-claims/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateInsuranceClaimSchema.parse(request.body);
    
    const updated = await store.updateInsuranceClaim(id, body);
    if (!updated) {
      return reply.code(404).send({ error: 'claim_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/incidents/:id/insurance-documents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = addInsuranceDocumentSchema.parse(request.body);
    
    const document = await store.addInsuranceDocument({
      incidentId: id,
      claimId: body.claimId,
      documentType: body.documentType,
      documentTitle: body.documentTitle,
      documentPath: body.documentPath,
      uploadedBy: request.currentUser.id,
    });
    
    return reply.code(201).send(document);
  });

  app.get('/v1/incidents/:id/insurance-documents', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z.object({ claimId: z.string().uuid().optional() }).parse(request.query);
    
    const documents = await store.listInsuranceDocuments(id, query.claimId);
    return { data: documents };
  });


  // ============ TASKS ============
  
  app.post('/v1/incidents/:id/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createTaskSchema.parse(request.body);
    
    const task = await store.createIncidentTask({
      incidentId: id,
      taskName: body.taskName,
      description: body.description,
      assignedTo: body.assignedTo,
      dueDate: body.dueDate,
      priority: body.priority,
      isMandatory: body.isMandatory,
      createdBy: request.currentUser.id,
    });
    
    return reply.code(201).send(task);
  });

  app.get('/v1/incidents/:id/tasks', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const tasks = await store.listIncidentTasks(id);
    return { data: tasks };
  });

  app.patch('/v1/tasks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateTaskSchema.parse(request.body);
    
    const updated = await store.updateIncidentTask(id, body);
    if (!updated) {
      return reply.code(404).send({ error: 'task_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/tasks/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = completeTaskSchema.parse(request.body);
    
    const completed = await store.completeIncidentTask(id, request.currentUser.id, body.completionNotes);
    if (!completed) {
      return reply.code(404).send({ error: 'task_not_found' });
    }
    
    return completed;
  });

  // ============ NOTES ============
  
  app.post('/v1/incidents/:id/notes', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = addNoteSchema.parse(request.body);
    
    const note = await store.addIncidentNote({
      incidentId: id,
      noteType: body.noteType,
      content: body.content,
      createdBy: request.currentUser.id,
    });
    
    return reply.code(201).send(note);
  });

  app.get('/v1/incidents/:id/notes', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z.object({ noteType: z.string().optional() }).parse(request.query);
    
    const notes = await store.listIncidentNotes(id, query.noteType);
    return { data: notes };
  });

  app.patch('/v1/notes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ content: z.string().trim().min(10).max(5000) }).parse(request.body);
    
    const updated = await store.updateIncidentNote(id, body.content);
    if (!updated) {
      return reply.code(404).send({ error: 'note_not_found' });
    }
    
    return updated;
  });

  app.delete('/v1/notes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    await store.deleteIncidentNote(id);
    return reply.code(204).send();
  });


  // ============ SECURE SHARING ============
  
  app.post('/v1/incidents/:id/secure-shares', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createSecureShareSchema.parse(request.body);
    
    const share = await store.createSecureShare({
      incidentId: id,
      evidencePackageId: body.evidencePackageId,
      recipientName: body.recipientName,
      recipientOrganization: body.recipientOrganization,
      recipientEmail: body.recipientEmail,
      purpose: body.purpose,
      maxDownloads: body.maxDownloads,
      expiresAt: body.expiresAt,
      watermarked: body.watermarked,
      encrypted: body.encrypted,
      createdBy: request.currentUser.id,
    });
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'evidence:share',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { incidentId: id, shareId: share.id, recipientOrganization: body.recipientOrganization },
    });
    
    return reply.code(201).send(share);
  });

  app.get('/v1/incidents/:id/secure-shares', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const shares = await store.listSecureShares(id);
    return { data: shares };
  });

  app.post('/v1/secure-shares/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = verifySecureShareSchema.parse(request.body);
    
    const verification = await store.verifySecureShareAccess(body.token, body.oneTimePassword);
    
    if (!verification.allowed) {
      return reply.code(403).send({ error: verification.error });
    }
    
    return verification.share;
  });

  app.post('/v1/secure-shares/:id/download', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const updated = await store.recordSecureShareDownload({
      id,
      downloadedBy: request.currentUser?.id || 'external',
      downloadIp: request.ip,
    });
    
    if (!updated) {
      return reply.code(404).send({ error: 'share_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/secure-shares/:id/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = revokeSecureShareSchema.parse(request.body);
    
    const revoked = await store.revokeSecureShare(id, request.currentUser.id, body.reason);
    if (!revoked) {
      return reply.code(404).send({ error: 'share_not_found' });
    }
    
    return revoked;
  });


  // ============ INCIDENT REPORTS ============
  
  app.post('/v1/incidents/:id/reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createReportSchema.parse(request.body);
    
    const report = await store.createIncidentReport({
      incidentId: id,
      reportType: body.reportType,
      executiveSummary: body.executiveSummary,
      detailedChronology: body.detailedChronology,
      findings: body.findings,
      rootCause: body.rootCause,
      controlFailures: body.controlFailures,
      correctiveActions: body.correctiveActions,
      preventiveActions: body.preventiveActions,
      recommendations: body.recommendations,
      conclusions: body.conclusions,
      unresolvedQuestions: body.unresolvedQuestions,
      createdBy: request.currentUser.id,
    });
    
    return reply.code(201).send(report);
  });

  app.get('/v1/incidents/:id/reports', async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const reports = await store.listIncidentReports(id);
    return { data: reports };
  });

  app.get('/v1/incident-reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const report = await store.getIncidentReport(id);
    
    if (!report) {
      return reply.code(404).send({ error: 'report_not_found' });
    }
    
    return report;
  });

  app.patch('/v1/incident-reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = request.body as any;
    
    const updated = await store.updateIncidentReport(id, body);
    if (!updated) {
      return reply.code(404).send({ error: 'report_not_found' });
    }
    
    return updated;
  });

  app.post('/v1/incident-reports/:id/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const reviewed = await store.reviewIncidentReport(id, request.currentUser.id);
    if (!reviewed) {
      return reply.code(404).send({ error: 'report_not_found' });
    }
    
    return reviewed;
  });

  app.post('/v1/incident-reports/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    
    const approved = await store.approveIncidentReport(id, request.currentUser.id);
    if (!approved) {
      return reply.code(404).send({ error: 'report_not_found' });
    }
    
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'incident-report:approve',
      resourceNodeId: null,
      outcome: 'success',
      sourceIp: request.ip,
      details: { reportId: id },
    });
    
    return approved;
  });

  app.post('/v1/incident-reports/:id/finalize', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ reportPath: z.string().max(500).optional() }).parse(request.body);
    
    const finalized = await store.finalizeIncidentReport(id, body.reportPath);
    if (!finalized) {
      return reply.code(404).send({ error: 'report_not_found' });
    }
    
    return finalized;
  });


  // ============ DASHBOARD AND ANALYTICS ============
  
  app.get('/v1/incidents/dashboard', async (request: FastifyRequest) => {
    const query = dashboardQuery.parse(request.query);
    
    const dashboard = await store.getIncidentsDashboard(request.currentUser.tenantId, {
      branchId: query.branchId,
      from: query.from,
      to: query.to,
    });
    
    return dashboard;
  });

  app.get('/v1/incidents/statistics/:period', async (request: FastifyRequest) => {
    const { period } = z.object({ 
      period: z.enum(['week', 'month', 'quarter', 'year']).default('month') 
    }).parse(request.params);
    
    const statistics = await store.getIncidentStatistics(request.currentUser.tenantId, period);
    
    return statistics;
  });
}

