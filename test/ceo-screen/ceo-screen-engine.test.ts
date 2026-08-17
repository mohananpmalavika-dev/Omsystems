/**
 * CEO Screen Engine — Unit Test Suite
 *
 * Verifies synthesis logic, root cause attribution math, 72-hour risk horizon,
 * business impact compilation, and 1-click action execution.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CeoScreenEngine } from "../../src/ceo-command-center/services/ceo-screen-engine.js";

describe("CeoScreenEngine Unit Tests", () => {
  let engine: CeoScreenEngine;

  beforeEach(() => {
    engine = new CeoScreenEngine();
    engine.seedDefaultExecutiveState();
  });

  it("Question 1: getWhatIsBroken returns exactly 27 degraded branches and correct headline", () => {
    const broken = engine.getWhatIsBroken();
    expect(broken.summaryHeadline).toBe("27 branches degraded");
    expect(broken.degradedBranchesCount).toBe(27);
    expect(broken.criticalBranchesCount).toBeGreaterThan(0);
    expect(broken.fleetHealthPct).toBeGreaterThan(0);
    expect(broken.degradedBranches).toHaveLength(27);
  });

  it("Question 2: getWhatWillBreak returns 8 branches high risk within 72 hours", () => {
    const willBreak = engine.getWhatWillBreak();
    expect(willBreak.summaryHeadline).toBe("8 branches high risk within 72 hours");
    expect(willBreak.predictions).toHaveLength(8);
    expect(willBreak.forecastHorizonHours).toBe(72);

    // Verify leading indicators are populated
    for (const pred of willBreak.predictions) {
      expect(pred.leadingIndicator.length).toBeGreaterThan(5);
      expect(pred.failureLikelihoodPct).toBeGreaterThan(50);
      expect(["HDD", "NETWORK", "DVR", "CAMERA", "POWER"]).toContain(pred.vulnerableComponent);
    }
  });

  it("Question 3: getWhy categorizes issues across the 5 pillars (HDD, Network, DVR, Camera, Power)", () => {
    const why = engine.getWhy();
    expect(why.attributions).toHaveLength(5);

    const categories = why.attributions.map((a) => a.category);
    expect(categories).toContain("HDD");
    expect(categories).toContain("NETWORK");
    expect(categories).toContain("DVR");
    expect(categories).toContain("CAMERA");
    expect(categories).toContain("POWER");

    // Check sum of percentages is approx 100%
    const totalPct = why.attributions.reduce((sum, a) => sum + a.percentageContribution, 0);
    expect(totalPct).toBeGreaterThanOrEqual(95);
    expect(totalPct).toBeLessThanOrEqual(105);

    expect(why.summaryHeadline).toContain("Primary Driver:");
  });

  it("Question 4: getBusinessImpact summarizes affected cameras, branches, and compliance risks", () => {
    const impact = engine.getBusinessImpact();
    expect(impact.summaryHeadline).toContain("63 cameras / 11 branches / 4 compliance risks");
    expect(impact.totalCamerasAffected).toBe(63);
    expect(impact.criticalBranchesImpacted).toBe(11);
    expect(impact.activeComplianceRisksCount).toBe(4);
    expect(impact.complianceRisks).toHaveLength(4);

    // Vault risk check
    const vaultExposure = impact.criticalZoneExposures.find((z) => z.zoneType === "VAULT");
    expect(vaultExposure).toBeDefined();
    expect(vaultExposure!.camerasBlind).toBe(2);
  });

  it("Question 5: getWhatShouldIDo synthesizes prescriptive 1-click remediation actions", () => {
    const actions = engine.getWhatShouldIDo();
    expect(actions.summaryHeadline).toContain("Replace 4 HDDs");
    expect(actions.summaryHeadline).toContain("Restart 3 DVRs");
    expect(actions.summaryHeadline).toContain("Dispatch technician to 2 branches");
    expect(actions.actions.length).toBeGreaterThanOrEqual(3);
  });

  it("Master Snapshot: getSnapshot composes the full 5-question executive view", () => {
    const snapshot = engine.getSnapshot();
    expect(snapshot.timestamp).toBeInstanceOf(Date);
    expect(["RED", "AMBER", "GREEN"]).toContain(snapshot.overallStatus);
    expect(snapshot.whatIsBroken).toBeDefined();
    expect(snapshot.whatWillBreak).toBeDefined();
    expect(snapshot.why).toBeDefined();
    expect(snapshot.businessImpact).toBeDefined();
    expect(snapshot.whatShouldIDo).toBeDefined();
  });

  it("Action Execution: executeAction transitions action to COMPLETED and sets audit metadata", () => {
    const actions = engine.getWhatShouldIDo();
    const actionToExec = actions.actions.find((a) => a.type === "RESTART_DVR");
    expect(actionToExec).toBeDefined();

    const executed = engine.executeAction(actionToExec!.actionId, "ceo-operator");
    expect(executed.status).toBe("COMPLETED");
    expect(executed.executedBy).toBe("ceo-operator");
    expect(executed.executedAt).toBeInstanceOf(Date);
    expect(executed.executionResult).toContain("Successfully triggered RESTART_DVR");

    // Idempotency check: executing again returns completed action
    const rerun = engine.executeAction(actionToExec!.actionId, "ceo-operator");
    expect(rerun.status).toBe("COMPLETED");
  });

  it("Action Execution: throws error when executing non-existent action", () => {
    expect(() => engine.executeAction("ACT-NON-EXISTENT")).toThrow("Prescriptive action not found");
  });
});
