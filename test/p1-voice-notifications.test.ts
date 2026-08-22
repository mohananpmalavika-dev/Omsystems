import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { ExotelVoiceProvider, TwilioVoiceProvider, VoiceCallbackTokens, twiml } from "../src/alerts/voice-call.js";
import { enqueueAlertMatrix } from "../src/alerts/notification-dispatcher.js";

describe("P1 voice notification call tree", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  const secret = "voice-test-secret-with-sufficient-entropy";

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store, voiceCallbackSecret: secret, alertNotificationSender: {
      async send(notification) { return { providerId: `fake:${notification.id}` }; },
    } });
  });
  afterEach(async () => app.close());

  it("stages primary and backup calls and cancels the tree after IVR acknowledgement", async () => {
    await store.upsertAlertNotificationPolicy({ tenantId: "omsystems",
      recipientGroups: { voice: ["+919100000001", "+919100000002"] }, onCallSchedules: [],
      rateLimitPerMinute: 120, escalationAfterSeconds: { P1: 30 }, updatedAt: new Date().toISOString() });
    await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
      name: "P1 voice", detectionType: "person", enabled: true, objectClasses: [], minConfidence: 0.5,
      minDurationSeconds: 0, direction: "any", severity: "P1", cooldownSeconds: 60, recipients: [],
      recordingPolicy: "none", preRollSeconds: 30, postRollSeconds: 120, escalateAfterSeconds: 30,
    });
    const result = await store.processAnalyticsEvent({ tenantId: "omsystems", cameraId: "cam-001",
      sourceEventId: "voice-call-tree", detectionType: "person", occurredAt: new Date().toISOString(),
      confidence: 0.99, durationSeconds: 2, modelVersion: "test", objects: [] });
    const alert = result.alerts[0]!;
    await enqueueAlertMatrix(store as any, alert, result.rules[0]);
    const calls = store.analyticsNotifications.filter((item) => item.alertId === alert.id && item.channel === "voice")
      .sort((a, b) => a.voiceCall!.sequence - b.voiceCall!.sequence);
    expect(calls).toHaveLength(2);
    expect(Date.parse(calls[1]!.nextAttemptAt) - Date.parse(calls[0]!.nextAttemptAt)).toBe(30_000);

    const token = new VoiceCallbackTokens(secret).sign({ notificationId: calls[0]!.id, alertId: alert.id,
      tenantId: alert.tenantId });
    const response = await app.inject({ method: "GET", url: `/internal/alerts/voice/ivr?token=${encodeURIComponent(token)}&Digits=1` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/xml");
    expect(store.analyticsNotifications.find((item) => item.id === calls[0]!.id)?.voiceCall).toMatchObject({
      status: "acknowledged", acknowledgedBy: "+919100000001",
    });
    expect(store.analyticsNotifications.find((item) => item.id === calls[1]!.id)?.status).toBe("cancelled");
  });

  it("rejects tampered callback tokens and XML-escapes TTS content", async () => {
    const tokens = new VoiceCallbackTokens(secret);
    const token = tokens.sign({ notificationId: crypto.randomUUID(), alertId: crypto.randomUUID(),
      tenantId: "tenant" });
    expect(tokens.verify(`${token}x`)).toBeUndefined();
    const xml = twiml("Branch A & B <critical>", "https://alerts.example/ivr?x=1&y=2");
    expect(xml).toContain("A &amp; B &lt;critical&gt;");
    expect(xml).toContain("x=1&amp;y=2");
  });

  it("returns an asynchronous carrier failure to the retry and failover queue", async () => {
    const [notification] = await store.enqueueAlertNotifications([{ tenantId: "omsystems",
      alertId: crypto.randomUUID(), channel: "voice", recipient: "+919100000001",
      voiceCall: { provider: "twilio", sequence: 0, status: "sent", events: [] } }]);
    const token = new VoiceCallbackTokens(secret).sign({ notificationId: notification!.id,
      alertId: notification!.alertId, tenantId: notification!.tenantId });

    const response = await app.inject({ method: "GET",
      url: `/internal/alerts/voice/status?token=${encodeURIComponent(token)}&CallStatus=busy&CallSid=CA123` });

    expect(response.statusCode).toBe(200);
    expect(store.analyticsNotifications[0]).toMatchObject({
      status: "failed", lastError: "voice_busy", providerId: "CA123",
      voiceCall: { provider: "twilio", status: "busy" },
    });
    expect(Date.parse(store.analyticsNotifications[0]!.nextAttemptAt)).toBeGreaterThan(Date.now());
  });
});

describe("voice provider adapters", () => {
  it("builds a Twilio Voice request with IVR, callbacks, recording and authentication", async () => {
    const fetcher: any = vi.fn(async () => new Response(JSON.stringify({ sid: "CA123" }), { status: 201,
      headers: { "content-type": "application/json" } }));
    const provider = new TwilioVoiceProvider("AC123", "token", "+911", fetcher as typeof fetch);
    await expect(provider.placeCall({ to: "+912", messageUrl: "https://a/ivr", statusUrl: "https://a/status",
      recordingUrl: "https://a/recording" })).resolves.toEqual({ id: "CA123" });
    const [, request] = fetcher.mock.calls[0]!;
    expect(String(request?.body)).toContain("Record=true");
    expect(String(request?.body)).toContain("StatusCallback=https%3A%2F%2Fa%2Fstatus");
    expect((request?.headers as Record<string, string>).authorization).toMatch(/^Basic /);
  });

  it("builds an Exotel connect request with recording callbacks", async () => {
    const fetcher: any = vi.fn(async () => new Response(JSON.stringify({ Call: { Sid: "exotel-1" } }), { status: 200,
      headers: { "content-type": "application/json" } }));
    const provider = new ExotelVoiceProvider("account", "key", "token", "+911", "api.in.exotel.com", fetcher as typeof fetch);
    await expect(provider.placeCall({ to: "+912", messageUrl: "https://a/ivr", statusUrl: "https://a/status",
      recordingUrl: "https://a/recording" })).resolves.toEqual({ id: "exotel-1" });
    const [, request] = fetcher.mock.calls[0]!;
    expect(String(request?.body)).toContain("Recording=true");
    expect(String(request?.body)).toContain("StatusCallback=https%3A%2F%2Fa%2Fstatus");
  });
});
