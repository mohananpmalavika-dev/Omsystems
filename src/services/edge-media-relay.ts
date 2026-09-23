import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import type { ControlPlaneStore } from "../control-plane-store.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 40_000;
const MAX_PENDING_PER_AGENT = 32;
const ALLOWED_HEADERS = ["authorization", "content-type", "range", "accept"] as const;
const RESPONSE_HEADERS = ["content-type", "cache-control", "accept-ranges", "content-range", "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "vary"] as const;

type RelayRequest = { id: string; method: string; path: string; headers: Record<string, string>; body?: string };
type RelayResponse = { id: string; status: number; headers?: Record<string, string>; body?: string };
type Pending = { resolve: (response: RelayResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type Connection = { socket: WebSocket; pending: Map<string, Pending>; validationTimer: NodeJS.Timeout };

/** One GCP control-plane process owns the connected edge gateways. */
export function registerEdgeMediaRelay(app: FastifyInstance, store: ControlPlaneStore) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 12 * 1024 * 1024 });
  const connections = new Map<string, Connection>();
  app.addContentTypeParser(/^audio\/L16(?:;.*)?$/i, { parseAs: "buffer", bodyLimit: 32_000 }, (_request, body, done) => done(null, body));

  app.server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const match = /^\/v1\/edge-media\/connect\/([0-9a-f-]{36})$/.exec(pathname);
    if (!match) return;
    const agentId = match[1]!;
    const credential = request.headers["x-edge-agent-token"];
    if (typeof credential !== "string" || !credential.startsWith("sggw_")) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const credentialHash = createHash("sha256").update(credential).digest("hex");
    void store.verifyEdgeAgentCredential(agentId, credentialHash)
      .then((valid) => {
        if (!valid || socket.destroyed) {
          if (!socket.destroyed) socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        sockets.handleUpgrade(request, socket, head, (ws) => {
          const previous = connections.get(agentId);
          previous?.socket.close(1000, "replaced");
          const validationTimer = setInterval(() => {
            void store.verifyEdgeAgentCredential(agentId, credentialHash)
              .then((stillValid) => { if (!stillValid) ws.close(1008, "credential revoked"); })
              .catch(() => ws.close(1011, "identity check unavailable"));
          }, 30_000);
          validationTimer.unref();
          const connection: Connection = { socket: ws, pending: new Map(), validationTimer };
          connections.set(agentId, connection);
          ws.on("message", (raw) => {
            let response: RelayResponse;
            try { response = JSON.parse(raw.toString()) as RelayResponse; } catch { ws.close(1003, "invalid frame"); return; }
            if (!response || typeof response.id !== "string" || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 || (response.body && Buffer.byteLength(response.body, "base64") > MAX_BODY_BYTES)) {
              ws.close(1003, "invalid response"); return;
            }
            const pending = connection.pending.get(response.id);
            if (!pending) return;
            connection.pending.delete(response.id);
            clearTimeout(pending.timer);
            pending.resolve(response);
          });
          ws.on("close", () => {
            clearInterval(validationTimer);
            if (connections.get(agentId) === connection) connections.delete(agentId);
            for (const pending of connection.pending.values()) {
              clearTimeout(pending.timer);
              pending.reject(new Error("edge_disconnected"));
            }
            connection.pending.clear();
          });
        });
      })
      .catch(() => socket.destroy());
  });

  app.all("/v1/edge-media/:agentId/*", { config: { noAuth: true } }, async (request, reply) => {
    const { agentId, "*": suffix } = request.params as { agentId: string; "*": string };
    const path = `/${suffix}`;
    const method = request.method;
    const allowed = path === "/health" && ["GET", "HEAD"].includes(method)
      || path === "/v1/live/start" && method === "POST"
      || /^\/v1\/live\/[a-zA-Z0-9_-]+$/.test(path) && method === "DELETE"
      || path === "/v1/talk/start" && method === "POST"
      || /^\/v1\/talk\/[a-zA-Z0-9_-]+(?:\/audio)?$/.test(path) && ["POST", "DELETE"].includes(method)
      || /^\/hls\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path) && ["GET", "HEAD", "OPTIONS"].includes(method);
    if (!allowed || !/^[0-9a-f-]{36}$/.test(agentId)) return reply.code(404).send({ error: "not_found" });
    const connection = connections.get(agentId);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) return reply.code(503).send({ error: "edge_media_offline" });
    if (connection.pending.size >= MAX_PENDING_PER_AGENT) return reply.code(503).send({ error: "edge_media_busy" });
    const body = request.body === undefined ? undefined : Buffer.isBuffer(request.body)
      ? request.body : Buffer.from(JSON.stringify(request.body));
    if (body && body.length > MAX_BODY_BYTES) return reply.code(413).send({ error: "media_request_too_large" });
    const headers: Record<string, string> = {};
    for (const name of ALLOWED_HEADERS) {
      const value = request.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const search = new URL(request.url, "http://localhost").search;
    const frame: RelayRequest = { id: randomUUID(), method, path: `${path}${search}`, headers, ...(body ? { body: body.toString("base64") } : {}) };
    try {
      const response = await new Promise<RelayResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          connection.pending.delete(frame.id);
          reject(new Error("edge_timeout"));
        }, REQUEST_TIMEOUT_MS);
        connection.pending.set(frame.id, { resolve, reject, timer });
        connection.socket.send(JSON.stringify(frame), (error) => {
          if (!error) return;
          clearTimeout(timer);
          connection.pending.delete(frame.id);
          reject(error);
        });
      });
      for (const name of RESPONSE_HEADERS) {
        const value = response.headers?.[name];
        if (typeof value === "string") reply.header(name, value);
      }
      reply.header("cache-control", "no-store");
      return reply.code(response.status).send(response.body ? Buffer.from(response.body, "base64") : undefined);
    } catch (error) {
      app.log.warn({ err: error, agentId }, "Edge media relay request failed");
      return reply.code(503).send({ error: "edge_media_unavailable" });
    }
  });

  app.addHook("onClose", async () => {
    for (const connection of connections.values()) connection.socket.terminate();
    sockets.close();
  });
}
