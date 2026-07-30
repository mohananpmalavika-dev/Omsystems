import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import type { AlertNotificationSender } from "../src/alerts/notification-dispatcher.js";
import { AlertEventStream } from "../src/alerts/event-stream.js";
import type { AlertEvidenceClient } from "../src/alerts/evidence-capture.js";

const engineKey = "phase3-analytics-engine-key";
const workerKey = "phase3-notification-worker-key";
const admin = { "x-user-id": "user-global-admin" };

describe("Phase 3 HO alert command center", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  const sent: Array<{ channel: string; recipient: string; alertId: string }> = [];
  const captures: Array<{ alertId: string; cameraId: string }> = [];

  beforeEach(async () => {
    sent.length = 0;
    captures.length = 0;
    store = new MemoryStore();
    const sender: AlertNotificationSender = {
      async send(notification, alert) {
        sent.push({ channel: notification.channel, recipient: notification.recipient, alertId: alert.id });
        return { providerId: `provider-${notification.id}` };
      },
    };
    const evidenceClient: AlertEvidenceClient = {
      async capture(input) {
        captures.push({ alertId: input.alertId, cameraId: input.cameraId });
        return {
          alertId: input.alertId, cameraId: input.cameraId, state: "queued",
          requestedAt: new Date().toISOString(), snapshotAvailable: false, clipAvailable: false,
        };
      },
      async status(alertId) {
        return Response.json({
          alertId, cameraId: "cam-001", state: "ready", requestedAt: new Date().toISOString(),
          snapshotAvailable: true, clipAvailable: true,
        });
      },
      async asset(_alertId, kind) {
        return new Response(kind === "snapshot" ? "jpeg" : "mp4", {
          headers: { "content-type": kind === "snapshot" ? "image/jpeg" : "video/mp4" },
        });
      },
    };
    app = await buildApp({
      store, analyticsEngineSharedKey: engineKey, alertWorkerKey: workerKey,
      alertNotificationSender: sender, alertEvidenceClient: evidenceClient,
    });
  });
  afterEach(async () => app.close());

  it("dispatches and audits the exact P1-P4 notification matrix", async () => {
    const cases = [
      { severity: "P1", detectionType: "person", expected: ["dashboard", "email", "sms", "voice"] },
      { severity: "P2", detectionType: "vehicle", expected: ["dashboard", "email"] },
      { severity: "P3", detectionType: "motion", expected: ["dashboard"] },
      { severity: "P4", detectionType: "object", expected: ["log"] },
    ] as const;
    for (const item of cases) {
      const rule = await app.inject({
        method: "POST", url: "/v1/cameras/cam-001/analytics/rules", headers: admin,
        payload: {
          name: `${item.severity} synthetic`, detectionType: item.detectionType,
          severity: item.severity, minConfidence: 0.5, cooldownSeconds: 60,
          recipients: ["email:soc@example.com", "sms:+919999999999", "voice:+918888888888"],
          recordingPolicy: "none", preRollSeconds: 30, postRollSeconds: 120,
        },
      });
      expect(rule.statusCode).toBe(201);
      const event = await app.inject({
        method: "POST", url: "/internal/analytics/events",
        headers: { "x-analytics-engine-key": engineKey },
        payload: {
          tenantId: "omsystems", cameraId: "cam-001", sourceEventId: `phase3-${item.severity}`,
          detectionType: item.detectionType, occurredAt: new Date().toISOString(),
          confidence: 0.91, durationSeconds: 2, modelVersion: "synthetic-v1", objects: [],
        },
      });
      expect(event.statusCode).toBe(202);
      const alertId = event.json().alerts[0].id;
      expect(store.analyticsNotifications.filter((entry) => entry.alertId === alertId)
        .map((entry) => entry.channel).sort()).toEqual([...item.expected].sort());
    }
    await app.inject({
      method: "POST", url: "/internal/alerts/notifications/drain",
      headers: { "x-alert-worker-key": workerKey },
    });
    await waitFor(() => store.analyticsNotifications.every((item) => item.status === "delivered"));
    expect(store.analyticsNotifications).toHaveLength(8);
    expect(store.analyticsNotifications.every((item) => item.attempts === 1 && item.providerId)).toBe(true);
    expect(sent).toHaveLength(8);
  });

  it("enriches the HO queue and permits only one acknowledgement for a version", async () => {
    await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
      name: "Concurrent acknowledgement", detectionType: "person", enabled: true,
      objectClasses: [], minConfidence: 0.5, minDurationSeconds: 0, direction: "any",
      severity: "P1", cooldownSeconds: 60, recipients: [], recordingPolicy: "none",
      preRollSeconds: 30, postRollSeconds: 120, escalateAfterSeconds: 30,
    });
    const result = await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "concurrent-alert",
      detectionType: "person", occurredAt: new Date().toISOString(), confidence: 0.9,
      durationSeconds: 1, modelVersion: "v1", objects: [],
    });
    const alert = result.alerts[0]!;
    const queue = await app.inject({ method: "GET", url: "/v1/alerts/command-center", headers: admin });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().data[0]).toMatchObject({
      id: alert.id, branchName: "Bengaluru Branch 001", cameraName: "Main Entrance",
      version: 1, notificationChannels: ["dashboard", "sms", "email", "voice"],
    });
    expect(queue.json().data[0].slaDueAt).toBeTruthy();

    const acknowledge = () => app.inject({
      method: "POST", url: `/v1/analytics/alerts/${alert.id}/acknowledge`, headers: admin,
      payload: { expectedVersion: 1, notes: "HO operator accepted alert" },
    });
    const responses = await Promise.all([acknowledge(), acknowledge()]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(store.analyticsAcknowledgements).toHaveLength(1);
    expect(store.analyticsAlerts[0]?.version).toBe(2);
  });

  it("automatically starts and securely proxies P1/P2 snapshot and clip evidence", async () => {
    await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
      name: "Automatic evidence", detectionType: "person", enabled: true,
      objectClasses: [], minConfidence: 0.5, minDurationSeconds: 0, direction: "any",
      severity: "P1", cooldownSeconds: 0, recipients: [], recordingPolicy: "none",
      preRollSeconds: 30, postRollSeconds: 120,
    });
    const response = await app.inject({
      method: "POST", url: "/internal/analytics/events",
      headers: { "x-analytics-engine-key": engineKey },
      payload: {
        tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "auto-evidence",
        detectionType: "person", occurredAt: new Date().toISOString(), confidence: 0.95,
        durationSeconds: 2, modelVersion: "v1", objects: [{ label: "person", confidence: 0.95 }],
      },
    });
    expect(response.statusCode).toBe(202);
    const alert = response.json().alerts[0];
    expect(captures).toEqual([{ alertId: alert.id, cameraId: "cam-001" }]);
    expect(alert.snapshotReference).toBe(`/v1/alerts/${alert.id}/evidence/snapshot`);
    expect(alert.clipReference).toBe(`/v1/alerts/${alert.id}/evidence/clip`);

    const status = await app.inject({
      method: "GET", url: `/v1/alerts/${alert.id}/evidence/status`, headers: admin,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ state: "ready", snapshotAvailable: true, clipAvailable: true });
    const snapshot = await app.inject({
      method: "GET", url: `/v1/alerts/${alert.id}/evidence/snapshot`, headers: admin,
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.headers["content-type"]).toContain("image/jpeg");
  });

  it("persists recipient groups and on-call schedules without changing the fixed matrix", async () => {
    const response = await app.inject({
      method: "PUT", url: "/v1/alerts/notification-policy", headers: admin,
      payload: {
        recipientGroups: { email: ["soc@example.com"], sms: ["+919999999999"], voice: ["+918888888888"] },
        onCallSchedules: [{
          name: "Night SOC", days: [0,1,2,3,4,5,6], start: "18:00", end: "09:00",
          timezone: "Asia/Kolkata", recipients: { email: ["night@example.com"] },
        }],
        quietHours: { start: "22:00", end: "06:00", timezone: "Asia/Kolkata" },
        rateLimitPerMinute: 60, escalationAfterSeconds: { P1: 30, P2: 300 },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().matrix.P1).toEqual(["dashboard", "sms", "email", "voice"]);
    expect((await store.getAlertNotificationPolicy("omsystems")).onCallSchedules[0]?.name).toBe("Night SOC");
  });
});

describe("alert event tenant isolation", () => {
  it("does not fan an HO alert into another tenant", () => {
    const stream = new AlertEventStream();
    const received: string[] = [];
    stream.subscribe("tenant-a", (event) => received.push(event.alertId));
    stream.publish({ id: "1", tenantId: "tenant-b", type: "alert.created", occurredAt: new Date().toISOString(), alertId: "wrong" });
    stream.publish({ id: "2", tenantId: "tenant-a", type: "alert.created", occurredAt: new Date().toISOString(), alertId: "right" });
    expect(received).toEqual(["right"]);
  });
});

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1_000;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
}
