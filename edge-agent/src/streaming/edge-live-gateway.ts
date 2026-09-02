import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { join } from "node:path";
import type { EdgeConfig } from "../config.js";
import type { ConsumedLiveSession, GatewayClient } from "../registration/gateway-client.js";
import type { LocalStreamSecretStore } from "./secret-store.js";
import { logger } from "../utils/logger.js";
import { TalkSessionRegistry } from "../talkback/talk-session-registry.js";
import { TalkbackTransportError } from "../talkback/rtsp-backchannel.js";

interface MediaRouter {
  ensurePath(path: string, sourceUri: string): Promise<void>;
  removePath(path: string): Promise<void>;
}

interface LiveSessionConsumer {
  consume(token: string): Promise<ConsumedLiveSession>;
}

export interface EdgeMediaRuntime {
  publicUrl: string | undefined;
  stop(): Promise<void>;
}

export interface EdgeMediaRuntimeInput {
  config: EdgeConfig;
  gateway: GatewayClient;
  agentId: string;
  secrets: LocalStreamSecretStore;
}

export type QuickTunnelChild = Pick<ChildProcessWithoutNullStreams, "kill" | "once">;

export interface QuickTunnelSupervisorOptions {
  start: () => Promise<{ process: QuickTunnelChild; publicUrl: string }>;
  onPublicUrl: (publicUrl: string | undefined) => void;
  retryDelayMs?: number;
}

/**
 * Quick-tunnel hostnames are temporary and the connector can be interrupted by
 * an ISP change or a Cloudflare edge reconnect. Keep the tunnel supervised so
 * the next heartbeat always advertises the newest hostname instead of leaving
 * a dead URL in the control plane until the whole agent is restarted.
 */
export class QuickTunnelSupervisor {
  private child: QuickTunnelChild | undefined;
  private publicUrl: string | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private livenessTimer: NodeJS.Timeout | undefined;
  private consecutiveFailures = 0;
  private stopped = false;

  constructor(private readonly options: QuickTunnelSupervisorOptions) {}

  async start() {
    this.startLivenessLoop();
    return await this.launch();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.livenessTimer) clearInterval(this.livenessTimer);
    this.retryTimer = undefined;
    this.livenessTimer = undefined;
    this.child?.kill();
    this.child = undefined;
    this.publicUrl = undefined;
  }

  rotateIfCurrent(publicUrl: string) {
    if (this.stopped || this.publicUrl !== publicUrl || !this.child) return false;
    const child = this.child;
    this.child = undefined;
    this.publicUrl = undefined;
    this.options.onPublicUrl(undefined);
    child.kill();
    this.scheduleRestart();
    return true;
  }

  private startLivenessLoop() {
    if (this.livenessTimer) clearInterval(this.livenessTimer);
    this.livenessTimer = setInterval(async () => {
      if (this.stopped || !this.publicUrl || !this.child) return;
      const current = this.publicUrl;
      try {
        const response = await fetch(new URL("/health", current), {
          signal: AbortSignal.timeout(6_000),
        });
        if (response.ok) {
          this.consecutiveFailures = 0;
          return;
        }
      } catch {
        // probe failed
      }
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 2) {
        logger.warn("Quick tunnel is unhealthy over consecutive probes; rotating tunnel", {
          publicUrl: current,
          consecutiveFailures: this.consecutiveFailures,
        });
        this.consecutiveFailures = 0;
        this.rotateIfCurrent(current);
      }
    }, 20_000);
    this.livenessTimer.unref();
  }

  private async launch(): Promise<string | undefined> {
    if (this.stopped) return undefined;
    try {
      const started = await this.options.start();
      if (this.stopped) {
        started.process.kill();
        return undefined;
      }
      this.child = started.process;
      this.publicUrl = started.publicUrl;
      this.options.onPublicUrl(started.publicUrl);
      started.process.once("exit", () => {
        if (this.child !== started.process) return;
        this.child = undefined;
        this.publicUrl = undefined;
        if (this.stopped) return;
        this.options.onPublicUrl(undefined);
        this.scheduleRestart();
      });
      return started.publicUrl;
    } catch (error) {
      if (!this.stopped) {
        this.options.onPublicUrl(undefined);
        this.scheduleRestart();
      }
      logger.warn("Temporary media tunnel startup failed; retry scheduled", {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private scheduleRestart() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.launch();
    }, this.options.retryDelayMs ?? 5_000);
    this.retryTimer.unref();
  }
}

interface LiveGatewayOptions {
  consumer: LiveSessionConsumer;
  router: MediaRouter;
  resolveSecret(reference: string): string | undefined;
  edgeBridgeSharedKey?: string;
  publicBaseUrl: () => string;
  mediaMtxHlsUrl: string;
  accessTtlMs: number;
  onTalkComplete?: ConstructorParameters<typeof TalkSessionRegistry>[1];
  talkSessions?: TalkSessionRegistry;
}

export class EdgeLiveGateway {
  private readonly access: EdgeAccessRegistry;
  private readonly talk: TalkSessionRegistry;
  private readonly server: Server;

  constructor(private readonly options: LiveGatewayOptions) {
    this.access = new EdgeAccessRegistry(options.router, options.accessTtlMs);
    this.talk = options.talkSessions ?? new TalkSessionRegistry(options.accessTtlMs, options.onTalkComplete);
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        logger.error("Edge live gateway request failed", { error: error instanceof Error ? error.message : String(error) });
        if (!response.headersSent) {
          if (error instanceof TalkbackTransportError) sendJson(response, error.status, { error: error.code });
          else sendJson(response, 502, { error: "media_gateway_failure" });
        }
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
    await this.talk.close();
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://edge.local");
    if (url.pathname === "/v1/live/start" || url.pathname === "/v1/talk/start" || url.pathname.startsWith("/v1/talk/")) {
      setCorsHeaders(request, response);
      if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok", service: "sentinel-edge-media-gateway" });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(request.method ?? "") && url.pathname.startsWith("/hls/")) {
      return this.proxyHls(request, response);
    }
    if (request.method === "POST" && url.pathname === "/v1/live/start") {
      const body = await readJsonBody(request);
      if (typeof body.controlPlaneToken !== "string" || body.controlPlaneToken.length < 32) {
        return sendJson(response, 400, { error: "invalid_request" });
      }
      const consumed = await this.options.consumer.consume(body.controlPlaneToken);
      if (consumed.purpose === "talk") return sendJson(response, 403, { error: "invalid_live_session" });
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
    if (request.method === "POST" && url.pathname === "/v1/talk/start") {
      const body = await readJsonBody(request);
      if (typeof body.controlPlaneToken !== "string" || body.controlPlaneToken.length < 32) {
        return sendJson(response, 400, { error: "invalid_request" });
      }
      const consumed = await this.options.consumer.consume(body.controlPlaneToken);
      if (consumed.purpose !== "talk") return sendJson(response, 403, { error: "invalid_talk_session" });
      const sourceUri = this.options.resolveSecret(consumed.connectionSecretRef);
      if (!sourceUri) return sendJson(response, 503, { error: "stream_secret_unavailable" });
      const session = await this.talk.start(consumed, sourceUri);
      const base = stripSlash(this.options.publicBaseUrl());
      return sendJson(response, 201, {
        sessionId: session.id,
        cameraId: session.cameraId,
        expiresAt: session.expiresAt,
        adapter: session.adapter,
        audio: {
          url: `${base}/v1/talk/${encodeURIComponent(session.id)}/audio`,
          endUrl: `${base}/v1/talk/${encodeURIComponent(session.id)}`,
          bearerToken: session.token,
          contentType: "audio/L16;rate=8000;channels=1",
          codec: session.codec,
          sampleRate: session.sampleRate,
        },
      });
    }
    const talkMatch = url.pathname.match(/^\/v1\/talk\/([^/]+)(?:\/(audio))?$/);
    if (talkMatch) {
      const id = decodeURIComponent(talkMatch[1]!);
      const token = bearerToken(request.headers.authorization);
      if (request.method === "POST" && talkMatch[2] === "audio") {
        const pcm = await readBinaryBody(request, 32_000);
        await this.talk.append(id, token, pcm);
        response.writeHead(202).end();
        return;
      }
      if (request.method === "DELETE" && !talkMatch[2]) {
        this.talk.authorize(id, token);
        await this.talk.stop(id);
        response.writeHead(204).end();
        return;
      }
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
    if (request.headers["access-control-request-private-network"] === "true") {
      response.setHeader("Access-Control-Allow-Private-Network", "true");
    }
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
  let mediaMtx: ChildProcessWithoutNullStreams | undefined;
  let liveGateway: EdgeLiveGateway | undefined;
  let tunnel: ChildProcessWithoutNullStreams | undefined;
  let quickTunnel: QuickTunnelSupervisor | undefined;

  try {
    await mkdir(runtimeDirectory, { recursive: true });
    const mediaConfigPath = join(runtimeDirectory, "mediamtx.yml");
    await writeFile(mediaConfigPath, mediaMtxConfiguration(config), "utf8");

    const mediaMtxApi = new URL("/v3/config/global/get", config.MEDIAMTX_API_URL);
    // A prior agent can leave MediaMTX running while the process that owned it
    // has exited. Reuse the loopback-only API when it is healthy: the new
    // gateway will become its authentication endpoint and retains control of
    // every per-session path. Starting a second instance would only fail on
    // MediaMTX's fixed HLS/API ports and take live video offline.
    const reusableMediaMtx = await isHttpReady(mediaMtxApi);
    if (config.MEDIA_RUNTIME_MANAGED && !shouldReuseExistingMediaMtx(config.MEDIA_RUNTIME_MANAGED, reusableMediaMtx)) {
      mediaMtx = startManagedProcess("MediaMTX", config.MEDIAMTX_PATH, [mediaConfigPath], runtimeDirectory);
    } else if (config.MEDIA_RUNTIME_MANAGED) {
      logger.warn("Reusing an already-running local MediaMTX instance", { apiUrl: config.MEDIAMTX_API_URL });
    }
    await waitForHttp(mediaMtxApi, mediaMtx, 30_000);

    const router = new MediaMtxRouter(config.MEDIAMTX_API_URL);
    let resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL === "auto"
      ? resolvePrivateMediaGatewayUrlIfAvailable(config.EDGE_LIVE_GATEWAY_PORT)
      : config.PUBLIC_MEDIA_GATEWAY_URL;
    const currentPublicUrl = () => {
      if (config.PUBLIC_MEDIA_GATEWAY_URL === "auto" && tunnelMode === "disabled") {
        resolvedPublicUrl = resolvePrivateMediaGatewayUrlIfAvailable(config.EDGE_LIVE_GATEWAY_PORT)
          ?? resolvedPublicUrl;
      }
      // A request can only arrive through loopback while a quick tunnel is
      // still obtaining its hostname. Do not advertise this fallback in edge
      // heartbeats; it is only used to build a response for that local request.
      return resolvedPublicUrl ?? mediaTunnelOrigin(config.EDGE_LIVE_GATEWAY_HOST, config.EDGE_LIVE_GATEWAY_PORT);
    };
    liveGateway = buildEdgeLiveGateway({
      consumer: { consume: (token) => input.gateway.consumeLiveSession(input.agentId, token) },
      router,
      resolveSecret: (reference) => input.secrets.get(reference),
      ...(config.EDGE_BRIDGE_SHARED_KEY ? { edgeBridgeSharedKey: config.EDGE_BRIDGE_SHARED_KEY } : {}),
      publicBaseUrl: currentPublicUrl,
      mediaMtxHlsUrl: config.MEDIAMTX_HLS_URL,
      accessTtlMs: config.MEDIA_ACCESS_TTL_SECONDS * 1_000,
      onTalkComplete: async (completion) => {
        await input.gateway.completeTalkSession(input.agentId, completion.sessionId, completion);
      },
    });
    await liveGateway.listen({ host: config.EDGE_LIVE_GATEWAY_HOST, port: config.EDGE_LIVE_GATEWAY_PORT });

    if (tunnelMode === "quick") {
      if (config.MEDIA_TUNNEL_MODE === "named") {
        logger.warn("Managed media tunnel is not provisioned; using a protected temporary tunnel");
      }
      quickTunnel = new QuickTunnelSupervisor({
        start: () => startQuickTunnel(config.CLOUDFLARED_PATH,
          mediaTunnelOrigin(config.EDGE_LIVE_GATEWAY_HOST, config.EDGE_LIVE_GATEWAY_PORT), runtimeDirectory),
        onPublicUrl: (publicUrl) => {
          if (!publicUrl) {
            resolvedPublicUrl = resolvePrivateMediaGatewayUrlIfAvailable(config.EDGE_LIVE_GATEWAY_PORT);
            return;
          }
          resolvedPublicUrl = publicUrl;
          logger.warn("Quick media tunnel is active; use a named tunnel for production", { publicUrl });
          // A new trycloudflare hostname commonly needs more than 30 seconds to
          // propagate. Give it a generous window, then rotate a hostname that
          // never became reachable instead of advertising a dead URL forever.
          void waitForPublicGateway(new URL("/health", publicUrl), 120_000)
            .then(() => logger.info("Edge live media is publicly reachable", { publicUrl, tunnelMode }))
            .catch((error) => {
              const rotated = quickTunnel?.rotateIfCurrent(publicUrl) ?? false;
              logger.warn(rotated
                ? "Quick tunnel did not become reachable; rotating the connector"
                : "Superseded quick tunnel did not become reachable", {
                error: error instanceof Error ? error.message : String(error),
                publicUrl,
              });
            });
        },
      });
      const publicUrl = await quickTunnel.start();
      if (!publicUrl) {
        logger.warn("Temporary internet tunnel is unavailable; LAN/VPN live media remains active and tunnel retries will continue", {
          privateUrl: resolvedPublicUrl ?? "unavailable",
        });
      }
    } else if (tunnelMode === "named") {
      tunnel = startNamedTunnel(config.CLOUDFLARED_PATH, config.CLOUDFLARED_TUNNEL_TOKEN!, runtimeDirectory);
      resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL!;
      await waitForPublicGateway(new URL("/health", resolvedPublicUrl), 30_000);
      logger.info("Edge live media is reachable", { publicUrl: resolvedPublicUrl, tunnelMode });
    } else {
      if (!resolvedPublicUrl) throw new Error("No public media gateway URL was established");
      await waitForPublicGateway(new URL("/health", resolvedPublicUrl), 30_000);
      logger.info("Edge live media is reachable", { publicUrl: resolvedPublicUrl, tunnelMode });
    }

    return {
      get publicUrl() { return resolvedPublicUrl; },
      async stop() {
        quickTunnel?.stop();
        tunnel?.kill();
        await liveGateway?.close().catch(() => undefined);
        mediaMtx?.kill();
      },
    };
  } catch (error) {
    quickTunnel?.stop();
    tunnel?.kill();
    await liveGateway?.close().catch(() => undefined);
    mediaMtx?.kill();
    throw error;
  }
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

export function mediaTunnelOrigin(listenHost: string, port: number) {
  const connectHost = listenHost === "0.0.0.0" || listenHost === "::" || listenHost === "[::]"
    ? "127.0.0.1"
    : listenHost;
  const host = connectHost.includes(":") && !connectHost.startsWith("[") ? `[${connectHost}]` : connectHost;
  return `http://${host}:${port}`;
}

export function resolvePrivateMediaGatewayUrl(
  configuredUrl: string | undefined,
  port: number,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
) {
  if (configuredUrl !== "auto") return configuredUrl ?? "";
  const candidates: Array<{ address: string; priority: number; order: number }> = [];
  let order = 0;
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal || !isPrivateIpv4(address.address)) continue;
      candidates.push({ address: address.address, priority: privateInterfacePriority(name, address.address), order: order++ });
    }
  }
  const selected = candidates.sort((left, right) => left.priority - right.priority || left.order - right.order)[0];
  if (!selected) throw new Error("No private LAN or VPN IPv4 address is available for live media");
  return `http://${selected.address}:${port}`;
}

export function shouldReuseExistingMediaMtx(mediaRuntimeManaged: boolean, mediaMtxApiReady: boolean) {
  return mediaRuntimeManaged && mediaMtxApiReady;
}

export function resolvePrivateMediaGatewayUrlIfAvailable(
  port: number,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
) {
  try {
    return resolvePrivateMediaGatewayUrl("auto", port, interfaces);
  } catch {
    return undefined;
  }
}

function privateInterfacePriority(name: string, address: string) {
  if (/^(?:169\.254)\./.test(address)) return 4;
  if (/(?:vEthernet|WSL|Hyper-V|Docker|container|VMware|VirtualBox|Loopback|Npcap)/i.test(name)) return 3;
  if (/(?:Tailscale|ZeroTier|WireGuard|VPN|Tunnel)/i.test(name)) return 2;
  if (/(?:Wi-?Fi|Wireless|Ethernet|LAN)/i.test(name)) return 0;
  return 1;
}

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = octets as [number, number, number, number];
  return first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
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
# Fragmented MP4 supports both H.264 and H.265 (HEVC) streams across tunnels
hlsVariant: fmp4
hlsAllowOrigins: ['*']
rtsp: no
rtmp: no
webrtc: no
srt: no
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
  const child = startManagedProcess("Cloudflare Tunnel", executable, quickTunnelArgs(origin), cwd);
  try {
    const publicUrl = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Cloudflare quick tunnel did not provide a URL within 30 seconds")), 30_000);
      let output = "";
      let resolved = false;
      const inspect = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        output = `${output}${text}`.slice(-8_192);
        if (/Unauthorized: Tunnel not found/i.test(text) || /failed to serve incoming request/i.test(text)) {
          logger.warn("Cloudflare quick tunnel was invalidated by edge server; triggering restart");
          child.kill();
        }
        if (!resolved) {
          const publicUrl = extractQuickTunnelUrl(output);
          if (publicUrl) {
            resolved = true;
            clearTimeout(timeout);
            resolve(publicUrl);
          }
        }
      };
      child.stdout.on("data", inspect); child.stderr.on("data", inspect);
      child.once("error", (error) => { if (!resolved) { clearTimeout(timeout); reject(error); } });
      child.once("exit", (code) => { if (!resolved) { clearTimeout(timeout); reject(new Error(`Cloudflare quick tunnel exited (${code})`)); } });
    });
    return { process: child, publicUrl };
  } catch (error) {
    child.kill();
    throw error;
  }
}

export function quickTunnelArgs(origin: string) {
  return [
    "tunnel",
    // HTTP/2 uses TCP 7844 and remains stable on networks where UDP/QUIC is
    // intermittently blocked (a common ISP/router failure mode on Windows).
    "--protocol", "http2",
    "--edge-ip-version", "4",
    "--no-autoupdate",
    "--url", origin,
  ];
}

export function extractQuickTunnelUrl(output: string) {
  const matches = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi) ?? [];
  return matches.find((url) => new URL(url).hostname !== "api.trycloudflare.com");
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
async function isHttpReady(url: URL) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok;
  } catch {
    return false;
  }
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
  // CORS is handled by the edge gateway for the browser-facing request. Do
  // not let MediaMTX's static allow-list reject a renamed dashboard origin.
  for (const name of ["accept", "range", "user-agent"]) {
    const value = headers[name]; if (typeof value === "string") forwarded[name] = value;
  }
  return forwarded;
}
async function readBinaryBody(request: IncomingMessage, maximumBytes: number) {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); length += buffer.length;
    if (length > maximumBytes) throw new TalkbackTransportError("audio_chunk_too_large", 413);
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function setCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  if (request.headers["access-control-request-private-network"] === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  response.setHeader("Vary", "Origin");
}
function bearerToken(value: string | undefined) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}
