import { describe, it, expect } from "vitest";
import { TransactionalOutboxService } from "../../src/outbox/services/transactional-outbox.service.js";

describe("Transactional Outbox & Idempotent Inbox Engine", () => {
  it("enqueues outbox events and guarantees idempotency by key", async () => {
    const outbox = new TransactionalOutboxService();

    const ev1 = await outbox.writeOutboxEvent(undefined, {
      tenantId: "bank-alpha",
      aggregateType: "ALERT",
      aggregateId: "alert-99",
      eventType: "ALERT_CREATED",
      correlationId: "corr-1",
      idempotencyKey: "idemp-alert-99-v1",
      payload: { camera: "cam-1", severity: "P1" },
    });

    expect(ev1.eventId).toBeDefined();
    expect(ev1.published).toBe(false);

    // Duplicate write with same key must return existing record
    const ev2 = await outbox.writeOutboxEvent(undefined, {
      tenantId: "bank-alpha",
      aggregateType: "ALERT",
      aggregateId: "alert-99",
      eventType: "ALERT_CREATED",
      correlationId: "corr-1",
      idempotencyKey: "idemp-alert-99-v1",
      payload: { camera: "cam-1", severity: "P1" },
    });

    expect(ev2.eventId).toBe(ev1.eventId);
  });

  it("claims unpublished events and updates published status", async () => {
    const outbox = new TransactionalOutboxService();

    const ev = await outbox.writeOutboxEvent(undefined, {
      tenantId: "bank-alpha",
      aggregateType: "INCIDENT",
      aggregateId: "inc-101",
      eventType: "INCIDENT_CREATED",
      correlationId: "corr-2",
      idempotencyKey: "idemp-inc-101",
      payload: { title: "Vault Breach" },
    });

    const claimed = await outbox.claimUnpublishedEvents(10);
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed[0].eventId).toBe(ev.eventId);

    // Mark published
    await outbox.markPublished(ev.eventId);
    const claimedAfter = await outbox.claimUnpublishedEvents(10);
    expect(claimedAfter.some((r) => r.eventId === ev.eventId)).toBe(false);
  });

  it("deduplicates consumer processing via inbox exactly-once ledger", async () => {
    const outbox = new TransactionalOutboxService();
    const eventId = "event-unique-xyz";
    const consumerId = "notification-dispatcher";

    // First delivery attempt: succeeds
    const firstAttempt = await outbox.recordInboxProcessed(eventId, consumerId);
    expect(firstAttempt).toBe(true);

    // Second delivery attempt (network retry): deduplicated!
    const secondAttempt = await outbox.recordInboxProcessed(eventId, consumerId);
    expect(secondAttempt).toBe(false);
  });
});
