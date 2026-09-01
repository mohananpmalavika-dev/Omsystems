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

  it("enables the complete camera-ready AI bundle across a branch idempotently", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/v1/branches/A005/analytics/enable-all-cameras",
      headers: admin,
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      cameraCount: 9,
      capabilityCount: 15,
      created: 135,
      enabled: 0,
      unchanged: 0,
    });
    expect(first.json().setupRequired).toEqual(expect.arrayContaining([
      "line-crossing", "intrusion", "loitering", "face-recognition", "watchlist-match",
    ]));

    const second = await app.inject({
      method: "POST",
      url: "/v1/branches/A005/analytics/enable-all-cameras",
      headers: admin,
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      cameraCount: 9,
      capabilityCount: 15,
      created: 0,
      enabled: 0,
      unchanged: 135,
    });
  });

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
    expect(store.analyticsNotifications.map((item) => item.channel).sort()).toEqual([
      "dashboard", "email", "sms", "voice",
    ]);

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

  it("correlates generic ANPR readings with the central plate registry", async () => {
    const watchlistResponse = await app.inject({
      method: "POST",
      url: "/v1/analytics/anpr-watchlists",
      headers: admin,
      payload: {
        name: "Stolen vehicles",
        listType: "stolen",
        alertOnMatch: true,
        alertSeverity: "P1",
        alertAuthorities: false,
      },
    });
    expect(watchlistResponse.statusCode).toBe(201);
    const watchlistId = watchlistResponse.json().data.id as string;

    const plateResponse = await app.inject({
      method: "POST",
      url: `/v1/analytics/anpr-watchlists/${watchlistId}/plates`,
      headers: admin,
      payload: {
        plateNumber: "KL 07 AB 1234",
        countryCode: "IN",
        reason: "Reported stolen",
      },
    });
    expect(plateResponse.statusCode).toBe(201);
    const plateId = plateResponse.json().data.id as string;

    const ruleResponse = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/analytics/rules",
      headers: admin,
      payload: {
        name: "Registered plate match",
        detectionType: "watchlist-match",
        objectClasses: ["license-plate"],
        minConfidence: 0.7,
        severity: "P1",
        cooldownSeconds: 0,
        recordingPolicy: "event-recording",
      },
    });
    expect(ruleResponse.statusCode).toBe(201);

    const payload = {
      tenantId: "omsystems",
      cameraId: "cam-001",
      sourceEventId: "generic-anpr-registry-match",
      detectionType: "anpr",
      occurredAt: "2026-08-31T10:00:00.000Z",
      confidence: 0.94,
      durationSeconds: 0,
      modelVersion: "generic-anpr-v1",
      objects: [{ label: "license-plate", confidence: 0.94 }],
      metadata: {
        readings: [{ plateNumber: "kl07ab1234", confidence: 0.94, countryCode: "IN" }],
      },
    };
    const detection = await app.inject({
      method: "POST",
      url: "/internal/analytics/events",
      headers: { "x-analytics-engine-key": engineKey },
      payload,
    });
    expect(detection.statusCode).toBe(202);
    expect(detection.json().event).toMatchObject({
      detectionType: "anpr",
      status: "accepted",
      metadata: {
        matches: [{
          plateId,
          plateNumber: "KL07AB1234",
          watchlistId,
          watchlistName: "Stolen vehicles",
          reason: "Reported stolen",
          alertOnMatch: true,
        }],
      },
    });
    expect(detection.json().alerts).toEqual([
      expect.objectContaining({
        ruleId: ruleResponse.json().id,
        title: "Watchlist match detected",
        severity: "P1",
      }),
    ]);

    const duplicate = await app.inject({
      method: "POST",
      url: "/internal/analytics/events",
      headers: { "x-analytics-engine-key": engineKey },
      payload,
    });
    expect(duplicate.json().event.status).toBe("duplicate");

    const plates = await app.inject({
      method: "GET",
      url: `/v1/analytics/anpr-watchlists/${watchlistId}/plates`,
      headers: admin,
    });
    expect(plates.json().data).toEqual([
      expect.objectContaining({ id: plateId, matchCount: 1, lastMatchedAt: payload.occurredAt }),
    ]);

    const events = await app.inject({
      method: "GET",
      url: "/v1/analytics/anpr-events?plateNumber=KL07AB1234&justification=active-investigation",
      headers: admin,
    });
    expect(events.statusCode).toBe(200);
    expect(events.json().data).toEqual([
      expect.objectContaining({
        plateId,
        plateNumber: "KL07AB1234",
        watchlistId,
        watchlistName: "Stolen vehicles",
      }),
    ]);
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
      method: "GET", url: "/v1/analytics/alerts?branchId=A005",
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

  it("returns a batched, permission-filtered live-wall AI snapshot", async () => {
    const rule = await store.createAnalyticsRule(
      "omsystems", "cam-001", "user-global-admin",
      {
        name: "Live wall person", detectionType: "person", enabled: true,
        objectClasses: ["person"], minConfidence: 0.5, minDurationSeconds: 0,
        direction: "any", severity: "P2", cooldownSeconds: 0,
        recipients: [], recordingPolicy: "none",
        preRollSeconds: 30, postRollSeconds: 120,
      },
    );
    await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "wall-event",
      detectionType: "person", occurredAt: new Date().toISOString(),
      confidence: 0.92, durationSeconds: 1, modelVersion: "people-v1",
      objects: [{ label: "person", confidence: 0.92 }],
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/analytics/live-wall?cameraIds=cam-001,cam-a006-01&limit=50",
      headers: { "x-user-id": "user-south-operator" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      cameraIds: ["cam-001"],
      rules: [expect.objectContaining({ id: rule.id, cameraId: "cam-001" })],
      alerts: [expect.objectContaining({ cameraId: "cam-001", confidence: 0.92 })],
      summary: { total: 1, open: 1, highPriority: 1 },
    });
  });

  it("protects fleetwide SOC metrics and validates lifecycle ingestion", async () => {
    const denied = await app.inject({
      method: "GET",
      url: "/v1/analytics/soc/summary",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(denied.statusCode).toBe(403);

    const invalidRange = await app.inject({
      method: "GET",
      url: "/v1/analytics/soc/summary?period=CUSTOM&startDate=2026-08-31T11%3A00%3A00.000Z&endDate=2026-08-31T10%3A00%3A00.000Z",
      headers: admin,
    });
    expect(invalidRange.statusCode).toBe(400);

    const triggeredAt = new Date();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analytics/soc/incident-event",
      headers: admin,
      payload: {
        incidentId: "INC-SOC-001",
        priority: "P1",
        alertType: "ANPR_BLACKLIST",
        branchId: "A005",
        branchName: "South Region",
        regionId: "REG-SOUTH",
        regionName: "South",
        stateId: "KL",
        operatorId: "user-global-admin",
        operatorName: "Global Admin",
        operatorRole: "CHIEF_SECURITY_OFFICER",
        shift: "NIGHT",
        triggeredAt: triggeredAt.toISOString(),
        acknowledgedAt: new Date(triggeredAt.getTime() + 8_000).toISOString(),
        investigationStartedAt: new Date(triggeredAt.getTime() + 20_000).toISOString(),
        resolvedAt: new Date(triggeredAt.getTime() + 90_000).toISOString(),
      },
    });
    expect(created.statusCode).toBe(201);

    const summary = await app.inject({
      method: "GET",
      url: "/v1/analytics/soc/summary?period=LAST_24_HOURS",
      headers: admin,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().data.fleetSummary).toMatchObject({
      totalIncidents: 1,
      p1Count: 1,
      mttaSeconds: 8,
      mttrSeconds: 90,
    });
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

  it("reports the requested branch and exports real analytics rows as safe CSV", async () => {
    await store.createAnalyticsRule(
      "omsystems", "cam-001", "user-global-admin",
      {
        name: "Entrance footfall", detectionType: "footfall", enabled: true,
        objectClasses: ["person"], minConfidence: 0.5, minDurationSeconds: 0,
        direction: "any", severity: "P1", cooldownSeconds: 0,
        recipients: [], recordingPolicy: "none",
        preRollSeconds: 30, postRollSeconds: 120,
      },
    );
    const observedAt = new Date().toISOString();
    const detection = await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "dashboard-footfall",
      detectionType: "footfall", occurredAt: observedAt,
      confidence: 0.91, durationSeconds: 1, modelVersion: "footfall-local-v1",
      objects: [{ label: "person", confidence: 0.91 }],
    });
    detection.alerts[0]!.title = "=unsafe spreadsheet formula";

    const summary = await app.inject({
      method: "GET", url: "/v1/branches/A005/analytics/summary", headers: admin,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      totalAlerts: 1,
      criticalAlerts: 1,
      resolvedAlerts: 0,
      totalFootfall: 1,
      activeRules: 1,
      totalEvents: 1,
      truncated: false,
      eventsByType: { footfall: 1 },
      branch: { id: "A005", eventCount: 1 },
    });
    expect(summary.json().averageDwellTime).toBeNull();

    const missing = await app.inject({
      method: "GET", url: "/v1/branches/not-a-real-branch/analytics/summary", headers: admin,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe("branch_not_found");

    const exported = await app.inject({
      method: "GET", url: "/v1/branches/A005/analytics/export/csv", headers: admin,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.headers["content-disposition"]).toContain("analytics-A005.csv");
    expect(exported.body).toContain('"footfall"');
    expect(exported.body).toContain('"\'=unsafe spreadsheet formula"');
    expect(store.auditEvents).toContainEqual(expect.objectContaining({
      action: "analytics.summary_exported", resourceNodeId: "A005",
    }));
  });

  it("builds camera metric series only from persisted detector events", async () => {
    for (const detectionType of ["line-crossing", "loitering", "queue"] as const) {
      await store.createAnalyticsRule(
        "omsystems", "cam-001", "user-global-admin",
        {
          name: `Metric ${detectionType}`, detectionType, enabled: true,
          objectClasses: ["person"], minConfidence: 0.5, minDurationSeconds: 0,
          direction: "any", severity: "P4", cooldownSeconds: 0,
          recipients: [], recordingPolicy: "none",
          preRollSeconds: 0, postRollSeconds: 30,
        },
      );
    }

    const inputs = [
      { sourceEventId: "metric-entry", detectionType: "line-crossing", occurredAt: "2026-08-30T10:05:00.000Z", durationSeconds: 0, metadata: { direction: "a-to-b" }, objects: [{ label: "person", confidence: 0.9 }] },
      { sourceEventId: "metric-exit", detectionType: "line-crossing", occurredAt: "2026-08-30T10:35:00.000Z", durationSeconds: 0, metadata: { direction: "b-to-a" }, objects: [{ label: "person", confidence: 0.9 }] },
      { sourceEventId: "metric-dwell-1", detectionType: "loitering", occurredAt: "2026-08-30T10:15:00.000Z", durationSeconds: 30, metadata: { dwellTimeSeconds: 30 }, objects: [{ label: "person", confidence: 0.9 }] },
      { sourceEventId: "metric-dwell-2", detectionType: "loitering", occurredAt: "2026-08-30T10:45:00.000Z", durationSeconds: 90, metadata: { dwellTimeSeconds: 90 }, objects: [{ label: "person", confidence: 0.9 }] },
      { sourceEventId: "metric-queue", detectionType: "queue", occurredAt: "2026-08-30T10:25:00.000Z", durationSeconds: 0, metadata: { queues: [{ length: 3 }, { queueLength: 5 }] }, objects: [] },
    ];
    for (const input of inputs) {
      await store.processAnalyticsEvent({
        tenantId: "omsystems", cameraId: "cam-001", confidence: 0.9,
        modelVersion: "metric-test-v1", ...input,
      });
    }

    const range = "from=2026-08-30T10%3A00%3A00.000Z&to=2026-08-30T11%3A00%3A00.000Z&interval=hour";
    const [footfall, dwell, queue, empty] = await Promise.all([
      app.inject({ method: "GET", url: `/v1/cameras/cam-001/analytics/footfall?${range}`, headers: admin }),
      app.inject({ method: "GET", url: `/v1/cameras/cam-001/analytics/dwell-time?${range}`, headers: admin }),
      app.inject({ method: "GET", url: `/v1/cameras/cam-001/analytics/queue?${range}`, headers: admin }),
      app.inject({ method: "GET", url: `/v1/cameras/cam-a006-01/analytics/footfall?${range}`, headers: admin }),
    ]);

    expect(footfall.statusCode).toBe(200);
    expect(footfall.json()).toMatchObject({
      basis: "persisted_analytics_events", truncated: false,
      data: [{ entries: 1, exits: 1, total_crossings: 2 }],
    });
    expect(dwell.json().data).toEqual([expect.objectContaining({
      average_seconds: 60, maximum_seconds: 90, sample_count: 2,
    })]);
    expect(queue.json().data).toEqual([expect.objectContaining({
      average_count: 4, maximum_count: 5,
    })]);
    expect(empty.json().data).toEqual([]);
  });
});
