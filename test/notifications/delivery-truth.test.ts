import { describe, expect, it, vi } from "vitest";
import { NotificationOutbox } from "../../src/notifications/infrastructure/outbox/notification-outbox.js";
import { NotificationWorker } from "../../src/notifications/infrastructure/worker/notification-worker.js";
import { NotificationProviderRegistry } from "../../src/notifications/infrastructure/providers/notification-provider.interface.js";
import { VoiceNotificationProvider } from "../../src/notifications/infrastructure/providers/voice.provider.js";

async function setup(accepted: boolean, state: "FAILED" | "SENT" | "DELIVERED", maxAttempts = 2) {
  const outbox = new NotificationOutbox();
  const providers = new NotificationProviderRegistry();
  providers.register({ channel: "email", async send() { return { accepted, state, error: "PROVIDER_NOT_CONFIGURED", provider: "fixture" }; } });
  const job = await outbox.enqueue({ tenantId: "audit", alertId: "alert-1", channel: "email", priority: "P1", destination: "audit@example.invalid", payload: { text: "Fixture" }, maxAttempts, idempotencyKey: "alert-1:email" });
  return { job, outbox, worker: new NotificationWorker(outbox, providers) };
}

describe("notification delivery truth", () => {
  it("prevents overlapping drains and releases the guard after a claim failure", async () => {
    const { outbox, worker } = await setup(true, "SENT");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const claim = vi.spyOn(outbox, "claimPending").mockImplementationOnce(async () => { await gate; return []; });
    const first = worker.processBatch();
    expect(await worker.processBatch()).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(claim).toHaveBeenCalledOnce();
    release();
    await first;
    claim.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(worker.processBatch()).rejects.toThrow("database unavailable");
    expect(await worker.processBatch()).toMatchObject({ processed: 1, succeeded: 1 });
  });
  it("retries a rejected provider result and never marks it sent", async () => {
    const { job, outbox, worker } = await setup(false, "FAILED");
    expect(await worker.processJob(job)).toBe(false);
    expect(await outbox.getJobById(job.id)).toMatchObject({ status: "PENDING", attempts: 1, lastError: "PROVIDER_NOT_CONFIGURED" });
    expect((await outbox.getJobById(job.id))?.sentAt).toBeUndefined();
    await expect(outbox.markSent(job.id, { accepted: false, state: "FAILED" })).rejects.toThrow();
  });
  it("dead-letters final rejected attempts and accepted FAILED responses", async () => {
    const { job, outbox, worker } = await setup(true, "FAILED", 1);
    expect(await worker.processJob(job)).toBe(false);
    expect(await outbox.getJobById(job.id)).toMatchObject({ status: "DEAD_LETTER", attempts: 1 });
  });
  it("distinguishes provider acceptance from confirmed delivery", async () => {
    for (const state of ["SENT", "DELIVERED"] as const) {
      const { job, outbox, worker } = await setup(true, state);
      expect(await worker.processJob(job)).toBe(true);
      expect((await outbox.getJobById(job.id))?.status).toBe(state);
    }
  });
  it("does not fabricate a phone call without a configured transport", async () => {
    const { job } = await setup(true, "SENT");
    const voice = new VoiceNotificationProvider(undefined, "");
    expect(await voice.send({ ...job, channel: "voice" })).toMatchObject({ accepted: false, state: "FAILED", error: "PROVIDER_NOT_CONFIGURED" });
    expect(await voice.healthCheck()).toMatchObject({ status: "UNAVAILABLE" });
  });
  it("uses an injected transport receipt and does not invent its health", async () => {
    const { job } = await setup(true, "SENT");
    const placeCall = vi.fn().mockResolvedValue({ id: "provider-call-1" });
    const voice = new VoiceNotificationProvider({ name: "test", placeCall }, "https://fixture.invalid", "fixture-secret");
    expect(await voice.send({ ...job, channel: "voice" })).toMatchObject({ accepted: true, state: "SENT", providerMessageId: "provider-call-1" });
    expect(placeCall).toHaveBeenCalledOnce();
    expect(await voice.healthCheck()).toMatchObject({ status: "DEGRADED", error: "PROVIDER_HEALTH_UNVERIFIED" });
  });
});
