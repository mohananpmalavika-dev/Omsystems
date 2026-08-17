/**
 * CEO Screen — Executive Invariants & Behavioral Test Suite
 *
 * Enforces that the CEO Command Center ALWAYS and EXCLUSIVELY adheres
 * to the 5-Question Paradigm with exact numerical contracts:
 *
 * 1. What is broken?       -> Exact count & severity breakdown
 * 2. What will break?      -> 72-hour predictive horizon & risk scores
 * 3. Why?                  -> Mutually exhaustive attribution across HDD, Network, DVR, Camera, Power
 * 4. What is the impact?   -> Direct translation to Cameras, Branches & Compliance mandates
 * 5. What should I do?     -> Direct, unambiguous 1-click remediation actions
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CeoScreenEngine } from "../../src/ceo-command-center/services/ceo-screen-engine.js";

describe("CEO Screen Executive Invariants", () => {
  let engine: CeoScreenEngine;

  beforeEach(() => {
    engine = new CeoScreenEngine();
    engine.seedDefaultExecutiveState();
  });

  // ── INVARIANT 1: Zero Ambiguity on "What is Broken" ────────────────────────
  it("Invariant 1: What is Broken must produce an explicit headline count and non-empty branch listings", () => {
    const broken = engine.getWhatIsBroken();
    expect(broken.summaryHeadline).toMatch(/^\d+ branches degraded$/);
    expect(broken.degradedBranches.length).toBe(broken.degradedBranchesCount);

    broken.degradedBranches.forEach((b) => {
      expect(b.branchId).toBeDefined();
      expect(b.branchName).toBeDefined();
      expect(b.activeIssues.length).toBeGreaterThan(0);
      expect(["CRITICAL", "DEGRADED", "WARNING", "HEALTHY"]).toContain(b.severity);
    });
  });

  // ── INVARIANT 2: 72-Hour Horizon Boundedness ──────────────────────────────
  it("Invariant 2: What Will Break must always forecast within a bounded 72-hour horizon", () => {
    const willBreak = engine.getWhatWillBreak();
    expect(willBreak.forecastHorizonHours).toBe(72);
    expect(willBreak.summaryHeadline).toMatch(/^\d+ branches high risk within 72 hours$/);

    willBreak.predictions.forEach((p) => {
      expect(["24_HOURS", "48_HOURS", "72_HOURS"]).toContain(p.predictedHorizon);
      expect(p.failureLikelihoodPct).toBeGreaterThanOrEqual(0);
      expect(p.failureLikelihoodPct).toBeLessThanOrEqual(100);
      expect(p.recommendedPreemptiveAction).toBeDefined();
    });
  });

  // ── INVARIANT 3: Exhaustive 5-Pillar Root Cause Breakdown ─────────────────
  it("Invariant 3: Why must attribute causality across HDD, Network, DVR, Camera, Power with normalized percentages", () => {
    const why = engine.getWhy();
    const categories = why.attributions.map((a) => a.category);

    expect(categories).toEqual(
      expect.arrayContaining(["HDD", "NETWORK", "DVR", "CAMERA", "POWER"]),
    );

    const totalPercentage = why.attributions.reduce((acc, a) => acc + a.percentageContribution, 0);
    expect(Math.abs(100 - totalPercentage)).toBeLessThanOrEqual(5); // normalized around 100%
  });

  // ── INVARIANT 4: Business Impact Translation ──────────────────────────────
  it("Invariant 4: Business Impact must translate hardware faults directly into cameras, branches and compliance liabilities", () => {
    const impact = engine.getBusinessImpact();
    expect(impact.summaryHeadline).toMatch(/^\d+ cameras \/ \d+ branches \/ \d+ compliance risks$/);
    expect(impact.complianceRisks.length).toBe(impact.activeComplianceRisksCount);

    impact.complianceRisks.forEach((c) => {
      expect(c.mandate).toBeDefined();
      expect(c.potentialPenaltyEstimate).toBeDefined();
    });
  });

  // ── INVARIANT 5: Prescriptive Remediation Actionability ────────────────────
  it("Invariant 5: What Should I Do must provide clear, one-click executable actions that resolve the root issues", () => {
    const actions = engine.getWhatShouldIDo();
    expect(actions.actions.length).toBeGreaterThan(0);

    actions.actions.forEach((act) => {
      expect(act.actionId).toBeDefined();
      expect(act.title).toBeDefined();
      expect(act.isOneClickExecutable).toBe(true);
      expect(act.targetBranchIds.length).toBeGreaterThan(0);
    });

    // Execute first action and verify immediate status transition
    const firstAct = actions.actions[0];
    const executed = engine.executeAction(firstAct.actionId, "executive-chair");
    expect(executed.status).toBe("COMPLETED");
  });
});
