import { describe, expect, it } from "vitest";
import { getBranchSummaryItems, getHealthScoreTone } from "../components/operational-health/branch-summary-model.js";
import type { HealthSummary } from "../lib/types/operational-health.js";

describe("branch summary widget model", () => {
  it("maps operational totals to color-coded click-through filters", () => {
    expect(getBranchSummaryItems(summary())).toEqual([
      { id: "total", label: "Total branches", value: 12, tone: "blue", filter: { kind: "all" } },
      { id: "online", label: "Online branches", value: 8, tone: "green", filter: { kind: "connectivity", value: "online" } },
      { id: "offline", label: "Offline branches", value: 2, tone: "red", filter: { kind: "connectivity", value: "offline" } },
      { id: "warning", label: "Branches with warnings", value: 3, tone: "amber", filter: { kind: "health", value: "warning" } },
    ]);
  });

  it("uses clear health score thresholds", () => {
    expect(getHealthScoreTone(80)).toBe("green");
    expect(getHealthScoreTone(79.9)).toBe("amber");
    expect(getHealthScoreTone(50)).toBe("amber");
    expect(getHealthScoreTone(49.9)).toBe("red");
  });
});

function summary(): HealthSummary {
  return {
    totalBranches: 12, onlineBranches: 8, offlineBranches: 2,
    healthyBranches: 7, warningBranches: 3, criticalBranches: 1, unknownBranches: 1,
    overallHealthScore: 82.5, totalCameras: 120, camerasOnline: 110, camerasOffline: 10,
    camerasRecording: 108, recordingFailures: 12, activeCriticalAlerts: 1,
    totalEdgeAgents: 12, edgeAgentsOnline: 11, edgeAgentsOffline: 1,
    edgeAgentsWarning: 0, edgeAgentsUnknown: 0, timestamp: "2026-07-28T00:00:00.000Z",
  };
}
