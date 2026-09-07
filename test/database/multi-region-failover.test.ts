import { describe, it, expect, beforeEach, vi } from "vitest";
import { MultiRegionDatabasePoolRouter } from "../../src/database/multi-region-pool-router.js";
import { ChainOfCustodyService, canonicalJsonStringify } from "../../src/evidence/services/chain-of-custody.service.js";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

describe("Multi-Region Database Failover & Custody Resilience", () => {
  let primaryEvents: any[] = [];
  let standbyEvents: any[] = [];
  let primaryHealthy = true;

  function createMockPool(targetArray: any[], isPrimary: boolean) {
    const mockClient: Partial<PoolClient> = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (isPrimary && !primaryHealthy) {
          const err = new Error("ECONNREFUSED: Connection refused by primary host in us-east-1");
          (err as any).code = "ECONNREFUSED";
          throw err;
        }

        if (sql.startsWith("BEGIN") || sql.startsWith("COMMIT") || sql.startsWith("ROLLBACK")) {
          return { rows: [], rowCount: 0 } as any;
        }

        if (sql.includes("SELECT pg_advisory_xact_lock")) {
          return { rows: [{ locked: true }], rowCount: 1 } as any;
        }

        if (sql.includes("SELECT sequence, event_hash FROM chain_of_custody_events")) {
          const filtered = targetArray.filter((e) => !params || e.evidence_id === params[0]);
          filtered.sort((a, b) => b.sequence - a.sequence);
          return { rows: filtered.slice(0, 1), rowCount: filtered.length > 0 ? 1 : 0 } as any;
        }

        if (sql.includes("SELECT * FROM chain_of_custody_events")) {
          const filtered = targetArray.filter((e) => !params || e.evidence_id === params[0]);
          filtered.sort((a, b) => a.sequence - b.sequence);
          return { rows: filtered, rowCount: filtered.length } as any;
        }

        if (sql.includes("INSERT INTO chain_of_custody_events")) {
          const row = {
            id: params?.[0],
            evidence_id: params?.[1],
            sequence: params?.[2],
            action: params?.[3],
            performed_by: params?.[4],
            actor_type: params?.[5],
            reason: params?.[6],
            source_ip: params?.[7],
            workstation_id: params?.[8],
            event_hash: params?.[9],
            previous_hash: params?.[10],
            created_at: params?.[11],
          };
          targetArray.push(row);
          return { rows: [row], rowCount: 1 } as any;
        }

        return { rows: [], rowCount: 0 } as any;
      }),
      release: vi.fn(),
    };

    const poolMock: Partial<Pool> = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        if (isPrimary && !primaryHealthy) {
          const err = new Error("ECONNREFUSED: Connection refused by primary host in us-east-1");
          (err as any).code = "ECONNREFUSED";
          throw err;
        }
        return mockClient.query!(sql, params);
      }),
      connect: vi.fn(async () => {
        if (isPrimary && !primaryHealthy) {
          const err = new Error("ECONNREFUSED: Connection refused by primary host in us-east-1");
          (err as any).code = "ECONNREFUSED";
          throw err;
        }
        return mockClient as PoolClient;
      }),
      end: vi.fn(async () => {}),
    };

    return poolMock as Pool;
  }

  beforeEach(() => {
    primaryEvents = [];
    standbyEvents = [];
    primaryHealthy = true;
  });

  it("detects primary region failure and seamlessly reroutes custody writes to standby with zero sequence drift", async () => {
    const primaryPool = createMockPool(primaryEvents, true);
    const standbyPool = createMockPool(standbyEvents, false);

    const router = new MultiRegionDatabasePoolRouter({
      primaryPool,
      standbyPool,
      healthCheckIntervalMs: 0, // Manual triggers in test
    });

    const custodyService = new ChainOfCustodyService(router as unknown as Pool);
    const evidencePackageId = "pkg-dr-test-001";

    let failoverEventEmitted = false;
    router.on("failover", (data) => {
      failoverEventEmitted = true;
      expect(data.fromRole).toBe("PRIMARY");
      expect(data.toRole).toBe("STANDBY");
    });

    // 1. First batch of writes to Primary
    for (let i = 1; i <= 5; i++) {
      await custodyService.recordEvent({
        evidencePackageId,
        event: "PACKAGE_CREATED",
        actorId: "investigator-01",
        actorType: "USER",
        reason: `Pre-failover batch entry ${i}`,
      });
    }

    expect(primaryEvents.length).toBe(5);
    expect(standbyEvents.length).toBe(0);
    expect(router.getClusterStatus().activeRole).toBe("PRIMARY");

    // Replicate committed events to standby (simulating physical WAL streaming replication)
    standbyEvents.push(...primaryEvents);

    // 2. Induce regional outage in Primary (simulating AWS us-east-1 failure)
    primaryHealthy = false;
    router.simulatePrimaryOutage("US-East-1 regional network severance");

    expect(router.getClusterStatus().activeRole).toBe("STANDBY");
    expect(router.getClusterStatus().primaryStatus).toBe("OFFLINE");
    expect(failoverEventEmitted).toBe(true);

    // 3. Second batch of writes routed seamlessly to Standby Primary
    for (let i = 6; i <= 10; i++) {
      await custodyService.recordEvent({
        evidencePackageId,
        event: "EVIDENCE_EXPORTED",
        actorId: "investigator-02",
        actorType: "USER",
        reason: `Post-failover batch entry ${i}`,
      });
    }

    // Verify all 10 events exist in the standby cluster (5 replicated + 5 direct writes)
    expect(standbyEvents.length).toBe(10);

    // 4. Verify Monotonicity: sequences must be strictly 1, 2, 3... 10
    const sequenceNumbers = standbyEvents.map((e) => e.sequence);
    expect(sequenceNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // 5. Verify Unbroken Cryptographic Hash Chain across the failover boundary (event 5 -> event 6)
    for (let i = 0; i < standbyEvents.length; i++) {
      const current = standbyEvents[i];
      if (i === 0) {
        expect(current.previous_hash).toBeNull();
      } else {
        const prev = standbyEvents[i - 1];
        expect(current.previous_hash).toBe(prev.event_hash);
      }

      // Recompute payload SHA-256 hash using canonical serialization
      const canonicalPayload = canonicalJsonStringify({
        action: current.action,
        actorType: current.actor_type || "USER",
        evidenceId: current.evidence_id,
        performedBy: current.performed_by,
        previousHash: current.previous_hash || "0".repeat(64),
        reason: current.reason || null,
        sequence: current.sequence,
        sourceIp: current.source_ip || null,
        timestamp: new Date(current.created_at).toISOString(),
        workstationId: current.workstation_id || null,
      });

      const expectedHash = createHash("sha256")
        .update(canonicalPayload + (current.previous_hash || "0".repeat(64)))
        .digest("hex");
      expect(current.event_hash).toBe(expectedHash);
    }
  });

  it("handles automatic query retry when primary throws connection error mid-flight", async () => {
    const primaryPool = createMockPool(primaryEvents, true);
    const standbyPool = createMockPool(standbyEvents, false);

    const router = new MultiRegionDatabasePoolRouter({
      primaryPool,
      standbyPool,
    });

    // Make primary fail
    primaryHealthy = false;

    // Direct query should catch ECONNREFUSED, fail over, and execute against standby
    const res = await router.query("SELECT * FROM chain_of_custody_events WHERE evidence_id = $1", ["pkg-test"]);
    expect(res).toBeDefined();
    expect(router.getClusterStatus().activeRole).toBe("STANDBY");
    expect(router.getClusterStatus().failoverCount).toBe(1);
  });
});
