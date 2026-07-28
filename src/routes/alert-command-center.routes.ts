import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AlertNotificationDispatcher } from "../alerts/notification-dispatcher.js";
import { NOTIFICATION_MATRIX } from "../alerts/notification-dispatcher.js";
import { alertEvents } from "../alerts/event-stream.js";
import { VoiceCallbackTokens, twiml, voiceAlertMessage } from "../alerts/voice-call.js";

const alertIdParams = z.object({ alertId: z.string().uuid() });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const recipients = z.object({
  sms: z.array(z.string().trim().min(3).max(100)).max(100).optional(),
  email: z.array(z.string().email()).max(100).optional(),
  voice: z.array(z.string().trim().min(3).max(100)).max(100).optional(),
}).default({});
const policySchema = z.object({
  recipientGroups: recipients,
  onCallSchedules: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: hhmm, end: hhmm,
    timezone: z.string().trim().min(1).max(100),
    recipients,
  })).max(50).default([]),
  quietHours: z.object({ start: hhmm, end: hhmm, timezone: z.string().trim().min(1).max(100) }).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(10_000).default(120),
  escalationAfterSeconds: z.object({
    P1: z.number().int().min(10).max(86_400).optional(),
    P2: z.number().int().min(10).max(86_400).optional(),
    P3: z.number().int().min(10).max(86_400).optional(),
    P4: z.number().int().min(10).max(86_400).optional(),
    P5: z.number().int().min(10).max(86_400).optional(),
  }).default({ P1: 30, P2: 300, P3: 900 }),
  smsTemplates: z.object({
    P1: z.string().trim().min(1).max(480).optional(),
    P2: z.string().trim().min(1).max(480).optional(),
  }).default({}),
  smsTemplateIds: z.object({
    P1: z.string().trim().min(1).max(200).optional(),
    P2: z.string().trim().min(1).max(200).optional(),
  }).default({}),
});

export async function registerAlertCommandCenterRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  dispatcher: AlertNotificationDispatcher,
  workerKey?: string,
  voiceTokens = new VoiceCallbackTokens(process.env.ALERT_VOICE_CALLBACK_SECRET ?? "development-voice-callback-secret-change-me"),
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
    const data = [];
    for (const alert of candidates) {
      const camera = await store.getCamera(alert.cameraId);
      if (!camera) continue;
      const decision = await store.checkAccess(request.currentUser, "analytics:view", camera.nodeId);
      if (!decision?.allowed) continue;
      const branch = await store.getNode(camera.branchId);
      const rule = (await store.listAnalyticsRules(camera.id)).find((item) => item.id === alert.ruleId);
      const deliveries = await store.listAlertNotifications(request.currentUser.tenantId, alert.id);
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
    return { data, serverTime: new Date().toISOString() };
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
