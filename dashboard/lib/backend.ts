import { demoBranches, demoCameras } from "./demo-data";
import type { Branch, Camera, LiveSessionResponse } from "./types";

export async function listBranches(): Promise<Branch[]> {
  if (isDemoMode()) return demoBranches;
  const response = await controlFetch("/v1/branches");
  const body = await response.json() as { data: Branch[] };
  return body.data;
}

export async function listCameras(branchId: string): Promise<Camera[]> {
  if (isDemoMode()) return demoCameras(branchId);
  const response = await controlFetch(
    `/v1/branches/${encodeURIComponent(branchId)}/cameras`,
  );
  const body = await response.json() as { data: Camera[] };
  return body.data.map((camera) => ({
    ...camera,
    name: camera.name || camera.model,
  }));
}

export async function startLive(cameraId: string): Promise<LiveSessionResponse> {
  if (isDemoMode()) return { demo: true, cameraId };
  const permission = await controlFetch(
    `/v1/cameras/${encodeURIComponent(cameraId)}/live-sessions`,
    { method: "POST", body: "{}" },
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

function isDemoMode() {
  return runtimeEnv("DASHBOARD_DEMO_MODE", "true") !== "false";
}

async function controlFetch(path: string, init?: RequestInit) {
  const response = await fetch(new URL(
    path,
    runtimeEnv("CONTROL_PLANE_INTERNAL_URL", "http://localhost:8080"),
  ), {
    ...init,
    headers: {
      ...bridgeHeaders(),
      "x-user-id": runtimeEnv(
        "DASHBOARD_DEV_USER_ID",
        "user-south-operator",
      ),
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
