import type { LiveSessionResponse } from "@/lib/types";

interface BrowserDirectLiveStart {
  cameraId: string;
  direct: {
    url: string;
    controlPlaneToken: string;
  };
  directFallbacks?: Array<{
    url: string;
    controlPlaneToken: string;
  }>;
}

const LIVE_START_TIMEOUT_MS = 30_000;

export async function startLiveFromBrowser(
  cameraId: string,
  profile: "main" | "sub" = "sub",
  signal: AbortSignal = AbortSignal.timeout(LIVE_START_TIMEOUT_MS),
): Promise<LiveSessionResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers["x-sentinel-session"] = token;
    headers["authorization"] = `Bearer ${token}`;
  }

  let authorization: Response;
  try {
    authorization = await fetch("/api/live", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ cameraId, profile }),
      signal,
    });
  } catch (error) {
    throw timeoutError(error);
  }
  const body = await readJson(authorization);
  if (!authorization.ok) throw new Error(errorCode(body, "live_session_unavailable"));
  if (!isBrowserDirectLiveStart(body)) return body as LiveSessionResponse;

  const candidates = [body.direct, ...(body.directFallbacks ?? [])]
    .filter((candidate) => isAllowedGatewayForCurrentPage(candidate.url));

  if (candidates.length === 0) {
    // When direct browser-to-gateway is blocked by HTTPS mixed content (HTTPS page -> HTTP local gateway),
    // fallback seamlessly to the snapshot relay stream instead of throwing an error.
    return {
      sessionId: body.direct.controlPlaneToken,
      cameraId,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      hls: {
        url: `/api/media/snapshot-relay?cameraId=${encodeURIComponent(cameraId)}`,
        bearerToken: body.direct.controlPlaneToken,
      },
      webRtc: {
        whepUrl: "",
        bearerToken: body.direct.controlPlaneToken,
      },
    };
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    let localResponse: Response;
    try {
      localResponse = await fetch(candidate.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: candidate.controlPlaneToken }),
        cache: "no-store",
        signal,
      });
    } catch (error) {
      const normalized = timeoutError(error);
      if (normalized instanceof Error && normalized.message === "live_session_timeout") throw normalized;
      lastError = normalized === error
        ? new Error("local_media_gateway_unavailable", { cause: error })
        : normalized;
      continue;
    }

    const localBody = await readJson(localResponse);
    if (!localResponse.ok) continue;
    return rewriteLiveMediaUrls(localBody as LiveSessionResponse, candidate.url);
  }

  // If direct connection attempts fail, fallback to snapshot relay rather than breaking the tile
  return {
    sessionId: body.direct.controlPlaneToken,
    cameraId,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    hls: {
      url: `/api/media/snapshot-relay?cameraId=${encodeURIComponent(cameraId)}`,
      bearerToken: body.direct.controlPlaneToken,
    },
    webRtc: {
      whepUrl: "",
      bearerToken: body.direct.controlPlaneToken,
    },
  };
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
