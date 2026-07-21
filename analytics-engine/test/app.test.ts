import { afterEach, describe, expect, it } from "vitest";
import { buildAnalyticsEngine } from "../src/app.js";

const sourceKey = "source-key-that-is-long-enough-for-tests";

describe("analytics engine adapter", () => {
  const apps: Array<ReturnType<typeof buildAnalyticsEngine>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

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
});
