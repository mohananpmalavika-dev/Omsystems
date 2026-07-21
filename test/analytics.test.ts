import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const engineKey = "analytics-engine-key-long-enough-for-testing";
const admin = { "x-user-id": "user-global-admin" };

describe("video analytics and alert workflow", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store, analyticsEngineSharedKey: engineKey });
  });

  afterEach(async () => app.close());

  it("configures a camera rule and converts an authenticated detection into protected evidence", async () => {
    const ruleResponse = await app.inject({
      method: "POST", url: "/v1/cameras/cam-001/analytics/rules",
      headers: admin,
      payload: {
        name: "Restricted entrance person", detectionType: "person",
        objectClasses: ["person"], minConfidence: 0.7,
        minDurationSeconds: 2, severity: "P1", cooldownSeconds: 60,
        recipients: ["soc@example.com"], recordingPolicy: "protect-window",
        preRollSeconds: 30, postRollSeconds: 120,
        zone: {
          name: "Entrance", shape: "polygon",
          points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }],
        },
      },
    });
    expect(ruleResponse.statusCode).toBe(201);
    expect(ruleResponse.json()).toMatchObject({
      cameraId: "cam-001", detectionType: "person", severity: "P1",
    });

    const detection = await app.inject({
      method: "POST", url: "/internal/analytics/events",
      headers: { "x-analytics-engine-key": engineKey },
      payload: {
        tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "edge-evt-001",
        detectionType: "person", occurredAt: "2026-07-21T10:00:00.000Z",
        confidence: 0.93, durationSeconds: 4, modelVersion: "people-v1.3",
        objects: [{ label: "person", confidence: 0.93, trackId: "track-9" }],
        metadata: { zoneId: ruleResponse.json().zone.id },
      },
    });
    expect(detection.statusCode).toBe(202);
    expect(detection.json().event.status).toBe("accepted");
    expect(detection.json().alerts).toHaveLength(1);
    expect(detection.json().alerts[0]).toMatchObject({
      status: "new", severity: "P1", occurrenceCount: 1,
    });
    expect(detection.json().alerts[0].incidentId).toBeTruthy();
    expect(store.recordingLegalHolds).toHaveLength(1);
    expect(store.analyticsNotifications).toHaveLength(1);

    const cooldownDetection = await app.inject({
      method: "POST", url: "/internal/analytics/events",
      headers: { "x-analytics-engine-key": engineKey },
      payload: {
        tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "edge-evt-002",
        detectionType: "person", occurredAt: "2026-07-21T10:00:20.000Z",
        confidence: 0.88, durationSeconds: 3, modelVersion: "people-v1.3",
        objects: [{ label: "person", confidence: 0.88 }],
      },
    });
    expect(cooldownDetection.statusCode).toBe(202);
    expect(cooldownDetection.json().event.status).toBe("suppressed");
    expect(store.analyticsAlerts).toHaveLength(1);
    expect(store.analyticsAlerts[0]?.occurrenceCount).toBe(2);
    expect(store.recordingLegalHolds).toHaveLength(1);
  });

  it("enforces analytics permissions and records alert acknowledgement and escalation", async () => {
    const rule = await store.createAnalyticsRule(
      "omsystems", "cam-001", "user-global-admin",
      {
        name: "Person", detectionType: "person", enabled: true,
        objectClasses: [], minConfidence: 0.5, minDurationSeconds: 0,
        direction: "any", severity: "P2", cooldownSeconds: 0,
        recipients: [], recordingPolicy: "none",
        preRollSeconds: 30, postRollSeconds: 120,
      },
    );
    const result = await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "event-permissions",
      detectionType: "person", occurredAt: "2026-07-21T11:00:00.000Z",
      confidence: 0.9, durationSeconds: 1, modelVersion: "v1", objects: [],
    });
    expect(result.rules[0]?.id).toBe(rule.id);
    const alert = result.alerts[0]!;

    const operatorList = await app.inject({
      method: "GET", url: "/v1/analytics/alerts?branchId=branch-blr-001",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(operatorList.statusCode).toBe(200);
    expect(operatorList.json().data).toHaveLength(1);

    const acknowledgement = await app.inject({
      method: "POST", url: `/v1/analytics/alerts/${alert.id}/acknowledge`,
      headers: { "x-user-id": "user-south-operator" },
      payload: { notes: "Checked live camera" },
    });
    expect(acknowledgement.statusCode).toBe(200);
    expect(acknowledgement.json().status).toBe("acknowledged");
    expect(store.analyticsAcknowledgements).toHaveLength(1);

    const deniedEscalation = await app.inject({
      method: "POST", url: `/v1/analytics/alerts/${alert.id}/escalate`,
      headers: { "x-user-id": "user-south-operator" }, payload: {},
    });
    expect(deniedEscalation.statusCode).toBe(403);

    const escalation = await app.inject({
      method: "POST", url: `/v1/analytics/alerts/${alert.id}/escalate`,
      headers: admin, payload: { recipients: ["regional-soc"] },
    });
    expect(escalation.statusCode).toBe(200);
    expect(escalation.json().status).toBe("escalated");
    expect(store.analyticsEscalations).toHaveLength(1);
  });

  it("rejects untrusted events and treats repeated source IDs idempotently", async () => {
    const denied = await app.inject({
      method: "POST", url: "/internal/analytics/events", payload: {},
    });
    expect(denied.statusCode).toBe(401);

    const payload = {
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "same-source-id",
      detectionType: "vehicle", occurredAt: "2026-07-21T12:00:00.000Z",
      confidence: 0.8, durationSeconds: 1, modelVersion: "vehicles-v1", objects: [],
    };
    const first = await app.inject({
      method: "POST", url: "/internal/analytics/events",
      headers: { "x-analytics-engine-key": engineKey }, payload,
    });
    const second = await app.inject({
      method: "POST", url: "/internal/analytics/events",
      headers: { "x-analytics-engine-key": engineKey }, payload,
    });
    expect(first.json().event.status).toBe("unmatched");
    expect(second.json().event.status).toBe("duplicate");
    expect(store.analyticsEvents).toHaveLength(1);
  });
});
