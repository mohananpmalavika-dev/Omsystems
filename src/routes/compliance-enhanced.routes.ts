import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

function cleanObject<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const idParams = z.object({ id: z.string().uuid() });

// Query schemas
const queryListRequirements = z.object({
  frameworkId: z.string().uuid().optional(),
  category: z.string().optional(),
  status: z.enum(["active", "draft", "deprecated", "archived"]).optional(),
});

const queryListControls = z.object({
  requirementId: z.string().uuid().optional(),
  implementationStatus: z.enum(["planned", "in_progress", "implemented", "verified", "failed"]).optional(),
});

const queryListEvidence = z.object({
  requirementId: z.string().uuid().optional(),
  controlId: z.string().uuid().optional(),
  assessmentId: z.string().uuid().optional(),
  validated: z.coerce.boolean().optional(),
});

const queryListTests = z.object({
  controlId: z.string().uuid().optional(),
  status: z.enum(["not_started", "in_progress", "passed", "failed", "not_applicable"]).optional(),
});

const queryListFindings = z.object({
  assessmentId: z.string().uuid().optional(),
  severity: z.enum(["critical", "high", "medium", "low", "negligible"]).optional(),
  status: z.enum(["open", "in_review", "remediation_planned", "remediation_in_progress", 
    "remediation_completed", "verified", "closed", "accepted_risk"]).optional(),
});

const queryListRemediationPlans = z.object({
  findingId: z.string().uuid().optional(),
  status: z.enum(["identified", "planned", "in_progress", "completed", "verified", "closed"]).optional(),
});

const queryListRisks = z.object({
  frameworkId: z.string().uuid().optional(),
  category: z.enum(["operational", "compliance", "financial", "reputational", 
    "strategic", "technology", "third_party", "legal"]).optional(),
  status: z.enum(["identified", "assessed", "treated", "monitored", "closed"]).optional(),
});

// Input schemas for Requirements
const requirementSchema = z.object({
  frameworkId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  requirementCode: z.string().trim().min(1).max(200),
  title: z.string().trim().min(2).max(500),
  description: z.string().trim().min(1),
  category: z.string().trim().max(200).optional(),
  controlType: z.enum(["preventive", "detective", "corrective", "compensating", "directive"]).optional(),
  isMandatory: z.boolean().default(true),
  applicableTo: z.array(z.string()).optional(),
  testingFrequencyDays: z.number().int().min(1).max(3650).optional(),
  evidenceRequired: z.boolean().default(true),
  ownerRole: z.string().trim().max(200).optional(),
  ownerUserId: z.string().uuid().optional(),
  status: z.enum(["active", "draft", "deprecated", "archived"]).default("active"),
  implementationGuidance: z.string().optional(),
  referenceLinks: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

// Input schemas for Controls
const controlSchema = z.object({
  requirementId: z.string().uuid(),
  controlName: z.string().trim().min(2).max(300),
  controlDescription: z.string().trim().min(1),
  controlType: z.enum(["preventive", "detective", "corrective", "compensating", "directive"]),
  implementationStatus: z.enum(["planned", "in_progress", "implemented", "verified", "failed"]).default("planned"),
  effectivenessRating: z.number().int().min(1).max(5).optional(),
  testFrequencyDays: z.number().int().min(1).max(3650).default(90),
  technicalImplementation: z.string().optional(),
  automated: z.boolean().default(false),
  continuousMonitoring: z.boolean().default(false),
  controlOwner: z.string().uuid().optional(),
  responsibleTeam: z.string().trim().max(200).optional(),
  procedureDocumentUrl: z.string().url().optional(),
  trainingRequired: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

// Input schemas for Evidence
const evidenceSchema = z.object({
  requirementId: z.string().uuid().optional(),
  controlId: z.string().uuid().optional(),
  assessmentId: z.string().uuid().optional(),
  evidenceType: z.enum(["document", "screenshot", "log_file", "certificate", 
    "test_result", "audit_report", "video_recording", "configuration",
    "interview", "observation", "automated_scan"]),
  title: z.string().trim().min(2).max(300),
  description: z.string().optional(),
  fileUrl: z.string().url().optional(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  fileMimeType: z.string().max(200).optional(),
  collectionDate: z.string().datetime().optional(),
  evidenceDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  sensitivity: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"),
});

// Input schemas for Tests
const testSchema = z.object({
  controlId: z.string().uuid(),
  testName: z.string().trim().min(2).max(300),
  testType: z.enum(["design_review", "implementation_test", "effectiveness_test",
    "penetration_test", "vulnerability_scan", "configuration_review",
    "access_review", "log_review", "interview", "observation"]),
  testDate: z.string().datetime(),
  testerName: z.string().trim().max(200).optional(),
  status: z.enum(["not_started", "in_progress", "passed", "failed", "not_applicable"]).default("not_started"),
  testProcedure: z.string().optional(),
  testCriteria: z.string().optional(),
  sampleSize: z.number().int().min(0).optional(),
  findings: z.string().optional(),
  issuesFound: z.number().int().min(0).default(0),
  riskRating: z.enum(["critical", "high", "medium", "low", "negligible"]).optional(),
  passFail: z.boolean().optional(),
  score: z.number().min(0).max(100).optional(),
  evidenceCollected: z.array(z.string()).optional(),
  recommendations: z.string().optional(),
  nextTestDate: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Input schemas for Findings
const findingSchema = z.object({
  assessmentId: z.string().uuid().optional(),
  testId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  controlId: z.string().uuid().optional(),
  findingNumber: z.string().trim().min(1).max(100),
  title: z.string().trim().min(2).max(500),
  description: z.string().trim().min(1),
  findingType: z.enum(["non_compliance", "gap", "weakness", "observation", 
    "best_practice", "risk", "deficiency"]),
  severity: z.enum(["critical", "high", "medium", "low", "negligible"]),
  likelihood: z.enum(["critical", "high", "medium", "low", "negligible"]),
  impactDescription: z.string().optional(),
  rootCause: z.string().optional(),
  affectedSystems: z.array(z.string()).optional(),
  affectedLocations: z.array(z.string().uuid()).optional(),
  discoveredDate: z.string().datetime().optional(),
  status: z.enum(["open", "in_review", "remediation_planned", "remediation_in_progress",
    "remediation_completed", "verified", "closed", "accepted_risk"]).default("open"),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  recommendations: z.string().optional(),
});

// Input schemas for Remediation Plans
const remediationPlanSchema = z.object({
  findingId: z.string().uuid(),
  planNumber: z.string().trim().min(1).max(100),
  title: z.string().trim().min(2).max(500),
  description: z.string().trim().min(1),
  status: z.enum(["identified", "planned", "in_progress", "completed", "verified", "closed"]).default("identified"),
  proposedSolution: z.string().trim().min(1),
  implementationSteps: z.string().optional(),
  resourceRequirements: z.string().optional(),
  estimatedCost: z.number().min(0).optional(),
  plannedStartDate: z.string().date().optional(),
  plannedCompletionDate: z.string().date().optional(),
  ownerId: z.string().uuid().optional(),
  approverId: z.string().uuid().optional(),
  progressPercentage: z.number().int().min(0).max(100).default(0),
  verificationRequired: z.boolean().default(true),
  verificationNotes: z.string().optional(),
  lessonsLearned: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Input schemas for Remediation Actions
const remediationActionSchema = z.object({
  planId: z.string().uuid(),
  actionNumber: z.string().trim().min(1).max(100),
  title: z.string().trim().min(2).max(500),
  description: z.string().optional(),
  actionType: z.enum(["technical_change", "policy_update", "training", "process_improvement",
    "system_configuration", "access_change", "documentation", "other"]).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().date().optional(),
  status: z.enum(["pending", "in_progress", "blocked", "completed", "verified"]).default("pending"),
  blockerDescription: z.string().optional(),
  evidenceUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// Input schemas for Risks
const riskSchema = z.object({
  frameworkId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  riskNumber: z.string().trim().min(1).max(100),
  riskTitle: z.string().trim().min(2).max(500),
  riskDescription: z.string().trim().min(1),
  riskCategory: z.enum(["operational", "compliance", "financial", "reputational",
    "strategic", "technology", "third_party", "legal"]).optional(),
  inherentLikelihood: z.enum(["critical", "high", "medium", "low", "negligible"]),
  inherentImpact: z.enum(["critical", "high", "medium", "low", "negligible"]),
  residualLikelihood: z.enum(["critical", "high", "medium", "low", "negligible"]).optional(),
  residualImpact: z.enum(["critical", "high", "medium", "low", "negligible"]).optional(),
  riskTreatment: z.enum(["mitigate", "accept", "transfer", "avoid"]),
  treatmentPlan: z.string().optional(),
  riskOwner: z.string().uuid().optional(),
  status: z.enum(["identified", "assessed", "treated", "monitored", "closed"]).default("identified"),
  reviewFrequencyDays: z.number().int().min(1).max(3650).default(90),
  metadata: z.record(z.unknown()).optional(),
});

async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: string,
) {
  if (!request.currentUser) {
    await reply.code(401).send({ error: "unauthenticated" });
    return false;
  }
  const role = request.currentUser.role ?? "";
  const tenantAdministrators = new Set(["super_admin", "company_admin", "hq_admin"]);
  const canView = tenantAdministrators.has(role) || role === "security_officer" || role === "auditor";
  const canManage = tenantAdministrators.has(role) || role === "security_officer";
  const canAudit = tenantAdministrators.has(role) || role === "security_officer" || role === "auditor";
  const canApprove = tenantAdministrators.has(role) || role === "security_officer";
  const permitted = action === "compliance:view" ? canView
    : action === "compliance:manage" ? canManage
    : action === "compliance:audit" ? canAudit
    : action === "compliance:approve" ? canApprove
    : false;
  if (!permitted) {
    await reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function requireTenantResource<T extends { tenantId?: string }>(request: FastifyRequest, reply: FastifyReply, resource: T | undefined, error: string) {
  if (!resource || resource.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error });
    return undefined;
  }
  return resource;
}

const remediationPlanTransitions: Record<string, readonly string[]> = { identified: ["planned"], planned: ["in_progress"], in_progress: ["completed"], completed: ["verified"], verified: ["closed"], closed: [] };
const remediationActionTransitions: Record<string, readonly string[]> = { pending: ["in_progress", "blocked"], in_progress: ["blocked", "completed"], blocked: ["in_progress", "completed"], completed: ["verified"], verified: [] };
const controlTransitions: Record<string, readonly string[]> = { planned: ["in_progress"], in_progress: ["implemented", "failed"], implemented: ["verified", "failed"], verified: ["failed"], failed: ["in_progress"] };
const riskTransitions: Record<string, readonly string[]> = { identified: ["assessed"], assessed: ["treated"], treated: ["monitored"], monitored: ["assessed", "closed"], closed: [] };
const findingTransitions: Record<string, readonly string[]> = { open: ["in_review", "accepted_risk"], in_review: ["remediation_planned", "accepted_risk"], remediation_planned: ["remediation_in_progress"], remediation_in_progress: ["remediation_completed"], remediation_completed: ["verified"], verified: ["closed"], closed: [], accepted_risk: [] };
const riskScale: Record<string, number> = { negligible: 1, low: 2, medium: 3, high: 4, critical: 5 };
function isValidTransition(transitions: Record<string, readonly string[]>, current: unknown, next: unknown) {
  return typeof current === "string" && typeof next === "string" && (current === next || transitions[current]?.includes(next) === true);
}

async function validateFindingLinks(request: FastifyRequest, reply: FastifyReply, store: ControlPlaneStore, input: Record<string, unknown>, existing?: Record<string, unknown>) {
  const links = {
    assessmentId: input.assessmentId ?? existing?.assessmentId,
    testId: input.testId ?? existing?.testId,
    requirementId: input.requirementId ?? existing?.requirementId,
    controlId: input.controlId ?? existing?.controlId,
  };
  const [assessment, test, requirement, control] = await Promise.all([
    links.assessmentId ? store.getComplianceAssessment(links.assessmentId as string) : undefined,
    links.testId ? store.getComplianceTest(links.testId as string) : undefined,
    links.requirementId ? store.getComplianceRequirement(links.requirementId as string) : undefined,
    links.controlId ? store.getComplianceControl(links.controlId as string) : undefined,
  ]);
  if (links.assessmentId && !(await requireTenantResource(request, reply, assessment, "assessment_not_found"))) return false;
  if (links.testId && !(await requireTenantResource(request, reply, test, "test_not_found"))) return false;
  if (links.requirementId && !(await requireTenantResource(request, reply, requirement, "requirement_not_found"))) return false;
  if (links.controlId && !(await requireTenantResource(request, reply, control, "control_not_found"))) return false;
  if (control && requirement && control.requirementId !== requirement.id) return reply.code(400).send({ error: "control_requirement_mismatch" });
  if (test && control && test.controlId !== control.id) return reply.code(400).send({ error: "test_control_mismatch" });
  if (assessment && requirement && assessment.frameworkId !== requirement.frameworkId) return reply.code(400).send({ error: "assessment_requirement_mismatch" });
  return true;
}

export async function registerComplianceEnhancedRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // ============================================================================
  // REQUIREMENTS ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/requirements", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = queryListRequirements.parse(request.query);
    const requirements = await store.listComplianceRequirements(
      request.currentUser.tenantId,
      query
    );
    return { data: requirements };
  });

  app.post("/v1/compliance/requirements", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const body = requirementSchema.parse(request.body);
    const requirement = await store.createComplianceRequirement({
      ...body,
      requirementNumber: body.requirementCode,
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(requirement);
  });

  app.get("/v1/compliance/requirements/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const requirement = await store.getComplianceRequirement(id);
    if (!requirement) return reply.code(404).send({ error: "requirement_not_found" });
    return requirement;
  });

  app.patch("/v1/compliance/requirements/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = requirementSchema.partial().parse(request.body);
    const requirement = await store.updateComplianceRequirement(id, {
      ...body,
      ...(body.requirementCode ? { requirementNumber: body.requirementCode } : {}),
    });
    if (!requirement) return reply.code(404).send({ error: "requirement_not_found" });
    return requirement;
  });

  app.delete("/v1/compliance/requirements/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    await store.deleteComplianceRequirement(id);
    return reply.code(204).send();
  });

  // ============================================================================
  // CONTROLS ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/controls", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = queryListControls.parse(request.query);
    const controls = await store.listComplianceControls(
      request.currentUser.tenantId,
      query
    );
    return { data: controls };
  });

  app.post("/v1/compliance/controls", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const body = controlSchema.parse(request.body);
    if (body.implementationStatus !== "planned") return reply.code(409).send({ error: "invalid_control_initial_status" });
    if (!(await requireTenantResource(request, reply, await store.getComplianceRequirement(body.requirementId), "requirement_not_found"))) return;
    const control = await store.createComplianceControl({
      ...body,
      controlNumber: body.controlName,
      title: body.controlName,
      description: body.controlDescription,
      testingFrequency: body.testFrequencyDays,
      owner: body.responsibleTeam,
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(control);
  });

  app.get("/v1/compliance/controls/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const control = await requireTenantResource(request, reply, await store.getComplianceControl(id), "control_not_found");
    if (!control) return;
    return control;
  });

  app.patch("/v1/compliance/controls/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = controlSchema.partial().parse(request.body);
    const existing = await requireTenantResource(request, reply, await store.getComplianceControl(id), "control_not_found");
    if (!existing) return;
    if (body.requirementId && !(await requireTenantResource(request, reply, await store.getComplianceRequirement(body.requirementId), "requirement_not_found"))) return;
    if (body.implementationStatus && !isValidTransition(controlTransitions, existing.implementationStatus, body.implementationStatus)) return reply.code(409).send({ error: "invalid_control_transition" });
    const control = await store.updateComplianceControl(id, {
      ...body,
      ...(body.controlName ? { title: body.controlName } : {}),
      ...(body.controlDescription ? { description: body.controlDescription } : {}),
      ...(body.testFrequencyDays ? { testingFrequency: body.testFrequencyDays } : {}),
      ...(body.responsibleTeam ? { owner: body.responsibleTeam } : {}),
    });
    if (!control) return reply.code(404).send({ error: "control_not_found" });
    return control;
  });

  app.delete("/v1/compliance/controls/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    if (!(await requireTenantResource(request, reply, await store.getComplianceControl(id), "control_not_found"))) return;
    await store.deleteComplianceControl(id);
    return reply.code(204).send();
  });

  // Update control test dates
  app.post("/v1/compliance/controls/:id/test", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const { id } = idParams.parse(request.params);
    if (!(await requireTenantResource(request, reply, await store.getComplianceControl(id), "control_not_found"))) return;
    const body = z.object({
      lastTestDate: z.string().datetime(),
      nextTestDate: z.string().datetime(),
      effectivenessRating: z.number().int().min(1).max(5).optional(),
    }).parse(request.body);
    if (body.nextTestDate < body.lastTestDate) return reply.code(400).send({ error: "next_test_before_last_test" });
    const control = await store.updateControlTestDates(id, {
      lastTestDate: body.lastTestDate,
      nextTestDate: body.nextTestDate,
      effectivenessRating: body.effectivenessRating,
    });
    if (!control) return reply.code(404).send({ error: "control_not_found" });
    return control;
  });

  // ============================================================================
  // EVIDENCE ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/evidence", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = queryListEvidence.parse(request.query);
    const evidence = await store.listComplianceEvidence(
      request.currentUser.tenantId,
      query
    );
    return { data: evidence };
  });

  app.post("/v1/compliance/evidence", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const body = evidenceSchema.parse(request.body);
    const evidence = await store.createComplianceEvidence({
      ...body,
      tenantId: request.currentUser.tenantId,
      collectedBy: request.currentUser.id,
    });
    return reply.code(201).send(evidence);
  });

  app.get("/v1/compliance/evidence/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const evidence = await store.getComplianceEvidence(id);
    if (!evidence || evidence.tenantId !== request.currentUser.tenantId) return reply.code(404).send({ error: "evidence_not_found" });
    return evidence;
  });

  app.patch("/v1/compliance/evidence/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await store.getComplianceEvidence(id);
    if (!existing || existing.tenantId !== request.currentUser.tenantId) return reply.code(404).send({ error: "evidence_not_found" });
    const body = evidenceSchema.partial().parse(request.body);
    const evidence = await store.updateComplianceEvidence(id, body);
    if (!evidence) return reply.code(404).send({ error: "evidence_not_found" });
    return evidence;
  });

  app.delete("/v1/compliance/evidence/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await store.getComplianceEvidence(id);
    if (!existing || existing.tenantId !== request.currentUser.tenantId) return reply.code(404).send({ error: "evidence_not_found" });
    await store.deleteComplianceEvidence(id);
    return reply.code(204).send();
  });

  // Validate evidence
  app.post("/v1/compliance/evidence/:id/validate", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await store.getComplianceEvidence(id);
    if (!existing || existing.tenantId !== request.currentUser.tenantId) return reply.code(404).send({ error: "evidence_not_found" });
    const body = z.object({
      validated: z.boolean(),
      validationNotes: z.string().optional(),
    }).parse(request.body);
    const evidence = await store.validateComplianceEvidence(
      id,
      body.validated,
      request.currentUser.id,
      body.validationNotes
    );
    if (!evidence) return reply.code(404).send({ error: "evidence_not_found" });
    return evidence;
  });

  // ============================================================================
  // TESTING & AUDITS ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/tests", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = queryListTests.parse(request.query);
    const tests = await store.listComplianceTests(
      request.currentUser.tenantId,
      query
    );
    return { data: tests };
  });

  app.post("/v1/compliance/tests", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const body = testSchema.parse(request.body);
    const test = await store.createComplianceTest({
      ...body,
      tenantId: request.currentUser.tenantId,
      testerId: request.currentUser.id,
    });
    return reply.code(201).send(test);
  });

  app.get("/v1/compliance/tests/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const test = await store.getComplianceTest(id);
    if (!test) return reply.code(404).send({ error: "test_not_found" });
    return test;
  });

  app.patch("/v1/compliance/tests/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const { id } = idParams.parse(request.params);
    const body = testSchema.partial().parse(request.body);
    const test = await store.updateComplianceTest(id, body);
    if (!test) return reply.code(404).send({ error: "test_not_found" });
    return test;
  });

  app.delete("/v1/compliance/tests/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const { id } = idParams.parse(request.params);
    await store.deleteComplianceTest(id);
    return reply.code(204).send();
  });

  // ============================================================================
  // FINDINGS ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/findings", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = queryListFindings.parse(request.query);
    const findings = await store.listComplianceFindings(
      request.currentUser.tenantId,
      query
    );
    return { data: findings };
  });

  app.post("/v1/compliance/findings", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const body = findingSchema.parse(request.body);
    if (body.status !== "open") return reply.code(409).send({ error: "invalid_finding_initial_status" });
    if (!(await validateFindingLinks(request, reply, store, body))) return;
    if (body.assignedTo) {
      const assignee = await store.getUser(body.assignedTo);
      if (!assignee || assignee.tenantId !== request.currentUser.tenantId || assignee.status !== "active") return reply.code(400).send({ error: "invalid_assignee" });
    }
    if (body.dueDate && body.discoveredDate && body.dueDate < body.discoveredDate) return reply.code(400).send({ error: "due_date_before_discovery_date" });
    const finding = await store.createComplianceFinding({
      ...body,
      identifiedDate: body.discoveredDate,
      tenantId: request.currentUser.tenantId,
      discoveredBy: request.currentUser.id,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(finding);
  });

  app.get("/v1/compliance/findings/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const finding = await requireTenantResource(request, reply, await store.getComplianceFinding(id), "finding_not_found");
    if (!finding) return;
    return finding;
  });

  app.patch("/v1/compliance/findings/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = findingSchema.partial().parse(request.body);
    const existing = await requireTenantResource(request, reply, await store.getComplianceFinding(id), "finding_not_found");
    if (!existing) return;
    if (!(await validateFindingLinks(request, reply, store, body, existing))) return;
    if (body.assignedTo) {
      const assignee = await store.getUser(body.assignedTo);
      if (!assignee || assignee.tenantId !== request.currentUser.tenantId || assignee.status !== "active") return reply.code(400).send({ error: "invalid_assignee" });
    }
    if (body.dueDate && (existing.discoveredDate ?? body.discoveredDate) && body.dueDate < (existing.discoveredDate ?? body.discoveredDate)) return reply.code(400).send({ error: "due_date_before_discovery_date" });
    if (body.status && !isValidTransition(findingTransitions, existing.status, body.status)) return reply.code(409).send({ error: "invalid_finding_transition" });
    if (body.status === "closed") return reply.code(400).send({ error: "use_finding_closure" });
    if (body.status === "accepted_risk" && !(body.recommendations ?? existing.recommendations)?.trim()) return reply.code(400).send({ error: "risk_acceptance_rationale_required" });
    if (body.status === "verified") {
      const plans = await store.listRemediationPlans(request.currentUser.tenantId, { findingId: id });
      if (plans.length === 0 || plans.some((plan: { status?: string }) => plan.status !== "verified" && plan.status !== "closed")) {
        return reply.code(409).send({ error: "remediation_not_verified" });
      }
    }
    const finding = await store.updateComplianceFinding(id, body);
    if (!finding) return reply.code(404).send({ error: "finding_not_found" });
    return finding;
  });

  app.delete("/v1/compliance/findings/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await requireTenantResource(request, reply, await store.getComplianceFinding(id), "finding_not_found");
    if (!existing) return;
    const plans = await store.listRemediationPlans(request.currentUser.tenantId, { findingId: id });
    if (existing.status !== "open" || plans.length > 0) return reply.code(409).send({ error: "finding_not_deletable" });
    await store.deleteComplianceFinding(id);
    return reply.code(204).send();
  });

  // Close a finding
  app.post("/v1/compliance/findings/:id/close", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:approve"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await requireTenantResource(request, reply, await store.getComplianceFinding(id), "finding_not_found");
    if (!existing) return;
    if (existing.status !== "verified") return reply.code(409).send({ error: "finding_not_ready_for_closure" });
    const body = z.object({
      closureNotes: z.string().trim().min(1).max(2_000),
    }).parse(request.body);
    const finding = await store.closeComplianceFinding(
      id,
      request.currentUser.id,
      body.closureNotes
    );
    if (!finding) return reply.code(404).send({ error: "finding_not_found" });
    return finding;
  });

  // ============================================================================
  // REMEDIATION PLANS ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/remediation-plans", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = queryListRemediationPlans.parse(request.query);
    const plans = await store.listRemediationPlans(
      request.currentUser.tenantId,
      query
    );
    return { data: plans };
  });

  app.post("/v1/compliance/remediation-plans", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const body = remediationPlanSchema.parse(request.body);
    if (body.status !== "identified") return reply.code(409).send({ error: "invalid_remediation_plan_initial_status" });
    if (!(await requireTenantResource(request, reply, await store.getComplianceFinding(body.findingId), "finding_not_found"))) return;
    const plan = await store.createRemediationPlan({
      ...body,
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(plan);
  });

  app.get("/v1/compliance/remediation-plans/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const plan = await requireTenantResource(request, reply, await store.getRemediationPlan(id), "plan_not_found");
    if (!plan) return;
    return plan;
  });

  app.patch("/v1/compliance/remediation-plans/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = remediationPlanSchema.partial().parse(request.body);
    const existing = await requireTenantResource(request, reply, await store.getRemediationPlan(id), "plan_not_found");
    if (!existing) return;
    if (body.findingId && !(await requireTenantResource(request, reply, await store.getComplianceFinding(body.findingId), "finding_not_found"))) return;
    if (body.status && !isValidTransition(remediationPlanTransitions, existing.status, body.status)) return reply.code(409).send({ error: "invalid_remediation_plan_transition" });
    if (body.status === "verified") return reply.code(400).send({ error: "use_remediation_plan_verification" });
    if (body.status === "completed") {
      const actions = await store.listRemediationActions(id);
      if (actions.some((action: { status?: string }) => action.status !== "completed" && action.status !== "verified")) {
        return reply.code(409).send({ error: "remediation_actions_incomplete" });
      }
    }
    const plan = await store.updateRemediationPlan(id, body);
    if (!plan) return reply.code(404).send({ error: "plan_not_found" });
    return plan;
  });

  app.delete("/v1/compliance/remediation-plans/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    if (!(await requireTenantResource(request, reply, await store.getRemediationPlan(id), "plan_not_found"))) return;
    await store.deleteRemediationPlan(id);
    return reply.code(204).send();
  });

  // Approve a remediation plan
  app.post("/v1/compliance/remediation-plans/:id/approve", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:approve"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await requireTenantResource(request, reply, await store.getRemediationPlan(id), "plan_not_found");
    if (!existing) return;
    if (existing.status !== "identified") return reply.code(409).send({ error: "invalid_remediation_plan_transition" });
    const plan = await store.approveRemediationPlan(id, request.currentUser.id);
    if (!plan) return reply.code(404).send({ error: "plan_not_found" });
    return plan;
  });

  // Verify a remediation plan completion
  app.post("/v1/compliance/remediation-plans/:id/verify", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await requireTenantResource(request, reply, await store.getRemediationPlan(id), "plan_not_found");
    if (!existing) return;
    if (existing.status !== "completed") return reply.code(409).send({ error: "invalid_remediation_plan_transition" });
    const body = z.object({
      verificationNotes: z.string().optional(),
      effectivenessConfirmed: z.boolean(),
    }).parse(request.body);
    if (!body.effectivenessConfirmed) return reply.code(409).send({ error: "remediation_effectiveness_not_confirmed" });
    const plan = await store.verifyRemediationPlan(id, request.currentUser.id, {
      verificationNotes: body.verificationNotes,
      effectivenessConfirmed: body.effectivenessConfirmed,
    });
    if (!plan) return reply.code(404).send({ error: "plan_not_found" });
    return plan;
  });

  // ============================================================================
  // REMEDIATION ACTIONS ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/remediation-plans/:planId/actions", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { planId } = z.object({ planId: z.string().uuid() }).parse(request.params);
    if (!(await requireTenantResource(request, reply, await store.getRemediationPlan(planId), "plan_not_found"))) return;
    const actions = await store.listRemediationActions(planId);
    return { data: actions };
  });

  app.post("/v1/compliance/remediation-plans/:planId/actions", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { planId } = z.object({ planId: z.string().uuid() }).parse(request.params);
    const body = remediationActionSchema.parse(request.body);
    const plan = await requireTenantResource(request, reply, await store.getRemediationPlan(planId), "plan_not_found");
    if (!plan) return;
    if (plan.status === "closed" || plan.status === "verified") return reply.code(409).send({ error: "remediation_plan_not_actionable" });
    if (body.status !== "pending") return reply.code(409).send({ error: "invalid_remediation_action_initial_status" });
    const action = await store.createRemediationAction({
      ...body,
      planId,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(action);
  });

  app.get("/v1/compliance/remediation-actions/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const action = await store.getRemediationAction(id);
    if (!action || !(await requireTenantResource(request, reply, await store.getRemediationPlan(action.planId), "action_not_found"))) return;
    return action;
  });

  app.patch("/v1/compliance/remediation-actions/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = remediationActionSchema.partial().parse(request.body);
    const existing = await store.getRemediationAction(id);
    if (!existing || !(await requireTenantResource(request, reply, await store.getRemediationPlan(existing.planId), "action_not_found"))) return;
    if (body.planId && body.planId !== existing.planId) return reply.code(400).send({ error: "remediation_action_plan_immutable" });
    if (body.status && !isValidTransition(remediationActionTransitions, existing.status, body.status)) return reply.code(409).send({ error: "invalid_remediation_action_transition" });
    if (body.status === "completed") return reply.code(400).send({ error: "use_remediation_action_completion" });
    const action = await store.updateRemediationAction(id, body);
    if (!action) return reply.code(404).send({ error: "action_not_found" });
    return action;
  });

  app.delete("/v1/compliance/remediation-actions/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await store.getRemediationAction(id);
    if (!existing || !(await requireTenantResource(request, reply, await store.getRemediationPlan(existing.planId), "action_not_found"))) return;
    await store.deleteRemediationAction(id);
    return reply.code(204).send();
  });

  // Complete an action
  app.post("/v1/compliance/remediation-actions/:id/complete", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await store.getRemediationAction(id);
    if (!existing || !(await requireTenantResource(request, reply, await store.getRemediationPlan(existing.planId), "action_not_found"))) return;
    if (!isValidTransition(remediationActionTransitions, existing.status, "completed")) return reply.code(409).send({ error: "invalid_remediation_action_transition" });
    const body = z.object({
      evidenceUrl: z.string().url().optional(),
      notes: z.string().optional(),
    }).parse(request.body);
    const action = await store.completeRemediationAction(id, body);
    if (!action) return reply.code(404).send({ error: "action_not_found" });
    return action;
  });

  // ============================================================================
  // RISK REGISTER ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/risks", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = queryListRisks.parse(request.query);
    const risks = await store.listComplianceRisks(
      request.currentUser.tenantId,
      query
    );
    return { data: risks };
  });

  app.post("/v1/compliance/risks", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const body = riskSchema.parse(request.body);
    if (body.status !== "identified") return reply.code(409).send({ error: "invalid_risk_initial_status" });
    if (body.residualLikelihood || body.residualImpact) return reply.code(400).send({ error: "use_risk_assessment" });
    if (body.frameworkId && !(await requireTenantResource(request, reply, await store.getComplianceFramework(body.frameworkId), "framework_not_found"))) return;
    if (body.requirementId) {
      const requirement = await requireTenantResource(request, reply, await store.getComplianceRequirement(body.requirementId), "requirement_not_found");
      if (!requirement) return;
      if (body.frameworkId && requirement.frameworkId !== body.frameworkId) return reply.code(400).send({ error: "requirement_framework_mismatch" });
    }
    const risk = await store.createComplianceRisk({
      ...body,
      riskName: body.riskTitle,
      description: body.riskDescription,
      category: body.riskCategory,
      owner: body.riskOwner,
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(risk);
  });

  app.get("/v1/compliance/risks/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const risk = await requireTenantResource(request, reply, await store.getComplianceRisk(id), "risk_not_found");
    if (!risk) return;
    return risk;
  });

  app.patch("/v1/compliance/risks/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = riskSchema.partial().parse(request.body);
    const existing = await requireTenantResource(request, reply, await store.getComplianceRisk(id), "risk_not_found");
    if (!existing) return;
    if (body.frameworkId && !(await requireTenantResource(request, reply, await store.getComplianceFramework(body.frameworkId), "framework_not_found"))) return;
    if (body.requirementId) {
      const requirement = await requireTenantResource(request, reply, await store.getComplianceRequirement(body.requirementId), "requirement_not_found");
      if (!requirement) return;
      if ((body.frameworkId ?? existing.frameworkId) && requirement.frameworkId !== (body.frameworkId ?? existing.frameworkId)) return reply.code(400).send({ error: "requirement_framework_mismatch" });
    }
    if (body.status && !isValidTransition(riskTransitions, existing.status, body.status)) return reply.code(409).send({ error: "invalid_risk_transition" });
    if (body.status === "assessed") return reply.code(400).send({ error: "use_risk_assessment" });
    if (body.status === "treated" && !(body.treatmentPlan ?? existing.treatmentPlan)?.trim()) return reply.code(400).send({ error: "risk_treatment_plan_required" });
    const risk = await store.updateComplianceRisk(id, {
      ...body,
      ...(body.riskTitle ? { riskName: body.riskTitle } : {}),
      ...(body.riskDescription ? { description: body.riskDescription } : {}),
      ...(body.riskCategory ? { category: body.riskCategory } : {}),
      ...(body.riskOwner ? { owner: body.riskOwner } : {}),
    });
    if (!risk) return reply.code(404).send({ error: "risk_not_found" });
    return risk;
  });

  app.delete("/v1/compliance/risks/:id", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    if (!(await requireTenantResource(request, reply, await store.getComplianceRisk(id), "risk_not_found"))) return;
    await store.deleteComplianceRisk(id);
    return reply.code(204).send();
  });

  // Update risk assessment
  app.post("/v1/compliance/risks/:id/assess", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:manage"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await requireTenantResource(request, reply, await store.getComplianceRisk(id), "risk_not_found");
    if (!existing) return;
    if (!isValidTransition(riskTransitions, existing.status, "assessed")) return reply.code(409).send({ error: "invalid_risk_transition" });
    const body = z.object({
      residualLikelihood: z.enum(["critical", "high", "medium", "low", "negligible"]),
      residualImpact: z.enum(["critical", "high", "medium", "low", "negligible"]),
      treatmentPlan: z.string().optional(),
    }).parse(request.body);
    if ((riskScale[body.residualLikelihood] ?? 0) > (riskScale[existing.inherentLikelihood] ?? 0) || (riskScale[body.residualImpact] ?? 0) > (riskScale[existing.inherentImpact] ?? 0)) {
      return reply.code(400).send({ error: "residual_risk_exceeds_inherent_risk" });
    }
    const risk = await store.assessComplianceRisk(id, {
      residualLikelihood: body.residualLikelihood,
      residualImpact: body.residualImpact,
      treatmentPlan: body.treatmentPlan,
    });
    if (!risk) return reply.code(404).send({ error: "risk_not_found" });
    return risk;
  });

  // Record risk review
  app.post("/v1/compliance/risks/:id/review", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const { id } = idParams.parse(request.params);
    const existing = await requireTenantResource(request, reply, await store.getComplianceRisk(id), "risk_not_found");
    if (!existing) return;
    if (existing.status !== "monitored") return reply.code(409).send({ error: "risk_not_ready_for_review" });
    const body = z.object({
      reviewNotes: z.string().optional(),
      nextReviewDate: z.string().datetime(),
    }).parse(request.body);
    if (new Date(body.nextReviewDate).getTime() <= Date.now()) return reply.code(400).send({ error: "next_review_date_must_be_future" });
    const risk = await store.reviewComplianceRisk(id, {
      reviewNotes: body.reviewNotes,
      nextReviewDate: body.nextReviewDate,
    });
    if (!risk) return reply.code(404).send({ error: "risk_not_found" });
    return risk;
  });

  // ============================================================================
  // DASHBOARD & REPORTING ENDPOINTS
  // ============================================================================
  
  app.get("/v1/compliance/dashboard", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const query = z.object({
      frameworkId: z.string().uuid().optional(),
    }).parse(request.query);
    const dashboard = await store.getComplianceDashboard(
      request.currentUser.tenantId,
      query.frameworkId
    );
    return dashboard;
  });

  app.get("/v1/compliance/requirements/:id/status", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const status = await store.getRequirementStatus(id);
    if (!status) return reply.code(404).send({ error: "requirement_not_found" });
    return status;
  });

  app.get("/v1/compliance/frameworks/:id/coverage", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:view"))) return;
    const { id } = idParams.parse(request.params);
    const coverage = await store.getFrameworkCoverage(id);
    if (!coverage) return reply.code(404).send({ error: "framework_not_found" });
    return coverage;
  });

  app.get("/v1/compliance/audit-log", async (request, reply) => {
    if (!(await requireAccess(request, reply, store, "compliance:audit"))) return;
    const query = z.object({
      entityType: z.string().optional(),
      entityId: z.string().uuid().optional(),
      action: z.string().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(request.query);
    const logs = await store.getComplianceAuditLog(
      request.currentUser.tenantId,
      query
    );
    return { data: logs };
  });
}
