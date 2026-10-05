import type { LiveWallStatusFilter } from "./live-wall-filters";

export interface LiveWallWindowScope {
  zones: string[];
  regions: string[];
  areas: string[];
  branches: string[];
  query: string;
  status: LiveWallStatusFilter;
  hideUnavailable: boolean;
  showAiOverlays: boolean;
  prioritizeAiAlerts: boolean;
}

type SearchParams = Pick<URLSearchParams, "get" | "getAll">;

export function readLiveWallWindowScope(params: SearchParams | null): LiveWallWindowScope {
  const values = (key: string) => [...new Set((params?.getAll(key) ?? []).map(value => value.trim()).filter(value => value && value !== "ALL"))];
  const branches = values("branchId");
  const legacyBranch = params?.get("branch")?.trim();
  const status = params?.get("status");
  return {
    zones: values("zoneId"), regions: values("regionId"), areas: values("areaId"),
    branches: branches.length ? branches : legacyBranch && legacyBranch !== "ALL" ? [legacyBranch] : [],
    query: params?.get("q") ?? "",
    status: status === "ONLINE" || status === "OFFLINE" || status === "ALERT" ? status : "ALL",
    hideUnavailable: params?.get("hideUnavailable") !== "false",
    showAiOverlays: params?.get("overlays") !== "false",
    prioritizeAiAlerts: params?.get("aiPriority") === "true",
  };
}

export function liveWallWindowUrl(scope: LiveWallWindowScope): string {
  const params = new URLSearchParams({ wallWindow: "true" });
  for (const [key, values] of [["zoneId", scope.zones], ["regionId", scope.regions], ["areaId", scope.areas], ["branchId", scope.branches]] as const) {
    [...new Set(values)].forEach(value => params.append(key, value));
  }
  if (scope.query) params.set("q", scope.query);
  params.set("status", scope.status);
  params.set("hideUnavailable", String(scope.hideUnavailable));
  params.set("overlays", String(scope.showAiOverlays));
  params.set("aiPriority", String(scope.prioritizeAiAlerts));
  return `/control-room?${params}`;
}
