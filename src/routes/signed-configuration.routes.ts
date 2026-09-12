/**
 * Fastify Routes for Cryptographically Signed Edge Config Bundles
 * Capability: security.signed_configuration
 * 
 * Production endpoints for cryptographic key lifecycle, bundle signing,
 * distribution, edge verification receipts, drift detection, and tamper auditing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  SignedConfigurationService,
  signedConfigurationService,
} from "../edge/services/signed-configuration.service.js";
import { SignedConfigRepository } from "../database/signed-config-repository.js";

let sharedService: SignedConfigurationService | null = null;

export function getSignedConfigurationService(store?: ControlPlaneStore): SignedConfigurationService {
  if (!sharedService) {
    const pool = (store as any)?.pool || (store as any)?.db;
    const repository = new SignedConfigRepository(pool);
    sharedService = new SignedConfigurationService(pool, repository);
  }
  return sharedService;
}

export function setSignedConfigurationService(service: SignedConfigurationService): void {
  sharedService = service;
}

export async function registerSignedConfigurationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const service = getSignedConfigurationService(store);
  const repository = service.getRepository();

  const getActorId = (req: FastifyRequest): string => {
    const user = (req as any).user || (req as any).currentUser;
    return user?.id || user?.username || (req.headers["x-user-id"] as string) || "sec-admin";
  };

  // ============================================================================
  // 1. Key Lifecycle Management
  // ============================================================================

  const generateKeySchema = z.object({
    keyId: z.string().min(3).max(64).optional(),
    algorithm: z
      .enum(["RSA-PSS-SHA256", "RSA-PKCS1-SHA256", "HMAC-SHA256", "ED25519"])
      .default("RSA-PSS-SHA256"),
    keySize: z.number().int().min(256).max(4096).optional(),
    validDays: z.number().int().min(1).max(3650).default(365),
  });

  app.post("/v1/edge/config/keys/generate", async (request, reply) => {
    try {
      const parsed = generateKeySchema.parse(request.body || {});
      const key = await service.generateKey(parsed);
      return reply.code(201).send({
        success: true,
        data: {
          keyId: key.keyId,
          algorithm: key.algorithm,
          keySize: key.keySize,
          publicKeyPem: key.publicKeyPem,
          keyFingerprint: key.keyFingerprint,
          status: key.status,
          validFrom: key.validFrom,
          validUntil: key.validUntil,
        },
      });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "key_generation_failed",
        message: err?.message,
      });
    }
  });

  app.get("/v1/edge/config/keys", async (_request, reply) => {
    try {
      const keys = await repository.listKeys();
      const sanitized = keys.map((k) => ({
        keyId: k.keyId,
        algorithm: k.algorithm,
        keySize: k.keySize,
        publicKeyPem: k.publicKeyPem,
        keyFingerprint: k.keyFingerprint,
        status: k.status,
        validFrom: k.validFrom,
        validUntil: k.validUntil,
        signCount: k.signCount,
        verifyCount: k.verifyCount,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        revocationReason: k.revocationReason,
      }));
      return reply.code(200).send({
        success: true,
        data: sanitized,
      });
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: "keys_query_failed",
        message: err?.message,
      });
    }
  });

  app.get("/v1/edge/config/keys/public", async (_request, reply) => {
    try {
      const publicKeys = await service.getPublicKeystore();
      return reply.code(200).send({
        success: true,
        data: publicKeys,
      });
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: "public_keys_failed",
        message: err?.message,
      });
    }
  });

  const rotateKeySchema = z.object({
    newAlgorithm: z
      .enum(["RSA-PSS-SHA256", "RSA-PKCS1-SHA256", "HMAC-SHA256", "ED25519"])
      .optional(),
    keySize: z.number().int().min(256).max(4096).optional(),
  });

  app.post("/v1/edge/config/keys/:keyId/rotate", async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    try {
      const body = rotateKeySchema.parse(request.body || {});
      const actorId = getActorId(request);
      const result = await service.rotateKey({
        oldKeyId: keyId,
        newAlgorithm: body.newAlgorithm,
        keySize: body.keySize,
        actorId,
      });
      return reply.code(200).send({
        success: true,
        data: {
          retiredKeyId: result.oldKey.keyId,
          newKeyId: result.newKey.keyId,
          newAlgorithm: result.newKey.algorithm,
          newPublicKeyPem: result.newKey.publicKeyPem,
        },
      });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "key_rotation_failed",
        message: err?.message,
      });
    }
  });

  const revokeKeySchema = z.object({
    reason: z.string().min(3).max(256),
  });

  app.post("/v1/edge/config/keys/:keyId/revoke", async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    try {
      const { reason } = revokeKeySchema.parse(request.body || {});
      const actorId = getActorId(request);
      const revoked = await service.revokeKey(keyId, reason, actorId);
      return reply.code(200).send({
        success: true,
        data: {
          keyId: revoked.keyId,
          status: revoked.status,
          revokedAt: revoked.revokedAt,
          revocationReason: revoked.revocationReason,
        },
      });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "key_revocation_failed",
        message: err?.message,
      });
    }
  });

  // ============================================================================
  // 2. Bundle Signing, Verification & Distribution
  // ============================================================================

  const signBundleSchema = z.object({
    edgeId: z.string().min(1),
    branchId: z.string().optional(),
    version: z.number().int().min(1),
    previousVersion: z.number().int().optional(),
    payload: z.record(z.unknown()),
    signerIdentity: z.string().min(1).default("sec-ops@bank.internal"),
    signerRole: z.string().default("SECURITY_ADMIN"),
    algorithm: z
      .enum(["RSA-PSS-SHA256", "RSA-PKCS1-SHA256", "HMAC-SHA256", "ED25519"])
      .optional(),
    keyId: z.string().optional(),
    expiresInSeconds: z.number().int().positive().optional(),
  });

  app.post("/v1/edge/config/bundles/sign", async (request, reply) => {
    try {
      const parsed = signBundleSchema.parse(request.body || {});
      const bundle = await service.signBundleAsync(parsed);
      return reply.code(201).send({
        success: true,
        data: bundle,
      });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "bundle_signing_failed",
        message: err?.message,
      });
    }
  });

  const verifyBundleSchema = z.object({
    bundleId: z.string().optional(),
    edgeId: z.string().min(1),
    version: z.number().int(),
    payload: z.record(z.unknown()),
    payloadHash: z.string().optional(),
    canonicalPayloadHash: z.string().optional(),
    signature: z.string().min(1),
    algorithm: z
      .enum(["RSA-PSS-SHA256", "RSA-PKCS1-SHA256", "HMAC-SHA256", "ED25519"])
      .default("HMAC-SHA256"),
    keyId: z.string().default("default-hmac-key"),
    signerIdentity: z.string().default("sec-ops@bank.internal"),
    nonce: z.string().optional(),
    expiresAt: z.string().optional(),
    trustedPublicKeyPem: z.string().optional(),
  });

  app.post("/v1/edge/config/bundles/verify", async (request, reply) => {
    try {
      const parsed = verifyBundleSchema.parse(request.body || {});
      const result = service.verifyBundle(parsed as any, parsed.trustedPublicKeyPem);
      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "verification_request_invalid",
        message: err?.message,
      });
    }
  });

  app.get("/v1/edge/config/bundles/:edgeId/desired", async (request, reply) => {
    const { edgeId } = request.params as { edgeId: string };
    try {
      const bundle = await repository.getLatestDesiredBundle(edgeId);
      if (!bundle) {
        return reply.code(404).send({
          success: false,
          error: "no_desired_config",
          message: `No signed configuration bundle found for edge gateway ${edgeId}`,
        });
      }
      return reply.code(200).send({
        success: true,
        data: bundle,
      });
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: "fetch_desired_failed",
        message: err?.message,
      });
    }
  });

  app.get("/v1/edge/config/bundles/:edgeId/history", async (request, reply) => {
    const { edgeId } = request.params as { edgeId: string };
    const query = request.query as { limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    try {
      const history = await repository.listBundleHistory(edgeId, limit);
      return reply.code(200).send({
        success: true,
        data: history,
      });
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: "fetch_history_failed",
        message: err?.message,
      });
    }
  });

  // ============================================================================
  // 3. Application Receipts & Authoritative Drift
  // ============================================================================

  const reportAppliedSchema = z.object({
    bundleId: z.string().min(1),
    version: z.number().int(),
    appliedHash: z.string().min(1),
    verificationResult: z.enum(["VERIFIED", "FAILED", "TAMPERED"]),
    rejectionReason: z.string().optional(),
    edgeAgentVersion: z.string().optional(),
  });

  app.post("/v1/edge/config/bundles/:edgeId/report-applied", async (request, reply) => {
    const { edgeId } = request.params as { edgeId: string };
    try {
      const parsed = reportAppliedSchema.parse(request.body || {});
      const clientIp = request.ip;
      const result = await service.recordApplicationReceipt({
        bundleId: parsed.bundleId,
        edgeId,
        version: parsed.version,
        appliedHash: parsed.appliedHash,
        verificationResult: parsed.verificationResult,
        rejectionReason: parsed.rejectionReason,
        edgeAgentVersion: parsed.edgeAgentVersion,
        clientIp,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "report_receipt_invalid",
        message: err?.message,
      });
    }
  });

  app.get("/v1/edge/config/bundles/:edgeId/drift", async (request, reply) => {
    const { edgeId } = request.params as { edgeId: string };
    try {
      const desired = await repository.getLatestDesiredBundle(edgeId);
      if (!desired) {
        return reply.code(404).send({
          success: false,
          error: "no_configuration",
          message: `No configuration found for edge ${edgeId}`,
        });
      }

      const drift = service.detectDrift(desired as any, {
        appliedVersion: desired.appliedVersion || 0,
        actualPayloadHash: desired.appliedHash || undefined,
        verificationStatus: desired.verificationStatus,
        isTampered: desired.verificationStatus === "TAMPERED",
      });

      return reply.code(200).send({
        success: true,
        data: {
          edgeId,
          desiredVersion: desired.version,
          appliedVersion: desired.appliedVersion || null,
          desiredHash: desired.canonicalPayloadHash || desired.payloadHash,
          appliedHash: desired.appliedHash || null,
          verificationStatus: desired.verificationStatus,
          status: drift.status,
          isDrifted: drift.isDrifted,
          driftReason: drift.driftReason,
          details: drift.details,
          lastAppliedAt: desired.appliedAt,
        },
      });
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: "drift_check_failed",
        message: err?.message,
      });
    }
  });

  // ============================================================================
  // 4. Audit Trail
  // ============================================================================

  app.get("/v1/edge/config/audit-logs", async (request, reply) => {
    const query = request.query as { edgeId?: string; keyId?: string; limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    try {
      const logs = await repository.listAuditLogs({
        edgeId: query.edgeId,
        keyId: query.keyId,
        limit,
      });
      return reply.code(200).send({
        success: true,
        data: logs,
      });
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: "audit_logs_failed",
        message: err?.message,
      });
    }
  });
}
