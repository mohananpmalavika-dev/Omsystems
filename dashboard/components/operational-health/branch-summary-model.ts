import type { HealthSummary, HealthStatus } from "@/lib/types/operational-health";

export type BranchSummaryFilter =
  | { kind: "all" }
  | { kind: "health"; value: HealthStatus }
  | { kind: "connectivity"; value: "online" | "offline" };

export type BranchSummaryTone = "blue" | "green" | "red" | "amber";

export interface BranchSummaryItem {
  id: "total" | "online" | "offline" | "warning";
  label: string;
  value: number;
  tone: BranchSummaryTone;
  filter: BranchSummaryFilter;
}

export function getBranchSummaryItems(summary: HealthSummary): BranchSummaryItem[] {
  return [
    { id: "total", label: "Total branches", value: summary.totalBranches, tone: "blue", filter: { kind: "all" } },
    { id: "online", label: "Online branches", value: summary.onlineBranches, tone: "green", filter: { kind: "connectivity", value: "online" } },
    { id: "offline", label: "Offline branches", value: summary.offlineBranches, tone: "red", filter: { kind: "connectivity", value: "offline" } },
    { id: "warning", label: "Branches with warnings", value: summary.warningBranches, tone: "amber", filter: { kind: "health", value: "warning" } },
  ];
}

export function getHealthScoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 80) return "green";
  if (score >= 50) return "amber";
  return "red";
}
