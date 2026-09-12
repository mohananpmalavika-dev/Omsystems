/**
 * Attribute-Based Access Control (ABAC - security.abac) REST API Routes
 * Production REST endpoints for contextual access policy management, user clearance tagging,
 * access evaluation, and tamper-resistant audit trail queries.
 * Zero mock data — fully backed by durable PostgreSQL persistence.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  abacService,
  CLEARANCE_LEVELS,
  type ClearanceLevel,
  type PolicyEffect,
} from "../security/abac/index.js";
import { PostgresAbacRepository } from "../database/abac-repository.js";

// Zod validation schemas
const clearanceLevelSchema = z.enum(CLEARANCE_LEVELS);
const policyEffectSchema = z.enum(["PERMIT", "DENY"]);

const dayOfWeekSchema = z.union([
  z.number().int().min(0).max(6),
  z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]),
]);

const timeRuleSchema = z.object({
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:MM in 24h format"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:MM in 24h format"),
  timezone: z.string().optional().default("UTC"),
  daysOfWeek: z.array(dayOfWeekSchema).optional(),
  allowOvernight: z.boolean().optional(),
});

const networkRuleSchema = z.object({
  allowedSubnets: z.array(z.string().min(3)).optional(),
  deniedSubnets: z.array(z.string().min(3)).optional(),
  requireInternalSubnet: z.boolean().optional(),
});

const clearanceRuleSchema = z.object({
  minClearanceLevel: clearanceLevelSchema.optional(),
  requiredClearanceTags: z.array(z.string().min(1)).optional(),
  matchMode: z.enum(["ALL", "ANY"]).optional().default("ALL"),
  prohibitedClearanceTags: z.array(z.string().min(1)).optional(),
});

const evaluateRequestSchema = z.object({
  subject: z.object({
    userId: z.string().min(1),
    tenantId: z.string().min(1),
    roles: z.array(z.string()).min(1),
    branchScope: z.array(z.string()).optional(),
    clearanceLevel: clearanceLevelSchema.optional(),
    clearanceTags: z.array(z.string()).optional(),
    shiftStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    shiftEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    networkCidr: z.string().optional(),
  }),
  resource: z.object({
    tenantId: z.string().min(1),
    branchId: z.string().min(1),
    resourceType: z.string().optional().default("CAMERA"),
    resourceId: z.string().optional(),
    classification: z.string().optional(),
    requiredTags: z.array(z.string()).optional(),
  }),
  action: z.string().min(1),
  environment: z
    .object({
      sourceIp: z.string().optional(),
      requestTimeUtc: z.string().datetime().optional(),
      clientTimezone: z.string().optional(),
    })
    .optional(),
});

const createPolicySchema = z.object({
  tenantId: z.string().min(1).max(64),
  name: z.string().min(2).max(128),
  description: z.string().max(1000).optional(),
  effect: policyEffectSchema.default("PERMIT"),
  priority: z.number().int().min(1).max(10000).default(100),
  actions: z.array(z.string()).min(1).default(["*"]),
  resourceTypes: z.array(z.string()).min(1).default(["*"]),
  resourceClassifications: z.array(z.string()).min(1).default(["*"]),
  branchScope: z.array(z.string()).min(1).default(["ALL"]),
  roles: z.array(z.string()).min(1).default(["*"]),
  timeRule: timeRuleSchema.optional(),
  networkRule: networkRuleSchema.optional(),
  clearanceRule: clearanceRuleSchema.optional(),
  isActive: z.boolean().default(true),
});

const updatePolicySchema = z.object({
  name: z.string().min(2).max(128).optional(),
  description: z.string().max(1000).optional(),
  effect: policyEffectSchema.optional(),
  priority: z.number().int().min(1).max(10000).optional(),
  actions: z.array(z.string()).min(1).optional(),
  resourceTypes: z.array(z.string()).min(1).optional(),
  resourceClassifications: z.array(z.string()).min(1).optional(),
  branchScope: z.array(z.string()).min(1).optional(),
  roles: z.array(z.string()).min(1).optional(),
  timeRule: timeRuleSchema.nullable().optional(),
  networkRule: networkRuleSchema.nullable().optional(),
  clearanceRule: clearanceRuleSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

const upsertClearanceSchema = z.object({
  tenantId: z.string().min(1),
  clearanceLevel: clearanceLevelSchema.default("UNCLASSIFIED"),
  clearanceTags: z.array(z.string()).default([]),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  issuedBy: z.string().min(1).default("security-admin"),
  metadata: z.record(z.unknown()).optional(),
});

const revokeClearanceSchema = z.object({
  tenantId: z.string().min(1),
  reason: z.string().min(3).max(500),
  revokedBy: z.string().min(1).optional(),
});

export async function registerAbacRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
) {
  // Wire up PostgreSQL pool if available on store
  const pool = (store as any)?.pool || (store as any)?.db;
  if (pool) {
    abacService.setRepository(new PostgresAbacRepository(pool));
  }

  // Seed default banking surveillance policies
  await abacService.seedStandardPolicies("default").catch((err) => {
    app.log.warn({ err }, "[ABAC] Failed to seed standard policies");
  });

  // 1. Get ABAC Engine Status & Metrics
  app.get("/v1/security/abac/status", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { tenantId?: string };
    const metrics = await abacService.getMetrics(query.tenantId);

    return reply.send({
      success: true,
      status: "HEALTHY",
      capabilityId: "security.abac",
      maturity: "PRODUCTION",
      metrics,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Evaluate Contextual Access (Time, Subnet, Clearance)
  app.post("/v1/security/abac/evaluate", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = evaluateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "VALIDATION_FAILED",
        details: parsed.error.format(),
      });
    }

    const { subject, resource, action, environment } = parsed.data;

    // Resolve client IP from request headers or socket if not passed in environment
    const clientIp =
      environment?.sourceIp ||
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (request.headers["x-real-ip"] as string) ||
      request.ip ||
      "127.0.0.1";

    const evalResult = await abacService.evaluate({
      subject: {
        ...subject,
        clearanceLevel: subject.clearanceLevel as ClearanceLevel | undefined,
      },
      resource,
      action,
      environment: {
        sourceIp: clientIp,
        requestTimeUtc: environment?.requestTimeUtc,
        clientTimezone: environment?.clientTimezone,
      },
    });

    return reply.status(evalResult.allowed ? 200 : 403).send({
      success: true,
      decision: evalResult.decision,
      allowed: evalResult.allowed,
      reason: evalResult.reason,
      policyHash: evalResult.policyHash,
      appliedPolicies: evalResult.appliedPolicies,
      evaluationDetails: evalResult.evaluationDetails,
      auditLogId: evalResult.auditLogId,
      timestamp: evalResult.timestamp,
    });
  });

  // 3. List ABAC Policies
  app.get("/v1/security/abac/policies", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { tenantId?: string; activeOnly?: string };
    const activeOnly = query.activeOnly === "true";
    const policies = await abacService.listPolicies(query.tenantId, activeOnly);

    return reply.send({
      success: true,
      count: policies.length,
      policies,
    });
  });

  // 4. Create Dynamic ABAC Policy
  app.post("/v1/security/abac/policies", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createPolicySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "VALIDATION_FAILED",
        details: parsed.error.format(),
      });
    }

    const policy = await abacService.createPolicy({
      ...parsed.data,
      effect: parsed.data.effect as PolicyEffect,
      clearanceRule: parsed.data.clearanceRule
        ? {
            ...parsed.data.clearanceRule,
            minClearanceLevel: parsed.data.clearanceRule.minClearanceLevel as ClearanceLevel | undefined,
          }
        : undefined,
    });

    return reply.status(201).send({
      success: true,
      policy,
    });
  });

  // 5. Get ABAC Policy by ID
  app.get("/v1/security/abac/policies/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const policy = await abacService.getPolicyById(id);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        error: "POLICY_NOT_FOUND",
        message: `ABAC policy with ID '${id}' does not exist`,
      });
    }

    return reply.send({
      success: true,
      policy,
    });
  });

  // 6. Update ABAC Policy
  app.put("/v1/security/abac/policies/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updatePolicySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "VALIDATION_FAILED",
        details: parsed.error.format(),
      });
    }

    const updated = await abacService.updatePolicy(id, {
      ...parsed.data,
      effect: parsed.data.effect as PolicyEffect | undefined,
      clearanceRule: parsed.data.clearanceRule
        ? {
            ...parsed.data.clearanceRule,
            minClearanceLevel: parsed.data.clearanceRule.minClearanceLevel as ClearanceLevel | undefined,
          }
        : parsed.data.clearanceRule,
    });

    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: "POLICY_NOT_FOUND",
        message: `ABAC policy with ID '${id}' not found`,
      });
    }

    return reply.send({
      success: true,
      policy: updated,
    });
  });

  // 7. Delete / Deactivate ABAC Policy
  app.delete("/v1/security/abac/policies/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = await abacService.deletePolicy(id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: "POLICY_NOT_FOUND",
        message: `ABAC policy with ID '${id}' does not exist`,
      });
    }

    return reply.send({
      success: true,
      message: `Policy '${id}' successfully removed`,
    });
  });

  // 8. Get User Clearance Profile & Tags
  app.get(
    "/v1/security/abac/users/:userId/clearance",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const query = request.query as { tenantId?: string };
      const tenantId = query.tenantId || (request.headers["x-tenant-id"] as string) || "default";

      const clearance = await abacService.getClearance(tenantId, userId);
      if (!clearance) {
        return reply.status(404).send({
          success: false,
          error: "CLEARANCE_NOT_FOUND",
          message: `No clearance profile found for user '${userId}' in tenant '${tenantId}'`,
        });
      }

      return reply.send({
        success: true,
        clearance,
      });
    },
  );

  // 9. Grant / Upsert User Clearance & Clearance Tags
  app.post(
    "/v1/security/abac/users/:userId/clearance",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const parsed = upsertClearanceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "VALIDATION_FAILED",
          details: parsed.error.format(),
        });
      }

      const updated = await abacService.upsertClearance({
        userId,
        tenantId: parsed.data.tenantId,
        clearanceLevel: parsed.data.clearanceLevel as ClearanceLevel,
        clearanceTags: parsed.data.clearanceTags,
        validFrom: parsed.data.validFrom,
        validUntil: parsed.data.validUntil,
        issuedBy: parsed.data.issuedBy,
        metadata: parsed.data.metadata,
      });

      return reply.send({
        success: true,
        clearance: updated,
      });
    },
  );

  // 10. Revoke User Clearance
  app.post(
    "/v1/security/abac/users/:userId/clearance/revoke",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      const parsed = revokeClearanceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "VALIDATION_FAILED",
          details: parsed.error.format(),
        });
      }

      const revoked = await abacService.revokeClearance({
        userId,
        tenantId: parsed.data.tenantId,
        reason: parsed.data.reason,
        revokedBy: parsed.data.revokedBy,
      });

      if (!revoked) {
        return reply.status(404).send({
          success: false,
          error: "CLEARANCE_NOT_FOUND",
          message: `Cannot revoke: No clearance profile found for user '${userId}' in tenant '${parsed.data.tenantId}'`,
        });
      }

      return reply.send({
        success: true,
        clearance: revoked,
      });
    },
  );

  // 11. Query Evaluation Audit Logs
  app.get("/v1/security/abac/audit-logs", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { tenantId?: string; userId?: string; limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const logs = await abacService.listAuditLogs(query.tenantId, query.userId, limit);

    return reply.send({
      success: true,
      count: logs.length,
      logs,
    });
  });
}
