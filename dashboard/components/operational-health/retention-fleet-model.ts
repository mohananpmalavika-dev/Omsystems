import type { RetentionHealth } from "@/lib/types/operational-health";

export function summarizeRetention(items: RetentionHealth[]) {
  return {
    total: items.length,
    compliant: items.filter((item) => item.status === "compliant").length,
    atRisk: items.filter((item) => item.status === "at_risk").length,
    breaches: items.filter((item) => item.status === "breach").length,
    unknown: items.filter((item) => item.status === "unknown").length,
    affectedBranches: new Set(items.filter((item) => item.status === "breach" || item.status === "at_risk").map((item) => item.branchId)).size,
  };
}

export function rankRetentionExceptions(items: RetentionHealth[]) {
  const statusRank = { breach: 0, at_risk: 1, unknown: 2, compliant: 3 } as const;
  return [...items]
    .filter((item) => item.status !== "compliant")
    .sort((left, right) => statusRank[left.status] - statusRank[right.status]
      || (right.shortfallDays ?? 0) - (left.shortfallDays ?? 0));
}
