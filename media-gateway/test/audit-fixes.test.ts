import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildMediaGateway } from "../src/app.js";
import { buildEdgeLiveGateway, type EdgeLiveGateway } from "../../edge-agent/src/streaming/edge-live-gateway.js";
import { TalkSessionRegistry } from "../../edge-agent/src/talkback/talk-session-registry.js";
import { signTalkBridgeGrant } from "../src/talk-bridge-grant.js";

const grant = { id: "talk-1", cameraId: "camera-1", cameraNodeId: "node-1", userId: "user-1", tenantId: "tenant-1",
  purpose: "talk" as const, connectionSecretRef: "secret://camera", profiles: [] };
const key = "audit-bridge-key";
let gateway: FastifyInstance | undefined;
let edge: EdgeLiveGateway | undefined;
afterEach(async () => { await gateway?.close(); await edge?.close(); gateway = undefined; edge = undefined; vi.restoreAllMocks(); });

async function setupEdge() {
  const consume = vi.fn(async () => { throw new Error("control-plane token was already consumed"); });
  const writePcm = vi.fn(async () => undefined);
  edge = buildEdgeLiveGateway({ consumer: { consume }, router: { ensurePath: async () => {}, removePath: async () => {} },
    resolveSecret: async () => "rtsp://camera/live", edgeBridgeSharedKey: key, publicBaseUrl: () => edgeUrl,
    mediaMtxHlsUrl: "http://unused", accessTtlMs: 60_000,
    talkSessions: new TalkSessionRegistry(60_000, async () => {}, async () => ({ adapter: "test", codec: "PCMA", sampleRate: 8000, writePcm, close: async () => {} }) as any),
  });
  let edgeUrl = "";
  const address = await edge.listen({ host: "127.0.0.1", port: 0 });
  edgeUrl = `http://127.0.0.1:${address.port}`;
  return { consume, writePcm, edgeUrl };
}

function setupGateway(controlPlane: any) {
  return buildMediaGateway({ controlPlane, router: { ensurePath: async () => {}, removePath: async () => {} },
    secrets: { resolve: async () => "rtsp://camera/live" }, publicHlsBaseUrl: "https://media.example/hls",
    publicWebRtcBaseUrl: "https://media.example/webrtc", accessTtlMs: 60_000, edgeBridgeSharedKey: key });
}
const start = (token = "a".repeat(43)) => gateway!.inject({ method: "POST", url: "/v1/talk/start", payload: { controlPlaneToken: token } });

describe("media audit fixes", () => {
  it("delegates a consumed session to the real edge gateway and delivers audio without a second consume", async () => {
    const { consume, writePcm, edgeUrl } = await setupEdge();
    const consumeLiveSession = vi.fn(async () => grant);
    gateway = await setupGateway({ consumeLiveSession, getEdgeAgentMediaUrl: async () => ({ localMediaUrl: edgeUrl }) });
    const response = await start();
    expect(response.statusCode, response.body).toBe(201);
    const session = response.json();
    const audio = await gateway.inject({ method: "POST", url: `/v1/talk/${session.sessionId}/audio`,
      headers: { authorization: `Bearer ${session.audio.bearerToken}`, "content-type": "audio/L16" }, payload: Buffer.alloc(16) });
    expect(audio.statusCode).toBe(202);
    expect(writePcm).toHaveBeenCalledOnce();
    expect(consumeLiveSession).toHaveBeenCalledOnce();
    expect(consume).not.toHaveBeenCalled();
  });

  it("rejects forged and replayed bridge grants", async () => {
    const { consume, edgeUrl } = await setupEdge();
    const signed = signTalkBridgeGrant(grant, key);
    const request = (bridgeGrant: string) => fetch(`${edgeUrl}/v1/talk/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bridgeGrant }) });
    expect((await request(signTalkBridgeGrant(grant, "wrong-key"))).status).toBe(401);
    expect((await request(signed)).status).toBe(201);
    expect((await request(signed)).status).toBe(401);
    expect(consume).not.toHaveBeenCalled();
  });

  it("fails unavailable startup and releases its reservation for retry", async () => {
    gateway = await setupGateway({ consumeLiveSession: async () => grant, getEdgeAgentMediaUrl: async () => undefined });
    expect((await start()).statusCode).toBe(503);
    expect((await start()).statusCode).toBe(503);
  });

  it("rejects overlapping startup requests before edge lookup finishes", async () => {
    const { edgeUrl } = await setupEdge();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const lookupEntered = new Promise<void>((resolve) => { entered = resolve; });
    gateway = await setupGateway({ consumeLiveSession: async (token: string) => ({ ...grant, id: token }),
      getEdgeAgentMediaUrl: async () => { entered(); await pending; return { localMediaUrl: edgeUrl }; } });
    const first = start("a".repeat(43));
    await lookupEntered;
    expect((await start("b".repeat(43))).statusCode).toBe(409);
    release();
    expect((await first).statusCode).toBe(201);
  });

  it("keeps concurrent main and sub viewers on independent source paths", async () => {
    const sources = new Map<string, string>();
    gateway = await buildMediaGateway({ controlPlane: { consumeLiveSession: async (token) => ({ ...grant, purpose: "view", profile: token.startsWith("m") ? "main" : "sub",
      profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }, { name: "sub", codec: "H264", width: 640, height: 360 }] }) },
      router: { ensurePath: async (path, uri = "") => { sources.set(path, uri); }, removePath: async () => {} },
      secrets: { resolve: async (reference) => `rtsp://${reference.split("#")[1]}` },
      publicHlsBaseUrl: "https://media.example/hls", publicWebRtcBaseUrl: "https://media.example/webrtc", accessTtlMs: 60_000 });
    const view = (token: string) => gateway!.inject({ method: "POST", url: "/v1/live/start", payload: { controlPlaneToken: token.repeat(43) } });
    const main = (await view("m")).json(); const sub = (await view("s")).json();
    expect(main.path).not.toBe(sub.path);
    expect(sources.get(main.path)).toBe("rtsp://main");
    expect(sources.get(sub.path)).toBe("rtsp://sub");
  });
});
