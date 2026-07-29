import type { CameraHealth } from "@/lib/types/operational-health";

export const CAMERA_WALL_LAYOUTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
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

export function cameraSequenceWindow(cameras: CameraHealth[], decoderBudget: number, offset: number) {
  const reachable = cameras.filter(canStartCamera);
  if (reachable.length <= decoderBudget) return reachable;
  const start = ((offset % reachable.length) + reachable.length) % reachable.length;
  return [...reachable.slice(start), ...reachable.slice(0, start)].slice(0, decoderBudget);
}
