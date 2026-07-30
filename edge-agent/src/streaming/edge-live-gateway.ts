import Fastify, { type FastifyInstance } from "fastify";
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

export async function buildEdgeLiveGateway(options: {
  consumer: LiveSessionConsumer;
  router: MediaRouter;
  resolveSecret(reference: string): string | undefined;
  edgeBridgeSharedKey: string;
  publicBaseUrl: () => string;
  mediaMtxHlsUrl: string;
  accessTtlMs: number;
  logger?: boolean;
}) {
  const app = Fastify({ logger: options.logger ?? false });
  const access = new EdgeAccessRegistry(options.router, options.accessTtlMs);

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/v1/live/start" && !secureEqualHeader(
      request.headers["x-edge-bridge-key"],
      options.edgeBridgeSharedKey,
    )) return reply.code(401).send({ error: "invalid_bridge_identity" });
  });

  app.get("/health", async () => ({ status: "ok", service: "sentinel-edge-media-gateway" }));

  app.route({
    method: ["GET", "HEAD", "OPTIONS"],
    url: "/hls/*",
    handler: async (request, reply) => {
      const origin = typeof request.headers.origin === "string" ? request.headers.origin : "*";
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
      reply.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      reply.header("Vary", "Origin");
      if (request.method === "OPTIONS") return reply.code(204).send();

      const suffix = request.raw.url?.slice("/hls".length) || "/";
      const target = new URL(suffix, options.mediaMtxHlsUrl);
      const upstream = await fetch(target, {
        method: request.method,
        headers: forwardMediaHeaders(request.headers),
      });
      reply.code(upstream.status);
      for (const name of ["accept-ranges", "cache-control", "content-length", "content-type"]) {
        const value = upstream.headers.get(name);
        if (value) reply.header(name, value);
      }
      if (request.method === "HEAD" || upstream.status === 204) return reply.send();
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    },
  });

  app.post("/v1/live/start", async (request, reply) => {
    const body = request.body as { controlPlaneToken?: unknown };
    if (typeof body?.controlPlaneToken !== "string" || body.controlPlaneToken.length < 32) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const consumed = await options.consumer.consume(body.controlPlaneToken);
    const sourceUri = options.resolveSecret(consumed.connectionSecretRef);
    if (!sourceUri) return reply.code(503).send({ error: "stream_secret_unavailable" });

    const path = `camera-${safeIdentifier(consumed.cameraId)}`;
    await options.router.ensurePath(path, sourceUri);
    const session = access.issue(path);
    return reply.code(201).send({
      sessionId: session.id,
      cameraId: consumed.cameraId,
      path,
      expiresAt: session.expiresAt,
      hls: {
        url: `${stripSlash(options.publicBaseUrl())}/hls/${path}/index.m3u8`,
        bearerToken: session.token,
      },
    });
  });

  app.post("/internal/mediamtx/auth", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const action = typeof body?.action === "string" ? body.action : "";
    const path = typeof body?.path === "string" ? body.path : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const query = typeof body?.query === "string" ? body.query : "";
    const credential = token || password || new URLSearchParams(query).get("token") || "";
    if (!access.authenticate(credential, path, action)) {
      return reply.code(401).send({ error: "media_access_denied" });
    }
    return reply.code(204).send();
  });

  return app;
}

export async function startEdgeMediaRuntime(input: {
  config: EdgeConfig;
  gateway: GatewayClient;
  agentId: string;
  secrets: LocalStreamSecretStore;
}): Promise<EdgeMediaRuntime> {
  const { config } = input;
  const runtimeDirectory = join(process.env.EDGE_AGENT_HOME ?? process.cwd(), "runtime");
  await mkdir(runtimeDirectory, { recursive: true });
  const mediaConfigPath = join(runtimeDirectory, "mediamtx.yml");
  await writeFile(mediaConfigPath, mediaMtxConfiguration(config), "utf8");

  const mediaMtx = startManagedProcess(
    "MediaMTX",
    config.MEDIAMTX_PATH,
    [mediaConfigPath],
    runtimeDirectory,
  );
  await waitForHttp(new URL("/v3/config/global/get", config.MEDIAMTX_API_URL), mediaMtx, 15_000);

  const router = new MediaMtxRouter(config.MEDIAMTX_API_URL);
  let resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL ?? "";
  const liveGateway = await buildEdgeLiveGateway({
    consumer: { consume: (token) => input.gateway.consumeLiveSession(input.agentId, token) },
    router,
    resolveSecret: (reference) => input.secrets.get(reference),
    edgeBridgeSharedKey: config.EDGE_BRIDGE_SHARED_KEY!,
    publicBaseUrl: () => resolvedPublicUrl,
    mediaMtxHlsUrl: config.MEDIAMTX_HLS_URL,
    accessTtlMs: config.MEDIA_ACCESS_TTL_SECONDS * 1_000,
    logger: false,
  });
  await liveGateway.listen({ host: config.EDGE_LIVE_GATEWAY_HOST, port: config.EDGE_LIVE_GATEWAY_PORT });

  let tunnel: ChildProcessWithoutNullStreams | undefined;
  try {
    if (config.MEDIA_TUNNEL_MODE === "quick") {
      const started = await startQuickTunnel(
        config.CLOUDFLARED_PATH,
        `http://${config.EDGE_LIVE_GATEWAY_HOST}:${config.EDGE_LIVE_GATEWAY_PORT}`,
        runtimeDirectory,
      );
      tunnel = started.process;
      resolvedPublicUrl = started.publicUrl;
      logger.warn("Quick media tunnel is active; use a named tunnel for production", { publicUrl: resolvedPublicUrl });
    } else if (config.MEDIA_TUNNEL_MODE === "named") {
      tunnel = startNamedTunnel(config.CLOUDFLARED_PATH, config.CLOUDFLARED_TUNNEL_TOKEN!, runtimeDirectory);
      resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL!;
    }
    if (!resolvedPublicUrl) throw new Error("No public media gateway URL was established");
    await waitForPublicGateway(new URL("/health", resolvedPublicUrl), 30_000);
    logger.info("Edge live media is reachable", { publicUrl: resolvedPublicUrl, tunnelMode: config.MEDIA_TUNNEL_MODE });
  } catch (error) {
    tunnel?.kill();
    await liveGateway.close();
    mediaMtx.kill();
    throw error;
  }

  return {
    publicUrl: resolvedPublicUrl,
    async stop() {
      tunnel?.kill();
      await liveGateway.close().catch(() => undefined);
      mediaMtx.kill();
    },
  };
}

export class MediaMtxRouter implements MediaRouter {
  constructor(private readonly apiUrl: string) {}

  async ensurePath(path: string, sourceUri: string) {
    const encodedPath = encodeURIComponent(path);
    const payload = {
      source: sourceUri,
      rtspTransport: "tcp",
      sourceOnDemand: true,
      sourceOnDemandStartTimeout: "10s",
      sourceOnDemandCloseAfter: "10s",
    };
    const add = await fetch(new URL(`/v3/config/paths/add/${encodedPath}`, this.apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (add.ok) return;
    if (add.status !== 400 && add.status !== 409) throw new Error(`MediaMTX rejected path creation (${add.status})`);
    const patch = await fetch(new URL(`/v3/config/paths/patch/${encodedPath}`, this.apiUrl), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
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
    const timer = setTimeout(() => void this.expire(session.id), this.ttlMs);
    timer.unref();
    return { ...session, expiresAt: new Date(session.expiresAt).toISOString() };
  }

  authenticate(token: string, path: string, action: string) {
    if (action !== "read") return false;
    return [...this.sessions.values()].some((session) =>
      session.path === path && session.expiresAt > Date.now() && secureEqual(session.token, token));
  }

  private async expire(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
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
  const child = spawn(executable, args, {
    cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: environment ? { ...process.env, ...environment } : process.env,
  });
  child.stdin.end();
  pipeProcessLogs(name, child);
  child.once("exit", (code, signal) => logger.error(`${name} exited`, { code, signal }));
  return child;
}

async function startQuickTunnel(executable: string, origin: string, cwd: string) {
  const child = startManagedProcess("Cloudflare Tunnel", executable,
    ["tunnel", "--no-autoupdate", "--url", origin], cwd);
  const publicUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Cloudflare quick tunnel did not provide a URL within 30 seconds")), 30_000);
    const inspect = (chunk: Buffer) => {
      const match = chunk.toString("utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Cloudflare quick tunnel exited (${code})`)); });
  });
  return { process: child, publicUrl };
}

function startNamedTunnel(executable: string, token: string, cwd: string) {
  return startManagedProcess("Cloudflare Tunnel", executable,
    ["tunnel", "--no-autoupdate", "run"], cwd, { TUNNEL_TOKEN: token });
}

function pipeProcessLogs(name: string, child: ChildProcessWithoutNullStreams) {
  const report = (level: "info" | "warn", chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) logger[level](`${name}: ${line}`);
  };
  child.stdout.on("data", (chunk: Buffer) => report("info", chunk));
  child.stderr.on("data", (chunk: Buffer) => report("warn", chunk));
}

async function waitForHttp(url: URL, child: ChildProcessWithoutNullStreams, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`MediaMTX exited before becoming ready (${child.exitCode})`);
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
function forwardMediaHeaders(headers: Record<string, unknown>) {
  const forwarded: Record<string, string> = {};
  for (const name of ["accept", "origin", "range", "user-agent"]) {
    const value = headers[name]; if (typeof value === "string") forwarded[name] = value;
  }
  return forwarded;
}
