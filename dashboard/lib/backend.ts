import { demoBranches, demoCameras } from "./demo-data";
import type { Branch, Camera, LiveSessionResponse } from "./types";

const demoMode = process.env.DASHBOARD_DEMO_MODE !== "false";
const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL ?? "http://localhost:8080";
const mediaGatewayUrl = process.env.MEDIA_GATEWAY_INTERNAL_URL ?? "http://localhost:8090";
const developmentUserId = process.env.DASHBOARD_DEV_USER_ID ?? "user-south-operator";

export async function listBranches(): Promise<Branch[]> {
  if (demoMode) return demoBranches;
  const response = await controlFetch("/v1/branches");
  const body = await response.json() as { data: Branch[] };
  return body.data;
}

export async function listCameras(branchId: string): Promise<Camera[]> {
  if (demoMode) return demoCameras(branchId);
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
  if (demoMode) return { demo: true, cameraId };
  const permission = await controlFetch(
    `/v1/cameras/${encodeURIComponent(cameraId)}/live-sessions`,
    { method: "POST" },
  );
  const controlSession = await permission.json() as { token: string };
  const mediaResponse = await fetch(
    new URL("/v1/live/start", mediaGatewayUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: controlSession.token }),
      cache: "no-store",
    },
  );
  if (!mediaResponse.ok) throw new Error(`Media gateway returned ${mediaResponse.status}`);
  return await mediaResponse.json() as LiveSessionResponse;
}

async function controlFetch(path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, controlPlaneUrl), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-user-id": developmentUserId,
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Control plane returned ${response.status}`);
  return response;
}
