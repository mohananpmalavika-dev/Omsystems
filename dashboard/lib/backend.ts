import { demoBranches, demoCameras } from "./demo-data";
import type { Branch, Camera, LiveSessionResponse, RecordingJob, RecordingSegment, TalkSessionResponse } from "./types";
import { isBrowserDirectMediaUrl } from "./media-routing";

export async function listBranches(employeeSession?: string): Promise<Branch[]> {
  if (isDemoMode()) return demoBranches;
  const response = await controlFetch("/v1/branches", undefined, employeeSession);
  const body = await response.json() as { data: Branch[] };
  return body.data;
}

export async function listCameras(
  branchId: string,
  employeeSession?: string,
): Promise<Camera[]> {
  if (isDemoMode()) return demoCameras(branchId);
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
  const sessionId = `session-${Date.now()}-${cameraId}`;
  const fallbackSession: LiveSessionResponse = {
    demo: true,
    sessionId,
    cameraId,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    hls: {
      url: `/api/media/streams/${encodeURIComponent(cameraId)}/index.m3u8`,
      bearerToken: `token-${sessionId}`,
    },
  };

  if (isDemoMode()) {
    return fallbackSession;
  }

  try {
    const permission = await controlFetch(
      `/v1/cameras/${encodeURIComponent(cameraId)}/live-sessions`,
      { method: "POST", body: "{}" },
      employeeSession,
    );
    const controlSession = await permission.json() as {
      token?: string;
      mediaGatewayUrl?: string;
    };

    if (controlSession?.token) {
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
        new URL(
          "/v1/live/start",
          normalizeHttpOrigin(mediaGatewayUrl),
        ),
        {
          method: "POST",
          headers: bridgeHeaders(),
          body: JSON.stringify({ controlPlaneToken: controlSession.token }),
          cache: "no-store",
        },
      );

      if (mediaResponse.ok) {
        return await mediaResponse.json() as LiveSessionResponse;
      }
    }
  } catch (error) {
    console.warn("Live session media-gateway unavailable, returning fallback live session:", error);
  }

  return fallbackSession;
}

export async function getRecording(
  cameraId: string,
  employeeSession?: string,
): Promise<RecordingJob> {
  if (isDemoMode()) return demoRecording(cameraId);
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
  if (isDemoMode()) return {
    ...demoRecording(cameraId), ...job,
    status: job.enabled ? "recording" : "disabled",
  };
  return await (await controlFetch(`/v1/cameras/${encodeURIComponent(cameraId)}/recording`, {
    method: "PUT", body: JSON.stringify(job),
  }, employeeSession)).json() as RecordingJob;
}

export async function getRecordingSegment(
  segmentId: string,
  employeeSession?: string,
): Promise<RecordingSegment> {
  if (isDemoMode()) throw new Error("recording_playback_unavailable_in_demo");
  return await (await controlFetch(
    `/v1/recording-segments/${encodeURIComponent(segmentId)}`,
    undefined,
    employeeSession,
  )).json() as RecordingSegment;
}

function demoRecording(cameraId: string): RecordingJob {
  return {
    cameraId, mode: "continuous", enabled: true, status: "recording",
    primaryRecordingStorage: "recorder-local",
    cloudArchivePolicy: "incident-evidence-only",
    retentionDays: 180, postRollSeconds: 30, segmentDurationSeconds: 60,
    hotRetentionDays: 30, warmRetentionDays: 60, coldRetentionDays: 90,
    critical: false, backupRequired: false, automaticDeletionEnabled: true,
    evidenceProtection: true, recordMainStream: true,
  };
}

function isDemoMode() {
  return runtimeEnv("DASHBOARD_DEMO_MODE", "false") === "true";
}

async function controlFetch(
  path: string,
  init?: RequestInit,
  employeeSession?: string,
) {
  if (!employeeSession) {
    throw new Error("unauthenticated: no session token provided");
  }
  const response = await fetch(new URL(
    path,
    normalizeHttpOrigin(runtimeEnv(["CONTROL_PLANE_INTERNAL_URL", "CONTROL_PLANE_PUBLIC_URL", "CONTROL_PLANE_URL"], "http://localhost:8080")),
  ), {
    ...init,
    headers: {
      ...bridgeHeaders(),
      authorization: `Bearer ${employeeSession}`,
      ...init?.headers,
    },
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
  if (isDemoMode()) throw new Error("talkback_unavailable_in_demo");
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
