import { describe, expect, it } from "vitest";
import { NbfcRuleRepository } from "../src/analytics/nbfc-rule-repository.js";
import { NbfcRuleEngineService } from "../src/analytics/nbfc-rule-engine.service.js";
import { branchOpeningLocalDate, evaluateBranchOpeningDualControl, observedStaffCount } from "../src/analytics/branch-opening-dual-control.service.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

function event(
  personCount: number,
  occurredAt = "2026-09-21T03:05:00.000Z",
  extraMeta: Record<string, unknown> = { shutterState: "open" },
): AnalyticsEventInput {
  return {
    tenantId: "tenant-opening-test",
    cameraId: "camera-entrance",
    sourceEventId: `opening-${personCount}-${occurredAt}-${JSON.stringify(extraMeta)}`,
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
    metadata: { personCount, ...extraMeta },
  };
}

describe("branch opening two-person enforcement", () => {
  it("defaults new opening templates to an active 08:00–11:00 IST policy with shutter/door requirement", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test", branchIds: ["new-branch"], createdBy: "admin",
    });
    expect(rule).toMatchObject({
      enabled: true,
      state: "ACTIVE",
      durationMs: 0,
      metadata: expect.objectContaining({ requireShutterOrDoorOpen: true }),
      schedule: {
        type: "BRANCH_OPENING", start: "08:00", end: "11:00", timezone: "Asia/Kolkata", days: [1, 2, 3, 4, 5, 6],
      },
    });
    for (const schedule of [rule.schedule, { type: "BRANCH_OPENING" as const }]) {
      for (const [time, expected] of [["07:59", false], ["08:00", true], ["10:59", true], ["11:00", true], ["11:01", false]] as const) {
        expect(engine.isWithinSchedule(schedule, new Date(`2026-10-06T${time}:00+05:30`))).toBe(expected);
      }
    }
  });

  it("uses explicit count metadata before object fallback", () => {
    const sample = event(1);
    sample.metadata = { staffCount: 0 };
    expect(observedStaffCount(sample)).toBe(0);
  });

  it("does not alert when a single person comes outside and stands without opening shutter/door/grill", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test", branchIds: ["branch-1"], createdBy: "admin",
    });
    await repository.updateRule(rule.id, {
      state: "ACTIVE",
      enabled: true,
      schedule: { type: "BRANCH_OPENING", start: "08:30", end: "09:30", timezone: "Asia/Kolkata", days: [1] },
    });

    // 1. Person standing outside while shutter is closed - NO ALERT!
    const outsideClosed = event(1, "2026-09-21T03:05:00.000Z", { shutterState: "closed" });
    expect(await evaluateBranchOpeningDualControl(repository, engine, outsideClosed,
      { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    // Daily opening check must NOT be claimed as failed
    expect(await repository.getBranchOpeningCheck(rule.id, "branch-1", "2026-09-21")).toBeNull();

    // 2. Person standing outside with no shutter/door open signal - NO ALERT!
    const outsideNoOpen = event(1, "2026-09-21T03:06:00.000Z", {});
    expect(await evaluateBranchOpeningDualControl(repository, engine, outsideNoOpen,
      { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    expect(await repository.getBranchOpeningCheck(rule.id, "branch-1", "2026-09-21")).toBeNull();

    // 3. Now 2 people arrive and open the shutter together - PASSES as compliant!
    const twoPeopleOpening = event(2, "2026-09-21T03:10:00.000Z", { shutterState: "open" });
    expect(await evaluateBranchOpeningDualControl(repository, engine, twoPeopleOpening,
      { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    const check = await repository.getBranchOpeningCheck(rule.id, "branch-1", "2026-09-21");
    expect(check?.currentMetrics?.outcome).toBe("SUCCESS");
  });

  it("alerts when 1 person opens the shutter/door or goes inside alone", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test", branchIds: ["branch-1"], createdBy: "admin",
    });
    await repository.updateRule(rule.id, {
      state: "ACTIVE",
      enabled: true,
      schedule: { type: "BRANCH_OPENING", start: "08:30", end: "09:30", timezone: "Asia/Kolkata", days: [1] },
    });

    // 1 person opening shutter / going inside alone (direction: entry) -> FAILS & ALERTS
    const openingSolo = event(1, "2026-09-21T03:05:00.000Z", { direction: "entry", shutterState: "open" });
    const violations = await evaluateBranchOpeningDualControl(
      repository,
      engine,
      openingSolo,
      { id: "camera-entrance", branchId: "branch-1" },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      staffCount: 1,
      requiredStaff: 2,
      branchId: "branch-1",
      openingTrigger: "SHUTTER_DOOR_OPENED",
    });
  });

  it("evaluates when shutter-opened event occurs followed by staff entry", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test", branchIds: ["branch-1"], createdBy: "admin",
    });
    await repository.updateRule(rule.id, {
      state: "ACTIVE",
      enabled: true,
      schedule: { type: "BRANCH_OPENING", start: "08:30", end: "09:30", timezone: "Asia/Kolkata", days: [1] },
    });

    // 1. Shutter opened event arrives (0 persons in frame)
    const shutterEvent: AnalyticsEventInput = {
      tenantId: "tenant-opening-test",
      cameraId: "camera-entrance",
      sourceEventId: "shutter-open-1",
      detectionType: "shutter-opened",
      occurredAt: "2026-09-21T03:05:00.000Z",
      confidence: 0.98,
      durationSeconds: 2,
      modelVersion: "shutter-1.0",
      objects: [],
      metadata: { shutterState: "open" },
    };
    expect(await evaluateBranchOpeningDualControl(repository, engine, shutterEvent,
      { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);

    // 2. Now a single person walks in 5 seconds later
    const personWalkingIn = event(1, "2026-09-21T03:05:05.000Z", {});
    const violations = await evaluateBranchOpeningDualControl(repository, engine, personWalkingIn,
      { id: "camera-entrance", branchId: "branch-1" });
    expect(violations).toHaveLength(1);
    expect(violations[0].staffCount).toBe(1);
  });

  it("disabling a branch prevents opening decisions while preserving its custom times", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test", branchIds: ["branch-1"], createdBy: "admin",
    });
    const schedule = { type: "BRANCH_OPENING" as const, start: "08:15", end: "10:45", timezone: "Asia/Kolkata", days: [1] };
    await repository.updateRule(rule.id, { enabled: false, state: "INACTIVE", schedule });
    expect(await evaluateBranchOpeningDualControl(repository, engine, event(1, "2026-09-21T03:05:00.000Z", { shutterState: "open" }),
      { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    expect(await repository.getBranchOpeningCheck(rule.id, "branch-1", "2026-09-21")).toBeNull();
    await repository.updateRule(rule.id, { enabled: true, state: "ACTIVE" });
    expect((await repository.getRule(rule.id))?.schedule).toEqual(schedule);
    expect(await evaluateBranchOpeningDualControl(repository, engine, event(1, "2026-09-21T03:05:00.000Z", { shutterState: "open" }),
      { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(1);
  });

  it("fails immediately on the first one-person observation when shutter/door opens and checks again next day", async () => {
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
      event(1, "2026-09-21T03:05:00.000Z", { shutterState: "open" }),
      { id: "camera-entrance", branchId: "branch-1" },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ staffCount: 1, requiredStaff: 2, branchId: "branch-1" });
    expect(await evaluateBranchOpeningDualControl(repository, engine,
      event(1, "2026-09-21T03:06:00.000Z", { shutterState: "open" }), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(1);
    await repository.markBranchOpeningAlertEmitted(rule.id, "branch-1", "2026-09-21");
    expect(await evaluateBranchOpeningDualControl(repository, engine,
      event(1, "2026-09-21T03:07:00.000Z", { shutterState: "open" }), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    expect(await evaluateBranchOpeningDualControl(repository, engine,
      event(1, "2026-09-21T03:08:00.000Z", { shutterState: "open" }), { id: "camera-interior", branchId: "branch-1" })).toHaveLength(0);
    expect(await evaluateBranchOpeningDualControl(repository, engine,
      event(1, "2026-09-22T03:05:00.000Z", { shutterState: "open" }), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(1);
  });

  it("passes once when the first observed frame has at least two people, even if a later frame has one", async () => {
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

    expect(await evaluateBranchOpeningDualControl(repository, engine, event(3, "2026-09-21T03:05:00.000Z", { shutterState: "open" }),
      { id: "camera-entrance", branchId: "branch-1" }, "source-opening-3")).toHaveLength(0);
    const today = await repository.getBranchOpeningCheck(rule.id, "branch-1", "2026-09-21");
    expect(today?.currentMetrics?.outcome).toBe("SUCCESS");
    expect(today?.currentMetrics).toMatchObject({ personCount: 3, sourceEventId: "source-opening-3" });
    expect(await evaluateBranchOpeningDualControl(repository, engine,
      event(1, "2026-09-21T03:06:00.000Z", { shutterState: "open" }), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    expect(await evaluateBranchOpeningDualControl(repository, engine, event(1, "2026-09-21T05:30:00.000Z", { shutterState: "open" }), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
  });

  it("does not make a decision from an empty frame or outside the opening window", async () => {
    const repository = new NbfcRuleRepository();
    const engine = new NbfcRuleEngineService(repository);
    const rule = await repository.instantiateTemplate("tmpl-27-opening-staff-count", {
      tenantId: "tenant-opening-test", branchIds: ["branch-1"], createdBy: "admin",
    });
    await repository.updateRule(rule.id, { schedule: {
      type: "BRANCH_OPENING", start: "08:30", end: "09:30", timezone: "Asia/Kolkata", days: [1, 2],
    } });
    expect(await evaluateBranchOpeningDualControl(repository, engine,
      event(0, "2026-09-21T03:05:00.000Z", { shutterState: "open" }), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    expect(await repository.getBranchOpeningCheck(rule.id, "branch-1", "2026-09-21")).toBeNull();
    expect(await evaluateBranchOpeningDualControl(repository, engine,
      event(1, "2026-09-21T02:55:00.000Z", { shutterState: "open" }), { id: "camera-entrance", branchId: "branch-1" })).toHaveLength(0);
    expect(branchOpeningLocalDate(new Date("2026-09-21T19:00:00.000Z"), "Asia/Kolkata")).toBe("2026-09-22");
  });
});
