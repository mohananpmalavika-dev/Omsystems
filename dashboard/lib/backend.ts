import type { Branch, Camera, LiveSessionResponse, RecordingJob, RecordingSegment, TalkSessionResponse } from "./types";
import { isBrowserDirectMediaUrl } from "./media-routing";

const LIVE_START_TIMEOUT_MS = 8_000;

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
): Promise<LiveSessionResponse | {
  cameraId: string;
  direct: { url: string; controlPlaneToken: string };
}> {
  try {
    const permission = await controlFetch(
      `/v1/cameras/${encodeURIComponent(cameraId)}/live-sessions`,
      { method: "POST", body: "{}", signal: AbortSignal.timeout(LIVE_START_TIMEOUT_MS) },
      employeeSession,
    );
    const controlSession = await permission.json() as {
      token?: string;
      mediaGatewayUrl?: string;
    };

    if (!controlSession.token) {
      throw new Error("stream_secret_unavailable");
    }

    const mediaGatewayUrl = controlSession.mediaGatewayUrl ??
      runtimeEnv("MEDIA_GATEWAY_INTERNAL_URL", "http://localhost:8090");

    if (controlSession.mediaGatewayUrl && isBrowserDirectMediaUrl(mediaGatewayUrl)) {
      return {
        cameraId,
        direct: {
          url: new URL("/v1/live/start", normalizeHttpOrigin(mediaGatewayUrl)).toString(),
          controlPlaneToken: controlSession.token,
        },
      };
    }

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
    return await mediaResponse.json() as LiveSessionResponse;
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
) {
  const developmentUserId = process.env.NODE_ENV !== "production"
    ? runtimeEnv("DASHBOARD_DEV_USER_ID", "")
    : "";
  const headers = {
    ...bridgeHeaders(),
    ...(employeeSession
      ? { authorization: `Bearer ${employeeSession}` }
      : developmentUserId
        ? { "x-user-id": developmentUserId }
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

export async function startTalk(
  cameraId: string,
  employeeSession?: string,
): Promise<TalkSessionResponse | {
  cameraId: string;
  direct: { url: string; controlPlaneToken: string };
}> {
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
