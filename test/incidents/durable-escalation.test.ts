import { describe, expect, it, vi } from "vitest";
import { DurableIncidentEscalationService } from "../../src/incidents/services/durable-incident-escalation.service.js";

describe("Durable Incident Escalation Jobs (P0 Phase 5)", () => {
  it("schedules a durable escalation job and executes it when due", async () => {
    const service = new DurableIncidentEscalationService();
    const executedJobs: string[] = [];

    service.setHandler(async (job) => {
      executedJobs.push(job.ruleId);
    });

    // Schedule job with 0ms delay so it is immediately due
    await service.scheduleEscalation("tenant-01", "inc-p1-vault", "acknowledge", 0);

    const processed = await service.processDueJobs();
    expect(processed).toBe(1);
    expect(executedJobs).toContain("acknowledge");
  });

  it("cancels an escalation job before execution when acknowledged", async () => {
    const service = new DurableIncidentEscalationService();
    const executedJobs: string[] = [];

    service.setHandler(async (job) => {
      executedJobs.push(job.ruleId);
    });

    // Schedule job
    await service.scheduleEscalation("tenant-01", "inc-p1-vault", "acknowledge", 60_000);

    // Operator acknowledges incident -> cancel escalation
    const cancelled = await service.cancelEscalation("tenant-01", "inc-p1-vault", "acknowledge");
    expect(cancelled).toBe(true);

    const processed = await service.processDueJobs();
    expect(processed).toBe(0);
    expect(executedJobs).toHaveLength(0);
  });
});
