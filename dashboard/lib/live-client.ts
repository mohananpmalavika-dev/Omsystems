import type { LiveSessionResponse } from "@/lib/types";

interface BrowserDirectLiveStart {
  cameraId: string;
  direct: {
    url: string;
    controlPlaneToken: string;
  };
}

interface DirectSessionAttempt {
  session?: LiveSessionResponse;
  error?: string;
}

const LIVE_START_TIMEOUT_MS = 30_000;
const DIRECT_GATEWAY_ATTEMPT_TIMEOUT_MS = 2_500;

export async function startLiveFromBrowser(
  cameraId: string,
  profile: "main" | "sub" = "sub",
  signal: AbortSignal = AbortSignal.timeout(LIVE_START_TIMEOUT_MS),
): Promise<LiveSessionResponse> {
  const authorization = await requestLiveAuthorization(cameraId, profile, "auto", signal);
  if (!isBrowserDirectLiveStart(authorization)) return authorization;

  const direct = await startDirectSession(authorization, signal);
  if (direct.session) return direct.session;

  // A private branch address is reachable only from an operator on that
  // branch LAN/VPN. Ask for a new, single-use session before trying the
  // branch's public/named-tunnel route from outside that private network.
  try {
    const publicRoute = await requestLiveAuthorization(cameraId, profile, "public", signal);
    if (!isBrowserDirectLiveStart(publicRoute)) return publicRoute;
    const publicDirect = await startDirectSession(publicRoute, signal);
    if (publicDirect.session) return publicDirect.session;
    if (publicDirect.error) throw new Error(publicDirect.error);
  } catch (error) {
    if (signal.aborted) throw timeoutError(signal.reason ?? error);
    if (error instanceof Error) throw error;
    throw new Error("media_gateway_unavailable");
  }

  throw new Error(direct.error ?? "media_gateway_unavailable");
}

export async function releaseLiveSession(session: LiveSessionResponse | undefined) {
  if (!session?.sessionId) return;
  try {
    const mediaUrl = session.hls?.url ?? session.webRtc?.whepUrl;
    const bearerToken = session.hls?.bearerToken ?? session.webRtc?.bearerToken;
    if (!mediaUrl || !bearerToken) return;
    const source = new URL(mediaUrl);
    const releaseUrl = `${source.origin}/v1/live/${encodeURIComponent(session.sessionId)}`;
    await fetch(releaseUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bearerToken}` },
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // Session TTL remains the fallback when the gateway is unreachable.
  }
}

async function requestLiveAuthorization(
  cameraId: string,
  profile: "main" | "sub",
  routePreference: "auto" | "public",
  signal: AbortSignal,
): Promise<LiveSessionResponse | BrowserDirectLiveStart> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers["x-sentinel-session"] = token;
    headers["authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch("/api/live", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ cameraId, profile, routePreference }),
      signal,
    });
  } catch (error) {
    throw timeoutError(error);
  }
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorCode(body, "live_session_unavailable"));
  return body as LiveSessionResponse | BrowserDirectLiveStart;
}

async function startDirectSession(
  authorization: BrowserDirectLiveStart,
  signal: AbortSignal,
): Promise<DirectSessionAttempt> {
  const candidate = authorization.direct;
  if (!isAllowedGatewayForCurrentPage(candidate.url)) return {};

  let localResponse: Response;
  try {
    const attemptSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(DIRECT_GATEWAY_ATTEMPT_TIMEOUT_MS),
    ]);
    localResponse = await fetch(candidate.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: candidate.controlPlaneToken }),
      cache: "no-store",
      signal: attemptSignal,
    });
  } catch (error) {
    // A branch-local gateway can be offline or unreachable from the current
    // network. Keep enough of the overall startup budget to request a fresh,
    // single-use authorization for its secure tunnel.
    if (signal.aborted) throw timeoutError(signal.reason ?? error);
    return {};
  }

  const localBody = await readJson(localResponse);
  if (!localResponse.ok) {
    return { error: errorCode(localBody, "media_gateway_failure") };
  }
  return { session: rewriteLiveMediaUrls(localBody as LiveSessionResponse, candidate.url) };
}

function isBrowserDirectLiveStart(value: unknown): value is BrowserDirectLiveStart {
  if (!value || typeof value !== "object") return false;
  const direct = Reflect.get(value, "direct");
  return Boolean(direct && typeof direct === "object" &&
    typeof Reflect.get(direct, "url") === "string" &&
    typeof Reflect.get(direct, "controlPlaneToken") === "string");
}

async function readJson(response: Response): Promise<unknown> {
  return await response.json().catch(() => ({}));
}

function errorCode(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = Reflect.get(value, "error");
  return typeof error === "string" ? error : fallback;
}

function isAllowedGatewayForCurrentPage(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return typeof window === "undefined" || window.location.protocol !== "https:" || protocol === "https:";
  } catch {
    return false;
  }
}

function rewriteLiveMediaUrls(session: LiveSessionResponse, gatewayUrl: string): LiveSessionResponse {
  let gateway: URL;
  try { gateway = new URL(gatewayUrl); } catch { return session; }
  if (gateway.protocol !== "https:") return session;

  const rewrite = (value: string) => {
    try {
      const source = new URL(value);
      if (source.protocol !== "http:") return value;
      return new URL(`${source.pathname}${source.search}`, gateway).toString();
    } catch {
      return value;
    }
  };

  return {
    ...session,
    ...(session.hls ? { hls: { ...session.hls, url: rewrite(session.hls.url) } } : {}),
    ...(session.webRtc ? { webRtc: { ...session.webRtc, whepUrl: rewrite(session.webRtc.whepUrl) } } : {}),
  };
}

function timeoutError(error: unknown) {
  return error instanceof DOMException && error.name === "TimeoutError"
    ? new Error("live_session_timeout")
    : error;
}
