import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { NbfcRuleRepository } from "../analytics/nbfc-rule-repository.js";
import type { NbfcRuleEngineService } from "../analytics/nbfc-rule-engine.service.js";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { immutableAuditService } from "../security/audit/immutable-audit.service.js";
import { OPENING_RULE_TEMPLATE_ID } from "../analytics/branch-opening-dual-control.service.js";

export interface NbfcAnalyticsRouteOptions {
  repository: NbfcRuleRepository;
  engineService: NbfcRuleEngineService;
  store?: Pick<ControlPlaneStore, "getNode">;
}

export function registerNbfcAnalyticsRoutes(
  app: FastifyInstance,
  options: NbfcAnalyticsRouteOptions
) {
  const { repository, engineService } = options;
  const timeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid 24-hour time (HH:mm)");
  const openingPolicySchema = z.object({
    openingStart: timeValue,
    openingEnd: timeValue,
    timezone: z.string().trim().min(1).max(100).default("Asia/Kolkata"),
    activeDays: z.array(z.number().int().min(0).max(6)).min(1).default([1, 2, 3, 4, 5, 6]),
    graceSeconds: z.number().int().min(0).max(900).default(30),
  }).superRefine((value, context) => {
    if (value.openingStart >= value.openingEnd) {
      context.addIssue({ code: "custom", path: ["openingEnd"], message: "Opening window end must be after its start" });
    }
  });

  function getUser(request: FastifyRequest) {
    repository.assertProductionStorage();
    const user = request.currentUser;
    if (!user?.tenantId || !user.id) throw new Error("authenticated_user_required");
    return { tenantId: user.tenantId, userId: user.id, role: user.role, user };
  }

  async function requireRuleAdministrator(request: FastifyRequest, reply: FastifyReply) {
    const role = request.currentUser?.role;
    const allowed = new Set([
      "super_admin", "company_admin", "hq_admin", "zone_manager", "region_manager",
      "area_manager", "branch_manager", "security_officer",
    ]);
    if (!role || !allowed.has(role)) {
      await reply.code(403).send({ error: "forbidden", message: "AI rule configuration requires an authorized security administrator" });
      return false;
    }
    return true;
  }

  async function tenantRule(id: string, tenantId: string, reply: FastifyReply) {
    const rule = await repository.getRule(id);
    if (!rule || rule.tenantId !== tenantId) {
      await reply.code(404).send({ error: "rule_not_found" });
      return undefined;
    }
    return rule;
  }

  async function tenantZone(id: string, tenantId: string, reply: FastifyReply) {
    const zone = await repository.getZone(id);
    if (!zone || zone.tenantId !== tenantId) {
      await reply.code(404).send({ error: "zone_not_found" });
      return undefined;
    }
    return zone;
  }

  async function tenantBranch(id: string, tenantId: string, reply: FastifyReply) {
    if (!options.store) return true;
    const branch = await options.store.getNode(id);
    if (!branch || branch.type !== "branch" || branch.tenantId !== tenantId) {
      await reply.code(404).send({ error: "branch_not_found" });
      return false;
    }
    return true;
  }

  function openingPolicyResponse(rule: Awaited<ReturnType<NbfcRuleRepository["getRule"]>>, branchId: string) {
    const schedule = rule?.schedule;
    return {
      branchId,
      ruleId: rule?.id,
      inherited: Boolean(rule && !rule.branchIds.includes(branchId)),
      enabled: Boolean(rule?.enabled && rule.state === "ACTIVE"),
      openingStart: schedule?.start || "08:30",
      openingEnd: schedule?.end || "09:30",
      timezone: schedule?.timezone || "Asia/Kolkata",
      activeDays: schedule?.days || [1, 2, 3, 4, 5, 6],
      requiredStaff: 2,
      graceSeconds: Math.round((rule?.durationMs ?? 30_000) / 1000),
      enforcementMode: "ALERT_EVIDENCE_AND_INCIDENT",
    };
  }

  // ==========================================
  // 1. RULES CRUD & LIFECYCLE
  // ==========================================

  // List rules
  app.get("/api/ai/rules", async (request, reply) => {
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

  // Branch-specific two-person opening policy. AI verifies and escalates; it
  // deliberately never operates a physical lock without an approved PACS flow.
  app.get("/api/ai/branch-opening-policy/:branchId", async (request, reply) => {
    const { tenantId } = getUser(request);
    const { branchId } = z.object({ branchId: z.string().min(1).max(200) }).parse(request.params);
    if (!await tenantBranch(branchId, tenantId, reply)) return;
    const rules = await repository.listRules({ tenantId, branchId, detectorType: "person" });
    const candidates = rules.filter((rule) => rule.templateId === OPENING_RULE_TEMPLATE_ID);
    const rule = candidates.find((candidate) => candidate.branchIds.includes(branchId))
      || candidates.find((candidate) => candidate.branchIds.length === 0)
      || null;
    return reply.send(openingPolicyResponse(rule, branchId));
  });

  app.put("/api/ai/branch-opening-policy/:branchId", async (request, reply) => {
    if (!await requireRuleAdministrator(request, reply)) return;
    const { tenantId, userId } = getUser(request);
    const { branchId } = z.object({ branchId: z.string().min(1).max(200) }).parse(request.params);
    if (!await tenantBranch(branchId, tenantId, reply)) return;
    const parsedPolicy = openingPolicySchema.safeParse(request.body || {});
    if (!parsedPolicy.success) {
      return reply.code(400).send({
        error: "invalid_opening_policy",
        message: parsedPolicy.error.issues[0]?.message || "Invalid branch opening policy",
        issues: parsedPolicy.error.issues,
      });
    }
    const policy = parsedPolicy.data;
    const rules = await repository.listRules({ tenantId, branchId, detectorType: "person" });
    let rule = rules.find((candidate) =>
      candidate.templateId === OPENING_RULE_TEMPLATE_ID && candidate.branchIds.includes(branchId)
    );

    if (!rule) {
      rule = await repository.instantiateTemplate(OPENING_RULE_TEMPLATE_ID, {
        tenantId,
        branchIds: [branchId],
        name: "Branch Opening Two-Person Enforcement",
        createdBy: userId,
      });
    }

    const updated = await repository.updateRule(rule.id, {
      name: "Branch Opening Two-Person Enforcement",
      description: "Requires two people to be visible together during the configured branch opening window and escalates non-compliance with evidence.",
      enabled: true,
      state: "ACTIVE",
      branchIds: [branchId],
      cameraIds: [],
      condition: { metric: "staff_count", operator: "LESS_THAN", value: 2 },
      durationMs: policy.graceSeconds * 1000,
      schedule: {
        type: "BRANCH_OPENING",
        start: policy.openingStart,
        end: policy.openingEnd,
        timezone: policy.timezone,
        days: policy.activeDays,
      },
      severity: "CRITICAL",
      cooldownMs: 600_000,
      actions: [
        "CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT",
        "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER",
      ],
      scopeType: "BRANCH",
    }, "Updated branch opening two-person policy", userId);

    if (!updated) return reply.code(404).send({ error: "opening_policy_not_found" });
    immutableAuditService.append({
      tenantId,
      category: "CONFIG_CHANGED",
      action: "branch_opening_policy.updated",
      actorUserId: userId,
      actorRoles: ["admin"],
      targetResourceType: "BRANCH",
      targetResourceId: branchId,
      outcome: "SUCCESS",
      metadata: { openingStart: policy.openingStart, openingEnd: policy.openingEnd, requiredStaff: 2 },
      timestamp: new Date().toISOString(),
    });
    return reply.send(openingPolicyResponse(updated, branchId));
  });

  // Create rule
  app.post("/api/ai/rules", async (request, reply) => {
    if (!await requireRuleAdministrator(request, reply)) return;
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

    if (body.state === "ACTIVE" && !(body.branchIds?.length || body.cameraIds?.length)) {
      return reply.code(400).send({
        error: "scoped_activation_required",
        message: "Active rules must target at least one branch or camera; create global policies in shadow mode first.",
      });
    }
    if (body.zoneId && !await tenantZone(body.zoneId, tenantId, reply)) return;

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
  app.post("/api/ai/rules/apply-all-templates", async (request, reply) => {
    if (!await requireRuleAdministrator(request, reply)) return;
    const { tenantId, userId } = getUser(request);
    const scope = z.object({
      branchId: z.string().min(1).optional(),
      cameraId: z.string().min(1).optional(),
    }).refine((value) => Boolean(value.branchId || value.cameraId), {
      message: "Select a branch or camera before applying templates",
    }).parse(request.body || {});
    const templates = await repository.listTemplates();
    const existingRules = await repository.listRules({ tenantId });
    const rulesAtScope = existingRules.filter((rule) =>
      scope.cameraId
        ? rule.cameraIds.includes(scope.cameraId)
        : Boolean(scope.branchId && rule.branchIds.includes(scope.branchId))
    );
    const existingTemplateIds = new Set(rulesAtScope.map((r) => r.templateId).filter(Boolean));

    const newlyInstantiated: any[] = [];
    for (const tmpl of templates) {
      if (!existingTemplateIds.has(tmpl.id)) {
        try {
          const rule = await repository.instantiateTemplate(tmpl.id, {
            tenantId,
            name: tmpl.name,
            branchIds: scope.branchId ? [scope.branchId] : [],
            cameraIds: scope.cameraId ? [scope.cameraId] : [],
            createdBy: userId,
          });
          newlyInstantiated.push(rule);
        } catch (e) {
          console.warn(`Failed to instantiate template ${tmpl.id}:`, e);
        }
      }
    }

    // Only alter rules already assigned to this target. A deployment for one
    // branch must never reactivate another branch's rules.
    for (const rule of rulesAtScope) {
      if (!rule.enabled || rule.state !== "ACTIVE") {
        await repository.updateRule(rule.id, { enabled: true, state: "ACTIVE" }, "Batch enabled for selected scope", userId);
      }
    }

    immutableAuditService.append({
      tenantId,
      category: "CONFIG_CHANGED",
      action: "ai_rules.templates_applied_to_scope",
      actorUserId: userId,
      actorRoles: ["admin"],
      targetResourceType: "AI_RULE",
      targetResourceId: scope.cameraId ?? scope.branchId!,
      outcome: "SUCCESS",
      metadata: { totalTemplates: templates.length, newlyInstantiated: newlyInstantiated.length, scope },
      timestamp: new Date().toISOString(),
    });

    const allRules = await repository.listRules({ tenantId });

    return reply.send({
      success: true,
      message: `All ${templates.length} NBFC rules enabled for the selected scope`,
      totalTemplates: templates.length,
      newlyInstantiated: newlyInstantiated.length,
      totalActiveRules: allRules.filter((r) => rulesAtScope.some((scoped) => scoped.id === r.id) || newlyInstantiated.some((created) => created.id === r.id)).filter((r) => r.state === "ACTIVE").length,
    });
  });

  // Get rule details
  app.get("/api/ai/rules/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const { tenantId } = getUser(request);
    const rule = await tenantRule(params.id, tenantId, reply);
    if (!rule) return;

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
    if (!await requireRuleAdministrator(request, reply)) return;
    const existing = await tenantRule(params.id, tenantId, reply);
    if (!existing) return;
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

    const nextBranchIds = body.branchIds ?? existing.branchIds;
    const nextCameraIds = body.cameraIds ?? existing.cameraIds;
    const nextState = body.state ?? existing.state;
    if (nextState === "ACTIVE" && !(nextBranchIds.length || nextCameraIds.length)) {
      return reply.code(400).send({ error: "scoped_activation_required", message: "Active rules must target at least one branch or camera" });
    }
    if (body.zoneId && !await tenantZone(body.zoneId, tenantId, reply)) return;

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
    if (!await requireRuleAdministrator(request, reply)) return;
    if (!await tenantRule(params.id, tenantId, reply)) return;

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
    const { tenantId, userId } = getUser(request);
    const params = request.params as { id: string };
    if (!await requireRuleAdministrator(request, reply)) return;
    if (!await tenantRule(params.id, tenantId, reply)) return;
    const updated = await repository.updateRule(params.id, { state: "ACTIVE", enabled: true }, "Enabled rule", userId);
    if (!updated) return reply.code(404).send({ error: "rule_not_found" });
    return reply.send({ success: true, state: "ACTIVE" });
  });

  // Disable rule
  app.post("/api/ai/rules/:id/disable", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const params = request.params as { id: string };
    if (!await requireRuleAdministrator(request, reply)) return;
    if (!await tenantRule(params.id, tenantId, reply)) return;
    const updated = await repository.updateRule(params.id, { state: "INACTIVE", enabled: false }, "Disabled rule", userId);
    if (!updated) return reply.code(404).send({ error: "rule_not_found" });
    return reply.send({ success: true, state: "INACTIVE" });
  });

  // Toggle shadow mode
  app.post("/api/ai/rules/:id/shadow", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
    const params = request.params as { id: string };
    if (!await requireRuleAdministrator(request, reply)) return;
    const rule = await tenantRule(params.id, tenantId, reply);
    if (!rule) return;

    const nextState = rule.state === "SHADOW" ? "ACTIVE" : "SHADOW";
    const updated = await repository.updateRule(params.id, { state: nextState }, `Toggled state to ${nextState}`, userId);
    return reply.send({ success: true, state: updated?.state });
  });

  // Test rule simulation
  app.post("/api/ai/rules/:id/test", async (request, reply) => {
    const params = request.params as { id: string };
    const { tenantId } = getUser(request);
    const rule = await tenantRule(params.id, tenantId, reply);
    if (!rule) return;

    const body = z.object({
      days: z.number().int().min(1).max(30).default(7),
    }).parse(request.body || {});

    const testResult = await repository.simulateRuleOnFootage(params.id, body.days);
    return reply.send(testResult);
  });

  // ==========================================
  // 2. NBFC RULE TEMPLATES
  // ==========================================

  // List templates
  app.get("/api/ai/rule-templates", async (request, reply) => {
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
    if (!await requireRuleAdministrator(request, reply)) return;
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

    if (!(body.branchIds?.length || body.cameraIds?.length)) {
      return reply.code(400).send({ error: "scoped_activation_required", message: "Template rules must target at least one branch or camera" });
    }
    if (body.zoneId && !await tenantZone(body.zoneId, tenantId, reply)) return;

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

  app.get("/api/ai/zones", async (request, reply) => {
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
    if (!await requireRuleAdministrator(request, reply)) return;
    const body = z.object({
      branchId: z.string().min(1),
      cameraId: z.string().min(1),
      name: z.string().min(2).max(120),
      type: z.enum([
        "CUSTOMER_AREA", "QUEUE_AREA", "CASH_COUNTER", "STAFF_AREA",
        "RESTRICTED_AREA", "LOCKER", "STRONG_ROOM", "SERVER_ROOM",
        "ENTRANCE", "EXIT", "CASH_VAN_AREA", "ATM_AREA", "CUSTOM",
      ]),
      polygon: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(3),
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
    const { tenantId } = getUser(request);
    if (!await requireRuleAdministrator(request, reply)) return;
    if (!await tenantZone(params.id, tenantId, reply)) return;
    const body = z.object({
      name: z.string().optional(),
      type: z.enum([
        "CUSTOMER_AREA", "QUEUE_AREA", "CASH_COUNTER", "STAFF_AREA",
        "RESTRICTED_AREA", "LOCKER", "STRONG_ROOM", "SERVER_ROOM",
        "ENTRANCE", "EXIT", "CASH_VAN_AREA", "ATM_AREA", "CUSTOM",
      ]).optional(),
      polygon: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(3).optional(),
      enabled: z.boolean().optional(),
    }).parse(request.body || {});

    const updated = await repository.updateZone(params.id, body as any);
    if (!updated) return reply.code(404).send({ error: "zone_not_found" });
    return reply.send(updated);
  });

  app.delete("/api/ai/zones/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const { tenantId } = getUser(request);
    if (!await requireRuleAdministrator(request, reply)) return;
    if (!await tenantZone(params.id, tenantId, reply)) return;
    const deleted = await repository.deleteZone(params.id);
    if (!deleted) return reply.code(404).send({ error: "zone_not_found" });
    return reply.send({ success: true, zoneId: params.id });
  });

  // ==========================================
  // 4. REAL-TIME EVALUATION
  // ==========================================

  app.post("/api/ai/evaluate", async (request, reply) => {
    const body = z.object({
      ruleId: z.string().min(1),
      entityKey: z.string().min(1),
      metrics: z.record(z.any()),
      timestamp: z.string().datetime().optional(),
      zoneId: z.string().optional(),
    }).parse(request.body || {});

    const { tenantId } = getUser(request);
    if (!await requireRuleAdministrator(request, reply)) return;
    const rule = await tenantRule(body.ruleId, tenantId, reply);
    if (!rule) return;

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

  app.get("/api/ai/health", async (request, reply) => {
    const { tenantId } = getUser(request);
    const stats = await repository.getLivePlatformStatistics(tenantId);
    // Model health must come from an enrolled edge agent. Do not present a
    // static capability catalogue as real runtime telemetry.
    const models: unknown[] = [];
    const capacity = engineService.getHardwareCapacity(stats.totalAiCameras);
    return reply.send({
      models,
      capacity,
      systemStatus: "OPERATIONAL",
      modelTelemetryAvailable: false,
      evaluatedAt: new Date().toISOString(),
    });
  });

  app.get("/api/ai/statistics", async (request, reply) => {
    const { tenantId } = getUser(request);
    const stats = await repository.getLivePlatformStatistics(tenantId);
    return reply.send(stats);
  });

  app.get("/api/ai/cameras", async (request, reply) => {
    const { tenantId } = getUser(request);
    const cameras = await repository.listAllCamerasWithBranches(tenantId);
    return reply.send({ cameras, total: cameras.length });
  });

  // ==========================================
  // 6. OPERATOR FALSE POSITIVE FEEDBACK
  // ==========================================

  app.post("/api/ai/feedback", async (request, reply) => {
    const { tenantId, userId } = getUser(request);
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

    if (body.ruleId && !await tenantRule(body.ruleId, tenantId, reply)) return;

    const saved = await repository.saveFeedback({
      ...body,
      submittedBy: userId,
    });

    return reply.code(201).send(saved);
  });

  // ==========================================
  // 7. USER PREFERENCES (Cross-device alert audio, etc.)
  // ==========================================

  app.get("/api/ai/preferences", async (request, reply) => {
    const { userId } = getUser(request);
    const preferences = await repository.getUserPreferences(userId);
    return reply.send({ success: true, preferences });
  });

  app.post("/api/ai/preferences", async (request, reply) => {
    const { userId } = getUser(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const updatePayload =
      body.preferences && typeof body.preferences === "object"
        ? (body.preferences as Record<string, unknown>)
        : body;

    const safePreferences: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updatePayload)) {
      if (k !== "menuAccess") {
        safePreferences[k] = v;
      }
    }

    const updated = await repository.updateUserPreferences(userId, safePreferences);
    return reply.send({ success: true, preferences: updated });
  });
}
