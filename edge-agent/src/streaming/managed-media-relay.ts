import { WebSocket } from "ws";
import { logger } from "../utils/logger.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_CONCURRENT = 32;
const HEALTH_PROBE_INTERVAL_MS = 15_000;
const HEALTH_PROBE_TIMEOUT_MS = 5_000;
const HEALTH_PROBE_FAILURE_LIMIT = 2;
const RECONNECT_DELAY_MS = 3_000;

type RelayRequest = { id: string; method: string; path: string; headers?: Record<string, string>; body?: string };

/** The connector only dials the HTTPS control plane and only fetches loopback media. */
export function startManagedMediaRelay(
  publicUrl: string,
  agentId: string,
  credential: string,
  localPort: number,
  options: { healthProbeIntervalMs?: number; reconnectDelayMs?: number } = {},
) {
  const endpoint = new URL(publicUrl);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    throw new Error("managed_media_relay_requires_https");
  }
  const healthEndpoint = new URL(publicUrl);
  healthEndpoint.pathname = `${healthEndpoint.pathname.replace(/\/$/, "")}/health`;
  healthEndpoint.search = "";
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.pathname = `/v1/edge-media/connect/${encodeURIComponent(agentId)}`;
  endpoint.search = "";
  let stopped = false;
  let socket: WebSocket | undefined;
  let reconnect: NodeJS.Timeout | undefined;
  let inFlight = 0;

  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(endpoint, { headers: { "x-edge-agent-token": credential }, maxPayload: 12 * 1024 * 1024 });
    const current = socket;
    let isAlive = true;
    let healthProbeInFlight = false;
    let healthProbeFailures = 0;
    current.on("pong", () => { isAlive = true; });
    const pingTimer = setInterval(() => {
      if (current.readyState === WebSocket.OPEN) {
        if (!isAlive) {
          logger.warn("Self-hosted media relay ping timed out; terminating zombie connection", { agentId });
          clearInterval(pingTimer);
          current.terminate();
          return;
        }
        isAlive = false;
        current.ping();
      }
    }, 15_000);
    // A proxy or server restart can drop the server-side connection while the
    // edge socket still looks open. Check the relay route independently so a
    // stale socket cannot keep live video offline until the agent restarts.
    const healthTimer = setInterval(() => {
      if (current.readyState !== WebSocket.OPEN || healthProbeInFlight) return;
      healthProbeInFlight = true;
      void fetch(healthEndpoint, {
        headers: { "cache-control": "no-store" },
        signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
      }).then((response) => {
        healthProbeFailures = response.ok ? 0 : healthProbeFailures + 1;
      }).catch(() => {
        healthProbeFailures += 1;
      }).finally(() => {
        healthProbeInFlight = false;
        if (healthProbeFailures >= HEALTH_PROBE_FAILURE_LIMIT && current.readyState === WebSocket.OPEN) {
          logger.warn("Self-hosted media relay is absent from the control plane; reconnecting", { agentId });
          current.terminate();
        }
      });
    }, options.healthProbeIntervalMs ?? HEALTH_PROBE_INTERVAL_MS);

    current.on("open", () => {
      isAlive = true;
      logger.info("Self-hosted media relay connected", { agentId });
    });
    current.on("message", (raw) => {
      let frame: RelayRequest;
      try { frame = JSON.parse(raw.toString()) as RelayRequest; } catch { current.close(1003, "invalid frame"); return; }
      if (!frame || typeof frame.id !== "string" || typeof frame.path !== "string" || typeof frame.method !== "string") {
        current.close(1003, "invalid request"); return;
      }
      if (inFlight >= MAX_CONCURRENT) {
        current.send(JSON.stringify({ id: frame.id, status: 503, body: Buffer.from('{"error":"edge_media_busy"}').toString("base64") }));
        return;
      }
      inFlight++;
      void handleRequest(frame, localPort).then((response) => {
        if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ id: frame.id, ...response }));
      }).catch((error) => {
        logger.warn("Self-hosted media relay request failed", { error: error instanceof Error ? error.message : String(error) });
        if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ id: frame.id, status: 502, body: Buffer.from('{"error":"local_media_unavailable"}').toString("base64") }));
      }).finally(() => { inFlight--; });
    });
    current.on("error", (error) => {
      logger.warn("Self-hosted media relay connection error", { error: error.message });
      clearInterval(pingTimer);
      clearInterval(healthTimer);
      current.terminate();
    });
    current.on("close", (code, reason) => {
      clearInterval(pingTimer);
      clearInterval(healthTimer);
      logger.warn("Self-hosted media relay disconnected", { agentId, code, reason: reason?.toString() });
      if (socket === current) socket = undefined;
      if (!stopped) reconnect = setTimeout(connect, options.reconnectDelayMs ?? RECONNECT_DELAY_MS);
    });
  };
  connect();
  return {
    stop() {
      stopped = true;
      if (reconnect) clearTimeout(reconnect);
      socket?.terminate();
    },
  };
}

async function handleRequest(frame: RelayRequest, localPort: number) {
  if (!frame.path.startsWith("/") || frame.path.startsWith("//") || frame.path.includes("..") || Buffer.byteLength(frame.body ?? "", "base64") > MAX_BODY_BYTES) {
    return { status: 400, body: Buffer.from('{"error":"invalid_relay_request"}').toString("base64") };
  }
  const pathname = new URL(frame.path, "http://edge.local").pathname;
  const method = frame.method;
  const allowed = pathname === "/health" && ["GET", "HEAD"].includes(method)
    || pathname === "/v1/live/start" && method === "POST"
    || /^\/v1\/live\/[a-zA-Z0-9_-]+$/.test(pathname) && method === "DELETE"
    || ["/v1/storage/search", "/v1/storage/play"].includes(pathname) && ["POST", "OPTIONS"].includes(method)
    || pathname === "/v1/talk/start" && method === "POST"
    || /^\/v1\/talk\/[a-zA-Z0-9_-]+(?:\/audio)?$/.test(pathname) && ["POST", "DELETE"].includes(method)
    || /^\/hls\/[a-zA-Z0-9_-]+\/.+$/.test(pathname) && ["GET", "HEAD", "OPTIONS"].includes(method)
    || /^\/webrtc\/[a-zA-Z0-9_-]+(?:\/.+)?$/.test(pathname) && ["GET", "POST", "PATCH", "OPTIONS"].includes(method);
  if (!allowed) return { status: 404, body: Buffer.from('{"error":"not_found"}').toString("base64") };
  const headers: Record<string, string> = {};
  for (const name of ["authorization", "content-type", "range", "accept"]) {
    const value = frame.headers?.[name];
    if (typeof value === "string") headers[name] = value;
  }
  const body = frame.body ? Buffer.from(frame.body, "base64") : undefined;
  const response = await fetch(`http://127.0.0.1:${localPort}${frame.path}`, {
    method: frame.method,
    headers,
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(35_000),
  });
  const payload = Buffer.from(await response.arrayBuffer());
  if (payload.length > MAX_BODY_BYTES) return { status: 502, body: Buffer.from('{"error":"media_response_too_large"}').toString("base64") };
  const responseHeaders: Record<string, string> = {};
  for (const name of ["content-type", "cache-control", "accept-ranges", "content-range", "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "vary"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  return { status: response.status, headers: responseHeaders, body: payload.toString("base64") };
}
