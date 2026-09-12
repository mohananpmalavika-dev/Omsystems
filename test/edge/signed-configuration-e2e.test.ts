import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  registerSignedConfigurationRoutes,
  setSignedConfigurationService,
} from "../../src/routes/signed-configuration.routes.js";
import { SignedConfigRepository } from "../../src/database/signed-config-repository.js";
import { SignedConfigurationService } from "../../src/edge/services/signed-configuration.service.js";

describe("Signed Configuration Fastify REST Routes (End-to-End)", () => {
  let app: FastifyInstance;
  let repository: SignedConfigRepository;
  let service: SignedConfigurationService;

  beforeAll(async () => {
    app = Fastify();
    repository = new SignedConfigRepository();
    service = new SignedConfigurationService(undefined, repository);
    setSignedConfigurationService(service);

    const mockStore: any = {
      checkAccess: async () => ({ allowed: true }),
    };

    await registerSignedConfigurationRoutes(app, mockStore);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Key Management API", () => {
    it("POST /v1/edge/config/keys/generate generates a new RSA keypair", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/edge/config/keys/generate",
        payload: {
          keyId: "e2e-rsa-key",
          algorithm: "RSA-PSS-SHA256",
          keySize: 2048,
          validDays: 180,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.keyId).toBe("e2e-rsa-key");
      expect(json.data.algorithm).toBe("RSA-PSS-SHA256");
      expect(json.data.publicKeyPem).toContain("BEGIN PUBLIC KEY");
      expect(json.data.status).toBe("ACTIVE");
    });

    it("GET /v1/edge/config/keys lists registered keys without leaking secrets", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/edge/config/keys",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.data[0].privateKeyPem).toBeUndefined();
    });

    it("GET /v1/edge/config/keys/public returns public keystore for edge gateways", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/edge/config/keys/public",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data[0].publicKeyPem).toBeDefined();
    });

    it("POST /v1/edge/config/keys/:keyId/rotate rotates key and retires predecessor", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/edge/config/keys/e2e-rsa-key/rotate",
        payload: {
          newAlgorithm: "RSA-PSS-SHA256",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.retiredKeyId).toBe("e2e-rsa-key");
      expect(json.data.newKeyId).toBeDefined();
    });

    it("POST /v1/edge/config/keys/:keyId/revoke immediately revokes key", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/edge/config/keys/e2e-rsa-key/revoke",
        payload: {
          reason: "Security audit testing revocation",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("REVOKED");
      expect(json.data.revocationReason).toBe("Security audit testing revocation");
    });
  });

  describe("Configuration Bundle Signing & Distribution API", () => {
    let activeKeyId: string;

    beforeAll(async () => {
      const k = await service.generateKey({
        keyId: "bundle-signer-key",
        algorithm: "RSA-PSS-SHA256",
      });
      activeKeyId = k.keyId;
    });

    it("POST /v1/edge/config/bundles/sign creates cryptographically signed bundle", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/edge/config/bundles/sign",
        payload: {
          edgeId: "branch-gateway-300",
          branchId: "branch-03",
          version: 1,
          payload: {
            cameras: ["cam-1", "cam-2"],
            recordingRetentionDays: 90,
          },
          signerIdentity: "security-architect@bank.internal",
          keyId: activeKeyId,
          algorithm: "RSA-PSS-SHA256",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.edgeId).toBe("branch-gateway-300");
      expect(json.data.version).toBe(1);
      expect(json.data.signature).toBeDefined();
      expect(json.data.canonicalPayloadHash).toBeDefined();
    });

    it("POST /v1/edge/config/bundles/verify verifies a bundle signature", async () => {
      const key = await repository.getKey(activeKeyId);
      const bundle = await service.signBundleAsync({
        edgeId: "branch-gateway-300",
        version: 2,
        payload: { setting: "production" },
        signerIdentity: "admin",
        keyId: activeKeyId,
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/edge/config/bundles/verify",
        payload: {
          bundleId: bundle.bundleId,
          edgeId: bundle.edgeId,
          version: bundle.version,
          payload: bundle.payload,
          canonicalPayloadHash: bundle.canonicalPayloadHash,
          signature: bundle.signature,
          algorithm: bundle.algorithm,
          keyId: bundle.keyId,
          signerIdentity: bundle.signerIdentity,
          nonce: bundle.nonce,
          trustedPublicKeyPem: key?.publicKeyPem,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.isValid).toBe(true);
    });

    it("GET /v1/edge/config/bundles/:edgeId/desired retrieves latest desired bundle", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/edge/config/bundles/branch-gateway-300/desired",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.edgeId).toBe("branch-gateway-300");
      expect(json.data.version).toBe(2);
    });

    it("GET /v1/edge/config/bundles/:edgeId/history retrieves configuration history", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/edge/config/bundles/branch-gateway-300/history",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Application Receipts & Authoritative Drift API", () => {
    it("POST /v1/edge/config/bundles/:edgeId/report-applied reports verification receipt", async () => {
      const desired = await repository.getLatestDesiredBundle("branch-gateway-300");

      const res = await app.inject({
        method: "POST",
        url: "/v1/edge/config/bundles/branch-gateway-300/report-applied",
        payload: {
          bundleId: desired!.bundleId,
          version: desired!.version,
          appliedHash: desired!.canonicalPayloadHash,
          verificationResult: "VERIFIED",
          edgeAgentVersion: "2.5.0",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("IN_SYNC");
      expect(json.data.isDrifted).toBe(false);
    });

    it("GET /v1/edge/config/bundles/:edgeId/drift returns authoritative drift status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/edge/config/bundles/branch-gateway-300/drift",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("IN_SYNC");
      expect(json.data.isDrifted).toBe(false);
      expect(json.data.appliedVersion).toBe(2);
    });

    it("GET /v1/edge/config/audit-logs retrieves cryptographic audit trail", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/edge/config/audit-logs",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
