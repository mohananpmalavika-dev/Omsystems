import { describe, expect, it, beforeEach } from "vitest";
import { CameraLeaseManager } from "../../src/ha/services/camera-lease-manager.service.js";

class MockRedis {
  private data: Map<string, string> = new Map();
  private ttls: Map<string, number> = new Map();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async ttl(key: string): Promise<number> {
    return this.ttls.get(key) ?? -2;
  }

  async eval(script: string, numKeys: number, ...args: any[]): Promise<any> {
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

describe("Distributed Camera Lease & Epoch Fencing (HA Failover)", () => {
  let redis: MockRedis;
  let leaseManager: CameraLeaseManager;

  beforeEach(() => {
    redis = new MockRedis();
    leaseManager = new CameraLeaseManager({
      redisClient: redis,
      leaseTimeoutSeconds: 30,
      renewalIntervalSeconds: 10,
      heartbeatIntervalSeconds: 5,
    });
  });

  it("acquires camera lease with initial epoch = 1", async () => {
    const res = await leaseManager.acquireCameraLease("cam-101", "gateway-node-a");
    expect(res.acquired).toBe(true);
    expect(res.lease?.ownerId).toBe("gateway-node-a");
    expect(res.lease?.epoch).toBe(1);
  });

  it("prevents split-brain by rejecting conflicting ownership acquisition", async () => {
    await leaseManager.acquireCameraLease("cam-101", "gateway-node-a");

    // Second gateway attempts to steal active lease
    const collision = await leaseManager.acquireCameraLease("cam-101", "gateway-node-b");
    expect(collision.acquired).toBe(false);
    expect(collision.existingOwner).toBe("gateway-node-a");
  });

  it("validates write operations with active fencing token", async () => {
    const acq = await leaseManager.acquireCameraLease("cam-101", "gateway-node-a");
    const check = await leaseManager.validateFencingToken("cam-101", "gateway-node-a", acq.lease!.epoch);
    expect(check.valid).toBe(true);
    expect(check.currentEpoch).toBe(1);
  });

  it("rejects stale writes when lease expires or is transferred to another node (P0.5 Acceptance Test)", async () => {
    // 1. Node A acquires camera with epoch 1
    const acqA = await leaseManager.acquireCameraLease("cam-101", "gateway-node-a");
    expect(acqA.lease?.epoch).toBe(1);

    // 2. Node A network freezes / partitions; Node B force-acquires lease due to failover
    const acqB = await leaseManager.forceAcquireCameraLease("cam-101", "gateway-node-b", "heartbeat_timeout");
    expect(acqB.acquired).toBe(true);
    expect(acqB.lease?.ownerId).toBe("gateway-node-b");
    expect(acqB.lease?.epoch).toBe(2);

    // 3. Node B writes media with epoch 2 -> VALID
    const writeB = await leaseManager.validateFencingToken("cam-101", "gateway-node-b", 2);
    expect(writeB.valid).toBe(true);

    // 4. Node A unfreezes and attempts to write with stale epoch 1 -> REJECTED
    const writeA = await leaseManager.validateFencingToken("cam-101", "gateway-node-a", 1);
    expect(writeA.valid).toBe(false);
    expect(writeA.reason).toBe("ownership_lost");
    expect(writeA.currentEpoch).toBe(2);
    expect(writeA.activeOwner).toBe("gateway-node-b");
  });

  it("rejects renewal when epoch is stale", async () => {
    await leaseManager.acquireCameraLease("cam-101", "gateway-node-a");
    await leaseManager.forceAcquireCameraLease("cam-101", "gateway-node-b", "manual_rebalance");

    const staleRenew = await leaseManager.renewCameraLease("cam-101", "gateway-node-a", 1);
    expect(staleRenew.renewed).toBe(false);
  });
});
