import type { HealthSummary, HealthStatus } from "@/lib/types/operational-health";

export type BranchSummaryFilter =
  | { kind: "all" }
  | { kind: "health"; value: HealthStatus }
  | { kind: "connectivity"; value: "online" | "offline" | "degraded" | "failover" | "unknown" }
  | { kind: "cameras-offline" }
  | { kind: "recorders-offline" }
  | { kind: "recording-failures" }
  | { kind: "hdd-critical" }
  | { kind: "retention-violations" }
  | { kind: "p1-alerts" };

export type BranchSummaryTone = "blue" | "green" | "red" | "amber" | "gray";

export interface BranchSummaryItem {
  id:
    | "total"
    | "online"
    | "offline"
    | "warning"
    | "critical"
    | "unknown"
    | "healthy"
    | "cameras"
    | "recorders"
    | "recording"
    | "hddCritical"
    | "retentionViolations"
    | "internetOffline"
    | "p1Alerts";
  label: string;
  value: string | number;
  subLabel?: string;
  tone: BranchSummaryTone;
  filter: BranchSummaryFilter;
}

export function getBranchStatusCards(summary: HealthSummary): BranchSummaryItem[] {
  return [
    {
      id: "total",
      label: "Branches",
      value: summary.totalBranches,
      subLabel: "Total Fleet",
      tone: "blue",
      filter: { kind: "all" },
    },
    {
      id: "healthy",
      label: "Healthy",
      value: summary.healthyBranches,
      subLabel: "Nominal",
      tone: "green",
      filter: { kind: "health", value: "healthy" },
    },
    {
      id: "warning",
      label: "Warning",
      value: summary.warningBranches,
      subLabel: "Attention Needed",
      tone: "amber",
      filter: { kind: "health", value: "warning" },
    },
    {
      id: "critical",
      label: "Critical",
      value: summary.criticalBranches,
      subLabel: "Action Required",
      tone: "red",
      filter: { kind: "health", value: "critical" },
    },
    {
      id: "unknown",
      label: "Unknown",
      value: summary.unknownBranches,
      subLabel: "No Telemetry",
      tone: "gray",
      filter: { kind: "health", value: "unknown" },
    },
  ];
}

export function getOperationalTelemetryCards(summary: HealthSummary): BranchSummaryItem[] {
  const totalRecorders = summary.totalRecorders ?? summary.totalBranches;
  const onlineRecorders = summary.recordersOnline ?? (summary.totalBranches - summary.offlineBranches);
  const criticalDisks = summary.criticalDisks ?? 0;
  const retentionViolations = summary.retentionViolations ?? 0;
  const internetOffline = summary.internetOffline ?? summary.offlineBranches;
  const p1Alerts = summary.p1Alerts ?? summary.activeCriticalAlerts;

  return [
    {
      id: "cameras",
      label: "Cameras",
      value: `${summary.camerasOnline.toLocaleString()} / ${summary.totalCameras.toLocaleString()}`,
      subLabel: summary.camerasOffline > 0 ? `${summary.camerasOffline} Offline` : "All Online",
      tone: summary.camerasOffline > 0 ? "amber" : "green",
      filter: { kind: "cameras-offline" },
    },
    {
      id: "recorders",
      label: "Recorders",
      value: `${onlineRecorders.toLocaleString()} / ${totalRecorders.toLocaleString()}`,
      subLabel: onlineRecorders < totalRecorders ? `${totalRecorders - onlineRecorders} Offline` : "All Online",
      tone: onlineRecorders < totalRecorders ? "amber" : "green",
      filter: { kind: "recorders-offline" },
    },
    {
      id: "recording",
      label: "Recording",
      value: `${summary.camerasRecording.toLocaleString()} / ${summary.totalCameras.toLocaleString()}`,
      subLabel: summary.recordingFailures > 0 ? `${summary.recordingFailures} Failed` : "Active",
      tone: summary.recordingFailures > 0 ? "red" : "green",
      filter: { kind: "recording-failures" },
    },
    {
      id: "hddCritical",
      label: "HDD Critical",
      value: criticalDisks,
      subLabel: criticalDisks > 0 ? "SMART / Failures" : "Disks Healthy",
      tone: criticalDisks > 0 ? "red" : "green",
      filter: { kind: "hdd-critical" },
    },
    {
      id: "retentionViolations",
      label: "Retention Violations",
      value: retentionViolations,
      subLabel: retentionViolations > 0 ? "< Required Days" : "Compliant",
      tone: retentionViolations > 0 ? "red" : "green",
      filter: { kind: "retention-violations" },
    },
    {
      id: "internetOffline",
      label: "Internet Offline",
      value: internetOffline,
      subLabel: internetOffline > 0 ? "Branches Disconnected" : "WAN Online",
      tone: internetOffline > 0 ? "red" : "green",
      filter: { kind: "connectivity", value: "offline" },
    },
    {
      id: "p1Alerts",
      label: "P1 Alerts",
      value: p1Alerts,
      subLabel: p1Alerts > 0 ? "Priority Incidents" : "Clear",
      tone: p1Alerts > 0 ? "red" : "green",
      filter: { kind: "p1-alerts" },
    },
  ];
}

export function getBranchSummaryItems(summary: HealthSummary): BranchSummaryItem[] {
  return [
    { id: "total", label: "Total branches", value: summary.totalBranches, tone: "blue", filter: { kind: "all" } },
    { id: "online", label: "Online branches", value: summary.onlineBranches, tone: "green", filter: { kind: "connectivity", value: "online" } },
    { id: "offline", label: "Offline branches", value: summary.offlineBranches, tone: "red", filter: { kind: "connectivity", value: "offline" } },
    { id: "warning", label: "Branches with warnings", value: summary.warningBranches, tone: "amber", filter: { kind: "health", value: "warning" } },
    { id: "critical", label: "Critical branches", value: summary.criticalBranches, tone: "red", filter: { kind: "health", value: "critical" } },
    { id: "unknown", label: "Unknown branches", value: summary.unknownBranches, tone: "gray", filter: { kind: "health", value: "unknown" } },
  ];
}

export function getHealthScoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 80) return "green";
  if (score >= 50) return "amber";
  return "red";
}
