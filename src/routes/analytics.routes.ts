import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  hasExtendedInfrastructure,
  type ControlPlaneStore,
} from "../control-plane-store.js";
import type {
  Action,
  AnalyticsAlert,
  AnalyticsAlertStatus,
  Camera,
} from "../domain/models.js";
import {
  AI_CAPABILITIES,
  AI_CAPABILITY_DOMAINS,
  isAiCapability,
} from "../analytics/capability-catalog.js";
import { enqueueAlertMatrix, type AlertNotificationDispatcher } from "../alerts/notification-dispatcher.js";
import { alertEvents } from "../alerts/event-stream.js";

const detectionTypeSchema = z.string().trim().min(1).max(120).refine(isAiCapability, {
  message: "Unknown AI capability",
});
const alertStatuses = [
  "new", "acknowledged", "investigating", "escalated", "resolved",
  "false_alarm", "suppressed",
] as const;
const severities = ["P1", "P2", "P3", "P4", "P5"] as const;
const cameraParams = z.object({ id: z.string().min(1) });
const ruleParams = z.object({
  id: z.string().min(1), ruleId: z.string().uuid(),
});
const alertParams = z.object({ alertId: z.string().uuid() });
const pointSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
});
const zoneSchema = z.object({
  id: z.string().uuid().default(() => randomUUID()),
  name: z.string().trim().min(2).max(120),
  shape: z.enum(["polygon", "line"]),
  points: z.array(pointSchema).min(2).max(100),
}).superRefine((zone, context) => {
  if (zone.shape === "polygon" && zone.points.length < 3) {
    context.addIssue({ code: "custom", message: "A polygon needs at least three points" });
  }
  if (zone.shape === "line" && zone.points.length !== 2) {
    context.addIssue({ code: "custom", message: "A line needs exactly two points" });
  }
});
const scheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().trim().min(1).max(100).default("Asia/Kolkata"),
});
const ruleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  detectionType: detectionTypeSchema,
  enabled: z.boolean().default(true),
  zone: zoneSchema.optional(),
  schedule: scheduleSchema.optional(),
  objectClasses: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  minConfidence: z.number().min(0).max(1).default(0.65),
  minDurationSeconds: z.number().min(0).max(86_400).default(0),
  direction: z.enum(["any", "a-to-b", "b-to-a", "enter", "exit"]).default("any"),
  severity: z.enum(severities).default("P3"),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(60),
  recipients: z.array(z.string().trim().min(1).max(320)).max(50).default([]),
  escalateAfterSeconds: z.number().int().min(30).max(86_400).optional(),
  recordingPolicy: z.enum(["none", "event-recording", "protect-window"])
    .default("event-recording"),
  preRollSeconds: z.number().int().min(0).max(120).default(30),
  postRollSeconds: z.number().int().min(30).max(600).default(120),
  modelId: z.string().uuid().optional(),
});
const objectSchema = z.object({
  label: z.string().trim().min(1).max(100),
  confidence: z.number().min(0).max(1),
  trackId: z.string().trim().min(1).max(200).optional(),
  boundingBox: z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    width: z.number().positive().max(1), height: z.number().positive().max(1),
  }).optional(),
});
const eventSchema = z.object({
  tenantId: z.string().min(1), cameraId: z.string().min(1),
  sourceEventId: z.string().trim().min(1).max(300),
  detectionType: detectionTypeSchema,
  occurredAt: z.string().datetime(), endedAt: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  durationSeconds: z.number().min(0).max(86_400).default(0),
  modelVersion: z.string().trim().min(1).max(160),
  objects: z.array(objectSchema).max(500).default([]),
  snapshotReference: z.string().trim().min(1).max(2_000).optional(),
  clipReference: z.string().trim().min(1).max(2_000).optional(),
  metadata: z.record(z.unknown()).default({}),
}).refine((event) => !event.endedAt || Date.parse(event.endedAt) >= Date.parse(event.occurredAt), {
  message: "endedAt must not be before occurredAt", path: ["endedAt"],
});
const alertListQuery = z.object({
  cameraId: z.string().min(1).optional(), branchId: z.string().min(1).optional(),
  status: z.enum(alertStatuses).optional(), severity: z.enum(severities).optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  options: {
    analyticsEngineSharedKey?: string;
    analyticsEngineUrl?: string;
    recordingEngineUrl?: string;
    recordingEngineSharedKey?: string;
    alertDispatcher?: AlertNotificationDispatcher;
  } = {},
) {
  app.get("/v1/analytics/capabilities", async () => ({
    service: "sentinel-analytics-engine",
    pricing: "self-hosted-no-api-fees",
    domains: AI_CAPABILITY_DOMAINS,
    summary: {
      domains: AI_CAPABILITY_DOMAINS.length,
      capabilities: AI_CAPABILITIES.length,
      core: AI_CAPABILITIES.filter((item) => item.stage === "core").length,
      derived: AI_CAPABILITIES.filter((item) => item.stage === "derived").length,
      openModel: AI_CAPABILITIES.filter((item) => item.stage === "open-model").length,
    },
  }));
  app.get("/v1/analytics/engine-health", async (_request, reply) => {
    if (!options.analyticsEngineUrl) {
      return reply.code(503).send({ status: "unconfigured", service: "sentinel-analytics-engine" });
    }
    try {
      const response = await fetch(new URL("/health", options.analyticsEngineUrl), {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return reply.code(503).send({ status: "unavailable", upstreamStatus: response.status });
      return await response.json();
    } catch (error) {
      return reply.code(503).send({
        status: "unavailable",
        message: error instanceof Error ? error.message : "Analytics engine unavailable",
      });
    }
  });
  app.post("/v1/analytics/assistant/query", async (request) => {
    const { query } = z.object({ query: z.string().trim().min(3).max(500) }).parse(request.body);
    const normalized = query.toLowerCase();
    const branches = await store.listAccessibleNodes(request.currentUser, "analytics:view", "branch");
    const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));

    if (/not recording|recording (is )?(off|stopped|failed)/.test(normalized)) {
      const cameras = (await Promise.all(branches.map((branch) =>
        store.listCamerasByBranch(request.currentUser, branch.id, "analytics:view")
      ))).flat();
      const stopped = [];
      for (const camera of cameras) {
        const job = await store.getRecordingJob(camera.id);
        if (!job || !job.enabled || !["recording", "starting"].includes(job.status)) {
          stopped.push({ cameraId: camera.id, camera: camera.name, branch: branchNames.get(camera.branchId), status: job?.status ?? "not-configured" });
        }
      }
      return { intent: "cameras-not-recording", answer: `${stopped.length} accessible cameras are not actively recording.`, data: stopped, actions: [{ label: "Open recording health", href: "/audit/recording-verification" }] };
    }

    if (/smoke|fire|alert/.test(normalized)) {
      const alerts = await store.listAnalyticsAlerts(request.currentUser.tenantId, { limit: 200 });
      const terms = ["smoke", "fire"].filter((term) => normalized.includes(term));
      const matches = alerts.filter((alert) => {
        const haystack = `${alert.title} ${alert.description ?? ""} ${alert.objectClasses.join(" ")}`.toLowerCase();
        return terms.length === 0 || terms.some((term) => haystack.includes(term));
      });
      return { intent: "alert-search", answer: `Found ${matches.length} matching alerts.`, data: matches.slice(0, 50), actions: [{ label: "Open alert queue", href: "/analytics" }] };
    }

    if (/branches?.*(incident)|incident.*branches?/.test(normalized)) {
      const threshold = Number(normalized.match(/(?:more than|over|>)\s*(\d+)/)?.[1] ?? 0);
      const incidents = await store.listIncidents(request.currentUser.tenantId, { limit: 1000 });
      const counts = new Map<string, number>();
      for (const incident of incidents) if (branchNames.has(incident.branchId)) counts.set(incident.branchId, (counts.get(incident.branchId) ?? 0) + 1);
      const data = [...counts].map(([branchId, count]) => ({ branchId, branch: branchNames.get(branchId), count })).filter((item) => item.count > threshold).sort((a, b) => b.count - a.count);
      return { intent: "branch-incident-comparison", answer: `${data.length} branches have more than ${threshold} incidents.`, data, actions: [{ label: "Open incidents", href: "/incidents" }] };
    }

    return {
      intent: "visual-search",
      answer: "I prepared this as an attribute-based video search across accessible cameras.",
      data: { query },
      actions: [{ label: "Search recorded video", href: `/video-search?q=${encodeURIComponent(query)}` }],
    };
  });
  app.get("/v1/cameras/:id/analytics/rules", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const camera = await authorizedCamera(request, reply, store, id, "analytics:view");
    if (!camera) return;
    return { data: await store.listAnalyticsRules(id) };
  });

  app.post("/v1/cameras/:id/analytics/rules", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const input = ruleSchema.parse(request.body);
    const camera = await authorizedCamera(request, reply, store, id, "analytics:configure");
    if (!camera) return;
    
    // Filter out undefined values to match AnalyticsRuleInput interface
    const ruleInput: any = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    );
    
    const rule = await store.createAnalyticsRule(
      request.currentUser.tenantId, id, request.currentUser.id, ruleInput,
    );
    await audit(request, store, "analytics.rule_created", camera.nodeId, {
      cameraId: id, ruleId: rule.id, detectionType: rule.detectionType,
    });
    return reply.code(201).send(rule);
  });

  app.patch("/v1/cameras/:id/analytics/rules/:ruleId", async (request, reply) => {
    const { id, ruleId } = ruleParams.parse(request.params);
    const input = ruleSchema.partial().parse(request.body);
    const camera = await authorizedCamera(request, reply, store, id, "analytics:configure");
    if (!camera) return;
    const rule = await store.updateAnalyticsRule(
      ruleId, request.currentUser.tenantId, id,
      Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    );
    if (!rule) return reply.code(404).send({ error: "analytics_rule_not_found" });
    await audit(request, store, "analytics.rule_updated", camera.nodeId, {
      cameraId: id, ruleId,
    });
    return rule;
  });

  app.delete("/v1/cameras/:id/analytics/rules/:ruleId", async (request, reply) => {
    const { id, ruleId } = ruleParams.parse(request.params);
    const camera = await authorizedCamera(request, reply, store, id, "analytics:configure");
    if (!camera) return;
    if (!await store.deleteAnalyticsRule(ruleId, request.currentUser.tenantId, id)) {
      return reply.code(404).send({ error: "analytics_rule_not_found" });
    }
    await audit(request, store, "analytics.rule_deleted", camera.nodeId, {
      cameraId: id, ruleId,
    });
    return reply.code(204).send();
  });

  app.get("/v1/analytics/alerts", async (request, reply) => {
    const query = alertListQuery.parse(request.query);
    if (query.cameraId && !await authorizedCamera(
      request, reply, store, query.cameraId, "analytics:view",
    )) return;
    if (query.branchId && !await authorizedNode(
      request, reply, store, query.branchId, "analytics:view",
    )) return;
    const candidates = await store.listAnalyticsAlerts(
      request.currentUser.tenantId,
      { ...query, limit: Math.min(1_000, query.limit * 5) },
    );
    const data: AnalyticsAlert[] = [];
    for (const alert of candidates) {
      const camera = await store.getCamera(alert.cameraId);
      if (camera && await hasCameraAccess(request, store, camera, "analytics:view")) {
        data.push(alert);
        if (data.length >= query.limit) break;
      }
    }
    return { data, summary: summarize(data) };
  });

  app.get("/v1/analytics/alerts/:alertId", async (request, reply) => {
    const { alertId } = alertParams.parse(request.params);
    const alert = await authorizedAlert(request, reply, store, alertId, "analytics:view");
    if (!alert) return;
    return alert;
  });

  app.post("/v1/analytics/alerts/:alertId/acknowledge", async (request, reply) => {
    const { alertId } = alertParams.parse(request.params);
    const { notes, expectedVersion } = z.object({
      notes: z.string().trim().min(2).max(2_000).optional(),
      expectedVersion: z.number().int().positive().optional(),
    }).parse(request.body ?? {});
    const alert = await authorizedAlert(
      request, reply, store, alertId, "alerts:acknowledge",
    );
    if (!alert) return;
    let updated;
    try {
      updated = await store.transitionAnalyticsAlert(
        alertId, request.currentUser.tenantId,
        { status: "acknowledged", actorUserId: request.currentUser.id, notes, expectedVersion },
      );
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "alert_conflict" });
    }
    await auditAlert(request, store, alert, "analytics.alert_acknowledged", { notes });
    if (updated) publishAlert(updated, "alert.updated");
    return updated;
  });

  app.post("/v1/analytics/alerts/:alertId/escalate", async (request, reply) => {
    const { alertId } = alertParams.parse(request.params);
    const body = z.object({
      notes: z.string().trim().min(2).max(2_000).optional(),
      recipients: z.array(z.string().trim().min(1).max(320)).max(50).default([]),
      expectedVersion: z.number().int().positive().optional(),
    }).parse(request.body ?? {});
    const alert = await authorizedAlert(request, reply, store, alertId, "alerts:escalate");
    if (!alert) return;
    let updated;
    try {
      updated = await store.transitionAnalyticsAlert(
        alertId, request.currentUser.tenantId,
        { status: "escalated", actorUserId: request.currentUser.id, ...body },
      );
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "alert_conflict" });
    }
    await auditAlert(request, store, alert, "analytics.alert_escalated", {
      recipientCount: body.recipients.length,
    });
    if (updated) publishAlert(updated, "alert.updated");
    return updated;
  });

  app.patch("/v1/analytics/alerts/:alertId", async (request, reply) => {
    const { alertId } = alertParams.parse(request.params);
    const body = z.object({
      status: z.enum(["investigating", "resolved", "false_alarm", "suppressed"]),
      notes: z.string().trim().min(2).max(2_000).optional(),
      falseAlarmReason: z.string().trim().min(2).max(1_000).optional(),
      expectedVersion: z.number().int().positive().optional(),
    }).superRefine((value, context) => {
      if (value.status === "false_alarm" && !value.falseAlarmReason) {
        context.addIssue({ code: "custom", path: ["falseAlarmReason"],
          message: "A false alarm reason is required" });
      }
    }).parse(request.body);
    const action: Action = body.status === "suppressed"
      ? "analytics:configure" : "alerts:acknowledge";
    const alert = await authorizedAlert(request, reply, store, alertId, action);
    if (!alert) return;
    
    // Filter undefined values and ensure required field
    const transitionInput: any = {
      status: body.status,
      actorUserId: request.currentUser.id,
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.falseAlarmReason !== undefined && { falseAlarmReason: body.falseAlarmReason }),
    };
    
    let updated;
    try {
      updated = await store.transitionAnalyticsAlert(
        alertId, request.currentUser.tenantId, transitionInput,
      );
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "alert_conflict" });
    }
    await auditAlert(request, store, alert, "analytics.alert_status_changed", {
      status: body.status, falseAlarmReason: body.falseAlarmReason,
    });
    if (updated) publishAlert(updated, "alert.updated");
    return updated;
  });

  app.post("/v1/analytics/alerts/:alertId/incidents", async (request, reply) => {
    const { alertId } = alertParams.parse(request.params);
    const body = z.object({
      title: z.string().trim().min(3).max(160).optional(),
      notes: z.string().trim().min(3).max(2_000).optional(),
    }).parse(request.body ?? {});
    const alert = await authorizedAlert(request, reply, store, alertId, "alerts:escalate");
    if (!alert) return;
    if (alert.incidentId) return reply.code(409).send({ error: "incident_already_linked" });
    const rule = (await store.listAnalyticsRules(alert.cameraId))
      .find((item) => item.id === alert.ruleId);
    const incident = await store.createLiveIncident({
      tenantId: request.currentUser.tenantId, cameraId: alert.cameraId,
      createdBy: request.currentUser.id, title: body.title ?? alert.title,
      notes: body.notes ?? alert.description, priority: alert.severity,
      occurredAt: alert.firstDetectedAt,
      preRollSeconds: rule?.preRollSeconds ?? 30,
      postRollSeconds: rule?.postRollSeconds ?? 120,
    });
    await store.linkAnalyticsAlertIncident(alertId, request.currentUser.tenantId, incident.id);
    await auditAlert(request, store, alert, "analytics.incident_created", {
      incidentId: incident.id, legalHoldId: incident.legalHoldId,
    });
    return reply.code(201).send(incident);
  });

  app.post("/internal/analytics/events", async (request, reply) => {
    if (!engineIdentity(request, reply, options.analyticsEngineSharedKey)) return;
    const input = eventSchema.parse(request.body);
    
    // Ensure all required fields are present
    const eventInput: any = {
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      sourceEventId: input.sourceEventId,
      detectionType: input.detectionType,
      occurredAt: input.occurredAt,
      confidence: input.confidence,
      durationSeconds: input.durationSeconds,
      modelVersion: input.modelVersion,
      objects: input.objects,
      ...(input.endedAt !== undefined && { endedAt: input.endedAt }),
      ...(input.snapshotReference !== undefined && { snapshotReference: input.snapshotReference }),
      ...(input.clipReference !== undefined && { clipReference: input.clipReference }),
      metadata: input.metadata,
    };
    
    const result = await store.processAnalyticsEvent(eventInput);
    for (let index = 0; index < result.alerts.length; index += 1) {
      const alert = result.alerts[index]!;
      const rule = result.rules.find((item) => item.id === alert.ruleId);
      if (!rule || alert.eventId !== result.event.id) continue;
      if (result.event.status === "accepted") {
        await enqueueAlertMatrix(store, alert, rule);
        publishAlert(alert, "alert.created");
      }
      if (rule.recordingPolicy === "event-recording") {
        await triggerRecording(app, options, alert.cameraId,
          input.detectionType === "motion" ? "motion" : "event");
      }
      if (rule.recordingPolicy === "protect-window") {
        try {
          const incident = await store.createLiveIncident({
            tenantId: input.tenantId, cameraId: input.cameraId,
            createdBy: rule.createdBy, title: alert.title,
            notes: alert.description, priority: alert.severity,
            occurredAt: alert.firstDetectedAt,
            preRollSeconds: rule.preRollSeconds, postRollSeconds: rule.postRollSeconds,
          });
          await store.linkAnalyticsAlertIncident(alert.id, input.tenantId, incident.id);
          alert.incidentId = incident.id;
        } catch (error) {
          app.log.error({ error, alertId: alert.id }, "Analytics evidence protection failed");
        }
      }
    }
    if (result.event.status === "accepted" && options.alertDispatcher) {
      void options.alertDispatcher.drainOnce().catch((error) =>
        app.log.error({ error }, "Alert notification dispatch failed"));
    }
    await store.writeAudit({
      tenantId: input.tenantId, actorUserId: null,
      action: "analytics.event_ingested", resourceNodeId: null,
      outcome: "success", details: {
        eventId: result.event.id, sourceEventId: input.sourceEventId,
        status: result.event.status, alertCount: result.alerts.length,
      },
    });
    return reply.code(202).send(result);
  });
}

function publishAlert(alert: AnalyticsAlert, type: "alert.created" | "alert.updated") {
  alertEvents.publish({
    id: randomUUID(), tenantId: alert.tenantId, type,
    occurredAt: new Date().toISOString(), alertId: alert.id, alert,
  });
}

async function authorizedAlert(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  alertId: string,
  action: Action,
) {
  const alert = await store.getAnalyticsAlert(alertId, request.currentUser.tenantId);
  if (!alert) {
    await reply.code(404).send({ error: "analytics_alert_not_found" });
    return undefined;
  }
  const camera = await authorizedCamera(request, reply, store, alert.cameraId, action);
  return camera ? alert : undefined;
}

async function authorizedCamera(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  cameraId: string,
  action: Action,
) {
  const camera = await store.getCamera(cameraId);
  if (!camera) {
    await reply.code(404).send({ error: "camera_not_found" });
    return undefined;
  }
  if (!await hasCameraAccess(request, store, camera, action)) {
    await reply.code(403).send({ error: "forbidden" });
    return undefined;
  }
  return camera;
}

async function hasCameraAccess(
  request: FastifyRequest,
  store: ControlPlaneStore,
  camera: Camera,
  action: Action,
) {
  const decision = hasExtendedInfrastructure(store)
    ? await store.checkCameraAccess(request.currentUser.id, camera.id, action)
    : await store.checkAccess(request.currentUser, action, camera.nodeId);
  return Boolean(decision?.allowed);
}

async function authorizedNode(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  nodeId: string,
  action: Action,
) {
  const decision = await store.checkAccess(request.currentUser, action, nodeId);
  if (!decision) {
    await reply.code(404).send({ error: "resource_not_found" });
    return false;
  }
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }
  return true;
}

function summarize(alerts: AnalyticsAlert[]) {
  const open = alerts.filter((alert) =>
    !["resolved", "false_alarm", "suppressed"].includes(alert.status)
  );
  return {
    total: alerts.length, open: open.length,
    new: open.filter((alert) => alert.status === "new").length,
    critical: open.filter((alert) => alert.severity === "P1").length,
    highPriority: open.filter((alert) =>
      alert.severity === "P1" || alert.severity === "P2"
    ).length,
  };
}

function engineIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
  expected: string | undefined,
) {
  if (!expected) {
    void reply.code(503).send({ error: "analytics_engine_not_configured" });
    return false;
  }
  const supplied = request.headers["x-analytics-engine-key"];
  if (typeof supplied !== "string" || !same(supplied, expected)) {
    void reply.code(401).send({ error: "invalid_analytics_engine_identity" });
    return false;
  }
  return true;
}

async function triggerRecording(
  app: FastifyInstance,
  options: {
    recordingEngineUrl?: string;
    recordingEngineSharedKey?: string;
  },
  cameraId: string,
  type: "motion" | "event",
) {
  if (!options.recordingEngineUrl || !options.recordingEngineSharedKey) return;
  try {
    const response = await fetch(new URL(
      `/internal/jobs/${encodeURIComponent(cameraId)}/trigger`,
      options.recordingEngineUrl,
    ), {
      method: "POST", signal: AbortSignal.timeout(5_000),
      headers: {
        "content-type": "application/json",
        "x-recording-engine-key": options.recordingEngineSharedKey,
      },
      body: JSON.stringify({ type }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`recording_engine_${response.status}`);
    }
  } catch (error) {
    app.log.error({ error, cameraId }, "Analytics recording trigger failed");
  }
}

async function auditAlert(
  request: FastifyRequest,
  store: ControlPlaneStore,
  alert: AnalyticsAlert,
  action: string,
  details: Record<string, unknown>,
) {
  const camera = await store.getCamera(alert.cameraId);
  await audit(request, store, action, camera?.nodeId ?? null, {
    alertId: alert.id, cameraId: alert.cameraId, ...details,
  });
}

async function audit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string | null,
  details: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
    action, resourceNodeId, outcome: "success", sourceIp: request.ip, details,
  });
}

function same(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
