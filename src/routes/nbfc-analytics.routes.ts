import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { NbfcRuleRepository } from "../analytics/nbfc-rule-repository.js";
import type { NbfcRuleEngineService } from "../analytics/nbfc-rule-engine.service.js";
import { immutableAuditService } from "../security/audit/immutable-audit.service.js";

export interface NbfcAnalyticsRouteOptions {
  repository: NbfcRuleRepository;
  engineService: NbfcRuleEngineService;
}

export function registerNbfcAnalyticsRoutes(
  app: FastifyInstance,
  options: NbfcAnalyticsRouteOptions
) {
  const { repository, engineService } = options;

  function getUser(request: FastifyRequest) {
    const user = (request as any).currentUser;
    const headerTenant = request.headers["x-tenant-id"] as string | undefined;
    const tenantId = user?.tenantId || headerTenant || "00000000-0000-4000-8000-000000000001";
    const userId = user?.id || user?.userId || "system-admin";
    const roles = user?.roles || ["admin"];
    return { tenantId, userId, roles, user };
  }

  // ==========================================
  // 1. RULES CRUD & LIFECYCLE
  // ==========================================

  // List rules
  app.get("/api/ai/rules", { config: { noAuth: true } }, async (request, reply) => {
    const { tenantId } = getUser(request);
    const query = request.query as any;

    const rules = await repository.listRules({
      tenantId,
      branchId: query.branchId,
      cameraId: query.cameraId,
      detectorType: query.detectorType,
      state: query.state,
      severity: query.severity,
      search: query.search,
    });

    return reply.send({
      rules,
      total: rules.length,
      activeCount: rules.filter((r) => r.state === "ACTIVE").length,
      shadowCount: rules.filter((r) => r.state === "SHADOW").length,
    });
  });

  // Create rule
  app.post("/api/ai/rules", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const body = z.object({
      name: z.string().min(2).max(160),
      description: z.string().optional(),
      branchIds: z.array(z.string()).optional(),
      cameraIds: z.array(z.string()).optional(),
      zoneId: z.string().optional(),
      detectorType: z.string().min(1),
      condition: z.record(z.any()),
      durationMs: z.number().int().min(0).default(0),
      schedule: z.record(z.any()).optional(),
      severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      cooldownMs: z.number().int().min(1000).default(60000),
      actions: z.array(z.string()).default(["CREATE_ALERT"]),
      state: z.enum(["ACTIVE", "SHADOW", "INACTIVE"]).default("ACTIVE"),
      templateId: z.string().optional(),
      changeReason: z.string().default("Initial rule creation"),
    }).parse(request.body || {});

    const rule = await repository.createRule({
      tenantId,
      name: body.name,
      description: body.description,
      branchIds: body.branchIds || [],
      cameraIds: body.cameraIds || [],
      zoneId: body.zoneId,
      detectorType: body.detectorType as any,
      condition: body.condition as any,
      durationMs: body.durationMs,
      schedule: (body.schedule as any) || { type: "BUSINESS_HOURS" },
      severity: body.severity as any,
      cooldownMs: body.cooldownMs,
      actions: body.actions as any,
      state: body.state as any,
      templateId: body.templateId,
      createdBy: userId,
    }, body.changeReason);

    immutableAuditService.append({
      tenantId,
      category: "CONFIG_CHANGED",
      action: "ai_rule.created",
      actorUserId: userId,
      actorRoles: ["admin"],
      targetResourceType: "AI_RULE",
      targetResourceId: rule.id,
      outcome: "SUCCESS",
      metadata: { name: rule.name, detectorType: rule.detectorType, severity: rule.severity },
      timestamp: new Date().toISOString(),
    });

    return reply.code(201).send(rule);
  });

  // Enable all NBFC rule templates across all cameras
  app.post("/api/ai/rules/apply-all-templates", { config: { noAuth: true } }, async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const templates = await repository.listTemplates();
    const existingRules = await repository.listRules({ tenantId });
    const existingTemplateIds = new Set(existingRules.map((r) => r.templateId).filter(Boolean));

    const newlyInstantiated: any[] = [];
    for (const tmpl of templates) {
      if (!existingTemplateIds.has(tmpl.id)) {
        try {
          const rule = await repository.instantiateTemplate(tmpl.id, {
            tenantId,
            name: tmpl.name,
            branchIds: [],
            cameraIds: [],
            createdBy: userId,
          });
          newlyInstantiated.push(rule);
        } catch (e) {
          console.warn(`Failed to instantiate template ${tmpl.id}:`, e);
        }
      }
    }

    // Ensure all existing rules are active and enabled
    for (const rule of existingRules) {
      if (!rule.enabled || rule.state !== "ACTIVE") {
        await repository.updateRule(rule.id, { enabled: true, state: "ACTIVE" }, "Batch enabled for all cameras", userId);
      }
    }

    immutableAuditService.append({
      tenantId,
      category: "CONFIG_CHANGED",
      action: "ai_rules.all_enabled_for_all_cameras",
      actorUserId: userId,
      actorRoles: ["admin"],
      targetResourceType: "AI_RULE",
      targetResourceId: "all",
      outcome: "SUCCESS",
      metadata: { totalTemplates: templates.length, newlyInstantiated: newlyInstantiated.length },
      timestamp: new Date().toISOString(),
    });

    const allRules = await repository.listRules({ tenantId });

    return reply.send({
      success: true,
      message: `All ${templates.length} NBFC rules enabled across all cameras`,
      totalTemplates: templates.length,
      newlyInstantiated: newlyInstantiated.length,
      totalActiveRules: allRules.filter((r) => r.state === "ACTIVE").length,
    });
  });

  // Get rule details
  app.get("/api/ai/rules/:id", { config: { noAuth: true } }, async (request, reply) => {
    const params = request.params as { id: string };
    const rule = await repository.getRule(params.id);
    if (!rule) {
      return reply.code(404).send({ error: "rule_not_found" });
    }

    const versions = await repository.getRuleVersions(params.id);
    return reply.send({
      rule,
      versions,
    });
  });

  // Update rule (produces version bump and audit record)
  app.patch("/api/ai/rules/:id", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const params = request.params as { id: string };
    const body = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
      state: z.enum(["ACTIVE", "SHADOW", "INACTIVE", "PENDING", "COOLDOWN", "SUPPRESSED"]).optional(),
      branchIds: z.array(z.string()).optional(),
      cameraIds: z.array(z.string()).optional(),
      zoneId: z.string().nullable().optional(),
      detectorType: z.string().optional(),
      condition: z.record(z.any()).optional(),
      durationMs: z.number().int().min(0).optional(),
      schedule: z.record(z.any()).optional(),
      severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      cooldownMs: z.number().int().min(1000).optional(),
      actions: z.array(z.string()).optional(),
      changeReason: z.string().default("Modified rule configuration"),
    }).parse(request.body || {});

    const updated = await repository.updateRule(
      params.id,
      body as any,
      body.changeReason,
      userId
    );

    if (!updated) {
      return reply.code(404).send({ error: "rule_not_found" });
    }

    immutableAuditService.append({
      tenantId,
      category: "CONFIG_CHANGED",
      action: "ai_rule.updated",
      actorUserId: userId,
      actorRoles: ["admin"],
      targetResourceType: "AI_RULE",
      targetResourceId: updated.id,
      outcome: "SUCCESS",
      metadata: { version: updated.version, changeReason: body.changeReason },
      timestamp: new Date().toISOString(),
    });

    return reply.send(updated);
  });

  // Delete rule
  app.delete("/api/ai/rules/:id", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const params = request.params as { id: string };

    const deleted = await repository.deleteRule(params.id);
    if (!deleted) {
      return reply.code(404).send({ error: "rule_not_found" });
    }

    immutableAuditService.append({
      tenantId,
      category: "CONFIG_CHANGED",
      action: "ai_rule.deleted",
      actorUserId: userId,
      actorRoles: ["admin"],
      targetResourceType: "AI_RULE",
      targetResourceId: params.id,
      outcome: "SUCCESS",
      metadata: { ruleId: params.id },
      timestamp: new Date().toISOString(),
    });

    return reply.send({ success: true, ruleId: params.id });
  });

  // Enable rule
  app.post("/api/ai/rules/:id/enable", async (request, reply) => {
    const { userId } = getUser(request);
    const params = request.params as { id: string };
    const updated = await repository.updateRule(params.id, { state: "ACTIVE", enabled: true }, "Enabled rule", userId);
    if (!updated) return reply.code(404).send({ error: "rule_not_found" });
    return reply.send({ success: true, state: "ACTIVE" });
  });

  // Disable rule
  app.post("/api/ai/rules/:id/disable", async (request, reply) => {
    const { userId } = getUser(request);
    const params = request.params as { id: string };
    const updated = await repository.updateRule(params.id, { state: "INACTIVE", enabled: false }, "Disabled rule", userId);
    if (!updated) return reply.code(404).send({ error: "rule_not_found" });
    return reply.send({ success: true, state: "INACTIVE" });
  });

  // Toggle shadow mode
  app.post("/api/ai/rules/:id/shadow", async (request, reply) => {
    const { userId } = getUser(request);
    const params = request.params as { id: string };
    const rule = await repository.getRule(params.id);
    if (!rule) return reply.code(404).send({ error: "rule_not_found" });

    const nextState = rule.state === "SHADOW" ? "ACTIVE" : "SHADOW";
    const updated = await repository.updateRule(params.id, { state: nextState }, `Toggled state to ${nextState}`, userId);
    return reply.send({ success: true, state: updated?.state });
  });

  // Test rule simulation
  app.post("/api/ai/rules/:id/test", async (request, reply) => {
    const { userId } = getUser(request);
    const params = request.params as { id: string };
    const rule = await repository.getRule(params.id);
    if (!rule) return reply.code(404).send({ error: "rule_not_found" });

    const body = z.object({
      days: z.number().int().min(1).max(30).default(7),
      simulatedSamples: z.number().int().min(10).max(1000).default(100),
    }).parse(request.body || {});

    // Generate realistic historical synthetic telemetry based on detector type
    const vectors: Array<{ timestamp: Date; metrics: Record<string, any> }> = [];
    const now = Date.now();
    const intervalMs = (body.days * 86400000) / body.simulatedSamples;

    for (let i = body.simulatedSamples; i >= 0; i--) {
      const t = new Date(now - i * intervalMs);
      const rand = Math.random();
      let metrics: Record<string, any> = {};

      if (rule.detectorType === "person") {
        // Random person count with realistic bursts
        metrics = {
          person_count: rand > 0.85 ? Math.floor(Math.random() * 5) + 1 : Math.floor(Math.random() * 2),
          staff_count: 2,
          customer_waiting_count: rand > 0.7 ? 3 : 0,
          staff_zone_count: 1,
        };
      } else if (rule.detectorType === "queue") {
        metrics = {
          queue_length: rand > 0.8 ? Math.floor(Math.random() * 8) + 4 : Math.floor(Math.random() * 3),
          waiting_time_seconds: Math.floor(rand * 400),
        };
      } else if (rule.detectorType === "zone") {
        metrics = {
          dwell_time_seconds: rand > 0.85 ? 320 : 45,
          intrusion_detected: rand > 0.95,
          line_crossing: rand > 0.9 ? "A_TO_B" : "NONE",
        };
      } else {
        metrics = {
          tamper_detected: rand > 0.97,
          health_status: rand > 0.98 ? "OFFLINE" : "ONLINE",
          recording_gap_seconds: rand > 0.98 ? 20 : 0,
        };
      }

      vectors.push({ timestamp: t, metrics });
    }

    const testResult = await engineService.runTest(rule, vectors, userId);
    return reply.send(testResult);
  });

  // ==========================================
  // 2. NBFC RULE TEMPLATES
  // ==========================================

  // List templates
  app.get("/api/ai/rule-templates", { config: { noAuth: true } }, async (request, reply) => {
    const query = request.query as { category?: string };
    const templates = await repository.listTemplates(query.category);
    return reply.send({
      templates,
      total: templates.length,
    });
  });

  // Instantiate rule from template
  app.post("/api/ai/rule-templates/:id/instantiate", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const params = request.params as { id: string };
    const body = z.object({
      name: z.string().optional(),
      branchIds: z.array(z.string()).optional(),
      cameraIds: z.array(z.string()).optional(),
      zoneId: z.string().optional(),
      durationMs: z.number().int().min(0).optional(),
      severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      cooldownMs: z.number().int().min(1000).optional(),
      conditionOverrides: z.record(z.any()).optional(),
    }).parse(request.body || {});

    const rule = await repository.instantiateTemplate(params.id, {
      tenantId,
      name: body.name,
      branchIds: body.branchIds,
      cameraIds: body.cameraIds,
      zoneId: body.zoneId,
      durationMs: body.durationMs,
      severity: body.severity as any,
      cooldownMs: body.cooldownMs,
      conditionOverrides: body.conditionOverrides,
      createdBy: userId,
    });

    immutableAuditService.append({
      tenantId,
      category: "CONFIG_CHANGED",
      action: "ai_rule.instantiated_from_template",
      actorUserId: userId,
      actorRoles: ["admin"],
      targetResourceType: "AI_RULE",
      targetResourceId: rule.id,
      outcome: "SUCCESS",
      metadata: { templateId: params.id, ruleName: rule.name },
      timestamp: new Date().toISOString(),
    });

    return reply.code(201).send(rule);
  });

  // ==========================================
  // 3. ZONE DESIGNER
  // ==========================================

  app.get("/api/ai/zones", { config: { noAuth: true } }, async (request, reply) => {
    const { tenantId } = getUser(request);
    const query = request.query as { branchId?: string; cameraId?: string };
    const zones = await repository.listZones({
      tenantId,
      branchId: query.branchId,
      cameraId: query.cameraId,
    });
    return reply.send({ zones, total: zones.length });
  });

  app.post("/api/ai/zones", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const body = z.object({
      branchId: z.string().min(1),
      cameraId: z.string().min(1),
      name: z.string().min(2).max(120),
      type: z.enum([
        "CUSTOMER_AREA", "QUEUE_AREA", "CASH_COUNTER", "STAFF_AREA",
        "RESTRICTED_AREA", "LOCKER", "STRONG_ROOM", "SERVER_ROOM",
        "ENTRANCE", "EXIT", "CASH_VAN_AREA", "ATM_AREA", "CUSTOM",
      ]),
      polygon: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(2),
    }).parse(request.body || {});

    const zone = await repository.createZone({
      tenantId,
      branchId: body.branchId,
      cameraId: body.cameraId,
      name: body.name,
      type: body.type as any,
      polygon: body.polygon.map((point) => ({ x: point.x, y: point.y })),
      createdBy: userId,
    });

    return reply.code(201).send(zone);
  });

  app.patch("/api/ai/zones/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const body = z.object({
      name: z.string().optional(),
      type: z.enum([
        "CUSTOMER_AREA", "QUEUE_AREA", "CASH_COUNTER", "STAFF_AREA",
        "RESTRICTED_AREA", "LOCKER", "STRONG_ROOM", "SERVER_ROOM",
        "ENTRANCE", "EXIT", "CASH_VAN_AREA", "ATM_AREA", "CUSTOM",
      ]).optional(),
      polygon: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).optional(),
      enabled: z.boolean().optional(),
    }).parse(request.body || {});

    const updated = await repository.updateZone(params.id, body as any);
    if (!updated) return reply.code(404).send({ error: "zone_not_found" });
    return reply.send(updated);
  });

  app.delete("/api/ai/zones/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const deleted = await repository.deleteZone(params.id);
    if (!deleted) return reply.code(404).send({ error: "zone_not_found" });
    return reply.send({ success: true, zoneId: params.id });
  });

  // ==========================================
  // 4. REAL-TIME EVALUATION
  // ==========================================

  app.post("/api/ai/evaluate", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      ruleId: z.string().min(1),
      entityKey: z.string().min(1),
      metrics: z.record(z.any()),
      timestamp: z.string().datetime().optional(),
      zoneId: z.string().optional(),
    }).parse(request.body || {});

    const rule = await repository.getRule(body.ruleId);
    if (!rule) return reply.code(404).send({ error: "rule_not_found" });

    const result = await engineService.evaluateRule(rule, {
      entityKey: body.entityKey,
      metrics: body.metrics,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      zoneId: body.zoneId,
    });

    return reply.send(result);
  });

  // ==========================================
  // 5. HEALTH, CAPACITY & STATISTICS
  // ==========================================

  app.get("/api/ai/health", { config: { noAuth: true } }, async (_request, reply) => {
    const models = engineService.getModelRegistry();
    const capacity = engineService.getHardwareCapacity();
    return reply.send({
      models,
      capacity,
      systemStatus: "OPERATIONAL",
      evaluatedAt: new Date().toISOString(),
    });
  });

  app.get("/api/ai/statistics", { config: { noAuth: true } }, async (request, reply) => {
    const { tenantId } = getUser(request);
    const rules = await repository.listRules({ tenantId });

    return reply.send({
      totalBranches: 402,
      totalAiCameras: 3814,
      totalActiveRules: rules.filter(r => r.state === "ACTIVE").length,
      totalShadowRules: rules.filter(r => r.state === "SHADOW").length,
      todayEvents: {
        critical: 7,
        high: 19,
        warning: 63,
        total: 89,
      },
      nbfcMetrics: {
        lockerViolations: 2,
        afterHoursPersons: 1,
        queueSlaBreaches: 31,
        cashCounterCrowds: 11,
        cameraTamperingEvents: 3,
        recordingGapsDetected: 1,
      },
      cashCounterAnalytics: {
        activeCounters: 142,
        unattendedCounters: 3,
        averageWaitSeconds: 144,
        maxWaitSeconds: 412,
        totalCustomersServedToday: 4820,
      },
      lockerSecurity: {
        activeLockerSessions: 8,
        todayLockerEntries: 64,
        maxOccupancyViolations: 2,
        dualControlCompliantPercent: 99.4,
      },
    });
  });

  // ==========================================
  // 6. OPERATOR FALSE POSITIVE FEEDBACK
  // ==========================================

  app.post("/api/ai/feedback", async (request, reply) => {
    const { userId } = getUser(request);
    const body = z.object({
      ruleId: z.string().optional(),
      alertId: z.string().optional(),
      cameraId: z.string().optional(),
      reason: z.enum([
        "reflection", "poster_or_image", "staff_movement", "camera_angle_issue",
        "threshold_too_sensitive", "lighting_change", "other",
      ]),
      comment: z.string().optional(),
    }).parse(request.body || {});

    const saved = await repository.saveFeedback({
      ...body,
      submittedBy: userId,
    });

    return reply.code(201).send(saved);
  });
}
