import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
function cleanObject<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
import type { ControlPlaneStore } from "../control-plane-store.js";

const idParams = z.object({ id: z.string().uuid() });
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
  normalRetentionDays: z.number().int().min(0).max(36_500).optional(),
  hotStorageDays: z.number().int().min(0).max(36_500).optional(),
  warmStorageDays: z.number().int().min(0).max(36_500).optional(),
  coldStorageDays: z.number().int().min(0).max(36_500).optional(),
  backupRequired: z.boolean().default(false),
  legalHoldOverride: z.boolean().default(false),
  incidentRetentionDays: z.number().int().min(0).max(36_500).optional(),
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
const queryListCertificates = z.object({
  assessmentId: z.string().uuid().optional(),
  status: z.enum(["compliant", "compliant_with_exceptions", "provisionally_compliant", "non_compliant", "incomplete"]).optional(),
});

async function requireOwnedResource<T extends { tenantId?: string }>(
  request: FastifyRequest,
  reply: FastifyReply,
  resource: T | undefined,
  notFoundError: string,
) {
  if (!resource || resource.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error: notFoundError });
    return undefined;
  }
  return resource;
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | undefined {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    void reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    return undefined;
  }
  return parsed.data;
}

function validatePolicyConfiguration(policy: Record<string, unknown>) {
  const automaticDeletion = policy.automaticDeletionEligibility === true;
  const retentionFields = ["normalRetentionDays", "hotStorageDays", "warmStorageDays", "coldStorageDays"];
  if (automaticDeletion && retentionFields.some((field) => policy[field] === 0)) {
    return "automatic_deletion_requires_positive_retention";
  }
  if (policy.legalHoldOverride === true &&
      (typeof policy.approvalAuthority !== "string" || !policy.approvalAuthority.trim())) {
    return "legal_hold_override_requires_approval_authority";
  }
  return undefined;
}

async function requireComplianceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  mode: "view" | "manage",
) {
  const role = request.currentUser?.role ?? "";
  const administrators = new Set(["super_admin", "company_admin", "hq_admin"]);
  const allowed = administrators.has(role) || role === "security_officer" ||
    (mode === "view" && role === "auditor");
  if (!allowed) {
    await reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

export async function registerComplianceRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/compliance/frameworks", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    return { data: await store.listComplianceFrameworks(request.currentUser.tenantId) };
  });

  app.post("/v1/compliance/frameworks", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "manage"))) return;
    const body = parseBody(frameworkSchema, request.body, reply);
    if (!body) return;
    if (body.effectiveDate && body.reviewDate && body.reviewDate < body.effectiveDate) {
      return reply.code(400).send({ error: "review_date_before_effective_date" });
    }
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
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    const { id } = idParams.parse(request.params);
    const framework = await requireOwnedResource(request, reply, await store.getComplianceFramework(id), "framework_not_found");
    if (!framework) return;
    return framework;
  });

  app.patch("/v1/compliance/frameworks/:id", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = parseBody(frameworkSchema.partial(), request.body, reply);
    if (!body) return;
    const existing = await requireOwnedResource(request, reply, await store.getComplianceFramework(id), "framework_not_found");
    if (!existing) return;
    const effectiveDate = body.effectiveDate ?? existing.effectiveDate;
    const reviewDate = body.reviewDate ?? existing.reviewDate;
    if (effectiveDate && reviewDate && reviewDate < effectiveDate) {
      return reply.code(400).send({ error: "review_date_before_effective_date" });
    }
    const updateInput: Partial<import("../control-plane-store.js").ComplianceFrameworkInput> = {
      ...(cleanObject(body) as any),
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    };
    const framework = await store.updateComplianceFramework(id, updateInput);
    if (!framework) return reply.code(404).send({ error: "framework_not_found" });
    return framework;
  });

  app.get("/v1/compliance/policies", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    const query = queryListPolicies.parse(request.query);
    return {
      data: await store.listCompliancePolicies(
        request.currentUser.tenantId,
        query.frameworkId,
      ),
    };
  });

  app.post("/v1/compliance/policies", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "manage"))) return;
    const body = parseBody(policySchema, request.body, reply);
    if (!body) return;
    const framework = await requireOwnedResource(request, reply, await store.getComplianceFramework(body.frameworkId), "framework_not_found");
    if (!framework) return;
    if (body.effectiveDate && body.reviewDate && body.reviewDate < body.effectiveDate) {
      return reply.code(400).send({ error: "review_date_before_effective_date" });
    }
    const policyError = validatePolicyConfiguration(body);
    if (policyError) return reply.code(400).send({ error: policyError });
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
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    const { id } = idParams.parse(request.params);
    const policy = await requireOwnedResource(request, reply, await store.getCompliancePolicy(id), "policy_not_found");
    if (!policy) return;
    return policy;
  });

  app.patch("/v1/compliance/policies/:id", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = parseBody(policySchema.partial(), request.body, reply);
    if (!body) return;
    const existing = await requireOwnedResource(request, reply, await store.getCompliancePolicy(id), "policy_not_found");
    if (!existing) return;
    if (body.frameworkId && !(await requireOwnedResource(request, reply, await store.getComplianceFramework(body.frameworkId), "framework_not_found"))) return;
    const effectiveDate = body.effectiveDate ?? existing.effectiveDate;
    const reviewDate = body.reviewDate ?? existing.reviewDate;
    if (effectiveDate && reviewDate && reviewDate < effectiveDate) {
      return reply.code(400).send({ error: "review_date_before_effective_date" });
    }
    const policyError = validatePolicyConfiguration({ ...existing, ...cleanObject(body) });
    if (policyError) return reply.code(400).send({ error: policyError });
    const updateInput: Partial<import("../control-plane-store.js").CompliancePolicyInput> = {
      ...(cleanObject(body) as any),
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    };
    const policy = await store.updateCompliancePolicy(id, updateInput);
    if (!policy) return reply.code(404).send({ error: "policy_not_found" });
    return policy;
  });

  app.get("/v1/compliance/assessments", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
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
    if (!(await requireComplianceAccess(request, reply, "manage"))) return;
    const body = parseBody(assessmentSchema, request.body, reply);
    if (!body) return;
    if (!(await requireOwnedResource(request, reply, await store.getComplianceFramework(body.frameworkId), "framework_not_found"))) return;
    if (body.branchNodeId) {
      const branch = await store.getNode(body.branchNodeId);
      if (!branch || branch.tenantId !== request.currentUser.tenantId || branch.type !== "branch") {
        return reply.code(400).send({ error: "invalid_branch" });
      }
    }
    if (body.assessmentPeriodStart && body.assessmentPeriodEnd && body.assessmentPeriodEnd < body.assessmentPeriodStart) {
      return reply.code(400).send({ error: "assessment_period_invalid" });
    }
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
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    const { id } = idParams.parse(request.params);
    const assessment = await requireOwnedResource(request, reply, await store.getComplianceAssessment(id), "assessment_not_found");
    if (!assessment) return;
    return assessment;
  });

  app.patch("/v1/compliance/assessments/:id", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "manage"))) return;
    const { id } = idParams.parse(request.params);
    const body = parseBody(assessmentSchema.partial(), request.body, reply);
    if (!body) return;
    const existing = await requireOwnedResource(request, reply, await store.getComplianceAssessment(id), "assessment_not_found");
    if (!existing) return;
    if (body.frameworkId && !(await requireOwnedResource(request, reply, await store.getComplianceFramework(body.frameworkId), "framework_not_found"))) return;
    if (body.branchNodeId) {
      const branch = await store.getNode(body.branchNodeId);
      if (!branch || branch.tenantId !== request.currentUser.tenantId || branch.type !== "branch") return reply.code(400).send({ error: "invalid_branch" });
    }
    const periodStart = body.assessmentPeriodStart ?? existing.assessmentPeriodStart;
    const periodEnd = body.assessmentPeriodEnd ?? existing.assessmentPeriodEnd;
    if (periodStart && periodEnd && periodEnd < periodStart) return reply.code(400).send({ error: "assessment_period_invalid" });
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
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    const { id } = idParams.parse(request.params);
    const assessment = await requireOwnedResource(request, reply, await store.getComplianceAssessment(id), "assessment_not_found");
    if (!assessment) return;
    return { data: await store.listComplianceCertificates(id) };
  });

  app.post("/v1/compliance/assessments/:id/certificates", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "manage"))) return;
    const { id } = idParams.parse(request.params);
    const assessment = await requireOwnedResource(request, reply, await store.getComplianceAssessment(id), "assessment_not_found");
    if (!assessment) return;
    const body = parseBody(certificateSchema, request.body, reply);
    if (!body) return;
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

  app.get("/v1/compliance/certificates", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    const query = queryListCertificates.parse(request.query);
    return { data: await store.listComplianceCertificatesForTenant(request.currentUser.tenantId, query) };
  });

  app.get("/v1/compliance/certificates/:id", async (request, reply) => {
    if (!(await requireComplianceAccess(request, reply, "view"))) return;
    const { id } = idParams.parse(request.params);
    const certificate = await requireOwnedResource(request, reply, await store.getComplianceCertificate(id), "certificate_not_found");
    if (!certificate) return;
    return certificate;
  });
}
