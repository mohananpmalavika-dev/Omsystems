import type { Camera, AnalyticsAlert } from "@/lib/types";

export function operationalStageAlerts(alerts: AnalyticsAlert[], cameraIds: ReadonlySet<string>) {
  return alerts.filter(alert => cameraIds.has(alert.cameraId) && !["P4", "P5"].includes(alert.severity));
}

export function fleetCameraPage(cameras: Camera[], branchId: string, size: number, page: number) {
  const scoped = branchId === "all" ? cameras : cameras.filter(camera => camera.branchId === branchId);
  const pageCount = Math.max(1, Math.ceil(scoped.length / size));
  const currentPage = Math.min(Math.max(0, page), pageCount - 1);
  return { total: scoped.length, pageCount, currentPage, cameras: scoped.slice(currentPage * size, (currentPage + 1) * size) };
}
