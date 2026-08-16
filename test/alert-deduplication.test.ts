import { describe, expect, it } from "vitest";
import {
  AlertDeduplicationService,
  type DedupIdentity,
  type RedisClientInterface,
} from "../src/alerts/services/alert-deduplication.service.js";

describe("Alert Deduplication State Store", () => {
  it("generates deterministic, tenant-isolated SHA-256 deduplication keys", () => {
    const service = new AlertDeduplicationService();

    const identity1: DedupIdentity = {
      tenantId: "tenant-bank-01",
      sourceType: "camera",
      sourceId: "cam-vault-01",
      detectorId: "detector-yolo-v8",
      alertType: "intrusion",
      objectTrackId: "track-8917",
    };

    const identity2: DedupIdentity = {
      tenantId: "tenant-bank-01",
      sourceType: "camera",
      sourceId: "cam-vault-01",
      detectorId: "detector-yolo-v8",
      alertType: "intrusion",
      objectTrackId: "track-8917",
    };

    const identityDifferentTenant: DedupIdentity = {
      ...identity1,
      tenantId: "tenant-bank-02",
    };

    const key1 = service.buildKey(identity1);
    const key2 = service.buildKey(identity2);
    const keyDifferent = service.buildKey(identityDifferentTenant);

    expect(key1).toBe(key2);
    expect(key1).not.toBe(keyDifferent);
    expect(key1).toMatch(/^dedup:v1:[a-f0-9]{64}$/);
  });

  it("atomically registers new alerts and detects duplicates in memory", async () => {
    const service = new AlertDeduplicationService();

    const identity: DedupIdentity = {
      tenantId: "tenant-hdfc-01",
      sourceType: "camera",
      sourceId: "cam-lobby-04",
      alertType: "person_detected",
      objectTrackId: "track-101",
    };

    // First detection -> New Alert
    const firstResult = await service.checkAndRegister(identity, "alert-first-001");
    expect(firstResult.duplicate).toBe(false);
    expect(firstResult.canonicalAlertId).toBe("alert-first-001");
    expect(firstResult.occurrenceCount).toBe(1);

    // Second detection within window -> Duplicate Alert with incremented count
    const secondResult = await service.checkAndRegister(identity, "alert-second-002");
    expect(secondResult.duplicate).toBe(true);
    expect(secondResult.canonicalAlertId).toBe("alert-first-001");
    expect(secondResult.occurrenceCount).toBe(2);

    // Third detection within window -> Duplicate Alert count = 3
    const thirdResult = await service.checkAndRegister(identity, "alert-third-003");
    expect(thirdResult.duplicate).toBe(true);
    expect(thirdResult.canonicalAlertId).toBe("alert-first-001");
    expect(thirdResult.occurrenceCount).toBe(3);
  });

  it("supports mock Redis cluster execution with atomic Lua script evaluation", async () => {
    const redisStorage = new Map<string, Record<string, string>>();

    const mockRedis: RedisClientInterface = {
      isOpen: true,
      async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
        const key = options.keys[0];
        const alertId = options.arguments[0];
        const timestamp = options.arguments[1];
        const isSliding = options.arguments[3] === "1";

        if (!redisStorage.has(key)) {
          redisStorage.set(key, {
            alertId,
            firstSeen: timestamp,
            lastSeen: timestamp,
            count: "1",
          });
          return [0, alertId, 1, timestamp, timestamp];
        } else {
          const entry = redisStorage.get(key)!;
          const count = Number(entry.count) + 1;
          entry.count = String(count);
          entry.lastSeen = timestamp;
          return [1, entry.alertId, count, entry.firstSeen, timestamp];
        }
      },
    };

    const service = new AlertDeduplicationService(mockRedis);

    const identity: DedupIdentity = {
      tenantId: "tenant-axis-01",
      sourceType: "camera",
      sourceId: "cam-atm-02",
      alertType: "loitering",
    };

    const res1 = await service.checkAndRegister(identity, "redis-alert-100");
    expect(res1.duplicate).toBe(false);
    expect(res1.canonicalAlertId).toBe("redis-alert-100");
    expect(res1.occurrenceCount).toBe(1);

    const res2 = await service.checkAndRegister(identity, "redis-alert-101");
    expect(res2.duplicate).toBe(true);
    expect(res2.canonicalAlertId).toBe("redis-alert-100");
    expect(res2.occurrenceCount).toBe(2);
  });

  it("fails open gracefully when Redis experiences a connection failure", async () => {
    const faultyRedis: RedisClientInterface = {
      isOpen: true,
      async eval() {
        throw new Error("ECONNREFUSED: Connection to Redis cluster timed out");
      },
    };

    const service = new AlertDeduplicationService(faultyRedis);

    const identity: DedupIdentity = {
      tenantId: "tenant-bank-01",
      sourceType: "camera",
      sourceId: "cam-fire-01",
      alertType: "fire_detected",
    };

    // Should FAIL-OPEN: treat as new alert rather than suppressing security alert
    const result = await service.checkAndRegister(identity, "alert-fire-999");
    expect(result.duplicate).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.reason).toContain("REDIS_ERROR");
    expect(result.canonicalAlertId).toBe("alert-fire-999");
  });

  it("tracks observability metrics accurately", async () => {
    const service = new AlertDeduplicationService();

    const identity: DedupIdentity = {
      tenantId: "tenant-metrics-01",
      sourceType: "camera",
      sourceId: "cam-01",
      alertType: "intrusion",
    };

    await service.checkAndRegister(identity, "m-alert-1");
    await service.checkAndRegister(identity, "m-alert-2");
    await service.checkAndRegister(identity, "m-alert-3");

    const metrics = service.getMetrics();
    expect(metrics.requestsTotal).toBe(3);
    expect(metrics.newTotal).toBe(1);
    expect(metrics.duplicateTotal).toBe(2);
    expect(metrics.errorsTotal).toBe(0);
  });
});
