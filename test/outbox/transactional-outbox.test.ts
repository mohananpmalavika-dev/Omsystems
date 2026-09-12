import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { TransactionalOutboxService } from "../../src/outbox/services/transactional-outbox.service.js";

describe("P1-12, P1-13, P1-14 Transactional Outbox, Consumer Inbox & Idempotency", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("atomically creates outbox event with idempotencyKey", async () => {
    const outbox = new TransactionalOutboxService();
    const event = await outbox.writeOutboxEvent(undefined, {
      tenantId: "bank-west-01",
      aggregateType: "incident",
      aggregateId: "inc-1001",
      eventType: "incident.escalated",
      correlationId: "corr-1001",
      idempotencyKey: "idemp:inc-1001:escalated:p1",
      payload: { severity: "P1", step: 3 },
    });

    expect(event.id).toBeDefined();
    expect(event.eventId).toBeDefined();
    expect(event.idempotencyKey).toBe("idemp:inc-1001:escalated:p1");
    expect(event.published).toBe(false);
  });

  it("enforces idempotency: duplicate event submission returns existing record without duplicate generation", async () => {
    const outbox = new TransactionalOutboxService();
    const first = await outbox.writeOutboxEvent(undefined, {
      tenantId: "bank-west-01",
      aggregateType: "alert",
      aggregateId: "alt-2001",
      eventType: "alert.created",
      correlationId: "corr-2001",
      idempotencyKey: "idemp:alt-2001:created",
      payload: { camera: "cam-vault", rule: "intrusion" },
    });

    const second = await outbox.writeOutboxEvent(undefined, {
      tenantId: "bank-west-01",
      aggregateType: "alert",
      aggregateId: "alt-2001",
      eventType: "alert.created",
      correlationId: "corr-2001",
      idempotencyKey: "idemp:alt-2001:created",
      payload: { camera: "cam-vault", rule: "intrusion" },
    });

    expect(first.id).toBe(second.id);
    expect(first.eventId).toBe(second.eventId);
  });

  it("enforces consumer inbox deduplication (exactly-once processing)", async () => {
    const outbox = new TransactionalOutboxService();
    const eventId = "evt-vault-breach-99";
    const consumerId = "incident-escalation-worker";

    // First arrival: processed
    const firstProcess = await outbox.recordInboxProcessed(eventId, consumerId);
    expect(firstProcess).toBe(true);

    // Duplicate delivery: deduplicated (false)
    const duplicateProcess = await outbox.recordInboxProcessed(eventId, consumerId);
    expect(duplicateProcess).toBe(false);

    // Different consumer on same event: succeeds
    const otherConsumerProcess = await outbox.recordInboxProcessed(eventId, "notification-dispatch-worker");
    expect(otherConsumerProcess).toBe(true);
  });

  it("fails closed in production if durable PostgreSQL persistence is missing", async () => {
    process.env.NODE_ENV = "production";

    // Instantiation without pool must fail
    expect(() => new TransactionalOutboxService()).toThrow("OUTBOX_STORE_UNAVAILABLE");

    // Operations when DB query fails must fail closed
    const failingPool = {
      query: async () => {
        throw new Error("Connection reset by peer");
      },
    } as any;

    const outbox = new TransactionalOutboxService(failingPool);
    await expect(
      outbox.writeOutboxEvent(failingPool, {
        tenantId: "bank-west-01",
        aggregateType: "incident",
        aggregateId: "inc-failclosed",
        eventType: "incident.created",
        correlationId: "corr-failclosed",
        payload: {},
      })
    ).rejects.toThrow("OUTBOX_STORE_UNAVAILABLE");

    await expect(
      outbox.recordInboxProcessed("evt-prod-1", "worker-1")
    ).rejects.toThrow("INBOX_STORE_UNAVAILABLE");
  });
});
