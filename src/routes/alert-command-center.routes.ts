import { randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AnalyticsRule, AlertNotification } from "../domain/models.js";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AlertNotificationDispatcher } from "../alerts/notification-dispatcher.js";
import { NOTIFICATION_MATRIX } from "../alerts/notification-dispatcher.js";
import { alertEvents } from "../alerts/event-stream.js";
import { VoiceCallbackTokens, twiml, voiceAlertMessage } from "../alerts/voice-call.js";
import {
  isManagedAlertEvidenceReference,
  type AlertEvidenceClient,
  type AlertEvidenceCaptureStatus,
  type AlertEvidenceKind,
} from "../alerts/evidence-capture.js";

const alertIdParams = z.object({ alertId: z.string().uuid() });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const recipients = z.object({
  sms: z.array(z.string().trim().min(3).max(100)).max(100).optional(),
  email: z.array(z.string().email()).max(100).optional(),
  voice: z.array(z.string().trim().min(3).max(100)).max(100).optional(),
}).default({});
const quietHoursSchema = z.object({
  enabled: z.boolean().default(true),
  start: hhmm,
  end: hhmm,
  timezone: z.string().trim().min(1).max(100),
  bypassSeverities: z.array(z.enum(["P1", "P2", "P3", "P4", "P5"])).default(["P1"]),
});
const notificationChannelSchema = z.enum(["dashboard", "email", "sms", "voice", "push", "webhook"]);
const policySchema = z.object({
  recipientGroups: recipients,
  onCallSchedules: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: hhmm, end: hhmm,
    timezone: z.string().trim().min(1).max(100),
    recipients,
  })).max(50).default([]),
  quietHours: quietHoursSchema.optional(),
  rateLimitPerMinute: z.number().int().min(1).max(10_000).default(120),
  escalationAfterSeconds: z.object({
    P1: z.number().int().min(10).max(86_400).optional(),
    P2: z.number().int().min(10).max(86_400).optional(),
    P3: z.number().int().min(10).max(86_400).optional(),
    P4: z.number().int().min(10).max(86_400).optional(),
    P5: z.number().int().min(10).max(86_400).optional(),
  }).default({ P1: 30, P2: 300, P3: 900 }),
  matrix: z.array(z.object({
    severity: z.enum(["P1", "P2", "P3", "P4", "P5"]),
    channels: z.array(notificationChannelSchema).min(1).max(6),
  })).optional(),
  smsTemplates: z.object({
    P1: z.string().trim().min(1).max(480).optional(),
    P2: z.string().trim().min(1).max(480).optional(),
  }).default({}),
  smsTemplateIds: z.object({
    P1: z.string().trim().min(1).max(200).optional(),
    P2: z.string().trim().min(1).max(200).optional(),
  }).default({}),
  policyVersion: z.number().int().min(1).optional(),
  status: z.enum(["draft", "published"]).default("draft").optional(),
});

export async function registerAlertCommandCenterRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  dispatcher: AlertNotificationDispatcher,
  workerKey?: string,
  voiceTokens = (() => {
    const secret = process.env.ALERT_VOICE_CALLBACK_SECRET;
    const hasVoiceProvider = process.env.ALERT_VOICE_PROVIDER || process.env.ALERT_SMS_PROVIDER;
    if (process.env.NODE_ENV === 'production' && !secret && hasVoiceProvider) {
      throw new Error("ALERT_VOICE_CALLBACK_SECRET must be configured in production when using voice/SMS providers");
    }
    return new VoiceCallbackTokens(secret ?? "development-voice-callback-secret-change-me");
  })(),
  evidenceClient?: AlertEvidenceClient,
) {
  app.get("/v1/alerts/command-center", async (request) => {
    const query = z.object({
      severity: z.enum(["P1", "P2", "P3", "P4", "P5"]).optional(),
      status: z.enum(["new", "acknowledged", "investigating", "escalated", "resolved", "false_alarm", "suppressed"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(request.query);
    const candidates = await store.listAnalyticsAlerts(request.currentUser.tenantId, {
      limit: query.limit!,
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status ? { status: query.status } : {}),
    });

    const cameraIds = [...new Set(candidates.map((alert) => alert.cameraId))];
    const cameras = await store.listCamerasByIds(cameraIds);
    const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));

    const branchIds = [...new Set(cameras.map((camera) => camera.branchId))];
    const branches = await store.listNodesByIds(branchIds);
    const branchesById = new Map(branches.map((branch) => [branch.id, branch]));

    const rules = await store.listAnalyticsRulesByCameraIds(cameraIds);
    const rulesByCameraId = new Map<string, AnalyticsRule[]>();
    for (const rule of rules) {
      const list = rulesByCameraId.get(rule.cameraId) ?? [];
      list.push(rule);
      rulesByCameraId.set(rule.cameraId, list);
    }

    const alertIds = candidates.map((alert) => alert.id);
    const notifications = await store.listAlertNotificationsByAlertIds(request.currentUser.tenantId, alertIds);
    const notificationsByAlertId = new Map<string, AlertNotification[]>();
    for (const notification of notifications) {
      const list = notificationsByAlertId.get(notification.alertId) ?? [];
      list.push(notification);
      notificationsByAlertId.set(notification.alertId, list);
    }

    const data = [];
    for (const alert of candidates) {
      const camera = camerasById.get(alert.cameraId);
      if (!camera) continue;
      const decision = await store.checkAccess(request.currentUser, "analytics:view", camera.nodeId);
      if (!decision?.allowed) continue;
      const branch = branchesById.get(camera.branchId);
      const rule = (rulesByCameraId.get(camera.id) ?? []).find((item) => item.id === alert.ruleId);
      const deliveries = notificationsByAlertId.get(alert.id) ?? [];
      data.push({
        ...alert,
        branchId: camera.branchId,
        branchName: branch?.name ?? "Unknown branch",
        cameraName: camera.name,
        cameraStatus: camera.status,
        detectionType: rule?.detectionType ?? "unknown",
        notificationChannels: NOTIFICATION_MATRIX[alert.severity] ?? ["log"],
        deliveries,
      });
    }

    const counts = await store.countAnalyticsAlerts(request.currentUser.tenantId, { limit: 0 });
    return { counts, data, serverTime: new Date().toISOString() };
  });

  app.get("/v1/alerts/command-center/:alertId", async (request, reply) => {
    const { alertId } = z.object({ alertId: z.string().uuid() }).parse(request.params);
    const alert = await store.getAnalyticsAlert(alertId, request.currentUser.tenantId);
    if (!alert) return reply.code(404).send({ error: "analytics_alert_not_found" });

    const camera = await store.getCamera(alert.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    const decision = await store.checkAccess(request.currentUser, "analytics:view", camera.nodeId);
    if (!decision?.allowed) return reply.code(403).send({ error: "forbidden" });

    const branch = (await store.listNodesByIds([camera.branchId]))[0];
    const rules = await store.listAnalyticsRulesByCameraIds([camera.id]);
    const rule = rules.find((item) => item.id === alert.ruleId);
    const notifications = await store.listAlertNotificationsByAlertIds(request.currentUser.tenantId, [alert.id]);
    const deliveries = notifications.find((n) => n.alertId === alert.id) ? notifications.filter((n) => n.alertId === alert.id) : [];

    const enriched = {
      ...alert,
      branchId: camera.branchId,
      branchName: branch?.name ?? "Unknown branch",
      cameraName: camera.name,
      cameraStatus: camera.status,
      detectionType: rule?.detectionType ?? "unknown",
      notificationChannels: NOTIFICATION_MATRIX[alert.severity] ?? ["log"],
      deliveries,
    };

    const counts = await store.countAnalyticsAlerts(request.currentUser.tenantId, { limit: 0 });
    return { counts, data: [enriched], serverTime: new Date().toISOString() };
  });

  app.post("/v1/alerts/command-center/demo", async (request, reply) => {
    return reply.code(410).send({
      error: "synthetic_alert_generation_removed",
      message: "Alerts must originate from a registered camera, analytics engine, or infrastructure event source.",
    });
  });

  app.get("/v1/alerts/:alertId/evidence/status", async (request, reply) => {
    const { alertId } = alertIdParams.parse(request.params);
    const alert = await authorizedAlert(store, request.currentUser, alertId, "analytics:view");
    if (!alert) return reply.code(404).send({ error: "analytics_alert_not_found" });
    if (!evidenceClient) return reply.code(503).send({ error: "automatic_alert_evidence_unavailable" });
    if (!isManagedAlertEvidenceReference(alert.id, alert.snapshotReference) &&
        !isManagedAlertEvidenceReference(alert.id, alert.clipReference)) {
      return reply.code(404).send({ error: "managed_alert_evidence_not_found" });
    }
    try {
      const upstream = await evidenceClient.status(alertId);
      const payload = Buffer.from(await upstream.arrayBuffer());
      const status = parseEvidenceStatus(payload);
      const staleCapture = status && ["queued", "capturing"].includes(status.state) &&
        Date.now() - Date.parse(status.startedAt ?? status.requestedAt) > 90_000;
      if (upstream.status === 404 || staleCapture) {
        const recovered = await evidenceClient.capture({
          alertId: alert.id, cameraId: alert.cameraId,
          occurredAt: alert.firstDetectedAt, clipSeconds: 20,
        });
        return reply.code(recovered.state === "ready" || recovered.state === "partial" ? 200 : 202)
          .header("cache-control", "private, no-store")
          .send(recovered);
      }
      return reply.code(upstream.status)
        .header("content-type", upstream.headers.get("content-type") ?? "application/json")
        .header("cache-control", "private, no-store")
        .send(payload);
    } catch (error) {
      app.log.error({ error, alertId }, "Alert evidence status proxy failed");
      return reply.code(502).send({ error: "alert_evidence_service_unavailable" });
    }
  });

  app.get("/v1/alerts/:alertId/evidence/:kind", async (request, reply) => {
    const { alertId, kind } = z.object({
      alertId: z.string().uuid(), kind: z.enum(["snapshot", "clip"]),
    }).parse(request.params);
    const alert = await authorizedAlert(store, request.currentUser, alertId, "analytics:view");
    if (!alert) return reply.code(404).send({ error: "analytics_alert_not_found" });

    // For snapshot evidence, first try the fast durable sources:
    if (kind === "snapshot") {
      try {
        let snapshotBase64: string | undefined;
        if ((store as any).pool?.query && alert.eventId) {
          const eventResult = await (store as any).pool.query(
            "SELECT metadata FROM analytics_events WHERE id = $1",
            [alert.eventId],
          );
          const meta = eventResult.rows?.[0]?.metadata;
          if (meta && typeof meta === "object" && typeof meta.snapshotBase64 === "string" && meta.snapshotBase64.length > 0) {
            snapshotBase64 = meta.snapshotBase64;
          }
        }
        if (snapshotBase64) {
          const imageBuffer = Buffer.from(snapshotBase64, "base64");
          reply.code(200);
          reply.header("content-type", "image/jpeg");
          reply.header("cache-control", "public, max-age=86400, immutable");
          return reply.send(imageBuffer);
        }
      } catch (err) {
        app.log.warn({ err, alertId }, "Failed checking event snapshotBase64 in database");
      }

      // Check analytics-engine internal endpoint if running
      const aeUrl = process.env.ANALYTICS_ENGINE_URL || "http://analytics-engine:8092";
      try {
        const aeResp = await fetch(new URL(`/internal/analytics/snapshots/${alert.eventId || alert.id}`, aeUrl), {
          headers: { "x-analytics-engine-key": process.env.ANALYTICS_ENGINE_SHARED_KEY || "" },
          signal: AbortSignal.timeout(3000),
        });
        if (aeResp.ok) {
          const buf = Buffer.from(await aeResp.arrayBuffer());
          reply.code(200);
          reply.header("content-type", "image/jpeg");
          reply.header("cache-control", "public, max-age=86400");
          return reply.send(buf);
        }
      } catch {
        // Fall through to upstream evidenceClient
      }
    }

    if (!evidenceClient) {
      if (kind === "snapshot") {
        const title = (alert.title || "AI Alert Detection").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const detected = new Date(alert.firstDetectedAt).toLocaleString();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
          <rect width="640" height="360" fill="#090d16"/>
          <circle cx="320" cy="150" r="44" fill="#1e293b" stroke="#334155" stroke-width="2"/>
          <text x="320" y="158" font-family="sans-serif" font-size="32" text-anchor="middle">🛡️</text>
          <text x="320" y="230" font-family="sans-serif" font-size="16" font-weight="bold" fill="#f1f5f9" text-anchor="middle">${title}</text>
          <text x="320" y="255" font-family="sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">Detected: ${detected}</text>
          <text x="320" y="280" font-family="sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Live detection record preserved</text>
        </svg>`;
        return reply.code(200).header("content-type", "image/svg+xml").header("cache-control", "public, max-age=60").send(svg);
      }
      return reply.code(503).send({ error: "automatic_alert_evidence_unavailable" });
    }
    const reference = kind === "snapshot" ? alert.snapshotReference : alert.clipReference;
    if (!isManagedAlertEvidenceReference(alert.id, reference)) {
      return reply.code(404).send({ error: "managed_alert_evidence_not_found" });
    }
    try {
      const upstream = await evidenceClient.asset(alertId, kind as AlertEvidenceKind, request.headers.range);
      reply.code(upstream.status);
      for (const name of ["accept-ranges", "cache-control", "content-length", "content-range", "content-type"]) {
        const value = upstream.headers.get(name);
        if (value) reply.header(name, value);
      }
      if (!upstream.body) return reply.send();
      return reply.send(Readable.fromWeb(upstream.body as any));
    } catch (error) {
      app.log.error({ error, alertId, kind }, "Alert evidence asset proxy failed");
      return reply.code(502).send({ error: "alert_evidence_service_unavailable" });
    }
  });

  app.get("/v1/alerts/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no",
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    const unsubscribe = alertEvents.subscribe(request.currentUser.tenantId, (event) => {
      if (!reply.raw.destroyed) reply.raw.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);
    heartbeat.unref();
    request.raw.once("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });

  app.post("/v1/alerts/:alertId/assign", async (request, reply) => {
    const { alertId } = alertIdParams.parse(request.params);
    const body = z.object({ assignedTo: z.string().min(1), expectedVersion: z.number().int().positive() }).parse(request.body);
    const alert = await authorizedAlert(store, request.currentUser, alertId, "alerts:acknowledge");
    if (!alert) return reply.code(404).send({ error: "analytics_alert_not_found" });
    try {
      const updated = await store.transitionAnalyticsAlert(alertId, request.currentUser.tenantId, {
        status: "investigating", actorUserId: request.currentUser.id,
        assignedTo: body.assignedTo === "self" ? request.currentUser.id : body.assignedTo,
      });
      if (updated) publishUpdated(updated);
      return updated;
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : "alert_conflict" });
    }
  });

  app.get("/v1/alerts/:alertId/notifications", async (request, reply) => {
    const { alertId } = alertIdParams.parse(request.params);
    const alert = await authorizedAlert(store, request.currentUser, alertId, "analytics:view");
    if (!alert) return reply.code(404).send({ error: "analytics_alert_not_found" });
    return { data: await store.listAlertNotifications(request.currentUser.tenantId, alertId) };
  });

  app.get("/v1/alerts/notification-policy", async (request, reply) => {
    if (!(await canConfigure(store, request.currentUser))) return reply.code(403).send({ error: "forbidden" });
    return { data: await store.getAlertNotificationPolicy(request.currentUser.tenantId), matrix: NOTIFICATION_MATRIX };
  });

  app.put("/v1/alerts/notification-policy", async (request, reply) => {
    if (!(await canConfigure(store, request.currentUser))) return reply.code(403).send({ error: "forbidden" });
    const input = policySchema.parse(request.body);
    const policy = await store.upsertAlertNotificationPolicy({
      tenantId: request.currentUser.tenantId,
      recipientGroups: input.recipientGroups,
      onCallSchedules: input.onCallSchedules.map((schedule) => ({
        name: schedule.name!, days: schedule.days!, start: schedule.start!, end: schedule.end!,
        timezone: schedule.timezone!, recipients: schedule.recipients!,
      })),
      ...(input.quietHours ? { quietHours: {
        start: input.quietHours.start!, end: input.quietHours.end!, timezone: input.quietHours.timezone!,
      } } : {}),
      rateLimitPerMinute: input.rateLimitPerMinute,
      escalationAfterSeconds: input.escalationAfterSeconds,
      smsTemplates: input.smsTemplates,
      smsTemplateIds: input.smsTemplateIds,
      updatedAt: new Date().toISOString(),
    });
    return { data: policy, matrix: NOTIFICATION_MATRIX };
  });

  app.post("/internal/alerts/notifications/drain", async (request, reply) => {
    if (!workerKey || !secureEqual(request.headers["x-alert-worker-key"], workerKey)) {
      return reply.code(401).send({ error: "invalid_alert_worker_identity" });
    }
    return { processed: await dispatcher.drainOnce(100) };
  });

  app.post("/internal/alerts/notifications/receipts", async (request, reply) => {
    if (!workerKey || !secureEqual(request.headers["x-alert-worker-key"], workerKey)) {
      return reply.code(401).send({ error: "invalid_alert_worker_identity" });
    }
    const body = z.object({
      notificationId: z.string().uuid(),
      status: z.enum(["delivered", "failed", "dead"]),
      providerId: z.string().trim().min(1).max(300).optional(),
      error: z.string().trim().min(1).max(2_000).optional(),
    }).parse(request.body);
    const notification = await store.completeAlertNotification(body.notificationId, {
      status: body.status,
      ...(body.providerId ? { providerId: body.providerId } : {}),
      ...(body.error ? { error: body.error } : {}),
      ...(body.status === "failed" ? { nextAttemptAt: new Date(Date.now() + 30_000).toISOString() } : {}),
    });
    if (!notification) return reply.code(404).send({ error: "notification_not_found" });
    alertEvents.publish({
      id: randomUUID(), tenantId: notification.tenantId, type: "notification.updated",
      occurredAt: new Date().toISOString(), alertId: notification.alertId,
    });
    return notification;
  });

  app.get("/internal/alerts/voice/ivr", async (request, reply) => {
    const query = z.object({ token: z.string().min(20).max(4_000), Digits: z.coerce.string().optional() }).parse(request.query);
    const token = query.token;
    const claims = voiceTokens.verify(token);
    if (!claims) return reply.code(401).send({ error: "invalid_or_expired_voice_callback" });
    const notification = (await store.listAlertNotifications(claims.tenantId, claims.alertId))
      .find((item) => item.id === claims.notificationId && item.channel === "voice");
    const alert = await store.getAnalyticsAlert(claims.alertId, claims.tenantId);
    if (!notification || !alert) return reply.code(404).send({ error: "voice_call_not_found" });
    if (query.Digits === "1") {
      const now = new Date().toISOString();
      await store.recordVoiceCallEvent(notification.id, { status: "acknowledged", occurredAt: now,
        acknowledgedAt: now, acknowledgedBy: notification.recipient, detail: "Recipient pressed 1" });
      const siblings = await store.listAlertNotifications(claims.tenantId, claims.alertId);
      await Promise.all(siblings.filter((item) => item.channel === "voice" && item.id !== notification.id &&
        ["queued", "failed"].includes(item.status)).map((item) =>
        store.completeAlertNotification(item.id, { status: "cancelled", error: "acknowledged_by_call_tree_recipient" })));
      publishNotificationUpdated(claims.tenantId, claims.alertId);
      return reply.type("application/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>Alert acknowledged. Thank you.</Say><Hangup/></Response>");
    }
    const camera = await store.getCamera(alert.cameraId);
    const branch = camera ? await store.getNode(camera.branchId) : undefined;
    const action = `${request.protocol}://${request.hostname}/internal/alerts/voice/ivr?token=${encodeURIComponent(token)}`;
    return reply.type("application/xml").send(twiml(voiceAlertMessage(alert, branch?.name), action));
  });

  app.get("/internal/alerts/voice/status", async (request, reply) => {
    const raw = z.object({ token: z.string().min(20).max(4_000), CallStatus: z.string().optional(), Status: z.string().optional(),
      CallSid: z.string().optional(), Sid: z.string().optional(), CallDuration: z.coerce.number().int().nonnegative().optional() }).parse(request.query);
    const token = raw.token;
    const claims = voiceTokens.verify(token);
    if (!claims) return reply.code(401).send({ error: "invalid_or_expired_voice_callback" });
    const query = raw;
    const status = (query.CallStatus ?? query.Status ?? "provider_callback").toLowerCase().replaceAll("-", "_");
    const notification = await store.recordVoiceCallEvent(claims.notificationId, { status,
      occurredAt: new Date().toISOString(), providerId: query.CallSid ?? query.Sid,
      durationSeconds: query.CallDuration, detail: "Provider status callback" });
    if (!notification) return reply.code(404).send({ error: "voice_call_not_found" });
    if (["busy", "failed", "no_answer", "canceled", "cancelled", "rejected"].includes(status)) {
      await store.completeAlertNotification(notification.id, { status: "failed", error: `voice_${status}`,
        nextAttemptAt: new Date(Date.now() + 30_000).toISOString() });
    }
    publishNotificationUpdated(claims.tenantId, claims.alertId);
    return { accepted: true };
  });

  app.get("/internal/alerts/voice/recording", async (request, reply) => {
    const raw = z.object({ token: z.string().min(20).max(4_000), RecordingUrl: z.string().url().optional(), RecordingUri: z.string().url().optional(),
      RecordingStatus: z.string().optional(), RecordingDuration: z.coerce.number().int().nonnegative().optional() }).parse(request.query);
    const token = raw.token;
    const claims = voiceTokens.verify(token);
    if (!claims) return reply.code(401).send({ error: "invalid_or_expired_voice_callback" });
    const query = raw;
    const recordingUrl = query.RecordingUrl ?? query.RecordingUri;
    const notification = await store.recordVoiceCallEvent(claims.notificationId, {
      status: query.RecordingStatus ?? "recording_available", occurredAt: new Date().toISOString(),
      recordingUrl, durationSeconds: query.RecordingDuration, detail: "Provider recording callback",
    });
    if (!notification) return reply.code(404).send({ error: "voice_call_not_found" });
    publishNotificationUpdated(claims.tenantId, claims.alertId);
    return { accepted: true };
  });

  const smsStatusHandler = async (request: any, reply: any) => {
    const query = z.object({ token: z.string().min(20).max(4_000).optional(), clientId: z.string().min(20).max(4_000).optional(), MessageStatus: z.string().optional(),
      SmsStatus: z.string().optional(), status: z.string().optional(), MessageSid: z.string().optional(),
      message_id: z.string().optional(), requestId: z.string().optional() }).refine((value) => value.token || value.clientId,
        "token or clientId is required").parse({
        ...(request.body && typeof request.body === "object" ? request.body : {}), ...request.query,
      });
    const claims = voiceTokens.verify(query.token ?? query.clientId!);
    if (!claims) return reply.code(401).send({ error: "invalid_or_expired_sms_callback" });
    const status = (query.MessageStatus ?? query.SmsStatus ?? query.status ?? "provider_callback")
      .toLowerCase().replaceAll("-", "_");
    const providerId = query.MessageSid ?? query.message_id ?? query.requestId;
    const notification = await store.recordSmsDeliveryEvent(claims.notificationId, { status,
      occurredAt: new Date().toISOString(), providerId, detail: "Provider delivery callback" });
    if (!notification) return reply.code(404).send({ error: "sms_delivery_not_found" });
    if (["delivered", "delivery_success", "sent"].includes(status)) {
      await store.completeAlertNotification(notification.id, { status: status === "delivered" ? "delivered" : "sent",
        ...(providerId ? { providerId } : {}) });
    } else if (["failed", "undelivered", "rejected", "expired"].includes(status)) {
      await store.completeAlertNotification(notification.id, { status: "failed", error: `sms_${status}`,
        nextAttemptAt: new Date(Date.now() + 30_000).toISOString(), ...(providerId ? { providerId } : {}) });
    }
    publishNotificationUpdated(claims.tenantId, claims.alertId);
    return { accepted: true };
  };
  app.get("/internal/alerts/sms/status", smsStatusHandler);
  app.post("/internal/alerts/sms/status", smsStatusHandler);

  const emailStatusHandler = async (request: any, reply: any) => {
    const query = z.object({ token: z.string().min(20).max(4_000).optional(), status: z.string().optional(),
      email_status: z.string().optional(), provider: z.enum(["smtp", "sendgrid", "ses", "webhook", "test"]).optional(),
      providerId: z.string().optional(), MessageId: z.string().optional(), message_id: z.string().optional(), subject: z.string().optional() })
      .parse({ ...(request.body && typeof request.body === "object" ? request.body : {}), ...request.query });
    const token = query.token;
    if (!token) return reply.code(401).send({ error: "invalid_or_expired_email_callback" });
    const claims = voiceTokens.verify(token);
    if (!claims) return reply.code(401).send({ error: "invalid_or_expired_email_callback" });
    const status = (query.status ?? query.email_status ?? "provider_callback").toLowerCase().replaceAll("-", "_");
    const providerId = query.providerId ?? query.MessageId ?? query.message_id;
    const notification = await store.recordEmailDeliveryEvent(claims.notificationId, {
      status, occurredAt: new Date().toISOString(), providerId,
      detail: "Provider delivery callback", ...(query.provider ? { provider: query.provider } : {}), subject: query.subject,
    });
    if (!notification) return reply.code(404).send({ error: "email_delivery_not_found" });
    if (["delivered", "processed", "delivery"].includes(status)) {
      await store.completeAlertNotification(notification.id, { status: "delivered", ...(providerId ? { providerId } : {}) });
    } else if (["failed", "bounced", "bounce", "dropped", "complaint", "spamreport", "rejected"].includes(status)) {
      await store.completeAlertNotification(notification.id, { status: "failed", error: `email_${status}`,
        nextAttemptAt: new Date(Date.now() + 30_000).toISOString(), ...(providerId ? { providerId } : {}) });
    }
    publishNotificationUpdated(claims.tenantId, claims.alertId);
    return { accepted: true };
  };
  app.get("/internal/alerts/email/status", emailStatusHandler);
  app.post("/internal/alerts/email/status", emailStatusHandler);
}

async function authorizedAlert(store: ControlPlaneStore, user: any, alertId: string, action: "analytics:view" | "alerts:acknowledge") {
  const alert = await store.getAnalyticsAlert(alertId, user.tenantId);
  if (!alert) return undefined;
  const camera = await store.getCamera(alert.cameraId);
  if (!camera) return undefined;
  const decision = await store.checkAccess(user, action, camera.nodeId);
  return decision?.allowed ? alert : undefined;
}

async function canConfigure(store: ControlPlaneStore, user: any) {
  return (await store.listAccessibleNodes(user, "analytics:configure")).length > 0;
}

function publishUpdated(alert: NonNullable<Awaited<ReturnType<ControlPlaneStore["getAnalyticsAlert"]>>>) {
  alertEvents.publish({
    id: randomUUID(), tenantId: alert.tenantId, type: "alert.updated",
    occurredAt: new Date().toISOString(), alertId: alert.id, alert,
  });
}

function publishNotificationUpdated(tenantId: string, alertId: string) {
  alertEvents.publish({ id: randomUUID(), tenantId, type: "notification.updated",
    occurredAt: new Date().toISOString(), alertId });
}

function secureEqual(value: string | string[] | undefined, expected: string) {
  if (typeof value !== "string") return false;
  const left = Buffer.from(value); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseEvidenceStatus(payload: Buffer): AlertEvidenceCaptureStatus | undefined {
  try {
    const value = JSON.parse(payload.toString("utf8")) as Partial<AlertEvidenceCaptureStatus>;
    return value.alertId && value.cameraId && value.state && value.requestedAt
      ? value as AlertEvidenceCaptureStatus : undefined;
  } catch {
    return undefined;
  }
}
