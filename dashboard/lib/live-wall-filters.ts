import type { Camera } from "./types";

export type LiveWallStatusFilter = "ALL" | "ONLINE" | "OFFLINE" | "ALERT";
// An empty selection includes every accessible value at that level.
export type LiveWallSelection = string | string[];

export function matchesLiveWallSelection(selection: LiveWallSelection, value?: string): boolean {
  return Array.isArray(selection) ? !selection.length || selection.includes(value ?? "") : selection === "ALL" || selection === value;
}

export interface LiveWallScope {
  zone: LiveWallSelection;
  region: LiveWallSelection;
  area: LiveWallSelection;
  branchId: LiveWallSelection;
  query: string;
  status: LiveWallStatusFilter;
  hideUnavailable: boolean;
}

export interface LiveWallBranch {
  branchId: string;
  branchName?: string;
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
    if (Array.isArray(scope.branchId)) {
      if (scope.branchId.length && !scope.branchId.includes(branchId)) return false;
    } else if (scope.branchId !== "ALL") {
      const target = scope.branchId.trim().toLowerCase();
      const matchId = branchId.toLowerCase() === target;
      const matchCameraBranchName = camera.branchName?.trim().toLowerCase() === target;
      const matchBranchObjName = branch?.branchName?.trim().toLowerCase() === target;
      if (!matchId && !matchCameraBranchName && !matchBranchObjName) return false;
    }
    if (!matchesLiveWallSelection(scope.zone, branch?.zone)) return false;
    if (!matchesLiveWallSelection(scope.region, branch?.region)) return false;
    if (!matchesLiveWallSelection(scope.area, branch?.area)) return false;
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
