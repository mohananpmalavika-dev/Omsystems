import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { ControlPlaneStore } from "../src/control-plane-store.js";
import { registerEdgeMediaRelay } from "../src/services/edge-media-relay.js";
import { startManagedMediaRelay } from "../edge-agent/src/streaming/managed-media-relay.js";

const agentId = "c8921284-3240-4bd5-8d73-21acbe7eef11";
const credential = "sggw_" + "a".repeat(43);

describe("self-hosted edge media relay", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) await close();
  });

  it("forwards health and protected HLS over an outbound edge connection", async () => {
    const local: Server = createServer(async (request, response) => {
      if (request.url === "/health") {
        response.setHeader("content-type", "application/json");
        response.end('{"status":"ok"}');
        return;
      }
      if (request.url === "/hls/camera-1/index.m3u8" && request.headers.authorization === "Bearer session-token") {
        response.setHeader("content-type", "application/vnd.apple.mpegurl");
        response.end("#EXTM3U\n#EXTINF:1,\nsegment1.mp4\n");
        return;
      }
      if (request.method === "OPTIONS" && request.url?.startsWith("/v1/storage/")) {
        response.writeHead(204, { "access-control-allow-origin": "*" }).end();
        return;
      }
      if (request.method === "POST" && ["/v1/storage/search", "/v1/storage/play"].includes(request.url ?? "")) {
        let body = "";
        for await (const chunk of request) body += chunk;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ action: request.url?.split("/").at(-1), token: JSON.parse(body).controlPlaneToken }));
        return;
      }
      response.statusCode = 401;
      response.end('{"error":"media_access_denied"}');
    });
    await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => new Promise<void>((resolve) => local.close(() => resolve())));
    const localAddress = local.address();
    if (!localAddress || typeof localAddress === "string") throw new Error("local listener unavailable");

    const app = Fastify();
    registerEdgeMediaRelay(app, {
      verifyEdgeAgentCredential: async (id: string, hash: string) =>
        id === agentId && hash === createHash("sha256").update(credential).digest("hex"),
    } as unknown as ControlPlaneStore);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    cleanup.push(() => app.close());
    const publicUrl = `${address}/v1/edge-media/${agentId}`;
    const offline = await fetch(`${publicUrl}/health`);
    expect(offline.status).toBe(503);

    const relay = startManagedMediaRelay(publicUrl, agentId, credential, localAddress.port);
    cleanup.push(async () => relay.stop());
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await fetch(`${publicUrl}/health`);
      if (result.ok) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(ready).toBe(true);

    const unauthorized = await fetch(`${publicUrl}/hls/camera-1/index.m3u8`);
    expect(unauthorized.status).toBe(401);
    const authorized = await fetch(`${publicUrl}/hls/camera-1/index.m3u8`, {
      headers: { authorization: "Bearer session-token" },
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.text()).toContain("#EXTM3U");
    for (const action of ["search", "play"]) {
      const preflight = await fetch(`${publicUrl}/v1/storage/${action}`, { method: "OPTIONS" });
      expect(preflight.status).toBe(204);
      const storage = await fetch(`${publicUrl}/v1/storage/${action}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: "grant-token" }),
      });
      expect(storage.status).toBe(200);
      expect(await storage.json()).toEqual({ action, token: "grant-token" });
    }
    const forbidden = await fetch(`${publicUrl}/internal/mediamtx/auth`);
    expect(forbidden.status).toBe(404);
  });

  it("reconnects when the control plane loses a socket without closing the edge socket", async () => {
    let relayVisible = true;
    let connections = 0;
    let disconnections = 0;
    const server = createServer((_request, response) => {
      response.writeHead(relayVisible ? 200 : 503).end();
    });
    const sockets = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      if (request.url !== `/v1/edge-media/connect/${agentId}`) {
        socket.destroy();
        return;
      }
      sockets.handleUpgrade(request, socket, head, (ws) => {
        connections += 1;
        ws.on("close", () => { disconnections += 1; });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(async () => {
      for (const client of sockets.clients) client.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("relay listener unavailable");
    const relay = startManagedMediaRelay(
      `http://127.0.0.1:${address.port}/v1/edge-media/${agentId}`,
      agentId,
      credential,
      1,
      { healthProbeIntervalMs: 20, reconnectDelayMs: 20 },
    );
    cleanup.push(async () => relay.stop());

    await waitFor(() => connections === 1);
    relayVisible = false;
    await waitFor(() => disconnections >= 1);
    relayVisible = true;
    await waitFor(() => connections >= 2);
  });
});

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("relay did not recover within two seconds");
}
