import { demoBranches, demoCameras } from "./demo-data";
import type { Branch, Camera, LiveSessionResponse, RecordingJob, RecordingSegment } from "./types";

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
): Promise<LiveSessionResponse> {
  if (isDemoMode()) return { demo: true, cameraId };
  const permission = await controlFetch(
    `/v1/cameras/${encodeURIComponent(cameraId)}/live-sessions`,
    { method: "POST", body: "{}" },
    employeeSession,
  );
  const controlSession = await permission.json() as { token: string };
  const mediaResponse = await fetch(
    new URL(
      "/v1/live/start",
      runtimeEnv("MEDIA_GATEWAY_INTERNAL_URL", "http://localhost:8090"),
    ),
    {
      method: "POST",
      headers: bridgeHeaders(),
      body: JSON.stringify({ controlPlaneToken: controlSession.token }),
      cache: "no-store",
    },
  );
  if (!mediaResponse.ok) throw new Error(`Media gateway returned ${mediaResponse.status}`);
  return await mediaResponse.json() as LiveSessionResponse;
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
    retentionDays: 180, postRollSeconds: 30, segmentDurationSeconds: 60,
    hotRetentionDays: 30, warmRetentionDays: 60, coldRetentionDays: 90,
    critical: false, backupRequired: false, automaticDeletionEnabled: true,
    evidenceProtection: true, recordMainStream: true,
  };
}

function isDemoMode() {
  return runtimeEnv("DASHBOARD_DEMO_MODE", "true") !== "false";
}

async function controlFetch(
  path: string,
  init?: RequestInit,
  employeeSession?: string,
) {
  const response = await fetch(new URL(
    path,
    runtimeEnv("CONTROL_PLANE_INTERNAL_URL", "http://localhost:8080"),
  ), {
    ...init,
    headers: {
      ...bridgeHeaders(),
      ...(employeeSession
        ? { authorization: `Bearer ${employeeSession}` }
        : {
            "x-user-id": runtimeEnv(
              "DASHBOARD_DEV_USER_ID",
              "user-global-admin",
            ),
          }),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Control plane returned ${response.status}`);
  return response;
}

function runtimeEnv(name: string, fallback: string) {
  const value = Reflect.get(process.env, name) as string | undefined;
  return value ?? fallback;
}

function bridgeHeaders() {
  const key = runtimeEnv("EDGE_BRIDGE_SHARED_KEY", "");
  return {
    "content-type": "application/json",
    ...(key ? { "x-edge-bridge-key": key } : {}),
  };
}
