import type { Camera } from "./types";

export type LiveWallStatusFilter = "ALL" | "ONLINE" | "OFFLINE" | "ALERT";

export interface LiveWallScope {
  zone: string;
  region: string;
  area: string;
  branchId: string;
  query: string;
  status: LiveWallStatusFilter;
  hideUnavailable: boolean;
}

export interface LiveWallBranch {
  branchId: string;
  zone: string;
  region: string;
  area: string;
}

export function isLiveWallCameraOnline(camera: Pick<Camera, "status">): boolean {
  return camera.status === "online" || camera.status === "degraded" || camera.status === "alert";
}

export function selectLiveWallCameras(
  cameras: Camera[],
  branches: LiveWallBranch[],
  priorityCameraIds: string[],
  scope: LiveWallScope,
) {
  const branchMap = new Map(branches.map((branch) => [branch.branchId, branch]));
  const prioritySet = new Set(priorityCameraIds);
  const query = scope.query.trim().toLowerCase();
  const scoped = cameras.filter((camera) => {
    const branchId = camera.branchId || "default-branch";
    const branch = branchMap.get(branchId);
    if (scope.branchId !== "ALL" && branchId !== scope.branchId) return false;
    if (scope.zone !== "ALL" && branch?.zone !== scope.zone) return false;
    if (scope.region !== "ALL" && branch?.region !== scope.region) return false;
    if (scope.area !== "ALL" && branch?.area !== scope.area) return false;
    return !query || [
      camera.name, camera.branchName || `Branch ${branchId}`, camera.ipAddress,
      String(camera.channel ?? ""), camera.vendor,
    ].some((value) => value?.toLowerCase().includes(query));
  });

  const counts = {
    total: scoped.length,
    online: scoped.filter(isLiveWallCameraOnline).length,
    offline: scoped.filter((camera) => camera.status === "offline").length,
    alerts: scoped.filter((camera) => prioritySet.has(camera.id)).length,
  };
  const filtered = scoped.filter((camera) => {
    if (scope.status === "OFFLINE") return camera.status === "offline";
    if (scope.status === "ALERT") return prioritySet.has(camera.id);
    if (scope.status === "ONLINE") return isLiveWallCameraOnline(camera);
    return !scope.hideUnavailable || isLiveWallCameraOnline(camera);
  });

  return { cameras: filtered, counts, branchCount: new Set(filtered.map((camera) => camera.branchId || "default-branch")).size };
}
