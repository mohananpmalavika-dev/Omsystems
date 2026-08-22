import type { BranchInternetHealth } from "@/lib/types/operational-health";

export function rankInternetBranches(branches: BranchInternetHealth[]) {
  const rank = { offline: 0, failover: 1, degraded: 2, unknown: 3, online: 4 } as const;
  return [...branches].sort((left, right) => rank[left.status] - rank[right.status] || left.branchName.localeCompare(right.branchName));
}

export function internetStatusTone(status: BranchInternetHealth["status"]) {
  return status === "offline" ? "border-red-400 bg-red-50 text-red-800"
    : status === "failover" ? "border-orange-400 bg-orange-50 text-orange-800"
      : status === "degraded" ? "border-amber-400 bg-amber-50 text-amber-800"
        : status === "online" ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-gray-300 bg-gray-50 text-gray-700";
}
