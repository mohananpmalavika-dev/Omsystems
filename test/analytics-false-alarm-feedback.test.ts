import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAnalyticsRoutes } from "../src/routes/analytics.routes.js";
import { MemoryStore } from "../src/store.js";
import { buildFalseAlarmSignature, matchesFalseAlarm } from "../src/analytics/false-alarm-feedback.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

const admin = { "x-user-id": "user-global-admin" };
const key = "false-alarm-feedback-engine-key";
const box = { x: 0.2, y: 0.2, width: 0.3, height: 0.5 };
function event(id: string, trackId?: string, overrides: Partial<AnalyticsEventInput> = {}): AnalyticsEventInput {
  return {
    tenantId: "omsystems", cameraId: "cam-001", sourceEventId: id,
    detectionType: "person", occurredAt: "2026-10-04T10:00:00.000Z", confidence: 0.95,
    durationSeconds: 2, modelVersion: "v1",
    objects: [{ label: "person", confidence: 0.95, trackId, boundingBox: box }], ...overrides,
  };
}
async function snapshot(red: number, green: number, blue: number) {
  return (await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: red, g: green, b: blue } } })
    .png().toBuffer()).toString("base64");
}

describe("false alarm object/scene feedback", () => {
  let store: MemoryStore;
  let app: FastifyInstance;
  beforeEach(async () => {
    store = new MemoryStore();
    await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
      name: "Person", detectionType: "person", enabled: true, objectClasses: [],
      minConfidence: 0.5, minDurationSeconds: 0, direction: "any", severity: "P2",
      cooldownSeconds: 60, recipients: [], recordingPolicy: "none", preRollSeconds: 5, postRollSeconds: 5,
    });
    app = Fastify();
    app.addHook("onRequest", async (request) => {
      request.currentUser = (await store.getUser("user-global-admin"))!;
    });
    await registerAnalyticsRoutes(app, store, { analyticsEngineSharedKey: key });
  });
  afterEach(async () => app?.close());
  const ingest = (input: AnalyticsEventInput) => app.inject({
    method: "POST", url: "/internal/analytics/events", headers: { "x-analytics-engine-key": key }, payload: input,
  });
  const mark = (id: string, expectedVersion = 1) => app.inject({
    method: "PATCH", url: `/v1/analytics/alerts/${id}`, headers: admin,
    payload: { status: "false_alarm", falseAlarmReason: "Chair misclassified", expectedVersion },
  });

  it("blocks a reviewed track past cooldown without notifications and allows a new track immediately", async () => {
    const first = await ingest(event("first", "chair-1"));
    const alert = first.json().alerts[0];
    const pending = store.analyticsNotifications.filter((item) => item.alertId === alert.id && ["queued", "failed"].includes(item.status));
    expect(pending.length).toBeGreaterThan(0);
    const reviewed = await mark(alert.id);
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({ status: "false_alarm", repeatSuppressionActive: true });
    expect(pending.every((item) => item.status === "cancelled")).toBe(true);
    const notificationCount = store.analyticsNotifications.length;
    const repeat = await ingest(event("repeat", "chair-1", { occurredAt: "2026-10-04T10:30:00.000Z" }));
    expect(repeat.json().event.status).toBe("suppressed");
    expect(repeat.json().alerts).toEqual([]);
    expect(store.analyticsNotifications).toHaveLength(notificationCount);
    expect(store.analyticsAlerts).toHaveLength(1);
    const fresh = await ingest(event("fresh", "visitor-2", { occurredAt: reviewed.json().resolvedAt }));
    expect(fresh.json().event.status).toBe("accepted");
    expect(fresh.json().alerts[0].status).toBe("new");
  });

  it("requires appearance as well as position for scenes without tracking", async () => {
    const original = await snapshot(70, 80, 90);
    const jitter = await snapshot(73, 82, 88);
    const changed = await snapshot(170, 80, 90);
    const first = await ingest(event("visual", undefined, { metadata: { snapshotBase64: original } }));
    expect((await mark(first.json().alerts[0].id)).json().repeatSuppressionActive).toBe(true);
    const repeat = await ingest(event("visual-repeat", undefined, {
      occurredAt: "2026-10-04T12:00:00.000Z", metadata: { snapshotBase64: jitter },
    }));
    expect(repeat.json().alerts).toEqual([]);
    const fresh = await ingest(event("visual-new", undefined, { metadata: { snapshotBase64: changed } }));
    expect(fresh.json().alerts).toHaveLength(1);
  });

  it("does not mute the type when identifying evidence is absent or corrupt", async () => {
    const first = await ingest(event("missing", undefined, { metadata: { snapshotBase64: "not-an-image" } }));
    expect((await mark(first.json().alerts[0].id)).json().repeatSuppressionActive).toBe(false);
    expect((await ingest(event("different-unknown"))).json().alerts).toHaveLength(1);
  });

  it("freezes the original reviewed evidence when other objects have coalesced into the alert", async () => {
    const first = await ingest(event("original", "chair"));
    await ingest(event("coalesced", "visitor"));
    await mark(first.json().alerts[0].id);
    expect((await ingest(event("chair-again", "chair"))).json().alerts).toEqual([]);
    expect((await ingest(event("visitor-again", "visitor"))).json().alerts).toHaveLength(1);
  });

  it("rejects stale reviews before saving feedback", async () => {
    const first = await ingest(event("stale", "chair"));
    const review = await mark(first.json().alerts[0].id, 99);
    expect(review.statusCode).toBe(409);
    expect(store.analyticsAlerts[0].status).toBe("new");
  });

  it("keeps additional objects, changed models, zones and tracker sessions alertable", async () => {
    const saved = await buildFalseAlarmSignature(event("saved", "1", { metadata: { trackerSessionId: "session-a", zoneId: "lobby" } }));
    for (const input of [
      event("session", "1", { metadata: { trackerSessionId: "session-b", zoneId: "lobby" } }),
      event("model", "1", { modelVersion: "v2", metadata: { trackerSessionId: "session-a", zoneId: "lobby" } }),
      event("zone", "1", { metadata: { trackerSessionId: "session-a", zoneId: "vault" } }),
      event("additional", "1", { metadata: { trackerSessionId: "session-a", zoneId: "lobby" }, objects: [
        ...event("base", "1").objects, { label: "person", confidence: 0.9, trackId: "2", boundingBox: box },
      ] }),
    ]) expect(matchesFalseAlarm(saved, await buildFalseAlarmSignature(input))).toBe(false);
  });

  it("requires unchanged visual evidence for scene-only detections", async () => {
    const original = event("scene", undefined, { objects: [], metadata: { snapshotBase64: await snapshot(50, 90, 130) } });
    const saved = await buildFalseAlarmSignature(original);
    expect(matchesFalseAlarm(saved, await buildFalseAlarmSignature({ ...original, sourceEventId: "scene-again" }))).toBe(true);
    expect(matchesFalseAlarm(saved, await buildFalseAlarmSignature({ ...original, metadata: { snapshotBase64: await snapshot(50, 190, 130) } }))).toBe(false);
    expect(matchesFalseAlarm(saved, await buildFalseAlarmSignature({ ...original, metadata: {} }))).toBe(false);
  });

  it("never carries feedback over to another camera", async () => {
    const first = await ingest(event("camera-one", "chair"));
    await mark(first.json().alerts[0].id);
    const { id, tenantId, cameraId, createdAt, updatedAt, createdBy, ...settings } = store.analyticsRules[0]!;
    await store.createAnalyticsRule("omsystems", "cam-002", "user-global-admin", {
      ...settings, name: "Camera two",
    });
    const other = await ingest(event("camera-two", "chair", { cameraId: "cam-002" }));
    expect(other.json().alerts).toHaveLength(1);
    expect(other.json().event.status).toBe("accepted");
  });
});
