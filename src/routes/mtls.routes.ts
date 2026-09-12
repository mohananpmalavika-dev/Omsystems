/**
 * Mutual TLS (mTLS) Security Management API Routes
 * Production REST endpoints for certificate pinning, CRL management, and verification.
 * Zero mock data — fully backed by durable PostgreSQL persistence and audit trails.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { mtlsAuthenticator, type NodeRole } from "../security/mtls/index.js";
import { PostgresMtlsRepository, InMemoryMtlsRepository } from "../database/mtls-repository.js";

const nodeRoles = [
  "EDGE_AGENT",
  "EDGE_GATEWAY",
  "MEDIA_NODE",
  "RECORDING_ENGINE",
  "CONTROL_PLANE",
] as const;

const nodeRoleSchema = z.enum(nodeRoles);

const pinByPemSchema = z.object({
  nodeId: z.string().min(1).max(128),
  role: nodeRoleSchema,
  pemCert: z.string().min(32),
  pinnedBy: z.string().min(1).max(128).default("security-admin"),
  metadata: z.record(z.unknown()).optional(),
});

const pinByDetailsSchema = z.object({
  nodeId: z.string().min(1).max(128),
  role: nodeRoleSchema,
  certFingerprint: z.string().regex(/^[a-fA-F0-9]{64}$/, "Must be a 64-char SHA-256 hex string"),
  commonName: z.string().optional(),
  allowedSans: z.array(z.string()).default([]),
  subjectDn: z.string().optional(),
  issuerDn: z.string().optional(),
  serialNumber: z.string().optional(),
  notBefore: z.string().datetime().optional(),
  notAfter: z.string().datetime().optional(),
  pinnedBy: z.string().min(1).max(128).default("security-admin"),
  metadata: z.record(z.unknown()).optional(),
});

const revokeSchema = z.object({
  fingerprint: z.string().regex(/^[a-fA-F0-9]{64}$/, "Must be a 64-char SHA-256 hex string"),
  reason: z.string().min(3).max(500),
  serialNumber: z.string().optional(),
  issuerDn: z.string().optional(),
  revokedBy: z.string().min(1).max(128).default("security-admin"),
});

const validateCertSchema = z.object({
  pemCert: z.string().min(32),
  expectedRole: nodeRoleSchema,
  expectedSan: z.string().optional(),
});

export async function registerMtlsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  // Ensure the authenticator is hooked up to the store's Postgres pool if present
  const pool = (store as any).pool || (store as any).db;
  if (pool) {
    mtlsAuthenticator.setRepository(new PostgresMtlsRepository(pool));
    await mtlsAuthenticator.reloadCache().catch((err) => {
      app.log.warn({ err }, "[mTLS] Could not preload mTLS cache from PostgreSQL");
    });
  }

  // 1. Get mTLS Status & Metrics
  app.get("/v1/security/mtls/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await mtlsAuthenticator.getMetrics();
    const enforcementMode = process.env.EDGE_MTLS_ENFORCED === "true"
      ? "ENFORCED"
      : process.env.EDGE_MTLS_DISABLED === "true"
      ? "DISABLED"
      : "PERMISSIVE";

    return reply.send({
      success: true,
      status: "HEALTHY",
      enforcementMode,
      metrics,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. List Trusted Certificate Pins
  app.get("/v1/security/mtls/pins", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { role?: string };
    let role: NodeRole | undefined = undefined;
    if (query.role) {
      const parsedRole = nodeRoleSchema.safeParse(query.role);
      if (parsedRole.success) {
        role = parsedRole.data;
      }
    }

    const pins = await mtlsAuthenticator.listPinsAsync(role);
    return reply.send({
      success: true,
      count: pins.length,
      data: pins,
    });
  });

  // 3. Pin a Certificate (Supports PEM or direct metadata)
  app.post("/v1/security/mtls/pins", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;

    if (body?.pemCert) {
      const parsed = pinByPemSchema.parse(body);
      const record = await mtlsAuthenticator.pinCertificateFromPem(
        parsed.pemCert,
        parsed.nodeId,
        parsed.role,
        parsed.pinnedBy,
      );
      return reply.code(201).send({
        success: true,
        message: "Certificate pinned successfully from PEM",
        data: record,
      });
    }

    const parsed = pinByDetailsSchema.parse(body);
    const record = await mtlsAuthenticator.pinCertificateAsync({
      nodeId: parsed.nodeId,
      role: parsed.role,
      certFingerprint: parsed.certFingerprint,
      commonName: parsed.commonName,
      allowedSans: parsed.allowedSans,
      subjectDn: parsed.subjectDn,
      issuerDn: parsed.issuerDn,
      serialNumber: parsed.serialNumber,
      notBefore: parsed.notBefore,
      notAfter: parsed.notAfter,
      pinnedBy: parsed.pinnedBy,
      metadata: parsed.metadata,
    });

    return reply.code(201).send({
      success: true,
      message: "Certificate pin registered successfully",
      data: record,
    });
  });

  // 4. Delete a Pin
  app.delete("/v1/security/mtls/pins/:fingerprint", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { fingerprint: string };
    const fp = params.fingerprint?.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fp)) {
      return reply.code(400).send({ error: "invalid_fingerprint", message: "Fingerprint must be 64-char hex string" });
    }

    const deleted = await mtlsAuthenticator.deletePinAsync(fp);
    if (!deleted) {
      return reply.code(404).send({ error: "pin_not_found", message: "Certificate pin not found" });
    }

    return reply.send({
      success: true,
      message: `Certificate pin for fingerprint ${fp} removed`,
    });
  });

  // 5. Revoke a Certificate
  app.post("/v1/security/mtls/revoke", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = revokeSchema.parse(request.body);
    await mtlsAuthenticator.revokeCertificateAsync({
      fingerprint: parsed.fingerprint,
      reason: parsed.reason,
      serialNumber: parsed.serialNumber,
      issuerDn: parsed.issuerDn,
      revokedBy: parsed.revokedBy,
    });

    return reply.send({
      success: true,
      message: `Certificate ${parsed.fingerprint.toLowerCase()} has been revoked and added to CRL`,
    });
  });

  // 6. List Revoked Certificates
  app.get("/v1/security/mtls/revocations", async (_request: FastifyRequest, reply: FastifyReply) => {
    const revocations = await mtlsAuthenticator.listRevocationsAsync();
    return reply.send({
      success: true,
      count: revocations.length,
      data: revocations,
    });
  });

  // 7. Validate a Certificate against Policy
  app.post("/v1/security/mtls/validate", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = validateCertSchema.parse(request.body);
    const clientIp = request.ip;
    const result = mtlsAuthenticator.validateClientCert(parsed.pemCert, parsed.expectedRole, {
      clientIp,
      endpoint: "/v1/security/mtls/validate",
    });

    if (!result.valid) {
      return reply.code(403).send({
        success: false,
        valid: false,
        rejectionReason: result.rejectionReason,
        fingerprint: result.fingerprint,
        details: result.certDetails,
      });
    }

    if (parsed.expectedSan && result.certDetails) {
      const hasSan = result.certDetails.sans.includes(parsed.expectedSan);
      if (!hasSan) {
        return reply.code(403).send({
          success: false,
          valid: false,
          rejectionReason: `Certificate does not contain expected SAN: ${parsed.expectedSan}`,
          details: result.certDetails,
        });
      }
    }

    return reply.send({
      success: true,
      valid: true,
      nodeId: result.nodeId,
      role: result.role,
      fingerprint: result.fingerprint,
      details: result.certDetails,
    });
  });

  // 8. Query mTLS Audit Logs
  app.get("/v1/security/mtls/audit-logs", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { nodeId?: string; limit?: string; offset?: string };
    const logs = await mtlsAuthenticator.getAuditLogs({
      nodeId: query.nodeId,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });

    return reply.send({
      success: true,
      count: logs.length,
      data: logs,
    });
  });
}
