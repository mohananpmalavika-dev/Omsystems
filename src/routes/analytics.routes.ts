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
  AnalyticsEvent,
  AnalyticsAlertStatus,
  Camera,
  ResourceNode,
} from "../domain/models.js";
import {
  AI_CAPABILITIES,
  AI_CAPABILITY_DOMAINS,
  isAiCapability,
} from "../analytics/capability-catalog.js";
import { enqueueAlertMatrix, type AlertNotificationDispatcher } from "../alerts/notification-dispatcher.js";
import { alertEvents } from "../alerts/event-stream.js";
import {
  managedAlertEvidenceReferences,
  type AlertEvidenceClient,
} from "../alerts/evidence-capture.js";
import { defaultSeverityForDetection } from "../analytics/severity-policy.js";
import { digitalTwinEvents } from "../digital-twin/event-stream.js";
import {
  CAMERA_AI_RULE_BUNDLE,
  CAMERA_AI_SETUP_REQUIRED,
  ensureCameraAiBundle,
} from "../analytics/camera-ai-bundle.js";

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
  severity: z.enum(severities).optional(),
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
    alertEvidenceClient?: AlertEvidenceClient;
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
    cameraDeployment: {
      automatic: CAMERA_AI_RULE_BUNDLE.map((rule) => rule.detectionType),
      setupRequired: [...CAMERA_AI_SETUP_REQUIRED],
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

  app.post("/v1/branches/:branchId/analytics/enable-all-cameras", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.params);
    if (!await authorizedNode(request, reply, store, branchId, "analytics:configure")) return;
    const branch: ResourceNode | undefined = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    const cameras = await store.listCamerasByBranch(
      request.currentUser,
      branchId,
      "analytics:configure",
    );
    const results = [];
    for (const camera of cameras) {
      results.push(await ensureCameraAiBundle(
        store,
        request.currentUser.tenantId,
        camera.id,
        request.currentUser.id,
      ));
    }
    const summary = results.reduce((total, result) => ({
      created: total.created + result.created,
      enabled: total.enabled + result.enabled,
      unchanged: total.unchanged + result.unchanged,
    }), { created: 0, enabled: 0, unchanged: 0 });
    await audit(request, store, "analytics.camera_bundle_enabled", branch.id, {
      cameraCount: cameras.length,
      capabilityCount: CAMERA_AI_RULE_BUNDLE.length,
      ...summary,
    });
    return reply.send({
      branchId,
      cameraCount: cameras.length,
      capabilityCount: CAMERA_AI_RULE_BUNDLE.length,
      ...summary,
      setupRequired: [...CAMERA_AI_SETUP_REQUIRED],
      results,
    });
  });

  app.post("/v1/cameras/:id/analytics/rules", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const parsedInput = ruleSchema.parse(request.body);
    const input = { ...parsedInput, severity: parsedInput.severity ?? defaultSeverityForDetection(parsedInput.detectionType) };
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
    
    // Batch fetch all cameras to avoid N+1 queries
    const cameraIds = [...new Set(candidates.map((alert) => alert.cameraId))];
    const cameras = await store.listCamerasByIds(cameraIds);
    const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));

    // Build access map by checking permissions for each camera
    const accessMap = new Map<string, boolean>();
    for (const camera of cameras) {
      const hasAccess = await hasCameraAccess(request, store, camera, "analytics:view");
      accessMap.set(camera.id, hasAccess);
    }

    const data: AnalyticsAlert[] = [];
    for (const alert of candidates) {
      const camera = camerasById.get(alert.cameraId);
      if (camera && accessMap.get(alert.cameraId)) {
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
        if (options.alertEvidenceClient && (alert.severity === "P1" || alert.severity === "P2") &&
            (!alert.snapshotReference || !alert.clipReference)) {
          try {
            await options.alertEvidenceClient.capture({
              alertId: alert.id,
              cameraId: alert.cameraId,
              occurredAt: alert.firstDetectedAt,
              clipSeconds: Math.min(20, Math.max(5, rule.postRollSeconds)),
            });
            const managed = managedAlertEvidenceReferences(alert.id);
            const updated = await store.updateAnalyticsAlertEvidence(alert.id, alert.tenantId, {
              ...(!alert.snapshotReference ? { snapshotReference: managed.snapshotReference } : {}),
              ...(!alert.clipReference ? { clipReference: managed.clipReference } : {}),
            });
            if (updated) Object.assign(alert, updated);
          } catch (error) {
            app.log.error({ error, alertId: alert.id }, "Automatic alert evidence capture failed to start");
          }
        }
        await enqueueAlertMatrix(store, alert, rule);
        publishAlert(alert, "alert.created");
        const camera = await store.getCamera(alert.cameraId);
        if (camera) {
          digitalTwinEvents.publish({
            id: randomUUID(), tenantId: input.tenantId, branchId: camera.branchId,
            type: "analytics.alert.created", occurredAt: alert.lastDetectedAt,
            alertId: alert.id, severity: alert.severity === "P1" ? "critical" : "warning",
          });
        }
      }
      if (rule.recordingPolicy === "event-recording") {
        await triggerRecording(app, options, alert.cameraId,
          input.detectionType === "motion" ? "motion" : "event");
      }
      if (rule.recordingPolicy === "protect-window" && rule.createdBy) {
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

  const branchAnalyticsParams = z.object({
    branchId: z.string().trim().min(1).max(200),
  });
  const branchAnalyticsQuery = z.object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  }).superRefine((value, context) => {
    if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
      context.addIssue({ code: "custom", path: ["from"], message: "from must not be after to" });
    }
  });

  const loadBranchAnalytics = async (
    request: FastifyRequest,
    reply: FastifyReply,
    action: Extract<Action, "analytics:view" | "analytics:export">,
  ) => {
    const { branchId } = branchAnalyticsParams.parse(request.params);
    const requestedRange = branchAnalyticsQuery.parse(request.query);
    const now = new Date();
    const query = {
      from: requestedRange.from ?? new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString(),
      to: requestedRange.to ?? now.toISOString(),
    };
    const branches = await store.listAccessibleNodes(request.currentUser, action, "branch");
    const branch = branches.find((candidate) => candidate.id === branchId);
    if (!branch) {
      await reply.code(404).send({ error: "branch_not_found" });
      return undefined;
    }

    const cameras = await store.listCamerasByBranch(request.currentUser, branch.id, action);
    const rules = cameras.length > 0
      ? await store.listAnalyticsRulesByCameraIds(cameras.map((camera) => camera.id))
      : [];
    const rowLimit = 10_000;
    const loadedAlerts = await store.listAnalyticsAlerts(request.currentUser.tenantId, {
      branchId: branch.id,
      from: query.from,
      to: query.to,
      limit: rowLimit + 1,
    });
    const loadedEvents = cameras.length > 0
      ? await store.listAnalyticsEvents(request.currentUser.tenantId, {
        cameraIds: cameras.map((camera) => camera.id),
        from: query.from,
        to: query.to,
        limit: rowLimit + 1,
      })
      : [];
    const truncated = loadedAlerts.length > rowLimit || loadedEvents.length > rowLimit;
    const alerts = loadedAlerts.slice(0, rowLimit);
    const events = loadedEvents.slice(0, rowLimit);
    return { branch, cameras, rules, alerts, events, query, truncated };
  };

  app.get("/v1/branches/:branchId/analytics/summary", async (request, reply) => {
    const report = await loadBranchAnalytics(request, reply, "analytics:view");
    if (!report) return;

    const eventsByType: Record<string, number> = {};
    for (const event of report.events) {
      eventsByType[event.detectionType] = (eventsByType[event.detectionType] ?? 0) + 1;
    }
    const footfallTypes = new Set(["line-crossing", "footfall", "customer-counting", "person-counting"]);
    const hasFootfallRule = report.rules.some((rule) => footfallTypes.has(rule.detectionType));
    const totalFootfall = hasFootfallRule
      ? aggregateFootfall(
        report.events.filter((event) => footfallTypes.has(event.detectionType)),
        "day",
      ).reduce((total, bucket) => total + bucket.total_crossings, 0)
      : null;
    const totalEvents = Object.values(eventsByType).reduce((total, count) => total + count, 0);
    const dwellBuckets = aggregateDwell(
      report.events.filter((event) => event.detectionType === "loitering" || event.detectionType === "dwell-time"),
      "day",
    );
    const dwellSamples = dwellBuckets.reduce((total, bucket) => total + bucket.sample_count, 0);
    const averageDwellTime = dwellSamples > 0
      ? dwellBuckets.reduce(
        (total, bucket) => total + bucket.average_seconds * bucket.sample_count,
        0,
      ) / dwellSamples
      : null;

    return reply.send({
      period: {
        startDate: report.query.from,
        endDate: report.query.to,
      },
      totalAlerts: report.alerts.length,
      criticalAlerts: report.alerts.filter((alert) => alert.severity === "P1").length,
      resolvedAlerts: report.alerts.filter((alert) => alert.status === "resolved").length,
      totalFootfall,
      averageDwellTime,
      activeRules: report.rules.filter((rule) => rule.enabled).length,
      totalEvents,
      eventsByType,
      truncated: report.truncated,
      branch: {
        id: report.branch.id,
        name: report.branch.name,
        eventCount: totalEvents,
      },
    });
  });

  app.get("/v1/branches/:branchId/analytics/export/csv", async (request, reply) => {
    const report = await loadBranchAnalytics(request, reply, "analytics:export");
    if (!report) return;

    const camerasById = new Map(report.cameras.map((camera) => [camera.id, camera]));
    const rulesById = new Map(report.rules.map((rule) => [rule.id, rule]));
    const rows = report.alerts.map((alert) => [
      alert.id,
      alert.cameraId,
      camerasById.get(alert.cameraId)?.name ?? "",
      rulesById.get(alert.ruleId)?.detectionType ?? "unknown",
      alert.severity,
      alert.status,
      alert.confidence,
      alert.occurrenceCount,
      alert.firstDetectedAt,
      alert.lastDetectedAt,
      alert.title,
    ]);
    const csv = [
      [
        "alert_id", "camera_id", "camera_name", "detection_type", "severity", "status",
        "confidence", "occurrences", "first_detected_at", "last_detected_at", "title",
      ],
      ...rows,
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const safeBranchId = report.branch.id.replace(/[^a-zA-Z0-9_-]/g, "-");

    await audit(request, store, "analytics.summary_exported", report.branch.id, {
      format: "csv", rowCount: report.alerts.length, truncated: report.truncated,
      from: report.query.from ?? null, to: report.query.to ?? null,
    });
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="analytics-${safeBranchId}.csv"`)
      .send(`\uFEFF${csv}\r\n`);
  });

  // Camera metrics are derived from the normalized, persisted event stream.
  // The analytics engine's retail endpoints expose process-wide snapshots and
  // cannot safely be presented as camera-specific historical measurements.
  const analyticsQuery = z.object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    interval: z.enum(["hour", "day"]).default("hour"),
  }).superRefine((value, context) => {
    if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
      context.addIssue({ code: "custom", path: ["from"], message: "from must not be after to" });
    }
  });

  const metricEventLimit = 10_001;
  const metricRange = (query: z.infer<typeof analyticsQuery>) => ({
    from: query.from ?? new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
    to: query.to ?? new Date().toISOString(),
  });

  app.get("/v1/cameras/:id/analytics/footfall", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = analyticsQuery.parse(request.query);
    const camera = await authorizedCamera(request, reply, store, id, "analytics:view");
    if (!camera) return;
    const range = metricRange(query);
    const events = await store.listAnalyticsEvents(request.currentUser.tenantId, {
      cameraId: id, ...range,
      detectionTypes: ["line-crossing", "footfall", "customer-counting", "person-counting"],
      limit: metricEventLimit,
    });
    return reply.send(metricSeriesResponse(aggregateFootfall(events.slice(0, 10_000), query.interval), events));
  });

  app.get("/v1/cameras/:id/analytics/dwell-time", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = analyticsQuery.parse(request.query);
    const camera = await authorizedCamera(request, reply, store, id, "analytics:view");
    if (!camera) return;
    const range = metricRange(query);
    const events = await store.listAnalyticsEvents(request.currentUser.tenantId, {
      cameraId: id, ...range,
      detectionTypes: ["loitering", "dwell-time"],
      limit: metricEventLimit,
    });
    return reply.send(metricSeriesResponse(aggregateDwell(events.slice(0, 10_000), query.interval), events));
  });

  app.get("/v1/cameras/:id/analytics/queue", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = analyticsQuery.parse(request.query);
    const camera = await authorizedCamera(request, reply, store, id, "analytics:view");
    if (!camera) return;
    const range = metricRange(query);
    const events = await store.listAnalyticsEvents(request.currentUser.tenantId, {
      cameraId: id, ...range,
      detectionTypes: ["queue", "queue-length"],
      limit: metricEventLimit,
    });
    return reply.send(metricSeriesResponse(aggregateQueue(events.slice(0, 10_000), query.interval), events));
  });
}

function metricSeriesResponse<T>(data: T[], loadedEvents: AnalyticsEvent[]) {
  return {
    data,
    basis: "persisted_analytics_events",
    truncated: loadedEvents.length > 10_000,
  };
}

function eventBucket(timestamp: string, interval: "hour" | "day") {
  const date = new Date(timestamp);
  date.setUTCMinutes(0, 0, 0);
  if (interval === "day") date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function finiteMetadataNumber(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function aggregateFootfall(events: AnalyticsEvent[], interval: "hour" | "day") {
  const buckets = new Map<string, { bucket_at: string; entries: number; exits: number; total_crossings: number }>();
  for (const event of events) {
    const bucketAt = eventBucket(event.occurredAt, interval);
    const bucket = buckets.get(bucketAt) ?? { bucket_at: bucketAt, entries: 0, exits: 0, total_crossings: 0 };
    const direction = typeof event.metadata.direction === "string" ? event.metadata.direction.toLowerCase() : "unknown";
    const entries = finiteMetadataNumber(event.metadata, "entries", "entryCount") ??
      (["entry", "enter", "a-to-b"].includes(direction) ? 1 : 0);
    const exits = finiteMetadataNumber(event.metadata, "exits", "exitCount") ??
      (["exit", "leave", "b-to-a"].includes(direction) ? 1 : 0);
    bucket.entries += Math.max(0, entries);
    bucket.exits += Math.max(0, exits);
    bucket.total_crossings += Math.max(0,
      finiteMetadataNumber(event.metadata, "totalCrossings", "crossings") ?? Math.max(1, entries + exits));
    buckets.set(bucketAt, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.bucket_at.localeCompare(right.bucket_at));
}

function aggregateDwell(events: AnalyticsEvent[], interval: "hour" | "day") {
  const buckets = new Map<string, { bucket_at: string; total: number; maximum: number; samples: number }>();
  for (const event of events) {
    const seconds = finiteMetadataNumber(event.metadata, "dwellTimeSeconds", "dwellSeconds", "durationSeconds")
      ?? event.durationSeconds;
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    const bucketAt = eventBucket(event.occurredAt, interval);
    const bucket = buckets.get(bucketAt) ?? { bucket_at: bucketAt, total: 0, maximum: 0, samples: 0 };
    bucket.total += seconds;
    bucket.maximum = Math.max(bucket.maximum, seconds);
    bucket.samples += 1;
    buckets.set(bucketAt, bucket);
  }
  return [...buckets.values()]
    .sort((left, right) => left.bucket_at.localeCompare(right.bucket_at))
    .map((bucket) => ({
      bucket_at: bucket.bucket_at,
      average_seconds: bucket.samples ? bucket.total / bucket.samples : 0,
      maximum_seconds: bucket.maximum,
      sample_count: bucket.samples,
    }));
}

function aggregateQueue(events: AnalyticsEvent[], interval: "hour" | "day") {
  const buckets = new Map<string, { bucket_at: string; total: number; maximum: number; samples: number }>();
  for (const event of events) {
    const queueRows = Array.isArray(event.metadata.queues) ? event.metadata.queues : [];
    const lengths = queueRows.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const value = finiteMetadataNumber(row, "length", "queueLength", "currentLength");
      return value === undefined ? [] : [value];
    });
    if (lengths.length === 0 && event.objects.length > 0) lengths.push(event.objects.length);
    if (lengths.length === 0) continue;
    const bucketAt = eventBucket(event.occurredAt, interval);
    const bucket = buckets.get(bucketAt) ?? { bucket_at: bucketAt, total: 0, maximum: 0, samples: 0 };
    for (const length of lengths) {
      bucket.total += Math.max(0, length);
      bucket.maximum = Math.max(bucket.maximum, length);
      bucket.samples += 1;
    }
    buckets.set(bucketAt, bucket);
  }
  return [...buckets.values()]
    .sort((left, right) => left.bucket_at.localeCompare(right.bucket_at))
    .map((bucket) => ({
      bucket_at: bucket.bucket_at,
      average_count: bucket.samples ? bucket.total / bucket.samples : 0,
      maximum_count: bucket.maximum,
    }));
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

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
