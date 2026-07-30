import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const admin = { "x-user-id": "user-global-admin" };
const operator = { "x-user-id": "user-south-operator" };
const branchId = "branch-blr-001";
const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2l9sAAAAASUVORK5CYII=";

describe("operational Digital Twin", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let assetRoot: string;
  let floorId: string;

  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "sentinel-digital-twin-"));
    store = new MemoryStore();
    app = await buildApp({ store, digitalTwinAssetRoot: assetRoot });
    const response = await app.inject({
      method: "POST",
      url: `/v1/digital-twin/branches/${branchId}/bootstrap`,
      headers: admin,
    });
    expect(response.statusCode).toBe(200);
    floorId = response.json().floor.id;
  });

  afterEach(async () => {
    await app.close();
    await rm(assetRoot, { recursive: true, force: true });
  });

  it("scopes the fleet and protects configuration operations", async () => {
    const fleet = await app.inject({ method: "GET", url: "/v1/digital-twin/branches", headers: operator });
    expect(fleet.statusCode).toBe(200);
    expect(fleet.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ branch: expect.objectContaining({ id: branchId }), configured: true }),
    ]));

    const readable = await app.inject({ method: "GET", url: `/v1/digital-twin/floors/${floorId}/state`, headers: operator });
    expect(readable.statusCode).toBe(200);
    expect(readable.json().permissions).toMatchObject({ canView: true, canEdit: false });

    const denied = await app.inject({
      method: "POST", url: "/v1/digital-twin/objects", headers: operator,
      payload: { floorId, objectType: "door", name: "Main door", positionX: 0.4, positionY: 0.5 },
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.json().error).toBe("branch_not_found");

    const live = await app.inject({ method: "GET", url: `/v1/digital-twin/branches/${branchId}/live`, headers: admin });
    const firstFloor = await app.inject({
      method: "POST", url: "/v1/digital-twin/floors", headers: admin,
      payload: { buildingId: live.json().building.id, floorNumber: 1, name: "First Floor" },
    });
    expect(firstFloor.statusCode).toBe(201);
    const duplicate = await app.inject({
      method: "POST", url: "/v1/digital-twin/floors", headers: admin,
      payload: { buildingId: live.json().building.id, floorNumber: 1, name: "Duplicate" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe("floor_number_exists");
    const floorAudit = await app.inject({ method: "GET", url: `/v1/digital-twin/floors/${firstFloor.json().id}/audit`, headers: admin });
    expect(floorAudit.json()).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "floor", action: "create" })]));
  });

  it("versions validated floor plans without changing normalized placements", async () => {
    const camera = await createObject({
      objectType: "camera", name: "ATM entrance", positionX: 0.42, positionY: 0.68,
      rotation: 115, fieldOfView: 92, showFieldOfView: true,
      binding: { deviceType: "camera", deviceId: "cam-001" },
    });

    const first = await uploadPlan("ground-v1.png");
    expect(first.version).toBe(1);
    const content = await app.inject({ method: "GET", url: first.contentUrl, headers: admin });
    expect(content.statusCode).toBe(200);
    expect(content.headers["content-type"]).toContain("image/png");
    expect(content.rawPayload.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(await readFile(join(assetRoot, first.storageKey))).toHaveLength(content.rawPayload.length);

    const second = await uploadPlan("ground-v2.png");
    expect(second.version).toBe(2);
    const versions = await app.inject({ method: "GET", url: `/v1/digital-twin/floors/${floorId}/floor-plan-versions`, headers: admin });
    expect(versions.json().map((item: { version: number }) => item.version)).toEqual([2, 1]);

    const state = await floorState();
    expect(state.floorPlan.id).toBe(second.id);
    expect(state.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: camera.id, positionX: 0.42, positionY: 0.68, rotation: 115 }),
    ]));

    const invalid = await app.inject({
      method: "POST", url: "/v1/digital-twin/floor-plans", headers: admin,
      payload: { floorId, contentType: "image/svg+xml", originalFilename: "unsafe.svg", dataBase64: Buffer.from('<svg><script>alert(1)</script></svg>').toString("base64") },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error).toBe("unsafe_svg_content");
  });

  it("projects live camera health and lets newer telemetry supersede old events", async () => {
    const camera = await createObject({
      objectType: "camera", name: "Vault camera", positionX: 0.25, positionY: 0.3,
      binding: { deviceType: "camera", deviceId: "cam-001" },
    });
    await ingestTelemetry("2026-07-30T09:00:00.000Z", { status: "online", reachable: true, recordingStatus: "not_recording" });
    expect((await floorState()).objects.find((item: { id: string }) => item.id === camera.id).currentStatus).toMatchObject({
      color: "yellow", online: true, recording: false,
    });

    await postEvent(camera.id, "camera_offline", "offline", "critical", "camera-state-old", "2026-07-30T09:01:00.000Z");
    expect((await floorState()).objects.find((item: { id: string }) => item.id === camera.id).currentStatus.color).toBe("red");

    await ingestTelemetry("2026-07-30T09:02:00.000Z", { status: "online", reachable: true, recordingStatus: "recording" });
    expect((await floorState()).objects.find((item: { id: string }) => item.id === camera.id).currentStatus).toMatchObject({
      color: "green", online: true, recording: true,
    });
  });

  it("maps door events, alerts, heat maps, timeline playback and acknowledgement", async () => {
    const door = await createObject({ objectType: "door", name: "Strong-room door", positionX: 0.7, positionY: 0.2 });
    const event = await postEvent(door.id, "door_forced", "forced_entry", "critical", "access-evt-001", "2026-07-30T10:02:00.000Z");
    expect(event.statusCode).toBe(202);
    expect(event.json().duplicate).toBe(false);

    const duplicate = await postEvent(door.id, "door_forced", "forced_entry", "critical", "access-evt-001", "2026-07-30T10:02:00.000Z");
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);

    const state = await floorState("operational");
    expect(state.objects.find((item: { id: string }) => item.id === door.id).currentStatus).toMatchObject({ color: "red", state: "forced_entry" });
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]).toMatchObject({ twinObjectId: door.id, severity: "critical", positionX: 0.7, positionY: 0.2 });
    expect(state.heatmap).toMatchObject({ type: "operational", totalEvents: 1 });
    expect(state.heatmap.points[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number), intensity: 1 });
    const doorHeat = await floorState("door_usage");
    expect(doorHeat.heatmap).toMatchObject({ type: "door_usage", totalEvents: 1 });
    expect(doorHeat.heatmap.points[0]).toMatchObject({ intensity: 1 });

    const timeline = await app.inject({
      method: "GET",
      url: `/v1/digital-twin/floors/${floorId}/timeline?from=2026-07-30T00:00:00.000Z&to=2026-07-30T23:59:59.999Z`,
      headers: operator,
    });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json()).toEqual(expect.arrayContaining([expect.objectContaining({ type: "door_forced", objectId: door.id })]));

    const playback = await app.inject({
      method: "GET", url: `/v1/digital-twin/floors/${floorId}/playback?at=2026-07-30T10:03:00.000Z`, headers: operator,
    });
    expect(playback.statusCode).toBe(200);
    expect(playback.json().objects.find((item: { id: string }) => item.id === door.id).currentStatus.state).toBe("forced_entry");

    const acknowledge = await app.inject({
      method: "POST", url: `/v1/digital-twin/alerts/${state.alerts[0].id}/acknowledge`, headers: operator, payload: { floorId },
    });
    expect(acknowledge.statusCode).toBe(200);
    expect(acknowledge.json().acknowledgedAt).toBeTruthy();
    const resolve = await app.inject({
      method: "POST", url: `/v1/digital-twin/alerts/${state.alerts[0].id}/resolve`, headers: operator, payload: { floorId },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().resolvedAt).toBeTruthy();
    expect((await floorState()).alerts).toHaveLength(0);
  });

  it("projects AI alerts at the bound camera in live state and historical replay", async () => {
    const camera = await createObject({
      objectType: "camera", name: "Vault entrance camera", positionX: 0.62, positionY: 0.44,
      binding: { deviceType: "camera", deviceId: "cam-001" },
    });
    await store.createAnalyticsRule("omsystems", "cam-001", "user-global-admin", {
      name: "Restricted person", detectionType: "person", enabled: true, objectClasses: ["person"],
      minConfidence: 0.7, minDurationSeconds: 0, direction: "any", severity: "P1", cooldownSeconds: 0,
      recipients: [], recordingPolicy: "none", preRollSeconds: 30, postRollSeconds: 120,
    });
    const detectedAt = "2026-07-30T11:00:00.000Z";
    const result = await store.processAnalyticsEvent({
      tenantId: "omsystems", cameraId: "cam-001", sourceEventId: "twin-ai-event", detectionType: "person",
      occurredAt: detectedAt, confidence: 0.94, durationSeconds: 2, modelVersion: "person-v2", objects: [{ label: "person", confidence: 0.94 }],
    });
    expect(result.alerts).toHaveLength(1);

    const state = await floorState("people_security");
    expect(state.objects.find((item: { id: string }) => item.id === camera.id).currentStatus).toMatchObject({ color: "purple", analyticsActive: true });
    const marker = state.alerts.find((item: { sourceAlertId?: string }) => item.sourceAlertId === result.alerts[0]!.id);
    expect(marker).toMatchObject({ twinObjectId: camera.id, positionX: 0.62, positionY: 0.44, severity: "critical" });
    expect(marker.metadata.cameraProjection).toBe("camera-location approximation");
    expect(state.heatmap.totalEvents).toBe(1);

    const playback = await app.inject({
      method: "GET", url: `/v1/digital-twin/floors/${floorId}/playback?at=2026-07-30T11:01:00.000Z`, headers: operator,
    });
    expect(playback.statusCode).toBe(200);
    expect(playback.json().objects.find((item: { id: string }) => item.id === camera.id).currentStatus.color).toBe("purple");
    expect(playback.json().alerts).toEqual(expect.arrayContaining([expect.objectContaining({ sourceAlertId: result.alerts[0]!.id })]));
  });

  it("draws normalized zones, rejects out-of-bounds placement and orders nearby cameras", async () => {
    const source = await createObject({ objectType: "camera", name: "ATM", positionX: 0.1, positionY: 0.1, binding: { deviceType: "camera", deviceId: "cam-001" } });
    const nearest = await createObject({ objectType: "camera", name: "Teller", positionX: 0.2, positionY: 0.1, binding: { deviceType: "camera", deviceId: "cam-002" } });
    await createObject({ objectType: "camera", name: "Vault", positionX: 0.9, positionY: 0.9 });

    const zone = await app.inject({
      method: "POST", url: "/v1/digital-twin/zones", headers: admin,
      payload: { floorId, name: "Restricted corridor", zoneType: "restricted", isRestricted: true, alertOnEntry: true, vertices: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.4 }] },
    });
    expect(zone.statusCode).toBe(201);
    expect(zone.json()).toMatchObject({ isRestricted: true, alertOnEntry: true });

    const nearby = await app.inject({ method: "GET", url: `/v1/digital-twin/objects/${source.id}/nearby-cameras?limit=1`, headers: operator });
    expect(nearby.statusCode).toBe(200);
    expect(nearby.json()[0]).toMatchObject({ id: nearest.id, distance: 0.1 });

    const invalid = await app.inject({
      method: "PATCH", url: `/v1/digital-twin/objects/${source.id}/position`, headers: admin,
      payload: { positionX: 1.01, positionY: 0.5 },
    });
    expect(invalid.statusCode).toBe(400);

    const audit = await app.inject({ method: "GET", url: `/v1/digital-twin/floors/${floorId}/audit`, headers: admin });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: "zone", action: "create" }),
      expect.objectContaining({ entityType: "object", action: "create" }),
    ]));
  });

  it("keeps one branch-scoped binding per device and does not leave failed placements", async () => {
    const first = await createObject({
      objectType: "smoke_sensor", name: "Smoke sensor 1", positionX: 0.2, positionY: 0.2,
      binding: { deviceType: "sensor", deviceId: "sensor-7" },
    });
    const duplicate = await app.inject({
      method: "POST", url: "/v1/digital-twin/objects", headers: admin,
      payload: { floorId, objectType: "smoke_sensor", name: "Duplicate sensor", positionX: 0.4, positionY: 0.4, binding: { deviceType: "sensor", deviceId: "sensor-7" } },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe("device_already_bound");
    expect((await floorState()).objects).toHaveLength(1);

    const rebind = await app.inject({
      method: "POST", url: "/v1/digital-twin/device-bindings", headers: admin,
      payload: { twinObjectId: first.id, deviceType: "sensor", deviceId: "sensor-8" },
    });
    expect(rebind.statusCode).toBe(200);
    expect(rebind.json()).toMatchObject({ tenantId: "omsystems", branchId, deviceId: "sensor-8" });
    expect((await floorState()).objects[0].binding.deviceId).toBe("sensor-8");
  });

  async function createObject(input: Record<string, unknown>) {
    const response = await app.inject({ method: "POST", url: "/v1/digital-twin/objects", headers: admin, payload: { floorId, ...input } });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  async function uploadPlan(name: string) {
    const response = await app.inject({
      method: "POST", url: "/v1/digital-twin/floor-plans", headers: admin,
      payload: { floorId, contentType: "image/png", originalFilename: name, dataBase64: tinyPng, widthPixels: 1, heightPixels: 1, scaleMetersPerPixel: 0.05 },
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  async function ingestTelemetry(observedAt: string, metrics: Record<string, string | boolean | number | null>) {
    await store.ingestOperationalTelemetry({
      tenantId: "omsystems", branchId, edgeAgentId: "edge-agent-blr", deviceType: "camera", deviceId: "cam-001",
      observedAt, receivedAt: observedAt, source: "system", quality: "verified", idempotencyKey: `camera:${observedAt}`,
      metrics, reasonCodes: [],
    });
  }

  function postEvent(objectId: string, eventType: string, state: string, severity: string, idempotencyKey: string, occurredAt: string) {
    return app.inject({
      method: "POST", url: "/v1/digital-twin/events", headers: admin,
      payload: { floorId, twinObjectId: objectId, eventType, state, severity, source: "access-control", idempotencyKey, occurredAt },
    });
  }

  async function floorState(heatmap?: string) {
    const query = heatmap ? `?heatmap=${heatmap}` : "";
    const response = await app.inject({ method: "GET", url: `/v1/digital-twin/floors/${floorId}/state${query}`, headers: admin });
    expect(response.statusCode).toBe(200);
    return response.json();
  }
});
