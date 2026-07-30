import { describe, expect, it } from "vitest";
import { verifyInternetEdgeAcceptance, type InternetEdgeAcceptanceSample } from "./acceptance-contract.js";

describe("400-branch internet and edge acceptance contract", () => {
  it("accepts only sustained, route-bound evidence with exercised failover and recovery", () => {
    const samples = Array.from({ length: 400 }, (_, index) => branchSequence(`branch-${index + 1}`)).flat();
    const checks = verifyInternetEdgeAcceptance(samples, {
      expectedBranches: 400, minimumDurationHours: 24,
      expectedFailoverBranches: 400, minimumPathWindowSeconds: 300,
    });
    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it("does not mistake an instantaneous synthetic snapshot for sustained field evidence", () => {
    const checks = verifyInternetEdgeAcceptance([branchSequence("branch-1")[0]!], {
      expectedBranches: 400, minimumDurationHours: 24,
      expectedFailoverBranches: 1, minimumPathWindowSeconds: 300,
    });
    expect(checks.filter((check) => !check.passed).map((check) => check.name)).toEqual(expect.arrayContaining([
      "branch_inventory", "sustained_duration", "failover_recovery",
    ]));
  });
});

function branchSequence(branchId: string): InternetEdgeAcceptanceSample[] {
  const start = Date.parse("2026-07-29T00:00:00.000Z");
  return [
    sample(branchId, start, true, true),
    sample(branchId, start + 12 * 3_600_000, false, true),
    sample(branchId, start + 24 * 3_600_000, true, true),
  ];
}

function sample(branchId: string, observedAt: number, primaryOnline: boolean, backupOnline: boolean): InternetEdgeAcceptanceSample {
  const link = (role: "primary" | "backup", online: boolean) => ({
    role, status: online ? "online" as const : "offline" as const, connectivity: online,
    routeVerified: true, probeWindowSeconds: 300, probeWindowAttempts: 30,
    gatewayReachable: true, lastMileStatus: online ? "healthy" as const : "upstream_suspected" as const,
    publicIp: role === "primary" ? "198.51.100.10" : "203.0.113.20",
  });
  return {
    branchId, observedAt: new Date(observedAt).toISOString(),
    links: [link("primary", primaryOnline), link("backup", backupOnline)],
    edge: { cpuUsedPercent: 25, memoryUsedPercent: 40, diskUsedPercent: 50, diskFreeBytes: 1_000_000, uptimeSeconds: 86_400 },
  };
}
