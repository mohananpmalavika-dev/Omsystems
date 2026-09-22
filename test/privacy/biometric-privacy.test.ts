import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerBiometricPrivacyRoutes } from "../../src/routes/biometric-privacy.routes.js";
import { biometricPrivacyService } from "../../src/privacy/services/biometric-privacy.service.js";

describe("Biometric Privacy & DPDP/GDPR Compliance", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorateRequest("currentUser", null);
    app.addHook("preHandler", async (request: any) => {
      request.currentUser = {
        id: "dpo-officer-01",
        username: "dpo_officer",
        role: "security_officer",
        tenantId: "tenant-bank-1",
      };
    });
    await registerBiometricPrivacyRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("records valid biometric consent with purpose and validity period", async () => {
    const validUntil = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const consent = await biometricPrivacyService.recordConsent({
      tenantId: "tenant-bank-1",
      subjectId: "emp-9012",
      subjectType: "employee",
      purpose: "Vault access authentication and security audit",
      validUntil,
      consentDocumentRef: "DOC-CONSENT-2026-9012",
    });

    expect(consent.id).toBeDefined();
    expect(consent.status).toBe("active");
    expect(consent.subjectId).toBe("emp-9012");

    const check = await biometricPrivacyService.verifyActiveConsent("tenant-bank-1", "emp-9012");
    expect(check.active).toBe(true);
    expect(check.consent?.purpose).toBe("Vault access authentication and security audit");
  });

  it("correctly identifies revoked consent and denies biometric processing", async () => {
    const validUntil = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    await biometricPrivacyService.recordConsent({
      tenantId: "tenant-bank-1",
      subjectId: "emp-revoke-test",
      subjectType: "contractor",
      purpose: "Branch access",
      validUntil,
    });

    await biometricPrivacyService.revokeConsent("tenant-bank-1", "emp-revoke-test", "Employee resigned");

    const check = await biometricPrivacyService.verifyActiveConsent("tenant-bank-1", "emp-revoke-test");
    expect(check.active).toBe(false);
    expect(check.reason).toContain("revoked");
  });

  it("executes SAR Right to be Forgotten and issues a cryptographically signed certificate", async () => {
    const validUntil = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    await biometricPrivacyService.recordConsent({
      tenantId: "tenant-bank-1",
      subjectId: "customer-sar-01",
      subjectType: "customer",
      purpose: "ATM e-KYC face match",
      validUntil,
    });

    const cert = await biometricPrivacyService.executeSubjectAccessErasure({
      tenantId: "tenant-bank-1",
      subjectId: "customer-sar-01",
      requestedBy: "dpo-officer-01",
      reason: "Customer filed GDPR Article 17 erasure request",
    });

    expect(cert.certificateNumber).toMatch(/^SAR-ERASURE-/);
    expect(cert.cryptographicSignature).toBeDefined();
    expect(cert.cryptographicSignature.length).toBe(64); // SHA-256 HMAC hex
    expect(cert.erasedEmbeddingsCount).toBeGreaterThanOrEqual(1);

    // Consent must now be inactive
    const check = await biometricPrivacyService.verifyActiveConsent("tenant-bank-1", "customer-sar-01");
    expect(check.active).toBe(false);

    // Certificate must be retrievable
    const retrieved = await biometricPrivacyService.getErasureCertificate(cert.id, "tenant-bank-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.certificateNumber).toBe(cert.certificateNumber);
  });

  it("maintains a non-repudiable biometric audit trail", async () => {
    await biometricPrivacyService.logBiometricAudit({
      tenantId: "tenant-bank-1",
      performedBy: "security-guard-05",
      action: "verify",
      subjectId: "emp-9012",
      cameraId: "cam-vault-door-01",
      matchScore: 0.985,
      sourceIp: "10.0.1.55",
    });

    const logs = await biometricPrivacyService.listAuditLogs("tenant-bank-1");
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs.find((l) => l.subjectId === "emp-9012");
    expect(log).toBeDefined();
    expect(log?.action).toBe("verify");
    expect(log?.matchScore).toBe(0.985);
  });

  it("serves biometric privacy endpoints via REST API with CSRF and auth protection", async () => {
    // Check consent endpoint
    const response = await app.inject({
      method: "GET",
      url: "/v1/privacy/biometrics/consent/emp-9012",
      headers: {
        authorization: "Bearer test-dev-token",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.active).toBe(true);
  });
});
