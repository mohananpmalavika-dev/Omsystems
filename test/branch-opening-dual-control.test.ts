import { describe, expect, it } from "vitest";
import { NbfcRuleRepository } from "../src/analytics/nbfc-rule-repository.js";
import { NbfcRuleEngineService } from "../src/analytics/nbfc-rule-engine.service.js";
import { evaluateBranchOpeningDualControl, observedStaffCount } from "../src/analytics/branch-opening-dual-control.service.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

function event(personCount: number, occurredAt = "2026-09-21T03:05:00.000Z"): AnalyticsEventInput {
  return {
    tenantId: "tenant-opening-test",
    cameraId: "camera-entrance",
    sourceEventId: `opening-${personCount}-${occurredAt}`,
    detectionType: "person-counting",
    occurredAt,
    confidence: 0.95,
    durationSeconds: 1,
    modelVersion: "test",
    objects: Array.from({ length: personCount }, (_, index) => ({
      label: "person",
      confidence: 0.95,
      trackId: String(index),
    })),
    metadata: { personCount },
  };
}

describe("branch opening two-person enforcement", () => {
  it("uses explicit count metadata before object fallback", () => {
    const sample = event(1);
    sample.metadata = { staffCount: 0 };
    expect(observedStaffCount(sample)).toBe(0);
  });

  it("triggers during the configured opening window when fewer than two people are visible", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test",
      branchIds: ["branch-1"],
      durationMs: 0,
      createdBy: "admin",
    });
    await repository.updateRule(rule.id, {
      state: "ACTIVE",
      enabled: true,
      schedule: {
        type: "BRANCH_OPENING",
        start: "08:30",
        end: "09:30",
        timezone: "Asia/Kolkata",
        days: [1, 2, 3, 4, 5, 6],
      },
    });

    const violations = await evaluateBranchOpeningDualControl(
      repository,
      engine,
      event(1),
      { id: "camera-entrance", branchId: "branch-1" },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ staffCount: 1, requiredStaff: 2, branchId: "branch-1" });
  });

  it("does not trigger with two people or outside the opening window", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test",
      branchIds: ["branch-1"],
      durationMs: 0,
      createdBy: "admin",
    });
    await repository.updateRule(rule.id, {
      state: "ACTIVE",
      enabled: true,
      schedule: { type: "BRANCH_OPENING", start: "08:30", end: "09:30", timezone: "Asia/Kolkata", days: [1] },
    });

    expect(await evaluateBranchOpeningDualControl(repository, engine, event(2), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    expect(await evaluateBranchOpeningDualControl(repository, engine, event(1, "2026-09-21T05:30:00.000Z"), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
  });
});
