import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { startManagedMediaRelay } from "../src/streaming/managed-media-relay.js";

describe("managed media relay", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  it("reconnects when the public relay health route disappears while its socket stays open", async () => {
    let connections = 0;
    const server = createServer((_request, response) => response.writeHead(503).end());
    const sockets = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      sockets.handleUpgrade(request, socket, head, (client) => {
        connections += 1;
        sockets.emit("connection", client, request);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(async () => {
      for (const client of sockets.clients) client.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    const relay = startManagedMediaRelay(
      `http://127.0.0.1:${address.port}/v1/edge-media/relay/edge-001`,
      "edge-001",
      "test-token",
      8090,
      { healthProbeIntervalMs: 20, reconnectDelayMs: 20 },
    );
    cleanups.push(async () => relay.stop());

    await vi.waitFor(() => expect(connections).toBeGreaterThanOrEqual(2), { timeout: 2_000 });
  });
});
