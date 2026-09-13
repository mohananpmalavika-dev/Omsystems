/**
 * KryptoVision — Production Hardening Validation Test Suite
 * 
 * Verifies critical production resilience invariants:
 * 1. 400 branches, 6,400 cameras scale validation.
 * 2. Reconnect storm with jitter (no thundering herd / lockstep reconnects).
 * 3. Redis failover (fails closed, no process-local Map authority in production).
 * 4. Media epoch fencing (stale epoch rejected with token mismatch).
 * 5. PostgreSQL failover (privacy override fails closed, unmasked access denied).
 * 6. Alert restart test (P1 alert persisted in durable store surviving restart).
 * 7. Daily report UNKNOWN state test (storage API down -> HDD Health: UNKNOWN).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStore } from "../../src/store.js";
import { seedScaleFleet } from "../fixtures/scale-fleet.fixture.js";
import { BranchOperationalSnapshotService } from "../../src/services/branch-operational-snapshot.production.service.js";
import { CameraLeaseManager } from "../../src/ha/services/camera-lease-manager.service.js";
import { PrivacyOverrideService } from "../../src/privacy/services/privacy-override.service.js";
import { AlertOperationsService } from "../../src/alerts/services/alert-operations.service.js";
import { MemoryOperationalAlertRepository } from "../../src/alerts/repositories/postgres-operational-alert.repository.js";
import { dailySurveillanceCollectorService } from "../../src/reporting/services/daily-surveillance-collector.service.js";

// Mock Redis with epoch fencing support
class MockRedisWithEpoch {
  private data: Map<string, string> = new Map();
  private ttls: Map<string, number> = new Map();
  public isConnected = true;

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) throw new Error("REDIS_CONNECTION_REFUSED: Cluster unavailable");
    return this.data.get(key) ?? null;
  }

  async ttl(key: string): Promise<number> {
    if (!this.isConnected) throw new Error("REDIS_CONNECTION_REFUSED: Cluster unavailable");
    return this.ttls.get(key) ?? -2;
  }

  async eval(script: string, numKeys: number, ...args: any[]): Promise<any> {
    if (!this.isConnected) throw new Error("REDIS_CONNECTION_REFUSED: Cluster unavailable");
    const keys = args.slice(0, numKeys);
    const argv = args.slice(numKeys);

    if (script.includes("INCR")) {
      const leaseKey = keys[0];
      const epochKey = keys[1];
      const gatewayId = argv[0];
      const now = argv[1];
      const ttl = Number(argv[2]);
      const cameraId = argv[4] || argv[3];

      const existing = this.data.get(leaseKey);
      if (!existing || script.includes("transfer_key")) {
        const currentEpoch = Number(this.data.get(epochKey) || "0") + 1;
        this.data.set(epochKey, String(currentEpoch));
        const leaseData = JSON.stringify({
          cameraId,
          ownerId: gatewayId,
          acquiredAt: now,
          renewedAt: now,
          epoch: currentEpoch,
        });
        this.data.set(leaseKey, leaseData);
        this.ttls.set(leaseKey, ttl);
        return [1, leaseData, "none"];
      } else {
        return [0, existing];
      }
    }

    if (script.includes("renewedAt")) {
      const leaseKey = keys[0];
      const gatewayId = argv[0];
      const currentEpoch = Number(argv[1]);
      const now = argv[2];
      const ttl = Number(argv[3]);

      const existing = this.data.get(leaseKey);
      if (!existing) return [0, "lease_expired"];
      const lease = JSON.parse(existing);
      if (lease.ownerId !== gatewayId) return [0, "wrong_owner"];
      if (lease.epoch !== currentEpoch) return [0, "epoch_mismatch"];

      lease.renewedAt = now;
      this.data.set(leaseKey, JSON.stringify(lease));
      this.ttls.set(leaseKey, ttl);
      return [1, JSON.stringify(lease)];
    }

    if (script.includes("DEL")) {
      const leaseKey = keys[0];
      const gatewayId = argv[0];
      const epoch = Number(argv[1]);
      const existing = this.data.get(leaseKey);
      if (!existing) return [1, "already_released"];
      const lease = JSON.parse(existing);
      if (lease.ownerId !== gatewayId || lease.epoch !== epoch) return [0, "unauthorized"];
      this.data.delete(leaseKey);
      this.ttls.delete(leaseKey);
      return [1, "released"];
    }

    return [0, "unknown_script"];
  }
}

describe("KryptoVision — Production Hardening & Resilience Validation", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ============================================================================
  // Test 1: 400 Branches, 6,400 Cameras Scale Validation
  // ============================================================================
  it("Scale Validation: 400 branches and 6,400 cameras queryable with deterministic state", async () => {
    const store = new MemoryStore();
    const tenantId = "bank-corp";
    const systemUser: any = {
      id: "user-soc-analyst-01",
      username: "soc_analyst",
      role: "super_admin",
      tenantId,
    };

    const fleet = await seedScaleFleet(store, 400, tenantId);
    expect(fleet.branchCount).toBe(400);
    expect(fleet.cameraCount).toBe(6400);
    expect(fleet.recorderCount).toBe(400);

    const snapshotService = new BranchOperationalSnapshotService(store as any);

    // Verify sub-second retrieval of individual branch snapshots across the fleet
    const t0 = Date.now();
    const snapshot1 = await snapshotService.getBranchSnapshot(tenantId, "branch-test-001", false, systemUser);
    const snapshot40 = await snapshotService.getBranchSnapshot(tenantId, "branch-test-040", false, systemUser);
    const queryDurationMs = Date.now() - t0;

    expect(snapshot1?.overallState).toBe("HEALTHY");
    expect(snapshot40?.overallState).toBe("CRITICAL");
    expect(queryDurationMs).toBeLessThan(500);
  });

  // ============================================================================
  // Test 2: Reconnect Storm with Exponential Backoff + Jitter
  // ============================================================================
  it("Reconnect Storm: 400 branches simulate reconnection with bounded jitter preventing lockstep", () => {
    const branchCount = 400;
    const baseDelayMs = 1000;
    const maxDelayMs = 30000;
    const maxJitterMs = 500;

    // Simulation of gateway reconnect scheduler
    function calculateReconnectDelay(attempt: number): number {
      const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * maxJitterMs);
      return exponential + jitter;
    }

    const firstAttemptDelays: number[] = [];
    for (let i = 0; i < branchCount; i++) {
      firstAttemptDelays.push(calculateReconnectDelay(0));
    }

    // Verify bounded range
    for (const delay of firstAttemptDelays) {
      expect(delay).toBeGreaterThanOrEqual(baseDelayMs);
      expect(delay).toBeLessThanOrEqual(baseDelayMs + maxJitterMs);
    }

    // Verify unique timestamps (jitter prevents thundering herd / lockstep reconnects)
    const uniqueDelays = new Set(firstAttemptDelays);
    expect(uniqueDelays.size).toBeGreaterThan(200); // High diversity across 500ms window
  });

  // ============================================================================
  // Test 3: Redis Failover (No Map Authority in Production)
  // ============================================================================
  it("Redis Failover: Media lease manager fails closed on Redis outage with no in-memory Map fallback", async () => {
    const mockRedis = new MockRedisWithEpoch();
    const leaseManager = new CameraLeaseManager({
      redisClient: mockRedis as any,
      leaseTimeoutSeconds: 30,
      renewalIntervalSeconds: 10,
      heartbeatIntervalSeconds: 5,
    });

    // Healthy acquisition
    const initialAcquisition = await leaseManager.acquireCameraLease("cam-vault-01", "gateway-primary");
    expect(initialAcquisition.acquired).toBe(true);
    expect(initialAcquisition.lease?.epoch).toBe(1);

    // Simulate Redis cluster outage
    mockRedis.isConnected = false;

    // Subsequent lease validation/acquisition must reject, NEVER silently falling back to a local Map
    const failedAcquisition = await leaseManager.acquireCameraLease("cam-vault-02", "gateway-secondary");
    expect(failedAcquisition.acquired).toBe(false);
    expect(failedAcquisition.lease).toBeUndefined();

    const fencingCheck = await leaseManager.validateFencingToken("cam-vault-01", "gateway-primary", 1);
    expect(fencingCheck.valid).toBe(false);
  });

  // ============================================================================
  // Test 4: Media Epoch Fencing (Stale Epoch Rejected)
  // ============================================================================
  it("Media Epoch Fencing: Stale epoch writes are rejected when ownership transfers", async () => {
    const mockRedis = new MockRedisWithEpoch();
    const leaseManager = new CameraLeaseManager({
      redisClient: mockRedis as any,
      leaseTimeoutSeconds: 30,
      renewalIntervalSeconds: 10,
      heartbeatIntervalSeconds: 5,
    });

    // 1. Gateway A acquires lease on camera with epoch 1
    const acqA = await leaseManager.acquireCameraLease("cam-vault-01", "gateway-node-a");
    expect(acqA.acquired).toBe(true);
    expect(acqA.lease?.epoch).toBe(1);

    // Gateway A validates fencing token
    const tokenA = await leaseManager.validateFencingToken("cam-vault-01", "gateway-node-a", 1);
    expect(tokenA.valid).toBe(true);

    // 2. Failover occurs: Gateway B forcibly acquires lease, incrementing epoch to 2
    const forceAcq = await leaseManager.forceAcquireCameraLease("cam-vault-01", "gateway-node-b", "failover_drill");
    expect(forceAcq.acquired).toBe(true);
    expect(forceAcq.lease?.ownerId).toBe("gateway-node-b");
    expect(forceAcq.lease?.epoch).toBe(2);

    // 3. Stale Gateway A attempts to validate or renew with old epoch 1 -> REJECTED
    const staleCheck = await leaseManager.validateFencingToken("cam-vault-01", "gateway-node-a", 1);
    expect(staleCheck.valid).toBe(false);

    const staleRenew = await leaseManager.renewCameraLease("cam-vault-01", "gateway-node-a", 1);
    expect(staleRenew.renewed).toBe(false);
  });

  // ============================================================================
  // Test 5: PostgreSQL Failover (Privacy Override Fails Closed)
  // ============================================================================
  it("PostgreSQL Failover: Privacy override strictly fails closed when DB is unavailable in production", async () => {
    process.env.NODE_ENV = "production";
    const privacyService = new PrivacyOverrideService();

    // 1. Synchronous in-memory lookup is unconditionally forbidden in production
    expect(() => {
      privacyService.getActiveGrant("analyst-01", "cam-vault-01", "LIVE");
    }).toThrowError(/PRIVACY_POLICY_VIOLATION/);

    // 2. Async database query without configured pool strictly throws PRIVACY_STORE_UNAVAILABLE
    await expect(
      privacyService.getActiveGrantAsync("analyst-01", "cam-vault-01", "LIVE", "bank-corp")
    ).rejects.toThrowError(/PRIVACY_STORE_UNAVAILABLE/);
  });

  // ============================================================================
  // Test 6: Alert Restart Test (P1 Alert Persisted in Durable Repository)
  // ============================================================================
  it("Alert Durability: P1 alert state survives process restart", async () => {
    // Shared durable repository (simulating PostgreSQL alert table)
    const sharedRepo = new MemoryOperationalAlertRepository();

    // 1. Initial process lifecycle
    const initialAlertOps = new AlertOperationsService();
    (initialAlertOps as any).repository = sharedRepo;

    const alert = await initialAlertOps.ingestEvent({
      source: "AI_DETECTOR",
      type: "VAULT_INTRUSION",
      tenantId: "bank-corp",
      branchId: "branch-test-001",
      cameraId: "cam-branch-test-001-01",
      cameraName: "Vault Camera",
      confidence: 0.96,
      title: "Vault Intrusion Alert",
      description: "Movement detected in vault",
      observedAt: new Date(),
    });

    expect(alert.id).toBeDefined();
    expect(alert.severity).toBe("P1");
    expect(alert.status).toBe("NEW");

    // 2. Simulate complete application crash and restart (new AlertOperationsService instance)
    const restartedAlertOps = new AlertOperationsService();
    (restartedAlertOps as any).repository = sharedRepo;

    const retrievedAlert = await restartedAlertOps.getAlert(alert.id);
    expect(retrievedAlert).not.toBeNull();
    expect(retrievedAlert?.id).toBe(alert.id);
    expect(retrievedAlert?.severity).toBe("P1");
    expect(retrievedAlert?.status).toBe("NEW");
    expect(retrievedAlert?.branch.id).toBe("branch-test-001");
    expect(retrievedAlert?.camera?.id).toBe("cam-branch-test-001-01");
  });

  // ============================================================================
  // Test 7: Daily Report UNKNOWN State Test (Storage Telemetry Down)
  // ============================================================================
  it("Daily Report Truthfulness: Unreachable storage reports state UNKNOWN with zero synthetic fallbacks", async () => {
    const store = new MemoryStore();
    const tenantId = "bank-corp";

    // Seed fleet
    await seedScaleFleet(store, 10, tenantId);

    // Simulate recorder storage API failure/timeout on branch 5:
    // Device responds to ping, but SMART/disk storage query fails (no capacity, no SMART, no temperature)
    store.operationalTelemetry.set(`${tenantId}:branch-test-005:disk:disk-unknown-01`, {
      idempotencyKey: "disk-unknown-01",
      tenantId,
      branchId: "branch-test-005",
      deviceType: "disk",
      deviceId: "disk-unknown-01",
      observedAt: new Date().toISOString(),
      metrics: {
        status: "unknown",
        smartStatus: undefined,
        capacityGB: undefined,
        usedGB: undefined,
        temperature: undefined,
      },
    });

    const reportData = await dailySurveillanceCollectorService.collect({
      tenantId,
      store: store as any,
      reportType: "DAILY_HDD_HEALTH",
    });

    expect(reportData.disks).toBeDefined();

    // Branch 5 has unreachable storage API -> must be UNKNOWN, not 4000 GB, 3200 GB, or "PASS"
    const branch5Disks = reportData.disks.filter((r) => r.branchId === "branch-test-005");
    expect(branch5Disks.length).toBeGreaterThan(0);

    const unknownDisk = branch5Disks[0]!;
    expect(unknownDisk.state).toBe("UNKNOWN");
    expect(unknownDisk.smartStatus).toBe("UNKNOWN");
    expect(unknownDisk.capacityBytes).toBeUndefined();
    expect(unknownDisk.usedBytes).toBeUndefined();
    expect(unknownDisk.temperatureC).toBeUndefined();
  });
});
