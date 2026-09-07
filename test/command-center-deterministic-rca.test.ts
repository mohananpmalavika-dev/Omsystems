import { describe, expect, it } from "vitest";
import { DeterministicRcaService } from "../src/services/command-center/deterministic-rca.service.js";

describe("Deterministic RCA service", () => {
  it("does not invent a camera root cause when no failure evidence is supplied", async () => {
    const result = await new DeterministicRcaService().analyzeBranchOutage({
      branchId: "A005",
      unreachableNodeIds: [],
      powerStatus: "NORMAL",
      wanStatus: "ONLINE",
    });

    expect(result.failureType).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.confidenceScore).toBe(0);
    expect(result.blastRadius.dependentCamerasCount).toBe(0);
  });

  it("normalizes node IDs and derives impact from observed nodes", async () => {
    const result = await new DeterministicRcaService().analyzeBranchOutage({
      branchId: "A005",
      unreachableNodeIds: ["Router-A005", "CAM-01", "nvr-01"],
      powerStatus: "NORMAL",
      wanStatus: "ONLINE",
    });

    expect(result.rootCauseNodeType).toBe("ROUTER");
    expect(result.blastRadius).toMatchObject({
      suppressedAlertsCount: 3,
      dependentRecordersCount: 1,
      dependentCamerasCount: 1,
      dependentAiPipelinesCount: 0,
    });
  });
});