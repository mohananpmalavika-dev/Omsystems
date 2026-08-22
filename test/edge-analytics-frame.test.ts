import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("edge analytics frame transport", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  const bridgeKey = "e".repeat(43);
  const analyticsKey = "a".repeat(43);
  const analyticsSourceKey = "s".repeat(43);

  beforeEach(async () => {
    store = new MemoryStore();
    const agent = await store.registerEdgeAgent("branch-blr-001", "AI edge", "0.1.4");
    store.cameras.get("cam-001")!.edgeAgentId = agent.id;
    await store.createAnalyticsRule("omsystems", "cam-001", undefined, {
      name: "AI - Person detection",
      detectionType: "person",
      enabled: true,
      objectClasses: ["person"],
      minConfidence: 0.65,
      minDurationSeconds: 0,
      direction: "any",
      severity: "P3",
      cooldownSeconds: 60,
      recipients: [],
      recordingPolicy: "event-recording",
      preRollSeconds: 30,
      postRollSeconds: 120,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      cameraId: "cam-001",
      eventsGenerated: 1,
      accepted: 1,
      failed: 0,
    }), { status: 202, headers: { "content-type": "application/json" } })));
    app = await buildApp({
      store,
      authMode: "session",
      edgeBridgeSharedKey: bridgeKey,
      analyticsEngineSharedKey: analyticsKey,
      analyticsSourceSharedKey: analyticsSourceKey,
      analyticsEngineUrl: "http://analytics.example",
    });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  it("forwards an authenticated local RGB frame with the camera rule set", async () => {
    const agent = (await store.listEdgeAgentsByBranch("branch-blr-001"))[0]!;
    const response = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/analytics/frames`,
      headers: { "x-edge-bridge-key": bridgeKey },
      payload: {
        cameraId: "cam-001",
        capturedAt: "2026-08-09T12:00:00.000Z",
        width: 64,
        height: 36,
        imageBase64: Buffer.alloc(64 * 36 * 3).toString("base64"),
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: true,
      analytics: { cameraId: "cam-001", eventsGenerated: 1 },
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe("http://analytics.example/internal/frames");
    expect(init?.headers).toMatchObject({
      "x-analytics-source-key": analyticsSourceKey,
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ tenantId: "omsystems", cameraId: "cam-001" });
    expect(body.rules).toEqual([expect.objectContaining({ detectionType: "person", enabled: true })]);
  });
});
