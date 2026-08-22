import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
function cleanObject<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
import type { ControlPlaneStore } from "../control-plane-store.js";

const idParams = z.object({ id: z.string().uuid() });
const queryListFrameworks = z.object({});
const queryListPolicies = z.object({ frameworkId: z.string().uuid().optional() });
const queryListAssessments = z.object({
  frameworkId: z.string().uuid().optional(),
  branchNodeId: z.string().uuid().optional(),
  status: z.enum(["compliant", "exception", "non-compliant", "incomplete"]).optional(),
});

const frameworkSchema = z.object({
  name: z.string().trim().min(2).max(200),
  source: z.string().trim().max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.string().trim().max(100).optional(),
  effectiveDate: z.string().datetime().optional(),
  reviewDate: z.string().datetime().optional(),
});

const policySchema = z.object({
  frameworkId: z.string().uuid(),
  policyName: z.string().trim().min(2).max(200),
  policyBasis: z.string().max(2000).optional(),
  entityType: z.string().max(100).optional(),
  locationType: z.string().max(100).optional(),
  cameraType: z.string().max(100).optional(),
  normalRetentionDays: z.number().int().min(0).optional(),
  hotStorageDays: z.number().int().min(0).optional(),
  warmStorageDays: z.number().int().min(0).optional(),
  coldStorageDays: z.number().int().min(0).optional(),
  backupRequired: z.boolean().default(false),
  legalHoldOverride: z.boolean().default(false),
  incidentRetentionDays: z.number().int().min(0).optional(),
  automaticDeletionEligibility: z.boolean().default(true),
  approvalAuthority: z.string().max(200).optional(),
  effectiveDate: z.string().datetime().optional(),
  reviewDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

const assessmentSchema = z.object({
  frameworkId: z.string().uuid(),
  branchNodeId: z.string().uuid().optional(),
  assessmentPeriodStart: z.string().datetime().optional(),
  assessmentPeriodEnd: z.string().datetime().optional(),
  status: z.enum(["compliant", "exception", "non-compliant", "incomplete"]).optional(),
  summary: z.record(z.unknown()).optional(),
  evidence: z.record(z.unknown()).optional(),
});

const certificateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  certificateNumber: z.string().trim().min(1).max(200),
  status: z.enum([
    "compliant",
    "compliant_with_exceptions",
    "provisionally_compliant",
    "non_compliant",
    "incomplete",
  ]),
  issuedBy: z.string().uuid().optional(),
  issuedAt: z.string().datetime().optional(),
  expiryDate: z.string().date().optional(),
  documentHash: z.string().max(500).optional(),
  signature: z.string().max(1_000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

async function hasAuditAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  resourceNodeId: string,
) {
  const decision = await store.checkAccess(request.currentUser, "audit:view" as any, resourceNodeId);
  if (!decision) {
    await reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

export async function registerComplianceRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/compliance/frameworks", async (request) => {
    return { data: await store.listComplianceFrameworks(request.currentUser.tenantId) };
  });

  app.post("/v1/compliance/frameworks", async (request, reply) => {
    const body = frameworkSchema.parse(request.body);
    const framework = await store.createComplianceFramework({
      tenantId: request.currentUser.tenantId,
      name: body.name,
      source: body.source,
      description: body.description,
      status: body.status,
      effectiveDate: body.effectiveDate,
      reviewDate: body.reviewDate,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(framework);
  });

  app.get("/v1/compliance/frameworks/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const framework = await store.getComplianceFramework(id);
    if (!framework) return reply.code(404).send({ error: "framework_not_found" });
    return framework;
  });

  app.patch("/v1/compliance/frameworks/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = frameworkSchema.partial().parse(request.body);
    const updateInput: Partial<import("../control-plane-store.js").ComplianceFrameworkInput> = {
      ...(cleanObject(body) as any),
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    };
    const framework = await store.updateComplianceFramework(id, updateInput);
    if (!framework) return reply.code(404).send({ error: "framework_not_found" });
    return framework;
  });

  app.get("/v1/compliance/policies", async (request) => {
    const query = queryListPolicies.parse(request.query);
    return {
      data: await store.listCompliancePolicies(
        request.currentUser.tenantId,
        query.frameworkId,
      ),
    };
  });

  app.post("/v1/compliance/policies", async (request, reply) => {
    const body = policySchema.parse(request.body);
    const policy = await store.createCompliancePolicy({
      frameworkId: body.frameworkId,
      tenantId: request.currentUser.tenantId,
      policyName: body.policyName,
      policyBasis: body.policyBasis,
      entityType: body.entityType,
      locationType: body.locationType,
      cameraType: body.cameraType,
      normalRetentionDays: body.normalRetentionDays,
      hotStorageDays: body.hotStorageDays,
      warmStorageDays: body.warmStorageDays,
      coldStorageDays: body.coldStorageDays,
      backupRequired: body.backupRequired,
      legalHoldOverride: body.legalHoldOverride,
      incidentRetentionDays: body.incidentRetentionDays,
      automaticDeletionEligibility: body.automaticDeletionEligibility,
      approvalAuthority: body.approvalAuthority,
      effectiveDate: body.effectiveDate,
      reviewDate: body.reviewDate,
      notes: body.notes,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(policy);
  });

  app.get("/v1/compliance/policies/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const policy = await store.getCompliancePolicy(id);
    if (!policy) return reply.code(404).send({ error: "policy_not_found" });
    return policy;
  });

  app.patch("/v1/compliance/policies/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = policySchema.partial().parse(request.body);
    const updateInput: Partial<import("../control-plane-store.js").CompliancePolicyInput> = {
      ...(cleanObject(body) as any),
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    };
    const policy = await store.updateCompliancePolicy(id, updateInput);
    if (!policy) return reply.code(404).send({ error: "policy_not_found" });
    return policy;
  });

  app.get("/v1/compliance/assessments", async (request) => {
    const query = queryListAssessments.parse(request.query);
    return {
      data: await store.listComplianceAssessments(request.currentUser.tenantId, {
        frameworkId: query.frameworkId,
        branchNodeId: query.branchNodeId,
        status: query.status,
      }),
    };
  });

  app.post("/v1/compliance/assessments", async (request, reply) => {
    const body = assessmentSchema.parse(request.body);
    const assessment = await store.createComplianceAssessment({
      frameworkId: body.frameworkId,
      tenantId: request.currentUser.tenantId,
      branchNodeId: body.branchNodeId,
      assessmentPeriodStart: body.assessmentPeriodStart,
      assessmentPeriodEnd: body.assessmentPeriodEnd,
      status: body.status,
      summary: body.summary,
      evidence: body.evidence,
      createdBy: request.currentUser.id,
    });
    return reply.code(201).send(assessment);
  });

  app.get("/v1/compliance/assessments/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const assessment = await store.getComplianceAssessment(id);
    if (!assessment) return reply.code(404).send({ error: "assessment_not_found" });
    return assessment;
  });

  app.patch("/v1/compliance/assessments/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = assessmentSchema.partial().parse(request.body);
    const updateInput: Partial<import("../control-plane-store.js").ComplianceAssessmentInput> = {
      ...(cleanObject(body) as any),
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    };
    const assessment = await store.updateComplianceAssessment(id, updateInput);
    if (!assessment) return reply.code(404).send({ error: "assessment_not_found" });
    return assessment;
  });

  app.get("/v1/compliance/assessments/:id/certificates", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const assessment = await store.getComplianceAssessment(id);
    if (!assessment) return reply.code(404).send({ error: "assessment_not_found" });
    return { data: await store.listComplianceCertificates(id) };
  });

  app.post("/v1/compliance/assessments/:id/certificates", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const assessment = await store.getComplianceAssessment(id);
    if (!assessment) return reply.code(404).send({ error: "assessment_not_found" });
    const body = certificateSchema.parse(request.body);
    const certificate = await store.createComplianceCertificate({
      assessmentId: id,
      tenantId: request.currentUser.tenantId,
      certificateNumber: body.certificateNumber,
      title: body.title,
      status: body.status,
      issuedBy: body.issuedBy,
      issuedAt: body.issuedAt,
      expiryDate: body.expiryDate,
      documentHash: body.documentHash,
      signature: body.signature,
      metadata: body.metadata,
    });
    return reply.code(201).send(certificate);
  });

  app.get("/v1/compliance/certificates/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const certificate = await store.getComplianceCertificate(id);
    if (!certificate) return reply.code(404).send({ error: "certificate_not_found" });
    return certificate;
  });
}
