import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EdgeConfig } from "../config.js";
import type { ConsumedLiveSession, GatewayClient } from "../registration/gateway-client.js";
import type { LocalStreamSecretStore } from "./secret-store.js";
import { logger } from "../utils/logger.js";

interface MediaRouter {
  ensurePath(path: string, sourceUri: string): Promise<void>;
  removePath(path: string): Promise<void>;
}

interface LiveSessionConsumer {
  consume(token: string): Promise<ConsumedLiveSession>;
}

export interface EdgeMediaRuntime {
  publicUrl: string;
  stop(): Promise<void>;
}

export interface EdgeMediaRuntimeInput {
  config: EdgeConfig;
  gateway: GatewayClient;
  agentId: string;
  secrets: LocalStreamSecretStore;
}

interface LiveGatewayOptions {
  consumer: LiveSessionConsumer;
  router: MediaRouter;
  resolveSecret(reference: string): string | undefined;
  edgeBridgeSharedKey?: string;
  publicBaseUrl: () => string;
  mediaMtxHlsUrl: string;
  accessTtlMs: number;
}

export class EdgeLiveGateway {
  private readonly access: EdgeAccessRegistry;
  private readonly server: Server;

  constructor(private readonly options: LiveGatewayOptions) {
    this.access = new EdgeAccessRegistry(options.router, options.accessTtlMs);
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        logger.error("Edge live gateway request failed", { error: error instanceof Error ? error.message : String(error) });
        if (!response.headersSent) sendJson(response, 502, { error: "media_gateway_failure" });
        else response.destroy(error instanceof Error ? error : undefined);
      });
    });
  }

  async listen(input: { host: string; port: number }) {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { this.server.off("listening", onListening); reject(error); };
      const onListening = () => { this.server.off("error", onError); resolve(); };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(input.port, input.host);
    });
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Edge live gateway did not bind a TCP address");
    return { host: input.host, port: address.port };
  }

  async close() {
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://edge.local");
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok", service: "sentinel-edge-media-gateway" });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(request.method ?? "") && url.pathname.startsWith("/hls/")) {
      return this.proxyHls(request, response);
    }
    if (request.method === "POST" && url.pathname === "/v1/live/start") {
      if (this.options.edgeBridgeSharedKey && !secureEqualHeader(request.headers["x-edge-bridge-key"], this.options.edgeBridgeSharedKey)) {
        return sendJson(response, 401, { error: "invalid_bridge_identity" });
      }
      const body = await readJsonBody(request);
      if (typeof body.controlPlaneToken !== "string" || body.controlPlaneToken.length < 32) {
        return sendJson(response, 400, { error: "invalid_request" });
      }
      const consumed = await this.options.consumer.consume(body.controlPlaneToken);
      const sourceUri = this.options.resolveSecret(consumed.connectionSecretRef);
      if (!sourceUri) return sendJson(response, 503, { error: "stream_secret_unavailable" });
      const path = `camera-${safeIdentifier(consumed.cameraId)}`;
      await this.options.router.ensurePath(path, sourceUri);
      const session = this.access.issue(path);
      return sendJson(response, 201, {
        sessionId: session.id,
        cameraId: consumed.cameraId,
        path,
        expiresAt: session.expiresAt,
        hls: {
          url: `${stripSlash(this.options.publicBaseUrl())}/hls/${path}/index.m3u8`,
          bearerToken: session.token,
        },
      });
    }
    if (request.method === "POST" && url.pathname === "/internal/mediamtx/auth") {
      const body = await readJsonBody(request);
      const action = typeof body.action === "string" ? body.action : "";
      const path = typeof body.path === "string" ? body.path : "";
      const token = typeof body.token === "string" ? body.token : "";
      const password = typeof body.password === "string" ? body.password : "";
      const query = typeof body.query === "string" ? body.query : "";
      const credential = token || password || new URLSearchParams(query).get("token") || "";
      if (!this.access.authenticate(credential, path, action)) {
        return sendJson(response, 401, { error: "media_access_denied" });
      }
      response.writeHead(204).end();
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  }

  private async proxyHls(request: IncomingMessage, response: ServerResponse) {
    const origin = typeof request.headers.origin === "string" ? request.headers.origin : "*";
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
    response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
    const suffix = (request.url ?? "/hls/").slice("/hls".length) || "/";
    const upstream = await fetch(new URL(suffix, this.options.mediaMtxHlsUrl), {
      method: request.method ?? "GET",
      headers: forwardMediaHeaders(request.headers),
    });
    response.statusCode = upstream.status;
    for (const name of ["accept-ranges", "cache-control", "content-length", "content-type"]) {
      const value = upstream.headers.get(name); if (value) response.setHeader(name, value);
    }
    if (request.method === "HEAD" || upstream.status === 204) { response.end(); return; }
    response.end(Buffer.from(await upstream.arrayBuffer()));
  }
}

export function buildEdgeLiveGateway(options: LiveGatewayOptions) {
  return new EdgeLiveGateway(options);
}

export async function startEdgeMediaRuntimeIfAvailable(
  input: EdgeMediaRuntimeInput,
  start: (input: EdgeMediaRuntimeInput) => Promise<EdgeMediaRuntime> = startEdgeMediaRuntime,
): Promise<EdgeMediaRuntime | undefined> {
  try {
    return await start(input);
  } catch (error) {
    logger.warn("Live media runtime unavailable; camera discovery and monitoring will continue", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export async function startEdgeMediaRuntime(input: EdgeMediaRuntimeInput): Promise<EdgeMediaRuntime> {
  const { config } = input;
  const tunnelMode = resolveMediaTunnelMode(config);
  const runtimeDirectory = join(process.env.EDGE_AGENT_HOME ?? process.cwd(), "runtime");
  await mkdir(runtimeDirectory, { recursive: true });
  const mediaConfigPath = join(runtimeDirectory, "mediamtx.yml");
  await writeFile(mediaConfigPath, mediaMtxConfiguration(config), "utf8");

  const mediaMtx = config.MEDIA_RUNTIME_MANAGED
    ? startManagedProcess("MediaMTX", config.MEDIAMTX_PATH, [mediaConfigPath], runtimeDirectory)
    : undefined;
  await waitForHttp(new URL("/v3/config/global/get", config.MEDIAMTX_API_URL), mediaMtx, 30_000);

  const router = new MediaMtxRouter(config.MEDIAMTX_API_URL);
  let resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL ?? "";
  const liveGateway = buildEdgeLiveGateway({
    consumer: { consume: (token) => input.gateway.consumeLiveSession(input.agentId, token) },
    router,
    resolveSecret: (reference) => input.secrets.get(reference),
    ...(config.EDGE_BRIDGE_SHARED_KEY ? { edgeBridgeSharedKey: config.EDGE_BRIDGE_SHARED_KEY } : {}),
    publicBaseUrl: () => resolvedPublicUrl,
    mediaMtxHlsUrl: config.MEDIAMTX_HLS_URL,
    accessTtlMs: config.MEDIA_ACCESS_TTL_SECONDS * 1_000,
  });
  await liveGateway.listen({ host: config.EDGE_LIVE_GATEWAY_HOST, port: config.EDGE_LIVE_GATEWAY_PORT });

  let tunnel: ChildProcessWithoutNullStreams | undefined;
  try {
    if (tunnelMode === "quick") {
      if (config.MEDIA_TUNNEL_MODE === "named") {
        logger.warn("Managed media tunnel is not provisioned; using a protected temporary tunnel");
      }
      const started = await startQuickTunnel(config.CLOUDFLARED_PATH,
        `http://${config.EDGE_LIVE_GATEWAY_HOST}:${config.EDGE_LIVE_GATEWAY_PORT}`, runtimeDirectory);
      tunnel = started.process;
      resolvedPublicUrl = started.publicUrl;
      logger.warn("Quick media tunnel is active; use a named tunnel for production", { publicUrl: resolvedPublicUrl });
    } else if (tunnelMode === "named") {
      tunnel = startNamedTunnel(config.CLOUDFLARED_PATH, config.CLOUDFLARED_TUNNEL_TOKEN!, runtimeDirectory);
      resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL!;
    }
    if (!resolvedPublicUrl) throw new Error("No public media gateway URL was established");
    await waitForPublicGateway(new URL("/health", resolvedPublicUrl), 30_000);
    logger.info("Edge live media is reachable", { publicUrl: resolvedPublicUrl, tunnelMode });
  } catch (error) {
    tunnel?.kill(); await liveGateway.close(); mediaMtx?.kill(); throw error;
  }

  return {
    publicUrl: resolvedPublicUrl,
    async stop() { tunnel?.kill(); await liveGateway.close().catch(() => undefined); mediaMtx?.kill(); },
  };
}

export function resolveMediaTunnelMode(config: Pick<EdgeConfig,
  "MEDIA_TUNNEL_MODE" | "MEDIA_QUICK_TUNNEL_FALLBACK" |
  "CLOUDFLARED_TUNNEL_TOKEN" | "PUBLIC_MEDIA_GATEWAY_URL"
>) {
  if (config.MEDIA_TUNNEL_MODE === "named" &&
      config.MEDIA_QUICK_TUNNEL_FALLBACK &&
      (!config.CLOUDFLARED_TUNNEL_TOKEN || !config.PUBLIC_MEDIA_GATEWAY_URL)) {
    return "quick" as const;
  }
  return config.MEDIA_TUNNEL_MODE;
}

export class MediaMtxRouter implements MediaRouter {
  constructor(private readonly apiUrl: string) {}
  async ensurePath(path: string, sourceUri: string) {
    const encodedPath = encodeURIComponent(path);
    const payload = { source: sourceUri, rtspTransport: "tcp", sourceOnDemand: true,
      sourceOnDemandStartTimeout: "10s", sourceOnDemandCloseAfter: "10s" };
    const add = await fetch(new URL(`/v3/config/paths/add/${encodedPath}`, this.apiUrl), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    if (add.ok) return;
    if (add.status !== 400 && add.status !== 409) throw new Error(`MediaMTX rejected path creation (${add.status})`);
    const patch = await fetch(new URL(`/v3/config/paths/patch/${encodedPath}`, this.apiUrl), {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!patch.ok) throw new Error(`MediaMTX rejected path update (${patch.status})`);
  }
  async removePath(path: string) {
    const response = await fetch(new URL(`/v3/config/paths/delete/${encodeURIComponent(path)}`, this.apiUrl), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`MediaMTX rejected path deletion (${response.status})`);
  }
}

class EdgeAccessRegistry {
  private readonly sessions = new Map<string, { id: string; path: string; token: string; expiresAt: number }>();
  constructor(private readonly router: MediaRouter, private readonly ttlMs: number) {}
  issue(path: string) {
    const session = { id: randomUUID(), path, token: randomBytes(32).toString("base64url"), expiresAt: Date.now() + this.ttlMs };
    this.sessions.set(session.id, session);
    const timer = setTimeout(() => void this.expire(session.id), this.ttlMs); timer.unref();
    return { ...session, expiresAt: new Date(session.expiresAt).toISOString() };
  }
  authenticate(token: string, path: string, action: string) {
    return action === "read" && [...this.sessions.values()].some((session) =>
      session.path === path && session.expiresAt > Date.now() && secureEqual(session.token, token));
  }
  private async expire(id: string) {
    const session = this.sessions.get(id); if (!session) return; this.sessions.delete(id);
    if (![...this.sessions.values()].some((item) => item.path === session.path && item.expiresAt > Date.now())) {
      await this.router.removePath(session.path).catch(() => undefined);
    }
  }
}

function mediaMtxConfiguration(config: EdgeConfig) {
  return `logLevel: info
api: yes
apiAddress: 127.0.0.1:9997
authMethod: http
authHTTPAddress: http://127.0.0.1:${config.EDGE_LIVE_GATEWAY_PORT}/internal/mediamtx/auth
authHTTPExclude:
  - action: api
  - action: metrics
  - action: pprof
hls: yes
hlsAddress: 127.0.0.1:8888
hlsVariant: lowLatency
hlsAllowOrigins: ['*']
webrtc: no
pathDefaults:
  sourceOnDemand: yes
  sourceOnDemandStartTimeout: 10s
  sourceOnDemandCloseAfter: 10s
paths: {}
`;
}

function startManagedProcess(name: string, executable: string, args: string[], cwd: string, environment?: NodeJS.ProcessEnv) {
  const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: environment ? { ...process.env, ...environment } : process.env });
  child.stdin.end(); pipeProcessLogs(name, child);
  child.once("exit", (code, signal) => logger.error(`${name} exited`, { code, signal }));
  return child;
}

async function startQuickTunnel(executable: string, origin: string, cwd: string) {
  const child = startManagedProcess("Cloudflare Tunnel", executable, ["tunnel", "--no-autoupdate", "--url", origin], cwd);
  const publicUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Cloudflare quick tunnel did not provide a URL within 30 seconds")), 30_000);
    let output = "";
    const inspect = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-8_192);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    };
    child.stdout.on("data", inspect); child.stderr.on("data", inspect);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Cloudflare quick tunnel exited (${code})`)); });
  });
  return { process: child, publicUrl };
}

function startNamedTunnel(executable: string, token: string, cwd: string) {
  return startManagedProcess("Cloudflare Tunnel", executable, ["tunnel", "--no-autoupdate", "run"], cwd, { TUNNEL_TOKEN: token });
}
function pipeProcessLogs(name: string, child: ChildProcessWithoutNullStreams) {
  const report = (level: "info" | "warn", chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) logger[level](`${name}: ${line}`);
  };
  child.stdout.on("data", (chunk: Buffer) => report("info", chunk));
  child.stderr.on("data", (chunk: Buffer) => report("warn", chunk));
}
async function waitForHttp(url: URL, child: ChildProcessWithoutNullStreams | undefined, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`MediaMTX exited before becoming ready (${child.exitCode})`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok) return; } catch { /* retry */ }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function waitForPublicGateway(url: URL, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return; } catch { /* retry */ }
    await delay(500);
  }
  throw new Error(`Public media tunnel is not reachable at ${url.origin}`);
}
async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); length += buffer.length;
    if (length > 64 * 1024) throw new Error("Request body is too large"); chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>; }
  catch { throw new Error("Request body must be valid JSON"); }
}
function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { "content-type": "application/json", "content-length": data.length }); response.end(data);
}
function delay(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function safeIdentifier(value: string) { return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"); }
function stripSlash(value: string) { return value.replace(/\/+$/, ""); }
function secureEqual(left: string, right: string) {
  const supplied = Buffer.from(left); const expected = Buffer.from(right);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function secureEqualHeader(value: string | string[] | undefined, expected: string) {
  return typeof value === "string" && secureEqual(value, expected);
}
function forwardMediaHeaders(headers: IncomingHttpHeaders) {
  const forwarded: Record<string, string> = {};
  for (const name of ["accept", "origin", "range", "user-agent"]) {
    const value = headers[name]; if (typeof value === "string") forwarded[name] = value;
  }
  return forwarded;
}
