import type { RecorderHealth } from "@/lib/types/operational-health";

export function rankRecorders(items: RecorderHealth[]) {
  const rank = { offline: 0, degraded: 1, unknown: 2, online: 3 } as const;
  return [...items].sort((left, right) => rank[left.status] - rank[right.status] || left.branchName.localeCompare(right.branchName));
}
export function recorderTone(status: RecorderHealth["status"]) {
  return status === "offline" ? "border-red-400 bg-red-50" : status === "degraded" ? "border-amber-400 bg-amber-50" : status === "online" ? "border-emerald-300 bg-emerald-50" : "border-gray-300 bg-gray-50";
}
