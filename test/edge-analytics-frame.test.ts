import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { redisModule } from "../src/bootstrap/redis.module.js";

describe("edge analytics frame transport", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  const bridgeKey = "e".repeat(43);
  const analyticsKey = "a".repeat(43);
  const analyticsSourceKey = "s".repeat(43);

  beforeEach(async () => {
    vi.spyOn(redisModule, "getClient").mockReturnValue({
      set: vi.fn(async () => "OK"),
      get: vi.fn(async () => null),
    } as unknown as NonNullable<ReturnType<typeof redisModule.getClient>>);
    store = new MemoryStore();
    const agent = await store.registerEdgeAgent(store.cameras.get("cam-001")!.branchId, "AI edge", "0.1.4");
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
      helmetHdCaptureCameras: "cam-001",
    });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards an authenticated local RGB frame with the camera rule set", async () => {
    const agent = (await store.getEdgeAgent(store.cameras.get("cam-001")!.edgeAgentId!))!;
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

    expect(response.statusCode, response.body).toBe(202);
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
    expect(vi.mocked(redisModule.getClient)()!.set).toHaveBeenCalledWith("analytics:latest-frame:cam-001",
      expect.stringContaining('"width":64,"height":36'),{EX:90});
  });

  it("requests HD detail only for cameras with enabled helmet rules", async () => {
    const agent=(await store.getEdgeAgent(store.cameras.get("cam-001")!.edgeAgentId!))!;
    const get=async()=>{
      const response=await app.inject({method:"GET",url:`/v1/edge-agents/${agent.id}/cameras/monitoring`,
        headers:{"x-edge-bridge-key":bridgeKey,"x-edge-agent-version":"0.1.48"}});
      expect(response.statusCode,response.body).toBe(200);
      return response;
    };
    expect((await get()).json().data[0].analyticsResolution).toEqual({width:640,height:360});
    await store.createAnalyticsRule("omsystems","cam-001",undefined,{
      name:"Helmet",detectionType:"helmet-worn",enabled:true,objectClasses:["person"],minConfidence:.7,
      minDurationSeconds:0,direction:"any",severity:"P2",cooldownSeconds:60,recipients:[],
      recordingPolicy:"event-recording",preRollSeconds:30,postRollSeconds:120,
    });
    expect((await get()).json().data[0].analyticsResolution).toEqual({width:1280,height:720});
  });

  it("preserves JPEG encoding and dimensions through the control plane", async () => {
    const agent=(await store.getEdgeAgent(store.cameras.get("cam-001")!.edgeAgentId!))!;
    const response=await app.inject({method:"POST",url:`/v1/edge-agents/${agent.id}/analytics/frames`,
      headers:{"x-edge-bridge-key":bridgeKey},payload:{cameraId:"cam-001",capturedAt:new Date().toISOString(),
        width:1280,height:720,imageBase64:"jpeg-data",imageEncoding:"jpeg"}});
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body))).toMatchObject({
      imageEncoding:"jpeg",width:1280,height:720});
  });

  it("keeps another helmet camera outside the pilot allowlist at 640x360",async()=>{
    const first=store.cameras.get("cam-001")!;
    const second=store.cameras.get("cam-002")!;
    second.edgeAgentId=first.edgeAgentId;
    second.branchId=first.branchId;
    await store.createAnalyticsRule("omsystems","cam-002",undefined,{
      name:"Helmet",detectionType:"helmet-worn",enabled:true,objectClasses:["person"],minConfidence:.7,
      minDurationSeconds:0,direction:"any",severity:"P2",cooldownSeconds:60,recipients:[],
      recordingPolicy:"event-recording",preRollSeconds:30,postRollSeconds:120,
    });
    const response=await app.inject({method:"GET",url:`/v1/edge-agents/${first.edgeAgentId}/cameras/monitoring`,
      headers:{"x-edge-bridge-key":bridgeKey,"x-edge-agent-version":"0.1.48"}});
    expect(response.statusCode,response.body).toBe(200);
    expect(response.json().data.find((camera:{id:string})=>camera.id==="cam-002").analyticsResolution)
      .toEqual({width:640,height:360});
  });

  it("reports an event submission failure to the edge agent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      cameraId: "cam-001", eventsGenerated: 1, accepted: 0, failed: 1,
    }), { status: 202, headers: { "content-type": "application/json" } })));
    const agent = (await store.getEdgeAgent(store.cameras.get("cam-001")!.edgeAgentId!))!;
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
    expect(response.statusCode, response.body).toBe(502);
    expect(response.json()).toMatchObject({ error: "analytics_event_delivery_failed", failed: 1 });
  });
});
