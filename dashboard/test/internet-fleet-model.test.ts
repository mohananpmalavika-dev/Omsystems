import { describe, expect, it } from "vitest";
import { internetStatusTone, rankInternetBranches } from "../components/operational-health/internet-fleet-model.js";
import type { BranchInternetHealth } from "../lib/types/operational-health.js";

describe("internet fleet dashboard model", () => {
  it("places outages and failovers before healthy links", () => {
    const ranked = rankInternetBranches([branch("online", "C"), branch("failover", "B"), branch("offline", "A")]);
    expect(ranked.map((item) => item.status)).toEqual(["offline", "failover", "online"]);
    expect(internetStatusTone("offline")).toContain("red");
    expect(internetStatusTone("online")).toContain("emerald");
  });
});
function branch(status: BranchInternetHealth["status"], branchName: string): BranchInternetHealth {
  return { branchId: branchName, branchName, branchCode: branchName, status, activeLinkId: null, failoverActive: status === "failover", links: [] };
}
