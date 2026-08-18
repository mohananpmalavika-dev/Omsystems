import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { AlertNotificationDispatcher, enqueueAlertMatrix } from "../src/alerts/notification-dispatcher.js";
import { RoutedAlertNotificationSender, VoiceCallbackTokens } from "../src/alerts/voice-call.js";
import { Msg91SmsProvider, SmsNotificationSender, TextLocalSmsProvider, TwilioSmsProvider,
  renderSmsTemplate, type SmsProvider } from "../src/alerts/sms.js";

describe("P1 SMS delivery", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("batches recipients, renders the tenant template and defers rate-limit overflow", async () => {
    const store = new MemoryStore();
    await store.upsertAlertNotificationPolicy({ tenantId: "omsystems",
      recipientGroups: { sms: ["+919100000001", "+919100000002"] }, onCallSchedules: [],
      rateLimitPerMinute: 1, escalationAfterSeconds: { P1: 30, P2: 300 },
      smsTemplates: { P1: "{severity} {branch} {camera}: {title} ({alertId})" }, updatedAt: new Date().toISOString() });
    const sent: Array<{ to: string; body: string; statusUrl: string }> = [];
    const provider: SmsProvider = { name: "test", async sendBulk(messages) {
      sent.push(...messages); return messages.map((_, index) => ({ id: `sms-${index}` }));
    } };
    const tokens = new VoiceCallbackTokens("sms-test-secret");
    const sms = new SmsNotificationSender(store, provider, "https://alerts.example.com", tokens);
    const standard = { async send(notification: any) { return { providerId: `internal-${notification.id}` }; } };
    const sender = new RoutedAlertNotificationSender(standard, standard, sms);
    const dispatcher = new AlertNotificationDispatcher(store, sender);
    const rule = await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
      name: "P1 SMS", detectionType: "vehicle", enabled: true, objectClasses: [], minConfidence: 0.5,
      minDurationSeconds: 0, direction: "any", severity: "P1", cooldownSeconds: 60, recipients: [],
      recordingPolicy: "none", preRollSeconds: 30, postRollSeconds: 120, escalateAfterSeconds: 300 });
    const result = await store.processAnalyticsEvent({ tenantId: "omsystems", cameraId: "cam-001",
      sourceEventId: "sms-batch", detectionType: "vehicle", occurredAt: new Date().toISOString(), confidence: 0.9,
      durationSeconds: 1, modelVersion: "test", objects: [] });
    await enqueueAlertMatrix(store, result.alerts[0]!, rule);
    await dispatcher.drainOnce();
    const deliveries = store.analyticsNotifications.filter((item) => item.channel === "sms");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain("P1 Bengaluru Branch 001 Main Entrance");
    expect(sent[0]?.statusUrl).toContain("/internal/alerts/sms/status?token=");
    expect(deliveries.map((item) => item.status).sort()).toEqual(["failed", "sent"]);
    expect(deliveries.find((item) => item.status === "failed")?.lastError).toBe("sms_rate_limit_exceeded");
    expect(deliveries.find((item) => item.status === "sent")?.smsDelivery?.provider).toBe("test");
  });

  it("tracks a signed provider delivery callback", async () => {
    const store = new MemoryStore();
    const secret = "sms-callback-secret";
    app = await buildApp({ store, voiceCallbackSecret: secret, alertNotificationSender: {
      async send(notification) { return { providerId: `fake-${notification.id}` }; },
    } });
    const [notification] = await store.enqueueAlertNotifications([{ tenantId: "omsystems",
      alertId: crypto.randomUUID(), channel: "sms", recipient: "+919100000001",
      smsDelivery: { provider: "test", status: "sent", template: "P1", events: [] } }]);
    const token = new VoiceCallbackTokens(secret).sign({ notificationId: notification!.id,
      alertId: notification!.alertId, tenantId: notification!.tenantId });
    const response = await app.inject({ method: "POST",
      url: `/internal/alerts/sms/status?token=${encodeURIComponent(token)}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "MessageStatus=delivered&MessageSid=SM123" });
    expect(response.statusCode).toBe(200);
    expect(store.analyticsNotifications[0]).toMatchObject({ status: "delivered", providerId: "SM123",
      smsDelivery: { status: "delivered" } });
  });

  it("supports documented placeholders and caps SMS length", () => {
    const message = renderSmsTemplate("{severity} {branch} {title} {camera} {time} {alertId} ".repeat(100), {
      severity: "P1", branch: "Mumbai", title: "Intrusion", camera: "Gate", time: "now", alertId: "A1" });
    expect(message).toContain("P1 Mumbai Intrusion Gate now A1");
    expect(message.length).toBe(480);
  });
});

describe("SMS gateway adapters", () => {
  it("submits one MSG91 bulk request", async () => {
    const fetcher: any = vi.fn(async () => new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }));
    const provider = new Msg91SmsProvider("key", fetcher as typeof fetch);
    const variables = { branch: "Mumbai", title: "Alert", camera: "Gate", time: "now", alertId: "A1", severity: "P1" };
    const result = await provider.sendBulk([{ to: "+9191", body: "one", statusUrl: "https://a/status", templateId: "flow-1", variables },
      { to: "+9192", body: "two", statusUrl: "https://a/status", templateId: "flow-1", variables }]);
    expect(result).toEqual([{ id: "req-1:0" }, { id: "req-1:1" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain('"mobiles":"9192"');
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain('"template_id":"flow-1"');
  });

  it("supports TextLocal and Twilio delivery callbacks", async () => {
    const textFetch: any = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "tl-1" }] }), { status: 200 }));
    const textlocal = new TextLocalSmsProvider("key", "OMSYST", textFetch as typeof fetch);
    await expect(textlocal.sendBulk([{ to: "9191", body: "alert", statusUrl: "https://a/status" }]))
      .resolves.toEqual([{ id: "tl-1" }]);
    expect(String(textFetch.mock.calls[0]?.[1]?.body)).toContain("receipt_url=https%3A%2F%2Fa%2Fstatus");

    const twilioFetch: any = vi.fn(async () => new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }));
    const twilio = new TwilioSmsProvider("AC1", "token", "+911", twilioFetch as typeof fetch);
    await expect(twilio.sendBulk([{ to: "+912", body: "alert", statusUrl: "https://a/status" }]))
      .resolves.toEqual([{ id: "SM1" }]);
    expect(String(twilioFetch.mock.calls[0]?.[1]?.body)).toContain("StatusCallback=https%3A%2F%2Fa%2Fstatus");
  });
});
