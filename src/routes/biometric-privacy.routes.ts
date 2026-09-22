import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { biometricPrivacyService } from "../privacy/services/biometric-privacy.service.js";

const recordConsentSchema = z.object({
  subjectId: z.string().trim().min(1).max(100),
  subjectType: z.enum(["employee", "visitor", "contractor", "customer", "vip"]).default("employee"),
  purpose: z.string().trim().min(5).max(500),
  validUntil: z.string().datetime(),
  consentDocumentRef: z.string().max(300).optional(),
});

const revokeConsentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const executeErasureSchema = z.object({
  subjectId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(5).max(500),
});

function getTenantId(request: FastifyRequest): string {
  const user = (request as any).currentUser;
  return user?.tenantId || "default-tenant";
}

function getUserId(request: FastifyRequest): string {
  const user = (request as any).currentUser;
  return user?.id || "system";
}

export async function registerBiometricPrivacyRoutes(app: FastifyInstance) {
  /**
   * Record biometric consent
   * POST /v1/privacy/biometrics/consent
   */
  app.post("/v1/privacy/biometrics/consent", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = recordConsentSchema.parse(request.body);

    const consent = await biometricPrivacyService.recordConsent({
      tenantId,
      subjectId: body.subjectId,
      subjectType: body.subjectType,
      purpose: body.purpose,
      validUntil: body.validUntil,
      consentDocumentRef: body.consentDocumentRef,
    });

    await biometricPrivacyService.logBiometricAudit({
      tenantId,
      performedBy: getUserId(request),
      action: "consent_grant",
      subjectId: body.subjectId,
      sourceIp: request.ip,
    });

    return reply.code(201).send(consent);
  });

  /**
   * Check active consent
   * GET /v1/privacy/biometrics/consent/:subjectId
   */
  app.get("/v1/privacy/biometrics/consent/:subjectId", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { subjectId } = z.object({ subjectId: z.string() }).parse(request.params);

    const result = await biometricPrivacyService.verifyActiveConsent(tenantId, subjectId);
    return result;
  });

  /**
   * Revoke consent
   * POST /v1/privacy/biometrics/consent/:subjectId/revoke
   */
  app.post("/v1/privacy/biometrics/consent/:subjectId/revoke", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { subjectId } = z.object({ subjectId: z.string() }).parse(request.params);
    const body = revokeConsentSchema.parse(request.body);

    await biometricPrivacyService.revokeConsent(tenantId, subjectId, body.reason);

    await biometricPrivacyService.logBiometricAudit({
      tenantId,
      performedBy: getUserId(request),
      action: "consent_revoke",
      subjectId,
      sourceIp: request.ip,
    });

    return { success: true, message: `Consent revoked for subject ${subjectId}` };
  });

  /**
   * Subject Access Request (SAR) - Right to be forgotten
   * Completely purges facial vector embeddings and returns signed certificate of erasure
   * POST /v1/privacy/biometrics/erasure
   */
  app.post("/v1/privacy/biometrics/erasure", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = executeErasureSchema.parse(request.body);

    const certificate = await biometricPrivacyService.executeSubjectAccessErasure({
      tenantId,
      subjectId: body.subjectId,
      requestedBy: getUserId(request),
      reason: body.reason,
    });

    return reply.code(200).send({
      message: "Biometric subject data erased successfully conforming to DPDP/GDPR regulations.",
      certificate,
    });
  });

  /**
   * Retrieve erasure certificate
   * GET /v1/privacy/biometrics/erasure-certificates/:id
   */
  app.get("/v1/privacy/biometrics/erasure-certificates/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const cert = await biometricPrivacyService.getErasureCertificate(id, tenantId);
    if (!cert) {
      return reply.code(404).send({ error: "certificate_not_found" });
    }

    return cert;
  });

  /**
   * Query biometric audit logs
   * GET /v1/privacy/biometrics/audit-logs
   */
  app.get("/v1/privacy/biometrics/audit-logs", async (request, reply) => {
    const tenantId = getTenantId(request);
    const logs = await biometricPrivacyService.listAuditLogs(tenantId);
    return { data: logs };
  });
}
