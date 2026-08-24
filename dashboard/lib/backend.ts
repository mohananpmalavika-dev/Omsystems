import type { Branch, Camera, LiveSessionResponse, RecordingJob, RecordingSegment, TalkSessionResponse } from "./types";
import { isBrowserDirectMediaUrl } from "./media-routing";

const LIVE_START_TIMEOUT_MS = 8_000;

type DirectLiveGateway = {
  url: string;
  controlPlaneToken: string;
};

type DirectLiveStart = {
  cameraId: string;
  direct: DirectLiveGateway;
  directFallbacks?: DirectLiveGateway[];
};

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
    };

    if (!controlSession.token) {
      throw new Error("stream_secret_unavailable");
    }

    const sessionMediaGatewayUrl = controlSession.mediaGatewayUrl;
    const advertisedLocalMediaGatewayUrl = controlSession.localMediaGatewayUrl;
    // Prefer the dashboard's explicitly configured branch-local/VPN gateway
    // even when the control plane still advertises a public tunnel URL. This
    // is important when operators are on the branch network and the temporary
    // public tunnel has expired or changed its hostname.
    const configuredLocalMediaGatewayUrl = resolveConfiguredLocalMediaGatewayUrl();
    const localMediaGatewayUrl = configuredLocalMediaGatewayUrl ??
      (advertisedLocalMediaGatewayUrl && isBrowserDirectMediaUrl(advertisedLocalMediaGatewayUrl)
        ? advertisedLocalMediaGatewayUrl
        : undefined) ??
      (sessionMediaGatewayUrl && isBrowserDirectMediaUrl(sessionMediaGatewayUrl)
        ? sessionMediaGatewayUrl
        : undefined);
    const publicMediaGatewayUrl = resolveConfiguredPublicMediaGatewayUrl(
      sessionMediaGatewayUrl ?? localMediaGatewayUrl,
    );

    if (localMediaGatewayUrl) {
      const direct: DirectLiveGateway = {
        url: new URL("/v1/live/start", normalizeHttpOrigin(localMediaGatewayUrl)).toString(),
        controlPlaneToken: controlSession.token,
      };
      const directFallbacks = publicMediaGatewayUrl && publicMediaGatewayUrl !== localMediaGatewayUrl
        ? [{
          url: new URL("/v1/live/start", normalizeHttpOrigin(publicMediaGatewayUrl)).toString(),
          controlPlaneToken: controlSession.token,
        }]
        : undefined;
      return { cameraId, direct, ...(directFallbacks ? { directFallbacks } : {}) };
    }

    const mediaGatewayUrl = publicMediaGatewayUrl ??
      controlSession.mediaGatewayUrl ??
      runtimeEnv("MEDIA_GATEWAY_INTERNAL_URL", "http://localhost:8090");

    const mediaResponse = await fetch(
      new URL("/v1/live/start", normalizeHttpOrigin(mediaGatewayUrl)),
      {
        method: "POST",
        headers: bridgeHeaders(),
        body: JSON.stringify({ controlPlaneToken: controlSession.token }),
        cache: "no-store",
        signal: AbortSignal.timeout(LIVE_START_TIMEOUT_MS),
      },
    );
    if (!mediaResponse.ok) {
      const body = await mediaResponse.json().catch(() => ({})) as { error?: unknown };
      throw new Error(typeof body.error === "string" ? body.error : "media_gateway_failure");
    }
    return rewriteLiveMediaUrls(
      await mediaResponse.json() as LiveSessionResponse,
      mediaGatewayUrl,
    );
  } catch (error) {
    // Preserve the upstream error so the UI can show a truthful retryable
    // state instead of inventing a stream session.
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

function runtimeEnv(name: string | string[], fallback: string) {
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
  if (sourceGatewayUrl) {
    try {
      if (new URL(sourceGatewayUrl).protocol === "https:") return sourceGatewayUrl;
    } catch {
      // Continue with the configured fallback URLs.
    }
  }
  const mappedUrl = resolveMappedPublicMediaGatewayUrl(sourceGatewayUrl);
  if (mappedUrl) return mappedUrl;

  const candidates = [
    runtimeEnv("MEDIA_GATEWAY_PUBLIC_URL", ""),
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
  if (controlSession.mediaGatewayUrl && isBrowserDirectMediaUrl(mediaGatewayUrl)) {
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
