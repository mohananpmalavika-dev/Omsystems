import { describe, expect, it } from "vitest";
import { rankRetentionExceptions, summarizeRetention } from "../components/operational-health/retention-fleet-model.js";
import type { RetentionHealth, RetentionStatus } from "../lib/types/operational-health.js";

describe("retention compliance dashboard model", () => {
  it("counts affected branches and ranks breaches ahead of warnings", () => {
    const items = [item("compliant", "a", 0), item("at_risk", "b", 0), item("breach", "b", 12), item("breach", "c", 4)];
    expect(summarizeRetention(items)).toEqual({ total: 4, compliant: 1, atRisk: 1, breaches: 2, unknown: 0, affectedBranches: 2 });
    expect(rankRetentionExceptions(items).map((value) => value.status)).toEqual(["breach", "breach", "at_risk"]);
    expect(rankRetentionExceptions(items)[0]?.shortfallDays).toBe(12);
  });
});

function item(status: RetentionStatus, branchId: string, shortfallDays: number): RetentionHealth {
  return {
    branchId, branchName: branchId, cameraId: `${branchId}-${status}`, cameraName: "Camera",
    configuredDays: 30, actualDays: 30 - shortfallDays, oldestContinuousAt: null, newestPlayableAt: null,
    status, marginDays: -shortfallDays, shortfallDays, warningDays: 7, dailyChangeDays: 0,
    forecastDaysIn7Days: 30 - shortfallDays, daysUntilCompliant: null, trend: "stable",
    coverageTrend: [], reasonCodes: [],
  };
}
