import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAnalyticsEngine } from "../src/app.js";

const sourceKey = "source-key-that-is-long-enough-for-tests";
const controlPlaneKey = "control-plane-key-that-is-long-enough";

describe("analytics engine adapter", () => {
  const apps: Array<ReturnType<typeof buildAnalyticsEngine>> = [];
  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("reports missing model artifacts distinctly from the loaded cache", async () => {
    vi.stubEnv("ANALYTICS_REQUIRE_MODELS", "false");
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async () => ({}),
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "degraded",
      initializationError: null,
      pipeline: { initialized: true, models: { ready: false, required: 5, requiredReady: 0, loaded: 0 } },
    });
  });

  it("fails production readiness when required models are absent", async () => {
    vi.stubEnv("ANALYTICS_REQUIRE_MODELS", "true");
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async () => ({}),
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "unhealthy",
      initializationError: expect.stringContaining("Required analytics models are not ready"),
    });
  });

  it("normalizes an authenticated detection without owning the camera stream", async () => {
    const submitted: any[] = [];
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async (event) => {
        submitted.push(event);
        return { event: { id: "event-1", status: "accepted" }, alerts: [] };
      },
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST", url: "/internal/detections",
      headers: { "x-analytics-source-key": sourceKey },
      payload: {
        tenantId: "tenant-1", cameraId: "camera-1", detectionType: "person",
        confidence: 0.91, modelVersion: "person-v1",
        objects: [{ label: "person", confidence: 0.91 }],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      cameraId: "camera-1", detectionType: "person", durationSeconds: 0,
    });
    expect(submitted[0].sourceEventId).toBeTruthy();
  });

  it("rejects untrusted inference sources", async () => {
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async () => ({}),
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST", url: "/internal/detections", payload: {},
    });
    expect(response.statusCode).toBe(401);
  });

  it("accepts control-plane-authenticated frames without granting detection-source access", async () => {
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: controlPlaneKey,
      submit: async () => ({}),
    });
    apps.push(app);
    const frameResponse = await app.inject({
      method: "POST", url: "/internal/frames",
      headers: { "x-analytics-source-key": controlPlaneKey },
      payload: {
        tenantId: "tenant-1", cameraId: "camera-control-plane", width: 2, height: 2,
        imageBase64: Buffer.alloc(2 * 2 * 3, 127).toString("base64"),
        rules: [],
      },
    });
    expect(frameResponse.statusCode).toBe(202);

    const detectionResponse = await app.inject({
      method: "POST", url: "/internal/detections",
      headers: { "x-analytics-source-key": controlPlaneKey },
      payload: {},
    });
    expect(detectionResponse.statusCode).toBe(401);
  });

  it("turns open-model frame observations into tracked analytics events", async () => {
    const submitted: any[] = [];
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async (event) => { submitted.push(event); return { accepted: true }; },
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST", url: "/internal/frames",
      headers: { "x-analytics-source-key": sourceKey },
      payload: {
        tenantId: "tenant-1", cameraId: "camera-1", width: 1280, height: 720,
        detections: [{
          label: "person", confidence: 0.94,
          boundingBox: { x: 0.2, y: 0.1, width: 0.2, height: 0.7 },
        }],
        rules: [{
          id: "rule-person", cameraId: "camera-1", detectionType: "person",
          enabled: true, minConfidence: 0.65, minDurationSeconds: 0,
        }],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ detectionsReceived: 1, accepted: 1 });
    expect(submitted[0]).toMatchObject({ cameraId: "camera-1", detectionType: "person" });
    expect(submitted[0].objects[0].trackId).toBeTruthy();
  });

  it("turns specialized edge observations into a no-helmet event", async () => {
    const submitted: any[] = [];
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async (event) => { submitted.push(event); return { accepted: true }; },
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST", url: "/internal/frames",
      headers: { "x-analytics-source-key": sourceKey },
      payload: {
        tenantId: "tenant-1", cameraId: "camera-helmet", width: 1280, height: 720,
        detections: [
          { label: "person", confidence: 0.94, boundingBox: { x: 0.2, y: 0.1, width: 0.2, height: 0.7 } },
          { label: "motorcycle", confidence: 0.91, boundingBox: { x: 0.18, y: 0.45, width: 0.3, height: 0.3 } },
          { label: "head", confidence: 0.92, boundingBox: { x: 0.25, y: 0.12, width: 0.08, height: 0.12 } },
        ],
        rules: [{
          id: "rule-no-helmet", cameraId: "camera-helmet", detectionType: "no-helmet",
          enabled: true, minConfidence: 0.65, minDurationSeconds: 0,
        }],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ detectionType: "no-helmet", cameraId: "camera-helmet" });
  });

  it("uses the local ONNX path when frame observations are omitted", async () => {
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async () => ({ accepted: true }),
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST", url: "/internal/frames",
      headers: { "x-analytics-source-key": sourceKey },
      payload: {
        tenantId: "tenant-1", cameraId: "camera-local", width: 2, height: 2,
        imageBase64: Buffer.alloc(2 * 2 * 3, 127).toString("base64"),
        rules: [{
          id: "rule-object", cameraId: "camera-local", detectionType: "object",
          enabled: true, minConfidence: 0.65, minDurationSeconds: 0,
        }],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ inferenceMode: "local-onnx", detectionsReceived: 0 });
  });

  it("rejects a local frame that is not RGB24", async () => {
    const app = buildAnalyticsEngine({
      sourceSharedKey: sourceKey,
      controlPlaneSharedKey: "control-plane-key-that-is-long-enough",
      submit: async () => ({ accepted: true }),
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST", url: "/internal/frames",
      headers: { "x-analytics-source-key": sourceKey },
      payload: { tenantId: "tenant-1", cameraId: "camera-invalid", width: 2, height: 2 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_rgb24_frame" });
  });
});
