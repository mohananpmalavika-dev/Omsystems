import type { Branch, Camera, LiveSessionResponse, RecordingJob, RecordingSegment, TalkSessionResponse } from "./types";
import { isBrowserDirectMediaUrl } from "./media-routing";

// Render -> public tunnel -> local media gateway can take longer than a
// normal API request while the tunnel wakes up or the camera path is created.
const LIVE_START_TIMEOUT_MS = 30_000;

type DirectLiveGateway = {
  url: string;
  controlPlaneToken: string;
};

type DirectLiveStart = {
  cameraId: string;
  direct: DirectLiveGateway;
  directFallbacks?: DirectLiveGateway[];
};

export type LiveRoutePreference = "auto" | "public";

export async function listBranches(employeeSession?: string): Promise<Branch[]> {
  const response = await controlFetch("/v1/branches", undefined, employeeSession);
  const body = await response.json() as { data: Branch[] };
  return body.data;
}

export async function listCameras(
  branchId: string,
  employeeSession?: string,
): Promise<Camera[]> {
  const response = await controlFetch(
    `/v1/branches/${encodeURIComponent(branchId)}/cameras`,
    undefined,
    employeeSession,
  );
  const body = await response.json() as { data: Camera[] };
  return body.data.map((camera) => ({
    ...camera,
    name: camera.name || camera.model,
  }));
}

export async function startLive(
  cameraId: string,
  employeeSession?: string,
  routePreference: LiveRoutePreference = "auto",
): Promise<LiveSessionResponse | DirectLiveStart> {
  try {
    // Keep live authorization aligned with the dashboard control proxy. When
    // Render protects the dashboard with Basic Auth, there may be no employee
    // session cookie even though the rest of the dashboard is authorized via
    // its configured dashboard identity.
    const dashboardUserId = employeeSession
      ? undefined
      : runtimeEnv("DASHBOARD_DEV_USER_ID", "user-global-admin");
    const permission = await controlFetch(
      `/v1/cameras/${encodeURIComponent(cameraId)}/live-sessions`,
      { method: "POST", body: "{}", signal: AbortSignal.timeout(LIVE_START_TIMEOUT_MS) },
      employeeSession,
      dashboardUserId,
    );
    const controlSession = await permission.json() as {
      token?: string;
      mediaGatewayUrl?: string;
      localMediaGatewayUrl?: string;
      expiresAt?: string;
    };

    if (!controlSession.token) {
      throw new Error("stream_secret_unavailable");
    }

    const sessionMediaGatewayUrl = controlSession.mediaGatewayUrl;
    const advertisedLocalMediaGatewayUrl = controlSession.localMediaGatewayUrl;
    // The browser, not a hosted dashboard server, is the only component that
    // can know whether it is currently on a branch VPN/LAN. Prefer its direct
    // per-camera route first, then let the caller request a fresh public
    // tunnel session if the browser cannot reach that private address.
    const configuredLocalMediaGatewayUrl = resolveConfiguredLocalMediaGatewayUrl();
    const advertisedLocalGatewayUrl = advertisedLocalMediaGatewayUrl &&
      isBrowserDirectMediaUrl(advertisedLocalMediaGatewayUrl)
      ? advertisedLocalMediaGatewayUrl
      : undefined;
    const publicMediaGatewayUrl = resolveConfiguredPublicMediaGatewayUrl(
      sessionMediaGatewayUrl,
    );
    // Older enrolled agents reported their LAN/VPN URL in mediaGatewayUrl
    // before localMediaGatewayUrl was introduced. Treat that address as a
    // browser-direct candidate too; a hosted dashboard must never try to
    // fetch a branch-private IP itself.
    const legacyLocalGatewayUrl = sessionMediaGatewayUrl &&
      isBrowserDirectMediaUrl(sessionMediaGatewayUrl)
      ? sessionMediaGatewayUrl
      : undefined;
    const localMediaGatewayUrl = configuredLocalMediaGatewayUrl ??
      advertisedLocalGatewayUrl ?? legacyLocalGatewayUrl;

    const isProduction = runtimeEnv("NODE_ENV", "development") === "production";
    if (routePreference === "auto" && localMediaGatewayUrl) {
      // A branch agent advertises its private LAN/VPN address on every
      // heartbeat. Never try that address from the hosted dashboard server:
      // only the operator's browser may be on that private network. The
      // browser client applies the page's HTTPS/mixed-content policy before
      // connecting, so an HTTP gateway remains usable from an HTTP local/VPN
      // dashboard and a trusted HTTPS gateway remains usable in production.
      const direct: DirectLiveGateway = {
        url: new URL("/v1/live/start", normalizeHttpOrigin(localMediaGatewayUrl)).toString(),
        controlPlaneToken: controlSession.token,
      };
      return { cameraId, direct };
    }

    const mediaGatewayUrl = controlSession.mediaGatewayUrl ??
      runtimeEnv("MEDIA_GATEWAY_INTERNAL_URL", "http://localhost:8090");

    if (routePreference === "auto" && controlSession.mediaGatewayUrl &&
        isBrowserDirectMediaUrl(mediaGatewayUrl) && (!isProduction || isHttpsUrl(mediaGatewayUrl))) {
      return {
        cameraId,
        direct: {
          url: new URL("/v1/live/start", normalizeHttpOrigin(mediaGatewayUrl)).toString(),
          controlPlaneToken: controlSession.token,
        },
      };
    }

    let mediaResponse: Response;
    try {
      mediaResponse = await fetch(
        new URL("/v1/live/start", normalizeHttpOrigin(mediaGatewayUrl)),
        {
          method: "POST",
          headers: bridgeHeaders(),
          body: JSON.stringify({ controlPlaneToken: controlSession.token }),
          cache: "no-store",
          signal: AbortSignal.timeout(LIVE_START_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new Error("media_gateway_unavailable", { cause: error });
    }

    if (!mediaResponse.ok) {
      const body = await mediaResponse.json().catch(() => ({})) as { error?: unknown };
      throw new Error(typeof body.error === "string" ? body.error : "media_gateway_failure");
    }

    return rewriteLiveMediaUrls(
      await mediaResponse.json() as LiveSessionResponse,
      mediaGatewayUrl,
    );
  } catch (error) {
    throw error;
  }
}

export async function getRecording(
  cameraId: string,
  employeeSession?: string,
): Promise<RecordingJob> {
  return await (await controlFetch(
    `/v1/cameras/${encodeURIComponent(cameraId)}/recording`,
    undefined,
    employeeSession,
  )).json() as RecordingJob;
}

export async function updateRecording(
  cameraId: string,
  job: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">> &
    Pick<RecordingJob, "mode" | "enabled">,
  employeeSession?: string,
): Promise<RecordingJob> {
  return await (await controlFetch(`/v1/cameras/${encodeURIComponent(cameraId)}/recording`, {
    method: "PUT", body: JSON.stringify(job),
  }, employeeSession)).json() as RecordingJob;
}

export async function getRecordingSegment(
  segmentId: string,
  employeeSession?: string,
): Promise<RecordingSegment> {
  return await (await controlFetch(
    `/v1/recording-segments/${encodeURIComponent(segmentId)}`,
    undefined,
    employeeSession,
  )).json() as RecordingSegment;
}

async function controlFetch(
  path: string,
  init?: RequestInit,
  employeeSession?: string,
  fallbackUserId?: string,
) {
  const resolvedFallbackUserId = fallbackUserId ?? (process.env.NODE_ENV !== "production"
    ? runtimeEnv("DASHBOARD_DEV_USER_ID", "")
    : "");
  const headers = {
    ...bridgeHeaders(),
    ...(employeeSession
      ? { authorization: `Bearer ${employeeSession}` }
      : resolvedFallbackUserId
        ? { "x-user-id": resolvedFallbackUserId }
        : {}),
    ...init?.headers,
  };
  const response = await fetch(new URL(
    path,
    normalizeHttpOrigin(runtimeEnv(["CONTROL_PLANE_INTERNAL_URL", "CONTROL_PLANE_PUBLIC_URL", "CONTROL_PLANE_URL"], "http://localhost:8080")),
  ), {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.clone().json().catch(() => ({})) as { error?: unknown };
    const code = typeof body.error === "string" ? body.error : `Control plane returned ${response.status}`;
    throw new Error(code);
  }
  return response;
}

function runtimeEnv(name: string | string[], fallback = "") {
  if (Array.isArray(name)) {
    for (const key of name) {
      const value = Reflect.get(process.env, key) as string | undefined;
      if (value) return value;
    }
    return fallback;
  }
  const value = Reflect.get(process.env, name) as string | undefined;
  return value ?? fallback;
}

function resolveConfiguredPublicMediaGatewayUrl(sourceGatewayUrl?: string) {
  const mappedUrl = resolveMappedPublicMediaGatewayUrl(sourceGatewayUrl);
  if (mappedUrl) return mappedUrl;

  const candidates = [
    runtimeEnv("MEDIA_GATEWAY_PUBLIC_URL", ""),
    sourceGatewayUrl ?? "",
    runtimeEnv("MEDIA_GATEWAY_INTERNAL_URL", ""),
  ];
  return candidates.find((candidate) => {
    try { return new URL(candidate).protocol === "https:"; } catch { return false; }
  });
}

function resolveMappedPublicMediaGatewayUrl(sourceGatewayUrl?: string) {
  if (!sourceGatewayUrl) return undefined;
  const raw = runtimeEnv("MEDIA_GATEWAY_PUBLIC_URLS", "");
  if (!raw) return undefined;

  try {
    const mappings = JSON.parse(raw) as Record<string, unknown>;
    const source = new URL(sourceGatewayUrl);
    const match = Object.entries(mappings).find(([key, value]) => {
      if (typeof value !== "string") return false;
      try { return new URL(key).origin === source.origin; } catch { return false; }
    });
    if (!match) return undefined;
    return new URL(match[1] as string).protocol === "https:" ? match[1] as string : undefined;
  } catch {
    return undefined;
  }
}

function resolveConfiguredLocalMediaGatewayUrl() {
  const candidate = runtimeEnv("MEDIA_GATEWAY_LOCAL_URL", "");
  try {
    const protocol = new URL(candidate).protocol;
    return protocol === "http:" || protocol === "https:" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function isHttpsUrl(value?: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function rewriteLiveMediaUrls(session: LiveSessionResponse, mediaGatewayUrl: string): LiveSessionResponse {
  let gateway: URL;
  try { gateway = new URL(mediaGatewayUrl); } catch { return session; }
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

export async function startTalk(
  cameraId: string,
  employeeSession?: string,
): Promise<TalkSessionResponse | DirectLiveStart> {
  const permission = await controlFetch(
    `/v1/cameras/${encodeURIComponent(cameraId)}/talk-sessions`,
    { method: "POST", body: "{}" },
    employeeSession,
  );
  const controlSession = await permission.json() as { token: string; mediaGatewayUrl?: string };
  const mediaGatewayUrl = controlSession.mediaGatewayUrl ??
    runtimeEnv("MEDIA_GATEWAY_INTERNAL_URL", "http://localhost:8090");
  const isProduction = runtimeEnv("NODE_ENV", "development") === "production";
  if (controlSession.mediaGatewayUrl && isBrowserDirectMediaUrl(mediaGatewayUrl) && (!isProduction || isHttpsUrl(mediaGatewayUrl))) {
    return {
      cameraId,
      direct: {
        url: new URL("/v1/talk/start", normalizeHttpOrigin(mediaGatewayUrl)).toString(),
        controlPlaneToken: controlSession.token,
      },
    };
  }
  const response = await fetch(new URL("/v1/talk/start", normalizeHttpOrigin(mediaGatewayUrl)), {
    method: "POST",
    headers: bridgeHeaders(),
    body: JSON.stringify({ controlPlaneToken: controlSession.token }),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown };
    throw new Error(typeof body.error === "string" ? body.error : "talkback_unavailable");
  }
  return await response.json() as TalkSessionResponse;
}

function normalizeHttpOrigin(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

function bridgeHeaders() {
  const key = runtimeEnv("EDGE_BRIDGE_SHARED_KEY", "");
  return {
    "content-type": "application/json",
    ...(key ? { "x-edge-bridge-key": key } : {}),
  };
}
