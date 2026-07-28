import type { CameraHealth } from "@/lib/types/operational-health";

export const CAMERA_WALL_LAYOUTS = [2, 3, 4] as const;
export type CameraWallColumns = (typeof CAMERA_WALL_LAYOUTS)[number];

export function cameraPlaybackHref(branchId: string, cameraId: string) {
  const params = new URLSearchParams({ branchId, cameraId });
  return `/recordings?${params}`;
}

export function canStartCamera(camera: CameraHealth) {
  return camera.onlineStatus !== "offline" && camera.onlineStatus !== "unknown";
}

export function cameraStatusTone(camera: CameraHealth) {
  if (camera.videoLoss || camera.tamperingDetected || camera.imageFrozen) return "critical";
  if (camera.onlineStatus === "online") return "healthy";
  if (camera.onlineStatus === "warning" || camera.onlineStatus === "degraded") return "warning";
  return "critical";
}
